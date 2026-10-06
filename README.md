# JUET Nexus

**JUET Nexus** is a modern, high-performance student dashboard proxy for the Jaypee University of Engineering and Technology (JUET) Student Portal.

---

## Key Features

- **Premium Design:** Built with a visually stunning theme, custom cards, and smooth transitions.
- **Two-Step Login:** Enrollment + captcha, then password — matching the JUET Student Portal's own flow.
- **Interactive Collapsible Sidebar:** Supports dynamic folding/unfolding on desktop. Features click-to-expand and click-outside-to-collapse behavior.
- **Bunk Meter:** Instantly visualizes your attendance percentage with interactive simulators to calculate safe upcoming bunks or how many consecutive classes you need to attend to meet your target.
- **Performance Hub:** Centralized display of SGPA, CGPA standings, and recent evaluation scores.
- **Session Persistence:** Configured with secure CORS and httpOnly cookies, keeping you logged in even after refreshing your browser.

---

## Technical Architecture

JUET Nexus is structured as a TypeScript monorepo:
- **Frontend (`/frontend`):** Built with React, Next.js (App Router), Tailwind CSS, Lucide Icons, and Axios client-side connection.
- **Backend (`/backend`):** Powered by Fastify and Axios. Features AES-256-GCM encryption for cookies and a dual-tier caching layer (Redis + in-memory Map fallback).
- **Shared (`/shared`):** Universal TypeScript interfaces and type declarations ensuring strict data contracts.

### Data Provider

The backend supports two data providers, selected via the `DATA_PROVIDER` environment variable:

| Provider | Description |
|---|---|
| `campuslynx` (default) | JUET Student Portal JSON API — the current production backend |
| `webkiosk` | Legacy scraped WebKiosk flow — kept as a fallback |

---

## Local Development

### 1. Prerequisites
- **Node.js:** v18.x or later
- **npm:** v10.x or later
- **Redis (Optional):** Required for shared multi-session cache. Otherwise falls back to safe in-memory cache.

### 2. Installation
Clone the repository and install workspace dependencies:
```bash
git clone https://github.com/AryanAnand-ux/JUET-Nexus.git
cd JUET-Nexus
npm install
```

### 3. Environment Setup
Configure your environment variables:

**Backend (`/backend/.env`):**
```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
DATA_PROVIDER=campuslynx
PORTAL_BASE_URL=https://studentportal.juet.ac.in/StudentPortalAPI
PORTAL_TIMEZONE=Asia/Kolkata
ENCRYPTION_KEY=your-256-bit-hex-key-here-64-characters-minimum
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
REQUEST_TIMEOUT=15000
# REDIS_URL=redis://localhost:6379/0  # Optional (Falls back to memory)
```
*Note: Generate `ENCRYPTION_KEY` using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.*

**Frontend (`/frontend/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Running the App
Run both servers concurrently from the root directory:
```bash
npm run dev
```
- Frontend starts at: `http://localhost:3000`
- Backend API starts at: `http://localhost:3001`

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/init` | Fetch captcha + session token for login |
| `POST /api/auth/verify-user` | Step 1: verify enrollment + captcha |
| `POST /api/auth` | Step 2: exchange login token + password for session |
| `POST /api/logout` | Clear session |
| `GET /api/dashboard` | Full dashboard data (SWR cached) |
| `GET /api/attendance/details` | Day-by-day attendance for a subject |
| `POST /api/notifications/subscribe` | Register push notification |

---

## Known Limitations

- **SGPA/CGPA:** The portal's `getallsemesterdata` endpoint currently returns a 500 error. When it works, semester data populates normally; until then the Performance Hub shows an "unavailable" state.
- **Notices:** The portal has no noticeboard API. The login marquee is the only announcement channel.
- **Course Credits:** The portal does not expose per-subject credits. Course cards hide the credits UI when none are available.
- **Push Notifications:** CampusLynx sessions cannot silently re-login (no password stored), so background push updates are skipped for portal-authenticated users.

---
