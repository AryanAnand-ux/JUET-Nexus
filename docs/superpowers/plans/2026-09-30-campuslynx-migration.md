# CampusLynx Portal Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WebKiosk HTML scraper with a client for JUET's new CampusLynx portal (`https://studentportal.juet.ac.in/studentportal/`), serving the existing dashboard contract unchanged.

**Architecture:** A `DataProvider` interface with two implementations — the existing WebKiosk scrapers and a new CampusLynx JSON client — selected by `DATA_PROVIDER` in `backend/.env`. Both return the same `DashboardResponse` from `shared/types/index.ts`, so routes, hooks, and components do not change. Portal JSON is adapted into the shared types by dedicated mappers.

**Tech Stack:** Fastify, axios, `crypto-js` (AES-256-CBC client-side body encryption, matching the portal's Angular bundle), jest + ts-jest.

**Design spec:** `docs/superpowers/specs/2026-09-30-campuslynx-migration-design.md` — read it before Task 1. It records the verified endpoint map, the cipher, and the session-model change.

**Scope (agreed):** full replacement, parity only (profile / attendance / marks / CGPA), WebKiosk code retained behind a provider switch.

**Gate before starting:** `npm install && npm run lint && npm run type-check && npm test` must be green on a clean tree.

---

## Ordering constraints

- **Task 0 gates everything.** Do not write a mapper before real response fixtures exist, or you will be guessing field names.
- Tasks 1–4 are TDD and hermetic — no network, no credentials.
- Task 5 onward touches wiring; keep `DATA_PROVIDER=webkiosk` (the default) until Task 7 flips the default.
- **Never commit credentials or fixtures containing real student data.** See Task 0, step 5.

---

## Task 0: Credential-gated reconnaissance spike

**Files:**
- Create: `backend/spike-campuslynx/inspect.mjs` (scratch; delete at the end)

- [ ] **Step 1: Create the spike directory outside the build**

  `backend/spike-campuslynx/` is excluded from `tsconfig.json` (`include` is `src/**/*.ts`), so plain `.mjs` is fine and nothing leaks into `npm run build`.

- [ ] **Step 2: Prove the cipher against the real server**

  Reimplement bundle module `8674` exactly (see the spec) and run the two-step login with **your own** credentials, passed via env vars, never as argv:

  ```powershell
  $env:PORTAL_USER="<enrollment number>"
  $env:PORTAL_PASS="<password>"
  $env:PORTAL_UTYPE="S"
  node backend/spike-campuslynx/inspect.mjs login
  ```

  Expected: `pretoken-check` returns JSON with `random`, then `generatewebtoken` returns `regdata.token`.

  **If this fails, stop.** `pretoken-check` answers `200` with an empty body for both valid and garbage input, so there is no cheap way to tell "wrong cipher" from "wrong credentials". Debug the cipher (timezone, `keySize`, padding) before writing any production code. Do not proceed on a guess.

- [ ] **Step 3: Capture real response shapes**

  ```powershell
  node backend/spike-campuslynx/inspect.mjs capture
  ```

  Writes one JSON file per endpoint into `backend/spike-campuslynx/fixtures/`, covering: `getstudent-personalinformation`, `getstudentInforegistrationforattendence`, `getstudentsubjectpersentage`, `getstudentattendancedetail`, `getsemestercode-exammarks`, `getstudent-exammarks`, `studentsgpacgpa/loadData`, `getallsemesterdata`, `token/marqeelist`.

- [ ] **Step 4: Confirm the outstanding unknowns**

  Record the answers in the spec: does `refreshTokenRequest` actually extend a session, and what is the failure envelope when the token is stale or revoked?

- [ ] **Step 5: Sanitise and hand off**

  Before any fixture is copied into `tests/`, strip real values (name, enrollment, roll numbers, marks, dates) and replace them with type-accurate placeholders. Keep **field names, types, nullability, and array shapes exactly as captured** — those are what the mappers depend on.

- [ ] **Step 6: Delete the spike**

  ```powershell
  Remove-Item -Recurse -Force backend/spike-campuslynx/inspect.mjs
  ```

---

## Task 1: Portal crypto utility

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/utils/portalCrypto.ts`
- Create: `backend/tests/portalCrypto.test.ts`

- [ ] **Step 1: Install crypto-js**

  Run: `npm install crypto-js --workspace backend`
  Run: `npm install --save-dev @types/crypto-js --workspace backend`

  Use `crypto-js`, not `node:crypto`. CryptoJS `keySize: 64` against a 16-byte key has specific expansion semantics; a hand-rolled port fails silently.

- [ ] **Step 2: Write the failing test**

  `portalCrypto.test.ts` covers, hermetically:

  - `generateValue(date)` returns 16 chars for a set of fixed dates, with the expected literal for each (e.g. `2026-09-30` → `qa8y3023096ty1pn`)
  - `encrypt()` is deterministic for a fixed key and differs when the key differs
  - `decrypt()` round-trips `encrypt()` output
  - a pinned vector: fixed key → fixed ciphertext (CryptoJS default OpenSSL formatting, i.e. base64 of `Salted__` + salt + ciphertext). This is the vendor-drift tripwire.

- [ ] **Step 3: Run it and watch it fail**

  Run: `npm test --workspace backend -- tests/portalCrypto.test.ts`

- [ ] **Step 4: Implement**

  Export `generateValue(date)`, `encrypt(plaintext, key)`, `decrypt(ciphertext, key)`, `deriveKeyCandidates()` (IST today ±1 day plus server-local ±1 day), and the constants `IV` and `KEY_PREFIX`/`KEY_SUFFIX`.

- [ ] **Step 5: Green**

  Run: `npm test --workspace backend -- tests/portalCrypto.test.ts`
  Run: `npm run type-check --workspace backend`

---

## Task 2: Typed portal HTTP client

**Files:**
- Create: `backend/src/clients/portalClient.ts`
- Create: `backend/tests/portalClient.test.ts`

- [ ] **Step 1: Failing test**

  Mock `../src/utils/axios` (house style, per `tests/auth.test.ts`). Cover:

  - request body is the bare AES ciphertext string — no JSON wrapper, no required `Content-Type`
  - unwraps `{status:{responseStatus}, response}` and returns `response`
  - `responseStatus !== "Success"` becomes a typed error carrying `status.errors`
  - **key-candidate retry**: on an empty/undecryptable body, tries the next candidate key and caches the winner
  - a network failure surfaces as a `PORTAL_UNREACHABLE` error, not a raw axios throw

- [ ] **Step 2: Implement**

  `PortalClient` with `get(path)`, `post(path, body)` and a `session` object supplying `{token, memberid, membertype, instituteid, clientid, companyid}`. Body = `encrypt(JSON.stringify(payload))`.

- [ ] **Step 3: Green**

  Run: `npm test --workspace backend -- tests/portalClient.test.ts`

---

## Task 3: Authentication

**Files:**
- Create: `backend/src/clients/portalAuth.ts`
- Create: `backend/tests/portalAuth.test.ts`

- [ ] **Step 1: Failing test**

  Cover the exact sequence: `GET /token/getcaptcha` → `POST /token/pretoken-check` → `POST /token/generatewebtoken`. Assert the step-2 payload is `{otppwd, username, passwordotpvalue, Modulename: "STUDENTMODULE", random}` and that `random` comes from step 1. Assert the step-1 payload is `{username, usertype, captcha}` and that the **entire** captcha object is echoed back.

- [ ] **Step 2: Implement**

  `PortalSession` = `{token, clientid, companyid, enrollmentno, membertype, name, institutename, instituteid, usertype}`. Support multi-institute selection from `regdata.institutelist`; default to the sole entry when there is exactly one.

- [ ] **Step 3: Green**

  Run: `npm test --workspace backend -- tests/portalAuth.test.ts`

  Note the field is `passwordotpvalue` but it is the **raw password** — no hashing. Do not add a hash.

---

## Task 4: Mappers onto the shared contract

**Files:**
- Create: `backend/src/clients/mappers.ts`
- Create: `backend/tests/mappers.test.ts`
- Create: `tests/fixtures/campuslynx/*.ts` (sanitised, from Task 0 step 5)
- Modify: `shared/types/index.ts` **only if** a portal field cannot be expressed in an existing type

- [ ] **Step 1: Failing tests, one per data set**

  Profile, attendance summary, attendance day-log, marks, CGPA — each driven by a sanitised fixture, asserting the output matches `shared/types/index.ts`.

- [ ] **Step 2: Resolve the one unavoidable type change**

  Our `AttendanceRecord` wants `percentage`, `lecturePercent`, `tutorialPercent`, `practicalPercent`, `classesHeld`, `classesAttended`. CampusLynk's `getstudentsubjectpersentage` returns a summary list whose per-class-type split may not match. Decide from the fixtures:

  - map what exists and omit/zero the rest, or
  - extend `AttendanceRecord` (e.g. make the class-type fields optional) and update the frontend components that read them.

  Record the decision in the spec. **Do not** fake numbers.

- [ ] **Step 3: Implement and go green**

  Run: `npm test --workspace backend -- tests/mappers.test.ts`

- [ ] **Step 4: Handle notices explicitly**

  There is no noticeboard endpoint. Map `GET /token/marqeelist` (`response.text[]`) into `notices: NoticeRecord[]` as one record per line, with `date` and `link` left empty. Flag to the user that this is a degradation, not parity.

---

## Task 5: Provider interface and switch

**Files:**
- Create: `backend/src/providers/types.ts`
- Create: `backend/src/providers/webkiosk.ts`
- Create: `backend/src/providers/campuslynx.ts`
- Create: `backend/src/providers/index.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Define the interface**

  One method returning `DashboardResponse`, plus `refreshSession()`. Shape it around what the routes actually call — not what the old scrapers happen to expose.

- [ ] **Step 2: Wrap the existing code, do not move it**

  `webkiosk.ts` adapts the current cheerio/JSDOM path. Leave `src/parsers/*` and the old route internals exactly where they are so rollback stays a one-line change.

- [ ] **Step 3: Factory**

  Read `DATA_PROVIDER` (`webkiosk` default, `campuslynx` opt-in). Unknown values must fail loudly at boot, like the existing `validateKey` check.

- [ ] **Step 4: Document the switch**

  Add `DATA_PROVIDER` and `PORTAL_BASE_URL` to `backend/.env.example`; remove the now-misleading `WEBKIOSK_*` block into a clearly-labelled legacy section.

---

## Task 6: Session model — drop stored credentials

**Files:**
- Modify: `backend/src/utils/encryption.ts`
- Modify: `backend/src/routes/session.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/tests/session.test.ts`
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/tests/encryption.test.ts`

- [ ] **Step 1: Failing tests first**

  - `SessionData` no longer contains `password` or `dob`
  - `getValidSession` refreshes via `refreshTokenRequest` when the token is stale
  - a refresh failure returns 401 **without clearing the `auth` cookie**
- [ ] **Step 2: Implement**

  Replace `SessionData` with the portal session shape. Keep the `auth` cookie itself byte-compatible in *form* — httpOnly, AES-256-GCM, 30 days, `secure` + `sameSite: none` only in production — so `setCookie`/`clearCookie` call sites stay symmetric.

  **Security note:** the cookie no longer holds a password. Logout and re-login paths become simpler; verify the logout route still clears cached dashboard data for the enrollment.

- [ ] **Step 3: Green, then audit for leaked references**

  ```powershell
  rg -n "password|dob|JSESSIONID" backend/src
  ```
  Anything left must be a genuine WebKiosk-path reference behind the provider switch.

- [ ] **Step 4: Run the full gate**

  Run: `npm run lint; npm run type-check; npm test`

---

## Task 7: Rewire routes, preserve caching

**Files:**
- Modify: `backend/src/routes/dashboard.ts`
- Modify: `backend/src/routes/attendance.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Swap scrapers for the provider**

  `fetchDashboardData` and the attendance-details handler go through the provider. Keep `FRESH_TTL_SEC = 300` / `STALE_TTL_SEC = 7200`, the background refresh, and the `X-Cache-Status` / `X-Cache-TTL` headers **unchanged** — the cache contract is not part of this migration.

- [ ] **Step 2: Replace `/api/init`**

  CampusLynx needs no captcha image round-trip. Return a bare `200 { captchaValue: null }` so the frontend `useAuthFlow` contract does not change.

- [ ] **Step 3: Retire the anti-scraping theatre**

  Remove `withJitter` staggering and `getRandomUserAgent` rotation from the CampusLynx path. They mitigated HTML-scraping bot detection that does not apply to an authenticated JSON API. Keep the files — `tests/swr.test.ts` still covers them.

- [ ] **Step 4: Tighten rate limits**

  Drop the 300/min global cap and set per-route limits on portal-facing routes so a cold cache cannot burst against CampusLynx.

- [ ] **Step 5: Flip the default**

  Set `DATA_PROVIDER=campuslynx` as the default in `backend/.env.example` only after Tasks 1–6 are green. Keep the WebKiosk branch working until you have logged in successfully against the new portal.

---

## Task 8: Verify the frontend is genuinely untouched

**Files:**
- Modify only if `shared/types` changed in Task 4

- [ ] **Step 1: Type-check**

  Run: `npm run type-check --workspace frontend`

- [ ] **Step 2: Manual smoke test**

  `npm run dev`, log in against the real portal, then walk: dashboard, per-subject attendance (`/dashboard/subject/[id]` day-log view), courses, performance. Confirm `classesHeld`/`classesAttended` and the Bunk Meter still compute — the bunk formulas in `frontend/utils/bunkHelpers.ts` depend on raw counts, which is exactly what may not survive the mapping in Task 4 step 2.

- [ ] **Step 3: Cache-header check**

  Confirm `X-Cache-Status` still reports `fresh` / `stale` / `miss` as before.

---

## Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: README**

  Replace the WebKiosk setup, theme and env sections. Document `DATA_PROVIDER`, `PORTAL_BASE_URL`, and the VAPID keys that were already missing from `.env.example`.

- [ ] **Step 2: ARCHITECTURE**

  Rewrite the auth flow, crypto, scraping and caching sections. This file is already stale on several points (see `AGENTS.md`); take the opportunity to make it accurate rather than patching it.

- [ ] **Step 3: AGENTS.md**

  The "Auth & session invariants" and "Trust the code, not the docs" sections describe WebKiosk behaviour that no longer holds. Replace them with the CampusLynx equivalents — especially that **the portal's response envelope must be unwrapped** and that **the AES key is date-derived and timezone-sensitive**, which is exactly the kind of thing a future session will get wrong.

---

## Definition of done

- [ ] `npm run lint && npm run type-check && npm test` green
- [ ] A real student can log in through the UI and see attendance, marks and CGPA
- [ ] Cache headers behave as before the migration
- [ ] `DATA_PROVIDER=webkiosk` still boots and the old path still works
- [ ] No credentials, tokens, or unsanitised fixtures in the repository
- [ ] `git log --oneline -50` shows no commit touching `.env` files