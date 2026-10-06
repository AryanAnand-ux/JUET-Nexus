import { FastifyInstance } from 'fastify';
import { getOrRenewCampusLynxIdentity } from './session';
import { createPortalClient } from '../portal/client';
import { fetchAttendanceDetail, parseDetailLink } from '../portal/attendance';
import { PortalError } from '../portal/types';

export async function registerAttendanceRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { link: string; subject: string } }>(
    '/api/attendance/details',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['link', 'subject'],
          properties: {
            link: { type: 'string', minLength: 1 },
            subject: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { link, subject } = request.query;

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
          return reply.status(err.statusCode || 401).send({
            success: false,
            error: err.message || 'Unauthorized',
            code: err.code || 'UNAUTHORIZED',
          });
        }

        const client = createPortalClient();
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
          return reply.send({ success: true, data: detail });
        } catch (error: any) {
          const status = error instanceof PortalError && error.status === 401 ? 401 : 502;
          request.log.error(error, '[AttendanceDetails] CampusLynx fetch failed');
          return reply.status(status).send({
            success: false,
            error:
              status === 401
                ? 'Session expired. Please log in again.'
                : error.message || 'Failed to fetch attendance details',
            code: status === 401 ? 'SESSION_EXPIRED' : 'ATTENDANCE_FETCH_FAILED',
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
