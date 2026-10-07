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
  enrollment: "24BCS001",
  password: "",
  dob: "01-01-2005",
  role: "Student",
  campusLynx: {
    clientid: "JAYPEE",
    instituteid: "INST1",
    companyid: "CO1",
    memberid: "JUET0000001",
    enrollmentno: "24BCS001",
    membertype: "S",
    token: "jwt.test.sig",
    username: "24BCS001",
    otppwd: "PWD",
  },
};

const noCampusLynxSession: SessionData = {
  jsessionid: "SESS123",
  enrollment: "24BCS001",
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

  it("returns 401 with no CampusLynx identity in cookie", async () => {
    const cookie = encryptSessionData(noCampusLynxSession);
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

  it("selects specific exam event when eventId query param is provided", async () => {
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
              { exameventid: "EV2", exameventdesc: "T2 Exam" },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        response: {
          subjectinfo: [
            {
              subjectdesc: "Algorithms",
              datetime: "2026-11-20T09:30:00",
              datetimeupto: "2026-11-20T11:00:00",
              roomcode: "LT-2",
              seatno: "B-05",
            },
          ],
        },
      });

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/exam?eventId=EV2",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.event).toBe("T2 Exam");
    expect(body.data.availableEvents).toHaveLength(2);
    expect(body.data.items[0].subject).toBe("Algorithms");
  });

  it("normalizes Indian DD/MM/YYYY dates and captures time from time field", async () => {
    mockPostEncrypted
      .mockResolvedValueOnce({
        response: {
          semesterCodeinfo: {
            semestercode: [
              { registrationid: "REG1", registrationdesc: "2026 ODD SEMESTER" },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        response: {
          eventcode: {
            examevent: [
              { exameventid: "EV1", exameventdesc: "TEST-2" },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        response: {
          subjectinfo: [
            {
              subjectdesc: "NANO SCIENCE (PH303)",
              datetime: "13/10/2026",
              time: "09:30 am to 11:00 am",
              roomcode: "LT-6",
              seatno: "A5",
            },
            {
              subjectdesc: "CONCEPTS OF ECONOMICS (HS301)",
              datetime: "12/10/2026",
              time: "12:00 pm to 01:30 pm",
              roomcode: "LT-12",
              seatno: "D5",
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
    expect(body.data.items).toHaveLength(2);
    // Should be sorted chronologically: 12/10/2026 before 13/10/2026
    expect(body.data.items[0]).toEqual({
      subject: "CONCEPTS OF ECONOMICS",
      datetime: "2026-10-12",
      datetimeupto: "12:00 pm to 01:30 pm",
      roomcode: "LT-12",
      seatno: "D5",
    });
    expect(body.data.items[1]).toEqual({
      subject: "NANO SCIENCE",
      datetime: "2026-10-13",
      datetimeupto: "09:30 am to 11:00 am",
      roomcode: "LT-6",
      seatno: "A5",
    });
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
