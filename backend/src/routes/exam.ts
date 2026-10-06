import { FastifyInstance } from "fastify";
import { getOrRenewCampusLynxIdentity } from "./session";
import { createPortalClient } from "../portal/client";
import { fetchExamSchedule } from "../portal/exam";
import { PortalError } from "../portal/types";

export async function registerExamRoutes(fastify: FastifyInstance): Promise<void> {
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

    const client = createPortalClient();
    const transport = {
      postEncrypted: (path: string, payload: Record<string, unknown>) =>
        client.postEncrypted(path, payload, identity),
    };

    const query = request.query as { eventId?: string };

    const cache = (request as any).globalCache || (fastify as any).globalCache;
    let codeToNameMap: Record<string, string> | undefined;

    const enrollmentKey = identity.enrollmentno || identity.username;
    if (cache && enrollmentKey) {
      try {
        const cached = await cache.get("dashboard", enrollmentKey);
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
      return reply.send({ success: true, data: schedule });
    } catch (error: any) {
      const status = error instanceof PortalError && error.status === 401 ? 401 : 502;
      request.log.error(error, "[Exam] CampusLynx fetch failed");
      return reply.status(status).send({
        success: false,
        error: error.message || "Failed to fetch exam schedule from portal",
        code: error instanceof PortalError && error.status === 401 ? "SESSION_EXPIRED" : "PORTAL_ERROR",
      });
    }
  });
}
