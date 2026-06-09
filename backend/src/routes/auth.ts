/**
 * Authentication Routes for JUET//SYNC
 * GET /api/init - Fetch initial captcha from WebKiosk
 * POST /api/auth - Validate credentials against real WebKiosk and create encrypted session
 *
 * WebKiosk auth flow:
 *   1. GET /  → login page with captcha + JSESSIONID cookie
 *   2. POST /CommonFiles/UserAction.jsp → always returns 200 with JS redirect
 *      (does NOT return 302/401 on failure — both success and failure look identical)
 *   3. The JSESSIONID is bound to a user on success. On failure it's unbound.
 *   4. We VERIFY by hitting /StudentFiles/StudentPage.jsp — an unbound session
 *      returns "Session timeout!" while a valid session returns the student page.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AxiosError } from "axios";
import axios from "../utils/axios";
import crypto from "crypto";
import { encryptSessionData, SessionData } from "../utils/encryption";
import { parseCaptchaImage, extractJSessionId } from "../parsers/auth";
import { CacheService } from "../utils/cache";

// Types
export interface AuthPayload {
  enrollment: string;
  dob: string;
  password: string;
  captcha: string;
  role: "Student" | "Employee" | "Guest";
  sessionToken: string;
}

// Configuration from environment
const WEBKIOSK_BASE_URL =
  process.env.WEBKIOSK_BASE_URL || "https://webkiosk.juet.ac.in";
const WEBKIOSK_LOGIN_PAGE = process.env.WEBKIOSK_LOGIN_PAGE || "/";
const WEBKIOSK_AUTH_ACTION =
  process.env.WEBKIOSK_AUTH_ACTION || "/CommonFiles/UserAction.jsp";
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "60000", 10);
const CAPTCHA_SESSION_TTL_MS = 5 * 60 * 1000;

// Post-auth verification URLs (per role)
const VERIFY_URLS: Record<string, string> = {
  S: "/StudentFiles/StudentPage.jsp",
  E: "/EmployeeFiles/EmployeePage.jsp",
  G: "/StudentFiles/StudentPage.jsp", // Guest uses student page
};

interface CaptchaSession {
  cookieHeader: string;
}

function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function roleToWebKioskCode(role: AuthPayload["role"]): string {
  if (role === "Student") return "S";
  if (role === "Employee") return "E";
  return "G";
}

// ---------------------------------------------------------------------------
// GET /api/init — Fetch captcha
// ---------------------------------------------------------------------------

export async function initHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const logger = request.server.log;
  // We extract the CacheService from the registered route context or closure.
  // We'll pass cache into the handler factory or bind it.


  try {
    logger.info("Fetching WebKiosk login page for captcha...");

    const response = await axios.get(
      `${WEBKIOSK_BASE_URL}${WEBKIOSK_LOGIN_PAGE}`,
      { timeout: REQUEST_TIMEOUT, withCredentials: true }
    );

    // Extract cookies for session tracking
    const cookies = response.headers["set-cookie"] || [];
    const cookieHeader = cookies
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    logger.debug(`Session cookies received: ${cookies.length}`);

    // Parse HTML to extract captcha
    let captchaImageBase64: string;
    let captchaText: string | null;

    try {
      const parsed = await parseCaptchaImage(
        typeof response.data === 'string' ? response.data : '',
        WEBKIOSK_BASE_URL,
        cookieHeader,
        REQUEST_TIMEOUT
      );
      captchaImageBase64 = parsed.captchaImageBase64;
      captchaText = parsed.captchaValue;
    } catch (parseErr: any) {
      logger.error(`Captcha parse error: ${parseErr.message}`);
      return reply.status(400).send({
        error: "Unable to load captcha from server. Please try again.",
      });
    }

    // Store session for later auth request
    const sessionToken = createSessionToken();
    const cache = (request as any).globalCache as CacheService;
    await cache.set('captcha', sessionToken, { cookieHeader }, CAPTCHA_SESSION_TTL_MS / 1000);

    logger.info("Captcha fetched successfully");

    reply.status(200).send({
      captchaImage: captchaImageBase64,
      sessionToken,
      captchaValue: captchaText ?? null,
    });
  } catch (error) {
    const err = error as AxiosError | Error;
    request.server.log.error(`Failed to fetch captcha: ${err.message}`);
    reply.status(500).send({
      error: "Failed to connect to WebKiosk. Please try again later.",
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth — Validate credentials
// ---------------------------------------------------------------------------

export async function authHandler(
  request: FastifyRequest<{ Body: AuthPayload }>,
  reply: FastifyReply
): Promise<void> {
  const logger = request.server.log;
  const cache = (request as any).globalCache as CacheService;
  const { enrollment, dob, password, captcha, role, sessionToken } =
    request.body;

  try {
    // Basic format validation
    if (!/^\d{2}-\d{2}-\d{4}$/.test(dob)) {
      return reply.status(400).send({
        error: "Invalid date format. Use DD-MM-YYYY",
      });
    }

    const captchaSession = await cache.get<CaptchaSession>('captcha', sessionToken);
    if (!captchaSession) {
      return reply.status(400).send({
        error: "Captcha session expired. Please refresh captcha and try again.",
      });
    }

    logger.info(`Attempting authentication for enrollment: ${enrollment}`);

    // ---------- Step 1: POST credentials to WebKiosk ----------
    const roleCode = roleToWebKioskCode(role);
    const form = new URLSearchParams({
      InstCode: "JUET",
      UserType: roleCode,
      MemberCode: enrollment.toUpperCase(),
      DATE1: dob,
      Password: password,
      txtcap: captcha,
      BTNSubmit: "Submit",
    });

    const authResponse = await axios.post(
      new URL(WEBKIOSK_AUTH_ACTION, WEBKIOSK_BASE_URL).toString(),
      form.toString(),
      {
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          Cookie: captchaSession.cookieHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Consume the captcha token (one-time use)
    await cache.invalidate('captcha', sessionToken);

    // Get the JSESSIONID — prefer new Set-Cookie from auth response,
    // fall back to the one from the captcha session.
    const setCookieHeaders = authResponse.headers["set-cookie"] || [];
    const newCookieStr = (
      Array.isArray(setCookieHeaders)
        ? setCookieHeaders
        : [setCookieHeaders]
    )
      .map((c: string) => c.split(";")[0])
      .join("; ");

    const jsessionid =
      extractJSessionId(newCookieStr) ||
      extractJSessionId(captchaSession.cookieHeader);

    if (!jsessionid) {
      logger.error("No JSESSIONID found in any cookie after auth POST");
      return reply.status(500).send({
        error: "Could not establish session with WebKiosk. Try again.",
      });
    }

    logger.debug(`JSESSIONID: ${jsessionid.substring(0, 12)}...`);

    // ---------- Step 2: VERIFY the session is actually authenticated ----------
    // WebKiosk always returns 200 with a JS redirect regardless of success/failure.
    // The ONLY way to know if auth succeeded is to hit the student/employee page
    // and check if it returns real content or "Session timeout!".
    const verifyPath = VERIFY_URLS[roleCode] || VERIFY_URLS["S"];
    const verifyUrl = new URL(verifyPath, WEBKIOSK_BASE_URL).toString();

    logger.debug(`Verifying session at: ${verifyUrl}`);

    const verifyResponse = await axios.get(verifyUrl, {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        Cookie: `JSESSIONID=${jsessionid}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const verifyBody =
      typeof verifyResponse.data === "string" ? verifyResponse.data : "";
    const verifyLower = verifyBody.toLowerCase();

    // An unbound session returns a tiny page: "Session timeout! Please Login..."
    const isSessionInvalid =
      verifyLower.includes("session timeout") ||
      verifyLower.includes("please login") ||
      verifyLower.includes("please <a") ||
      verifyBody.length < 200; // Valid student pages are always > 1KB

    if (isSessionInvalid) {
      // ---------- AUTH FAILED ----------
      // Try to figure out WHY from the auth response body
      const authBody =
        typeof authResponse.data === "string"
          ? authResponse.data.toLowerCase()
          : "";

      let errorMessage = "Invalid credentials or captcha. Please try again.";
      if (authBody.includes("captcha") && authBody.includes("mismatch")) {
        errorMessage = "Captcha mismatch. Please refresh and try again.";
      } else if (authBody.includes("password should not be blank")) {
        errorMessage = "Password cannot be blank.";
      } else if (
        authBody.includes("not valid") ||
        authBody.includes("wrong password")
      ) {
        errorMessage = "Invalid enrollment number, DOB, or password.";
      } else if (authBody.includes("member code does not exist")) {
        errorMessage = "Enrollment number not found.";
      }

      logger.warn(
        `Authentication failed for ${enrollment}: session verification returned "${verifyBody.trim().substring(0, 80)}"`
      );
      return reply.status(401).send({ error: errorMessage });
    }

    // ---------- AUTH SUCCEEDED ----------
    logger.info(`Session verified for ${enrollment} (${verifyBody.length} bytes)`);

    const sessionData: SessionData = {
      jsessionid,
      enrollment: enrollment.toUpperCase(),
      password,
      dob,
      role,
    };
    const encryptedSession = encryptSessionData(sessionData);

    const isProduction = process.env.NODE_ENV === "production";
    reply.setCookie("auth", encryptedSession, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    logger.info(`Authentication successful for enrollment: ${enrollment}`);

    return reply.status(200).send({
      success: true,
      message: "Authentication successful",
    });
  } catch (error) {
    const err = error as AxiosError | Error;
    request.server.log.error(`Authentication error: ${err.message}`);
    reply.status(500).send({
      error: "Authentication failed. Please try again.",
    });
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerAuthRoutes(fastify: FastifyInstance, cache: CacheService): void {
  // Pass cache via a preHandler or request decorator for ease
  fastify.decorateRequest('globalCache', null);
  fastify.addHook('onRequest', async (req) => {
    (req as any).globalCache = cache;
  });

  fastify.get("/api/init", initHandler);
  fastify.post<{ Body: AuthPayload }>("/api/auth", {
    schema: {
      body: {
        type: 'object',
        required: ['enrollment', 'dob', 'password', 'captcha', 'role', 'sessionToken'],
        properties: {
          enrollment: { type: 'string', minLength: 1 },
          dob: { type: 'string', minLength: 10, maxLength: 10 },
          password: { type: 'string', minLength: 1 },
          captcha: { type: 'string', minLength: 1 },
          role: { type: 'string', enum: ['Student', 'Employee', 'Guest'] },
          sessionToken: { type: 'string', minLength: 1 }
        }
      }
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: authHandler,
  });
  fastify.log.info("Auth routes registered: GET /api/init, POST /api/auth");
}
