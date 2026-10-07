# AGENTS.md

JUET Nexus — a modern, high-speed Next.js 15 + Fastify client and proxy for the JUET Student Portal (CampusLynx JSON API at `studentportal.juet.ac.in`). TypeScript npm-workspaces monorepo.

## Layout & boundaries

- `backend/` — Fastify server.
  - Entrypoint: `src/index.ts`
  - HTTP handlers: `src/routes/` (`auth.ts`, `dashboard.ts`, `attendance.ts`, `grades.ts`, `exam.ts`, `feedback.ts`, `notifications.ts`, `session.ts`)
  - Portal integration: `src/portal/` (`client.ts`, `crypto.ts`, `auth.ts`, `dashboard.ts`, `attendance.ts`, `types.ts`)
  - Utilities: `src/utils/` (cache, encryption, axios, vapid, provider)
- `frontend/` — Next.js 15 App Router (`app/`), UI components in `components/`, data hooks in `hooks/`, PWA assets in `public/`.
- `shared/types/index.ts` — Shared TypeScript contract. Not a workspace; imported by relative path (`../shared/types`) in both tsconfigs.

## Commands

```bash
npm install                    # installs all workspaces from root
npm run dev                    # frontend :3000 + backend :3001 (concurrently)
npm run dev:frontend           # frontend only
npm run dev:backend            # backend only
npm run type-check             # frontend tsc --noEmit, then backend tsc --noEmit
npm run lint                   # frontend eslint, then backend eslint
npm test                       # backend jest only -- hermetic unit/integration tests
npm run build                  # frontend, then backend
```

Focused verification:
```bash
npm test --workspace backend -- tests/cache.test.ts        # one suite
npm test --workspace backend -- -t "AES"                  # test by name pattern
npm run test:coverage --workspace backend
npm run type-check --workspace backend
```

Key Details:
- Root `npm test` runs with `--runInBand`; jest is configured in `backend/jest.config.js`.
- Backend dev runs through `ts-node src/index.ts`.
- `backend/tsconfig.json` sets `rootDir: ".."`, emitting to `backend/dist/backend/src/index.js` on build.
- Backend uses CommonJS (`module`/`moduleResolution: node16`) and standard relative imports.

## Env Configuration

- `backend/.env` is required. The server hard-exits at boot unless `ENCRYPTION_KEY` is exactly 64 hex characters (`src/utils/encryption.ts`).
  Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `PORTAL_BASE_URL`: CampusLynx API base (`https://studentportal.juet.ac.in/StudentPortalAPI`).
- `PORTAL_TIMEZONE`: `Asia/Kolkata` (portal encryption keys are keyed to IST calendar dates).
- `SMTP_USER` & `GMAIL_APP_PASSWORD`: For feedback email delivery to `juetnexus@gmail.com`. Spaces in app passwords are automatically trimmed.
- `VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY`: Web push notifications keys. If unset, a throwaway pair is generated at boot.
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3001`).

## Architecture & Current Behavior

- **CampusLynx Protocol**: The backend interacts directly with the CampusLynx JSON API at `studentportal.juet.ac.in`. Outgoing requests are encrypted with AES-128-CBC using a calendar-derived daily key and a fixed IV (`src/portal/crypto.ts`).
- **Session Cookie (`auth`)**: Encrypted with AES-256-GCM using a 16-byte IV in format `hex(iv)+hex(authTag)+hex(ciphertext)`. Stored for 30 days (`secure` + `sameSite: none` in production, `lax` in development). Contains the session token and encrypted credentials for automatic silent token renewal.
- **Cache Strategy**: Dashboard and attendance responses use stale-while-revalidate caching (5 min fresh / 2 h stale) with in-memory fallback when Redis is absent.
- **Student Privacy**:
  - UI includes a Privacy Mode toggle (`Eye`/`EyeOff`) in the dashboard header, desktop sidebar, and mobile navigation, persisted via `mask_enrollment` in `localStorage`.
  - Passwords are never stored in `localStorage` and never logged.
  - Feedback forms auto-route replies to `<enrollment>@juetguna.in` without exposing the student's email on screen.

## Frontend Conventions

- Next.js 15 App Router (`app/dashboard/*`). Client-side route guards use `localStorage` session state + httpOnly auth cookie.
- Service Worker (`public/sw.js`) never intercepts or caches `/api/*`.
- Styling: Tailwind CSS with dark mode class (`darkMode: "class"`).
- Global styles live at `frontend/globals.css`.

## Testing Conventions

- Backend tests are hermetic — no real network calls to CampusLynx or Redis. Tests mock `axios` and set `process.env.ENCRYPTION_KEY`.
- Test fixtures in `backend/tests/fixtures/` use anonymized mock student data (`24BCS001`, `DEMO STUDENT`, `JUET0000001`).
