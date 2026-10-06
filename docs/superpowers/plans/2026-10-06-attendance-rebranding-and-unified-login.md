# Attendance Rebranding, Unified Single-Screen Login & Codebase Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand Bunk Meter to Attendance across the entire application, unify the login screen to simultaneously show Enrollment Number, Password, and Captcha on a single form, clean up obsolete documentation and scripts, and add professional UX enhancements (overall attendance aggregate, header data refresh, copy enrollment).

**Architecture:** Next.js 15 App Router frontend paired with Fastify REST backend. The login form presents Enrollment, Password, and Captcha concurrently, and `useAuthFlow` handles the sequential verification pipeline transparently in a single submit action. Component and routing labels are updated to professional attendance nomenclature.

**Tech Stack:** Next.js 15 (React 19, App Router, Lucide icons, Tailwind CSS), Fastify, TypeScript, Jest.

---

### Task 1: Documentation Cleanup & README Modernization

**Files:**
- Delete: `ARCHITECTURE.md`
- Delete: `docs/superpowers/plans/2026-06-09-dashboard-improvements.md`
- Delete: `docs/superpowers/plans/2026-06-09-figma-login-redesign.md`
- Delete: `docs/superpowers/plans/2026-06-09-persistent-sessions.md`
- Delete: `docs/superpowers/plans/2026-06-12-pwa-push-notifications.md`
- Delete: `docs/superpowers/plans/2026-09-30-campuslynx-migration.md`
- Delete: `docs/superpowers/specs/2026-06-09-dashboard-improvements-spec.md`
- Delete: `docs/superpowers/specs/2026-06-09-figma-login-redesign-spec.md`
- Delete: `docs/superpowers/specs/2026-06-09-persistent-sessions-design.md`
- Delete: `docs/superpowers/specs/2026-06-12-pwa-push-notifications-design.md`
- Delete: `docs/superpowers/specs/2026-09-30-campuslynx-migration-design.md`
- Delete: `docs/superpowers/specs/2026-10-06-modernization-and-mobile-cleanup-design.md`
- Delete: `docs/superpowers/specs/2026-10-06-permanent-session-and-error-resilience-design.md`
- Delete: `backend/scripts/capture-live.ts`
- Delete: `backend/scripts/diagnose-pretoken.ts`
- Delete: `backend/scripts/fetch-captcha.ts`
- Delete: `backend/scripts/mint-campuslynx-cookie.ts`
- Modify: `README.md`

- [ ] **Step 1: Delete obsolete documentation and scripts**

```bash
git rm ARCHITECTURE.md \
  docs/superpowers/plans/2026-06-09-dashboard-improvements.md \
  docs/superpowers/plans/2026-06-09-figma-login-redesign.md \
  docs/superpowers/plans/2026-06-09-persistent-sessions.md \
  docs/superpowers/plans/2026-06-12-pwa-push-notifications.md \
  docs/superpowers/plans/2026-09-30-campuslynx-migration.md \
  docs/superpowers/specs/2026-06-09-dashboard-improvements-spec.md \
  docs/superpowers/specs/2026-06-09-figma-login-redesign-spec.md \
  docs/superpowers/specs/2026-06-09-persistent-sessions-design.md \
  docs/superpowers/specs/2026-06-12-pwa-push-notifications-design.md \
  docs/superpowers/specs/2026-09-30-campuslynx-migration-design.md \
  docs/superpowers/specs/2026-10-06-modernization-and-mobile-cleanup-design.md \
  docs/superpowers/specs/2026-10-06-permanent-session-and-error-resilience-design.md \
  backend/scripts/capture-live.ts \
  backend/scripts/diagnose-pretoken.ts \
  backend/scripts/fetch-captcha.ts \
  backend/scripts/mint-campuslynx-cookie.ts
```

- [ ] **Step 2: Update `README.md` with production documentation**

Replace `README.md` with an accurate, modern technical overview reflecting Next.js 15, Fastify, CampusLynx REST portal, permanent sliding sessions, attendance analytics, mobile navigation, and verified scripts.

- [ ] **Step 3: Commit Task 1**

```bash
git add README.md
git commit -m "docs: clean obsolete markdown files and modernize README"
```

---

### Task 2: Attendance Rebranding & Overall Summary Card

**Files:**
- Rename/Create: `frontend/components/AttendanceTracker.tsx` (from `frontend/components/BunkMeter.tsx`)
- Modify: `frontend/components/MobileBottomNav.tsx`
- Modify: `frontend/components/DashboardLayout.tsx`
- Modify: `frontend/app/dashboard/page.tsx`
- Modify: `frontend/app/dashboard/subject/[id]/page.tsx`

- [ ] **Step 1: Rename `BunkMeter.tsx` to `AttendanceTracker.tsx`**

Move `frontend/components/BunkMeter.tsx` to `frontend/components/AttendanceTracker.tsx`.
Update internal labels:
- Component name: `AttendanceTracker`
- Header: "Attendance Tracker" (replacing "Bunk Meter — Attendance Tracker")
- Re-export `AttendanceTracker` and provide a backward-compatible alias `BunkMeter` if needed.

- [ ] **Step 2: Update Navigation components**

In `frontend/components/MobileBottomNav.tsx`:
- Change label `"Bunk"` to `"Attendance"`.
- Use `CheckCircle2` icon.

In `frontend/components/DashboardLayout.tsx`:
- Change `"Bunk Meter"` sidebar item to `"Attendance"`.
- Update section title mapping from `"Bunk Meter & Attendance"` to `"Attendance Tracker"`.

- [ ] **Step 3: Add Overall Attendance Summary to Dashboard page**

In `frontend/app/dashboard/page.tsx`:
- Compute total attended, total held, and aggregate attendance percentage across all enrolled courses.
- Render a summary card displaying:
  - Aggregate attendance percentage with status pill (e.g. `≥75% Good Standing`, `<75% Attention Required`).
  - Total classes attended out of total held.
  - Margin buffer indicator.

- [ ] **Step 4: Update Subject Detail Simulation terminology**

In `frontend/app/dashboard/subject/[id]/page.tsx`:
- Update card title from `"Advanced Bunk Planner"` to `"Attendance Planner & Simulation"`.
- Update button from `"− Bunk"` to `"− Skip Class"`.
- Update button from `"+ Attend"` to `"+ Attend Class"`.
- Refine feedback text: "Classes to attend to reach 75%" / "Safe classes to miss".

- [ ] **Step 5: Verify tests and type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 6: Commit Task 2**

```bash
git add frontend/
git commit -m "feat(frontend): rebrand bunk meter to attendance tracker and add overall summary card"
```

---

### Task 3: Single-Screen Unified Login

**Files:**
- Modify: `frontend/hooks/useAuthFlow.ts`
- Modify: `frontend/components/CampusLynxLoginForm.tsx`
- Modify: `frontend/app/login/page.tsx`

- [ ] **Step 1: Update `useAuthFlow.ts` for single-screen login**

Add unified action `submitLogin({ enrollment, password, captchaInput })`:
- Sets `isLoading(true)`.
- Calls `POST /api/auth/verify-user` with `{ enrollment, captcha, sessionToken }`.
- On receiving `loginToken`, immediately calls `POST /api/auth` with `{ loginToken, password }`.
- On success: saves `enrollment` and `role` to `localStorage` and redirects to `/dashboard`.
- On captcha error (401/400 from verify-user): keeps `password` and `enrollment`, resets captcha input, and fetches a fresh captcha image.
- On password error (401 from auth): sets field error on password, keeps captcha handle if valid or reloads.

- [ ] **Step 2: Redesign `CampusLynxLoginForm.tsx` to render all fields together**

In `frontend/components/CampusLynxLoginForm.tsx`:
- Render all 3 input fields on the same screen:
  1. **Enrollment Number**: Uppercase text input with placeholder and helper.
  2. **Password**: Secure input with show/hide password toggle button (eye icon).
  3. **Captcha Code**: Side-by-side with captcha image preview and instant reload button.
- Single primary submit button: **"Sign In"** with inline loading spinner.
- Retain error banner and field-level styling.

- [ ] **Step 3: Update `frontend/app/login/page.tsx`**

Ensure `page.tsx` connects the updated `submitLogin` from `useAuthFlow` directly to `CampusLynxLoginForm`.

- [ ] **Step 4: Verify type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors across frontend and backend.

- [ ] **Step 5: Commit Task 3**

```bash
git add frontend/
git commit -m "feat(frontend): implement single-screen unified login form"
```

---

### Task 4: Pro Features & Final Polish

**Files:**
- Modify: `frontend/components/DashboardLayout.tsx`
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Add Header Refresh Button**

In `frontend/components/DashboardLayout.tsx`:
- Add a refresh button (`RotateCw` icon) next to the theme toggle.
- On click, triggers data refetch with a rotating animation.

- [ ] **Step 2: Add Quick Copy Enrollment Pill**

In `frontend/app/dashboard/page.tsx`:
- Add a copy icon next to the enrollment badge in the student header.
- Clicking copies the enrollment number to the clipboard and shows a brief "Copied!" notification.

- [ ] **Step 3: Run Full Quality Verification**

Run:
1. `npm test` -> All 18 test suites passing (195 tests)
2. `npm run type-check` -> 0 errors
3. `npm run lint` -> 0 errors
4. `npm run build` -> Clean exit code 0

- [ ] **Step 4: Commit Task 4**

```bash
git add frontend/
git commit -m "feat(frontend): add one-click data refresh and quick copy enrollment"
```
