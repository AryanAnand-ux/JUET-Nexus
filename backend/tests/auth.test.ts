import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { registerAuthRoutes } from "../src/routes/auth";
import { decryptSessionData } from "../src/utils/encryption";
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

describe("Auth Route Integration - Cookie Encryption", () => {
  let fastify: any;
  let mockCache: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify({ logger: false });
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
    };

    await fastify.register(fastifyCookie);
    registerAuthRoutes(fastify, mockCache);
  });

  afterEach(async () => {
    await fastify.close();
  });

  it("should encrypt full session data in auth cookie on successful login", async () => {
    const enrollment = "24BCS100";
    const dob = "01-01-2002";
    const password = "password123";
    const role = "Student";
    const captcha = "12345";
    const sessionToken = "session-token-abc";
    const jsessionid = "ABCD1234567890EF";

    // Mock cache returning captcha session
    mockCache.get.mockResolvedValue({
      cookieHeader: `JSESSIONID=${jsessionid}`,
    });

    // Mock axios post (UserAction.jsp login form submission)
    const mockPostResponse = {
      headers: {
        "set-cookie": [`JSESSIONID=${jsessionid}; Path=/`],
      },
      data: "Redirecting...",
    };
    (axios.post as jest.Mock).mockResolvedValue(mockPostResponse);

    // Mock axios get (StudentPage.jsp page verification - successful page content)
    const mockGetResponse = {
      data: "<html><body>Welcome , ARYAN ANAND [24BCS100] " + "A".repeat(200) + "</body></html>",
    };
    (axios.get as jest.Mock).mockResolvedValue(mockGetResponse);

    // Perform request
    const response = await fastify.inject({
      method: "POST",
      url: "/api/auth",
      payload: {
        enrollment,
        dob,
        password,
        role,
        captcha,
        sessionToken,
      },
    });

    expect(response.statusCode).toBe(200);

    // Extract auth cookie
    const cookies = response.cookies;
    const authCookie = cookies.find((c: any) => c.name === "auth");
    expect(authCookie).toBeDefined();

    // Decrypt cookie and assert on credentials structure
    const decrypted = decryptSessionData(authCookie.value);

    expect(decrypted.jsessionid).toBe(jsessionid);
    expect(decrypted.enrollment).toBe(enrollment.toUpperCase());
    expect(decrypted.password).toBe(password);
    expect(decrypted.dob).toBe(dob);
    expect(decrypted.role).toBe(role);
  });
});
