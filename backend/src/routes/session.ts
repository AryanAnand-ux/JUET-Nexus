import { FastifyReply, FastifyRequest } from "fastify";
import { decryptSessionData, encryptSessionData, SessionData } from "../utils/encryption";
import type { PortalSessionIdentity } from "../portal/types";
import { createPortalClient } from "../portal/client";
import { isTokenExpired, jwtExpiry } from "../portal/crypto";

export const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

/**
 * Set the AES-256-GCM encrypted session cookie with standard security attributes
 */
export function setAuthCookie(reply: FastifyReply, encryptedSession: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  reply.setCookie("auth", encryptedSession, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE_SEC,
    path: "/",
  });
}

/**
 * Read and validate the CampusLynx session identity out of the httpOnly `auth` cookie.
 * Performs no network I/O; extracts the decrypted PortalSessionIdentity.
 * Throws a structured 401 error if the session is absent, corrupted, or lacking a token.
 */
export function getCampusLynxIdentity(request: FastifyRequest): PortalSessionIdentity {
  const encryptedSession = request.cookies.auth;

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
  const encryptedSession = request.cookies.auth;

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
    const client = createPortalClient();
    try {
      if (typeof client.refreshToken === "function") {
        const refreshed = await client.refreshToken({
          username: session.campusLynx.username,
          token: session.campusLynx.token,
          otppwd: session.campusLynx.otppwd || "PWD",
        });

        const newToken = refreshed?.response?.regdata?.token;
        if (newToken) {
          session.campusLynx.token = newToken;
          if (refreshed.response?.regdata?.memberid) {
            session.campusLynx.memberid = String(refreshed.response.regdata.memberid);
          }
          const updatedEncrypted = encryptSessionData(session);
          if (reply) {
            setAuthCookie(reply, updatedEncrypted);
          }
          request.log?.info?.(`[Session] Token transparently renewed for ${session.campusLynx.username}`);
        }
      }
    } catch (refreshErr: any) {
      request.log?.warn?.(
        `[Session] Token refresh failed for ${session.campusLynx.username}: ${refreshErr?.message}`
      );
      // If token is fully expired, report 401
      if (isTokenExpired(session.campusLynx.token, 0)) {
        throw {
          statusCode: 401,
          message: "Session expired. Please log in again.",
          code: "SESSION_EXPIRED",
        };
      }
    } finally {
      client.destroy();
    }
  } else if (reply) {
    // Sliding cookie window: extend cookie maxAge on active request
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
