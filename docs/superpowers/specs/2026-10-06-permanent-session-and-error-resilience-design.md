# Permanent Session & Error Resilience Specification

**Date**: 2026-10-06  
**Status**: Draft (Approved in Brainstorming)  
**Scope**: Backend session renewal, sliding cookie lifetimes, SWR fallback resilience, and non-destructive frontend error handling.

---

## 1. Problem Statement
1. **Short-Lived Portal Tokens**: CampusLynx API JWTs expire after ~15-30 minutes. When a token expires, subsequent data calls fail with empty HTTP 200 responses (treated as 401s).
2. **Aggressive Client Logout**: When a 401 occurs, frontend hooks (`useDashboard`, `useAttendanceDetails`, `useExamSchedule`, `useGrades`) immediately clear `localStorage` and force-redirect the user to `/login`.
3. **User Goal**: The user must stay **permanently logged in** across all tabs, page reloads, and browser restarts until they explicitly and intentionally click "Logout".

---

## 2. Architecture & Design

### 2.1 Backend Sliding Token Renewal
- **File**: `backend/src/routes/session.ts`
- **Helper**: `getOrRenewCampusLynxIdentity(request: FastifyRequest, reply?: FastifyReply): Promise<PortalSessionIdentity>`
  - Decrypts the session from the AES-256-GCM `auth` cookie.
  - Checks token expiry using `isTokenExpired(token, 300)` (within 5 minutes of expiration or already expired).
  - If nearing expiry or expired:
    - Calls `client.refreshToken({ username, token, otppwd })`.
    - Updates `session.campusLynx.token` with the fresh token.
    - Re-encrypts `SessionData` and sets an updated `auth` cookie on `reply` with `maxAge: 30 * 24 * 60 * 60` (30 days).
  - If `reply` is not passed (or refresh fails due to transient connection issues), falls back to the current identity if still minimally viable.

### 2.2 Dedicated Keep-Alive / Refresh Route
- **File**: `backend/src/routes/auth.ts`
- **Endpoint**: `POST /api/auth/refresh`
  - Validates active session and executes `client.refreshToken(...)`.
  - Sets refreshed 30-day `auth` cookie on the reply.
  - Returns `{ success: true, renewed: boolean, expiresAt: number }`.

### 2.3 Resilient SWR Cache Fallback on All Routes
- **Routes**: `backend/src/routes/dashboard.ts`, `attendance.ts`, `exam.ts`, `grades.ts`
- If live portal fetch throws an error or the portal is unreachable, handlers check cache for existing student data.
- If cached data exists (even if stale), return it with:
  - `cached: true`
  - `X-Cache-Status: stale`
  - HTTP 200 (instead of 401 or 502)
- Prevents brief portal downtime or token blips from crashing the student's dashboard.

### 2.4 Frontend Non-Destructive Error Handling
- **Files**:
  - `frontend/hooks/useDashboard.ts`
  - `frontend/hooks/useAttendanceDetails.ts`
  - `frontend/hooks/useExamSchedule.ts`
  - `frontend/hooks/useGrades.ts`
- **Rules**:
  1. **Never clear `enrollment` on background fetch error**: Do not call `clearStoredSession()` inside data query error catch blocks.
  2. **Only clear on explicit logout**: Only `performLogout()` in `frontend/utils/logout.ts` clears `localStorage` and redirects to `/login`.
  3. **Graceful degradation**: Display a non-destructive warning toast or banner if fresh data could not be retrieved, while keeping all cached cards, graphs, and calculators fully interactive.
  4. **Proactive Session Keepalive**: Add a background heartbeat hook (`useSessionHeartbeat`) that triggers `POST /api/auth/refresh` every 10 minutes while a browser tab is active.

---

## 3. Verification Plan
1. **Unit Tests**:
   - `backend/tests/session.test.ts`: Verify `getOrRenewCampusLynxIdentity` transparently refreshes expired/expiring tokens and sets renewed cookies on `reply`.
   - `backend/tests/auth.campuslynx.test.ts`: Verify `POST /api/auth/refresh` renews tokens and issues fresh 30-day cookies.
2. **Quality Gates**:
   - `npm run type-check` (0 errors)
   - `npm run lint` (0 errors)
   - `npm test --workspace backend` (100% pass)
   - `npm run build` (Next.js & Fastify build pass)
