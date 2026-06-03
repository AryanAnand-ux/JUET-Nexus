import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { parseAttendanceDetails } from '../parsers/attendanceDetails';
import { decryptSession } from '../utils/encryption';
import type { AttendanceDetailsResponse } from '../../../shared/types';

const WEBKIOSK_URL =
  process.env.WEBKIOSK_URL ||
  process.env.WEBKIOSK_BASE_URL ||
  'https://webkiosk.juet.ac.in';

export async function registerAttendanceRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { link: string; subject: string } }>(
    '/api/attendance/details',
    async (request, reply) => {
      try {
        const encryptedSession = request.cookies.auth;

        if (!encryptedSession) {
          return reply.status(401).send({
            success: false,
            error: 'Not authenticated',
            code: 'NO_SESSION',
          });
        }

        let jsessionid: string;
        try {
          jsessionid = decryptSession(encryptedSession);
        } catch (error) {
          fastify.log.warn(error, '[AttendanceDetails] Decryption failed');
          return reply.status(401).send({
            success: false,
            error: 'Unauthorized: Invalid session',
            code: 'INVALID_SESSION',
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
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
