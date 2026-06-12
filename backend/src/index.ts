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
import { registerNotificationRoutes } from './routes/notifications';
import { CacheService } from './utils/cache';
import { validateKey } from './utils/encryption';
import { checkAcademicUpdates } from './utils/pushWorker';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN =
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000';

// Validate critical env vars at startup
try {
  validateKey(process.env.ENCRYPTION_KEY);
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
  });

  const globalCache = new CacheService(getRedisUrl());

  await fastify.register(fastifyCookie);
  await fastify.register(fastifyCors, {
    origin: CORS_ORIGIN,
    credentials: true,
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

  await registerAuthRoutes(fastify, globalCache);
  await registerDashboardRoutes(fastify, globalCache);
  await registerAttendanceRoutes(fastify);
  await registerNotificationRoutes(fastify, globalCache);

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);
    reply.status(error.statusCode || 500).send({
      success: false,
      error: error.message,
      code: error.code || 'INTERNAL_ERROR',
    });
  });

  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      fastify.log.info(`[Server] Received ${signal}, shutting down...`);
      await globalCache.close();
      await fastify.close();
      process.exit(0);
    });
  });

  return { fastify, cache: globalCache };
}

export async function startServer() {
  try {
    const { fastify, cache } = await createServer();

    await fastify.listen({ port: PORT, host: HOST });

    fastify.log.info(`JUET//SYNC backend running on http://${HOST}:${PORT}`);
    fastify.log.info(`CORS origin: ${CORS_ORIGIN}`);
    fastify.log.info(
      getRedisUrl()
        ? `Redis cache: ${getRedisUrl()}`
        : 'Cache: in-memory fallback (set REDIS_URL for shared cache)'
    );
    fastify.log.info(
      'Endpoints: GET /health, GET /api/init, POST /api/auth, GET /api/dashboard'
    );

    // Run the background academic updates check every 30 minutes
    setInterval(() => {
      checkAcademicUpdates(cache, fastify.log).catch((err: any) => {
        fastify.log.error(err, '[PushWorker] Background execution failed');
      });
    }, 30 * 60 * 1000);
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
