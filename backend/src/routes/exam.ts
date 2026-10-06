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

    try {
      const schedule = await fetchExamSchedule(transport, identity);
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
