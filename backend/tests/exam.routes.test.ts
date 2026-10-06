import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockPostEncrypted = jest.fn();

jest.mock("../src/utils/axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("../src/portal/client", () => ({
  createPortalClient: jest.fn(() => ({
    postEncrypted: mockPostEncrypted,
  })),
}));

import { registerExamRoutes } from "../src/routes/exam";
import { encryptSessionData, SessionData } from "../src/utils/encryption";
import { PortalError } from "../src/portal/types";

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

const webkioskOnlySession: SessionData = {
  jsessionid: "WEBKIOSK123",
  enrollment: "241B610",
  password: "pass",
  dob: "01-01-2005",
  role: "Student",
};

async function buildApp() {
  const app: any = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await registerExamRoutes(app);
  await app.ready();
  return app;
}

describe("GET /api/exam", () => {
  let app: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 with no auth cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/exam",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("NO_SESSION");
  });

  it("returns 401 with webkiosk-only cookie (no campusLynx)", async () => {
    const cookie = encryptSessionData(webkioskOnlySession);
    const res = await app.inject({
      method: "GET",
      url: "/api/exam",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("NO_CAMPUSLYNX_SESSION");
  });

  it("returns 200 with valid schedule when portal responds", async () => {
    // 3 calls: semesters -> events -> schedule
    mockPostEncrypted
      .mockResolvedValueOnce({
        response: {
          semesterCodeinfo: {
            semestercode: [
              { registrationid: "REG1", registrationdesc: "Odd Semester 2026" },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        response: {
          eventcode: {
            examevent: [
              { exameventid: "EV1", exameventdesc: "T1 Exam" },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        response: {
          subjectinfo: [
            {
              subjectdesc: "Data Structures",
              datetime: "2026-10-15T09:30:00",
              datetimeupto: "2026-10-15T11:00:00",
              roomcode: "LT-1",
              seatno: "A-12",
            },
          ],
        },
      });

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/exam",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.semester).toBe("Odd Semester 2026");
    expect(body.data.event).toBe("T1 Exam");
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toEqual({
      subject: "Data Structures",
      datetime: "2026-10-15T09:30:00",
      datetimeupto: "2026-10-15T11:00:00",
      roomcode: "LT-1",
      seatno: "A-12",
    });
  });

  it("returns 200 with empty items when no semesters found", async () => {
    mockPostEncrypted.mockResolvedValueOnce({
      response: {
        semesterCodeinfo: {
          semestercode: [],
        },
      },
    });

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/exam",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
  });

  it("returns 502 when portal call throws PortalError", async () => {
    mockPostEncrypted.mockRejectedValueOnce(new PortalError("Network timeout", 500));

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/exam",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("PORTAL_ERROR");
  });

  it("returns 401 when portal call throws 401 PortalError", async () => {
    mockPostEncrypted.mockRejectedValueOnce(new PortalError("Session expired", 401));

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/exam",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("SESSION_EXPIRED");
  });
});
