# Design Specification: Attendance Rebranding, Unified Login & Codebase Polish

Date: 2026-10-06  
Topic: Attendance Rebranding, Single-Screen Login, Documentation Cleanup & Codebase Professionalization

---

## 1. Objectives & Scope

1. **Attendance Rebranding**:
   - Retire the colloquial "Bunk Meter" terminology across navigation, components, and headers.
   - Replace with "Attendance" / "Attendance Tracker" / "Attendance Planner" with professional indicators.
   - Rename `BunkMeter.tsx` to `AttendanceTracker.tsx`.
2. **Unified Single-Screen Login**:
   - Display Enrollment Number, Password, and Captcha input + image simultaneously on a single card.
   - Sequential client-side authentication pipeline in `useAuthFlow` that executes both verification and session establishment on a single "Sign In" button click.
   - Ensure errors on captcha do not clear the user's password or enrollment number.
3. **Professional Value-Add Features**:
   - Overall Attendance Summary badge with aggregate classes attended vs. held and percentage badge.
   - One-click data refresh button in dashboard header.
   - Quick-copy button for student enrollment numbers.
4. **Documentation & Codebase Professionalization**:
   - Delete obsolete markdown documents in `ARCHITECTURE.md` and legacy `docs/superpowers/` drafts.
   - Overhaul `README.md` into an enterprise-ready project guide.
   - Remove throwaway debug scripts from `backend/scripts/`.

---

## 2. Architecture & Component Design

### 2.1 Single-Screen Login Form (`CampusLynxLoginForm.tsx` & `useAuthFlow.ts`)

- **State Model**:
  ```typescript
  interface UnifiedLoginCredentials {
    enrollment: string;
    password: string;
    captchaInput: string;
  }
  ```
- **Single-Screen UI Layout**:
  - Logo and header ("Sign in to JUET Nexus" / "Enter your academic credentials").
  - Form Fields:
    1. **Enrollment Number**: Uppercase text input with placeholder `e.g. 24BCS100`.
    2. **Password**: Secure input with toggleable show/hide eye icon.
    3. **Captcha Row**: 
       - Captcha code input (4-6 chars).
       - Captcha preview SVG/PNG image container.
       - Reload icon button to refresh captcha without clearing password.
    4. **Sign In Button**: Primary CTA with loading spinner during authentication.
- **Sequential Auth Flow**:
  - `submitLogin(credentials)` calls `POST /api/auth/verify-user` with `{ enrollment, captcha, sessionToken }`.
  - Upon receiving `loginToken`, immediately calls `POST /api/auth` with `{ loginToken, password }`.
  - On success: sets `localStorage` user keys and redirects to `/dashboard`.
  - On captcha failure (401/400): refreshes captcha image, clears only the captcha field, and preserves enrollment + password.
  - On password failure (401): keeps enrollment and password with an explicit error message.

### 2.2 Attendance Rebranding

- **File Renames**:
  - `frontend/components/BunkMeter.tsx` → `frontend/components/AttendanceTracker.tsx`
- **Terminology Updates**:
  - Navigation: "Bunk" → "Attendance" in `MobileBottomNav.tsx` and `DashboardLayout.tsx`.
  - Widget Header: "Bunk Meter — Attendance Tracker" → "Attendance Tracker".
  - Subject Detail (`frontend/app/dashboard/subject/[id]/page.tsx`):
    - "Advanced Bunk Planner" → "Attendance Planner & Simulator".
    - "− Bunk" button → "− Skip Class".
    - "+ Attend" button → "+ Attend Class".
    - "Safe to skip N classes" / "Must attend next N classes to reach 75%".
- **Added Value-Add: Overall Attendance Summary Card**:
  - In `frontend/app/dashboard/page.tsx`, compute:
    ```typescript
    const totalAttended = attendance.reduce((acc, c) => acc + c.classesAttended, 0);
    const totalHeld = attendance.reduce((acc, c) => acc + c.classesHeld, 0);
    const overallPercentage = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 0;
    ```
  - Display a prominent, elegant summary widget showcasing total classes attended, total conducted, and aggregate status.

### 2.3 Additional Professional Enhancements

- **Header Refresh Button**:
  - Added to `DashboardLayout.tsx` top navbar: a subtle refresh icon that triggers `refetch()` on the current dashboard data with a rotating icon animation.
- **Quick Copy Enrollment**:
  - In the dashboard profile banner, clicking the enrollment pill copies it to clipboard with a brief "Copied!" tooltip.

### 2.4 Cleanup & Professionalization

- **Files to Remove**:
  - `ARCHITECTURE.md`
  - `docs/superpowers/plans/2026-06-09-dashboard-improvements.md`
  - `docs/superpowers/plans/2026-06-09-figma-login-redesign.md`
  - `docs/superpowers/plans/2026-06-09-persistent-sessions.md`
  - `docs/superpowers/plans/2026-06-12-pwa-push-notifications.md`
  - `docs/superpowers/plans/2026-09-30-campuslynx-migration.md`
  - `docs/superpowers/specs/2026-06-09-dashboard-improvements-spec.md`
  - `docs/superpowers/specs/2026-06-09-figma-login-redesign-spec.md`
  - `docs/superpowers/specs/2026-06-09-persistent-sessions-design.md`
  - `docs/superpowers/specs/2026-06-12-pwa-push-notifications-design.md`
  - `docs/superpowers/specs/2026-09-30-campuslynx-migration-design.md`
  - `docs/superpowers/specs/2026-10-06-modernization-and-mobile-cleanup-design.md`
  - `docs/superpowers/specs/2026-10-06-permanent-session-and-error-resilience-design.md`
  - `backend/scripts/capture-live.ts`
  - `backend/scripts/diagnose-pretoken.ts`
  - `backend/scripts/fetch-captcha.ts`
  - `backend/scripts/mint-campuslynx-cookie.ts`
- **Files to Modernize**:
  - `README.md` completely updated with current stack (Next.js 15, Fastify, CampusLynx REST, Redis/In-memory cache, AES-256-GCM cookies).

---

## 3. Testing & Verification

- **Tests**:
  - Update unit tests in backend/frontend to reflect new component imports.
  - Verify all 18 backend test suites (195 tests) pass.
- **Type Checking & Linting**:
  - Zero TypeScript compiler errors via `npm run type-check`.
  - Zero ESLint errors via `npm run lint`.
- **Production Build**:
  - Next.js and Fastify compile cleanly with exit code 0.
