/**
 * Dashboard API Routes (CampusLynx Portal Engine)
 *
 * GET /api/dashboard - Fetch and cache student dashboard data
 * GET /api/dashboard/invalidate - Invalidate cached data for enrollment
 */

import { FastifyInstance } from 'fastify';
import { CacheService } from '../utils/cache';
import { decryptSessionData } from '../utils/encryption';
import {
  extractEncryptedSession,
  getCampusLynxIdentity,
  getOrRenewCampusLynxIdentity,
  isPortalTokenDead,
  setAuthCookie,
} from './session';
import { getSharedPortalClient, createPortalClient } from '../portal/client';
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
const CACHE_PREFIX = 'dashboard';
const META_CACHE_PREFIX = 'dashboard_meta';
const activeRefreshes = new Set<string>();
const inFlightMisses = new Map<string, Promise<DashboardResponse>>();

async function fetchDashboardForIdentity(
  identity: PortalSessionIdentity,
  log: any
): Promise<DashboardResponse> {
  const shared = typeof getSharedPortalClient === 'function' ? getSharedPortalClient() : null;
  const client = shared || createPortalClient();
  try {
    const transport = {
      postEncrypted: (path: string, payload: Record<string, unknown>) =>
        client.postEncrypted(path, payload, identity),
      getEncrypted: (path: string) => client.getEncrypted(path, identity),
      ...(typeof client.getBuffer === 'function'
        ? { getBuffer: (path: string) => client.getBuffer!(path, identity) }
        : {}),
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
    if (!shared && typeof client.destroy === 'function') {
      client.destroy();
    }
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
    const identity = await getOrRenewCampusLynxIdentity(request);
    const dashboardData = await fetchDashboardForIdentity(identity, request.log);
    const now = Date.now();

    await Promise.all([
      cache.set(CACHE_PREFIX, enrollment, { data: dashboardData, fetchedAt: now }, STALE_TTL_SEC),
      cache.set(META_CACHE_PREFIX, enrollment, { fetchedAt: now }, STALE_TTL_SEC),
    ]);
    request.log.info(`[Dashboard SWR] Background refresh successful for ${enrollment}`);
  } catch (err: any) {
    request.log.error(err, `[Dashboard SWR] Background refresh failed for ${enrollment}`);
  } finally {
    activeRefreshes.delete(enrollment);
  }
}

async function sendCachedDashboardIfAvailable(
  cachedWrapper: any,
  enrollment: string,
  request: any,
  reply: any,
  cache: CacheService,
  log: any,
  refreshCookie = true
): Promise<boolean> {
  if (!cachedWrapper) return false;
  const data = cachedWrapper.data ? cachedWrapper.data : cachedWrapper;
  const fetchedAt = cachedWrapper.fetchedAt || (Date.now() - (FRESH_TTL_SEC + 1) * 1000);
  const ageSec = (Date.now() - fetchedAt) / 1000;
  const encryptedSession = refreshCookie ? extractEncryptedSession(request) : undefined;

  if (ageSec <= FRESH_TTL_SEC) {
    log.info(`[Dashboard] Fresh cache hit for ${enrollment} (age: ${Math.round(ageSec)}s)`);
    if (encryptedSession) setAuthCookie(reply, encryptedSession);
    const ttl = Math.max(0, Math.round(FRESH_TTL_SEC - ageSec));
    reply
      .header('X-Cache', 'hit')
      .header('X-Cache-Status', 'fresh')
      .header('X-Cache-TTL', ttl.toString())
      .send({
        success: true,
        data,
        cached: true,
        ttl,
        fetchedAt: cachedWrapper.fetchedAt || Date.now(),
      });
    return true;
  }

  if (ageSec <= STALE_TTL_SEC) {
    log.info(`[Dashboard] Stale cache hit for ${enrollment} (age: ${Math.round(ageSec)}s), triggering background refresh...`);
    if (encryptedSession) setAuthCookie(reply, encryptedSession);
    triggerBackgroundRefresh(enrollment, request, cache).catch((err) => {
      request.log.error(err, `[Dashboard] Background refresh trigger failed for ${enrollment}`);
    });

    reply
      .header('X-Cache', 'hit')
      .header('X-Cache-Status', 'stale')
      .header('X-Cache-TTL', '0')
      .send({
        success: true,
        data,
        cached: true,
        ttl: 0,
        fetchedAt: cachedWrapper.fetchedAt || Date.now(),
      });
    return true;
  }

  return false;
}

export async function registerDashboardRoutes(
  fastify: FastifyInstance,
  cache: CacheService
) {
  fastify.get<{ Querystring: DashboardQuery }>('/api/dashboard', async (request, reply) => {
    let enrollment: string | undefined;
    try {
      let localIdentity: PortalSessionIdentity;
      try {
        localIdentity = getCampusLynxIdentity(request);
      } catch (err: any) {
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

      if (enrollment.toUpperCase() !== localIdentity.username.toUpperCase()) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden: You cannot access data for another enrollment',
          code: 'FORBIDDEN',
        });
      }

      // SWR Cache Lookup BEFORE synchronous token renewal so valid sessions
      // return cached data immediately without blocking on refreshTokenRequest.
      // If the portal token is already past its 15m/exp window, still run renewal
      // so stale sessions recover or surface `sessionExpired: true`.
      fastify.log.info(`[Dashboard] Checking cache for ${enrollment}`);
      const cachedWrapper = await cache.get<any>(CACHE_PREFIX, enrollment);

      if (cachedWrapper && !isPortalTokenDead(localIdentity)) {
        const sent = await sendCachedDashboardIfAvailable(
          cachedWrapper,
          enrollment,
          request,
          reply,
          cache,
          fastify.log
        );
        if (sent) return;
      }

      let identity: PortalSessionIdentity;
      try {
        identity = await getOrRenewCampusLynxIdentity(request, reply);
      } catch (err: any) {
        const encryptedSession = extractEncryptedSession(request);
        if (encryptedSession) {
          try {
            const session = decryptSessionData(encryptedSession);
            const userEnrollment = (session.campusLynx?.username || session.enrollment || '').toUpperCase();
            if (userEnrollment) {
              const staleWrapper = await cache.get<any>(CACHE_PREFIX, userEnrollment);
              if (staleWrapper) {
                const data = staleWrapper.data ? staleWrapper.data : staleWrapper;
                request.log.info(`[Dashboard] Serving stale cached data for ${userEnrollment} during portal token expiry`);
                return reply
                  .header('X-Cache', 'hit')
                  .header('X-Cache-Status', 'stale')
                  .header('X-Session-Status', 'expired')
                  .send({
                    success: true,
                    data,
                    cached: true,
                    stale: true,
                    sessionExpired: true,
                    fetchedAt: staleWrapper.fetchedAt || Date.now(),
                  });
              }
            }
          } catch {
            // Decryption failed or invalid token, proceed to 401
          }
        }

        return reply.status(err.statusCode || 401).send({
          success: false,
          error: err.message || 'Unauthorized',
          code: err.code || 'UNAUTHORIZED',
        });
      }

      // If token renewal succeeded after a dead-token check, serve cached data
      // immediately instead of forcing a cold CampusLynx fetch.
      // Pass refreshCookie=false so we don't overwrite the newly renewed Set-Cookie.
      if (cachedWrapper) {
        const sent = await sendCachedDashboardIfAvailable(
          cachedWrapper,
          enrollment,
          request,
          reply,
          cache,
          fastify.log,
          false
        );
        if (sent) return;
      }

      fastify.log.info(`[Dashboard] Cache miss/expired for ${enrollment}, fetching from CampusLynx portal...`);
      const missKey = enrollment.toUpperCase();
      let dashboardPromise = inFlightMisses.get(missKey);
      if (!dashboardPromise) {
        dashboardPromise = fetchDashboardForIdentity(identity, fastify.log).finally(() => {
          inFlightMisses.delete(missKey);
        });
        inFlightMisses.set(missKey, dashboardPromise);
      }

      const dashboardData = await dashboardPromise;
      if (request.raw.destroyed || reply.raw.writableEnded) {
        return;
      }
      const now = Date.now();

      try {
        await Promise.all([
          cache.set(CACHE_PREFIX, enrollment, { data: dashboardData, fetchedAt: now }, STALE_TTL_SEC),
          cache.set(META_CACHE_PREFIX, enrollment, { fetchedAt: now }, STALE_TTL_SEC),
        ]);
      } catch (error) {
        fastify.log.warn(error, '[Dashboard] Cache write failed');
      }

      return reply
        .header('X-Cache', 'miss')
        .send({
          success: true,
          data: dashboardData,
          cached: false,
          fetchedAt: now,
        });
    } catch (error: any) {
      if (error.statusCode === 401 || error.code === 'SESSION_EXPIRED') {
        return reply.status(401).send({
          success: false,
          error: error.message || 'Session expired. Please log in again.',
          code: 'SESSION_EXPIRED',
        });
      }

      if (enrollment) {
        try {
          const cached = await cache.get<any>(CACHE_PREFIX, enrollment);
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
                fetchedAt: cached.fetchedAt,
              });
          }
        } catch {
          // ignore cache read error
        }
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

      await Promise.all([
        cache.invalidate(CACHE_PREFIX, enrollment),
        cache.invalidate(META_CACHE_PREFIX, enrollment),
      ]);

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

  /**
   * GET /api/dashboard/cache-status
   * Lightweight endpoint polled by the frontend every 60 s.
   * Returns whether a fresh cache entry exists and its remaining TTL.
   */
  fastify.get<{ Querystring: DashboardQuery }>('/api/dashboard/cache-status', async (request, reply) => {
    let identity: PortalSessionIdentity;
    try {
      // This endpoint is polled every 60 s and only reads the cache, so it must
      // not force a CampusLynx token renewal on every heartbeat.
      identity = getCampusLynxIdentity(request);
    } catch {
      return reply.status(401).send({ cached: false, ttl: 0, error: 'Unauthorized' });
    }

    const enrollment = firstString(request.query.enrollment);
    if (!enrollment) {
      return reply.status(400).send({ success: false, error: 'Missing enrollment parameter' });
    }

    if (enrollment.toUpperCase() !== identity.username.toUpperCase()) {
      return reply.status(403).send({ cached: false, ttl: 0, error: 'Forbidden' });
    }

    try {
      const meta = await cache.get<{ fetchedAt: number }>(META_CACHE_PREFIX, enrollment);
      if (meta?.fetchedAt) {
        const ageMs = Date.now() - meta.fetchedAt;
        const ttl = Math.max(0, Math.round((FRESH_TTL_SEC * 1000 - ageMs) / 1000));
        return reply.send({ cached: true, ttl });
      }

      const cached = await cache.get<{ data: DashboardResponse; fetchedAt: number }>(CACHE_PREFIX, enrollment);
      if (!cached) {
        return reply.send({ cached: false, ttl: 0 });
      }

      const ageMs = Date.now() - (cached.fetchedAt ?? 0);
      const ttl = Math.max(0, Math.round((FRESH_TTL_SEC * 1000 - ageMs) / 1000));
      return reply.send({ cached: true, ttl });
    } catch (error) {
      // Best-effort; never let polling errors crash the client
      fastify.log.warn(error, '[Dashboard] cache-status error');
      return reply.send({ cached: false, ttl: 0 });
    }
  });
}
