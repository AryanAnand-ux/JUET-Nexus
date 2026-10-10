/**
 * Route-level tests for the CampusLynx two-step login.
 *
 * The portal client is mocked wholesale, so these are hermetic. They pin the
 * public HTTP contract the frontend depends on:
 *   GET  /api/init              -> captcha + loginFlow
 *   POST /api/auth/verify-user  -> loginToken (step 1)
 *   POST /api/auth              -> auth cookie  (step 2)
 */

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockGetCaptcha = jest.fn();
const mockPreTokenCheck = jest.fn();
const mockGenerateWebToken = jest.fn();
const mockRefreshToken = jest.fn();
const mockDestroy = jest.fn();

jest.mock("../src/portal/client", () => ({
  createPortalClient: jest.fn(() => ({
    getCaptcha: mockGetCaptcha,
    preTokenCheck: mockPreTokenCheck,
    generateWebToken: mockGenerateWebToken,
    refreshToken: mockRefreshToken,
    destroy: mockDestroy,
  })),
}));

import { registerAuthRoutes } from "../src/routes/auth";
import { CacheService } from "../src/utils/cache";
import { decryptSessionData, encryptSessionData } from "../src/utils/encryption";
import { PortalError } from "../src/portal/types";

const CAPTCHA = { captcha: "", hidden: "HID==", image: "iVBORw0KGgoAAA" };
const REGDATA = {
  token: "jwt.payload.sig",
  clientid: "JAYPEE",
  enrollmentno: "24BCS001",
  membertype: "S",
  memberid: "JUET0000001",
  name: "TEST STUDENT",
  institutelist: [{ label: "JUET", value: "INID2603J000001" }],
};

async function buildApp(provider: string) {
  process.env.DATA_PROVIDER = provider;
  const app: any = Fastify({ logger: false });
  await app.register(fastifyCookie);
  registerAuthRoutes(app, new CacheService());
  await app.ready();
  return app;
}

/** Run step 1 and return the loginToken, so step-2 tests stay short. */
async function startLogin(app: any) {
  mockGetCaptcha.mockResolvedValue(CAPTCHA);
  const init = await app.inject({ method: "GET", url: "/api/init" });
  const sessionToken = init.json().sessionToken;
  mockPreTokenCheck.mockResolvedValue({ random: "PRE-1", otppwd: "PWD" });
  const step1 = await app.inject({
    method: "POST",
    url: "/api/auth/verify-user",
    payload: { enrollment: "24BCS001", captcha: "abc12", sessionToken },
  });
  return step1.json().loginToken;
}

describe("CampusLynx login routes", () => {
  let app: any;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe("GET /api/init", () => {
    it("returns a data-URI captcha and the campuslynx flow", async () => {
      app = await buildApp("campuslynx");
      mockGetCaptcha.mockResolvedValue(CAPTCHA);

      const res = await app.inject({ method: "GET", url: "/api/init" });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.loginFlow).toBe("campuslynx");
      expect(body.captchaValue).toBeNull();
      expect(body.captchaImage).toBe(`data:image/png;base64,${CAPTCHA.image}`);
      expect(body.sessionToken).toEqual(expect.any(String));
    });

    it("does not double-prefix an image that already has a data URI", async () => {
      app = await buildApp("campuslynx");
      mockGetCaptcha.mockResolvedValue({ ...CAPTCHA, image: "data:image/png;base64,AAAA" });

      const res = await app.inject({ method: "GET", url: "/api/init" });
      expect(res.json().captchaImage).toBe("data:image/png;base64,AAAA");
    });

    it("surfaces a portal failure as 502, not a crash", async () => {
      app = await buildApp("campuslynx");
      mockGetCaptcha.mockRejectedValue(new Error("boom"));

      const res = await app.inject({ method: "GET", url: "/api/init" });
      expect(res.statusCode).toBe(502);
    });
  });

  describe("POST /api/auth/verify-user (step 1)", () => {
    it("returns an opaque loginToken and the login mode", async () => {
      app = await buildApp("campuslynx");
      mockGetCaptcha.mockResolvedValue(CAPTCHA);
      const init = await app.inject({ method: "GET", url: "/api/init" });
      const { sessionToken } = init.json();
      mockPreTokenCheck.mockResolvedValue({ random: "PRE-1", otppwd: "PWD" });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/verify-user",
        payload: { enrollment: "999test0", captcha: "abc12", sessionToken },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.loginToken).toEqual(expect.any(String));
      expect(body.loginMode).toBe("PWD");

      // The whole captcha object must be echoed, with only the answer replaced.
      expect(mockPreTokenCheck).toHaveBeenCalledWith({
        username: "999TEST0",
        usertype: "S",
        captcha: { ...CAPTCHA, captcha: "abc12" },
      });
    });

    it("rejects an unknown captcha session", async () => {
      app = await buildApp("campuslynx");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/verify-user",
        payload: { enrollment: "24BCS001", captcha: "abc12", sessionToken: "nope" },
      });
      expect(res.statusCode).toBe(400);
      expect(mockPreTokenCheck).not.toHaveBeenCalled();
    });

    it("maps a captcha rejection to 401", async () => {
      app = await buildApp("campuslynx");
      mockGetCaptcha.mockResolvedValue(CAPTCHA);
      const init = await app.inject({ method: "GET", url: "/api/init" });
      mockPreTokenCheck.mockRejectedValue(new PortalError("bad captcha", 401));

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/verify-user",
        payload: { enrollment: "24BCS001", captcha: "wrong", sessionToken: init.json().sessionToken },
      });
      expect(res.statusCode).toBe(401);
    });

    it("consumes the captcha so it cannot be replayed", async () => {
      app = await buildApp("campuslynx");
      mockGetCaptcha.mockResolvedValue(CAPTCHA);
      const init = await app.inject({ method: "GET", url: "/api/init" });
      const sessionToken = init.json().sessionToken;
      mockPreTokenCheck.mockResolvedValue({ random: "PRE-1", otppwd: "PWD" });

      await app.inject({
        method: "POST",
        url: "/api/auth/verify-user",
        payload: { enrollment: "24BCS001", captcha: "abc12", sessionToken },
      });
      const replay = await app.inject({
        method: "POST",
        url: "/api/auth/verify-user",
        payload: { enrollment: "24BCS001", captcha: "abc12", sessionToken },
      });

      expect(replay.statusCode).toBe(400);
      expect(mockPreTokenCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/auth (step 2)", () => {
    it("persists the password (encrypted) and returns success", async () => {
      app = await buildApp("campuslynx");
      const loginToken = await startLogin(app);
      mockGenerateWebToken.mockResolvedValue({
        status: { responseStatus: "Success" },
        response: { regdata: REGDATA },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth",
        payload: { loginToken, password: "s3cret" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      const cookie = res.cookies.find((c: any) => c.name === "auth");
      expect(cookie).toBeDefined();
      const session = decryptSessionData(cookie.value);
      expect(session.campusLynx).toMatchObject({
        token: "jwt.payload.sig",
        instituteid: "INID2603J000001",
        memberid: "JUET0000001",
        username: "24BCS001",
      });
      // The password is persisted so the backend can silently re-login, but it
      // must only ever live inside the AES-256-GCM encrypted cookie -- never in
      // plaintext.
      expect(session.password).toBe("s3cret");
      expect(cookie.value).not.toContain("s3cret");

      expect(mockGenerateWebToken).toHaveBeenCalledWith({
        otppwd: "PWD",
        username: "24BCS001",
        passwordotpvalue: "s3cret",
        Modulename: "STUDENTMODULE",
        random: "PRE-1",
      });
    });

    it("rejects an unknown loginToken", async () => {
      app = await buildApp("campuslynx");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth",
        payload: { loginToken: "nope", password: "x" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("LOGIN_SESSION_EXPIRED");
    });

    it("maps a wrong password to 401", async () => {
      app = await buildApp("campuslynx");
      const loginToken = await startLogin(app);
      mockGenerateWebToken.mockRejectedValue(new PortalError("bad password", 401));

      const res = await app.inject({
        method: "POST",
        url: "/api/auth",
        payload: { loginToken, password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("keeps the loginToken after a wrong password so the user can retry", async () => {
      app = await buildApp("campuslynx");
      const loginToken = await startLogin(app);
      mockGenerateWebToken.mockRejectedValueOnce(new PortalError("bad password", 401));

      const first = await app.inject({
        method: "POST",
        url: "/api/auth",
        payload: { loginToken, password: "wrong" },
      });
      expect(first.statusCode).toBe(401);

      // A retry with the correct password must still work -- no new captcha.
      mockGenerateWebToken.mockResolvedValueOnce({
        status: { responseStatus: "Success" },
        response: { regdata: REGDATA },
      });
      const retry = await app.inject({
        method: "POST",
        url: "/api/auth",
        payload: { loginToken, password: "right" },
      });
      expect(retry.statusCode).toBe(200);
    });

    it("consumes the loginToken on success so it cannot be replayed", async () => {
      app = await buildApp("campuslynx");
      const loginToken = await startLogin(app);
      mockGenerateWebToken.mockResolvedValue({
        status: { responseStatus: "Success" },
        response: { regdata: REGDATA },
      });

      await app.inject({ method: "POST", url: "/api/auth", payload: { loginToken, password: "x" } });
      const replay = await app.inject({
        method: "POST",
        url: "/api/auth",
        payload: { loginToken, password: "x" },
      });

      expect(replay.statusCode).toBe(400);
      expect(mockGenerateWebToken).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("returns 401 when no auth cookie is present", async () => {
      app = await buildApp("campuslynx");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("NO_SESSION");
    });

    it("refreshes expiring token and sets fresh auth cookie", async () => {
      app = await buildApp("campuslynx");
      const pastExp = Math.floor(Date.now() / 1000) - 100;
      const expiredToken = "header." + Buffer.from(JSON.stringify({ exp: pastExp })).toString("base64url") + ".sig";

      const sessionWithExpiredToken = {
        jsessionid: "",
        enrollment: "24BCS001",
        password: "",
        dob: "",
        role: "Student",
        campusLynx: {
          clientid: "JAYPEE",
          instituteid: "INST1",
          companyid: "CO1",
          memberid: "JUET0000001",
          enrollmentno: "24BCS001",
          membertype: "S",
          token: expiredToken,
          username: "24BCS001",
          otppwd: "PWD",
        },
      };

      const { encryptSessionData } = require("../src/utils/encryption");
      const cookie = encryptSessionData(sessionWithExpiredToken);

      const refreshedToken = "new.refreshed.jwt";
      mockRefreshToken.mockResolvedValue({
        ok: true,
        token: refreshedToken,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        cookies: { auth: cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.enrollment).toBe("24BCS001");
      expect(mockRefreshToken).toHaveBeenCalledWith({
        username: "24BCS001",
        tokendate: undefined,
      });

      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      expect(String(setCookie)).toContain("auth=");
    });
  });

  describe("POST /api/auth/silent-login", () => {
    const SESSION_WITH_PW = {
      jsessionid: "",
      enrollment: "24BCS001",
      password: "s3cret",
      dob: "",
      role: "Student",
      campusLynx: {
        clientid: "JAYPEE",
        instituteid: "INID2603J000001",
        companyid: "CO1",
        memberid: "JUET0000001",
        enrollmentno: "24BCS001",
        membertype: "S",
        token: "old.token.sig",
        username: "24BCS001",
        otppwd: "PWD",
      },
    };

    /** Mint a fresh captcha sessionToken from GET /api/init. */
    async function issueCaptcha(app: any): Promise<string> {
      mockGetCaptcha.mockResolvedValue(CAPTCHA);
      const init = await app.inject({ method: "GET", url: "/api/init" });
      return init.json().sessionToken as string;
    }

    it("re-logs-in with the stored password and issues a fresh cookie", async () => {
      app = await buildApp("campuslynx");
      const cookie = encryptSessionData(SESSION_WITH_PW as any);
      const sessionToken = await issueCaptcha(app);
      mockPreTokenCheck.mockResolvedValue({ random: "PRE-2", otppwd: "PWD" });
      mockGenerateWebToken.mockResolvedValue({
        status: { responseStatus: "Success" },
        response: { regdata: REGDATA },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/silent-login",
        cookies: { auth: cookie },
        payload: { captcha: "abc12", sessionToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      const fresh = res.cookies.find((c: any) => c.name === "auth");
      expect(fresh).toBeDefined();
      const session = decryptSessionData(fresh.value);
      // The password survives, so the next silent re-login can happen too.
      expect(session.password).toBe("s3cret");
      expect(session.campusLynx?.token).toBe("jwt.payload.sig");

      expect(mockPreTokenCheck).toHaveBeenCalledWith({
        username: "24BCS001",
        usertype: "S",
        captcha: { ...CAPTCHA, captcha: "abc12" },
      });
      expect(mockGenerateWebToken).toHaveBeenCalledWith({
        otppwd: "PWD",
        username: "24BCS001",
        passwordotpvalue: "s3cret",
        Modulename: "STUDENTMODULE",
        random: "PRE-2",
      });
    });

    it("returns 401 without an auth cookie", async () => {
      app = await buildApp("campuslynx");
      const sessionToken = await issueCaptcha(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/silent-login",
        payload: { captcha: "abc12", sessionToken },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("NO_SESSION");
    });

    it("returns NO_STORED_CREDENTIALS for a legacy password-free cookie", async () => {
      app = await buildApp("campuslynx");
      const legacy = { ...SESSION_WITH_PW, password: "" };
      const cookie = encryptSessionData(legacy as any);
      const sessionToken = await issueCaptcha(app);

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/silent-login",
        cookies: { auth: cookie },
        payload: { captcha: "abc12", sessionToken },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("NO_STORED_CREDENTIALS");
      expect(mockGenerateWebToken).not.toHaveBeenCalled();
    });

    it("returns CAPTCHA_EXPIRED for an unknown session token", async () => {
      app = await buildApp("campuslynx");
      const cookie = encryptSessionData(SESSION_WITH_PW as any);
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/silent-login",
        cookies: { auth: cookie },
        payload: { captcha: "abc12", sessionToken: "nope" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("CAPTCHA_EXPIRED");
    });

    it("returns CAPTCHA_INVALID when the portal rejects the answer", async () => {
      app = await buildApp("campuslynx");
      const cookie = encryptSessionData(SESSION_WITH_PW as any);
      const sessionToken = await issueCaptcha(app);
      mockPreTokenCheck.mockRejectedValue(new PortalError("bad captcha", 401));

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/silent-login",
        cookies: { auth: cookie },
        payload: { captcha: "wrong", sessionToken },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("CAPTCHA_INVALID");
    });

    it("returns CREDENTIALS_INVALID when the stored password is refused", async () => {
      app = await buildApp("campuslynx");
      const cookie = encryptSessionData(SESSION_WITH_PW as any);
      const sessionToken = await issueCaptcha(app);
      mockPreTokenCheck.mockResolvedValue({ random: "PRE-2", otppwd: "PWD" });
      mockGenerateWebToken.mockRejectedValue(new PortalError("bad password", 401));

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/silent-login",
        cookies: { auth: cookie },
        payload: { captcha: "abc12", sessionToken },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("CREDENTIALS_INVALID");
    });

    it("returns OTP_REQUIRED when the portal switches to OTP login", async () => {
      app = await buildApp("campuslynx");
      const cookie = encryptSessionData(SESSION_WITH_PW as any);
      const sessionToken = await issueCaptcha(app);
      mockPreTokenCheck.mockResolvedValue({ random: "PRE-2", otppwd: "otp" });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/silent-login",
        cookies: { auth: cookie },
        payload: { captcha: "abc12", sessionToken },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("OTP_REQUIRED");
      expect(mockGenerateWebToken).not.toHaveBeenCalled();
    });
  });
});
