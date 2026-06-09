/**
 * Dashboard API Routes
 * GET /api/dashboard - Fetch and cache student dashboard data
 *
 * WebKiosk Architecture:
 *   /StudentFiles/StudentPage.jsp           → Frameset (3 frames)
 *   /StudentFiles/FrameLeftStudent.jsp       → Left sidebar menu
 *   /CommonFiles/TopTitle.jsp                → Header with student name
 *   /StudentFiles/PersonalFiles/ShowAlertMessageSTUD.jsp → Notices + welcome
 *   /StudentFiles/Academic/StudentAttendanceList.jsp     → Attendance data
 *   /StudentFiles/Exam/StudentEventMarksView.jsp        → Exam marks
 *   /StudentFiles/Exam/StudCGPAReport.jsp               → SGPA/CGPA
 */

import { FastifyInstance } from 'fastify';
import axios from '../utils/axios';
import { parseDashboard } from '../parsers/dashboard';
import { CacheService } from '../utils/cache';
import { getValidSession } from './session';
import { decryptSessionData } from '../utils/encryption';
import type { DashboardResponse } from '../../../shared/types';

const WEBKIOSK_URL =
  process.env.WEBKIOSK_URL ||
  process.env.WEBKIOSK_BASE_URL ||
  'https://webkiosk.juet.ac.in';

// The individual frame pages that contain the actual data
const PAGES = {
  main:       '/StudentFiles/PersonalFiles/ShowAlertMessageSTUD.jsp',
  attendance: '/StudentFiles/Academic/StudentAttendanceList.jsp',
  marks:      '/StudentFiles/Exam/StudentEventMarksView.jsp',
  cgpa:       '/StudentFiles/Exam/StudCGPAReport.jsp',
  courses:    '/StudentFiles/Academic/StudentRegistredSubjectList.jsp',
};

interface DashboardQuery {
  enrollment?: string;
}

function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

/** Fetch a single WebKiosk page with the given JSESSIONID */
async function fetchWebKioskPage(
  path: string,
  jsessionid: string,
  query?: Record<string, string>
): Promise<string> {
  let url = `${WEBKIOSK_URL}${path}`;
  if (query) {
    const params = new URLSearchParams(query).toString();
    url += `?${params}`;
  }
  const resp = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      Cookie: `JSESSIONID=${jsessionid}`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: `${WEBKIOSK_URL}/StudentFiles/StudentPage.jsp`,
    },
  });
  return typeof resp.data === 'string' ? resp.data : '';
}

export async function registerDashboardRoutes(
  fastify: FastifyInstance,
  cache: CacheService
) {
  /**
   * GET /api/dashboard
   *
   * Fetches multiple WebKiosk frame pages in parallel, concatenates the HTML,
   * parses it into structured JSON, and caches the result.
   */
  fastify.get<{ Querystring: DashboardQuery }>('/api/dashboard', async (request, reply) => {
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

      const enrollment =
        firstString(request.query.enrollment) ||
        firstString(request.headers['x-enrollment']);

      if (!enrollment) {
        return reply.status(400).send({
          success: false,
          error: 'Missing enrollment number',
          code: 'MISSING_ENROLLMENT',
        });
      }

      const encryptedSession = request.cookies.auth;
      if (encryptedSession) {
        const session = decryptSessionData(encryptedSession);
        const enrollmentFromSession = session.enrollment;
        if (enrollment && enrollment !== enrollmentFromSession) {
          return reply.status(403).send({
            success: false,
            error: 'Forbidden: You cannot access data for another enrollment',
            code: 'FORBIDDEN',
          });
        }
      }

      // Check cache
      fastify.log.info(`[Dashboard] Checking cache for ${enrollment}`);
      const cached = await cache.get<DashboardResponse>('dashboard', enrollment);

      if (cached) {
        fastify.log.info(`[Dashboard] Cache hit for ${enrollment}`);
        const ttl = await cache.getTTL('dashboard', enrollment);
        return reply
          .header('X-Cache', 'hit')
          .header('X-Cache-TTL', ttl.toString())
          .send({
            success: true,
            data: cached,
            cached: true,
            ttl,
          });
      }

      fastify.log.info(`[Dashboard] Cache miss for ${enrollment}, fetching from WebKiosk...`);

      // ----------------------------------------------------------------
      // Phase 1: Fetch main page + attendance/marks (to discover exam codes)
      //          + CGPA (which doesn't need exam code) — 4 requests parallel
      // ----------------------------------------------------------------
      let mainHtml: string, attendanceHtml: string, marksHtml: string, cgpaHtml: string, coursesHtml: string;

      try {
        // Phase 1: Get exam codes from attendance page + other data
        const phase1 = await Promise.allSettled([
          fetchWebKioskPage(PAGES.main, jsessionid),
          fetchWebKioskPage(PAGES.attendance, jsessionid),
          fetchWebKioskPage(PAGES.marks, jsessionid),
          fetchWebKioskPage(PAGES.cgpa, jsessionid),
          fetchWebKioskPage(PAGES.courses, jsessionid),
        ]);

        const mainRejected = phase1[0].status === 'rejected';
        const attendanceRejected = phase1[1].status === 'rejected';
        if (mainRejected || attendanceRejected) {
          const errorReason = (phase1[0].status === 'rejected' ? (phase1[0] as PromiseRejectedResult).reason : (phase1[1] as PromiseRejectedResult).reason) || new Error('Network error');
          throw errorReason;
        }

        mainHtml = phase1[0].status === 'fulfilled' ? phase1[0].value : '';
        const attendanceInitHtml = phase1[1].status === 'fulfilled' ? phase1[1].value : '';
        const marksInitHtml = phase1[2].status === 'fulfilled' ? phase1[2].value : '';
        cgpaHtml = phase1[3].status === 'fulfilled' ? phase1[3].value : '';
        coursesHtml = phase1[4].status === 'fulfilled' ? phase1[4].value : '';

        // Check for session timeout
        const allHtml = mainHtml + attendanceInitHtml;
        const isSessionDead =
          allHtml.includes('Session timeout') ||
          (allHtml.includes('Please') && allHtml.includes('Login')) ||
          (mainHtml.length < 100 && attendanceInitHtml.length < 100);

        if (isSessionDead) {
          fastify.log.warn('[Dashboard] Session expired');
          return reply.status(401).send({
            success: false,
            error: 'Session expired. Please log in again.',
            code: 'SESSION_EXPIRED',
          });
        }

        // Phase 2: Extract the latest exam code from the <select> dropdown
        // and re-fetch attendance + marks WITH the exam code selected
        const examCodeMatch = attendanceInitHtml.match(
          /<option\s[^>]*value\s*=\s*['"]?([\dA-Z]+(?:EVESEM|ODDSEM))['"]?/i
        ) || marksInitHtml.match(
          /<option\s[^>]*value\s*=\s*['"]?([\dA-Z]+(?:EVESEM|ODDSEM))['"]?/i
        );

        const examCode = examCodeMatch?.[1];

        if (examCode) {
          fastify.log.info(`[Dashboard] Found exam code: ${examCode}, fetching data with form params...`);

          // WebKiosk form includes a hidden 'x' field that must be sent.
          // The RefreshContents() JS function sets x='ddd' before submitting.
          const phase2 = await Promise.allSettled([
            fetchWebKioskPage(PAGES.attendance, jsessionid, { x: 'ddd', exam: examCode }),
            fetchWebKioskPage(PAGES.marks, jsessionid, { x: 'ddd', exam: examCode }),
          ]);

          const attnResult = phase2[0].status === 'fulfilled' ? phase2[0].value : '';
          const marksResult = phase2[1].status === 'fulfilled' ? phase2[1].value : '';

          fastify.log.info(
            `[Dashboard] Phase 2 results: attendance=${attnResult.length}b, marks=${marksResult.length}b`
          );

          // Only use Phase 2 result if it's larger (has data)
          attendanceHtml = attnResult.length > attendanceInitHtml.length ? attnResult : attendanceInitHtml;
          marksHtml = marksResult.length > marksInitHtml.length ? marksResult : marksInitHtml;
        } else {
          fastify.log.warn('[Dashboard] No exam code found in dropdowns');
          attendanceHtml = attendanceInitHtml;
          marksHtml = marksInitHtml;
        }

        fastify.log.info(
          `[Dashboard] Fetched pages: main=${mainHtml.length}b, attendance=${attendanceHtml.length}b, marks=${marksHtml.length}b, cgpa=${cgpaHtml.length}b, courses=${coursesHtml.length}b`
        );
      } catch (error: any) {
        fastify.log.error(error, '[Dashboard] WebKiosk fetch failed');
        return reply.status(502).send({
          success: false,
          error: 'Failed to fetch dashboard data from WebKiosk',
          code: 'FETCH_FAILED',
        });
      }

      // ----------------------------------------------------------------
      // Combine all HTML and parse into structured data
      // ----------------------------------------------------------------
      // We concatenate the HTML from all pages so the parser can find
      // tables from each page. Each page has unique table structures.
      const combinedHtml = [
        '<!-- PAGE: main -->', mainHtml,
        '<!-- PAGE: attendance -->', attendanceHtml,
        '<!-- PAGE: marks -->', marksHtml,
        '<!-- PAGE: cgpa -->', cgpaHtml,
        '<!-- PAGE: courses -->', coursesHtml,
      ].join('\n');

      let dashboardData: DashboardResponse;
      try {
        dashboardData = parseDashboard(combinedHtml);
      } catch (error) {
        fastify.log.error(error, '[Dashboard] Parsing failed');
        return reply.status(500).send({
          success: false,
          error: 'Failed to parse dashboard data',
          code: 'PARSE_ERROR',
        });
      }

      // Cache the result
      try {
        await cache.set('dashboard', enrollment, dashboardData, 15 * 60);
      } catch (error) {
        fastify.log.warn(error, '[Dashboard] Cache write failed');
      }

      return reply
        .header('X-Cache', 'miss')
        .send({
          success: true,
          data: dashboardData,
          cached: false,
        });
    } catch (error) {
      fastify.log.error(error, '[Dashboard] Unhandled error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  /**
   * GET /api/dashboard/invalidate
   */
  fastify.get<{ Querystring: DashboardQuery }>('/api/dashboard/invalidate', async (request, reply) => {
    try {
      try {
        await getValidSession(request, reply);
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

      const encryptedSession = request.cookies.auth;
      if (encryptedSession) {
        const session = decryptSessionData(encryptedSession);
        const enrollmentFromSession = session.enrollment;
        if (enrollment !== enrollmentFromSession) {
          return reply.status(403).send({
            success: false,
            error: 'Forbidden: You cannot access data for another enrollment',
            code: 'FORBIDDEN',
          });
        }
      }

      await cache.invalidate('dashboard', enrollment);

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
   */
  fastify.get<{ Querystring: DashboardQuery }>('/api/dashboard/cache-status', async (request, reply) => {
    try {
      try {
        await getValidSession(request, reply);
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

      const encryptedSession = request.cookies.auth;
      if (encryptedSession) {
        const session = decryptSessionData(encryptedSession);
        const enrollmentFromSession = session.enrollment;
        if (enrollment !== enrollmentFromSession) {
          return reply.status(403).send({
            success: false,
            error: 'Forbidden: You cannot access data for another enrollment',
            code: 'FORBIDDEN',
          });
        }
      }

      const isValid = await cache.isValid('dashboard', enrollment);
      const ttl = await cache.getTTL('dashboard', enrollment);

      return reply.send({
        success: true,
        enrollment,
        cached: isValid,
        ttl,
      });
    } catch (error) {
      fastify.log.error(error, '[Dashboard] Cache status error');
      return reply.status(500).send({
        success: false,
        error: 'Failed to check cache status',
      });
    }
  });

  /**
   * GET /api/dashboard/raw   [DEVELOPMENT ONLY]
   * Returns the raw HTML from each WebKiosk frame page for parser debugging.
   */
  fastify.get('/api/dashboard/raw', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(404).send({ error: 'Not found' });
    }

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

    try {
      const [mainHtml, attendanceHtml, marksHtml, cgpaHtml, coursesHtml] = await Promise.all([
        fetchWebKioskPage(PAGES.main, jsessionid),
        fetchWebKioskPage(PAGES.attendance, jsessionid),
        fetchWebKioskPage(PAGES.marks, jsessionid),
        fetchWebKioskPage(PAGES.cgpa, jsessionid),
        fetchWebKioskPage(PAGES.courses, jsessionid),
      ]);

      return reply.send({
        pages: {
          main: { length: mainHtml.length, preview: mainHtml.slice(0, 3000) },
          attendance: { length: attendanceHtml.length, preview: attendanceHtml.slice(0, 3000) },
          marks: { length: marksHtml.length, preview: marksHtml.slice(0, 3000) },
          cgpa: { length: cgpaHtml.length, preview: cgpaHtml.slice(0, 3000) },
          courses: { length: coursesHtml.length, preview: coursesHtml.slice(0, 3000) },
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}
