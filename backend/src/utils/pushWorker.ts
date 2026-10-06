import { CacheService } from './cache';
import { decryptSessionData } from './encryption';
import { webpush } from './vapid';
import { createPortalClient } from '../portal/client';
import { fetchCampusLynxDashboard } from '../portal/dashboard';

/**
 * Sends a WebPush notification to all registered devices for a student.
 */
async function sendPushNotification(
  cache: CacheService,
  enrollment: string,
  title: string,
  body: string
) {
  const subs = await cache.sMembers('push_subscriptions', enrollment);

  for (const subStr of subs) {
    try {
      const subscription = JSON.parse(subStr);
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ title, body, url: '/dashboard' })
      );
    } catch (err: any) {
      console.error(
        `[PushWorker] Failed to send push to device for ${enrollment}:`,
        err.message
      );
      if (err.statusCode === 410) {
        await cache.sRem('push_subscriptions', enrollment, subStr);
      }
    }
  }
}

/**
 * Periodically checks for academic updates for all active push notification users.
 */
export async function checkAcademicUpdates(cache: CacheService, log: any) {
  try {
    const enrollments = await cache.sMembers('active_notifications', 'enrollments');
    if (!enrollments || enrollments.length === 0) {
      return;
    }

    log.info(`[PushWorker] Checking updates for ${enrollments.length} subscribed students`);

    for (const enrollment of enrollments) {
      const uppercaseEnrollment = enrollment.toUpperCase();
      try {
        const encryptedSession = await cache.get<string>('secure_credentials', uppercaseEnrollment);
        if (!encryptedSession) {
          continue;
        }

        let session;
        try {
          session = decryptSessionData(encryptedSession);
        } catch {
          continue;
        }

        const identity = session.campusLynx;
        if (!identity?.token) {
          continue;
        }

        const client = createPortalClient();
        try {
          const transport = {
            postEncrypted: (path: string, payload: Record<string, unknown>) =>
              client.postEncrypted(path, payload, identity),
            getEncrypted: (path: string) => client.getEncrypted(path, identity),
          };

          const newData = await fetchCampusLynxDashboard(transport, {
            instituteid: identity.instituteid,
            companyid: identity.companyid,
            username: identity.username,
          });

          const cachedWrapper = await cache.get<any>('dashboard', uppercaseEnrollment);
          if (!cachedWrapper) {
            await cache.set('dashboard', uppercaseEnrollment, { data: newData, fetchedAt: Date.now() }, 7200);
            continue;
          }

          const oldData = cachedWrapper.data || cachedWrapper;

          // Check for attendance changes
          const oldAttendance = oldData.attendance || [];
          const newAttendance = newData.attendance || [];

          for (const newSub of newAttendance) {
            const oldSub = oldAttendance.find((s: any) => s.subject === newSub.subject);
            if (oldSub && (oldSub.classesHeld !== newSub.classesHeld || oldSub.percentage !== newSub.percentage)) {
              await sendPushNotification(
                cache,
                uppercaseEnrollment,
                `Attendance Updated: ${newSub.subject}`,
                `Now at ${newSub.percentage}% (${newSub.classesAttended}/${newSub.classesHeld} classes)`
              );
            }
          }

          await cache.set('dashboard', uppercaseEnrollment, { data: newData, fetchedAt: Date.now() }, 7200);
        } catch {
          // Token may have expired, ignore background check
        } finally {
          client.destroy();
        }
      } catch (err: any) {
        log.error(err, `[PushWorker] Failed processing subscriber: ${enrollment}`);
      }
    }
  } catch (err: any) {
    log.error(err, '[PushWorker] Job execution failed');
  }
}
