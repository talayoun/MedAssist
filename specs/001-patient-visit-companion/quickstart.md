# Quickstart: MedAssist Development Setup

**Branch**: `001-patient-visit-companion` | **Date**: 2026-03-28

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS or higher | Runtime for API and build tools |
| pnpm | 9+ | Package manager (monorepo workspace host) |
| PostgreSQL | 15+ | Primary database |
| Redis | 7+ | BullMQ job queue + JWT revocation |
| Docker (optional) | 24+ | Run PostgreSQL and Redis locally without manual install |

---

## Repository Structure

```
medassist/
├── apps/
│   ├── api/               — Node.js + TypeScript REST API (Express)
│   ├── patient-pwa/       — React + Vite PWA (mobile-first, Hebrew RTL)
│   └── staff-backoffice/  — React + Vite desktop app
├── packages/
│   └── shared-types/      — Zod schemas + TypeScript DTOs (shared across apps)
├── specs/                 — Feature specifications, plans, data models
├── turbo.json             — Turborepo pipeline config
├── pnpm-workspace.yaml    — pnpm workspace config
└── package.json           — Root workspace manifest
```

---

## First-Time Setup

### 1. Install dependencies (all packages)

```bash
pnpm install
```

### 2. Start infrastructure (PostgreSQL + Redis)

**Option A — Docker Compose** (recommended for local dev):

```bash
docker compose up -d
```

A `docker-compose.yml` at the repo root provides PostgreSQL (port 5432) and Redis (port 6379) with data volumes.

**Option B — Manual install**:
- PostgreSQL: create a database named `medassist_dev`
- Redis: run on default port 6379

### 3. Configure environment variables

Copy the example env file in each app and fill in local values:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/patient-pwa/.env.example apps/patient-pwa/.env
cp apps/staff-backoffice/.env.example apps/staff-backoffice/.env
```

**`apps/api/.env` key variables**:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/medassist_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=<random 64-char hex string>
JWT_EXPIRY_MINUTES=60
TWILIO_ACCOUNT_SID=<from Twilio console>
TWILIO_AUTH_TOKEN=<from Twilio console>
TWILIO_FROM_NUMBER=+1...
AWS_ACCESS_KEY_ID=<S3 credentials>
AWS_SECRET_ACCESS_KEY=<S3 credentials>
AWS_BUCKET_NAME=medassist-dev
AWS_REGION=eu-west-1
PATIENT_APP_URL=http://localhost:5173
MAGIC_LINK_BASE_URL=http://localhost:5173/visit
ELECTIVE_LINK_TTL_HOURS=72
ER_LINK_TTL_HOURS=12
```

**`apps/patient-pwa/.env` key variables**:

```
VITE_API_URL=http://localhost:3000
VITE_POLLING_INTERVAL_MS=60000
```

**`apps/staff-backoffice/.env` key variables**:

```
VITE_API_URL=http://localhost:3000
```

### 4. Run database migrations

```bash
pnpm --filter api db:migrate
```

This runs all pending migrations and creates the schema from `apps/api/src/db/migrations/`.

### 5. Seed development data (optional)

```bash
pnpm --filter api db:seed
```

Creates:
- 1 admin user: `admin@medassist.test` / `AdminPassword123`
- 1 staff user: `staff@medassist.test` / `StaffPassword123`
- 1 department: "קרדיולוגיה"
- 1 elective appointment + magic link (token printed to console)
- 5 navigation route steps for the department

---

## Running in Development

### All apps in parallel (recommended):

```bash
pnpm dev
```

Turborepo starts all three apps simultaneously with watch mode.

| Service | URL | Hot Reload |
|---|---|---|
| API | http://localhost:3000 | Yes (ts-node-dev or tsx watch) |
| Patient PWA | http://localhost:5173 | Yes (Vite HMR) |
| Staff Back-Office | http://localhost:5174 | Yes (Vite HMR) |

### Individual apps:

```bash
pnpm --filter api dev
pnpm --filter patient-pwa dev
pnpm --filter staff-backoffice dev
```

---

## Running Tests

### All packages:

```bash
pnpm test
```

### Individual app:

```bash
pnpm --filter api test
pnpm --filter patient-pwa test
pnpm --filter staff-backoffice test
```

### Test types per package:

| Package | Unit | Integration | Notes |
|---|---|---|---|
| `api` | `vitest` | `vitest` + `supertest` + test DB | Integration tests use a separate `medassist_test` database |
| `patient-pwa` | `vitest` + RTL | — | DOM tests with `happy-dom` |
| `staff-backoffice` | `vitest` + RTL | — | DOM tests with `happy-dom` |

---

## Building for Production

```bash
pnpm build
```

Output:
- `apps/api/dist/` — compiled TypeScript API
- `apps/patient-pwa/dist/` — Vite build with Service Worker and Web App Manifest
- `apps/staff-backoffice/dist/` — Vite build

---

## Key Development Notes

### Magic Link testing locally

After running `db:seed`, the seed script prints a test Magic Link URL to the console. Open it on your mobile device (ensure your dev machine IP is used, not `localhost`) to test the patient PWA end-to-end.

### Service Worker in development

The Service Worker is active only in production builds by default (Vite PWA plugin behavior). To test offline behavior locally:

```bash
pnpm --filter patient-pwa build && pnpm --filter patient-pwa preview
```

Then open Chrome DevTools → Application → Service Workers.

### Hebrew RTL in development

The patient PWA has `dir="rtl"` set at the root `<html>` element. All Hebrew text uses the system sans-serif stack (Segoe UI, Helvetica, Arial) — no custom font download required for v1.0.

### PDF export (Puppeteer)

Puppeteer downloads a Chromium binary on first install. In CI/CD or Docker environments, set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` and point `PUPPETEER_EXECUTABLE_PATH` to the system Chrome installation.

### Notification engine (BullMQ)

In development, the notification engine runs within the API process (no separate worker). In production, the BullMQ worker can be run as a separate process:

```bash
pnpm --filter api worker
```

This prevents SMS sends from blocking API request handlers.
