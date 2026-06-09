import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { getValidSession } from "../src/routes/session";
import { encryptSessionData, SessionData } from "../src/utils/encryption";
import axios from "../src/utils/axios";

// Mock environment for testing
const TEST_ENCRYPTION_KEY = "0".repeat(64);
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

jest.mock("../src/utils/axios", () => {
  return {
    post: jest.fn(),
    get: jest.fn(),
  };
});

describe("getValidSession", () => {
  let fastify: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify({ logger: false });
    await fastify.register(fastifyCookie);
  });

  afterEach(async () => {
    await fastify.close();
  });

  const sampleSession: SessionData = {
    jsessionid: "VALID_JSESSIONID_123",
    enrollment: "24BCS100",
    password: "password123",
    dob: "01-01-2002",
    role: "Student",
  };

  it("should throw NO_SESSION when auth cookie is missing", async () => {
    let error: any;
    fastify.get("/test", async (request: any, reply: any) => {
      try {
        await getValidSession(request, reply);
        return { success: true };
      } catch (err) {
        error = err;
        reply.status(err.statusCode || 500).send(err);
      }
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
    });

    expect(response.statusCode).toBe(401);
    expect(error).toEqual({
      statusCode: 401,
      message: "Not authenticated",
      code: "NO_SESSION",
    });
  });

  it("should throw INVALID_SESSION when auth cookie decryption fails", async () => {
    let error: any;
    fastify.get("/test", async (request: any, reply: any) => {
      try {
        await getValidSession(request, reply);
        return { success: true };
      } catch (err) {
        error = err;
        reply.status(err.statusCode || 500).send(err);
      }
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: {
        auth: "invalid-encrypted-cookie-data",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(error).toEqual({
      statusCode: 401,
      message: "Unauthorized: Invalid session",
      code: "INVALID_SESSION",
    });
  });

  it("should return the current JSESSIONID if session is active/valid", async () => {
    // Mock verifyWebKioskSession to return success (a long HTML body)
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: "<html><body>Welcome student! " + "A".repeat(250) + "</body></html>",
    });

    const encrypted = encryptSessionData(sampleSession);

    let result: string | undefined;
    fastify.get("/test", async (request: any, reply: any) => {
      result = await getValidSession(request, reply);
      return { success: true };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: {
        auth: encrypted,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(result).toBe("VALID_JSESSIONID_123");
    // Should verify the session using the correct endpoint
    expect(axios.get).toHaveBeenCalledWith(
      "https://webkiosk.juet.ac.in/StudentFiles/PersonalFiles/ShowAlertMessageSTUD.jsp",
      expect.any(Object)
    );
  });

  it("should perform silent re-login when session has expired and credentials are saved", async () => {
    // 1. First GET to verify endpoint (session is expired) -> returns small page (timeout)
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: "Session timeout! Please Login again.",
    });

    // 2. Second GET to login page for captcha -> returns HTML with captcha in .noselect
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      headers: {
        "set-cookie": ["JSESSIONID=NEW_INITIAL_JSESSIONID; Path=/"],
      },
      data: `<html><body><div class="noselect">12345</div><img src="captcha.jsp"></body></html>`,
    });

    // 3. POST to UserLoginAction.jsp -> returns 200 with new session ID
    (axios.post as jest.Mock).mockResolvedValueOnce({
      status: 200,
      headers: {
        "set-cookie": ["JSESSIONID=NEW_VALID_JSESSIONID; Path=/"],
      },
      data: "Redirecting...",
    });

    // 4. Third GET to verify newly logged in session -> returns valid page
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: "<html><body>Welcome! " + "A".repeat(300) + "</body></html>",
    });

    const encrypted = encryptSessionData(sampleSession);

    let result: string | undefined;
    fastify.get("/test", async (request: any, reply: any) => {
      result = await getValidSession(request, reply);
      return { success: true };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: {
        auth: encrypted,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(result).toBe("NEW_VALID_JSESSIONID");

    // Cookie should be updated in response
    const authCookie = response.cookies.find((c: any) => c.name === "auth");
    expect(authCookie).toBeDefined();

    // Verify background requests were made
    expect(axios.get).toHaveBeenCalledTimes(3);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("should throw SESSION_EXPIRED when session is expired and NO credentials are saved (legacy)", async () => {
    // 1. Verify returns timeout
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: "Session timeout! Please Login again.",
    });

    // Legacy session only contains jsessionid
    const legacySession: SessionData = {
      jsessionid: "LEGACY_ID",
      enrollment: "",
      password: "",
      dob: "",
      role: "Student",
    };
    const encrypted = encryptSessionData(legacySession);

    let error: any;
    fastify.get("/test", async (request: any, reply: any) => {
      try {
        await getValidSession(request, reply);
        return { success: true };
      } catch (err) {
        error = err;
        reply.status(err.statusCode || 500).send(err);
      }
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: {
        auth: encrypted,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(error).toEqual({
      statusCode: 401,
      message: "Session expired. Please log in again.",
      code: "SESSION_EXPIRED",
    });
  });

  it("should clear cookie and throw SESSION_EXPIRED when silent re-login fails", async () => {
    // 1. First GET to verify (expired)
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: "Session timeout!",
    });

    // 2. Second GET to login page for captcha
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      headers: {
        "set-cookie": ["JSESSIONID=NEW_INITIAL_JSESSIONID; Path=/"],
      },
      data: `<html><body><div class="noselect">12345</div></body></html>`,
    });

    // 3. POST to auth endpoint (credentials invalid/captcha mismatch)
    (axios.post as jest.Mock).mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: "Invalid captcha",
    });

    // 4. Verify step fails (returns timeout or throws)
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: "Session timeout!",
    });

    const encrypted = encryptSessionData(sampleSession);

    let error: any;
    fastify.get("/test", async (request: any, reply: any) => {
      try {
        await getValidSession(request, reply);
        return { success: true };
      } catch (err) {
        error = err;
        reply.status(err.statusCode || 500).send(err);
      }
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
      cookies: {
        auth: encrypted,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(error).toEqual({
      statusCode: 401,
      message: "Session expired. Please log in again.",
      code: "SESSION_EXPIRED",
    });

    // Cookie should be cleared in response (maxAge <= 0 or empty value or expires in past)
    const authCookie = response.cookies.find((c: any) => c.name === "auth");
    expect(authCookie).toBeDefined();
    expect(authCookie.value).toBe("");
  });
});
