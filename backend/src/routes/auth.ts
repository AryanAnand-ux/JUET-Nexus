/**
 * Authentication Routes for JUET//SYNC (CampusLynx Portal)
 *
 * Flow:
 *   1. GET  /api/init              -> captcha image + session handle
 *   2. POST /api/auth/verify-user  -> enrollment + captcha => loginToken
 *   3. POST /api/auth              -> loginToken + password => encrypted auth cookie
 *   4. POST /api/auth/refresh      -> slide / renew the portal token (keepalive)
 *   5. POST /api/auth/silent-login -> stored password + captcha => fresh cookie
 *   6. POST /api/logout            -> clear session cookie
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { encryptSessionData, decryptSessionData, SessionData } from "../utils/encryption";
import { CacheService } from "../utils/cache";
import { createPortalClient } from "../portal/client";
import { verifyUser, issueSession } from "../portal/auth";
import { PortalError, type PortalCaptcha } from "../portal/types";
import { getOrRenewCampusLynxIdentity, setAuthCookie } from "./session";
import { jwtExpiry } from "../portal/crypto";

const CAPTCHA_SESSION_TTL_MS = 5 * 60 * 1000;
const PORTAL_CAPTCHA_PREFIX = "portal_captcha";
const PORTAL_LOGIN_PREFIX = "portal_login";

interface PendingLogin {
  random: string;
  otppwd: string;
  username: string;
  usertype: "S" | "P";
}

function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function toDataUri(image: string): string {
  if (!image) return "";
  return image.startsWith("data:") ? image : `data:image/png;base64,${image}`;
}

/**
 * GET /api/init — Fetch CampusLynx captcha
 */
export async function campusLynxInitHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const cache = (request as any).globalCache as CacheService;
  const client = createPortalClient();

  try {
    const captcha = await client.getCaptcha();
    const sessionToken = createSessionToken();
    await cache.set(
      PORTAL_CAPTCHA_PREFIX,
      sessionToken,
      captcha,
      CAPTCHA_SESSION_TTL_MS / 1000
    );

    request.server.log.info("[Auth] CampusLynx captcha issued");
    return reply.status(200).send({
      captchaImage: toDataUri(captcha.image),
      sessionToken,
      captchaValue: null,
      loginFlow: "campuslynx",
    });
  } catch (error: any) {
    request.server.log.error(`[Auth] CampusLynx captcha failed: ${error?.message}`);
    return reply.status(502).send({
      error: "Failed to reach the CampusLynx portal. Please try again later.",
    });
  } finally {
    client.destroy();
  }
}

/**
 * POST /api/auth/verify-user — Step 1: submit enrollment + captcha
 */
export async function campusLynxVerifyUserHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const logger = request.server.log;
  const cache = (request as any).globalCache as CacheService;
  const body = request.body as {
    enrollment?: string;
    captcha?: string;
    sessionToken?: string;
    usertype?: "S" | "P";
  };

  const enrollment = (body.enrollment || "").trim();
  const captchaAnswer = (body.captcha || "").trim();
  const sessionToken = body.sessionToken || "";
  const usertype = body.usertype || "S";

  if (!enrollment || !captchaAnswer || !sessionToken) {
    return reply.status(400).send({
      error: "Enrollment, captcha, and session token are all required.",
    });
  }

  const storedCaptcha = await cache.get<PortalCaptcha>(PORTAL_CAPTCHA_PREFIX, sessionToken);
  if (!storedCaptcha) {
    return reply.status(400).send({
      error: "Captcha expired. Please refresh the captcha and try again.",
    });
  }

  // Captchas are single-use: consume before portal call
  await cache.invalidate(PORTAL_CAPTCHA_PREFIX, sessionToken);

  const client = createPortalClient();
  try {
    const preToken = await verifyUser(
      client,
      enrollment.toUpperCase(),
      { ...storedCaptcha, captcha: captchaAnswer },
      usertype
    );

    if (preToken.otppwd !== "PWD") {
      logger.warn(`[Auth] Portal requested login mode "${preToken.otppwd}"`);
      return reply.status(409).send({
        error: "This account requires an emailed one-time password, which is not supported yet.",
        code: "OTP_REQUIRED",
      });
    }

    const loginToken = createSessionToken();
    await cache.set<PendingLogin>(
      PORTAL_LOGIN_PREFIX,
      loginToken,
      {
        random: preToken.random,
        otppwd: preToken.otppwd,
        username: enrollment.toUpperCase(),
        usertype,
      },
      CAPTCHA_SESSION_TTL_MS / 1000
    );

    logger.info(`[Auth] User verified: ${enrollment.toUpperCase()}`);
    return reply.status(200).send({
      success: true,
      loginToken,
      loginMode: preToken.otppwd,
    });
  } catch (error: any) {
    if (error instanceof PortalError && error.status === 401) {
      logger.warn(`[Auth] Verification failed for ${enrollment}: wrong captcha or user not found`);
      return reply.status(401).send({
        error: "Invalid enrollment number or captcha. Please try again.",
      });
    }
    logger.error(`[Auth] Portal verification error: ${error?.message}`);
    return reply.status(502).send({
      error: "Failed to connect to the portal. Please try again.",
    });
  } finally {
    client.destroy();
  }
}

/**
 * POST /api/auth — Step 2: submit loginToken + password
 */
export async function campusLynxAuthHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const logger = request.server.log;
  const cache = (request as any).globalCache as CacheService;
  const body = (request.body || {}) as {
    loginToken?: string;
    password?: string;
  };

  const loginToken = body.loginToken || "";
  const password = body.password || "";

  if (!loginToken || !password) {
    return reply.status(400).send({ error: "Login token and password are required." });
  }

  const pending = await cache.get<PendingLogin>(PORTAL_LOGIN_PREFIX, loginToken);
  if (!pending) {
    return reply.status(400).send({
      error: "Your login session expired. Please start again.",
      code: "LOGIN_SESSION_EXPIRED",
    });
  }

  const client = createPortalClient();
  try {
    const identity = await issueSession(client, {
      enrollment: pending.username,
      password,
      preToken: { random: pending.random, otppwd: pending.otppwd },
    });

    await cache.invalidate(PORTAL_LOGIN_PREFIX, loginToken);

    const sessionData: SessionData = {
      jsessionid: "",
      enrollment: pending.username,
      // Kept (AES-256-GCM encrypted inside the httpOnly cookie) so the backend
      // can silently re-login when the portal rejects a token refresh. This is
      // what keeps the user signed in across the portal's ~15-minute token
      // lifetime. It is never returned to the client in plaintext.
      password,
      dob: "",
      role: "Student",
      campusLynx: identity,
    };

    const encryptedSession = encryptSessionData(sessionData);
    setAuthCookie(reply, encryptedSession);

    logger.info(`[Auth] CampusLynx login successful for ${pending.username}`);
    return reply.status(200).send({
      success: true,
      message: "Authentication successful",
      enrollment: pending.username,
    });
  } catch (error: any) {
    if (error instanceof PortalError && error.status === 401) {
      logger.warn(`[Auth] CampusLynx password rejected for ${pending.username}`);
      return reply.status(401).send({ error: "Invalid password. Please try again." });
    }
    logger.error(`[Auth] CampusLynx step 2 failed: ${error?.message}`);
    return reply.status(502).send({ error: "Failed to complete login. Please try again." });
  } finally {
    client.destroy();
  }
}

/**
 * POST /api/auth/silent-login — transparent re-login with stored credentials.
 *
 * The portal's token lifetime is short (~15 minutes) and its refresh endpoint
 * can refuse without invalidating the user. When that happens the browser (which
 * owns the only captcha solver we have) fetches a fresh captcha, solves it, and
 * posts the answer here. This handler pairs that answer with the password kept
 * (AES-encrypted) inside the httpOnly `auth` cookie and runs a full portal login,
 * issuing a fresh cookie — the user never sees a login screen.
 *
 * Failure codes are distinct on purpose so the frontend recovery loop knows
 * whether to retry (a fresh captcha) or give up and ask for the password:
 *   CAPTCHA_EXPIRED / CAPTCHA_INVALID  -> retry with a new captcha
 *   NO_STORED_CREDENTIALS              -> old cookie predates this feature (manual login)
 *   CREDENTIALS_INVALID                -> password changed/rotated (manual login)
 *   OTP_REQUIRED                       -> emailed-OTP account (manual login)
 */
export async function campusLynxSilentLoginHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const logger = request.server.log;
  const cache = (request as any).globalCache as CacheService;
  const body = (request.body || {}) as { captcha?: string; sessionToken?: string };

  const captchaAnswer = (body.captcha || "").trim();
  const sessionToken = body.sessionToken || "";

  if (!captchaAnswer || !sessionToken) {
    return reply.status(400).send({
      error: "Captcha and session token are required.",
      code: "MISSING_FIELDS",
    });
  }

  const encryptedSession = request.cookies.auth;
  if (!encryptedSession) {
    return reply.status(401).send({
      success: false,
      error: "Not authenticated.",
      code: "NO_SESSION",
    });
  }

  let session: SessionData;
  try {
    session = decryptSessionData(encryptedSession);
  } catch {
    return reply.status(401).send({
      success: false,
      error: "Invalid session.",
      code: "INVALID_SESSION",
    });
  }

  const username = session.campusLynx?.username || session.enrollment;
  const password = session.password;

  if (!username) {
    return reply.status(401).send({
      success: false,
      error: "No enrollment on the stored session.",
      code: "NO_SESSION",
    });
  }

  if (!password) {
    // Sessions minted before the password was persisted cannot self-heal.
    return reply.status(409).send({
      success: false,
      error: "No stored credentials for silent re-login. Please sign in again.",
      code: "NO_STORED_CREDENTIALS",
    });
  }

  const storedCaptcha = await cache.get<PortalCaptcha>(PORTAL_CAPTCHA_PREFIX, sessionToken);
  if (!storedCaptcha) {
    return reply.status(400).send({
      success: false,
      error: "Captcha expired. Please try again.",
      code: "CAPTCHA_EXPIRED",
    });
  }

  // Captchas are single-use (mirrors the interactive verify-user flow).
  await cache.invalidate(PORTAL_CAPTCHA_PREFIX, sessionToken);

  const client = createPortalClient();
  try {
    const membertype = session.campusLynx?.membertype === "P" ? "P" : "S";

    let preToken;
    try {
      preToken = await verifyUser(
        client,
        username.toUpperCase(),
        { ...storedCaptcha, captcha: captchaAnswer },
        membertype
      );
    } catch (error: any) {
      if (error instanceof PortalError && error.status === 401) {
        logger.warn(`[Auth] Silent re-login captcha rejected for ${username}`);
        return reply.status(401).send({
          success: false,
          error: "Captcha not accepted. Please try again.",
          code: "CAPTCHA_INVALID",
        });
      }
      throw error;
    }

    if (preToken.otppwd !== "PWD") {
      logger.warn(`[Auth] Silent re-login needs "${preToken.otppwd}" for ${username}`);
      return reply.status(409).send({
        success: false,
        error: "This account now requires an emailed one-time password.",
        code: "OTP_REQUIRED",
      });
    }

    let identity;
    try {
      identity = await issueSession(client, {
        enrollment: username.toUpperCase(),
        password,
        preToken,
      });
    } catch (error: any) {
      if (error instanceof PortalError && error.status === 401) {
        logger.warn(`[Auth] Silent re-login credentials rejected for ${username}`);
        return reply.status(401).send({
          success: false,
          error: "Stored password is no longer valid. Please sign in again.",
          code: "CREDENTIALS_INVALID",
        });
      }
      throw error;
    }

    const newSession: SessionData = {
      ...session,
      enrollment: username,
      password,
      campusLynx: identity,
    };
    setAuthCookie(reply, encryptSessionData(newSession));

    logger.info(`[Auth] Silent re-login succeeded for ${username}`);
    return reply.status(200).send({
      success: true,
      enrollment: identity.enrollmentno,
    });
  } catch (error: any) {
    logger.error(`[Auth] Silent re-login failed: ${error?.message}`);
    return reply.status(502).send({
      success: false,
      error: "Failed to reconnect to the portal. Please try again.",
      code: "SILENT_LOGIN_FAILED",
    });
  } finally {
    client.destroy();
  }
}

/**
 * Register all authentication routes on Fastify instance
 */
export function registerAuthRoutes(fastify: FastifyInstance, cache: CacheService): void {
  fastify.decorateRequest('globalCache', null);
  fastify.addHook('onRequest', async (req) => {
    (req as any).globalCache = cache;
  });

  // GET /api/init — Captcha initialization
  fastify.get("/api/init", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: campusLynxInitHandler,
  });

  // POST /api/auth/verify-user — Step 1: verify enrollment + captcha
  fastify.post("/api/auth/verify-user", {
    schema: {
      body: {
        type: "object",
        required: ["enrollment", "captcha", "sessionToken"],
        properties: {
          enrollment: { type: "string", minLength: 1 },
          captcha: { type: "string", minLength: 1 },
          sessionToken: { type: "string", minLength: 1 },
          usertype: { type: "string", enum: ["S", "P"] },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: campusLynxVerifyUserHandler,
  });

  // POST /api/auth — Step 2: exchange loginToken + password for session
  fastify.post("/api/auth", {
    schema: {
      body: {
        type: "object",
        required: ["loginToken", "password"],
        properties: {
          loginToken: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 1 },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: campusLynxAuthHandler,
  });

  // POST /api/auth/refresh — sliding renewal for session keepalive.
  // `force` renews the portal token on every ping (every 5 minutes from the
  // frontend) rather than only when the local expiry window is hit, so the
  // session survives even when the token's `exp` cannot be parsed locally.
  fastify.post("/api/auth/refresh", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = await getOrRenewCampusLynxIdentity(request, reply, { force: true });
        const expiresAt = identity.token ? jwtExpiry(identity.token) : null;
        return reply.status(200).send({
          success: true,
          enrollment: identity.enrollmentno,
          expiresAt,
        });
      } catch (err: any) {
        return reply.status(err.statusCode || 401).send({
          success: false,
          error: err.message || "Failed to refresh session",
          code: err.code || "UNAUTHORIZED",
        });
      }
    },
  });

  // POST /api/auth/silent-login — transparent re-login with the stored password.
  // The browser solves a fresh captcha and the backend pairs it with the
  // encrypted password in the auth cookie. See campusLynxSilentLoginHandler.
  fastify.post("/api/auth/silent-login", {
    schema: {
      body: {
        type: "object",
        required: ["captcha", "sessionToken"],
        properties: {
          captcha: { type: "string", minLength: 1 },
          sessionToken: { type: "string", minLength: 1 },
        },
      },
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: campusLynxSilentLoginHandler,
  });

  // GET /api/auth/session — verify the HttpOnly session before client redirects
  fastify.get("/api/auth/session", async (request, reply) => {
    try {
      const identity = await getOrRenewCampusLynxIdentity(request, reply);
      return reply.status(200).send({
        success: true,
        enrollment: identity.enrollmentno,
        expiresAt: identity.token ? jwtExpiry(identity.token) : null,
      });
    } catch (err: any) {
      return reply.status(err.statusCode || 401).send({
        success: false,
        error: err.message || "Not authenticated",
        code: err.code || "UNAUTHORIZED",
      });
    }
  });

  // POST /api/logout — clear cookie & session
  fastify.post("/api/logout", async (request, reply) => {
    try {
      const encryptedSession = request.cookies.auth;
      if (encryptedSession) {
        try {
          const session = decryptSessionData(encryptedSession);
          await cache.invalidate('push_subscriptions', session.enrollment);
          await cache.invalidate('dashboard', session.enrollment);
          request.log.info(`[Auth] Logout for enrollment: ${session.enrollment}`);
        } catch {
          request.log.warn('[Auth] Logout: could not decrypt session cookie');
        }
      }

      const isProduction = process.env.NODE_ENV === "production";
      reply.clearCookie("auth", {
        path: "/",
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
      });

      return reply.send({ success: true, message: "Logged out successfully" });
    } catch (error: any) {
      request.log.error(error, '[Auth] Logout error');
      reply.clearCookie("auth", { path: "/" });
      return reply.send({ success: true, message: "Logged out" });
    }
  });
}
