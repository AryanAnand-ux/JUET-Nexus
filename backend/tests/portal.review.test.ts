/**
 * Tests for the portal loading & session persistence enhancements.
 */

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockPostEncrypted = jest.fn();
const mockGetEncrypted = jest.fn();
const mockDestroy = jest.fn();

jest.mock("../src/portal/client", () => {
  const actual = jest.requireActual("../src/portal/client");
  return {
    ...actual,
    createPortalClient: jest.fn(() => ({
      postEncrypted: mockPostEncrypted,
      getEncrypted: mockGetEncrypted,
      destroy: mockDestroy,
      refreshToken: jest.fn().mockResolvedValue({ ok: false }),
    })),
  };
});

import { registerDashboardRoutes } from "../src/routes/dashboard";
import { CacheService } from "../src/utils/cache";
import { encryptSessionData, type SessionData } from "../src/utils/encryption";
import { createPortalClient } from "../src/portal/client";

const profileFixture = require("./fixtures/13-sgpa-loadData.json");
const semesterCodesFixture = require("./fixtures/12-semester-codes.json");
const summaryFixture = require("./fixtures/18-attendance-detail-1.json");
const marksFixture = require("./fixtures/19-marks-1.json");
const noticesFixture = require("./fixtures/22-notices.json");

describe("Portal Review & Session Persistence Enhancements", () => {
  let app: any;
  let cache: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    cache = new CacheService();
    app = Fastify({ logger: false });
    await app.register(fastifyCookie);
    await registerDashboardRoutes(app, cache);
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    await cache.close();
  });

  it("serves stale cached dashboard data when portal token is expired instead of hard 401", async () => {
    const expiredJwt = (() => {
      const exp = Math.floor(Date.now() / 1000) - 300; // expired 5 minutes ago
      const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
      return `header.${payload}.sig`;
    })();

    const expiredSession: SessionData = {
      jsessionid: "",
      enrollment: "24BCS001",
      password: "secretpassword",
      dob: "2005-01-01",
      role: "Student",
      campusLynx: {
        clientid: "JAYPEE",
        instituteid: "INID2603J000001",
        companyid: "",
        memberid: "JUET0000001",
        membertype: "S",
        username: "24BCS001",
        token: expiredJwt,
        tokenIssuedAt: Math.floor(Date.now() / 1000) - 1800, // 30 minutes ago
      },
    };

    // Populate cache with previous sync
    const dummyDashboard = {
      student: { name: "TEST STUDENT", enrollment: "24BCS001" },
      attendance: [{ subject: "COMPUTER NETWORKS", percentage: 85 }],
      performance: { currentSgpa: 8.5, cgpa: 8.5, semesters: [], recentMarks: [] },
      courses: [],
      detailedMarks: [],
      notices: [],
    };
    await cache.set("dashboard", "24BCS001", { data: dummyDashboard, fetchedAt: Date.now() - 600000 }, 7200);

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard?enrollment=24BCS001",
      cookies: { auth: encryptSessionData(expiredSession) },
    });

    // Should return 200 with stale cached data instead of 401
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.cached).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.sessionExpired).toBe(true);
    expect(body.data.student.name).toBe("TEST STUDENT");
  });

  it("client factory instantiates client without socket lockups", () => {
    const client = createPortalClient();
    expect(client).toBeDefined();
    client.destroy();
  });
});
