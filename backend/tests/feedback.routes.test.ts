/**
 * Tests for POST & GET /api/feedback routes.
 *
 * All tests are hermetic — nodemailer and Supabase are mocked.
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
import { setSupabaseClient, resetSupabaseClient } from "../src/db/supabase";
import { resetRecentSubmissions } from "../src/utils/feedbackValidation";

const TEST_FEEDBACK_FILE = path.join(__dirname, "test-feedback.json");
process.env.FEEDBACK_FILE_PATH = TEST_FEEDBACK_FILE;

describe("Feedback System (Form -> API -> Database -> Email)", () => {
  let app: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    resetSupabaseClient();
    resetRecentSubmissions();

    if (fs.existsSync(TEST_FEEDBACK_FILE)) {
      fs.unlinkSync(TEST_FEEDBACK_FILE);
    }

    app = Fastify({ logger: false });
    await app.register(fastifyCookie);
    await registerFeedbackRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    resetSupabaseClient();
    await app.close();
  });

  afterAll(() => {
    if (fs.existsSync(TEST_FEEDBACK_FILE)) {
      fs.unlinkSync(TEST_FEEDBACK_FILE);
    }
  });

  describe("Validation & Spam Protection", () => {
    it("rejects feedback with empty message", async () => {
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

    it("rejects feedback with message shorter than 3 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          category: "bug",
          message: "hi",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toMatch(/at least 3 characters/i);
    });

    it("rejects invalid rating numbers", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          message: "Great interface!",
          rating: 7, // Invalid, must be 1-5
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toMatch(/between 1 and 5/i);
    });

    it("rejects invalid email formats", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          message: "Great app!",
          email: "invalid-email-string",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toMatch(/valid email/i);
    });

    it("detects and rejects honeypot spam bot submissions", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          message: "Buy cheap crypto now",
          honeypot: "bot-filled-field",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toMatch(/automated submission rejected/i);
    });

    it("suppresses rapid duplicate submissions from the same client", async () => {
      const firstRes = await app.inject({
        method: "POST",
        url: "/api/feedback",
        headers: { "x-forwarded-for": "10.0.0.1" },
        payload: {
          message: "Duplicate spam test message",
        },
      });
      expect(firstRes.statusCode).toBe(200);

      const secondRes = await app.inject({
        method: "POST",
        url: "/api/feedback",
        headers: { "x-forwarded-for": "10.0.0.1" },
        payload: {
          message: "Duplicate spam test message",
        },
      });
      expect(secondRes.statusCode).toBe(400);
      expect(secondRes.json().error).toMatch(/recently submitted this exact feedback/i);
    });
  });

  describe("Database Storage (Supabase PostgreSQL)", () => {
    it("inserts feedback into Supabase database with all required fields", async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: "550e8400-e29b-41d4-a716-446655440000",
              message: "Please add attendance goal calculator",
              rating: 5,
              name: "Demo Student",
              email: "24bcs001@juetguna.in",
              enrollment: "24BCS001",
              category: "feature",
              subject: "Feature Request from 24BCS001",
              metadata: { device: "1920x1080" },
              created_at: "2026-10-07T12:00:00Z",
            },
            error: null,
          }),
        }),
      });

      const mockSupabase: any = {
        from: jest.fn().mockReturnValue({
          insert: mockInsert,
        }),
      };

      setSupabaseClient(mockSupabase);

      const res = await app.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          category: "feature",
          message: "Please add attendance goal calculator",
          rating: 5,
          name: "Demo Student",
          enrollment: "24BCS001",
          metadata: { device: "1920x1080" },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe("550e8400-e29b-41d4-a716-446655440000");

      expect(mockSupabase.from).toHaveBeenCalledWith("feedback");
      expect(mockInsert).toHaveBeenCalledTimes(1);

      const insertArg = mockInsert.mock.calls[0][0];
      expect(insertArg.message).toBe("Please add attendance goal calculator");
      expect(insertArg.rating).toBe(5);
      expect(insertArg.name).toBe("Demo Student");
      expect(insertArg.email).toBe("24bcs001@juetguna.in");
      expect(insertArg.enrollment).toBe("24BCS001");
      expect(insertArg.category).toBe("feature");
      expect(insertArg.id).toBeDefined();
      expect(insertArg.created_at).toBeDefined();
    });

    it("gracefully falls back to local storage if Supabase database query fails", async () => {
      const mockSupabase: any = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: "Database connection timeout" },
              }),
            }),
          }),
        }),
      };

      setSupabaseClient(mockSupabase);

      const res = await app.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          category: "improvement",
          message: "Dark mode contrast improvement",
          enrollment: "24BCS002",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();

      // Verify backup file was written
      expect(fs.existsSync(TEST_FEEDBACK_FILE)).toBe(true);
      const fileContent = JSON.parse(fs.readFileSync(TEST_FEEDBACK_FILE, "utf-8"));
      expect(fileContent.length).toBeGreaterThanOrEqual(1);
      expect(fileContent[0].message).toBe("Dark mode contrast improvement");
    });
  });

  describe("Email Notification (nodemailer)", () => {
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
  });

  describe("GET /api/feedback", () => {
    it("returns feedback records from database or fallback storage", async () => {
      const mockSupabase: any = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: "fb-1",
                    message: "Test feedback from DB",
                    rating: 5,
                    category: "general",
                    created_at: "2026-10-07T12:00:00Z",
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };

      setSupabaseClient(mockSupabase);

      const res = await app.inject({
        method: "GET",
        url: "/api/feedback",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(1);
      expect(body.feedback[0].message).toBe("Test feedback from DB");
    });
  });
});
