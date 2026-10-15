# JUET Nexus — Agent Specification & Engineering Guide

This document defines the architectural guidelines, system behaviors, operational constraints, and verification protocols for autonomous AI agents and engineers working on the **JUET Nexus** codebase.

---

## 1. Monorepo Topology & Tech Stack

JUET Nexus is an academic dashboard proxy for Jaypee University of Engineering and Technology (JUET) bridging modern client web technology with the university's upstream ERP (CampusLynx).

```
JUET/
├── frontend/             # Next.js 15 (App Router, React 19, Tailwind CSS, Lucide)
│   ├── app/              # Routes: /, /login, /dashboard/*
│   ├── components/       # UI components & LoadingOverlay
│   ├── hooks/            # useAuthFlow, useDashboard, useSessionKeepAlive
│   └── utils/            # api.ts (Axios client), sessionRecovery.ts
├── backend/              # Fastify 4 (TypeScript, Redis/In-memory SWR cache)
│   ├── src/
│   │   ├── portal/       # CampusLynx HTTP client, crypto, & data parsers
│   │   ├── routes/       # auth, dashboard, grades, attendance, exam, session
│   │   └── utils/        # cache.ts, encryption.ts, pushWorker.ts
│   └── tests/            # Jest test suite (19 suites, 228 tests)
└── shared/               # Shared TypeScript interfaces & types
```

### Essential Commands

| Action | Root Command | Workspace Specific |
| :--- | :--- | :--- |
| **Development** | `npm run dev` | `npm run dev:frontend` / `npm run dev:backend` |
| **Type Check** | `npm run type-check` | `npm run type-check --workspace [frontend\|backend]` |
| **Testing** | `npm test` | `npm test --workspace backend -- --runInBand` |
| **Build** | `npm run build` | `npm run build --workspace [frontend\|backend]` |

---

## 2. Authentication & Session Architecture

### Core Protocols
1. **Upstream Portal (CampusLynx):**
   - Base URL: `https://studentportal.juet.ac.in/StudentPortalAPI`
   - Short-lived JWT tokens (~15 minutes lifespan).
   - Incomplete TLS certificate chain upstream: handled via controlled agent TLS settings (`PORTAL_REJECT_UNAUTHORIZED`).

2. **Session Persistence (30-Day Cookie):**
   - Cookie Name: `auth`
   - Encryption: AES-256-GCM authenticated encryption (`backend/src/utils/encryption.ts`).
   - Flags: `HttpOnly`, `Path=/`, `Max-Age=2592000` (30 days).
   - Production Cross-Site: `Secure: true`, `SameSite: "none"` (enables credentialed requests from Vercel to Render).
   - Fastify Server: Must initialize with `trustProxy: true` to correctly detect HTTPS behind Cloudflare/Render reverse proxies.

3. **Silent Renewal & SWR Cache Fallback:**
   - Background Keepalive: `DashboardSessionKeeper` runs globally across all `/dashboard/*` routes and triggers on window focus.
   - SWR Fallback: If CampusLynx token renewal fails after prolonged tab closure, backend routes inspect the valid 30-day session cookie and serve stale cached data (`stale: true`, `sessionExpired: true`) rather than locking users out.
   - Non-Destructive Reconnect: UI offers *"Try Reconnecting"* instead of forcing an immediate session wipe on transient network or portal failures.

---

## 3. Production Deployment Matrix

### Frontend (Vercel)
- **Production URL:** `https://juetnexus.vercel.app`
- **Environment Variables:**
  - `NEXT_PUBLIC_API_URL`: Live Render backend URL (`https://juet-nexus-backend.onrender.com`).
  - `NEXT_PUBLIC_SITE_URL`: `https://juetnexus.vercel.app`
  - `NODE_ENV`: `production`

### Backend (Render)
- **Production URL:** `https://juet-nexus-backend.onrender.com`
- **Environment Variables:**
  - `PORT`: Auto-bound by Render (default `3001`).
  - `NODE_ENV`: `production`
  - `ENCRYPTION_KEY`: 64-character hex key (256-bit).
  - `CORS_ORIGIN`: `https://juetnexus.vercel.app` (Backend dynamically allows all `*.vercel.app` project domains).
  - `DATA_PROVIDER`: `campuslynx`
  - `PORTAL_BASE_URL`: `https://studentportal.juet.ac.in/StudentPortalAPI`
  - `REQUEST_TIMEOUT`: `15000` (Backend portal query timeout).

### Cold Start Tolerance
- Render Free Tier spins down after 15 minutes of inactivity (cold boot takes 30–35s).
- Frontend Axios timeout is set to `45000ms` for initial connections and `apiClient`.
- `LoadingOverlay` features progressive status messages (>4s, >12s, >25s, >45s) to inform users during cold starts instead of premature aborts.

---

## 4. Engineering Invariants & Coding Standards

1. **Evidence-Backed Verification:**
   - Never claim an issue is resolved without verifying via `npm run type-check`, `npm test`, `npm run build`, and live network/browser checks.
2. **Never Expose Secrets:**
   - Keep credentials and encryption keys strictly within `.env` or cloud dashboard secrets. Never commit tokens, passwords, or production keys.
3. **HTTP Connection Pooling:**
   - Upstream client in `backend/src/portal/client.ts` must use pooled `https.Agent` with `maxSockets >= 10` and `keepAlive: true`.
4. **Parallel Data Fetching:**
   - Multi-resource routes (such as `fetchCampusLynxDashboard`) must use `Promise.allSettled()` in staged pipelines rather than sequential blocking waterfalls.
5. **Aesthetic Integrity:**
   - Preserve existing design tokens, Tailwind styling, dark/light mode consistency, and responsive layouts across all viewports.
