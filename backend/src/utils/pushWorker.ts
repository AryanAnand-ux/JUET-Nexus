import { CacheService } from './cache';
import { decryptSessionData } from './encryption';
import { webpush } from './vapid';
import { getValidSession } from '../routes/session';
import { fetchAndParseDashboard } from '../routes/dashboard';
import type { DashboardResponse } from '../../../shared/types';

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
        // Subscription expired or unsubscribed on client side, clean it up
        await cache.sRem('push_subscriptions', enrollment, subStr);
      }
    }
  }
}

/**
 * Periodically checks WebKiosk for updates for all active push notification users.
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
          log.warn(`[PushWorker] Encrypted credentials missing for active subscriber: ${uppercaseEnrollment}`);
          continue;
        }

        // Mock request and reply to reuse the session verification / silent login flow
        const mockRequest = {
          cookies: { auth: encryptedSession },
          server: { log },
          log,
        } as any;

        const mockReply = {
          setCookie: (name: string, value: string, opts?: any) => {
            log.info(`[PushWorker] Session cookie updated in background for ${uppercaseEnrollment}`);
            // Update the stored session credentials if a silent re-login refreshed the JSESSIONID
            cache.set('secure_credentials', uppercaseEnrollment, value, 30 * 24 * 60 * 60).catch((e) => {
              log.error(e, `[PushWorker] Failed to save updated background credentials for ${uppercaseEnrollment}`);
            });
          },
          clearCookie: (name: string, opts?: any) => {
            log.warn(`[PushWorker] Session credentials cleared in background for ${uppercaseEnrollment}`);
            cache.invalidate('secure_credentials', uppercaseEnrollment);
            cache.sRem('active_notifications', 'enrollments', uppercaseEnrollment);
          },
        } as any;

        // Obtain valid JSESSIONID (will silently re-login if expired)
        const jsessionid = await getValidSession(mockRequest, mockReply);

        // Fetch fresh academic data
        const newData = await fetchAndParseDashboard(jsessionid, uppercaseEnrollment, log);

        // Get previously cached dashboard data
        const cachedWrapper = await cache.get<any>('dashboard', uppercaseEnrollment);
        if (!cachedWrapper) {
          // Warm up cache and proceed
          await cache.set('dashboard', uppercaseEnrollment, { data: newData, fetchedAt: Date.now() }, 7200);
          continue;
        }

        const oldData = cachedWrapper.data ? cachedWrapper.data : cachedWrapper;

        // 1. Compare Attendance
        for (const newSubj of newData.attendance) {
          const oldSubj = oldData.attendance?.find(
            (o: any) => o.subject === newSubj.subject
          );
          if (oldSubj) {
            const newPct = newSubj.percentage || 0;
            const oldPct = oldSubj.percentage || 0;

            if (newPct < 75 && oldPct >= 75) {
              log.warn(`[PushWorker] Attendance alert triggered for ${uppercaseEnrollment} in ${newSubj.subject}`);
              await sendPushNotification(
                cache,
                uppercaseEnrollment,
                'Attendance Warning ⚠️',
                `Your attendance in ${newSubj.subject} has dropped to ${newSubj.percentage}%`
              );
            }
          }
        }

        // 2. Compare Marks
        if (newData.detailedMarks && oldData.detailedMarks) {
          for (const newMark of newData.detailedMarks) {
            const oldMark = oldData.detailedMarks.find(
              (o: any) => o.code === newMark.code
            );
            if (oldMark) {
              // Compare if a new mark component was added
              if (newMark.components.length > oldMark.components.length) {
                const latestComp = newMark.components[newMark.components.length - 1];
                log.info(`[PushWorker] Marks alert triggered for ${uppercaseEnrollment} in ${newMark.subject}`);
                await sendPushNotification(
                  cache,
                  uppercaseEnrollment,
                  'New Marks Declared 📈',
                  `New score added for ${newMark.subject}: ${latestComp.name} (${latestComp.obtained}/${latestComp.max})`
                );
              }
            }
          }
        }

        // Update the cached dashboard payload
        await cache.set('dashboard', uppercaseEnrollment, { data: newData, fetchedAt: Date.now() }, 7200);

      } catch (err: any) {
        log.error(`[PushWorker] Failed to process updates for ${uppercaseEnrollment}: ${err.message}`);
      }
    }
  } catch (error: any) {
    log.error(`[PushWorker] Error scanning subscriber lists: ${error.message}`);
  }
}
export default checkAcademicUpdates;
