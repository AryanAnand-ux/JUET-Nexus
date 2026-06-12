import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { publicKey } from '../utils/vapid';
import { CacheService } from '../utils/cache';
import { decryptSessionData } from '../utils/encryption';

interface SubscribeBody {
  enrollment: string;
  subscription: any;
}

export async function registerNotificationRoutes(
  fastify: FastifyInstance,
  cache: CacheService
) {
  // Expose the public VAPID key to the frontend
  fastify.get('/api/notifications/vapid-public-key', async () => {
    return { publicKey };
  });

  // Register a new client push subscription
  fastify.post<{ Body: SubscribeBody }>(
    '/api/notifications/subscribe',
    {
      schema: {
        body: {
          type: 'object',
          required: ['enrollment', 'subscription'],
          properties: {
            enrollment: { type: 'string', minLength: 1 },
            subscription: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const { enrollment, subscription } = request.body;
      const uppercaseEnrollment = enrollment.toUpperCase();

      const encryptedSession = request.cookies.auth;
      if (!encryptedSession) {
        return reply.status(401).send({
          success: false,
          error: 'Unauthorized: No active authentication cookie',
          code: 'UNAUTHORIZED',
        });
      }

      // Verify that the user is not subscribing for someone else
      try {
        const session = decryptSessionData(encryptedSession);
        if (session.enrollment !== uppercaseEnrollment) {
          return reply.status(403).send({
            success: false,
            error: 'Forbidden: You cannot subscribe for another enrollment',
            code: 'FORBIDDEN',
          });
        }
      } catch (err) {
        return reply.status(401).send({
          success: false,
          error: 'Unauthorized: Invalid session',
          code: 'INVALID_SESSION',
        });
      }

      // Store device subscription in Cache set
      await cache.sAdd('push_subscriptions', uppercaseEnrollment, JSON.stringify(subscription));

      // Save encrypted credentials securely for background checker re-logins (30 days TTL)
      await cache.set('secure_credentials', uppercaseEnrollment, encryptedSession, 30 * 24 * 60 * 60);

      // Add enrollment to active notification list
      await cache.sAdd('active_notifications', 'enrollments', uppercaseEnrollment);

      request.server.log.info(`[Notifications] Registered subscription for: ${uppercaseEnrollment}`);

      return reply.send({
        success: true,
        message: 'Subscribed successfully',
      });
    }
  );

  // Unregister a client push subscription
  fastify.post<{ Body: SubscribeBody }>(
    '/api/notifications/unsubscribe',
    {
      schema: {
        body: {
          type: 'object',
          required: ['enrollment', 'subscription'],
          properties: {
            enrollment: { type: 'string', minLength: 1 },
            subscription: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const { enrollment, subscription } = request.body;
      const uppercaseEnrollment = enrollment.toUpperCase();

      await cache.sRem('push_subscriptions', uppercaseEnrollment, JSON.stringify(subscription));

      // If no subscriptions left, clean up credentials
      const remainingCount = await cache.sCard('push_subscriptions', uppercaseEnrollment);
      if (remainingCount === 0) {
        await cache.invalidate('secure_credentials', uppercaseEnrollment);
        await cache.sRem('active_notifications', 'enrollments', uppercaseEnrollment);
        request.server.log.info(`[Notifications] Cleared all subscriptions/credentials for: ${uppercaseEnrollment}`);
      } else {
        request.server.log.info(`[Notifications] Removed one subscription device for: ${uppercaseEnrollment}`);
      }

      return reply.send({
        success: true,
        message: 'Unsubscribed successfully',
      });
    }
  );
}
export default registerNotificationRoutes;
