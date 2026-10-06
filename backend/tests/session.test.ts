import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { getCampusLynxIdentity, getOrRenewCampusLynxIdentity, getValidSession } from "../src/routes/session";
import { encryptSessionData, SessionData } from "../src/utils/encryption";

const TEST_ENCRYPTION_KEY = "0".repeat(64);
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

describe("CampusLynx Session", () => {
  let fastify: any;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(fastifyCookie);
  });

  afterEach(async () => {
    await fastify.close();
  });

  const validSession: SessionData = {
    jsessionid: "",
    enrollment: "24BCS100",
    password: "",
    dob: "",
    role: "Student",
    campusLynx: {
      clientid: "JUET",
      instituteid: "INST1",
      companyid: "CO1",
      memberid: "MEM1",
      enrollmentno: "24BCS100",
      membertype: "S",
      token: "jwt.token.here",
      username: "24BCS100",
      otppwd: "PWD",
    },
  };

  it("should throw NO_SESSION when auth cookie is missing", async () => {
    fastify.get("/test", async (request: any, reply: any) => {
      try {
        getCampusLynxIdentity(request);
        return { success: true };
      } catch (err: any) {
        reply.status(err.statusCode || 500).send(err);
      }
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("NO_SESSION");
  });

  it("should throw INVALID_SESSION when auth cookie is corrupted", async () => {
    fastify.get("/test", async (request: any, reply: any) => {
      try {
        getCampusLynxIdentity(request);
        return { success: true };
      } catch (err: any) {
        reply.status(err.statusCode || 500).send(err);
      }
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: { auth: "corrupted_hex_cookie_string" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("INVALID_SESSION");
  });

  it("should throw NO_CAMPUSLYNX_SESSION when session lacks token", async () => {
    const sessionWithoutToken: SessionData = {
      jsessionid: "",
      enrollment: "24BCS100",
      password: "",
      dob: "",
      role: "Student",
    };

    fastify.get("/test", async (request: any, reply: any) => {
      try {
        getCampusLynxIdentity(request);
        return { success: true };
      } catch (err: any) {
        reply.status(err.statusCode || 500).send(err);
      }
    });

    const cookie = encryptSessionData(sessionWithoutToken);
    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: { auth: cookie },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("NO_CAMPUSLYNX_SESSION");
  });

  it("should return valid identity and enrollment when session is valid", async () => {
    fastify.get("/test", async (request: any) => {
      const identity = getCampusLynxIdentity(request);
      const enrollment = await getValidSession(request);
      return { success: true, identity, enrollment };
    });

    const cookie = encryptSessionData(validSession);
    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: { auth: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.identity.username).toBe("24BCS100");
    expect(body.identity.token).toBe("jwt.token.here");
    expect(body.enrollment).toBe("24BCS100");
  });

  it("should extend sliding cookie on active request with getOrRenewCampusLynxIdentity", async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const futureToken = "header." + Buffer.from(JSON.stringify({ exp: futureExp })).toString("base64url") + ".sig";
    const sessionWithFutureToken: SessionData = {
      ...validSession,
      campusLynx: {
        ...validSession.campusLynx!,
        token: futureToken,
      },
    };

    fastify.get("/test-renew", async (request: any, reply: any) => {
      const identity = await getOrRenewCampusLynxIdentity(request, reply);
      return { success: true, identity };
    });

    const cookie = encryptSessionData(sessionWithFutureToken);
    const response = await fastify.inject({
      method: "GET",
      url: "/test-renew",
      cookies: { auth: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    // Verify Set-Cookie header is sent to slide the 30-day window forward
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("auth=");
    expect(String(setCookie)).toContain("Expires=");
    expect(response.headers["x-session-token"]).toBeDefined();
  });

  it("should extract session from x-session-token header when cookie is absent", async () => {
    fastify.get("/test-header", async (request: any) => {
      const identity = getCampusLynxIdentity(request);
      return { success: true, identity };
    });

    const encryptedToken = encryptSessionData(validSession);
    const response = await fastify.inject({
      method: "GET",
      url: "/test-header",
      headers: { "x-session-token": encryptedToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().identity.username).toBe("24BCS100");
  });
});
