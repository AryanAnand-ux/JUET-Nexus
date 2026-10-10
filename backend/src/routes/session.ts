import { FastifyReply, FastifyRequest } from "fastify";
import { decryptSessionData, encryptSessionData, SessionData } from "../utils/encryption";
import type { PortalSessionIdentity } from "../portal/types";
import { createPortalClient } from "../portal/client";
import { isTokenExpired, jwtExpiry } from "../portal/crypto";

export const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

/**
 * How long we hold a portal token before forcing a refresh, measured from when
 * we last obtained it. The portal's JWT expires in ~15 minutes; 8 minutes
 * leaves a wide margin so the token is always renewed well before it can die.
 * This path does NOT depend on parsing the token's `exp`, so it also covers
 * opaque / unparseable tokens that the old `exp !== null` guard skipped — those
 * were never renewed and silently expired after ~15 minutes.
 */
const TOKEN_MAX_AGE_SEC = 8 * 60;

type RenewedSession = {
  identity: PortalSessionIdentity;
  encryptedSession: string;
};

const renewalInFlight = new Map<string, Promise<RenewedSession>>();

/**
 * Extract the encrypted session from the HttpOnly auth cookie.
 */
export function extractEncryptedSession(request: FastifyRequest): string | undefined {
  return request.cookies?.auth;
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
}

/**
 * Read and validate the CampusLynx session identity out of the httpOnly `auth` cookie
 * cookie.
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
 *
 * `options.force` makes renewal unconditional — used by the dedicated
 * `/api/auth/refresh` keepalive so the portal token is refreshed on every ping
 * regardless of whether its `exp` can be parsed locally.
 */
export async function getOrRenewCampusLynxIdentity(
  request: FastifyRequest,
  reply?: FastifyReply,
  options?: { force?: boolean }
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

  const nowSec = Math.floor(Date.now() / 1000);
  const identity = session.campusLynx;
  const token = session.campusLynx.token; // narrowed to string by the guard above
  const exp = jwtExpiry(token);
  // Renew when ANY of these hold:
  //   1. caller asked for a forced renewal (the /api/auth/refresh keepalive);
  //   2. a real JWT is within 10 minutes of its `exp` (600-second skew);
  //   3. the token has simply been held longer than the portal's ~15-minute
  //      lifetime, measured from when we last obtained it. This covers opaque /
  //      unparseable tokens (no readable `exp`) that the old `exp !== null`
  //      guard never renewed — they used to expire unnoticed after ~15 minutes.
  const ageExpired =
    identity.tokenIssuedAt != null && nowSec - identity.tokenIssuedAt >= TOKEN_MAX_AGE_SEC;
  const skewExpired = exp !== null && isTokenExpired(token, 600);
  const needsRenewal = Boolean(options?.force) || ageExpired || skewExpired;
  if (needsRenewal) {
    const username = session.campusLynx.username;
    let renewal = renewalInFlight.get(username);

    if (!renewal) {
      renewal = (async (): Promise<RenewedSession> => {
        const client = createPortalClient({ timeout: 8000 });
        try {
          const refreshed = await client.refreshToken({
            username,
            tokendate: session.campusLynx!.tokendate,
          });

          if (refreshed.ok && refreshed.token) {
            session.campusLynx!.token = refreshed.token;
            session.campusLynx!.tokenIssuedAt = nowSec;
            request.log?.info?.(`[Session] Token transparently renewed for ${username}`);
            return {
              identity: session.campusLynx!,
              encryptedSession: encryptSessionData(session),
            };
          }

          if (refreshed.ok) {
            // Portal confirmed the session is still good without rotating the
            // token. Re-stamp the age so we do not hammer the refresh endpoint
            // on every subsequent request before the next 8-minute window.
            session.campusLynx!.tokenIssuedAt = nowSec;
            request.log?.info?.(`[Session] Token refresh confirmed without rotation for ${username}`);
            return {
              identity: session.campusLynx!,
              encryptedSession: encryptSessionData(session),
            };
          }

          if (refreshed.networkError) {
            // The refresh request never reached the portal. That says nothing
            // about whether the session is still valid, so keep it and let the
            // next real data call decide. Forcing a re-login here would log the
            // user out on a momentary blip.
            request.log?.warn?.(
              `[Session] Refresh transport error for ${username}; keeping session`
            );
            return { identity: session.campusLynx!, encryptedSession };
          }

          request.log?.warn?.(`[Session] Lightweight refresh rejected for ${username}`);
          // The portal actively refused the refresh. If the token is past its
          // readable `exp`, the session is genuinely dead and the caller (or the
          // frontend's silent re-login) must re-authenticate.
          if (isTokenExpired(session.campusLynx!.token, 0)) {
            throw {
              statusCode: 401,
              message: "Session expired. Please log in again.",
              code: "SESSION_EXPIRED",
            };
          }

          return { identity: session.campusLynx!, encryptedSession };
        } catch (refreshErr: any) {
          // `refreshToken` no longer throws for transport failures (it reports
          // `networkError`), so anything here is unexpected. Never turn an
          // unexpected error into a forced logout: slide the session instead.
          if (refreshErr?.code === "SESSION_EXPIRED") throw refreshErr;
          request.log?.warn?.(
            `[Session] Token refresh threw for ${username}: ${refreshErr?.message}`
          );
          return { identity: session.campusLynx!, encryptedSession };
        } finally {
          client.destroy();
        }
      })();
      renewalInFlight.set(username, renewal);
      renewal.finally(() => {
        if (renewalInFlight.get(username) === renewal) {
          renewalInFlight.delete(username);
        }
      }).catch(() => undefined);
    }

    const renewed = await renewal;
    if (reply) {
      setAuthCookie(reply, renewed.encryptedSession);
    }
    return renewed.identity;
  }

  if (reply) {
    setAuthCookie(reply, encryptedSession);
  }

  return session.campusLynx;

}
