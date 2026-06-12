# PWA Push Notifications & Alerts Design Spec

**Goal:** Provide real-time browser push notifications to students when new exam marks are declared or when a subject's attendance drops below 75%.

---

## 1. Technical Architecture

### Key Components:
1. **VAPID Key Pair:** Generated using `web-push` library. Kept securely in `.env` (`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`). Exposed via backend `GET /api/notifications/vapid-public-key` for frontend consumption.
2. **Push Subscriptions Store:** Stored in Redis under `push_subscriptions:${enrollment}`. Uses Redis Set (`SADD`) to store multiple device push subscriptions for a single enrollment.
3. **Encrypted Credentials Store:** Stored in Redis under `secure_credentials:${enrollment}`. This is a duplicate of the user's login session data (enrollment, password, dob, role) encrypted with the server's private `ENCRYPTION_KEY`, allowing offline background scraper checks.
4. **Background Scraper Worker (Cron):** A recurring job executing every 30 minutes. Iterates through all enrollments with active subscriptions, fetches fresh data from WebKiosk, parses, compares, and triggers notifications.
5. **PWA Service Worker:** Updates to `sw.js` to handle `push` and `notificationclick` events in the browser.
6. **Frontend UI Control:** A switch/card in the dashboard enabling students to request permissions, subscribe, or unsubscribe.

---

## 2. API Schema

### 1. `GET /api/notifications/vapid-public-key`
Exposes the VAPID public key.
* **Response (200):**
  ```json
  {
    "publicKey": "VAPID_PUBLIC_KEY_STRING"
  }
  ```

### 2. `POST /api/notifications/subscribe`
Registers a new subscription for browser notifications.
* **Request Body:**
  ```json
  {
    "enrollment": "24BCS100",
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "expirationTime": null,
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    }
  }
  ```
* **Response (200):**
  ```json
  {
    "success": true,
    "message": "Subscribed successfully"
  }
  ```

### 3. `POST /api/notifications/unsubscribe`
Removes a subscription from the student set.
* **Request Body:**
  ```json
  {
    "enrollment": "24BCS100",
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/..."
    }
  }
  ```
* **Response (200):**
  ```json
  {
    "success": true,
    "message": "Unsubscribed successfully"
  }
  ```

---

## 3. Comparison & Trigger Engine

The background job compares the newly scraped dashboard payload with the previously cached payload:

### Marks Trigger:
1. Loops through all subjects.
2. For each subject, checks the `marks` array.
3. Compares the score and out-of fields for each exam component (e.g. `T1`, `T2`, `End Sem`).
4. If a component exists in the new data but not in the old data (new mark uploaded), or if the score value changes, triggers a **New Marks Declared** notification.

### Attendance Trigger:
1. Loops through all subjects.
2. Compares the attendance percentage.
3. If the new percentage is `< 75%` AND the old percentage was `>= 75%` (or was not cached), triggers a **Low Attendance Warning** notification.

---

## 4. Service Worker Event Listeners

### `sw.js` Event `push`:
```javascript
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'JUET Nexus Update';
  const options = {
    body: data.body || 'Your dashboard data has been updated.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/dashboard' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
```

### `sw.js` Event `notificationclick`:
```javascript
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
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
