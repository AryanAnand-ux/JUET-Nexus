import { FastifyInstance } from "fastify";
import { getOrRenewCampusLynxIdentity } from "./session";
import { createPortalClient } from "../portal/client";
import { fetchGradeCard } from "../portal/grades";
import { PortalError } from "../portal/types";
import { CacheService } from "../utils/cache";

const GRADES_CACHE_TTL_SEC = 3600; // 1 hour

export async function registerGradesRoutes(
  fastify: FastifyInstance,
  cache?: CacheService
): Promise<void> {
  fastify.get("/api/grades", async (request, reply) => {
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

    const enrollment = identity.enrollmentno;

    // Check cache if available
    if (cache && enrollment) {
      try {
        const cached = await cache.get<any>("grades", enrollment);
        if (cached) {
          return reply.send({ success: true, data: cached, cached: true });
        }
      } catch (err) {
        request.log.warn(err, "[Grades] Cache read failed");
      }
    }

    const client = createPortalClient();
    const transport = {
      postEncrypted: (path: string, payload: Record<string, unknown>) =>
        client.postEncrypted(path, payload, identity),
    };

    try {
      const grades = await fetchGradeCard(transport, identity);

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
    }
  });
}
