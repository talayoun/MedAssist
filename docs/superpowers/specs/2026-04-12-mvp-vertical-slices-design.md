# MedAssist MVP — Vertical Slices Implementation Design

**Date:** 2026-04-12
**Branch:** 001-patient-visit-companion
**Status:** Approved — ready for implementation planning

---

## Context

The codebase is scaffolded but sparse: all module directories, page components, and API routers exist as stubs. No feature works end-to-end yet. This design covers the full path from current state to a pilot-ready MVP.

SMS delivery will use **Telegram Bot API** during development (free, instant, team-only). The switch to Twilio for real patients requires changing only `notifications.consumer.ts`.

---

## Architecture

No structural changes. The existing layered architecture is correct and stays intact:

```
DB migrations (PostgreSQL)
  ↓
API routers + services (Express modules)
  ↓
Shared Zod types (packages/shared-types)
  ↓
Frontend pages (patient-pwa / staff-backoffice)
```

BullMQ queue architecture is preserved across the Telegram→Twilio swap. Only the delivery call inside the consumer changes.

---

## Delivery Mechanism: Telegram Bot API

**Environment variables (add to `apps/api/.env`):**
- `TELEGRAM_BOT_TOKEN` — bot token from @BotFather
- `TELEGRAM_CHAT_IDS` — comma-separated team chat IDs (e.g. `123456789,987654321`)

**Implementation in `notifications.consumer.ts`:**
- Remove Twilio SDK import and `TWILIO_*` env var usage
- Replace with a `fetch` POST to `https://api.telegram.org/bot${token}/sendMessage`
- Broadcast each notification to all configured `TELEGRAM_CHAT_IDS`
- Message text includes: notification type, patient name, magic link URL, appointment context
- All existing BullMQ retry logic (3 attempts, 5-min delay) stays unchanged

**Twilio migration path (later):**
- Swap `fetch` call in consumer for Twilio SDK call
- Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to `.env`
- Map notification to patient's `phone_number` instead of broadcasting to team IDs
- Zero changes to producer, queue, or any other module

---

## DB Migrations Strategy

All 7 migrations are written and run **once upfront in Slice 1**, before any feature work begins. This unblocks every subsequent slice immediately.

| Migration | Tables |
|---|---|
| 001_patients | `patients`, `departments` |
| 002_appointments | `appointments`, `magic_links` |
| 003_staff | `staff_users`, `notifications` |
| 004_checklists | `checklist_templates`, `checklist_progress` |
| 005_navigation | `navigation_routes`, `route_steps` |
| 006_waiting | `waiting_queue`, `patient_stations` |
| 007_forms | `digital_forms`, `companions` |

---

## Implementation Slices

### Slice 1 — Foundation + Telegram (unblocks everything)

**Scope:**
- Write all 7 DB migrations and run them (`pnpm --filter api db:migrate`)
- Implement Telegram consumer in `notifications.consumer.ts`
- Verify `pnpm --filter api db:seed` sends a Magic Link message to Telegram

**Done when:** Running `db:seed` delivers a Telegram message to the team with a magic link URL.

---

### Slice 2 — Magic Link Entry Flow (P1)

**Scope:**
- `GET /visit/:token` — resolve token, return visit phase + patient context, or 410/409/404
- `MagicLinkEntry` page — calls endpoint on mount, shows spinner, routes to correct page on success, shows Hebrew error on failure
- Mark token as used on first access (one-time-use enforcement)

**Done when:** Clicking a seeded magic link URL in Telegram opens the PWA and routes to the correct page.

---

### Slice 3 — Waiting Screen (P2)

**Scope:**
- `GET /visit/:token/waiting` — return queue position, estimated wait, broadcast message
- `Waiting` page — shows position + message, auto-refreshes every 60 seconds
- Staff broadcast endpoint: `POST /staff/queue/:appointmentId/broadcast`

**Done when:** Patient sees live waiting status; staff can push a broadcast message that appears on patient screen within 60 seconds.

---

### Slice 4 — Checklist (P3)

**Scope:**
- `GET /visit/:token/checklist` — return template items + patient progress
- `PATCH /visit/:token/checklist` — update completed items
- `Checklist` page — renders items, tap to check off, persists to API

**Done when:** Patient can open checklist, check items, refresh page, and see progress preserved.

---

### Slice 5 — Photo Navigation (P4)

**Scope:**
- `GET /visit/:token/navigation` — return assigned route steps (image URL + instruction text)
- `Navigation` page — step-by-step photo display, previous/next, progress indicator
- Navigation data (5 routes, images, step text) seeded via `db:seed` for MVP demo

**Done when:** Patient can walk through a complete navigation route step by step.

---

### Slice 6 — Digital Forms + Signature + PDF (P5)

**Scope:**
- `GET /visit/:token/forms` — return form fields for procedure type
- `POST /visit/:token/forms` — save field data + signature + captured images
- `POST /visit/:token/forms/submit` — generate PDF, upload to S3, return URL
- `Forms` page — renders fields, react-signature-canvas for signature, submit → show PDF link

**Done when:** Patient fills a form, signs, submits, and receives a downloadable PDF.

---

### Slice 7 — Staff Backoffice (P6)

**Scope:**
- Staff auth: `POST /staff/login` → JWT, `POST /staff/logout`
- Queue view: `GET /staff/queue` — all patients in department with status
- Station management: `PATCH /staff/stations/:id` — mark station complete
- Patient detail: visit summary, form submissions, checklist status
- Admin: department CRUD, navigation route management (including S3 image upload), checklist template editor

**Done when:** Staff can log in, see the full patient queue, update station statuses, and manage department configuration.

---

## Git Workflow

Each slice is implemented on its own feature branch and merged back on completion:

```
git checkout -b feat/slice-1-foundation-telegram
# implement
git merge back to 001-patient-visit-companion

git checkout -b feat/slice-2-magic-link-flow
# implement
git merge back
# ... and so on
```

---

## End State

After all 7 slices: **pilot-ready MVP**. Every Must-Have from the constitution works end-to-end. The only gap between this state and live production is:
1. Swap Telegram → Twilio (one file change)
2. Production hosting + TLS
3. S3 with real navigation images

---

## Out of Scope (this design)

Web Push notifications, WhatsApp, offline fallback, extended navigation routes (>5), EMR integration — all Should-Have or Nice-to-Have per the constitution.
