# JUET Nexus

**JUET Nexus** is a modern, high-performance academic portal and dashboard client designed for Jaypee University of Engineering and Technology (JUET). Built on Next.js 15 App Router and Fastify, it connects directly to the official CampusLynx REST portal API with permanent sliding session persistence, attendance tracking, and a mobile-first interface.

---

## Key Features

- **Unified Single-Screen Login**: Clean, accessible login card presenting Enrollment Number, Password, and Captcha code simultaneously with password visibility toggle and instant captcha reload.
- **Permanent Session Persistence**: Transparent sliding token renewal extends encrypted HTTP-only session cookies on every request, paired with a proactive client-side keepalive heartbeat (`useSessionHeartbeat`). Users stay logged in until explicit logout.
- **Attendance Tracker**: Comprehensive subject-wise breakdown of lectures, tutorials, and practicals, complete with interactive safe-skip / target-attainment calculations and an overall attendance summary ring.
- **Academic Performance & Results**: Fast viewing of SGPA, cumulative CGPA, semester transcripts, and exam schedules.
- **Mobile Bottom Navigation**: Fixed, thumb-accessible bottom navigation bar for quick routing across Attendance, GPA Hub, Courses, Exams, and Grades.
- **Light & Dark Mode**: Streamlined theme toggle with smooth system and user preference switching.
- **Resilient Offline & Outage Handling**: Stale-while-revalidate caching (Redis or in-memory fallback) ensures academic data remains readable even during upstream portal maintenance.

---

## Technical Architecture

JUET Nexus is organized as a TypeScript npm-workspaces monorepo:

- **Frontend (`/frontend`)**: Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons, and Axios client.
- **Backend (`/backend`)**: Fastify REST API, CampusLynx REST portal client with AES-256-GCM encrypted cookies and dual-tier cache (Redis with memory fallback).
- **Shared (`/shared`)**: Shared TypeScript interfaces establishing strict type contracts between frontend and backend.

```
JUET Nexus Architecture
┌───────────────────────────────┐
│     Next.js 15 Frontend       │
│  (App Router, Mobile UI, PWA) │
└──────────────┬────────────────┘
               │ HTTP / JSON
┌──────────────▼────────────────┐
│      Fastify Backend          │
│ (Sliding Session, Redis Cache)│
└──────────────┬────────────────┘
               │ REST API (Bearer JWT)
┌──────────────▼────────────────┐
│   JUET CampusLynx Portal API  │
└───────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.x or later (v20+ recommended)
- **npm**: v10.x or later
- **Redis (Optional)**: Automatically falls back to an in-memory cache if Redis is not running.

### Installation

Clone the repository and install dependencies across all workspaces:

```bash
git clone https://github.com/AryanAnand-ux/JUET-Nexus.git
cd JUET-Nexus
npm install
```

### Environment Configuration

1. **Backend (`backend/.env`)**:
   ```env
   PORT=3001
   HOST=0.0.0.0
   NODE_ENV=development
   PORTAL_BASE_URL=https://studentportal.juet.ac.in/StudentPortalAPI
   PORTAL_TIMEZONE=Asia/Kolkata
   ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   CORS_ORIGIN=http://localhost:3000
   FRONTEND_URL=http://localhost:3000
   REQUEST_TIMEOUT=15000
   # REDIS_URL=redis://localhost:6379/0  # Optional (falls back to memory)
   ```
   *Generate a 64-character hex encryption key:*
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Frontend (`frontend/.env.local`)**:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

### Running Locally

Start both the frontend (:3000) and backend (:3001) concurrently:

```bash
npm run dev
```

Or run individual workspaces:
```bash
npm run dev:frontend   # Next.js development server
npm run dev:backend    # Fastify backend with ts-node
```

---

## Verification & Testing

```bash
npm run type-check     # Strict TypeScript checks across frontend & backend
npm run lint           # ESLint verification across frontend & backend
npm test               # Run backend Jest test suite
npm run build          # Production Next.js build + Fastify build
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/init` | Initialize login session & fetch captcha image |
| `POST` | `/api/auth/verify-user` | Step 1: verify enrollment number & captcha |
| `POST` | `/api/auth` | Step 2: authenticate password & issue encrypted cookie |
| `POST` | `/api/auth/refresh` | Lightweight session keepalive & sliding cookie renewal |
| `POST` | `/api/logout` | Explicitly destroy session & clear auth cookies |
| `GET` | `/api/dashboard` | Student profile, courses, and attendance summary (SWR) |
| `GET` | `/api/attendance/details` | Day-by-day attendance history for a subject |
| `GET` | `/api/exam/schedule` | Registered exam schedule and timings |
| `GET` | `/api/grades` | SGPA/CGPA semester transcript |
