import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockPostEncrypted = jest.fn();

jest.mock("../src/portal/client", () => ({
  createPortalClient: jest.fn(() => ({
    postEncrypted: mockPostEncrypted,
  })),
}));

import { registerGradesRoutes } from "../src/routes/grades";
import { encryptSessionData, SessionData } from "../src/utils/encryption";
import { PortalError } from "../src/portal/types";
import { CacheService } from "../src/utils/cache";

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

async function buildApp(cache?: CacheService) {
  const app: any = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await registerGradesRoutes(app, cache);
  await app.ready();
  return app;
}

describe("GET /api/grades", () => {
  let app: any;
  let cache: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    cache = new CacheService();
    app = await buildApp(cache);
  });

  afterEach(async () => {
    await app.close();
    await cache.close();
  });

  it("returns 401 with no auth cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/grades",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("NO_SESSION");
  });

  it("returns 401 with no CampusLynx identity in cookie", async () => {
    const cookie = encryptSessionData(noCampusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/grades",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("NO_CAMPUSLYNX_SESSION");
  });

  it("returns 200 with valid grade card list when portal responds", async () => {
    // Call 1: getstudentinfo
    mockPostEncrypted.mockResolvedValueOnce({
      response: {
        studentinfo: [
          { stynumber: "3", studentid: "STU123", branch: "CSE" },
        ],
      },
    });
    // Call 2: getstudentgradecard
    mockPostEncrypted.mockResolvedValueOnce({
      response: {
        gradecarddata: [
          {
            semester: "Semester 3",
            sgpa: 8.5,
            cgpa: 8.3,
            subjects: [
              {
                subjectdesc: "Database Management Systems",
                subjectcode: "CS301",
                grade: "A",
                gradepoint: 9,
                credits: 4,
                status: "Pass",
              },
            ],
          },
        ],
      },
    });

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/grades",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].semester).toBe("Semester 3");
    expect(body.data[0].sgpa).toBe(8.5);
    expect(body.data[0].cgpa).toBe(8.3);
    expect(body.data[0].subjects[0]).toEqual({
      subjectdesc: "Database Management Systems",
      subjectcode: "CS301",
      grade: "A",
      gradepoint: 9,
      credits: 4,
      status: "Pass",
    });
  });

  it("serves from cache on subsequent calls", async () => {
    mockPostEncrypted
      .mockResolvedValueOnce({
        response: {
          studentinfo: [{ stynumber: "1", studentid: "STU1" }],
        },
      })
      .mockResolvedValueOnce({
        response: {
          gradecarddata: [
            {
              semester: "Semester 1",
              sgpa: 7.8,
              cgpa: 7.8,
              subjects: [],
            },
          ],
        },
      });

    const cookie = encryptSessionData(campusLynxSession);

    // First call (cache miss)
    const res1 = await app.inject({
      method: "GET",
      url: "/api/grades",
      cookies: { auth: cookie },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().cached).toBe(false);

    // Second call (cache hit)
    const res2 = await app.inject({
      method: "GET",
      url: "/api/grades",
      cookies: { auth: cookie },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().cached).toBe(true);
    expect(res2.json().data[0].semester).toBe("Semester 1");
    // Ensure mock was only called for the first request
    expect(mockPostEncrypted).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when portal call throws PortalError", async () => {
    mockPostEncrypted.mockRejectedValue(new PortalError("Internal portal failure", 500));

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/grades",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("PORTAL_ERROR");
  });

  it("returns 401 when portal call throws 401 PortalError", async () => {
    mockPostEncrypted.mockRejectedValue(new PortalError("Token expired", 401));

    const cookie = encryptSessionData(campusLynxSession);
    const res = await app.inject({
      method: "GET",
      url: "/api/grades",
      cookies: { auth: cookie },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("SESSION_EXPIRED");
  });
});
