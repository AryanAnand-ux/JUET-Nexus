# PWA Push Notifications & Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time push notification support for new marks and attendance alerts via WebPush and Service Worker.

**Architecture:** Expose VAPID keys, store subscription payloads and encrypted credentials in Redis, check WebKiosk in a background cron job for updates, trigger push alerts using the `web-push` library, and listen to push events in the service worker.

**Tech Stack:** Fastify, Next.js, Redis, `web-push` NPM library, Service Workers Push API.

---

## Proposed Changes

### Task 1: Dependency Installation & VAPID Key Setup

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/utils/vapid.ts`
- Create: `backend/src/routes/notifications.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Install `web-push` library in backend**
  Run: `npm install web-push --workspace backend`
  Run: `npm install --save-dev @types/web-push --workspace backend`

- [ ] **Step 2: Create `backend/src/utils/vapid.ts`**
  Generate or read VAPID key pairs.
  ```typescript
  import webpush from 'web-push';
  import fs from 'fs';
  import path from 'path';

  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.warn('[VAPID] Keys not found in environment. Generating a temporary pair...');
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    console.log(`\n=========================================\n[VAPID] Add these to your backend .env:\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n=========================================\n`);
  }

  webpush.setVapidDetails(
    'mailto:admin@juet-sync.local',
    publicKey,
    privateKey
  );

  export { publicKey, privateKey, webpush };
  ```

- [ ] **Step 3: Create routes file `backend/src/routes/notifications.ts`**
  ```typescript
  import { FastifyInstance } from 'fastify';
  import { publicKey } from '../utils/vapid';

  export async function registerNotificationRoutes(fastify: FastifyInstance) {
    fastify.get('/api/notifications/vapid-public-key', async () => {
      return { publicKey };
    });
  }
  ```

- [ ] **Step 4: Register routes in `backend/src/index.ts`**
  Import `registerNotificationRoutes` and register it using `await fastify.register(registerNotificationRoutes);` next to other routes.

- [ ] **Step 5: Run typecheck to verify build succeeds**
  Run: `npm run type-check`
  Expected: PASS

---

### Task 2: Subscription Storage & Registration API

**Files:**
- Modify: `backend/src/routes/notifications.ts`

- [ ] **Step 1: Implement subscribe and unsubscribe endpoints**
  Update `backend/src/routes/notifications.ts`:
  ```typescript
  import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
  import { publicKey } from '../utils/vapid';
  import { CacheService } from '../utils/cache';
  import { decryptSessionData } from '../utils/encryption';

  interface SubscribeBody {
    enrollment: string;
    subscription: any;
  }

  export async function registerNotificationRoutes(fastify: FastifyInstance, cache: CacheService) {
    fastify.get('/api/notifications/vapid-public-key', async () => {
      return { publicKey };
    });

    fastify.post<{ Body: SubscribeBody }>('/api/notifications/subscribe', async (request, reply) => {
      const { enrollment, subscription } = request.body;
      if (!enrollment || !subscription) {
        return reply.status(400).send({ error: 'Missing enrollment or subscription data' });
      }

      const encryptedSession = request.cookies.auth;
      if (!encryptedSession) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Store device subscription in Redis set
      const subKey = `push_subscriptions:${enrollment.toUpperCase()}`;
      await cache.redis.sadd(subKey, JSON.stringify(subscription));

      // Save encrypted credentials securely for background check
      const credsKey = `secure_credentials:${enrollment.toUpperCase()}`;
      await cache.redis.set(credsKey, encryptedSession);

      // Add to master set of active notification users
      await cache.redis.sadd('active_notification_enrollments', enrollment.toUpperCase());

      return reply.send({ success: true, message: 'Subscribed successfully' });
    });

    fastify.post<{ Body: SubscribeBody }>('/api/notifications/unsubscribe', async (request, reply) => {
      const { enrollment, subscription } = request.body;
      if (!enrollment || !subscription) {
        return reply.status(400).send({ error: 'Missing enrollment or subscription data' });
      }

      const subKey = `push_subscriptions:${enrollment.toUpperCase()}`;
      await cache.redis.srem(subKey, JSON.stringify(subscription));

      // Clean up credentials if no subscriptions left
      const remainingCount = await cache.redis.scard(subKey);
      if (remainingCount === 0) {
        await cache.redis.del(`secure_credentials:${enrollment.toUpperCase()}`);
        await cache.redis.srem('active_notification_enrollments', enrollment.toUpperCase());
      }

      return reply.send({ success: true, message: 'Unsubscribed successfully' });
    });
  }
  ```

- [ ] **Step 2: Update route registration in `backend/src/index.ts`**
  Pass the `globalCache` instance to `registerNotificationRoutes`.
  ```typescript
  await registerNotificationRoutes(fastify, globalCache);
  ```

- [ ] **Step 3: Run typecheck to verify compiling**
  Run: `npm run type-check`
  Expected: PASS

---

### Task 3: Background Push Worker & Trigger Engine

**Files:**
- Create: `backend/src/utils/pushWorker.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create `backend/src/utils/pushWorker.ts`**
  Implement comparison check logic and triggers.
  ```typescript
  import { CacheService } from './cache';
  import { decryptSessionData } from './encryption';
  import axios from './axios';
  import { webpush } from './vapid';
  import { parseDashboard } from '../parsers/dashboard';
  import { withJitter } from './delay';
  import type { DashboardResponse } from '../../../shared/types';

  const WEBKIOSK_URL = process.env.WEBKIOSK_URL || process.env.WEBKIOSK_BASE_URL || 'https://webkiosk.juet.ac.in';
  
  // Stagger helper matching dashboard route
  async function fetchWebKioskPage(path: string, jsessionid: string): Promise<string> {
    const resp = await axios.get(`${WEBKIOSK_URL}${path}`, {
      timeout: 20000,
      headers: {
        Cookie: `JSESSIONID=${jsessionid}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return typeof resp.data === 'string' ? resp.data : '';
  }

  async function sendPushNotification(cache: CacheService, enrollment: string, title: string, body: string) {
    const subKey = `push_subscriptions:${enrollment}`;
    const subs = await cache.redis.smembers(subKey);
    
    for (const subStr of subs) {
      try {
        const subscription = JSON.parse(subStr);
        await webpush.sendNotification(
          subscription,
          JSON.stringify({ title, body, url: '/dashboard' })
        );
      } catch (err: any) {
        console.error(`[PushWorker] Failed to send push to device for ${enrollment}:`, err.message);
        if (err.statusCode === 410) {
          // Subscription expired/gone, remove it
          await cache.redis.srem(subKey, subStr);
        }
      }
    }
  }

  export async function checkAcademicUpdates(cache: CacheService, log: any) {
    const enrollments = await cache.redis.smembers('active_notification_enrollments');
    log.info(`[PushWorker] Running background academic updates check for ${enrollments.length} users`);

    for (const enrollment of enrollments) {
      try {
        const credsKey = `secure_credentials:${enrollment}`;
        const encryptedSession = await cache.redis.get(credsKey);
        if (!encryptedSession) continue;

        const session = decryptSessionData(encryptedSession);
        
        // 1. Silent re-login flow to get active session JSESSIONID
        // Simulate login
        const initResp = await axios.get(`${WEBKIOSK_URL}/CommonFiles/Userlogin.jsp`, { timeout: 15000 });
        const cookies = initResp.headers['set-cookie'] || [];
        const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
        const form = new URLSearchParams({
          InstCode: 'JUET',
          UserType: 'S',
          MemberCode: session.enrollment,
          DATE1: session.dob,
          Password: session.password,
          txtcap: 'dummy', // Captcha auto-solve fallback will trigger
          BTNSubmit: 'Submit',
        });
        
        // Use auto-solved captcha or similar login flow ...
        // For simplicity and speed, we can use a helper method from session.ts
        // Wait, session.ts exports getValidSession which takes (request, reply).
        // Let's mock request/reply to reuse the robust login logic from session.ts:
        const mockRequest = {
          cookies: { auth: encryptedSession },
          server: { log: log }
        } as any;
        const mockReply = { setCookie: () => {}, clearCookie: () => {} } as any;
        
        const { getValidSession } = require('../routes/session');
        const jsessionid = await getValidSession(mockRequest, mockReply);

        // 2. Fetch pages with jitter delays
        const mainHtml = await fetchWebKioskPage('/StudentFiles/PersonalFiles/ShowAlertMessageSTUD.jsp', jsessionid);
        const attendanceHtml = await withJitter(() => fetchWebKioskPage('/StudentFiles/Academic/StudentAttendanceList.jsp', jsessionid), 100, 300);
        const marksHtml = await withJitter(() => fetchWebKioskPage('/StudentFiles/Exam/StudentEventMarksView.jsp', jsessionid), 200, 400);
        const cgpaHtml = await withJitter(() => fetchWebKioskPage('/StudentFiles/Exam/StudCGPAReport.jsp', jsessionid), 300, 500);
        const coursesHtml = await withJitter(() => fetchWebKioskPage('/StudentFiles/Academic/StudentRegistredSubjectList.jsp', jsessionid), 400, 600);

        const combinedHtml = [mainHtml, attendanceHtml, marksHtml, cgpaHtml, coursesHtml].join('\n');
        const newData = parseDashboard(combinedHtml);

        // 3. Load previous data
        const cachedWrapper = await cache.get<any>('dashboard', enrollment);
        if (!cachedWrapper) {
          // Warm up cache and exit
          await cache.set('dashboard', enrollment, { data: newData, fetchedAt: Date.now() }, 7200);
          continue;
        }
        
        const oldData = cachedWrapper.data || cachedWrapper;

        // 4. Compare Attendance
        for (const newSubj of newData.attendance) {
          const oldSubj = oldData.attendance.find((o: any) => o.subjectCode === newSubj.subjectCode);
          if (oldSubj) {
            const newPct = parseFloat(newSubj.attendancePercentage);
            const oldPct = parseFloat(oldSubj.attendancePercentage);
            if (newPct < 75 && oldPct >= 75) {
              await sendPushNotification(
                cache,
                enrollment,
                'Attendance Warning ⚠️',
                `Your attendance in ${newSubj.subjectName} has dropped to ${newSubj.attendancePercentage}%`
              );
            }
          }
        }

        // 5. Compare Marks
        // We check if new marks are added or scores are updated
        // For simplicity, checking if detailedMarks length or component values changed
        // To be safe, compare the new marks components count or totals
        // Detailed marks are parsed in dashboard parser
        if (newData.detailedMarks && oldData.detailedMarks) {
          for (const newMark of newData.detailedMarks) {
            const oldMark = oldData.detailedMarks.find((o: any) => o.subjectCode === newMark.subjectCode);
            if (oldMark) {
              // Compare components
              if (newMark.components.length > oldMark.components.length) {
                const latestComp = newMark.components[newMark.components.length - 1];
                await sendPushNotification(
                  cache,
                  enrollment,
                  'New Marks Declared 📈',
                  `New score added for ${newMark.subjectName}: ${latestComp.name} (${latestComp.obtained}/${latestComp.max})`
                );
              }
            }
          }
        }

        // Update cache
        await cache.set('dashboard', enrollment, { data: newData, fetchedAt: Date.now() }, 7200);
      } catch (err: any) {
        log.error(`[PushWorker] Error checking updates for ${enrollment}:`, err.message);
      }
    }
  }
  ```

- [ ] **Step 2: Start worker interval in `backend/src/index.ts`**
  In `startServer()`, add an interval running `checkAcademicUpdates` every 30 minutes.
  ```typescript
  const { checkAcademicUpdates } = require('./utils/pushWorker');
  setInterval(() => {
    checkAcademicUpdates(globalCache, fastify.log).catch((err: any) => {
      fastify.log.error(err, '[PushWorker] Job execution failed');
    });
  }, 30 * 60 * 1000); // 30 minutes
  ```

- [ ] **Step 3: Run typecheck to verify compiling**
  Run: `npm run type-check`
  Expected: PASS

---

### Task 4: Service Worker Push Event Listeners

**Files:**
- Modify: `frontend/public/sw.js`

- [ ] **Step 1: Add push and notificationclick event listeners**
  Add these lines to the bottom of `frontend/public/sw.js`:
  ```javascript
  self.addEventListener('push', function (event) {
    if (!event.data) return;
    try {
      const data = event.data.json();
      const title = data.title || 'JUET Nexus Update';
      const options = {
        body: data.body || 'Your academic dashboard has been updated.',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/dashboard' },
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
      console.error('[SW] Failed to parse push data:', err);
    }
  });

  self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (let i = 0; i < clientList.length; i++) {
          let client = clientList[i];
          if (client.url.includes('/dashboard') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  });
  ```

---

### Task 5: Frontend UI Control Component

**Files:**
- Create: `frontend/components/NotificationToggle.tsx`
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Create `frontend/components/NotificationToggle.tsx`**
  ```tsx
  'use client';

  import React, { useState, useEffect } from 'react';
  import axios from 'axios';
  import { Bell, BellOff, Loader2 } from 'lucide-react';

  interface Props {
    enrollment: string;
  }

  export const NotificationToggle: React.FC<Props> = ({ enrollment }) => {
    const [isSupported, setIsSupported] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    useEffect(() => {
      if (
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window
      ) {
        setIsSupported(true);
        checkSubscription();
      } else {
        setIsLoading(false);
      }
    }, []);

    const checkSubscription = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsEnabled(!!sub);
      } catch (err) {
        console.error('Failed to check subscription:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const subscribe = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(`${API_URL}/api/notifications/vapid-public-key`);
        const vapidPublicKey = res.data.publicKey;

        // Request browser permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('Notification permission denied.');
          setIsLoading(false);
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey,
        });

        // Register to backend
        await axios.post(
          `${API_URL}/api/notifications/subscribe`,
          { enrollment, subscription: sub },
          { withCredentials: true }
        );

        setIsEnabled(true);
      } catch (err) {
        console.error('Subscription failed:', err);
        alert('Failed to enable notifications. Try again.');
      } finally {
        setIsLoading(false);
      }
    };

    const unsubscribe = async () => {
      setIsLoading(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Unregister from backend first
          await axios.post(
            `${API_URL}/api/notifications/unsubscribe`,
            { enrollment, subscription: sub },
            { withCredentials: true }
          );
          await sub.unsubscribe();
        }
        setIsEnabled(false);
      } catch (err) {
        console.error('Unsubscription failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (!isSupported) return null;

    return (
      <button
        onClick={isEnabled ? unsubscribe : subscribe}
        disabled={isLoading}
        type="button"
        className={`flex items-center gap-2 border px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
          isEnabled
            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isEnabled ? (
          <>
            <Bell className="w-4 h-4 text-indigo-400" />
            <span>Alerts Enabled</span>
          </>
        ) : (
          <>
            <BellOff className="w-4 h-4 text-slate-400" />
            <span>Enable Alerts</span>
          </>
        )}
      </button>
    );
  };
  ```

- [ ] **Step 2: Add `NotificationToggle` to dashboard screen**
  Modify `frontend/app/dashboard/page.tsx`:
  - Import `{ NotificationToggle } from "@/components/NotificationToggle"` at the top.
  - Render `<NotificationToggle enrollment={enrollment} />` next to the `Sync WebKiosk` button in the header block (around line 125).

- [ ] **Step 3: Build frontend and backend to verify zero compiler errors**
  Run: `npm run build`
  Expected: SUCCESS

---

### Task 6: Automated Integration Tests

**Files:**
- Create: `backend/tests/notifications.test.ts`

- [ ] **Step 1: Create `backend/tests/notifications.test.ts`**
  ```typescript
  import { publicKey } from '../src/utils/vapid';

  describe('Notifications API', () => {
    it('should expose valid VAPID public key', () => {
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(30);
    });
  });
  ```

- [ ] **Step 2: Run all Jest tests**
  Run: `npm test`
  Expected: ALL 87 TESTS PASS
