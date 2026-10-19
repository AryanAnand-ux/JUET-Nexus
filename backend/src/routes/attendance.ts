import { FastifyInstance } from 'fastify';
import { getOrRenewCampusLynxIdentity } from './session';
import { createPortalClient } from '../portal/client';
import { fetchAttendanceDetail, parseDetailLink } from '../portal/attendance';
import { PortalError } from '../portal/types';
import { CacheService } from '../utils/cache';
import { decryptSessionData } from '../utils/encryption';
import type { AttendanceDetailsResponse } from '../../../shared/types';

const ATTENDANCE_CACHE_TTL_SEC = 600; // 10 minutes
const ATTENDANCE_PORTAL_TIMEOUT_MS = 28000; // 28 seconds

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

        let identity;
        try {
          identity = await getOrRenewCampusLynxIdentity(request, reply);
        } catch (err: any) {
          // If session renewal failed, try serving stale cache before rejecting
          const encryptedSession = request.cookies?.auth;
          if (encryptedSession && cache) {
            try {
              const session = decryptSessionData(encryptedSession);
              const userEnrollment =
                session.campusLynx?.enrollmentno || session.enrollment;
              if (userEnrollment) {
                const cacheKey = `att_detail:${userEnrollment}:${ref.subjectid}:${ref.registrationid}`;
                const cached = await cache.get<AttendanceDetailsResponse>(
                  'attendance',
                  cacheKey
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

        const userEnrollment = identity.enrollmentno || identity.username;
        const cacheKey = userEnrollment
          ? `att_detail:${userEnrollment}:${ref.subjectid}:${ref.registrationid}`
          : null;

        // Check cache if not explicitly refreshing
        if (cache && cacheKey && !isBypassCache) {
          try {
            const cached = await cache.get<AttendanceDetailsResponse>(
              'attendance',
              cacheKey
            );
            if (cached) {
              return reply.send({
                success: true,
                data: cached,
                cached: true,
              });
            }
          } catch (cacheErr) {
            request.log.warn(cacheErr, '[AttendanceDetails] Cache read failed');
          }
        }

        const client = createPortalClient({ timeout: ATTENDANCE_PORTAL_TIMEOUT_MS });
        const transport = {
          postEncrypted: (path: string, payload: Record<string, unknown>) =>
            client.postEncrypted(path, payload, identity),
        };

        try {
          const detail = await fetchAttendanceDetail(
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
          client.destroy();
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
