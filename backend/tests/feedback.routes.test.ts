/**
 * Tests for POST /api/feedback route.
 *
 * All tests are hermetic — nodemailer is mocked.
 */

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fs from "fs";
import path from "path";
import { registerFeedbackRoutes } from "../src/routes/feedback";
import nodemailer from "nodemailer";

const TEST_FEEDBACK_FILE = path.join(__dirname, "test-feedback.json");
process.env.FEEDBACK_FILE_PATH = TEST_FEEDBACK_FILE;

describe("POST /api/feedback", () => {
  let app: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    if (fs.existsSync(TEST_FEEDBACK_FILE)) {
      fs.unlinkSync(TEST_FEEDBACK_FILE);
    }
    app = Fastify({ logger: false });
    await app.register(fastifyCookie);
    await registerFeedbackRoutes(app);
    await app.ready();
  });

  afterEach(() => app.close());

  afterAll(() => {
    if (fs.existsSync(TEST_FEEDBACK_FILE)) {
      fs.unlinkSync(TEST_FEEDBACK_FILE);
    }
  });


  it("rejects feedback with missing or empty message", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/feedback",
      payload: {
        category: "bug",
        subject: "Something is broken",
        message: "",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    expect(res.json().error).toMatch(/message is required/i);
  });

  it("sends email to juetnexus@gmail.com when SMTP is configured", async () => {
    process.env.SMTP_PASS = "mock-secret-password";
    mockSendMail.mockResolvedValueOnce({ messageId: "msg-123" });

    const res = await app.inject({
      method: "POST",
      url: "/api/feedback",
      payload: {
        category: "bug",
        subject: "Exam page glitch",
        message: "The time shows up wrong on paper 2",
        enrollment: "24BCS001",
        email: "student@example.com",
        rating: 4,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.mailed).toBe(true);
    expect(body.fallbackMailto).toContain("juetnexus%40gmail.com");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMail.mock.calls[0][0];
    expect(callArgs.to).toBe("juetnexus@gmail.com");
    expect(callArgs.subject).toContain("Exam page glitch");
    expect(callArgs.text).toContain("The time shows up wrong on paper 2");
    expect(callArgs.html).toContain("24BCS001");
  });

  it("handles unconfigured SMTP gracefully with fallback mailto and success true", async () => {
    delete process.env.SMTP_PASS;
    delete process.env.GMAIL_APP_PASSWORD;

    const res = await app.inject({
      method: "POST",
      url: "/api/feedback",
      payload: {
        category: "feature",
        subject: "Dark mode tweak",
        message: "Can we have an AMOLED pitch black theme?",
        enrollment: "24BCS001",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.mailed).toBe(false);
    expect(body.fallbackMailto).toContain("mailto:juetnexus%40gmail.com");
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("persists feedback locally and exposes via GET /api/feedback", async () => {
    const resPost = await app.inject({
      method: "POST",
      url: "/api/feedback",
      payload: {
        category: "improvement",
        subject: "Faster loading",
        message: "Can attendance cache faster?",
        enrollment: "24BCS001",
        rating: 5,
      },
    });

    expect(resPost.statusCode).toBe(200);

    const resGet = await app.inject({
      method: "GET",
      url: "/api/feedback",
    });

    expect(resGet.statusCode).toBe(200);
    const getBody = resGet.json();
    expect(getBody.success).toBe(true);
    expect(getBody.count).toBeGreaterThanOrEqual(1);
    expect(getBody.feedback.some((item: any) => item.message === "Can attendance cache faster?")).toBe(true);
  });
});

