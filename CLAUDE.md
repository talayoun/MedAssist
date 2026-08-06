# MedAssist Development Guidelines

## Project Overview

**Project Name:** MedAssist
**Description:** A Progressive Web App (PWA) that guides hospital patients through their visit — from Magic Link SMS entry to checklist, photo navigation, digital forms, and a waiting screen. No installation required; patients enter via SMS link only. Staff manage queues and patients via a separate desktop back-office.
**Status:** In progress — MVP (001-patient-visit-companion)

---

## Tech Stack

**Frontend (Patient PWA):** React 18 + Vite + vite-plugin-pwa, React Router v6, mobile-first, Hebrew RTL
**Frontend (Staff Backoffice):** React 18 + Vite, desktop-first
**Backend:** Node.js 20 LTS + Express 4 + TypeScript 5.x
**Database:** PostgreSQL (`pg` / node-postgres)
**Queue / Cache:** Redis + BullMQ (notification worker runs as a separate process in prod)
**Auth:** JWT magic-links (one-time-use, token-only) + bcrypt (staff passwords)
**File Storage:** AWS S3 (navigation step images, PDF exports)
**SMS:** Twilio
**Testing:** Playwright (all API contract tests + patient PWA E2E + staff backoffice E2E); Vitest (pure unit tests only — shared-types Zod schemas, pure helpers)
**Linting:** ESLint 9 (flat config `eslint.config.mjs`)
**Monorepo:** pnpm workspaces + Turborepo

---

## Project Structure

```text
apps/
├── api/               — Node.js + TypeScript REST API (Express)
│   └── src/
│       ├── db/        — PostgreSQL pool, IORedis, migration runner, seed
│       ├── middleware/ — JWT auth middleware
│       └── modules/   — admin | checklist | forms | magic-links | navigation
│                         notifications | pdf | staff | waiting
├── patient-pwa/       — React + Vite PWA (mobile-first, Hebrew RTL)
│   └── src/
│       ├── pages/     — MagicLinkEntry | Checklist | Navigation | Forms | Waiting | Error
│       └── services/  — API client
└── staff-backoffice/  — React + Vite desktop app
    └── src/
        ├── pages/     — Login | Queue | PatientDetail | Admin
        └── services/  — API client
packages/
└── shared-types/      — Zod schemas + TypeScript DTOs
specs/
└── 001-patient-visit-companion/  — Spec, plan, tasks, data model, API contracts
```

---

## Dev Commands

```bash
pnpm install                       # install all workspace dependencies
pnpm dev                           # run all apps in parallel (Turborepo)
pnpm test                          # run all tests
pnpm build                         # production build

pnpm --filter api db:migrate       # run DB migrations
pnpm --filter api db:seed          # seed dev data (auto-enqueues magic link SMS)
pnpm --filter api worker           # run BullMQ notification worker (separate process in prod)
```

---

## Dev Server Startup Sequence

Run **every command with `doppler run --`**. Secrets come from Doppler only — no `.env` files.

### Step 0 — Kill stale node processes (Windows)

```powershell
# Kill all stale node processes from previous sessions:
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Stop the Turborepo daemon:
doppler run -- pnpm exec turbo daemon stop

# Confirm port 3000 is free (expect: no output):
netstat -ano | findstr :3000
```

> If port 3000 shows EACCES with nothing listening, Hyper-V/WinNAT reserved it.
> Fix: run `netsh int ipv4 set dynamicport tcp start=49152 num=16384` as admin, then reboot.
> See: "Windows Hyper-V port exclusion fix" below.

### Step 1 — Start Docker (PostgreSQL + Redis)

```powershell
docker compose up -d
```

### Step 2 — Run migrations (only if schema changed)

```powershell
doppler run -- pnpm --filter api db:migrate
```

### Step 3 — Seed dev data (only on fresh DB or after wipe)

```powershell
doppler run -- pnpm --filter api db:seed
```

### Step 4 — Start all apps (Terminal 1)

```powershell
doppler run -- pnpm dev
```

Starts in parallel via Turborepo:

- API: `tsx watch` → `http://localhost:3000`
- Patient PWA: Vite → `http://localhost:5173`
- Staff backoffice: Vite → `http://localhost:5174`

### Step 5 — Start notification worker (Terminal 2)

```powershell
doppler run -- pnpm --filter api worker
```

Required for SMS/notification delivery (BullMQ). Not needed for most dev work.

---

## Windows Hyper-V Port Exclusion Fix

If port 3000 shows `EACCES: permission denied` and nothing is listening on it, Windows Hyper-V reserved it. This happens after a reboot — the range shifts randomly.

**Permanent fix (run once as Administrator, then reboot):**

```powershell
netsh int ipv4 set dynamicport tcp start=49152 num=16384
netsh int ipv6 set dynamicport tcp start=49152 num=16384
```

This confines WinNAT to ports ≥49152, so it can never steal port 3000 again.

**Verify after reboot:**

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
# port 3000 should no longer appear in the list
```

---

## Environment Variables

**API (`apps/api/.env`):**
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — Secret for signing JWT tokens
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — SMS delivery
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` — File storage
- `BASE_URL` — Public base URL (used in Magic Link SMS body)
- `CORS_ORIGINS` — Comma-separated allowed origins (e.g. `http://localhost:5173,http://192.168.x.x:5173`)

**Patient PWA (`apps/patient-pwa/.env`):**
- `VITE_API_URL` — API base URL

**Staff Backoffice (`apps/staff-backoffice/.env`):**
- `VITE_API_URL` — API base URL

---

## Code Style

- TypeScript strict mode across all packages
- Zod for runtime validation and shared DTO types (defined in `packages/shared-types`)
- Feature-module organization in API (`src/modules/<feature>/`)
- Hebrew RTL in patient PWA: `dir="rtl"` on `<html>`, min 16pt font, min 44×44px tap targets
- No medical data in Magic Link URLs — token only
- BullMQ worker uses dedicated IORedis connections with `maxRetriesPerRequest: null`
- Notification cap: max 4 notifications per appointment; dedup by type before enqueuing

---

## Testing Discipline

- Anything that touches HTTP, DB, Redis, BullMQ, or a real browser → **Playwright**.
- Pure functions with no I/O (Zod schemas, checklist merge logic, pure helpers) → **Vitest**.
- Do **not** introduce `supertest` or `happy-dom` — both retired.
- API tests live in `tests/api/` using Playwright `request` fixture (real HTTP, real cookies, real Redis/Postgres).
- E2E tests live in `tests/e2e/` with two Playwright projects: `patient-pwa-mobile` (mobile viewport, `dir="rtl"`) and `staff-backoffice-desktop`.
- Patient PWA E2E must assert constitutional requirements: tap targets ≥ 44×44px, text ≥ 16pt, Hebrew RTL layout.
- One spec per user-visible behavior; trace + screenshot on failure enabled by default.

---

## Key Files & Directories

- `apps/api/src/app.ts` — Express app setup, middleware, route mounting
- `apps/api/src/db/db.ts` — PostgreSQL pool
- `apps/api/src/db/redis.ts` — IORedis connections (queue + subscriber)
- `apps/api/src/db/seed.ts` — Dev seed: patients, appointments, magic links, enqueues SMS
- `apps/api/src/modules/magic-links/` — Token resolution router + scheduler
- `apps/api/src/modules/notifications/` — BullMQ producer, consumer, worker, reminders scheduler
- `apps/api/src/modules/visit.router.ts` — Aggregated visit state endpoint
- `specs/001-patient-visit-companion/` — Spec, plan, tasks, data model, API contracts
- `.specify/memory/constitution.md` — Product constitution (non-negotiable principles)

---

## External Integrations

- **Twilio**: SMS delivery for Magic Links and visit notifications
- **AWS S3**: Navigation step images + exported form PDFs (max 200 KB/image, auto-compressed on upload)

---

## Current Goals

- Complete and validate MVP feature set per `specs/001-patient-visit-companion/tasks.md`
- All 7 Must-Have features must work end-to-end before release

---

## Constitution (Non-Negotiable Rules)

These are hard constraints from `.specify/memory/constitution.md` — never violate them:

1. **PWA-only** — No native app, no app store, no account creation for patients
2. **Zero-Search UX** — Every primary action reachable in ≤ 3 taps; no menus or search
3. **Dual track** — Elective (full pre-visit flow) and ER (immediate, 12h TTL) must both work
4. **Security** — Magic Links one-time-use, no medical data in URLs, bcrypt staff passwords, HTTPS/TLS 1.3
5. **Notification discipline** — Max 4 per visit, no duplicates, retry ≤ 3 times with 5-min delay
6. **Offline fallback** — Last-loaded checklist/nav cached; show `"אין חיבור - מציג מידע שמור"` when offline
7. **No EMR integration** — Out of scope for v1.0; do not design features assuming HIS connectivity

---

## Security Rules (Non-Negotiable)

- **Validate and sanitize all user input** — never trust request body, query params, or headers; use Zod schemas at every API boundary
- **No secrets in code** — all credentials and keys via environment variables only; never hardcode or commit `.env` files
- **Parameterized queries only** — use `pg` parameterized query syntax (`$1, $2, …`); never build SQL by string concatenation
- **Auth middleware on every protected route** — no route that touches patient or staff data may be mounted without the JWT middleware
- **No sensitive data in logs** — never log tokens, passwords, patient names, or any PII; log IDs and event types only

---

## Git Workflow

**Branch per task — always.**

- Create a feature branch before starting any task: `git checkout -b <feature-name>`
- Commit only the files for that task with a clear message
- Merge back to the working branch when the task is complete and verified
- Never commit directly to `main`
- Keep branches short-lived — one task, one branch, one merge

```bash
git checkout -b feat/telegram-notification-consumer
# ... implement ...
git add <specific files>
git commit -m "feat(notifications): replace Twilio with Telegram Bot API"
git checkout 001-patient-visit-companion
git merge feat/telegram-notification-consumer
```

---

## What NOT to Do

- No medical/clinical data stored on MedAssist servers (name, date, procedure only)
- No desktop patient interface; no mobile staff backoffice
- No features beyond the MVP Must-Have list without a constitution amendment
- Do not skip the `docs/superpowers/` spec → plan → tasks workflow for new features

---

## Environment Variables — Doppler

Project is developed across multiple machines. All secrets managed via **Doppler** — no `.env` files exist or should be created.

`.env.example` files are fine and encouraged as documentation of required variables (no real values).

### Running the project

Always prefix with `doppler run --`:

```bash
doppler run -- pnpm dev
doppler run -- pnpm test
```

Never suggest running without `doppler run --`.

### New machine setup

```bash
doppler login
doppler setup   # connects to dev environment
```

### Add or update a secret

```bash
# Preferred: interactive prompt — value never appears in shell history
doppler secrets set VARIABLE_NAME

# Avoid: value visible in shell history
# doppler secrets set VARIABLE_NAME=value
```

Never create `.env` files. Never suggest `export VAR=value` as a permanent fix. If a secret is missing, the answer is always `doppler secrets set`.

When adding code that requires a new env var, always suggest the matching `doppler secrets set VARIABLE_NAME` command (interactive form).

### View existing secrets

```bash
doppler secrets              # all vars
doppler secrets get VAR_NAME # single var
```

### Environments

| Environment   | Use                          |
|---------------|------------------------------|
| `dev`         | Local development            |
| `production`  | Production (if applicable)   |
