# JUET Nexus — Production Audit

> **Scope:** Entire repository at `D:\Projects\JUET` (frontend/ Next.js 15 · backend/ Fastify 4 · shared/ types), read-only.
> **Method:** 7 parallel specialist audits (architecture, security/privacy, production readiness, performance/scalability, testing, UX/accessibility/SEO, data accuracy), then cross-verification of every Critical/Trust-Critical claim against the source by the lead auditor.
> **Verification performed (read-only):** `npm test` (backend) → **21/21 suites, 238/238 tests pass**; `tsc --noEmit` (both workspaces) → **0 errors**; `eslint` (both) → **0 errors/warnings**; suite re-run with `TZ=UTC` → still green; `git status` clean before/after.
> **No files were modified** except this report. **No secret values are reproduced anywhere below.**

---

## 1. Executive Summary

JUET Nexus is a surprisingly well-engineered student portal proxy for its size: 238 passing tests with genuinely strong attendance/date coverage, clean type-check and lint, no committed secrets, fail-fast encryption-key validation, per-route auth rate limits, structured logging, graceful shutdown, and thoughtful UX details (safe-area insets, skip link, skeletons, empty states).

However, **it is not ready to launch to real students today**. The audit found a small number of confirmed, contained problems that directly threaten security, privacy, and — most importantly — **the accuracy of the academic numbers students are asked to trust**:

1. **Privacy:** an unauthenticated `GET /api/feedback` dumps student PII (enrollment, email, name, messages) to anyone; the Supabase RLS policy grants `for all using (true)` despite a comment saying otherwise; a background push worker stores every subscriber's encrypted session for 30 days to power a feature **no client can even subscribe to**.
2. **Security:** the full session credential (a 30-day bearer blob) is handed to JavaScript and mirrored into `localStorage`, nullifying the HttpOnly cookie; logout never revokes server-side; TLS certificate verification is disabled for all portal traffic including passwords; the entire security posture (CORS, cookies, error leakage) silently collapses if `NODE_ENV` is not exactly `production`; there is no CI, no deployment documentation, and no security headers.
3. **Trust-critical data accuracy:** the subject page **fabricates the attendance denominator** ("Attended 17 / Total 23" next to a 22-row log), a marks modal shows "10.0 / **100** → Grade projection: **F**" for a 10/**15** (66%) score, grade cards default `status` to `"Pass"` so an `F` can never be marked failed, subjects with **zero classes ever held** are shown as failing attendance, and "official" attendance percentages can be read from a client-editable URL parameter.
4. **Reliability:** one Redis blip permanently disables the cache and **breaks login for the process lifetime** (`retryStrategy: () => null`), the health check reports `ok` regardless, there is no error tracking, and no `unhandledRejection` handler exists.

None of these require architectural rework — every one is a contained, listable fix. The honest summary: *the app works and its core math is well-tested, but shipping it today would expose student PII, show some students wrong academic numbers, and fail in ways nobody would notice until users complain.*

---

## 2. Production Readiness Rating

### 🟠 Needs Important Fixes

**Why not 🟡/🟢:** Confirmed unauthenticated PII endpoint, open database RLS policy, disabled TLS verification, JS-readable 30-day session credentials with no server-side revocation, a config-gated security posture with an insecure documented default, a Redis failure mode that bricks login, zero CI/CD, zero deployment documentation, and multiple TRUST-CRITICAL display defects. Any one of the first four is disqualifying for a launch handling real student credentials.

**Why not 🔴:** The foundation is sound — tests pass (238/238), types and lint are clean, no secrets are in git, auth/rate-limit/validation primitives exist and work, cache and portal-error mapping are well designed, and every critical finding is a bounded fix rather than a redesign. A focused P0 pass (Section 20) would move this to 🟡 quickly.

---

## 3. Critical Issues

*Full finding format is used for all Critical and High items; Medium/Low items are consolidated in later sections.*

### C1 — Unauthenticated endpoint dumps all stored feedback PII
- File: `backend/src/routes/feedback.ts`
- Line: 296-303
- Severity: **Critical**
- Status: Confirmed · Confidence: High
- Category: Privacy / Access Control
- What was found: `GET /api/feedback` has **no session or identity check** and returns the 50 most recent records including `enrollment`, `email`, `name`, `message`, and `metadata` (source URL, device, user-agent) from Supabase or the local JSON file (`feedbackRepository.ts:156-177`).
- Why it matters: Anyone on the internet can harvest student enrollment numbers, emails, and free-text messages. The frontend never calls it (`git grep /api/feedback -- frontend` → only the POST), so it is pure attack surface with zero product value as shipped.
- Recommended action: Delete the route, or gate it behind an authenticated admin check and strip PII fields. Ship before first production traffic.

### C2 — Full session credential exposed to JavaScript and mirrored into `localStorage`
- File: `frontend/hooks/useAuthFlow.ts` (158-160, 262-264), `frontend/utils/api.ts` (13-17, 68-85), `backend/src/routes/auth.ts` (219-224), `backend/src/routes/session.ts` (34-35)
- Line: useAuthFlow.ts:159; api.ts:13-16; auth.ts:222; session.ts:35
- Severity: **Critical**
- Status: Confirmed · Confidence: High
- Category: Auth / Session Management
- What was found: The AES-256-GCM encrypted session blob — a full bearer credential containing the CampusLynx JWT — is delivered **three ways**: HttpOnly cookie, login/refresh JSON body (`sessionToken`), and `x-session-token` response header (explicitly CORS-exposed at `backend/src/index.ts:85`). The frontend persists it in `localStorage.sessionToken`. `extractEncryptedSession()` (`session.ts:12-17`) accepts cookie **or** header.
- Why it matters: Any XSS, malicious extension, or shared-device access reads `localStorage.sessionToken` and fully impersonates the student for up to 30 days (auto-renewed). The HttpOnly attribute provides no protection; the token can also be replayed cross-origin as a plain header.
- Recommended action: Cookie-only auth. Remove `sessionToken` from response bodies, stop sending `x-session-token`, remove it from `exposedHeaders`, delete the localStorage mirror and header-replay code.

### C3 — Logout never revokes the session; tokens are stateless and auto-renew
- File: `backend/src/routes/auth.ts`, `backend/src/routes/session.ts`
- Line: auth.ts:311-339 (clearCookie only); session.ts:44-67 (no denylist)
- Severity: **Critical**
- Status: Confirmed · Confidence: High
- Category: Auth / Session Management
- What was found: `/api/logout` only clears the cookie. There is no server-side revocation list or session id check; any previously captured token (e.g. from C2) remains valid until the embedded portal JWT expires and is transparently renewed by `getOrRenewCampusLynxIdentity`, sliding the 30-day lifetime forward.
- Why it matters: Logout gives a false sense of security; a stolen token survives logout and cannot be revoked if compromised. "Persistent sessions" becomes "unrevocable sessions."
- Recommended action: Embed a session id (`jti`) in the encrypted payload, maintain a Redis denylist checked on every request, invalidate on logout. Reduce the sliding window.

### C4 — TLS certificate verification disabled for all portal traffic (passwords included)
- File: `backend/src/portal/client.ts`
- Line: 46 (`rejectUnauthorized: false`, applied at 115-116)
- Severity: **Critical**
- Status: Confirmed · Confidence: High
- Category: Crypto / Transport
- What was found: The https agent for every CampusLynx request disables certificate and hostname validation. This agent carries login password submissions (`generateWebToken`) and bearer tokens.
- Why it matters: A network MITM (compromised campus Wi-Fi, hostile network) can impersonate the portal and capture raw student passwords and session tokens, defeating both TLS and the app's own AES body encryption.
- Recommended action: Set `rejectUnauthorized: true`. If the portal serves a broken/private chain, pin its CA explicitly via `ca:` — never disable validation. (Caveat, per architecture review: this may be a deliberate workaround for the portal's certificate; the fix is CA pinning either way.)

### C5 — Supabase RLS policy grants full access to every role
- File: `backend/src/db/schema.sql`
- Line: 20-29
- Severity: **Critical**
- Status: Confirmed (policy text) · Confidence: High
- Category: Access Control / Privacy
- What was found: RLS is enabled, but the only policy is `create policy "service role full access" on feedback for all using (true) with check (true);` — while the comment above it claims "The anon key ... cannot read this table." Under Supabase's standard default privileges, any holder of the publishable anon key can select/insert/update/delete the `feedback` table.
- Why it matters: The table containing student PII has no effective access control despite appearing protected. The anon key is designed to be public.
- Recommended action: Restrict the policy (`to service_role`), verify the anon key is never used client-side, and adopt versioned migrations instead of hand-running `schema.sql`.

### C6 — All security posture silently collapses when `NODE_ENV` is not `production`
- File: `backend/src/index.ts`
- Line: 76-78 (CORS: `cb(null, true)` for **any** origin), 79 (localhost allowed even in prod), 115-121 (verbose errors); `backend/src/routes/session.ts:28-29` (cookies `secure:false, sameSite:'lax'`); `backend/.env.example:21` documents `NODE_ENV=development`
- Severity: **Critical**
- Status: Confirmed (behavior) · Confidence: High
- Category: Config / Web Security
- What was found: If `NODE_ENV` is unset or misspelled: CORS allows **any website to make credentialed requests**, error messages leak internals, cookies are issued without `Secure`, and the pino-pretty dev transport is used. There is no startup warning or fail-fast for this (unlike the existing `validateKey` gate at `index.ts:36-42`).
- Why it matters: One missing env var on the backend host = full CORS bypass with credentials. The documented default in `.env.example` is the insecure one.
- Recommended action: Fail closed always — enforce the origin allow-list regardless of `NODE_ENV`, and abort boot (or loudly warn) if `NODE_ENV !== 'production'` when `CORS_ORIGIN` is unset.

### C7 — Redis failure permanently breaks login and disables the cache for the process lifetime
- File: `backend/src/utils/cache.ts`
- Line: 24 (`retryStrategy: () => null`), 41-66 (error → `null`, no memory fallback once Redis configured), 62-65
- Severity: **Critical**
- Status: Confirmed · Confidence: High
- Category: Reliability
- What was found: `retryStrategy: () => null` tells ioredis to **never reconnect** after the first failure (verified against installed `ioredis@5.11.0`: status goes to `end`, subsequent commands reject). All cache errors are swallowed into `null`, and the in-memory fallback is only used when Redis was never configured. Login stores captcha/pending-login state in the cache (`auth.ts:188-193`) — with reads returning `null`, `POST /api/auth` always answers *"Your login session expired."* Meanwhile `/health` still returns `ok`.
- Why it matters: One transient Redis blip at boot or runtime = **logins fail forever and every request hammers the portal** until someone restarts the process. The failure is silent.
- Recommended action: Real backoff `retryStrategy` + reconnect; fall back to the in-memory cache on Redis command errors; don't store single-flight login state exclusively in Redis; log degradation once.

### C8 — No CI/CD, no deployment configuration, no deployment documentation
- File: `README.md` (5 lines), absence of `.github/**`, `Dockerfile*`, `vercel.json`, `Procfile`, `nginx*`, `*.yml`
- Line: README.md:1-5
- Severity: **Critical**
- Status: Confirmed · Confidence: High
- Category: Deployment / Process
- What was found: Zero deployment/CI artifacts anywhere in the repo. The frontend is Vercel-shaped (`@vercel/analytics`, CORS example `*.vercel.app`), the backend is a long-running Node server with **no root `start` script** and no documented host. `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3001` at 11 call sites — deployed without it, every API call from a student's browser targets *their own* localhost while the app appears "up." The `next.config.ts:8-15` rewrite proxy to `/api/*` is dead config (no relative call sites).
- Why it matters: Deployment is tribal knowledge; nothing gates merges on the (green) test/type/lint suite; a single missed env var makes the launched app completely non-functional with no error surfacing.
- Recommended action: GitHub Actions running `type-check + lint + test` on PR; a `docs/DEPLOYMENT.md` covering both targets and required env vars; make `NEXT_PUBLIC_API_URL` mandatory in production (or switch to relative URLs + the existing rewrite).

### C9 — Marks modal displays raw scores as "/100" and projects a failing grade for passing marks
- File: `frontend/components/PerformanceHub.tsx`
- Line: 404 (`/ 100`), 72-81 (`getProjectedGrade` thresholds 80/75/70/...), 380, 401
- Severity: **Critical** · **TRUST-CRITICAL**
- Status: Confirmed · Confidence: High
- Category: Data Accuracy / Grades
- What was found: `selectedCourseMarks.total` is the sum of raw `obtainedmarks` (`backend/src/portal/dashboard.ts:303-309`) across components with their own maxima, but the footer prints `10.0 / 100` and `getProjectedGrade(10)` → **"F"**. Fixture `tests/fixtures/19-marks-1.json` shows TEST-1 is out of **15**: a real 10/15 = 66.7% (a B-range score) is rendered as "10.0 / 100" with **"Grade projection: F"**. `weightage`/`obtainedWeightage` are ignored entirely.
- Why it matters: Students are shown a failing projection for a passing mark on a panel styled as authoritative academic performance data — directly causes bad academic anxiety/decisions.
- Recommended action: Render `sum(obtained) / sum(max)` per course (both already in `components`), delete the `/100` literal, derive the projection from the percentage or `obtainedWeightage` — or remove the projection until the grading scheme is verified.

### C10 — Grade card can never mark a subject as failed (`status` defaults to `"Pass"`)
- File: `backend/src/portal/grades.ts` with `frontend/components/GradeCard.tsx`
- Line: grades.ts:42 (`status: text(raw.status || raw.resultstatus || raw.result || "Pass")`); GradeCard.tsx:64-66, 213, 257
- Severity: **Critical** · **TRUST-CRITICAL**
- Status: Confirmed (code path) · Confidence: High (logic) / Medium (whether the portal ever omits `status`)
- Category: Data Accuracy / Grades
- What was found: Because `status` is defaulted to `"Pass"`, GradeCard's safeguard `status === "pass" || !["F","FAIL","AB"].includes(grade)` is **always true** — the F/FAIL/AB check can never fire. "Subjects Cleared" reports `n / n` even with an F, and mobile renders `sub.status || "Pass"`.
- Why it matters: The card is styled "Official Result Sheet" and can show green Pass ticks and a cleared-subjects count that is flat wrong — the highest-stakes misstatement possible in the app.
- Recommended action: Default `status` to empty; derive Pass/Fail from `grade` only when the portal supplies no status. Add a fixture-based test with a failing row.

### C11 — Subject page fabricates the attendance denominator and presents it as fact
- File: `frontend/app/dashboard/subject/[id]/page.tsx`
- Line: 56 (`urlPct` precedence), 61-64 & 97-100 (`baseHeld = max(classesHeld, round(attended / (officialPct/100)))`), 68-74 & 103-107 (hardcoded `estHeld = 20` shown as real)
- Severity: **Critical** · **TRUST-CRITICAL**
- Status: Confirmed · Confidence: High
- Category: Data Accuracy / Attendance
- What was found: The displayed "Total" is **re-derived from the portal percentage**, not from the log rows: fixture `20-attendance-percentage-L1-250030.json` has 22 rows (17 present), official `LTpercantage = 73.9`, so the UI shows **"Attended 17 / Total 23"** beside the 22-row Day-by-Day Log. Before logs load, a fabricated baseline of **20 classes** ("Attended 14 / Total 20") renders with no "estimated" label. All "safe to miss N classes" advice and every simulated percentage inherit this invented denominator.
- Why it matters: The single most safety-critical number in the product — *how many classes you may skip* — is silently invented and cannot be reconciled with the visible log table.
- Recommended action: Display `classesHeld`/`classesAttended` verbatim; if they disagree with the official percentage, show an explicit "counts differ from portal percentage" note. Remove the `estHeld = 20` placeholder (loading state only).

### C12 — Portal's official percentage disagrees with the portal's own log rows for 3 of 11 subjects; conflict is masked
- File: `backend/src/portal/attendance.ts`
- Line: 487-494 (percentage override), 373-390 (row dropping), 259-261
- Severity: **Critical** · **TRUST-CRITICAL**
- Status: Confirmed (arithmetic) · Confidence: High (math) / Low (cause)
- Category: Data Accuracy / Attendance
- What was found: `percentage = officialPercentage > 0 ? officialPercentage : computed`. Recomputed from fixtures: **CS109** official 73.9 vs logs 17/22 = **77.3**; **HS301** 83.3 vs 20/23 = **87.0**; **CS120** 80.6 vs 29/37 = **78.4** — deltas up to 3.7 pp. The app hides the conflict (by fabricating the denominator, C11) instead of surfacing it. Possible causes: incomplete log feed, `Regular+Extra` classes in the percentage but not logs, or `mapAttendanceLog` dropping non-Present/Absent rows (duty leave).
- Why it matters: Two "official" numbers exist and disagree; skip/attend advice inherits whichever was chosen with no indication to the student.
- Recommended action: Compute both server-side, return `percentageSource: "portal" | "derived"` plus both values, and show a discrepancy badge when they differ. Capture a live side-by-side sample to determine the root cause.

---

## 4. Trust-Critical Issues

*Anything that could show a student incorrect academic information.*

| # | Issue | File:Line | Severity | Status |
|---|---|---|---|---|
| T1 | Marks shown as `/100` + "Grade projection: F" for a 66% score | `PerformanceHub.tsx:404,72-81` | Critical | Confirmed |
| T2 | Grade card can never show Fail (`status` defaults "Pass") | `portal/grades.ts:42`, `GradeCard.tsx:64-66` | Critical | Confirmed |
| T3 | Fabricated attendance denominator + `estHeld = 20` placeholder | `subject/[id]/page.tsx:61-74,97-107` | Critical | Confirmed |
| T4 | Portal % vs log-derived % disagree for 3/11 subjects, masked | `portal/attendance.ts:487-494` | Critical | Confirmed |
| T5 | "Official %" read from client-editable URL `?pct=` | `routes/attendance.ts:74`, `subject/[id]/page.tsx:56`, `AttendanceTracker.tsx:130` | High | Confirmed |
| T6 | Subjects with **zero classes ever held** (CS211, CS003) counted & coloured as failing attendance; "Attention Required (<75%)" includes them | `AttendanceTracker.tsx:53,37-42,89-93`; `portal/attendance.ts:224-229` | High | Confirmed |
| T7 | Exam dates parsed DD/MM with **no month validation** → `"01/13/2026"` silently rolls to Jan 2027 and sorts to the end | `portal/exam.ts:296-303,99-123,315-319`; duplicated `ExamSchedule.tsx:90-103` | High | Confirmed (code) / Low (which format portal sends — no exam fixture exists) |
| T8 | "Recent Marks" = first 10 portal rows in portal order, **unsorted**, rendered as bare numbers with no `/max` | `portal/dashboard.ts:314-320`, `PerformanceHub.tsx:192,226` | High | Confirmed (no sort) / Low (portal order) |
| T9 | Bidirectional substring subject matching can open the **wrong course's** marks (`m.subject.includes(name) \|\| name.includes(m.subject)`) | `PerformanceHub.tsx:41-46` | High | Confirmed (logic) |
| T10 | Data up to **2 h stale** displayed as "Last synced: now"; server sends `X-Cache-Status`/`ttl` but the frontend never renders them; `cachedAt` re-stamped at client fetch time | `routes/dashboard.ts:138-165,186-204`, `useDashboard.ts:71-86`, `dashboard/page.tsx:256` | High | Confirmed |
| T11 | **Three competing threshold scales** for the same metric: tracker 85/75, dashboard banner 75/70, subject ring 91/81/71 — same % gets different colours and verdicts | `AttendanceTracker.tsx:21-43`, `dashboard/page.tsx:213-231`, `subject/[id]/page.tsx:122-133` | High | Confirmed |
| T12 | Rounding can contradict the status label: component tiles use `toFixed(0)` (74.6 → **"75%"**) beside an unrounded CRITICAL badge | `AttendanceTracker.tsx:198,202,206` vs `:53` | Medium | Confirmed |
| T13 | Dashboard overall banner (`overallPct.toFixed(0)` vs unrounded ≥75 threshold → "75%" next to "Below 75% Requirement") is **currently unreachable** because summary `classesHeld = 0` (`portal/attendance.ts:269`) so `totalHeld > 0` gates it off — but it becomes T-critical the moment counts flow | `dashboard/page.tsx:209-243`, `portal/attendance.ts:269` | Medium | Confirmed (latent) |
| T14 | Exam "Today/Tomorrow" badges and formatting use the **device** timezone (`toLocale*"en-IN"` with no `timeZone`; no `Asia/Kolkata` anywhere in frontend) — wrong for any device set outside IST | `ExamSchedule.tsx:115,154,170,184-205` | Medium | Confirmed |
| T15 | Exam time filter `^(12:00\|05:30) am$ → ""` hides legitimate early-morning slots as "Timing to be announced" | `ExamSchedule.tsx:160-165` | Medium | Confirmed |
| T16 | Grade fallback `stynumber \|\| "1"` can return **semester-1 results labelled as the current semester** on a transient portal error | `portal/grades.ts:103` | Medium | Confirmed (fallback) / Low (reachability) |
| T17 | "Paper N" renumbers from the **filtered** array index after search | `ExamSchedule.tsx:326,341` | Medium | Confirmed |
| T18 | Subject de-dup keys on stripped display name — two same-named subjects (re-sit/lab) silently lose one record | `portal/attendance.ts:250-254,165-168` | Medium | Confirmed (logic) |
| T19 | Dashboard error fallback serves stale cache with **no `ttl`** — exactly when data is oldest, the freshness signal is missing | `routes/dashboard.ts:186-204` | Medium | Confirmed |
| T20 | Component tiles render **"0%"** for components that don't exist (lecture-only subject shows "Tutorials 0%") | `AttendanceTracker.tsx:198-206`; `portal/attendance.ts:256-258` | Medium | Confirmed |
| T21 | Marks total sums raw obtained across differing maxima, ignoring `weightage`/`obtainedWeightage` | `portal/dashboard.ts:303-309` | Medium | Confirmed |
| T22 | Grade point renders `0` (not "—") when unpublished (`num()` coerces before `??`) | `GradeCard.tsx:210`, `portal/grades.ts:40` | Low | Confirmed |
| T23 | Static copy "Secure portal session is active and verified." rendered even beside 2 h-stale data; "Eligible for Examinations" claim from computed % | `dashboard/page.tsx:243,259` | Low | Confirmed (banner currently latent — T13) |
| T24 | Notices fetched, cached, asserted in tests — **never rendered** in the frontend (`date: ""` anyway) | `portal/dashboard.ts`, `dashboard.campuslynx.test.ts:116`, zero `notice` matches in `frontend/` | Medium | Confirmed |

**Positive assurance (verified, so the list above isn't misread):** the bunk/skip math in `frontend/utils/bunkHelpers.ts` is **correct** (hand-verified against `bunkPlanner.test.ts`); attendance log date sorting is arithmetic and TZ-free with range validation (`portal/attendance.ts:146-157`); the full test suite passes under `TZ=UTC` (host-timezone independent); component-wise percentage math matches fixtures for 8/11 subjects; 401/SESSION_EXPIRED mapping and attacker-supplied `instituteid` rejection are tested.

---

## 5. Security Audit

### 5.1 Authentication & Authorization

| Finding | Location | Severity | Status |
|---|---|---|---|
| Session credential in `localStorage` + header (C2) | `useAuthFlow.ts:159`, `api.ts:13-16`, `session.ts:35`, `index.ts:85` | Critical | Confirmed |
| No server-side logout revocation; 30-day auto-renewing stateless token (C3) | `auth.ts:311-339` | Critical | Confirmed |
| Auth gate is **localStorage-only** (`enrollment` key); no boot-time session validation; first data call decides, and its 401 is rendered as *"Portal session is syncing in background"* indefinitely | `dashboard/page.tsx:86-93`, `useDashboard.ts:94-105`, `login/page.tsx:30-35` | High | Confirmed |
| Dashboard 401 masked by fallback-to-stale-cache returning `200 + cached:true` — client never learns it must re-login | `routes/dashboard.ts:185-212` | High | Confirmed |
| `GET /api/dashboard/cache-status?enrollment=` **unauthenticated** — presence/refresh oracle for any enrollment; polled every 60 s by the frontend | `routes/dashboard.ts:276-296` vs authenticated sibling at `:90-123` | High | Confirmed |
| Attendance detail `link` (`stynumber`/`registrationid`/`subjectid`) accepted from client without verifying it belongs to the caller (only `instituteid` is session-derived) — potential cross-student read if the portal authorizes by body rather than JWT subject | `routes/attendance.ts:34-76`, `portal/attendance.ts:328-362` | High | **Potential** (needs one live probe) |
| Feedback attribution trusts client-supplied `enrollment` over the session (`let enrollment = sanitized.enrollment`) — feedback (and its reply-to) can be attributed to another student | `feedback.ts:104-118`, `feedbackValidation.ts:97` | Medium | Confirmed |
| Subscribe/unsubscribe use different ownership checks and different token transports (cookie-only vs cookie-or-header) — one can 403 while the other succeeds | `notifications.ts:39,51` vs `:104,115` | Medium | Confirmed |
| No Next.js `middleware.ts`; dashboard shell served to unauthenticated clients before client-side redirect | absence of `frontend/middleware.ts` | Low | Confirmed |
| **Good:** per-route auth rate limits (10-30/min), JSON-schema request validation on auth routes, passwords never persisted into sessions (`auth.ts:206-213`), 403 on forged enrollment in dashboard tests | `auth.ts:248-288` | — | Confirmed |

### 5.2 API Security

- **Input validation:** Auth routes use Fastify JSON schemas. Dashboard/attendance/grades routes do minimal validation (query params trusted, `pct` float-parsed but unvalidated — T5). Feedback has solid validation (honeypot, duplicate window, rating/email rules — tested).
- **Injection:** No SQL — Supabase client uses parameterized builders; no `eval`/`Function`/shell usage found. Portal bodies are AES-encrypted JSON built from structured objects. **No SQLi/command-injection surface identified.**
- **XSS/HTML injection (confirmed):** feedback email interpolates `metadata.url`, `metadata.device`, `metadata.userAgent` **without** `escapeHtml` (message/subject/name *are* escaped) → HTML/link injection into the maintainer's inbox; arbitrary metadata object also persisted (`feedback.ts:213-231`, `feedbackValidation.ts:98`).
- **CSRF:** prod cookie is `SameSite=None; Secure` with `credentials:true` CORS and **no CSRF tokens or Origin checks**. Mostly mitigated by JSON content-type preflight, except `GET /api/dashboard/invalidate` — a state-changing action over GET (`dashboard.ts:226`) reachable by simple requests.
- **Rate limiting:** global 300 req/min per IP + per-route auth limits — **but** no `trustProxy` anywhere (`index.ts:56`), so behind any proxy/CDN all users share one bucket (mass 429s on campus NAT), while feedback dedupe *trusts* client-controlled `x-forwarded-for` (`feedback.ts:91-92`). Store is in-memory (per-instance, resets on deploy). No dedicated limit on feedback POST (spam risk).
- **Error handling:** production error handler masks 5xx bodies (`index.ts:113-124`); portal errors map to fixed 401/502 strings without leaking upstream payloads — **good**. Non-production returns verbose errors.
- **SSRF/path traversal:** `PORTAL_BASE_URL` is env-configured, never user-controlled; no user-supplied URLs fetched by the backend. **No surface found.**
- **Request sizes:** Fastify default body limit (1 MB) applies; feedback messages length-capped. Adequate.

### 5.3 Web Security / Headers

| Control | Status |
|---|---|
| CSP | ❌ Missing (backend and `next.config.ts` `headers()` empty) |
| X-Frame-Options / frame-ancestors | ❌ Missing (clickjacking) |
| X-Content-Type-Options | ❌ Missing |
| Referrer-Policy | ❌ Missing |
| HSTS | ❌ Missing (assumes HTTPS) |
| helmet / `@fastify/helmet` | ❌ Not present |
| CORS | ⚠️ Allow-list in prod, but wildcard when `NODE_ENV≠production`, localhost carve-out in prod, origin reflected in error text (C6) |
| Cookies | ⚠️ `HttpOnly` ✅; `Secure`+`SameSite=None` only when prod (C6); undermined by C2 |
| Clickjacking/jacking | ❌ No frame protection |

### 5.4 Dependency Security

- `fastify@4.29.1` (Fastify 5 is current), `@fastify/cors`/`@fastify/cookie` v8 correspondingly a major behind; `axios@1.6.x`; `next@15.5.18`, `react@19` (current); `nodemailer@10`. No npm audit was run (write-risk constraints) — **recommend running `npm audit` in CI.**
- Runtime deps that are build/dev-only: `typescript`, `@types/node`, `@types/web-push`, `pino-pretty` (dev transport) in `dependencies`; `pino` declared but never imported.
- `engines.node >=16` is below Next 15's floor (≥18.18); no `.nvmrc`; frontend has no `engines`.
- No suspicious/squat-risk packages identified. Lockfile present and tracked; workspace lockfiles correctly ignored.

---

## 6. Secret & Credential Audit

**Result: no secrets are committed to the repository.** Verified via `git ls-files`, `git log --all --diff-filter=A`, and pattern greps (`eyJ`, `AIza`, `-----BEGIN`, `service_role=`, `Bearer `) across tracked files — only placeholders/tests matched.

| Location | Type | Status |
|---|---|---|
| `backend/.env` (on disk, gitignored, **untracked**) | `ENCRYPTION_KEY` (AES-256-GCM master), `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_APP_PASSWORD`, `SMTP_USER`, Redis connection details — VALUE REDACTED | Present locally; protected by `.gitignore:20` |
| `frontend/.env.local` (on disk, gitignored, untracked) | `NEXT_PUBLIC_API_URL`, `NODE_ENV` — VALUE REDACTED (intentionally public) | OK |
| `mcp.json:7` | Figma personal access token (`FIGMA_ACCESS_TOKEN`) — VALUE REDACTED | gitignored (`.gitignore:61`), untracked — **but exists on disk; do not commit** |
| `backend/.env.example`, `frontend/.env.example` (tracked) | Placeholder values only | Clean |
| Git history | No `.env*` ever added (`git log --all --diff-filter=A` → none) | Clean |

**Additional exposure vectors found (no values leaked, but fix the paths):**
- `backend/src/index.ts:147-151` — boot log prints the **full `REDIS_URL`**, which typically embeds `redis://user:pass@...`. No pino `redact` config exists anywhere. → *Log host/port only; add pino redaction.*
- PII in logs: enrollment numbers logged at info level across routes (`dashboard.ts:126`, `auth.ts:218,227`, `notifications.ts:75,138`, `feedback.ts:262`). No passwords observed in logs. → *Hash/truncate identifiers or restrict to debug.*
- **Tracked test fixture with possible real student data:** `backend/tests/fixtures/campuslynx-cipher.json` contains a `username` in roll-number format that matches no DEMO/TEST pattern (all other fixtures do), plus AES key/IV/ciphertext and a captcha answer — consistent with the documented "genuine request captured from a real browser" (`crypto.test.ts:4-5`). Also `10-session.json` / `13-sgpa-loadData.json` contain DEMO-pattern names + enrollment numbers (likely synthetic; token fields are truncated and not JWT-shaped). Repo has a GitHub remote.
- `.gitignore` covers `.env`, `.env.local`, `.env.*.local` but **not** `.env.production` / `.env.staging` (verified with `git check-ignore`) — one `echo` from a commit.

**Rotation recommendation:** no exposure was confirmed, so rotation is precautionary. If `campuslynx-cipher.json.username` is a real roll number: re-capture with a synthetic username (or `git filter-repo` the file) and confirm the repo is private. Broaden `.gitignore` to `.env*` with `!.env.example`.

---

## 7. Student Privacy

**What is collected:** enrollment number, full name, branch/semester, DOB (in session payloads), portal password (transient — forwarded to portal, never persisted server-side: `auth.ts:206-213` stores `password: ""`), attendance records, marks/grades, exam schedules, profile photo-less identity, feedback (name/email/enrollment/message/URL/device/user-agent), push subscription endpoints, and a **30-day encrypted session copy in Redis** (`secure_credentials:<enrollment>`, `notifications.ts:70`).

| Issue | Detail | Severity |
|---|---|---|
| Unauthenticated PII dump | `GET /api/feedback` (C1) | Critical |
| Open DB RLS on the PII table | `schema.sql:20-29` (C5) | Critical |
| 30-day session retention for a **dead feature** | Push worker stores sessions so it can re-login as the student every 30 min — but the frontend has **zero** `Notification.requestPermission` / `pushManager.subscribe` / `/api/notifications/subscribe` calls. Server-side credential retention with no reachable product surface | High |
| Feedback email injection | Unescaped metadata into HTML email (5.2) | Medium |
| PII in logs | Enrollment numbers at info level, no redaction | Medium |
| PII-shaped fixture tracked in git | `campuslynx-cipher.json` (6) | Medium |
| Data minimization | Feedback collects URL/device/user-agent — marginally justified for debugging, but never displayed anywhere (no consumer of `GET /api/feedback`) → unnecessary retention | Medium |
| Data retention/deletion | No student-facing deletion path; Redis/Supabase data retained indefinitely; no privacy policy or data-access disclosure on the login screen ("🔒 Secure. Encrypted. Persistent." is the entire disclosure, `login/page.tsx:59-62`) | Medium |
| Third parties | `@vercel/analytics` (pageviews only — enrollment does **not** appear in dashboard URLs ✅), Gmail SMTP, Supabase, web-push/VAPID. No enrollment/PII found in URLs except `enrollment` query params on same-origin API calls | Low |
| Client-visible PII in JS | Student name/enrollment in `localStorage` (used for nav) — expected for the app, but combined with C2 enlarges XSS blast radius | Low |

**Data-flow summary:** credentials → backend → AES-128-CBC → CampusLynx (over TLS with verification disabled, C4) → JWT stored inside the encrypted cookie **+** header **+** localStorage **+** Redis (30 days) → academic data cached in Redis (2 h) and browser → feedback flows to Gmail + Supabase + local JSON + (unauthenticated) GET endpoint.

---

## 8. Unused & Dead Code

All "verified dead" items were checked against static imports, dynamic imports, routing, config, scripts, and runtime references (`git grep`), per the audit rules.

**Verified dead (zero non-self importers):**

| Item | Evidence | Size |
|---|---|---|
| `frontend/components/GpaPredictor.tsx` + `frontend/utils/gpaHelpers.ts` | Only self-refs (`GpaPredictor.tsx:24,40,372`); gpaHelpers imported only by GpaPredictor + `backend/tests/gpaHelpers.test.ts:7` | 372 lines |
| `backend/src/utils/axios.ts` (`axiosInstance`) | 0 importers repo-wide | 18 lines |
| `frontend/utils/formatters.ts` → `formatDOB:9`, `isValidDOB:26`, `isValidPassword:64`, `formatDate:71` | 0 importers (ExamSchedule has a private `formatDate`); relics of the removed DOB login flow | 4 functions |
| `AttendanceTracker.tsx:246` `export const BunkMeter` | 0 importers | 1 line |
| `API_URL` consts at `useDashboard.ts:29`, `useExamSchedule.ts:14`, `useAttendanceDetails.ts:17` | declared, never referenced | 3 |
| `useDashboard.ts:109-120` `RELOGIN_FAILED`/503 retry branch | backend has **zero** `503`/`RELOGIN` matches — unreachable | 12 lines |
| `(fastify as any).globalCache` fallback (`exam.ts:28`) | never decorated on the server (only `request.globalCache`) | 1 |
| `x-enrollment` header fallback (`dashboard.ts:107`) | 0 senders in frontend | 1 |
| `logout.ts:21` `removeItem("dob")` | `"dob"` never written anywhere | 1 |
| `GET /api/feedback` | 0 frontend refs (POST only) — **also C1 security hole** | 8 lines |
| Entire push pipeline: notifications endpoints + `pushWorker` + `secure_credentials` + `sw.js` push handlers | 0 frontend refs to `/api/notifications`; no subscribe UI anywhere | ~250 lines |
| Notices fetch/parse/cache | 0 refs in frontend (T24) | ~30 lines |
| Orphaned route: `/dashboard/grades` | Fully built page; **no nav link anywhere** (`git grep "dashboard/grades" -- frontend` → 0) | 109 lines |
| `backend/src/utils/userAgent.ts` `getRandomUserAgent`, `encryption.ts:91` `generateEncryptionKey`, `session.ts:7,171`, `portal/client.ts:402` re-export | test-only or self-only | several |
| Shared types never imported: `AttendanceItem`, `LoginIdentifyPayload/Response`, `LoginPasswordPayload`, `ApiError`, `AuthState(Base)`, `DashboardStateBase`, `ExamSemester`, `GradeSemester` (+ `ExamEvent`/`MarkComponent` exported but only used internally) | no importer outside `shared/` | ~10 exports |
| `GET /api/dashboard/invalidate` via GET (should be POST) | works, but method misuse | — |
| Dead config: `next.config.ts:8-15` `/api/*` rewrite (no relative call sites), frontend `.env.example` `NEXT_PUBLIC_SESSION_TIMEOUT`, backend `.env.example` `SMTP_SECURE`, `SUPABASE_KEY` (code reads `SUPABASE_ANON_KEY`) | grep-verified | — |
| `backend/dist/backend/src/parsers/*.js` on disk | stale artifacts from a pre-refactor layout; `src/parsers/` no longer exists (dist is gitignored) | — |

**Duplicate/redundant logic:** two session keep-alive hooks (`useSessionHeartbeat` 4-min mounted in every `DashboardLayout` **and** `useSessionKeepAlive` 5-min mounted on `/dashboard`, overlapping `POST /api/auth/refresh`); `getInitials` duplicated (DashboardLayout ↔ MobileBottomNav); magic `75` threshold hardcoded ≥8× across 4 files; API base URL default copy-pasted into 8 files; two API-client stacks (only 4 files use `apiClient` — the rest bypass the 401→refresh interceptor and dead-end with misleading messages: *"Portal session is syncing in background"* / *"Grade card temporarily unavailable"*); two stale comments claiming "10 minutes" for 4/5-min intervals.

**TODO/FIXME/HACK markers:** **zero** in source (repo-wide grep). *Note: debt in this repo is expressed as unreachable code and stale comments, not markers — a TODO grep would have found nothing while ~1,200 lines of dead code exist.*

**Rough dead-code total: ~1,000–1,300 lines** across frontend components, hooks, utils, backend routes, and shared types.

---

## 9. Bugs & Potential Issues

| # | Bug | File:Line | Sev | Status |
|---|---|---|---|---|
| B1 | Redis never reconnects → login permanently broken + full portal amplification (C7) | `cache.ts:24` | Critical | Confirmed |
| B2 | `EstHeld=20` / `baseHeld` fabrication (C11) | `subject/[id]/page.tsx:61-74` | Critical | Confirmed |
| B3 | Marks "/100" + F projection (C9); grades always "Pass" (C10) | `PerformanceHub.tsx:404`; `grades.ts:42` | Critical | Confirmed |
| B4 | Feedback DB insert failure still returns HTTP 200 "sent" (`storedInDb:false`), and `getSupabaseClient()` is called **outside** the try block → a malformed `SUPABASE_URL` can throw uncaught through a route with no try/catch → 500 after user submission | `feedback.ts:87-294`, `feedbackRepository.ts:106,128,139` | High | Confirmed |
| B5 | Feedback writes `backend/data/feedback.json` **synchronously** (`readFileSync`+`writeFileSync` of the whole file) on the event loop for every submission, plus a fresh nodemailer transporter and awaited SMTP send per request | `feedbackRepository.ts:41-59,144`, `feedback.ts:136,252-259` | High | Confirmed |
| B6 | 401 handling split-brain: only 4 files use `apiClient` (refresh+retry); the rest never refresh, never redirect, and render fake-success states | `api.ts:39-100` vs `useGrades.ts:32-37`, `useFeedback.ts:18-22`, `useSessionKeepAlive.ts:42-57`, `logout.ts:29-32` | High | Confirmed |
| B7 | Keep-alive comment claims "401 → redirect to /login" but the catch swallows all errors → expired sessions surface as indefinite "syncing" state; only the subject page handles `SESSION_EXPIRED` | `useSessionKeepAlive.ts:52-57`, `useDashboard.ts:94-105` | High | Confirmed |
| B8 | Offline navigation fallback serves the **cached `/login` page** for any route (incl. `/dashboard`) — student with no signal appears "logged out"; no offline indicator; API responses never cached for offline reading | `public/sw.js:101-134` | High | Confirmed |
| B9 | Logout invalidates dashboard + push caches but **not** `grades` (1 h TTL survives on shared devices) | `auth.ts:317-318`, `grades.ts:31,51` | Medium | Confirmed |
| B10 | Graceful shutdown awaits `redis.quit()` with no timeout → can hang forever (no `process.exit`), and there are **no `unhandledRejection`/`uncaughtException` handlers** | `index.ts:126-134`, `cache.ts:168-172` | Medium | Confirmed |
| B11 | Push-worker `setInterval` has no overlap guard; a cycle >30 min stacks; first run only after 30 min; jobs are sequential O(subscribers × 7 portal calls) on the main event loop | `index.ts:156-161`, `pushWorker.ts:49-116` | Medium | Confirmed |
| B12 | Cache degrades silently: Redis configured-but-down → `get` returns null with **no** memory fallback, yet startup logs "Redis cache: …"; empty `error` handler; unbounded in-memory `Map`s never swept | `cache.ts:20-32,41-66`, `index.ts:147-151`, `feedbackValidation.ts:3` | Medium | Confirmed |
| B13 | Dark-mode FOUC: `.dark` class applied only in `useEffect` post-hydration; no pre-paint inline script; system theme changes ignored | `ThemeContext.tsx:20-42`, `layout.tsx:133-143` | Medium | Confirmed |
| B14 | `useDashboard` mounts a full fetch + 60 s `cache-status` poll + TTL timer **on every dashboard page navigation** (3 pages use it only for the student name); `app/dashboard/layout.tsx` is a passthrough so `DashboardLayout` (and its heartbeat) remounts each navigation | `useDashboard.ts:192-214`, `app/dashboard/layout.tsx:12-18` | Medium | Confirmed |
| B15 | Login reports network failures as credential errors: *"Unable to sign in. Please verify your details."* on timeout/offline (`!err.response` not distinguished); captcha input silently cleared on each failure | `useAuthFlow.ts:168-183`, `CampusLynxLoginForm.tsx:52-54` | Medium | Confirmed |
| B16 | Test suite mutates `process.env.DATA_PROVIDER` without restore (order-dependent under `--runInBand`); `swr.test.ts` tests code inlined from a deleted module with wall-clock assertions | `dashboard.campuslynx.test.ts:80`, `auth.campuslynx.test.ts:56`, `swr.test.ts:3-15` | Low | Confirmed |
| B17 | Notification VAPID keys fall back to throwaway per-boot pairs → production "works" (200s) but delivers nothing | `vapid.ts:6-23` | Low | Confirmed |
| B18 | Login enrollment validator contradicts its own help text (`isValidEnrollment` = `len≥6 && /^[A-Z0-9]+$/` accepts "ABCDEFGHI") | `formatters.ts:56-59`, `CampusLynxLoginForm.tsx:155-158` | Low | Confirmed |

**Missing error handling / edge cases:** dashboard `ErrorBanner` has **no Retry button** and the page body renders `null` when `!data` (blank screen); `/dashboard/exam` and `/dashboard/grades` empty states have no retry; subject page has the best pattern (Retry + "Log In Again") but is the exception.

---

## 10. Architecture

**Map:** `frontend/` (Next 15 App Router, 28 `'use client'` files, axios + hand-rolled SWR hooks) → `backend/` (Fastify: `routes/` HTTP layer, `portal/` upstream client + parsers, `utils/` cache/crypto/push, `db/` Supabase+JSON) → CampusLynx portal. `shared/types` is the single contract (consumed via tsconfig paths — **not** a workspace package).

**Flow:** login (`/api/init` captcha → `verify-user` → `auth`) returns the AES-256-GCM session blob (cookie + body + header) → data routes call `getOrRenewCampusLynxIdentity()` (decrypt, refresh portal JWT within 5 min of expiry, re-issue 30-day sliding cookie) → dashboard SWR-cached 5 min fresh / 2 h stale, grades 1 h, exam piggybacks on dashboard cache.

**Structural weaknesses:**
1. **Two parallel frontend API stacks** (intercepted `apiClient` vs bare axios/fetch) — the root cause of B6/B7; the 401 contract is implemented in exactly one of them.
2. **Session identity carried in three transports** (cookie/header/localStorage) instead of one — the root cause of C2/C3.
3. **Auth state = `localStorage.enrollment`**, not a validated session — no server-verified boot path.
4. **Cache invalidation is ad-hoc** (logout clears 2 of 3 prefixes; `GET` for a mutation; per-process `activeRefreshes` set that vanishes multi-instance).
5. **Half-built feature shipped back-to-front:** backend push pipeline + SW handlers exist; the client half doesn't (see §17).
6. **`shared/` is a pseudo-package** (path-mapped, no workspace entry, type-checked only as a side effect); backend `tsconfig` `rootDir: ".."` produces the unconventional `dist/backend/src/...` layout and compiles `../shared` into `dist/shared` (deploy scripts copying only `dist/backend` would break).
7. **Tests excluded from type-check and lint** (`tsconfig.json:28-29` excludes `**/*.test.ts`; lint is `eslint src`); two backend suites import frontend source across an undeclared workspace boundary.
8. **No TODO/FIXME debt, but heavy unreachable-code debt** — ~1,200 dead lines, two stale interval comments, dead fallback branches suggesting design decisions that no longer exist.

**Frontend/backend inconsistencies:** `RELOGIN_FAILED` 503 (client expects, server never sends); `x-enrollment` header (server accepts, client never sends); `cached`/`ttl`/`x-cache-status` emitted by server, consumed by no component; notices fetched server-side, rendered nowhere; `.env.example` drift in both directions (§19).

**Overall:** sound layering and a well-factored portal-client layer; the problems are at the seams (auth transports, cache contracts, dual API stacks), not in the core.

---

## 11. Performance

*(Measurements from the existing `.next` build, read-only.)*

| # | Finding | Evidence | Sev |
|---|---|---|---|
| P1 | **No code splitting** — `next/dynamic` used 0 times; `FeedbackModal` (379 L), bottom nav, sidebar statically imported into every dashboard page via `DashboardLayout` | grep = 0 matches; `DashboardLayout.tsx:18` | Medium |
| P2 | Cold `/dashboard` load ≈ **573 KB raw / 162 KB gzip** JS+CSS (12 files); app routes total 1.15 MB raw / 343 KB gz; fonts 536 KB woff2 across 18 files; no bundle analyzer configured | `.next/app-build-manifest.json` | Medium |
| P3 | Everything client-rendered (28 `'use client'` files); TTI = full JS execution + full API round-trip; no RSC prefetch/streaming | `frontend/app/**` | Medium |
| P4 | **7 sequential CampusLynx calls per dashboard cache miss** on a `maxSockets:1` agent (single socket serializes even the `Promise.allSettled` group); per-request client create/destroy → zero cross-request keep-alive → a TLS handshake per upstream call at scale | `portal/dashboard.ts:392-424`, `portal/client.ts:41-48,121-124` | High |
| P5 | **Uncached hot paths:** `/api/attendance/details` (1-3 sequential portal calls per subject click) and `/api/exam` (3 sequential calls per load **and per event switch**) have no cache at all; only grades (1 h) and dashboard are cached | `routes/attendance.ts:54-90`, `routes/exam.ts:7-76` | High |
| P6 | Two overlapping session keep-alives (4-min heartbeat + 5-min keepalive + unthrottled focus/visibility refresh) against a 30/min per-IP refresh cap; `DashboardLayout` remount per navigation restarts the immediate ping | `useSessionHeartbeat.ts:7,48-53`, `useSessionKeepAlive.ts:65-95` | Medium |
| P7 | `cache-status` poll (60 s) `JSON.parse`s the **full dashboard payload** just to read `fetchedAt` | `dashboard.ts:283-290`, `cache.ts:61` | Medium |
| P8 | No response compression (`@fastify/compress` absent) and **no `Cache-Control`/`ETag` on any backend response** | backend grep: 0 hits | Medium |
| P9 | Session cookie re-encrypted and re-set on **every** request; portal token renewal has no per-enrollment dedupe | `session.ts:100-162` | Medium |
| P10 | Per-call crypto/Intl churn: each portal call builds 2-3 `Intl.DateTimeFormat` instances + AES encrypt; dashboard miss ≈ 21 formatter constructions, synchronously | `portal/crypto.ts:50-56,76-85` | Low |
| P11 | Per-request SMTP + **synchronous full-file rewrite** of `feedback.json` on the event loop | `feedback.ts:136`, `feedbackRepository.ts:41-59` | Medium |
| P12 | `ThemeContext.Provider value={{...}}` recreated every render (no `useMemo`); untracked retry `setTimeout` in `useDashboard:118`; `sw.js` `CACHE_NAME` manual versioning, non-hashed public assets cached indefinitely | `ThemeContext.tsx:49`, `useDashboard.ts:118`, `sw.js` | Low |

**Mobile/slow-network view:** no API compression (P8), 162 KB gz first load (P2), zero offline capability with a *misleading* offline fallback (§9 B8), and 4-5 polling loops per dashboard session make the app heavier than it needs to be on mobile data.

---

## 12. Scalability

**What breaks first under peak load (before/after classes, attendance updates, exam periods):**

1. **Portal amplification.** 1 dashboard miss = 7 portal calls (P4); Redis failure (C7) or cache-thrash from P14's per-navigation refetch turns **every user into 7 upstream calls**. The portal's tolerant-empty-body failure mode then reads as mass 401 "log in again."
2. **Shared-IP 429 wall.** JUET students share campus NAT; the global 300/min bucket keys on `req.ip` with no `trustProxy` and an in-memory store → one abuser (or one busy classroom) throttles the whole cohort, and the limit resets on every deploy. The double keep-alive (P6) consumes the 30/min refresh cap for everyone behind that IP.
3. **Multi-instance correctness gaps:** `activeRefreshes` dedupe is per-process (each replica fires its own 7-call refresh); rate-limit store is per-process; in-memory cache mode makes push subscriptions and login-captcha state single-instance-only.
4. **pushWorker blowout:** sequential O(subscribers × 7 portal calls) on the main event loop with no overlap guard (B11) grows hours-long past a few hundred subscribers and competes with live requests.
5. **Event-loop stalls:** sync `feedback.json` rewrites (P11) + pushWorker + per-request crypto (P10).
6. **Connection churn:** per-request portal client with `maxSockets:1` and `destroy()` — no pooling, a TLS handshake per upstream request as QPS rises.

**Missing:** Redis-backed rate limiting, response compression, HTTP caching, connection pooling, request-size tuning, any horizontal-scaling story for sessions (cookie-based — actually fine) vs cache/locks (not fine).

---

## 13. Testing & Reliability

**Exact results (read-only runs):**

| Command | Result |
|---|---|
| `npm test` (backend, `--runInBand`) | ✅ **21/21 suites, 238/238 tests, 0 failures, 0 skipped, ~5 s** |
| Same with `TZ=UTC` | ✅ 238/238 — host-timezone independence proven |
| `npm run type-check` | ✅ 0 errors (both workspaces) |
| `npm run lint` | ✅ 0 errors/warnings (both) |

**Strengths (verified):** attendance math incl. component-wise merge, cross-year/cross-month date sorting, single-digit dates, invalid dates → 0, portal "Failure = no records" vs real error, 401 mapping, forged-`instituteid` rejection, crypto parity against a real cipher fixture, encryption tamper tests, cache error paths, feedback validation (honeypot/dup/limits), auth full 2-step flow, exam date edge cases, session refresh/expiry, `ECONNREFUSED` handling. No `.skip`/`.only` anywhere.

**Critical gaps:**

| Gap | Detail | Sev |
|---|---|---|
| **Zero frontend tests** | No test script/config/runner in `frontend/`; all hooks, components, pages, `utils/api.ts` (the 401 interceptor!), `utils/formatters.ts` (the **only** leap-year/month-boundary logic in the app) untested. `gpaHelpers`/`bunkHelpers` are tested only incidentally, from the backend workspace | High |
| **`src/index.ts` never executed by any test** | `jest.config.js:14` excludes it; every route test builds a bare Fastify — so rate limiting, CORS allow-list, error handler, `/health`, boot validation are **all unverified** | High |
| **Notifications/pushWorker: effectively untested** | `notifications.test.ts` = 2 string-shape assertions on the VAPID key; zero tests for subscribe/unsubscribe/ownership or the background job that hits the live portal | Medium |
| **No tests for the trust-critical defects in §4** | No failing-grade fixture (T2), no disagreeing-percentage fixture (T4), no marks-rendering test (T1), no exam fixture at all (T7 — the capture script `scripts/capture-live.ts` referenced in comments **doesn't exist**) | High |
| Tests excluded from type-check & lint | `tsconfig.json:28-29`, `eslint src` only | Medium |
| **No CI** — 238 green tests run only when a human remembers | no `.github/` | Medium |
| 39 of 47 tracked fixtures referenced by no test | incl. the PII-shaped `campuslynx-cipher.json` | Medium |
| Order-dependent env mutation; wall-clock assertions | `dashboard.campuslynx.test.ts:80`; `swr.test.ts` tests deleted/inlined code | Low |
| Deprecated ts-jest `globals` config (warning every run) | `jest.config.js:22-29` | Info |
| Error-path tests spam ~15 `console.error` blocks on green runs | `cache.test.ts:86-98` etc. | Info |

**Edge cases covered:** empty data ✅, invalid dates ✅, duplicates (feedback) ✅, portal outage ✅, `ECONNREFUSED` ✅, Redis-down (mocked) ✅, month/year boundaries ✅. **Not covered:** very large datasets (max 52 rows), real 401→refresh browser flows, concurrent sessions, `NODE_ENV` matrix, DST-adjacent portal formats.

---

## 14. Mobile & Student UX

**Verdict on "can a student quickly use this between classes?"** Mostly yes — mobile-first layouts, a real bottom nav with 48 px targets and safe-area insets, skeletons everywhere, rich exam date labels ("in 3 days"), fast tabular data. But several dead ends hurt:

| Issue | Detail | Sev |
|---|---|---|
| Blank dashboard on error | `data ? (...) : null` with a banner that has **no Retry**; only recovery is a header icon | High |
| Offline → login page | `sw.js` navigation fallback serves cached `/login` for any route; no offline banner; no cached data for offline reading (B8) | High |
| Stuck "syncing" state | 401 rendered as *"Portal session is syncing in background. Your records remain safe."* forever; only the subject page offers "Log In Again" (B7) | High |
| Network errors reported as bad credentials | login fallthrough message; captcha silently cleared (B15) | Medium |
| Orphaned Grades page | fully built, **no navigation link exists** — invisible feature | Medium |
| Notifications promised but absent | layout meta mentions real-time tracking; backend+SW ready; no opt-in UI (§17) | Medium |
| Threshold confusion | three band systems (T11); raw `DD/MM/YYYY` log dates with no weekday/relative labels while exams get rich labels | Medium |
| Stale/estimated data unlabelled | "Last synced: now" over 2 h-stale data (T10); fabricated 20-class baseline (C11); URL-`pct` precedence (T5) | High |
| No first-visit trust disclosure | only "🔒 Secure. Encrypted. Persistent." — no "what we access / how to revoke" for a credential-sharing tool | Medium |
| Small touch targets | theme toggle, header icons (~32 px), subject filter chips (~30 px), 36 px star buttons vs 44 px guideline (primary nav is fine) | Low |
| Dark-mode flash | FOUC every load (B13) | Medium |
| PWA polish | light-only `theme_color`, no iOS meta, notification icon = 6-byte `favicon.ico`, no install prompt | Info |

**Positive:** skip link, `main#main-content`, `autoComplete` on login fields, `role="alert"` login errors, `role="status"` loader, aria-labels on icon buttons, `touch-manipulation`, safe-area handling, empty states on nearly every page, exam relative dates, working theme toggle.

---

## 15. Accessibility

| Issue | Location | Sev |
|---|---|---|
| **Modal dialogs without `role="dialog"`/`aria-modal`/focus trap/Escape**; backdrop is a clickable div — 3 sites: FeedbackModal, PerformanceHub marks modal, MobileBottomNav profile sheet. The "closed" profile sheet is merely `translate-y-full` → its buttons stay **in the tab order** | `FeedbackModal.tsx:132-141`, `PerformanceHub.tsx:254-262`, `MobileBottomNav.tsx:187-199` | High |
| Async status updates never announced (only login uses `role="alert"`); dashboard errors, copy confirmation, "Last synced" changes are silent to screen readers | `dashboard/page.tsx:22-29`, subject page, performance, exam | Medium |
| `<label>` without `htmlFor`/`id` across feedback page + modal, attendance slider, search inputs (login does it correctly) | `feedback/page.tsx:235-328`, `FeedbackModal.tsx:238-331`, `courses/page.tsx:115-121` | Medium |
| Misleading `h1`: a pathname switch falls through to **"Attendance Tracker"** for subject and grades pages; sidebar brand `h2` precedes `h1` (h2→h1 order); error/404 pages start at `h2` | `DashboardLayout.tsx:158,261-269`, `error.tsx:28`, `not-found.tsx:15` | Medium |
| **Color contrast fails AA:** `text-gray-400` (#9CA3AF ≈ 2.5:1) and `text-slate-400` (≈ 2.8:1) on white used for the smallest text — "Last synced", 9 px labels, back link, 10 px nav labels | `login/page.tsx:59`, `dashboard/page.tsx:234,241,255`, `AttendanceTracker.tsx:80,166`, `MobileBottomNav.tsx:154,176` | Medium |
| **No `prefers-reduced-motion` anywhere** despite pervasive `animate-pulse/spin/shake`, hover transforms, 700-1000 ms transitions | `globals.css`, `tailwind.config.ts` (0 grep hits) | Medium |
| No `aria-current` on active nav items; no `aria-busy` on loading regions | nav components | Low |

**Keyboard:** all interactive elements are real `<button>`/`<Link>` ✅, but closed-sheet tab leakage and non-interactive backdrops break predictability.

---

## 16. SEO

**Correct and appropriately scoped:** `/dashboard*` emits `noindex,nofollow,nocache` (`dashboard/layout.tsx:4-10`) and `robots.txt` disallows `/dashboard*`. Google/Bing verification present. Root `page.tsx` renders login directly on `/` to avoid a 307 for crawlers (recent deliberate commit).

**Minor over-investment for a private app (Info severity):** `/login` is *actively* solicited for indexing (robots `allow`, sitemap entry at priority 0.9/daily, no `robots.noindex` in login metadata) while containing nothing indexable; JSON-LD declares `WebApplication` + `EducationalOrganization` for a login form. → *Add `robots: {index:false}` to login metadata, drop `/login` from the sitemap, slim the JSON-LD.* Do **not** invest further in SEO for authenticated pages — there is no need, and none is recommended.

---

## 17. Missing Functionality

### Must Have (before production)
1. **Session lifecycle that matches its claims** — server-side revocation, cookie-only transport, boot-time validation, real 401 → login flow (C2/C3/B6/B7).
2. **Close the three PII holes** — delete/auth `GET /api/feedback`, fix RLS, stop 30-day session retention for the dead push feature (C1/C5/§7).
3. **Trust-critical data fixes** — marks `/100`+F projection, always-"Pass" grades, fabricated denominators, 0%-never-held alarms, URL-`pct`, portal-vs-logs discrepancy surfacing (§4).
4. **Offline/error recovery UX** — dashboard Retry, no blank body, offline must never serve `/login`, session-expired action (B7/B8).
5. **Notifications: either finish or remove.** The client half (permission prompt → `pushManager.subscribe` → `/api/notifications/subscribe`, unsubscribe on logout) does not exist; until it does, delete `secure_credentials` retention + the worker (the retention is pure privacy risk for zero value).
6. **CI + deployment documentation + `NEXT_PUBLIC_API_URL` production enforcement** (C8).
7. **Redis resilience** (C7) and **fail-closed CORS/NODE_ENV** (C6).

### Should Have
Privacy/data-access disclosure on login; single threshold source of truth; staleness chip ("data as of"); surface or drop notices; link or delete the orphaned Grades page; unified API client; error tracking (Sentry/Vercel) + `global-error.tsx`; health check that reflects dependencies; compression + cache headers; cache exam/attendance-details; hoist dashboard data into the segment layout; single keep-alive; modal a11y; contrast/reduced-motion/label fixes; frontend test runner + `index.ts` smoke suite; versioned migrations; log redaction.

### Nice to Have
Logout-from-all-devices; exam/attendance reminders + ICS export; PWA install prompt/iOS meta/dark `theme_color`/real notification icons; bundle analyzer; `shared` as a real workspace; i18n; request-id header for bug reports; `aria-busy` polish.

---

## 18. Improvement Opportunities

- **Security:** CA-pin the portal instead of disabling TLS; CSRF/Origin checks on state-changing routes; `@fastify/helmet` + Next `headers()`; Redis-backed rate limits with `trustProxy`; pino `redact`; `.env*` gitignore broadening.
- **Reliability:** dependency-aware `/health` + `/ready`; `unhandledRejection` handlers; shutdown timeout; push-worker overlap guard + separate queue; memory-cache fallback + size caps; feedback storage without sync I/O and without fake-200s.
- **Performance:** `next/dynamic` for modals; RSC for static shells; `maxSockets`/agent reuse; cache exam + attendance details; `@fastify/compress` + `ETag`; dedupe cookie issuance; hoist `useDashboard`; add bundle analyzer.
- **Architecture:** one API client, one session transport, one threshold module, one `getInitials`, one `API_URL`; type-check and lint the tests; promote `shared/` to a workspace; centralize cache invalidation; clean `dist` in build.
- **Trust/UX:** `percentageSource` + discrepancy badge; live-data precedence over URL params; label estimates; render server freshness; weekday labels on log dates; unify bands; footnote explaining 75/85 thresholds.
- **DX/monitoring:** GitHub Actions (type-check, lint, test, `npm audit`, TZ matrix); fixture sanitization check; delete 1,200 lines of dead code; reconcile both `.env.example` files; write a real README.
- **Privacy:** hash enrollment in logs; retention/deletion policy for feedback + Redis; first-visit data-access panel; remove unnecessary metadata collection or display it.

---

## 19. Dependency & Configuration Audit

**Dependencies**
- Backend runtime bloat: `typescript`, `@types/node`, `@types/web-push`, `pino-pretty` in `dependencies`; `pino` declared but unused. Move to devDependencies.
- Version currency: `fastify@4.29.1` (5.x current) with `@fastify/cors`/`cookie` v8; `axios@1.6.x`; `next@15.5.18`/`react@19` current; `nodemailer@10`. Run `npm audit` in CI (not run here — write-risk constraint).
- `engines.node >=16` too loose (Next 15 needs ≥18.18); no `.nvmrc`; frontend has no `engines`.
- `lucide-react@^1.17.0` range looks unusual vs the ecosystem (0.4xx) — verify intent; it tree-shakes fine in the built chunk.
- Positives: root lockfile tracked; workspace lockfiles correctly ignored; no suspicious packages; dev/prod split otherwise sane.

**Configuration**
| Issue | Location | Sev |
|---|---|---|
| Only 2 of 28 env vars validated at boot (`ENCRYPTION_KEY`, `DATA_PROVIDER`) — misconfig surfaces as a runtime 502 on a user request | `index.ts:36-42` | Medium |
| **Used but undocumented:** `HOST`, `REDIS_URL`, `SUPABASE_ANON_KEY`, `FEEDBACK_FILE_PATH` (backend); `NEXT_PUBLIC_SITE_URL` (frontend) | grep vs `.env.example` | Medium |
| **Documented but dead:** `SMTP_SECURE`, `SUPABASE_KEY` (code reads `SUPABASE_ANON_KEY`), `NEXT_PUBLIC_SESSION_TIMEOUT`, frontend `NODE_ENV` | `.env.example`s | Low |
| `REQUEST_TIMEOUT` documented 10000 vs code default 60000 | `client.ts:33` | Low |
| `.gitignore` misses `.env.production`/`.env.staging` | `.gitignore:19-23` | Low |
| Backend `rootDir: ".."` → `dist/backend/src/...` + stale `dist/**/parsers/*` on disk; `tsc` never cleans | `backend/tsconfig.json:12-13` | Info |
| Frontend `type-check` writes `tsconfig.tsbuildinfo` (`incremental:true` + `noEmit`) | `frontend/tsconfig.json:25` | Info |
| Deprecated ts-jest `globals` config | `jest.config.js:22-29` | Info |

---

## 20. Priority Action Plan

### P0 — MUST FIX BEFORE PRODUCTION
*Security vulnerabilities, data leaks, incorrect academic information, crashes.*

1. **Delete or admin-gate `GET /api/feedback`; strip PII** (C1).
2. **Fix Supabase RLS** → `to service_role` only; verify anon key never leaves the server (C5).
3. **Cookie-only sessions:** remove `sessionToken` from bodies/headers/`exposedHeaders`/localStorage (C2) **and add server-side revocation on logout** (C3).
4. **Re-enable TLS verification** (`rejectUnauthorized: true` or CA pin) (C4).
5. **Fail closed on CORS regardless of `NODE_ENV`**; remove localhost carve-out in prod; never reflect origin in errors (C6).
6. **Redis:** real `retryStrategy` + reconnect, memory fallback on error, don't hold login state exclusively in Redis (C7).
7. **Trust-critical data fixes:** marks `/100` + F projection (C9); grades `status` default `"Pass"` (C10); fabricated `baseHeld`/`estHeld=20` (C11); portal-vs-logs discrepancy surfaced (C12); exclude zero-classes-held subjects from failing counts (T6); stop trusting URL `?pct=` (T5); validate exam month ranges (T7).
8. **Kill the 30-day `secure_credentials` retention** until the push client exists (§7).
9. **Escape `metadata.*` in the feedback email** (5.2).
10. **CI** running type-check + lint + test on every PR, and enforce `NEXT_PUBLIC_API_URL` in production builds (C8).
11. **Dashboard failure UX:** Retry button, non-blank error body, real 401 → login (never "syncing" forever), offline must not serve `/login` (B7/B8 + §14).

### P1 — SHOULD FIX BEFORE/SHORTLY AFTER LAUNCH
1. Error tracking (Sentry/Vercel) + `global-error.tsx` + honest error copy; `unhandledRejection`/`uncaughtException` handlers; shutdown timeout (B10).
2. Dependency-aware `/health` + `/ready`; log redaction (no `REDIS_URL`, hash enrollment).
3. Deployment doc + root `start` script + backend host decision; `.env.example` reconciliation; boot-time validation of required env vars.
4. `trustProxy` + Redis-backed rate limiting; rate-limit the feedback POST; convert `GET /api/dashboard/invalidate` → POST; add auth to `cache-status`.
5. Surface staleness (render `X-Cache-Status`/`ttl`, server `fetchedAt` for "Last synced"); include `ttl` in the error fallback (T10/T19).
6. Unify the two API clients and the two keep-alive hooks; hoist dashboard data into `app/dashboard/layout.tsx`; throttle focus-refresh (B14, P6).
7. Cache `/api/exam` and `/api/attendance/details`; compression + `Cache-Control`/`ETag` (P5/P8); feedback: async file write, single transporter, don't fake-200 on DB failure, move `getSupabaseClient()` into the try (B4/B5/P11).
8. Frontend test runner (start with `utils/*`, `hooks/*`); test `createServer()` (CORS/rate-limit/error handler); add fixtures for failing grade, disagreeing percentage, exam payload; include `tests/` in type-check + lint.
9. Privacy: data-access disclosure on login; feedback retention/deletion; verify `campuslynx-cipher.json.username` and sanitize if real.
10. UX: link or remove orphaned Grades page; notices render-or-drop; login network-error messaging; dark-mode FOUC.
11. A11y: dialog semantics/focus-trap/Escape (3 sites), `htmlFor` pairs, status announcements, fix subject/grades `h1`, contrast bump to gray/slate-600, `prefers-reduced-motion`.

### P2 — RECOMMENDED
Dead-code purge (~1,200 lines incl. `GpaPredictor`, `utils/axios.ts`, dead formatters, dead branches); single threshold module + single `API_URL`/`getInitials`; versioned DB migrations; move build deps to devDependencies + fix `engines`; `next/dynamic` splitting + bundle analyzer; cache-status metadata instead of full parse; cookie-issue dedupe; VAPID keys fatal in prod; unify subscribe/unsubscribe auth checks; fixture cleanup (39 unused); ts-jest config migration; silence error-path test noise; RSC for static shells; i18n-free locale pinning (`timeZone: "Asia/Kolkata"` in exam formatting); soften JSON-LD/sitemap; `shared` workspace; login validator regex alignment; GradeCard grade-point `—` and `E` handling.

### P3 — NICE TO HAVE
Notifications opt-in UI (if the feature is wanted); logout-from-all-devices; exam/attendance reminders + ICS export; PWA install prompt, iOS meta, dark `theme_color`, real notification icons; request-id header; `aria-busy` polish; timezone-matrix CI; offline read-through cache with "showing last synced" banner.

---

## 21. Production Readiness Checklist

| # | Item | Status |
|---|---|---|
| 1 | Tests pass | ✅ 238/238 (backend only) |
| 2 | Type-check clean | ✅ 0 errors |
| 3 | Lint clean | ✅ 0 errors |
| 4 | CI enforcing 1-3 | ❌ No CI at all |
| 5 | Frontend test coverage | ❌ Zero test runner |
| 6 | No secrets in git | ✅ Verified (history clean) |
| 7 | `.gitignore` covers all env variants | ⚠️ Misses `.env.production` |
| 8 | Secrets server-side only | ❌ Session credential in localStorage (C2); `REDIS_URL` logged |
| 9 | Authentication solid | ❌ No revocation, no boot validation, 3 transports (C2/C3) |
| 10 | Authorization/IDOR | ⚠️ Mostly good; `cache-status` open, feedback enrollment spoofable, detail-`link` unverified |
| 11 | PII endpoints protected | ❌ `GET /api/feedback` open (C1) |
| 12 | DB access control | ❌ RLS `using (true)` (C5) |
| 13 | TLS verification | ❌ Disabled (C4) |
| 14 | CORS fail-closed | ❌ Gated on `NODE_ENV` (C6) |
| 15 | Security headers (CSP/frame/referrer) | ❌ None |
| 16 | CSRF protection | ⚠️ Partial (GET mutation) |
| 17 | Rate limiting | ⚠️ Exists but broken behind proxies, in-memory store |
| 18 | Input validation | ⚠️ Auth ✅, others partial (`pct`, metadata) |
| 19 | Error handling | ⚠️ Server good; client has dead-end/blank states |
| 20 | Logging (no PII/secrets) | ❌ Enrollment logged, `REDIS_URL` logged, no redaction |
| 21 | Monitoring/error tracking | ❌ None (UI falsely claims "logged") |
| 22 | Health checks | ⚠️ `/health` always `ok` |
| 23 | Graceful failure (Redis/portal/Supabase) | ❌ Redis failure bricks login (C7) |
| 24 | Graceful shutdown | ⚠️ Exists, can hang; no crash handlers |
| 25 | Deployment config/docs | ❌ None (C8) |
| 26 | Database migrations/backups | ❌ Manual SQL, no backup story |
| 27 | Data accuracy (trust-critical) | ❌ 4 critical + 20 other defects (§4) |
| 28 | Staleness transparency | ❌ Computed server-side, never shown |
| 29 | Mobile UX | ⚠️ Strong base, dead ends (blank error, offline→login) |
| 30 | Accessibility | ⚠️ Good baseline; dialogs/contrast/labels/reduced-motion fail |
| 31 | Privacy disclosure/retention | ❌ None |
| 32 | SEO (private app scope) | ✅ Dashboard noindex correct; minor login over-indexing |
| 33 | Dead code removed | ❌ ~1,200 lines |
| 34 | Dependency audit | ⚠️ Not run; build deps in runtime; Fastify 4 |

**Score: 6 ✅ / 11 ⚠️ / 17 ❌**

---

### Bottom line

> **If JUET Nexus launched to real students today:** students behind a shared campus IP could get mass-rate-limited; anyone could read submitted feedback PII; a single Redis blip would silently break all logins; a stolen `localStorage` token would outlive logout by up to 30 days; some students would be shown **"Grade projection: F" for a passing score**, **"Pass" on a failing grade**, **attendance totals that don't match the log beside them**, and **red "failing" badges for classes that never happened** — with no way for them to know the app, not their record, was wrong.
>
> **Fix P0 first (≈11 bounded items, no rework required), then P1 for reliability and honesty in the UI, then P2/P3 for polish.** The foundation underneath — tested math, clean types, careful portal client — is genuinely good; the gap is at the edges, and the edges are what students touch.
