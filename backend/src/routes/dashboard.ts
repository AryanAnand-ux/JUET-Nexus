/**
 * Dashboard API Routes (CampusLynx Portal Engine)
 *
 * GET /api/dashboard - Fetch and cache student dashboard data
 * GET /api/dashboard/invalidate - Invalidate cached data for enrollment
 */

import { FastifyInstance } from 'fastify';
import { CacheService } from '../utils/cache';
import { getCampusLynxIdentity, getOrRenewCampusLynxIdentity } from './session';
import { createPortalClient } from '../portal/client';
import { fetchCampusLynxDashboard } from '../portal/dashboard';
import { PortalError, type PortalSessionIdentity } from '../portal/types';
import type { DashboardResponse } from '../../../shared/types';

interface DashboardQuery {
  enrollment?: string;
}

function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

const FRESH_TTL_SEC = 300;   // 5 minutes
const STALE_TTL_SEC = 7200;  // 2 hours
const activeRefreshes = new Set<string>();

async function fetchDashboardForIdentity(
  identity: PortalSessionIdentity,
  log: any
): Promise<DashboardResponse> {
  const client = createPortalClient();
  try {
    const transport = {
      postEncrypted: (path: string, payload: Record<string, unknown>) =>
        client.postEncrypted(path, payload, identity),
      getEncrypted: (path: string) => client.getEncrypted(path, identity),
    };
    return await fetchCampusLynxDashboard(transport, {
      instituteid: identity.instituteid,
      companyid: identity.companyid,
      username: identity.username,
    });
  } catch (error: any) {
    if (error instanceof PortalError && error.status === 401) {
      throw {
        statusCode: 401,
        message: 'Session expired. Please log in again.',
        code: 'SESSION_EXPIRED',
      };
    }
    log?.error?.(error, '[Dashboard] CampusLynx fetch failed');
    throw {
      statusCode: 502,
      message: 'Failed to fetch dashboard from the student portal.',
      code: 'DASHBOARD_FETCH_FAILED',
    };
  } finally {
    client.destroy();
  }
}

async function triggerBackgroundRefresh(
  enrollment: string,
  request: any,
  cache: CacheService
): Promise<void> {
  if (activeRefreshes.has(enrollment)) return;
  activeRefreshes.add(enrollment);

  try {
    request.log.info(`[Dashboard SWR] Starting background refresh for ${enrollment}`);
    const identity = getCampusLynxIdentity(request);
    const dashboardData = await fetchDashboardForIdentity(identity, request.log);

    await cache.set('dashboard', enrollment, { data: dashboardData, fetchedAt: Date.now() }, STALE_TTL_SEC);
    request.log.info(`[Dashboard SWR] Background refresh successful for ${enrollment}`);
  } catch (err: any) {
    request.log.error(err, `[Dashboard SWR] Background refresh failed for ${enrollment}`);
  } finally {
    activeRefreshes.delete(enrollment);
  }
}

export async function registerDashboardRoutes(
  fastify: FastifyInstance,
  cache: CacheService
) {
  fastify.get<{ Querystring: DashboardQuery }>('/api/dashboard', async (request, reply) => {
    let enrollment: string | undefined;
    try {
      let identity: PortalSessionIdentity;
      try {
        identity = await getOrRenewCampusLynxIdentity(request, reply);
      } catch (err: any) {
        const queryEnrollment =
          firstString(request.query.enrollment) ||
          firstString(request.headers['x-enrollment']);
        if (queryEnrollment) {
          try {
            const cached = await cache.get<any>('dashboard', queryEnrollment);
            if (cached?.data) {
              fastify.log.warn(`[Dashboard] Session check failed, serving fallback cached data for ${queryEnrollment}`);
              return reply
                .header('X-Cache', 'hit')
                .header('X-Cache-Status', 'stale')
                .send({
                  success: true,
                  data: cached.data,
                  cached: true,
                  stale: true,
                });
            }
          } catch {
            // ignore
          }
        }
        return reply.status(err.statusCode || 401).send({
          success: false,
          error: err.message || 'Unauthorized',
          code: err.code || 'UNAUTHORIZED',
        });
      }

      enrollment =
        firstString(request.query.enrollment) ||
        firstString(request.headers['x-enrollment']);

      if (!enrollment) {
        return reply.status(400).send({
          success: false,
          error: 'Missing enrollment number',
          code: 'MISSING_ENROLLMENT',
        });
      }

      if (enrollment.toUpperCase() !== identity.username.toUpperCase()) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden: You cannot access data for another enrollment',
          code: 'FORBIDDEN',
        });
      }

      // SWR Cache Lookup
      fastify.log.info(`[Dashboard] Checking cache for ${enrollment}`);
      const cachedWrapper = await cache.get<any>('dashboard', enrollment);

      if (cachedWrapper) {
        const data = cachedWrapper.data ? cachedWrapper.data : cachedWrapper;
        const fetchedAt = cachedWrapper.fetchedAt || (Date.now() - (FRESH_TTL_SEC + 1) * 1000);
        const ageSec = (Date.now() - fetchedAt) / 1000;

        if (ageSec <= FRESH_TTL_SEC) {
          fastify.log.info(`[Dashboard] Fresh cache hit for ${enrollment} (age: ${Math.round(ageSec)}s)`);
          const ttl = await cache.getTTL('dashboard', enrollment);
          return reply
            .header('X-Cache', 'hit')
            .header('X-Cache-Status', 'fresh')
            .header('X-Cache-TTL', ttl.toString())
            .send({
              success: true,
              data,
              cached: true,
              ttl,
            });
        }

        if (ageSec <= STALE_TTL_SEC) {
          fastify.log.info(`[Dashboard] Stale cache hit for ${enrollment} (age: ${Math.round(ageSec)}s), triggering background refresh...`);
          triggerBackgroundRefresh(enrollment, request, cache).catch((err) => {
            request.log.error(err, `[Dashboard] Background refresh trigger failed for ${enrollment}`);
          });

          const ttl = await cache.getTTL('dashboard', enrollment);
          return reply
            .header('X-Cache', 'hit')
            .header('X-Cache-Status', 'stale')
            .header('X-Cache-TTL', ttl.toString())
            .send({
              success: true,
              data,
              cached: true,
              ttl,
            });
        }
      }

      fastify.log.info(`[Dashboard] Cache miss/expired for ${enrollment}, fetching from CampusLynx portal...`);
      const dashboardData = await fetchDashboardForIdentity(identity, fastify.log);

      try {
        await cache.set('dashboard', enrollment, { data: dashboardData, fetchedAt: Date.now() }, STALE_TTL_SEC);
      } catch (error) {
        fastify.log.warn(error, '[Dashboard] Cache write failed');
      }

      return reply
        .header('X-Cache', 'miss')
        .send({
          success: true,
          data: dashboardData,
          cached: false,
        });
    } catch (error: any) {
      if (enrollment) {
        try {
          const cached = await cache.get<any>('dashboard', enrollment);
          if (cached?.data) {
            fastify.log.warn(`[Dashboard] Live fetch failed, serving fallback stale cached data for ${enrollment}`);
            return reply
              .header('X-Cache', 'hit')
              .header('X-Cache-Status', 'stale')
              .send({
                success: true,
                data: cached.data,
                cached: true,
                stale: true,
              });
          }
        } catch {
          // ignore cache read error
        }
      }

      if (error.statusCode === 401 || error.code === 'SESSION_EXPIRED') {
        return reply.status(401).send({
          success: false,
          error: error.message || 'Session expired. Please log in again.',
          code: 'SESSION_EXPIRED',
        });
      }

      fastify.log.error(error, '[Dashboard] Unhandled error');
      return reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  });

  /**
   * GET /api/dashboard/invalidate
   */
  fastify.get<{ Querystring: DashboardQuery }>('/api/dashboard/invalidate', async (request, reply) => {
    try {
      let identity: PortalSessionIdentity;
      try {
        identity = getCampusLynxIdentity(request);
      } catch (err: any) {
        return reply.status(err.statusCode || 401).send({
          success: false,
          error: err.message || 'Unauthorized',
          code: err.code || 'UNAUTHORIZED',
        });
      }

      const enrollment = request.query.enrollment;

      if (!enrollment) {
        return reply.status(400).send({
          success: false,
          error: 'Missing enrollment parameter',
        });
      }

      if (enrollment.toUpperCase() !== identity.username.toUpperCase()) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden: You cannot access data for another enrollment',
          code: 'FORBIDDEN',
        });
      }

      await cache.invalidate('dashboard', enrollment);

      return reply.send({
        success: true,
        message: `Cache invalidated for ${enrollment}`,
      });
    } catch (error) {
      fastify.log.error(error, '[Dashboard] Invalidate error');
      return reply.status(500).send({
        success: false,
        error: 'Failed to invalidate cache',
      });
    }
  });
}
