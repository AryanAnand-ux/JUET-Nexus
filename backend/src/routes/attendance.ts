import { FastifyInstance } from 'fastify';
import axios from '../utils/axios';
import { parseAttendanceDetails } from '../parsers/attendanceDetails';
import { getValidSession } from './session';
import { getRandomUserAgent } from '../utils/userAgent';
import type { AttendanceDetailsResponse } from '../../../shared/types';

const WEBKIOSK_URL =
  process.env.WEBKIOSK_URL ||
  process.env.WEBKIOSK_BASE_URL ||
  'https://webkiosk.juet.ac.in';

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
        let jsessionid: string;
        try {
          jsessionid = await getValidSession(request, reply);
        } catch (err: any) {
          return reply.status(err.statusCode || 401).send({
            success: false,
            error: err.message || 'Unauthorized',
            code: err.code || 'UNAUTHORIZED',
          });
        }

        const { link, subject } = request.query;

        if (!link || !subject) {
          return reply.status(400).send({
            success: false,
            error: 'Missing link or subject parameter',
            code: 'BAD_REQUEST',
          });
        }

        if (link.startsWith('http') || link.startsWith('//')) {
          try {
            const parsedUrl = new URL(link, WEBKIOSK_URL);
            const parsedBase = new URL(WEBKIOSK_URL);
            if (parsedUrl.origin !== parsedBase.origin) {
              return reply.status(400).send({
                success: false,
                error: 'Cross-origin URLs are not allowed',
                code: 'BAD_REQUEST',
              });
            }
          } catch (e) {
            return reply.status(400).send({
              success: false,
              error: 'Invalid URL format',
              code: 'BAD_REQUEST',
            });
          }
        }

        // Validate that the link is actually a WebKiosk attendance page
        if (
          !link.includes('ViewDatewiseLecAttendance.jsp') &&
          !link.includes('StudentAttendanceDetails.jsp') &&
          !link.includes('StudentFiles/Academic')
        ) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid link',
            code: 'BAD_REQUEST',
          });
        }

        // Construct full URL. The link is relative to StudentFiles/Academic/
        let url: string;
        if (link.startsWith('http')) {
          url = link;
        } else if (link.startsWith('/')) {
          url = `${WEBKIOSK_URL}${link}`;
        } else {
          url = `${WEBKIOSK_URL}/StudentFiles/Academic/${link}`;
        }

        fastify.log.info(`[AttendanceDetails] Fetching details for ${subject} at ${url}`);

        const resp = await axios.get(url, {
          timeout: 20000,
          maxRedirects: 5,
          validateStatus: () => true,
          headers: {
            Cookie: `JSESSIONID=${jsessionid}`,
            'User-Agent': getRandomUserAgent(),
            Referer: `${WEBKIOSK_URL}/StudentFiles/Academic/StudentAttendanceList.jsp`,
          },
        });

        const html = typeof resp.data === 'string' ? resp.data : '';

        fastify.log.info(`[AttendanceDetails] Response status=${resp.status}, HTML length=${html.length}`);

        // Check for session timeout
        if (
          html.includes('Session timeout') ||
          (html.includes('Please') && html.includes('Login')) ||
          html.length < 100
        ) {
          fastify.log.warn('[AttendanceDetails] Session expired');
          return reply.status(401).send({
            success: false,
            error: 'Session expired. Please log in again.',
            code: 'SESSION_EXPIRED',
          });
        }

        // Parse HTML
        const logs = parseAttendanceDetails(html);
        fastify.log.info(`[AttendanceDetails] Parsed ${logs.length} log entries`);

        // Calculate counts
        const classesHeld = logs.length;
        const classesAttended = logs.filter((l) => l.status === 'Present').length;
        const percentage = classesHeld > 0 ? (classesAttended / classesHeld) * 100 : 0;

        const responseData: AttendanceDetailsResponse = {
          subject,
          classesHeld,
          classesAttended,
          percentage: Math.round(percentage * 10) / 10,
          logs,
        };

        return reply.send({
          success: true,
          data: responseData,
        });
      } catch (error: any) {
        fastify.log.error(error, '[AttendanceDetails] Failed to fetch details');
        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch attendance details',
        });
      }
    }
  );
}
