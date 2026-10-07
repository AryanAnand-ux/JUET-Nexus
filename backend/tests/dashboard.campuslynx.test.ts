/**
 * Route-level tests for the CampusLynx dashboard branch.
 *
 * Pins the wiring, not the mapping (that's `tests/portal/dashboard.test.ts`):
 * the CampusLynx identity is validated before the session guard, the SWR
 * envelope and cache headers are identical across providers, and a forged
 * enrollment is still rejected.
 */

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockPostEncrypted = jest.fn();
const mockGetEncrypted = jest.fn();
const mockDestroy = jest.fn();

jest.mock("../src/portal/client", () => ({
  createPortalClient: jest.fn(() => ({
    postEncrypted: mockPostEncrypted,
    getEncrypted: mockGetEncrypted,
    destroy: mockDestroy,
  })),
}));

jest.mock("../src/utils/axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  get: jest.fn(),
  post: jest.fn(),
}));

import { registerDashboardRoutes } from "../src/routes/dashboard";
import { CacheService } from "../src/utils/cache";
import { encryptSessionData, type SessionData } from "../src/utils/encryption";

const profileFixture = require("./fixtures/13-sgpa-loadData.json");
const semesterCodesFixture = require("./fixtures/12-semester-codes.json");
const summaryFixture = require("./fixtures/18-attendance-detail-1.json");
const marksFixture = require("./fixtures/19-marks-1.json");
const noticesFixture = require("./fixtures/22-notices.json");

const campusLynxSession: SessionData = {
  jsessionid: "",
  enrollment: "24BCS001",
  password: "",
  dob: "",
  role: "Student",
  campusLynx: {
    clientid: "JAYPEE",
    instituteid: "INID2603J000001",
    companyid: "",
    memberid: "JUET0000001",
    membertype: "S",
    username: "24BCS001",
    token: "jwt.payload.sig",
  },
};

/** Portal replies keyed by endpoint path, replaying the captured fixtures. */
function mockPortal() {
  mockPostEncrypted.mockImplementation(async (path: string) => {
    if (path.includes("loadData")) return profileFixture;
    if (path.includes("getsemestercode-exammarks")) return semesterCodesFixture;
    if (path.includes("getstudentattendancedetail")) return summaryFixture;
    if (path.includes("getstudent-exammarks")) return marksFixture;
    if (path.includes("checkIfstudentmasterexist")) {
      return { status: { responseStatus: "Failure", errors: ["No Result Found"] } };
    }
    throw new Error(`unexpected POST ${path}`);
  });
  mockGetEncrypted.mockImplementation(async (path: string) => {
    if (path.includes("marqeelist")) return noticesFixture;
    throw new Error(`unexpected GET ${path}`);
  });
}

async function buildApp() {
  process.env.DATA_PROVIDER = "campuslynx";
  const app: any = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await registerDashboardRoutes(app, new CacheService());
  await app.ready();
  return app;
}

const dashUrl = (enrollment = "24BCS001") => `/api/dashboard?enrollment=${enrollment}`;
const cookie = () => ({ auth: encryptSessionData(campusLynxSession) });

describe("GET /api/dashboard under campuslynx", () => {
  let app: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPortal();
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it("serves the full dashboard on a cache miss", async () => {
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: dashUrl(), cookies: cookie() });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.cached).toBe(false);
    expect(body.data.student).toMatchObject({ name: "DEMO STUDENT", enrollment: "24BCS001" });
    expect(body.data.attendance).toHaveLength(11);
    expect(body.data.detailedMarks).toHaveLength(6);
    expect(body.data.notices).toHaveLength(4);
    // No SGPA fixture exists (the live endpoint 500'd), so this degrades.
    expect(body.data.performance.semesters).toEqual([]);
    expect(res.headers["x-cache"]).toBe("miss");
  });

  it("serves a fresh hit with the same envelope on repeat requests", async () => {
    app = await buildApp();
    await app.inject({ method: "GET", url: dashUrl(), cookies: cookie() });

    const res = await app.inject({ method: "GET", url: dashUrl(), cookies: cookie() });

    expect(res.statusCode).toBe(200);
    expect(res.json().cached).toBe(true);
    expect(res.headers["x-cache-status"]).toBe("fresh");
    // One portal round-trip total: the second request never left the server.
    expect(mockPostEncrypted.mock.calls.filter(([p]: string[]) => p.includes("loadData"))).toHaveLength(1);
  });

  it("rejects a forged enrollment with 403", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: dashUrl("241B999"),
      cookies: cookie(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
    expect(mockPostEncrypted).not.toHaveBeenCalled();
  });

  it("returns 401 without reaching the portal when the cookie is garbage", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: dashUrl(),
      cookies: { auth: "not-a-session" },
    });

    expect(res.statusCode).toBe(401);
    expect(mockPostEncrypted).not.toHaveBeenCalled();
  });

  it("returns 401 for a cookie with no CampusLynx identity", async () => {
    app = await buildApp();
    const noCampusLynxSession: SessionData = { ...campusLynxSession, campusLynx: undefined };
    const res = await app.inject({
      method: "GET",
      url: dashUrl(),
      cookies: { auth: encryptSessionData(noCampusLynxSession) },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("NO_CAMPUSLYNX_SESSION");
  });

  it("invalidate drops the cache so the next fetch is a miss", async () => {
    app = await buildApp();
    await app.inject({ method: "GET", url: dashUrl(), cookies: cookie() });

    const inv = await app.inject({
      method: "GET",
      url: "/api/dashboard/invalidate?enrollment=24BCS001",
      cookies: cookie(),
    });
    expect(inv.statusCode).toBe(200);

    const res = await app.inject({ method: "GET", url: dashUrl(), cookies: cookie() });
    expect(res.headers["x-cache"]).toBe("miss");
  });

  it("maps a dead portal token to SESSION_EXPIRED, not a 500", async () => {
    const { PortalError } = require("../src/portal/types");
    mockPostEncrypted.mockRejectedValue(new PortalError("session expired", 401));
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: dashUrl(), cookies: cookie() });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, code: "SESSION_EXPIRED" });
  });
});
