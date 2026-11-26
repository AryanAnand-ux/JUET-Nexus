import { FastifyInstance } from 'fastify';
import {
  extractEncryptedSession,
  getCampusLynxIdentity,
  getOrRenewCampusLynxIdentity,
  isPortalTokenDead,
  setAuthCookie,
} from './session';
import { createPortalClient, getSharedPortalClient } from '../portal/client';
import { fetchAttendanceDetail, parseDetailLink } from '../portal/attendance';
import { PortalError } from '../portal/types';
import { CacheService } from '../utils/cache';
import { decryptSessionData } from '../utils/encryption';
import type { AttendanceDetailsResponse } from '../../../shared/types';

const ATTENDANCE_CACHE_TTL_SEC = 86400; // 24 hours (long retention for historical logs, revalidated via SWR)
const ATTENDANCE_PORTAL_TIMEOUT_MS = 14000; // 14 seconds (allows single retry within client 30s timeout)
const inFlightAttendance = new Map<string, Promise<AttendanceDetailsResponse>>();

export async function registerAttendanceRoutes(
  fastify: FastifyInstance,
  cache?: CacheService
) {
  fastify.get<{
    Querystring: { link: string; subject: string; refresh?: string | boolean };
  }>(
    '/api/attendance/details',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['link', 'subject'],
          properties: {
            link: { type: 'string', minLength: 1 },
            subject: { type: 'string', minLength: 1 },
            refresh: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { link, subject, refresh } = request.query;
        const isBypassCache = refresh === 'true' || refresh === true;

        if (!link || !subject) {
          return reply.status(400).send({
            success: false,
            error: 'Missing link or subject parameter',
            code: 'BAD_REQUEST',
          });
        }

        const ref = parseDetailLink(link);
        if (!ref) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid attendance detail reference',
            code: 'INVALID_REF',
          });
        }

        let localIdentity;
        try {
          localIdentity = getCampusLynxIdentity(request);
        } catch (err: any) {
          return reply.status(err.statusCode || 401).send({
            success: false,
            error: err.message || 'Unauthorized',
            code: err.code || 'UNAUTHORIZED',
          });
        }

        const localEnrollment = localIdentity.enrollmentno || localIdentity.username;
        const cacheKey = localEnrollment
          ? `att_detail:${localEnrollment}:${ref.subjectid}:${ref.registrationid}`
          : null;

        // Check cache BEFORE calling getOrRenewCampusLynxIdentity so cache hits
        // never stall behind an upstream refreshTokenRequest round-trip.
        let cachedAttendance: AttendanceDetailsResponse | null = null;
        if (cache && cacheKey && !isBypassCache) {
          try {
            cachedAttendance = await cache.get<AttendanceDetailsResponse>(
              'attendance',
              cacheKey
            );
            if (cachedAttendance && !isPortalTokenDead(localIdentity)) {
              const encryptedSession = extractEncryptedSession(request);
              if (encryptedSession) setAuthCookie(reply, encryptedSession);
              return reply.send({
                success: true,
                data: cachedAttendance,
                cached: true,
              });
            }
          } catch (cacheErr) {
            request.log.warn(cacheErr, '[AttendanceDetails] Cache read failed');
          }
        }

        let identity;
        try {
          identity = await getOrRenewCampusLynxIdentity(request, reply);
        } catch (err: any) {
          // If session renewal failed, try serving stale cache before rejecting
          const encryptedSession = extractEncryptedSession(request);
          if (encryptedSession && cache) {
            try {
              const session = decryptSessionData(encryptedSession);
              const userEnrollment =
                session.campusLynx?.enrollmentno || session.enrollment;
              if (userEnrollment) {
                const staleKey = `att_detail:${userEnrollment}:${ref.subjectid}:${ref.registrationid}`;
                const cached = await cache.get<AttendanceDetailsResponse>(
                  'attendance',
                  staleKey
                );
                if (cached) {
                  return reply.send({
                    success: true,
                    data: cached,
                    cached: true,
                    stale: true,
                    sessionExpired: true,
                  });
                }
              }
            } catch {
              // Ignore and proceed to 401
            }
          }

          return reply.status(err.statusCode || 401).send({
            success: false,
            error: err.message || 'Unauthorized',
            code: err.code || 'UNAUTHORIZED',
          });
        }

        if (cachedAttendance) {
          return reply.send({
            success: true,
            data: cachedAttendance,
            cached: true,
          });
        }

        const shared = typeof getSharedPortalClient === 'function' ? getSharedPortalClient() : null;
        const client = shared || createPortalClient({ timeout: ATTENDANCE_PORTAL_TIMEOUT_MS });
        const transport = {
          postEncrypted: (path: string, payload: Record<string, unknown>, options?: { timeout?: number }) =>
            client.postEncrypted(path, payload, identity, {
              timeout: options?.timeout || ATTENDANCE_PORTAL_TIMEOUT_MS,
            }),
        };

        const runFetch = () =>
          fetchAttendanceDetail(
            transport,
            {
              instituteid: identity.instituteid,
              stynumber: ref.stynumber,
              registrationid: ref.registrationid,
              registrationcode: ref.registrationcode,
            },
            {
              subject,
              subjectid: ref.subjectid,
              individualsubjectcode: ref.individualsubjectcode,
              components: ref.components,
              officialPercentage: ref.officialPercentage,
            }
          );

        try {
          let detail: AttendanceDetailsResponse;
          if (cacheKey && !isBypassCache) {
            let pending = inFlightAttendance.get(cacheKey);
            if (!pending) {
              pending = runFetch().finally(() => {
                inFlightAttendance.delete(cacheKey);
              });
              inFlightAttendance.set(cacheKey, pending);
            }
            detail = await pending;
          } else {
            detail = await runFetch();
          }

          if (request.raw.destroyed || reply.raw.writableEnded) {
            return;
          }

          if (cache && cacheKey && detail) {
            try {
              await cache.set(
                'attendance',
                cacheKey,
                detail,
                ATTENDANCE_CACHE_TTL_SEC
              );
            } catch (cacheErr) {
              request.log.warn(cacheErr, '[AttendanceDetails] Cache write failed');
            }
          }

          return reply.send({ success: true, data: detail, cached: false });
        } catch (error: any) {
          const isTimeout =
            /timeout/i.test(error?.message || '') ||
            error?.code === 'ECONNABORTED';

          // Try falling back to cached data on upstream error (timeout or portal 500)
          if (cache && cacheKey) {
            try {
              const cached = await cache.get<AttendanceDetailsResponse>(
                'attendance',
                cacheKey
              );
              if (cached) {
                request.log.warn(
                  '[AttendanceDetails] Upstream failed, returning stale cached attendance detail'
                );
                return reply.send({
                  success: true,
                  data: cached,
                  cached: true,
                  stale: true,
                  upstreamError: error.message,
                });
              }
            } catch {
              // Ignore cache failure
            }
          }

          const status =
            error instanceof PortalError && error.status === 401
              ? 401
              : isTimeout
              ? 504
              : 502;
          const code =
            status === 401
              ? 'SESSION_EXPIRED'
              : isTimeout
              ? 'ATTENDANCE_TIMEOUT'
              : 'ATTENDANCE_FETCH_FAILED';
          const friendlyMessage =
            status === 401
              ? 'Session expired. Please log in again.'
              : isTimeout
              ? 'CampusLynx attendance service timed out. The university portal may be under heavy load. Please try again.'
              : error.message || 'Failed to fetch attendance details';

          request.log.error(error, '[AttendanceDetails] CampusLynx fetch failed');
          return reply.status(status).send({
            success: false,
            error: friendlyMessage,
            code,
          });
        } finally {
          if (!shared && typeof client.destroy === 'function') {
            client.destroy();
          }
        }
      } catch (error: any) {
        request.log.error(error, '[AttendanceDetails] Unexpected error');
        return reply.status(500).send({
          success: false,
          error: error.message || 'Internal server error',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );
}
