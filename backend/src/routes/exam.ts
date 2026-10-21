import { FastifyInstance } from "fastify";
import { getOrRenewCampusLynxIdentity } from "./session";
import { createPortalClient } from "../portal/client";
import { fetchExamSchedule } from "../portal/exam";
import { PortalError } from "../portal/types";
import { CacheService } from "../utils/cache";

const EXAM_CACHE_TTL_SEC = 3600; // 1 hour

export async function registerExamRoutes(
  fastify: FastifyInstance,
  cache?: CacheService
): Promise<void> {
  fastify.get("/api/exam", async (request, reply) => {
    let identity;
    try {
      identity = await getOrRenewCampusLynxIdentity(request, reply);
    } catch (err: any) {
      return reply.status(err.statusCode || 401).send({
        success: false,
        error: err.message || "Unauthorized",
        code: err.code || "UNAUTHORIZED",
      });
    }

    const query = request.query as { eventId?: string };
    const effectiveCache = cache || (request as any).globalCache || (fastify as any).globalCache;
    const enrollmentKey = identity.enrollmentno || identity.username;
    const cacheKey = enrollmentKey
      ? `exam_sched:${enrollmentKey}:${query?.eventId || "latest"}`
      : null;

    // Check cached exam schedule
    if (effectiveCache && cacheKey) {
      try {
        const cachedSchedule = await effectiveCache.get("exam", cacheKey);
        if (cachedSchedule) {
          return reply.send({ success: true, data: cachedSchedule, cached: true });
        }
      } catch (err) {
        request.log.warn(err, "[Exam] Cache read failed");
      }
    }

    const client = createPortalClient();
    const transport = {
      postEncrypted: (path: string, payload: Record<string, unknown>) =>
        client.postEncrypted(path, payload, identity),
    };

    let codeToNameMap: Record<string, string> | undefined;

    if (effectiveCache && enrollmentKey) {
      try {
        const cached = await effectiveCache.get("dashboard", enrollmentKey);
        if (cached?.data) {
          codeToNameMap = {};
          if (Array.isArray(cached.data.courses)) {
            for (const c of cached.data.courses) {
              if (c?.code && c?.title) {
                codeToNameMap[String(c.code).trim().toUpperCase()] = String(c.title).trim();
              }
            }
          }
          if (Array.isArray(cached.data.attendance)) {
            for (const a of cached.data.attendance) {
              if (a?.subject && a?.detailLink) {
                const match = String(a.detailLink).match(/code=([^&]+)/);
                if (match && match[1]) {
                  const code = decodeURIComponent(match[1]).trim().toUpperCase();
                  codeToNameMap[code] = String(a.subject).trim();
                }
              }
            }
          }
        }
      } catch {
        // Non-blocking best-effort cache lookup
      }
    }

    try {
      const schedule = await fetchExamSchedule(transport, identity, {
        exameventid: query?.eventId,
        codeToNameMap,
      });

      if (effectiveCache && cacheKey && schedule) {
        try {
          await effectiveCache.set("exam", cacheKey, schedule, EXAM_CACHE_TTL_SEC);
        } catch (err) {
          request.log.warn(err, "[Exam] Cache write failed");
        }
      }

      return reply.send({ success: true, data: schedule, cached: false });
    } catch (error: any) {
      // Fallback to stale cached schedule if available
      if (effectiveCache && cacheKey) {
        try {
          const cachedSchedule = await effectiveCache.get("exam", cacheKey);
          if (cachedSchedule) {
            request.log.warn("[Exam] Upstream failed, returning stale cached schedule");
            return reply.send({ success: true, data: cachedSchedule, cached: true, stale: true });
          }
        } catch {
          // Ignore cache read error
        }
      }

      const status = error instanceof PortalError && error.status === 401 ? 401 : 502;
      request.log.error(error, "[Exam] CampusLynx fetch failed");
      return reply.status(status).send({
        success: false,
        error: error.message || "Failed to fetch exam schedule from portal",
        code: error instanceof PortalError && error.status === 401 ? "SESSION_EXPIRED" : "PORTAL_ERROR",
      });
    } finally {
      client.destroy?.();
    }
  });
}
