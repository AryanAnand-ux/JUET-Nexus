# CampusLynx Portal Migration — Design Spec

> Companion to `docs/superpowers/plans/2026-09-30-campuslynx-migration.md`.
> **Status:** proposed. **Date:** 2026-09-30.

## Goal

Replace the JUET WebKiosk HTML scraper with a client for JUET's new CampusLynx student portal, and keep the existing dashboard contract and UI working unchanged.

Scope decisions taken with the user:
- **Full replacement** — WebKiosk is considered dead.
- **Parity only** — profile, attendance, marks, CGPA. No new modules (fees, hostel, timetable).
- **Old code retained** behind a provider switch for one-way rollback.

## What the new portal actually is

Verified by fetching the deployed SPA and its bundle on 2026-09-30.

| Property | Value |
| :--- | :--- |
| Portal URL | `https://studentportal.juet.ac.in/studentportal/` |
| Product | "CampusLynx" — a third-party ERP product shared across the Jaypee group (bundle carries `courseregistrationjiit` and `paymentGatewayUrlForJUIT` controllers) |
| Frontend | Angular SPA, hash routing, PrimeNG + Angular Material |
| Edge / API | nginx/1.20.1 → Undertow/1 (Java) |
| API base | `https://studentportal.juet.ac.in/StudentPortalAPI` |
| Bundle | `main.16a02b772057d9c0.js`, ~5.3 MB, `env.apiBase = "/StudentPortalAPI"`, `production: true` |

This is a **JSON API, not HTML**. The entire scraping layer of the current backend has no analogue here.

## The four facts that drive the design

### 1. Request bodies are AES-encrypted client-side

Every request body is a bare ciphertext string — no JSON envelope, no required `Content-Type`. The Angular app builds it in one injectable service (bundle module `8674`):

```js
// key is derived from the calendar date
generateValue() {
  const dd = pad2(day), mm = pad2(month + 1), yy = String(year).slice(2);
  return "qa8y" + (dd[0] + mm[0] + yy[0] + weekday + dd[1] + mm[1] + yy[1]) + "ty1pn";
}                                  // always 16 chars, e.g. "qa8y3023096ty1pn"

encryptUsingAES256(text) {
  return AES.encrypt(text, Utf8.parse(this.generateValue()), {
    keySize: 64, iv: Utf8.parse("dcek9wb8frty1pnm"), mode: CBC, padding: Pkcs7,
  }).toString();
}
```

Consequences:

- We must ship **`crypto-js`** and issue the *identical* call. Do not reimplement in `node:crypto` — CryptoJS `keySize: 64` against a 16-byte WordArray has specific key-expansion semantics, and a hand-rolled port is a silent-failure risk. Same library, same options, byte-identical output.
- **The key is date-derived**, so it is timezone-sensitive. Our backend must derive it in the portal's timezone (IST / `Asia/Kolkata`), not the server's local zone. To be safe, the client tries a small candidate set (IST today, ±1 day, and the server-local equivalent) and remembers the one that produced a well-formed response.
- Dead code warning: the login components also carry `tokenFromUIKey = "Po298J6oX057jeSd"` / `tokenFromUIIV = "2036985142141031"`. These are **unused leftovers**. Only the module-8674 scheme is live.

### 2. There is no session cookie and no server session

`GET /token/getcaptcha` sets nothing; no endpoint examined returns a `Set-Cookie`. Identity is a token the browser keeps in `localStorage` and **passes in the JSON body** of every request:

```json
{ "token": "...", "memberid": "...", "membertype": "S",
  "instituteid": "...", "clientid": "...", "companyid": "..." }
```

This is a large simplification. The whole `JSESSIONID` + cookie-replay + session-verification machinery in `src/routes/session.ts` has no counterpart.

### 3. The captcha is not a captcha

```json
GET /token/getcaptcha
{ "captcha": { "captcha": "", "hidden": "X+5xjvq9eiI=", "image": "<base64 jpeg>" } }
```

Across repeated probes the `captcha` text is **always empty**; only the rotating `hidden` value matters, and the app simply echoes the whole object back in the login payload. No OCR, and — critically for us — **no captcha to re-solve on session refresh**. This retires the `.noselect` parser, the image fallback, and the auto-solver.

### 4. Login is two steps, and the "OTP" is just the password

```
POST /token/pretoken-check
  body = encrypt({ username, usertype, captcha })
  ->  { random, otppwd, rejectedData }

POST /token/generatewebtoken
  body = encrypt({ otppwd, username, passwordotpvalue, Modulename: "STUDENTMODULE", random })
  ->  { regdata: { token, clientid, companyid, enrollmentno, membertype,
                   name, institutename, institelist, expiredpassword, bypass } }
```

Despite the name, `passwordotpvalue` is the **raw password** — there is no client-side password hash. `usertype` is `S` (student) or `P` (parent), and the login ID is the enrollment number (confirmed by the portal's own marquee text: *"Please use your Enrollment Number as Login ID"*). DOB is not part of the login path — it only appears in the separate password-recovery branch.

## Parity endpoint map

| Dashboard data | Endpoint (under `/StudentPortalAPI`) | Notes |
| :--- | :--- | :--- |
| Profile | `POST /studentpersinfo/getstudent-personalinformation` | `response.generalinformation` |
| Attendance, registered subjects + header | `POST /StudentClassAttendance/getstudentInforegistrationforattendence` | body `{instituteid}` → `response.headerlist` (yields `registrationid`, `registrationcode`, `stynumber`) |
| Attendance, subject-wise % | `POST /StudentClassAttendance/getstudentsubjectpersentage` | body `{instituteid, stynumber, registrationid, cmpidkey, subjectcode, registrationcode}` → the `studentAttdsummarylist` array |
| Attendance, day-by-day log | `POST /StudentClassAttendance/getstudentattendancedetail` | body `{instituteid, stynumber, registrationid, registrationcode}` → `response.studentattendancelist`; rows carry `datetime, attendanceby, present, classtype, attendancestatus` |
| Semester / exam codes | `POST /studentcommonsontroller/getsemestercode-exammarks` | also `getsemestercode-withstudentexamevents` |
| Marks | `POST /studentsexamview/getstudent-exammarks` | body `{instituteid, registrationid, companyid, ...}` |
| SGPA / CGPA | `POST /studentsgpacgpa/loadData`, `/getallsemesterdata`, `/getallsemesterdatadetail` | columns are literally "Earned Credits", "Point Secured SGPA", "Point Secured CGPA" |
| Token refresh | `POST /token/refreshTokenRequest` | the recovery path that replaces silent re-login |
| Announcements | `GET /token/marqeelist` | **public**, no auth; returns `response.text[]` |

### The notices gap

**CampusLynk exposes no student noticeboard.** There is no notices endpoint anywhere in the bundle. The only announcement channel is the marquee — three static admin strings, unauthenticated.

Our dashboard's `notices: NoticeRecord[]` (`title`, `date`, `link`) therefore has no real equivalent. Under "parity only" this degrades to rendering the marquee as a single-notice-per-line list. The plan flags this for an explicit product decision rather than pretending it is parity.

## Architecture

```
routes/  ──►  DataProvider (interface)
                 ├── WebKioskProvider      (existing cheerio/JSDOM scrapers, untouched)
                 └── CampusLynxProvider   (new)
                         ├── portalCrypto   (crypto-js AES, date-derived key)
                         ├── portalClient   (encrypt → POST → unwrap envelope)
                         ├── portalAuth     (captcha → prelogin → generatewebtoken)
                         └── mappers        (portal JSON → shared/types)
```

`DATA_PROVIDER=webkiosk|campuslynx` in `backend/.env` selects the implementation. Both providers return the **same** `DashboardResponse` from `shared/types/index.ts`, so no route, hook, or component changes.

**The shared type contract is the stability boundary.** `shared/types/index.ts` is treated as frozen for this migration. Portal JSON is adapted into it by `mappers.ts`. If a portal field cannot be expressed in the existing type, extend the type and update the frontend — do not leak portal shapes into the API.

## Session model change

Today `SessionData` (`src/utils/encryption.ts`) holds the **cleartext password and DOB** so the backend can silently re-login. That entire mechanism is obsolete.

| | WebKiosk | CampusLynx |
| :--- | :--- | :--- |
| Cookie payload | `jsessionid, enrollment, password, dob, role` | `token, clientid, companyid, instituteid, memberid, membertype, enrollmentno, name, usertype` |
| Contains credentials | yes | **no** |
| On upstream expiry | silently re-login up to 3× | call `refreshTokenRequest`; if that fails, 401 → user logs in again |

Same `auth` httpOnly AES-256-GCM cookie, same 30-day maxAge, same `secure`/`sameSite` production rules. The **net security change is strictly positive: the cookie no longer holds a password.**

**Accepted regression:** users whose token expires must log in again, where previously the backend re-authenticated invisibly. The repo has explicit history on this (`a33f3f6 fix: session persistence after tab close`). `refreshTokenRequest` is the mitigation; if it proves unreliable we can revisit storing credentials, but that is a deliberate reversal, not a default.

## What gets deleted from the runtime path

Not deleted — just no longer reachable under `DATA_PROVIDER=campuslynx`:

- `src/parsers/dashboard.ts`, `src/parsers/attendanceDetails.ts` (cheerio table scrapers)
- `src/parsers/auth.ts` captcha image fetch + `.noselect` text scrape
- "WebKiosk always returns 200" session verification (`src/routes/auth.ts:240`, `src/routes/session.ts:38`)
- `withJitter` staggering and `getRandomUserAgent` rotation — those existed to avoid tripping HTML-scraping bot detection. Against a JSON API with an authenticated token they are cargo-cult; campus-wide IP-based rate limiting is the real constraint, and requests are already staggered by the cache.

**Kept unchanged:** `CacheService`, the stale-while-revalidate logic in `src/routes/dashboard.ts` (5 min fresh / 2 h stale), `X-Cache-Status`/`X-Cache-TTL` headers, push notifications, the frontend in full.

## Rate limiting

The global limit is currently 300 req/min/IP (raised for shared campus Wi-Fi). That is defensible for cheap HTML pages and reckless for a real ERP backend. Plan: drop the global cap and set per-route limits on the portal-facing routes, so a cache miss cannot fan out into a burst against CampusLynx.

## Local environment note

On the dev machine, Node rejects the portal's certificate chain:

```
UNABLE_TO_VERIFY_LEAF_SIGNATURE: unable to verify the first certificate
```

The cause is a TLS-inspecting proxy in the local path; the Windows certificate store trusts it, so browsers and PowerShell are fine. Node needs `--use-system-ca` (Node ≥ 20.11) or `NODE_EXTRA_CA_CERTS`. This is a **local-dev-only** concern — it does not apply to a normal deployment — but it will confuse anyone running the backend here for the first time, so it belongs in the plan and in `.env.example` notes.

## Risks

| Risk | Mitigation |
| :--- | :--- |
| Cipher drift — the vendor changes the key derivation or IV | Key/IV live in one file with a single unit test pinning a known date → key → ciphertext vector. A vendor change fails a test, not production. |
| Date/timezone mismatch near midnight IST | Try a candidate key set; cache the winning offset |
| `pretoken-check` returns `200` with an **empty body** for both valid and garbage input | Confirmed empirically. It cannot be used as an encryption oracle, so cipher correctness must be proven with a real credential in Task 0 — the first thing to fail loudly if our crypto is wrong. |
| Undocumented payload fields (e.g. `cmpidkey`, `stynumber`) | Capture real responses to fixtures in Task 0 and write mappers against them, not against guesses |
| Terms of service / rate limiting on a third-party product | Cache aggressively (already in place), keep per-route limits polite, keep a provider switch for fast rollback |
| Vendor is shared across Jaypee institutions | Upstream change affects all campuses; the same reason the provider switch stays in |
