# Implementation Plan: MedAssist — Patient Visit Companion System

**Branch**: `001-patient-visit-companion` | **Date**: 2026-03-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-patient-visit-companion/spec.md`

---

## Summary

MedAssist is a Progressive Web App system that guides hospital patients through their entire visit via a Magic Link sent by SMS — no app download, no account, no login. The system has two completely separate frontends (mobile-first patient PWA, desktop-first staff back-office) sharing a single REST API backend, with a PostgreSQL database, Redis-backed BullMQ notification queue, and Puppeteer-based PDF export for Hebrew RTL documents.

The MVP delivers: Magic Link delivery, procedure-specific checklists, photo-based step-by-step navigation, a live waiting screen (polling), digital forms with signature capture, ER track instant onboarding, and a staff queue management dashboard — all in Hebrew RTL.

---

## Technical Context

**Language/Version**: TypeScript 5.x (all packages) | Node.js 20 LTS (API)
**Primary Dependencies**:
- API: Express, BullMQ, Puppeteer-core, sharp (image compression), Zod, Vitest, Supertest
- Patient PWA: React 18, Vite 5, vite-plugin-pwa (injectManifest), react-signature-canvas, Workbox
- Staff Back-Office: React 18, Vite 5
- Shared: Zod (schema + runtime validation, shared types)

**Storage**: PostgreSQL 15+ (primary), Redis 7+ (BullMQ job queue + JWT revocation SET), AWS S3 / equivalent object storage (navigation photos, exported PDFs)

**Testing**: Vitest + Supertest (API integration), Vitest + React Testing Library + happy-dom (both React apps), Playwright (E2E, optional — not blocking MVP)

**Target Platform**: Cloud provider with data residency in Israel or EU (e.g., AWS eu-west-1, Azure West Europe) — hard legal requirement

**Project Type**: Web application — monorepo (Turborepo + pnpm workspaces) with 3 apps + 1 shared package

**Performance Goals**:
- 1,000+ concurrent users without degradation
- Waiting screen poll response ≤500ms
- SMS attempted within 60 s of trigger event
- Back-Office queue view loads in ≤2 s under normal load
- Navigation photo max 200 KB (enforced on upload via `sharp`)

**Constraints**:
- No native app, no app store, no WebSocket in v1.0
- All client–server traffic over HTTPS/TLS 1.3
- Data residency: Israel or EU only
- Patient Magic Link URL contains only UUID token — no medical data
- Maximum 4 SMS notifications per visit; deduplication enforced before enqueue

**Scale/Scope**: 1,000+ concurrent users; ~9 user stories; 54 functional requirements; 14 database tables; 5 MVP navigation routes

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked post Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. PWA & Zero-Installation | PASS | Patient interface is React PWA (Vite + vite-plugin-pwa). No native app. No app store. Magic Link is the sole entry point. |
| II. Zero-Search UX | PASS | Each patient screen shows exactly one next action. Navigation is one-step-at-a-time. All primary actions reachable in ≤3 taps from Magic Link open. Zero menus on patient side. |
| III. Dual-Track Architecture | PASS | `Appointments.track` field (elective \| er). Elective: configurable SMS send offset via `MagicLinkTimingRules`. ER: SMS sent immediately on staff action. Both tracks share navigation, waiting screen, notification engine, and digital forms modules. |
| IV. Security & Privacy by Default | PASS | TLS 1.3 enforced. Magic Links are UUID tokens (no medical data in URL), single-use, time-limited. bcrypt passwords (≥12 chars), account lockout 15 min after 5 failed attempts, session timeout 60 min. Only name + phone + visit date + procedure name stored. All data in Israel/EU only. GDPR + Israeli Privacy Protection Law compliance. |
| V. Role-Based Access Boundaries | PASS | 4 roles enforced at API layer: Patient (token-based, own visit), Companion (token-based, read-only), Staff (JWT, own department), Admin (JWT, all departments). Central access-control matrix in `apps/api/src/middleware/auth.ts`. |
| VI. Offline Fallback | PASS | vite-plugin-pwa + injectManifest + Workbox `NetworkFirst` caching for navigation steps and checklist. Hebrew offline banner: "אין חיבור - מציג מידע שמור". Service Worker designed with write-back queue extension point. |
| VII. Notification Discipline | PASS | BullMQ job queue enforces: 4-notification cap per visit, deduplication by (appointment_id, type), up to 3 retries with 5-minute delay, SMS attempted within 60 s of trigger. Every attempt logged to `Notifications` table. |

**No constitution violations. Complexity Tracking table not required.**

**Post-design re-check**: All Phase 1 design decisions (Puppeteer PDF, Turborepo monorepo, JWT auth, polling-based waiting screen) are consistent with all seven principles. No new violations introduced.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-patient-visit-companion/
├── plan.md              ← This file
├── research.md          ← Phase 0 output: 6 research decisions resolved
├── data-model.md        ← Phase 1 output: 14 entities, state transitions
├── quickstart.md        ← Phase 1 output: setup + dev commands
├── contracts/
│   ├── patient-api.md   ← Phase 1 output: patient REST endpoints
│   └── staff-api.md     ← Phase 1 output: staff + admin REST endpoints
└── tasks.md             ← Phase 2 output (created by /speckit.tasks — NOT yet created)
```

### Source Code (repository root)

```text
apps/
├── api/                         — Node.js + TypeScript REST API
│   ├── src/
│   │   ├── db/
│   │   │   ├── migrations/      — PostgreSQL migration files
│   │   │   └── seed.ts          — Development seed data
│   │   ├── middleware/
│   │   │   └── auth.ts          — JWT validation + role-based access matrix
│   │   ├── modules/
│   │   │   ├── magic-links/     — Token generation, validation, expiry
│   │   │   ├── checklist/       — Template resolution, progress persistence
│   │   │   ├── navigation/      — Route + step serving, step confirmation
│   │   │   ├── waiting/         — Queue state, broadcast, contact message
│   │   │   ├── forms/           — Form save/submit, image upload, signature
│   │   │   ├── notifications/   — BullMQ producer, consumer, cap + dedup logic
│   │   │   ├── pdf/             — Puppeteer PDF generation (Hebrew RTL)
│   │   │   ├── staff/           — Queue dashboard, ER link creation, companion link
│   │   │   └── admin/           — Staff mgmt, routes, checklists, timing rules
│   │   └── app.ts               — Express app entry point
│   └── tests/
│       ├── integration/         — Supertest API tests
│       └── unit/                — Module unit tests
│
├── patient-pwa/                 — React + Vite PWA (mobile-first, Hebrew RTL)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── MagicLinkEntry   — Token resolution + phase routing
│   │   │   ├── Checklist        — Pre-visit checklist with persistent state
│   │   │   ├── Navigation       — Photo-by-photo step navigation
│   │   │   ├── Waiting          — Auto-polling waiting screen
│   │   │   ├── Forms            — Digital form fill, image capture, signature
│   │   │   └── Error            — Expired/used link screens
│   │   ├── components/          — Shared UI (RTL, 16pt min font, 44px tap targets)
│   │   ├── services/            — API client (token-based)
│   │   └── sw.ts                — Service Worker (vite-plugin-pwa injectManifest)
│   └── tests/
│
└── staff-backoffice/            — React + Vite desktop app
    ├── src/
    │   ├── pages/
    │   │   ├── Login            — Staff authentication
    │   │   ├── Queue            — Real-time queue dashboard
    │   │   ├── PatientDetail    — Stations, forms, PDF export
    │   │   └── Admin/           — Staff mgmt, routes, checklists, timing rules
    │   ├── components/
    │   └── services/            — API client (JWT cookie-based)
    └── tests/

packages/
└── shared-types/                — Zod schemas + TypeScript DTOs
    └── src/
        ├── patient.ts           — Patient, Appointment, MagicLink types
        ├── visit.ts             — Checklist, Navigation, Waiting, Forms types
        └── staff.ts             — Staff, Admin, Queue types
```

**Structure Decision**: Option 2 (Web application) with Turborepo + pnpm workspaces. Three apps share one monorepo to enable a single-source-of-truth `shared-types` package and unified CI. The API is Express-based with feature-organized modules rather than a layered architecture, keeping navigation between related code tight. The patient PWA and back-office are completely separate Vite apps — no code sharing beyond `shared-types` — reflecting their distinct layout requirements (mobile-first RTL vs. desktop-first LTR).
