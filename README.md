# JUET Nexus

**JUET Nexus** is a modern, high-performance, and completely redesigned student dashboard proxy for the Jaypee University of Engineering and Technology (JUET) WebKiosk ERP system. .

---

## Key Features

- **Premium Indigo/Slate Design:** Built using a visually stunning Indigo, Violet, and Slate theme. Complete with dark-gradient hero components, custom cards, and smooth transitions.
- **Auto-Captcha Solver:** Behind-the-scenes captcha parsing automatically solves text-based captchas during login. Supports a clean fallback layout for image-based captchas.
- **Interactive Collapsible Sidebar:** Supports dynamic folding/unfolding on desktop (`lg:w-20` to `lg:w-64`). Features click-to-expand and click-outside-to-collapse behavior.
- **Bunk Meter:** Instantly visualizes your attendance percentage with interactive simulators to calculate safe upcoming bunks or how many consecutive classes you need to attend to meet your target.
- **Performance Hub:** Centralized display of SGPA, CGPA standings, and recent evaluation scores.
- **Session Persistence:** Configured with secure CORS and `SameSite=Lax` cookies, keeping you logged in even after refreshing your browser.

---

## Technical Architecture

JUET Nexus is structured as a TypeScript monorepo:
- **Frontend (`/frontend`):** Built with React, Next.js (App Router), Tailwind CSS, Lucide Icons, and Axios client-side connection.
- **Backend (`/backend`):** Powered by Fastify, JSDOM, and Axios. Features AES-256-GCM encryption for cookies and a dual-tier caching layer (Redis + in-memory Map fallback).
- **Shared (`/shared`):** Universal TypeScript interfaces and type declarations ensuring strict data contracts.

---

## Local Development

### 1. Prerequisites
- **Node.js:** v18.x or later
- **npm:** v10.x or later
- **Redis (Optional):** Required for shared multi-session cache. Otherwise falls back to safe in-memory cache.

### 2. Installation
Clone the repository and install workspace dependencies:
```bash
git clone https://github.com/AryanAnand-ux/JUET-Nexus.git
cd JUET-Nexus
npm install
```

### 3. Environment Setup
Configure your environment variables:

**Backend (`/backend/.env`):**
```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
WEBKIOSK_BASE_URL=https://webkiosk.juet.ac.in
ENCRYPTION_KEY=your-256-bit-hex-key-here-64-characters-minimum
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
REQUEST_TIMEOUT=15000
# REDIS_URL=redis://localhost:6379/0  # Optional (Falls back to memory)
```
*Note: Generate `ENCRYPTION_KEY` using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.*

**Frontend (`/frontend/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Running the App
Run both servers concurrently from the root directory:
```bash
npm run dev
```
- Frontend starts at: `http://localhost:3000`
- Backend API starts at: `http://localhost:3001`

---

