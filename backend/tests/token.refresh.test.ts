/**
 * TDD tests for the lightweight token refresh path:
 *   POST /token/refreshTokenRequest  (plain JSON, no AES encryption)
 *
 * This is the fast Tier-1 refresh strategy from lazyportal:
 * instead of solving a captcha for silent re-login (3–15 s),
 * try /token/refreshTokenRequest first (<100 ms, no captcha).
 *
 * All tests are hermetic — no network, no Redis.
 */

process.env.ENCRYPTION_KEY = "0".repeat(64);

// Mock axios BEFORE importing any src files
const mockAxiosPost = jest.fn();
const mockAxiosGet = jest.fn();

jest.mock("../src/utils/axios", () => ({
  __esModule: true,
  default: { get: mockAxiosGet, post: mockAxiosPost },
  get: mockAxiosGet,
  post: mockAxiosPost,
}));

// We need a real axios instance to test PortalClient.refreshToken
// so we mock at the module level
jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  return {
    ...actual,
    create: jest.fn(() => ({
      post: mockAxiosPost,
      get: mockAxiosGet,
      defaults: { httpAgent: { destroy: jest.fn() }, httpsAgent: { destroy: jest.fn() } },
    })),
  };
});

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { encryptSessionData, decryptSessionData, SessionData } from "../src/utils/encryption";
import { getOrRenewCampusLynxIdentity } from "../src/routes/session";

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function makeJwt(expOffsetSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSec;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.sig`;
}

const BASE_SESSION: SessionData = {
  jsessionid: "",
  enrollment: "241B610",
  password: "secret",
  dob: "01-01-2005",
  role: "Student",
  campusLynx: {
    clientid: "JAYPEE",
    instituteid: "INST1",
    companyid: "CO1",
    memberid: "M1",
    enrollmentno: "241B610",
    membertype: "S",
    token: "placeholder",
    username: "241B610",
    otppwd: "PWD",
  },
};

async function buildApp() {
  const app = Fastify({ logger: false }) as any;
  await app.register(fastifyCookie);
  app.get("/renew", async (request: any, reply: any) => {
    const identity = await getOrRenewCampusLynxIdentity(request, reply);
    return { ok: true, token: identity.token };
  });
  await app.ready();
  return app;
}

// -------------------------------------------------------------------------
// 1. Token not near expiry — no refresh attempted, cookie slid forward
// -------------------------------------------------------------------------

describe("getOrRenewCampusLynxIdentity — token valid (not near expiry)", () => {
  let app: any;
  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });
  afterEach(() => app.close());

  it("returns the identity without calling /token/refreshTokenRequest", async () => {
    const session = { ...BASE_SESSION, campusLynx: { ...BASE_SESSION.campusLynx!, token: makeJwt(3600) } };
    const cookie = encryptSessionData(session);
    const res = await app.inject({ method: "GET", url: "/renew", cookies: { auth: cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    // Refresh endpoint must NOT have been called
    expect(mockAxiosPost).not.toHaveBeenCalledWith(
      expect.stringContaining("refreshTokenRequest"),
      expect.anything(),
      expect.anything()
    );
  });

  it("slides the auth cookie forward", async () => {
    const session = { ...BASE_SESSION, campusLynx: { ...BASE_SESSION.campusLynx!, token: makeJwt(3600) } };
    const cookie = encryptSessionData(session);
    const res = await app.inject({ method: "GET", url: "/renew", cookies: { auth: cookie } });

    expect(res.statusCode).toBe(200);
    const setCookie = String(res.headers["set-cookie"] ?? "");
    expect(setCookie).toContain("auth=");
  });
});

// -------------------------------------------------------------------------
// 2. Token near expiry — Tier 1 refresh called with PLAIN JSON (no AES)
// -------------------------------------------------------------------------

describe("getOrRenewCampusLynxIdentity — token near expiry, refresh succeeds", () => {
  let app: any;
  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });
  afterEach(() => app.close());

  it("calls /token/refreshTokenRequest with plain JSON body (no AES cipher)", async () => {
    const oldToken = makeJwt(60); // expires in 60s — within the 300s skew window
    const newToken = makeJwt(3600);

    // Mock the axios instance's post to respond to refreshTokenRequest
    mockAxiosPost.mockResolvedValueOnce({
      data: JSON.stringify({
        status: { responseStatus: "Success" },
        response: { msg: "Success", token: newToken },
      }),
    });

    const session = { ...BASE_SESSION, campusLynx: { ...BASE_SESSION.campusLynx!, token: oldToken } };
    const cookie = encryptSessionData(session);
    const res = await app.inject({ method: "GET", url: "/renew", cookies: { auth: cookie } });

    expect(res.statusCode).toBe(200);

    // Verify the call was made
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [path, body, config] = mockAxiosPost.mock.calls[0];

    // Path must be the refresh endpoint
    expect(path).toContain("refreshTokenRequest");

    // Body must be plain JSON (parseable), NOT base64-AES ciphertext
    let parsed: any;
    expect(() => { parsed = JSON.parse(body); }).not.toThrow();
    expect(parsed.username).toBe("241B610");
    // tokendate field must be present (as per lazyportal's refreshSession payload)
    expect(parsed.tokendate ?? parsed.Token ?? parsed.token ?? "").toBeTruthy();
  });

  it("updates the cookie with the new token when refresh succeeds", async () => {
    const oldToken = makeJwt(60);
    const newToken = makeJwt(3600);

    mockAxiosPost.mockResolvedValueOnce({
      data: JSON.stringify({
        status: { responseStatus: "Success" },
        response: { msg: "Success", token: newToken },
      }),
    });

    const session = { ...BASE_SESSION, campusLynx: { ...BASE_SESSION.campusLynx!, token: oldToken } };
    const cookie = encryptSessionData(session);
    const res = await app.inject({ method: "GET", url: "/renew", cookies: { auth: cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe(newToken);

    // The updated auth cookie must contain the new token
    const setCookieHeader = String(res.headers["set-cookie"] ?? "");
    expect(setCookieHeader).toContain("auth=");

    // Decrypt the new cookie and verify the token was rotated
    const newCookieValue = setCookieHeader.match(/auth=([^;]+)/)?.[1];
    expect(newCookieValue).toBeTruthy();
    const decrypted = decryptSessionData(decodeURIComponent(newCookieValue!));
    expect(decrypted.campusLynx?.token).toBe(newToken);
  });
});

// -------------------------------------------------------------------------
// 3. Token near expiry — Tier 1 refresh returns failure (msg !== "Success")
// -------------------------------------------------------------------------

describe("getOrRenewCampusLynxIdentity — token near expiry, refresh fails with server msg", () => {
  let app: any;
  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });
  afterEach(() => app.close());

  it("falls through gracefully: if token is still usable (not truly expired) returns identity", async () => {
    const almostExpiredToken = makeJwt(60); // near expiry but not yet expired

    // Portal says refresh failed
    mockAxiosPost.mockResolvedValueOnce({
      data: JSON.stringify({
        status: { responseStatus: "Failure" },
        response: { msg: "Session already expired" },
      }),
    });

    const session = { ...BASE_SESSION, campusLynx: { ...BASE_SESSION.campusLynx!, token: almostExpiredToken } };
    const cookie = encryptSessionData(session);
    const res = await app.inject({ method: "GET", url: "/renew", cookies: { auth: cookie } });

    // Token is still within exp — should not throw 401, just return original identity
    expect(res.statusCode).toBe(200);
    // Original token is returned (refresh failed, but token hasn't hard-expired)
    expect(res.json().token).toBe(almostExpiredToken);
  });

  it("throws SESSION_EXPIRED when token is truly expired and refresh also fails", async () => {
    const expiredToken = makeJwt(-10); // already expired 10s ago

    mockAxiosPost.mockResolvedValueOnce({
      data: JSON.stringify({
        status: { responseStatus: "Failure" },
        response: { msg: "Session already expired" },
      }),
    });

    const session = { ...BASE_SESSION, campusLynx: { ...BASE_SESSION.campusLynx!, token: expiredToken } };
    const cookie = encryptSessionData(session);

    const app2 = Fastify({ logger: false }) as any;
    await app2.register(fastifyCookie);
    app2.get("/renew", async (request: any, reply: any) => {
      try {
        const identity = await getOrRenewCampusLynxIdentity(request, reply);
        return { ok: true, token: identity.token };
      } catch (err: any) {
        reply.status(err.statusCode || 500).send(err);
      }
    });
    await app2.ready();

    const res = await app2.inject({ method: "GET", url: "/renew", cookies: { auth: encryptSessionData(session) } });
    await app2.close();

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("SESSION_EXPIRED");
  });
});

// -------------------------------------------------------------------------
// 4. Token near expiry — network error on refresh
// -------------------------------------------------------------------------

describe("getOrRenewCampusLynxIdentity — refresh endpoint network failure", () => {
  let app: any;
  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });
  afterEach(() => app.close());

  it("gracefully continues with the original token when network fails during refresh", async () => {
    const almostExpiredToken = makeJwt(60);
    mockAxiosPost.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const session = { ...BASE_SESSION, campusLynx: { ...BASE_SESSION.campusLynx!, token: almostExpiredToken } };
    const cookie = encryptSessionData(session);
    const res = await app.inject({ method: "GET", url: "/renew", cookies: { auth: cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe(almostExpiredToken);
  });
});
