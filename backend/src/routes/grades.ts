import { FastifyInstance } from "fastify";
import {
  extractEncryptedSession,
  getCampusLynxIdentity,
  getOrRenewCampusLynxIdentity,
  isPortalTokenDead,
  setAuthCookie,
} from "./session";
import { createPortalClient, getSharedPortalClient } from "../portal/client";
import { fetchGradeCard } from "../portal/grades";
import { PortalError } from "../portal/types";
import { CacheService } from "../utils/cache";
import { decryptSessionData } from "../utils/encryption";

const GRADES_CACHE_TTL_SEC = 3600; // 1 hour
const inFlightGrades = new Map<string, Promise<any>>();

export async function registerGradesRoutes(
  fastify: FastifyInstance,
  cache?: CacheService
): Promise<void> {
  fastify.get("/api/grades", async (request, reply) => {
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
    const localEnrollment = localIdentity.enrollmentno;

    // Check cache BEFORE calling getOrRenewCampusLynxIdentity so cache hits
    // never stall behind an upstream refreshTokenRequest round-trip.
    let cachedGrades: any = null;
    if (cache && localEnrollment) {
      try {
        cachedGrades = await cache.get<any>("grades", localEnrollment);
        if (cachedGrades && !isPortalTokenDead(localIdentity)) {
          const encryptedSession = extractEncryptedSession(request);
          if (encryptedSession) setAuthCookie(reply, encryptedSession);
          return reply.send({ success: true, data: cachedGrades, cached: true });
        }
      } catch (err) {
        request.log.warn(err, "[Grades] Cache read failed");
      }
    }

    let identity;
    try {
      identity = await getOrRenewCampusLynxIdentity(request, reply);
    } catch (err: any) {
      const encryptedSession = extractEncryptedSession(request);
      if (encryptedSession && cache) {
        try {
          const session = decryptSessionData(encryptedSession);
          const userEnrollment = session.campusLynx?.enrollmentno || session.enrollment;
          if (userEnrollment) {
            const cached = await cache.get<any>("grades", userEnrollment);
            if (cached) {
              return reply.send({ success: true, data: cached, cached: true, stale: true });
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

    if (cachedGrades) {
      return reply.send({ success: true, data: cachedGrades, cached: true });
    }

    const enrollment = identity.enrollmentno;
    const shared = typeof getSharedPortalClient === "function" ? getSharedPortalClient() : null;
    const client = shared || createPortalClient();
    const transport = {
      postEncrypted: (path: string, payload: Record<string, unknown>) =>
        client.postEncrypted(path, payload, identity),
    };

    try {
      let grades;
      if (enrollment) {
        let pending = inFlightGrades.get(enrollment);
        if (!pending) {
          pending = fetchGradeCard(transport, identity).finally(() => {
            inFlightGrades.delete(enrollment);
          });
          inFlightGrades.set(enrollment, pending);
        }
        grades = await pending;
      } else {
        grades = await fetchGradeCard(transport, identity);
      }

      if (request.raw.destroyed || reply.raw.writableEnded) {
        return;
      }

      if (cache && enrollment && grades.length > 0) {
        try {
          await cache.set("grades", enrollment, grades, GRADES_CACHE_TTL_SEC);
        } catch (err) {
          request.log.warn(err, "[Grades] Cache write failed");
        }
      }

      return reply.send({ success: true, data: grades, cached: false });
    } catch (error: any) {
      const status = error instanceof PortalError && error.status === 401 ? 401 : 502;
      request.log.error(error, "[Grades] CampusLynx fetch failed");
      return reply.status(status).send({
        success: false,
        error: error.message || "Failed to fetch grade card from portal",
        code: error instanceof PortalError && error.status === 401 ? "SESSION_EXPIRED" : "PORTAL_ERROR",
      });
    } finally {
      if (!shared && typeof client.destroy === "function") {
        client.destroy();
      }
    }
  });
}
