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
import { getRandomUserAgent } from '../utils/userAgent';
import { withJitter } from '../utils/delay';
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
      'User-Agent': getRandomUserAgent(),
      Referer: `${WEBKIOSK_URL}/StudentFiles/StudentPage.jsp`,
    },
  });
  return typeof resp.data === 'string' ? resp.data : '';
}

const FRESH_TTL_SEC = 300; // 5 minutes
const STALE_TTL_SEC = 7200; // 2 hours
const activeRefreshes = new Set<string>();

export async function fetchAndParseDashboard(
  jsessionid: string,
  enrollment: string,
  log: any
): Promise<DashboardResponse> {
  // Phase 1: Get exam codes from attendance page + other data
  // Stagger requests with random jitter
  const phase1 = await Promise.allSettled([
    fetchWebKioskPage(PAGES.main, jsessionid),
    withJitter(() => fetchWebKioskPage(PAGES.attendance, jsessionid), 100, 350),
    withJitter(() => fetchWebKioskPage(PAGES.marks, jsessionid), 200, 500),
    withJitter(() => fetchWebKioskPage(PAGES.cgpa, jsessionid), 300, 650),
    withJitter(() => fetchWebKioskPage(PAGES.courses, jsessionid), 450, 800)
  ]);

  const mainRejected = phase1[0].status === 'rejected';
  const attendanceRejected = phase1[1].status === 'rejected';
  if (mainRejected || attendanceRejected) {
    const errorReason =
      (phase1[0].status === 'rejected' ? (phase1[0] as PromiseRejectedResult).reason : (phase1[1] as PromiseRejectedResult).reason) ||
      new Error('Network error');
    throw errorReason;
  }

  const mainHtml = phase1[0].status === 'fulfilled' ? phase1[0].value : '';
  const attendanceInitHtml = phase1[1].status === 'fulfilled' ? phase1[1].value : '';
  const marksInitHtml = phase1[2].status === 'fulfilled' ? phase1[2].value : '';
  const cgpaHtml = phase1[3].status === 'fulfilled' ? phase1[3].value : '';
  const coursesHtml = phase1[4].status === 'fulfilled' ? phase1[4].value : '';

  // Check for session timeout
  const allHtml = mainHtml + attendanceInitHtml;
  const isSessionDead =
    allHtml.includes('Session timeout') ||
    (allHtml.includes('Please') && allHtml.includes('Login')) ||
    (mainHtml.length < 100 && attendanceInitHtml.length < 100);

  if (isSessionDead) {
    throw { statusCode: 401, message: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' };
  }

  // Phase 2: Extract the latest exam code from the <select> dropdown
  const examCodeMatch =
    attendanceInitHtml.match(/<option\s[^>]*value\s*=\s*['"]?([\dA-Z]+(?:EVESEM|ODDSEM))['"]?/i) ||
    marksInitHtml.match(/<option\s[^>]*value\s*=\s*['"]?([\dA-Z]+(?:EVESEM|ODDSEM))['"]?/i);

  const examCode = examCodeMatch?.[1];
  let attendanceHtml = attendanceInitHtml;
  let marksHtml = marksInitHtml;

  if (examCode) {
    log.info(`[Dashboard] Found exam code: ${examCode}, fetching data with form params...`);
    const phase2 = await Promise.allSettled([
      withJitter(() => fetchWebKioskPage(PAGES.attendance, jsessionid, { x: 'ddd', exam: examCode }), 100, 300),
      withJitter(() => fetchWebKioskPage(PAGES.marks, jsessionid, { x: 'ddd', exam: examCode }), 200, 500)
    ]);

    const attnResult = phase2[0].status === 'fulfilled' ? phase2[0].value : '';
    const marksResult = phase2[1].status === 'fulfilled' ? phase2[1].value : '';

    if (attnResult.length > attendanceInitHtml.length) attendanceHtml = attnResult;
    if (marksResult.length > marksInitHtml.length) marksHtml = marksResult;
  }

  const combinedHtml = [
    '<!-- PAGE: main -->', mainHtml,
    '<!-- PAGE: attendance -->', attendanceHtml,
    '<!-- PAGE: marks -->', marksHtml,
    '<!-- PAGE: cgpa -->', cgpaHtml,
    '<!-- PAGE: courses -->', coursesHtml,
  ].join('\n');

  return parseDashboard(combinedHtml);
}

async function triggerBackgroundRefresh(
  enrollment: string,
  request: any,
  cache: CacheService
): Promise<void> {
  if (activeRefreshes.has(enrollment)) return;
  activeRefreshes.add(enrollment);

  try {
    request.log.info(`[Dashboard SWR] Starting background refresh for ${enrollment}`);

    // Create a mock reply object to catch cookie updates
    const mockReply = {
      setCookie: (name: string, value: string, opts?: any) => {
        request.log.info(`[Dashboard SWR] Cookie '${name}' updated in background`);
      },
      clearCookie: (name: string, opts?: any) => {
        request.log.warn(`[Dashboard SWR] Cookie '${name}' cleared in background`);
      },
    } as any;

    const jsessionid = await getValidSession(request, mockReply);
    const dashboardData = await fetchAndParseDashboard(jsessionid, enrollment, request.log);

    // Cache the updated result wrapper
    await cache.set('dashboard', enrollment, { data: dashboardData, fetchedAt: Date.now() }, STALE_TTL_SEC);
    request.log.info(`[Dashboard SWR] Background refresh successful for ${enrollment}`);
  } catch (err: any) {
    request.log.error(err, `[Dashboard SWR] Background refresh failed for ${enrollment}`);
  } finally {
    activeRefreshes.delete(enrollment);
  }
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

      // Check cache with SWR support
      fastify.log.info(`[Dashboard] Checking cache for ${enrollment}`);
      const cachedWrapper = await cache.get<any>('dashboard', enrollment);

      if (cachedWrapper) {
        // Support both old direct format and new SWR wrapper format
        const data = cachedWrapper.data ? cachedWrapper.data : cachedWrapper;
        const fetchedAt = cachedWrapper.fetchedAt || (Date.now() - (FRESH_TTL_SEC + 1) * 1000);

        const ageSec = (Date.now() - fetchedAt) / 1000;

        if (ageSec <= FRESH_TTL_SEC) {
          fastify.log.info(`[Dashboard] Fresh cache hit for ${enrollment} (age: ${Math.round(ageSec)}s)`);
          const ttl = await cache.getTTL('dashboard', enrollment);
          return reply
            .header('X-Cache', 'hit')
            .header('X-Cache-Status', 'fresh')
            .header('X-Cache-TTL', ttl.toString())
            .send({
              success: true,
              data,
              cached: true,
              ttl,
            });
        }

        if (ageSec <= STALE_TTL_SEC) {
          fastify.log.info(`[Dashboard] Stale cache hit for ${enrollment} (age: ${Math.round(ageSec)}s), triggering background refresh...`);
          triggerBackgroundRefresh(enrollment, request, cache).catch((err) => {
            request.log.error(err, `[Dashboard] Background refresh trigger failed for ${enrollment}`);
          });

          const ttl = await cache.getTTL('dashboard', enrollment);
          return reply
            .header('X-Cache', 'hit')
            .header('X-Cache-Status', 'stale')
            .header('X-Cache-TTL', ttl.toString())
            .send({
              success: true,
              data,
              cached: true,
              ttl,
            });
        }

        fastify.log.info(`[Dashboard] Cache entry is too old for ${enrollment} (age: ${Math.round(ageSec)}s), fetching synchronously...`);
      }

      fastify.log.info(`[Dashboard] Cache miss/expired for ${enrollment}, fetching from WebKiosk...`);

      const dashboardData = await fetchAndParseDashboard(jsessionid, enrollment, fastify.log);

      // Cache the result in new wrapper format
      try {
        await cache.set('dashboard', enrollment, { data: dashboardData, fetchedAt: Date.now() }, STALE_TTL_SEC);
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
    } catch (error: any) {
      if (error.statusCode === 401 || error.code === 'SESSION_EXPIRED') {
        return reply.status(401).send({
          success: false,
          error: error.message || 'Session expired. Please log in again.',
          code: 'SESSION_EXPIRED',
        });
      }

      fastify.log.error(error, '[Dashboard] Unhandled error');
      return reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
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
