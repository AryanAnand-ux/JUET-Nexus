/**
 * Fastify server entry point.
 * Registers auth routes, dashboard routes, CORS, cookies, and Redis-backed cache.
 */

import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { registerAuthRoutes } from './routes/auth';
import { registerDashboardRoutes } from './routes/dashboard';
import { registerAttendanceRoutes } from './routes/attendance';
import { registerExamRoutes } from './routes/exam';
import { registerGradesRoutes } from './routes/grades';
import { registerNotificationRoutes } from './routes/notifications';
import { CacheService } from './utils/cache';
import { validateKey } from './utils/encryption';
import { assertKnownProvider } from './utils/provider';
import { checkAcademicUpdates } from './utils/pushWorker';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
// Support comma-separated list: e.g. "https://juetnexus.vercel.app,https://juet-nexus-frontend.vercel.app"
const CORS_ORIGINS: string[] = (
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Validate critical env vars at startup
try {
  validateKey(process.env.ENCRYPTION_KEY);
  assertKnownProvider();
} catch (error: any) {
  console.error(`[Server] Boot failed: ${error.message}`);
  process.exit(1);
}

function getRedisUrl(): string | undefined {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const host = process.env.REDIS_HOST;
  if (!host) return undefined;

  const port = process.env.REDIS_PORT || '6379';
  const db = process.env.REDIS_DB || '0';
  return `redis://${host}:${port}/${db}`;
}

export async function createServer() {
  const fastify = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
              },
            },
    },
    // Reject request bodies larger than 1 MB to prevent memory exhaustion.
    bodyLimit: 1 * 1024 * 1024,
  });

  const globalCache = new CacheService(getRedisUrl());

  await fastify.register(fastifyCookie);
  await fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) {
        return cb(null, true);
      }
      if (
        CORS_ORIGINS.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return cb(null, true);
      }
      if (process.env.NODE_ENV !== 'production') {
        if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
          return cb(null, true);
        }
      }
      return cb(new Error('Origin not allowed by CORS policy'), false);
    },
    credentials: true,
    exposedHeaders: ['x-cache', 'x-cache-status', 'x-cache-ttl'],
  });

  // Global rate limit: 300 requests per minute per IP (increased for shared campus Wi-Fi)
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      success: false,
      error: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      code: 'RATE_LIMITED',
    }),
  });

  // Conservative security headers on every response. A CSP is intentionally
  // omitted (this is a JSON API with no inline document content) to avoid
  // breaking clients while still disabling MIME sniffing, framing and referrer leaks.
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    if (process.env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    return payload;
  });

  await registerAuthRoutes(fastify, globalCache);
  await registerDashboardRoutes(fastify, globalCache);
  await registerAttendanceRoutes(fastify);
  await registerExamRoutes(fastify);
  await registerGradesRoutes(fastify, globalCache);
  await registerNotificationRoutes(fastify, globalCache);

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);
    const isProduction = process.env.NODE_ENV === 'production';
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      error: isProduction && statusCode >= 500
        ? 'Internal server error'
        : error.message,
      code: error.code || 'INTERNAL_ERROR',
    });
  });

  return { fastify, cache: globalCache };
}

export async function startServer() {
  try {
    const { fastify, cache } = await createServer();

    await fastify.listen({ port: PORT, host: HOST });

    // Last-resort process-level guards so a stray rejection/throw is logged
    // instead of vanishing (rejections) or crashing opaquely (exceptions).
    process.on('unhandledRejection', (reason) => {
      fastify.log.error({ err: reason }, '[Server] Unhandled promise rejection');
    });
    process.on('uncaughtException', (error) => {
      fastify.log.error({ err: error }, '[Server] Uncaught exception, shutting down');
      process.exit(1);
    });

    fastify.log.info(`JUET//SYNC backend running on http://${HOST}:${PORT}`);
    fastify.log.info(`CORS origins: ${CORS_ORIGINS.join(', ')}`);
    fastify.log.info(
      getRedisUrl()
        ? `Redis cache: ${getRedisUrl()}`
        : 'Cache: in-memory fallback (set REDIS_URL for shared cache)'
    );
    fastify.log.info(
      'Endpoints: GET /health, GET /api/init, POST /api/auth, GET /api/dashboard'
    );

    // Run the background academic updates check every 30 minutes.
    // Retain the handle so it can be cleared on graceful shutdown.
    const pushWorkerInterval = setInterval(() => {
      checkAcademicUpdates(cache, fastify.log).catch((err: any) => {
        fastify.log.error(err, '[PushWorker] Background execution failed');
      });
    }, 30 * 60 * 1000);
    // Unref so the interval does not prevent the process from exiting naturally.
    pushWorkerInterval.unref();

    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        fastify.log.info(`[Server] Received ${signal}, shutting down...`);
        clearInterval(pushWorkerInterval);
        await cache.close();
        await fastify.close();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
