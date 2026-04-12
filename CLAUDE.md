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
**Testing:** Vitest + supertest (API), Vitest + happy-dom (PWA / backoffice)
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

## What NOT to Do

- No medical/clinical data stored on MedAssist servers (name, date, procedure only)
- No desktop patient interface; no mobile staff backoffice
- No features beyond the MVP Must-Have list without a constitution amendment
- Do not skip the `docs/superpowers/` spec → plan → tasks workflow for new features
