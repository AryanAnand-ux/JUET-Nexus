/**
 * Route-level guard for the CampusLynx attendance branch.
 *
 * Regression test for a real bug: the CampusLynx branch was originally placed
 * AFTER `getValidSession`, which is WebKiosk-specific and rejects a CampusLynx
 * cookie (no `jsessionid`). The branch was therefore unreachable -- every
 * request died at the session gate, so the 401 the developer saw was the
 * WebKiosk gate, not the portal. These tests pin the ordering.
 */

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockPostEncrypted = jest.fn();
const mockDestroy = jest.fn();

jest.mock("../src/utils/axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("../src/portal/client", () => ({
  createPortalClient: jest.fn(() => ({
    postEncrypted: mockPostEncrypted,
    getEncrypted: jest.fn(),
    destroy: mockDestroy,
  })),
}));

import { registerAttendanceRoutes } from "../src/routes/attendance";
import { encryptSessionData, SessionData } from "../src/utils/encryption";

const REF =
  "campuslynx://attendance/detail?subjectid=S1&code=PH303&reg=R1&regcode=RC1&sty=3&inst=INST1&l=LC1";

const campusLynxSession: SessionData = {
  jsessionid: "",
  enrollment: "241B610",
  password: "",
  dob: "01-01-2005",
  role: "Student",
  campusLynx: {
    clientid: "JAYPEE",
    instituteid: "INST1",
    companyid: "CO1",
    memberid: "JUET2400386",
    enrollmentno: "241B610",
    membertype: "S",
    token: "jwt.test.sig",
    username: "241B610",
    otppwd: "PWD",
  },
};

async function buildApp() {
  const app: any = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await registerAttendanceRoutes(app);
  await app.ready();
  return app;
}

function url(link: string) {
  return `/api/attendance/details?link=${encodeURIComponent(link)}&subject=PH303`;
}

describe("attendance details route - provider dispatch", () => {
  let app: any;
  const savedProvider = process.env.DATA_PROVIDER;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    if (savedProvider === undefined) delete process.env.DATA_PROVIDER;
    else process.env.DATA_PROVIDER = savedProvider;
  });

  it("routes a campuslynx ref to the portal when DATA_PROVIDER=campuslynx", async () => {
    process.env.DATA_PROVIDER = "campuslynx";
    mockPostEncrypted.mockResolvedValue({
      status: { responseStatus: "Success" },
      response: {
        studentAttdsummarylist: [
          { datetime: "01-09-2026", present: "Present", classtype: "Lecture" },
          { datetime: "02-09-2026", present: "Absent", classtype: "Lecture" },
        ],
      },
    });

    const res = await app.inject({
      method: "GET",
      url: url(REF),
      cookies: { auth: encryptSessionData(campusLynxSession) },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.classesHeld).toBe(2);
    expect(body.data.classesAttended).toBe(1);
    expect(body.data.percentage).toBe(50);
    // The branch must reach the portal -- NOT stop at the WebKiosk session gate.
    expect(mockPostEncrypted).toHaveBeenCalledTimes(1);
    expect(mockPostEncrypted.mock.calls[0][0]).toContain("getstudentsubjectpersentage");
    expect(mockPostEncrypted.mock.calls[0][1]).toMatchObject({
      instituteid: "INST1",
      subjectid: "S1",
      registrationid: "R1",
      registrationcode: "RC1",
      subjectcode: "PH303",
      cmpidkey: [{ subjectcomponentid: "LC1" }],
    });
  });

  it("ignores an instituteid supplied by the client in the ref", async () => {
    // The ref is a query parameter, so it is attacker-controlled: it must not be
    // able to redirect the portal query at another institute.
    process.env.DATA_PROVIDER = "campuslynx";
    mockPostEncrypted.mockResolvedValue({
      status: { responseStatus: "Success" },
      response: { studentAttdsummarylist: [] },
    });

    const tampered = REF.replace("inst=INST1", "inst=SOMEONE_ELSES_INSTITUTE");
    const res = await app.inject({
      method: "GET",
      url: url(tampered),
      cookies: { auth: encryptSessionData(campusLynxSession) },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPostEncrypted.mock.calls[0][1]).toMatchObject({ instituteid: "INST1" });
  });

  it("maps a portal 401 to SESSION_EXPIRED without leaking the error", async () => {
    process.env.DATA_PROVIDER = "campuslynx";
    const { PortalError } = require("../src/portal/types");
    mockPostEncrypted.mockRejectedValue(
      new PortalError("token rejected", 401, { status: { responseStatus: "Failure" } })
    );

    const res = await app.inject({
      method: "GET",
      url: url(REF),
      cookies: { auth: encryptSessionData(campusLynxSession) },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      success: false,
      error: "Session expired. Please log in again.",
      code: "SESSION_EXPIRED",
    });
  });

  it("releases the portal client even when the fetch fails", async () => {
    process.env.DATA_PROVIDER = "campuslynx";
    mockPostEncrypted.mockRejectedValue(new Error("boom"));

    await app.inject({
      method: "GET",
      url: url(REF),
      cookies: { auth: encryptSessionData(campusLynxSession) },
    });

    expect(mockDestroy).toHaveBeenCalled();
  });

  it("401s a campuslynx ref when the cookie carries no campuslynx identity", async () => {
    process.env.DATA_PROVIDER = "campuslynx";

    const res = await app.inject({
      method: "GET",
      url: url(REF),
      cookies: {
        auth: encryptSessionData({
          jsessionid: "J",
          enrollment: "241B610",
          password: "p",
          dob: "01-01-2005",
          role: "Student",
        }),
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("NO_CAMPUSLYNX_SESSION");
    expect(mockPostEncrypted).not.toHaveBeenCalled();
  });

  it("enters the campuslynx branch when DATA_PROVIDER is unset (the default)", async () => {
    delete process.env.DATA_PROVIDER;
    mockPostEncrypted.mockResolvedValue({
      status: { responseStatus: "Success" },
      response: { studentAttdsummarylist: [] },
    });

    const res = await app.inject({
      method: "GET",
      url: url(REF),
      cookies: { auth: encryptSessionData(campusLynxSession) },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPostEncrypted).toHaveBeenCalled();
  });

  it("still rejects missing params before touching either provider", async () => {
    process.env.DATA_PROVIDER = "campuslynx";

    const res = await app.inject({ method: "GET", url: "/api/attendance/details" });

    // The route's own schema rejects this before the handler runs, so the
    // code is Fastify's, not ours.
    expect(res.statusCode).toBe(400);
    expect(mockPostEncrypted).not.toHaveBeenCalled();
  });
});
