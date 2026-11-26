import { FastifyInstance } from "fastify";
import {
  extractEncryptedSession,
  getCampusLynxIdentity,
  getOrRenewCampusLynxIdentity,
  isPortalTokenDead,
  setAuthCookie,
} from "./session";
import { decryptSessionData } from "../utils/encryption";
import { createPortalClient, getSharedPortalClient } from "../portal/client";
import { fetchExamSchedule } from "../portal/exam";
import { PortalError } from "../portal/types";
import { CacheService } from "../utils/cache";

const EXAM_CACHE_TTL_SEC = 3600; // 1 hour
const inFlightExam = new Map<string, Promise<any>>();

export async function registerExamRoutes(
  fastify: FastifyInstance,
  cache?: CacheService
): Promise<void> {
  fastify.get("/api/exam", async (request, reply) => {
    const query = request.query as { eventId?: string };
    const effectiveCache = cache || (request as any).globalCache || (fastify as any).globalCache;

    let localIdentity;
    try {
      localIdentity = getCampusLynxIdentity(request);
    } catch (err: any) {
      return reply.status(err.statusCode || 401).send({
        success: false,
        error: err.message || "Unauthorized",
        code: err.code || "UNAUTHORIZED",
      });
    }

    const enrollmentKey = localIdentity.enrollmentno || localIdentity.username;
    const cacheKey = enrollmentKey
      ? `exam_sched:${enrollmentKey}:${query?.eventId || "latest"}`
      : null;

    // Check cached exam schedule BEFORE calling getOrRenewCampusLynxIdentity
    let cachedSchedule: any = null;
    if (effectiveCache && cacheKey) {
      try {
        cachedSchedule = await effectiveCache.get("exam", cacheKey);
        if (cachedSchedule && !isPortalTokenDead(localIdentity)) {
          const encryptedSession = extractEncryptedSession(request);
          if (encryptedSession) setAuthCookie(reply, encryptedSession);
          return reply.send({ success: true, data: cachedSchedule, cached: true });
        }
      } catch (err) {
        request.log.warn(err, "[Exam] Cache read failed");
      }
    }

    let identity;
    try {
      identity = await getOrRenewCampusLynxIdentity(request, reply);
    } catch (err: any) {
      const encryptedSession = extractEncryptedSession(request);
      if (encryptedSession && effectiveCache) {
        try {
          const session = decryptSessionData(encryptedSession);
          const userEnrollment = session.campusLynx?.enrollmentno || session.enrollment;
          const staleKey = userEnrollment
            ? `exam_sched:${userEnrollment}:${query?.eventId || "latest"}`
            : null;
          if (staleKey) {
            const staleSchedule = await effectiveCache.get("exam", staleKey);
            if (staleSchedule) {
              return reply.send({
                success: true,
                data: staleSchedule,
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
        error: err.message || "Unauthorized",
        code: err.code || "UNAUTHORIZED",
      });
    }

    if (cachedSchedule) {
      return reply.send({ success: true, data: cachedSchedule, cached: true });
    }

    const shared = typeof getSharedPortalClient === "function" ? getSharedPortalClient() : null;
    const client = shared || createPortalClient();
    const transport = {
      postEncrypted: (path: string, payload: Record<string, unknown>) =>
        client.postEncrypted(path, payload, identity),
    };

    let codeToNameMap: Record<string, string> | undefined;
    let cachedMetadata: any = null;
    const metaKey = enrollmentKey ? `exam_meta:${enrollmentKey}` : null;

    if (effectiveCache && enrollmentKey) {
      try {
        const [cached, meta] = await Promise.all([
          effectiveCache.get("dashboard", enrollmentKey),
          query?.eventId && metaKey ? effectiveCache.get("exam_meta", metaKey) : Promise.resolve(null),
        ]);
        cachedMetadata = meta || null;
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

    const runFetch = () =>
      fetchExamSchedule(transport, identity, {
        exameventid: query?.eventId,
        codeToNameMap,
        cachedMetadata,
        onMetadataResolved: (meta) => {
          if (effectiveCache && metaKey) {
            effectiveCache.set("exam_meta", metaKey, meta, EXAM_CACHE_TTL_SEC).catch(() => {});
          }
        },
      });

    try {
      let schedule;
      if (cacheKey) {
        let pending = inFlightExam.get(cacheKey);
        if (!pending) {
          pending = runFetch().finally(() => {
            inFlightExam.delete(cacheKey);
          });
          inFlightExam.set(cacheKey, pending);
        }
        schedule = await pending;
      } else {
        schedule = await runFetch();
      }

      if (request.raw.destroyed || reply.raw.writableEnded) {
        return;
      }

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
      if (!shared && typeof client.destroy === "function") {
        client.destroy();
      }
    }
  });
}
