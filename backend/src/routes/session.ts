import { FastifyReply, FastifyRequest } from "fastify";
import { decryptSessionData, encryptSessionData, SessionData } from "../utils/encryption";
import type { PortalSessionIdentity } from "../portal/types";
import { createPortalClient } from "../portal/client";
import { isTokenExpired, jwtExpiry } from "../portal/crypto";

export const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

/**
 * Extract encrypted session string from cookies or x-session-token header
 */
export function extractEncryptedSession(request: FastifyRequest): string | undefined {
  return (
    request.cookies?.auth ||
    (request.headers?.["x-session-token"] as string | undefined)
  );
}

/**
 * Set the AES-256-GCM encrypted session cookie with standard security attributes
 * and persistent 30-day lifetime (Expires + Max-Age).
 */
export function setAuthCookie(reply: FastifyReply, encryptedSession: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  const expires = new Date(Date.now() + COOKIE_MAX_AGE_SEC * 1000);
  reply.setCookie("auth", encryptedSession, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE_SEC,
    expires,
    path: "/",
  });
  // Also expose to client header for localStorage redundancy
  reply.header("x-session-token", encryptedSession);
}

/**
 * Read and validate the CampusLynx session identity out of the httpOnly `auth` cookie
 * or `x-session-token` header.
 * Performs no network I/O; extracts the decrypted PortalSessionIdentity.
 * Throws a structured 401 error if the session is absent, corrupted, or lacking a token.
 */
export function getCampusLynxIdentity(request: FastifyRequest): PortalSessionIdentity {
  const encryptedSession = extractEncryptedSession(request);

  if (!encryptedSession) {
    throw { statusCode: 401, message: "Not authenticated", code: "NO_SESSION" };
  }

  let session: SessionData;
  try {
    session = decryptSessionData(encryptedSession);
  } catch (err) {
    throw { statusCode: 401, message: "Unauthorized: Invalid session", code: "INVALID_SESSION" };
  }

  if (!session.campusLynx?.token) {
    throw {
      statusCode: 401,
      message: "CampusLynx session not established. Please log in again.",
      code: "NO_CAMPUSLYNX_SESSION",
    };
  }

  return session.campusLynx;
}

/**
 * Read and automatically renew the CampusLynx session if the token is nearing expiry.
 * Attaches the updated 30-day sliding cookie to `reply`.
 */
export async function getOrRenewCampusLynxIdentity(
  request: FastifyRequest,
  reply?: FastifyReply
): Promise<PortalSessionIdentity> {
  const encryptedSession = extractEncryptedSession(request);

  if (!encryptedSession) {
    throw { statusCode: 401, message: "Not authenticated", code: "NO_SESSION" };
  }

  let session: SessionData;
  try {
    session = decryptSessionData(encryptedSession);
  } catch (err) {
    throw { statusCode: 401, message: "Unauthorized: Invalid session", code: "INVALID_SESSION" };
  }

  if (!session.campusLynx?.token) {
    throw {
      statusCode: 401,
      message: "CampusLynx session not established. Please log in again.",
      code: "NO_CAMPUSLYNX_SESSION",
    };
  }

  // Check if token has an exp claim and expires within 5 minutes (300 seconds)
  const exp = jwtExpiry(session.campusLynx.token);
  if (exp !== null && isTokenExpired(session.campusLynx.token, 300)) {
    const client = createPortalClient({ timeout: 8000 });
    try {
      // Tier-1 lightweight refresh: plain JSON, no captcha, sub-100 ms.
      // Confirmed working by lazyportal reference: POST /token/refreshTokenRequest
      // with { username, tokendate }. Falls back gracefully if portal refuses.
      const refreshed = await client.refreshToken({
        username: session.campusLynx.username,
        tokendate: (session.campusLynx as any).tokendate,
      });

      if (refreshed.ok && refreshed.token) {
        session.campusLynx.token = refreshed.token;
        const updatedEncrypted = encryptSessionData(session);
        if (reply) {
          setAuthCookie(reply, updatedEncrypted);
        }
        request.log?.info?.(
          `[Session] Token transparently renewed for ${session.campusLynx.username}`
        );
        return session.campusLynx;
      }

      // Refresh returned ok=true but no new token — server extended the existing one
      if (refreshed.ok) {
        request.log?.info?.(
          `[Session] Token refresh confirmed (no rotation) for ${session.campusLynx.username}`
        );
      } else {
        // Refresh refused — if token is still within exp, let it through
        request.log?.warn?.(
          `[Session] Lightweight refresh failed for ${session.campusLynx.username} — ` +
          (isTokenExpired(session.campusLynx.token, 0) ? "token truly expired" : "falling back to existing token")
        );
        if (isTokenExpired(session.campusLynx.token, 0)) {
          throw {
            statusCode: 401,
            message: "CampusLynx session expired. Please log in again.",
            code: "SESSION_EXPIRED",
          };
        }
      }
    } catch (refreshErr: any) {
      // Re-throw structured 401s, swallow network/transient errors
      if (refreshErr?.code === "SESSION_EXPIRED") throw refreshErr;
      request.log?.warn?.(
        `[Session] Token refresh threw for ${session.campusLynx.username}: ${refreshErr?.message}`
      );
      if (isTokenExpired(session.campusLynx.token, 0)) {
        throw {
          statusCode: 401,
          message: "CampusLynx session expired. Please log in again.",
          code: "SESSION_EXPIRED",
        };
      }
    } finally {
      client.destroy();
    }
  }

  if (reply) {
    setAuthCookie(reply, encryptedSession);
  }

  return session.campusLynx;

}

/**
 * Backward compatibility helper for routes verifying session validity.
 */
export async function getValidSession(
  request: FastifyRequest,
  _reply?: any
): Promise<string> {
  const identity = getCampusLynxIdentity(request);
  return identity.enrollmentno;
}
