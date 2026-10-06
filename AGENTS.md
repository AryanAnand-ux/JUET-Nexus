# AGENTS.md

JUET//SYNC — a Next.js 15 + Fastify proxy that scrapes the JUET WebKiosk ERP (attendance, marks, CGPA, notices) and re-exposes it as a dashboard. TypeScript npm-workspaces monorepo.

## Layout & boundaries

- `backend/` — Fastify server. Entrypoint `src/index.ts`; `src/routes/` HTTP handlers, `src/parsers/` WebKiosk HTML scrapers, `src/utils/` singletons (cache, crypto, axios).
- `frontend/` — Next.js App Router (`app/`), components in `components/`, data fetching in `hooks/`, PWA assets in `public/`.
- `shared/types/index.ts` — the shared contract. **Not a workspace**; it's pulled in by relative path (`../shared/types`) from both tsconfigs.

## Commands

```bash
npm install                    # installs all workspaces from root; node_modules is absent on a fresh clone
npm run dev                    # frontend :3000 + backend :3001 (concurrently)
npm run dev:frontend           # or dev:backend for one side
npm run type-check             # frontend tsc --noEmit, then backend tsc --noEmit
npm run lint                   # frontend eslint, then backend eslint
npm test                       # backend jest only -- there is no frontend test runner
npm run build                  # frontend, then backend
```

Focused verification:
```bash
npm test --workspace backend -- tests/cache.test.ts        # one suite
npm test --workspace backend -- -t "AES"                  # one test name
npm run test:coverage --workspace backend
npm run type-check --workspace backend
```

Gotchas:
- Root `npm test` appends `--runInBand`; jest is configured in `backend/jest.config.js` (roots `src` + `tests`, `@/*` → `src/*`).
- Backend dev runs through `ts-node src/index.ts`, not the build output.
- `backend/tsconfig.json` sets `rootDir: ".."`, so `npm run build` emits to `backend/dist/backend/src/index.js` — that's what `main`/`start` point at.
- Backend uses `module`/`moduleResolution: node16` (CommonJS) and imports with plain relative paths. The `@/*` alias exists in tsconfig + jest but backend source does not use it — don't start.
- No CI (`.github/` does not exist). Local `lint -> type-check -> test` is the only gate.

## Env

- `backend/.env` is required. The server **hard-exits at boot** unless `ENCRYPTION_KEY` is exactly 64 hex chars (`src/index.ts:28` → `validateKey` in `src/utils/encryption.ts:17`). Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL`.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are read by `src/utils/vapid.ts` but are **absent from `backend/.env.example`**. If missing, a throwaway pair is generated at boot and logged — push notifications silently won't work until you set real keys.

## Trust the code, not the docs

`README.md` and `ARCHITECTURE.md` have drifted. Verified current behavior:

- Cookie `auth` is AES-256-GCM with a **16-byte IV** and the format `hex(iv)+hex(authTag)+hex(ciphertext)` — no `:` separators, not the `hex(iv):hex(tag):hex(ct)` in ARCHITECTURE.md (`src/utils/encryption.ts:52`).
- Cookie is 30 days and only `secure` + `sameSite: none` when `NODE_ENV=production`; otherwise `lax` (`src/routes/auth.ts:287`).
- Data-page parsers use **cheerio** (`src/parsers/dashboard.ts`, `src/parsers/attendanceDetails.ts`); JSDOM is used only for captcha extraction (`src/parsers/auth.ts`). ARCHITECTURE.md says JSDOM everywhere.
- Dashboard cache is stale-while-revalidate: 5 min fresh / 2 h stale, with background refresh (`src/routes/dashboard.ts:72`). Responses carry `X-Cache-Status` / `X-Cache-TTL`. Not the 60/30/15 min table in ARCHITECTURE.md.
- Theme is the "Generations She" palette (`brutal-*` / `figma-*` tokens), not Indigo/Violet/Slate.

## Auth & session invariants (break these and you break login)

- WebKiosk returns **HTTP 200 on failed logins**. Success is only inferable by fetching a protected page and checking for `session timeout` / `please login` / `< 200` bytes (`src/routes/auth.ts:240`). Don't "simplify" this into a status-code check.
- The `auth` cookie payload (`SessionData`) intentionally contains the **cleartext password and DOB** so the backend can silently re-login when WebKiosk's `JSESSIONID` expires. It is httpOnly + encrypted, but treat it as a secret: never log credentials or the decrypted session.
- Silent re-login in `src/routes/session.ts` retries 3× and re-solves the captcha. It must **never** clear the `auth` cookie on failure — only explicit `POST /api/logout` clears it (`src/routes/session.ts:186`).
- `src/routes/session.ts` is not a route module despite the path; it exports `getValidSession(request, reply)` for use inside other handlers.
- `registerAuthRoutes` attaches the cache via `fastify.decorateRequest('globalCache')` + an `onRequest` hook; handlers reach it with `(request as any).globalCache`.
- `CacheService` (`src/utils/cache.ts`) keys everything as `prefix:key` and must stay best-effort — every method swallows errors and returns a null/empty fallback. It falls back to an in-memory `Map` when no `REDIS_URL`/`REDIS_HOST` is set. Set ops (`sAdd`/`sMembers`/`sCard`) back the push-subscription store.

## Frontend conventions

- **No `middleware.ts`** — `/dashboard/*` has no server-side route protection. Guards are client-side (`localStorage` + the httpOnly cookie). Don't assume a server check exists.
- `public/sw.js` is hand-written vanilla JS, not generated. Two hard rules: never intercept or cache `/api/*`, and bump `CACHE_NAME` when you change `PRECACHE_ASSETS`, or returning users get stale shells.
- Tailwind tokens are non-obvious and misleadingly named: `figma-maroon` is indigo `#6366F1`, `figma-orange` is a light indigo overlay. Runtime accents come from CSS vars (`accent-primary*`) set by `context/ThemeContext.tsx`, which also toggles the `dark` class on `<html>` by hand (`darkMode: "class"`).
- `globals.css` lives at `frontend/globals.css` (imported as `../globals.css` from `app/layout.tsx`), not under `app/`.
- API access goes through `hooks/` (`useAuthFlow`, `useDashboard`, `useAttendanceDetails`); login posts with `withCredentials: true`. Shared base components are re-exported from `components/base.ts` (`FigmaButton`, `FigmaCard`).

## Testing

- Backend tests are hermetic — no network, no Redis. Suites set `process.env.ENCRYPTION_KEY = "0".repeat(64)` themselves and `jest.mock("../src/utils/axios")`. Keep new tests that way; never hit WebKiosk from a test.
- `backend/tsconfig.json` excludes `**/*.test.ts`, so `npm run type-check` does **not** cover test files.
- TDD is the established practice here (`.agent/skills/test-driven-development`, commit messages cite it).

## Ad-hoc scripts

`backend/scripts/*.ts` are manual debug tools, not wired to npm scripts — run them with `npx ts-node scripts/<file>.ts` from `backend/`.

- `inspect-webkiosk.ts <enrollment> <dob> <password>` takes **real credentials as argv**, which leaks them into shell history and the process list. Don't run it with real creds casually.
- `test-parser.ts`, `test-attendance.ts`, `test-parser-integration.ts` read `dump_*.html` fixtures from the CWD. Those dumps are not in the repo — generate them first or the scripts throw.

## Conventions

- Conventional Commits with scopes: `feat(frontend):`, `fix(backend):`, `docs:`.
- Non-trivial work is planned first: `docs/superpowers/plans/YYYY-MM-DD-<slug>.md` with a matching `docs/superpowers/specs/<slug>-design.md`.
- `.agent/skills/` (superpowers skill library), `mcp.json`, and `figma_design.json` are gitignored local tooling — don't try to commit them and don't treat them as app code.
