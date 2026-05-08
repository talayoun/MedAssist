# Tasks: MedAssist — Patient Visit Companion System

**Input**: Design documents from `/specs/001-patient-visit-companion/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested — test tasks are excluded from this breakdown.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. 9 user stories + foundational infra.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo scaffolding, tooling, and local dev infrastructure. No app logic.

- [ ] T001 Initialize monorepo: create turbo.json, pnpm-workspace.yaml, root package.json with workspace glob `apps/*` + `packages/*`
- [ ] T002 Scaffold apps/api package: package.json (Express, BullMQ, Puppeteer-core, sharp, Zod, Vitest, Supertest), tsconfig.json strict, src/ directory tree per plan.md
- [ ] T003 [P] Scaffold apps/patient-pwa package: package.json (React 18, Vite 5, vite-plugin-pwa injectManifest, react-signature-canvas, Zod), tsconfig.json strict
- [ ] T004 [P] Scaffold apps/staff-backoffice package: package.json (React 18, Vite 5, Zod), tsconfig.json strict
- [ ] T005 [P] Scaffold packages/shared-types package: package.json, tsconfig.json, src/patient.ts + src/visit.ts + src/staff.ts stubs
- [ ] T006 Create docker-compose.yml at repo root with PostgreSQL 15 (port 5432, volume) and Redis 7 (port 6379, volume) services
- [ ] T007 [P] Create .env.example files for apps/api, apps/patient-pwa, apps/staff-backoffice with all variables from quickstart.md
- [ ] T008 [P] Configure ESLint with TypeScript strict plugin in each package (eslint.config.js per package)
- [ ] T009 Configure Vitest in all packages: vitest.config.ts (api: supertest environment, pwa/backoffice: happy-dom environment)
- [ ] T010 Configure Turborepo pipeline in turbo.json (dev, build, test tasks with content-hash caching and correct package dependency order)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, shared types, Express core, auth, BullMQ — MUST be complete before any user story begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T011 Create PostgreSQL migration runner in apps/api/src/db/migrations/ (node-pg-migrate or raw SQL runner) and wire `db:migrate` npm script in apps/api/package.json
- [ ] T012 [P] Write migration 001_core.sql: `patients` (id UUID PK, name, phone_number E.164 unique, created_at) and `departments` (id UUID PK, hospital_id, name, navigation_route_id nullable, created_at) tables
- [ ] T013 [P] Write migration 002_appointments.sql: `appointments` (id, patient_id FK, department_id FK, procedure_type nullable, track enum elective|er, visit_datetime nullable, status enum scheduled|active|completed|cancelled, magic_link_send_time nullable, created_at, updated_at) and `magic_links` (id, appointment_id FK, token UUID unique indexed, track, expires_at, used_at nullable, link_type enum patient|companion, created_at) and `magic_link_timing_rules` (id, department_id FK, procedure_type nullable, send_offset_hours, created_at) tables
- [ ] T014 [P] Write migration 003_staff.sql: `staff_users` (id, name, email unique, password_hash, role enum staff|admin, department_id nullable FK, locked_until nullable, last_active_at nullable, is_active default true, created_at) table
- [ ] T015 [P] Write migration 004_checklists.sql: `checklist_templates` (id, procedure_type, hospital_id, items_json, created_at, updated_at) and `checklist_progress` (id, patient_id FK, appointment_id FK, template_id FK, completed_items_json default [], last_updated_at) tables
- [ ] T016 [P] Write migration 005_navigation.sql: `navigation_routes` (id, department_id FK, name, steps_count, created_at, updated_at) and `route_steps` (id, route_id FK, step_order unique-per-route, image_url, instruction_text max 120 chars, created_at) tables
- [ ] T017 [P] Write migration 006_waiting.sql: `waiting_queue` (id, appointment_id FK unique, department_id FK, arrival_time, estimated_wait_minutes nullable, status enum waiting|in_treatment|done, broadcast_message nullable, broadcast_sent_at nullable, updated_at) and `patient_stations` (id, appointment_id FK, department_id FK, order_index, status enum pending|complete, completed_at nullable, completed_by_staff_id nullable FK, created_at) tables
- [ ] T018 [P] Write migration 007_forms.sql: `digital_forms` (id, patient_id FK, appointment_id FK, form_type, field_data_json default {}, captured_images_json default [], signature_data nullable, pdf_url nullable, submitted_at nullable, created_at, updated_at), `companions` (id, appointment_id FK, phone_number, magic_link_id FK, consent_recorded_at, created_at), and `notifications` (id, patient_id FK, appointment_id FK, type enum magic_link|checklist_reminder|station_update|broadcast, sent_at, status enum sent|failed|retrying, retry_count default 0, triggering_event, provider_message_id nullable) tables
- [ ] T019 Implement PostgreSQL connection pool in apps/api/src/db/db.ts (pg Pool configured from DATABASE_URL env var, exported query helper)
- [ ] T020 Implement Redis client in apps/api/src/db/redis.ts (ioredis client from REDIS_URL, helper functions: `addToRevocationSet(token, ttlSeconds)`, `isTokenRevoked(token)`)
- [ ] T021 Implement Express app in apps/api/src/app.ts (JSON body parser, cookie-parser for httpOnly `med_session`, CORS with PATIENT_APP_URL origin, Helmet security headers, route mounts for all modules, 404 and global error handler middleware)
- [ ] T022 Implement auth middleware in apps/api/src/middleware/auth.ts (JWT httpOnly cookie validation + Redis revocation check for staff routes; Magic Link token validation from URL path param for patient routes; role-based access matrix: Patient → own visit endpoints, Companion → read-only waiting, Staff → own department, Admin → all departments; `locked_until` check; `last_active_at` session touch)
- [ ] T023 Define Zod schemas in packages/shared-types/src/patient.ts (PatientDTO, AppointmentDTO, MagicLinkDTO with E.164 phone validation, link_type enum, track enum, status enums)
- [ ] T024 [P] Define Zod schemas in packages/shared-types/src/visit.ts (ChecklistItemDTO, ChecklistProgressDTO, NavigationStepDTO, NavigationRouteDTO, WaitingStatusDTO, DigitalFormDTO, FormFieldDTO)
- [ ] T025 [P] Define Zod schemas in packages/shared-types/src/staff.ts (StaffUserDTO, QueuePatientDTO, PatientStationDTO, BroadcastDTO, AdminRouteDTO, ChecklistTemplateDTO, TimingRuleDTO)
- [ ] T026 Implement BullMQ queue setup in apps/api/src/modules/notifications/queue.ts (create `notifications` Queue and Worker factory, export `notificationQueue` instance backed by Redis connection from db/redis.ts)
- [ ] T027 [P] Create patient PWA React app entry in apps/patient-pwa/src/main.tsx (set `document.documentElement.dir = "rtl"` and `lang="he"`, React Router v6 with routes: `/visit/:token` → MagicLinkEntry, `/visit/:token/checklist`, `/visit/:token/navigation`, `/visit/:token/waiting`, `/visit/:token/forms`, `/error/:type`)
- [ ] T028 [P] Create staff backoffice React app entry in apps/staff-backoffice/src/main.tsx (React Router v6: `/login`, `/queue`, `/patients/:appointmentId`, `/admin/*`; auth context with JWT user state and logout)
- [ ] T029 Create seed script in apps/api/src/db/seed.ts (insert: 1 admin user `admin@medassist.test`/`AdminPassword123`, 1 staff user `staff@medassist.test`/`StaffPassword123`, 1 department "קרדיולוגיה", 1 elective appointment + magic link, 5 navigation route steps, 1 checklist template for procedure type "pre-op-cardiac"; print magic link URL to console)
- [ ] T030 [P] Create patient PWA API client in apps/patient-pwa/src/services/api.ts (fetch wrapper that injects `:token` into all patient endpoint paths; typed methods for all patient-api.md endpoints; returns typed DTOs from shared-types)
- [ ] T031 [P] Create staff backoffice API client in apps/staff-backoffice/src/services/api.ts (fetch wrapper with `credentials: "include"` for JWT cookie; typed methods for all staff-api.md and admin endpoints; handles 401 redirect to /login)

**Checkpoint**: Foundation complete — all 9 user story phases can now begin.

---

## Phase 3: User Story 1 — Magic Link Entry (Priority: P1) 🎯 MVP

**Goal**: Patient receives SMS, taps link, lands on their personalized page in the correct phase (checklist/navigation/waiting) — no login, no account.

**Independent Test**: Run `db:seed`, copy printed magic link, open on mobile browser, confirm patient name + department display with no login step. Verify expired/used link error screens show Hebrew plain-language messages.

- [ ] T032 [P] [US1] Implement magic-links service in apps/api/src/modules/magic-links/magic-links.service.ts (generate UUID token, validate token → check `used_at IS NULL AND expires_at > NOW()`, consume token → set `used_at`, determine response phase based on appointment track + status)
- [ ] T033 [US1] Implement magic-links router in apps/api/src/modules/magic-links/magic-links.router.ts (GET /visit/:token — resolve token via service, return 200 with phase/patient/appointment_id, or 410 with Hebrew `"הקישור פג תוקף..."` / 409 with Hebrew `"הקישור כבר נפתח..."` / 404)
- [ ] T034 [US1] Implement SMS notifications producer in apps/api/src/modules/notifications/notifications.producer.ts (check notification cap: count existing notifications for appointment_id ≤ 4; check dedup: no prior notification of same type for appointment_id; if both pass, add job to `notificationQueue`, insert `notifications` row with status `retrying`)
- [ ] T035 [US1] Implement SMS notifications consumer in apps/api/src/modules/notifications/notifications.consumer.ts (BullMQ Worker: send SMS via Twilio SDK using `TWILIO_*` env vars; on success update notification status to `sent`; on failure: if retry_count < 3 reschedule with 5-minute delay and increment retry_count, else mark `failed`; always update `provider_message_id`)
- [ ] T036 [US1] Implement MagicLinkEntry page in apps/patient-pwa/src/pages/MagicLinkEntry/index.tsx (call GET /visit/:token on mount, show loading spinner, on success route to `/visit/:token/checklist`, `/visit/:token/navigation`, or `/visit/:token/waiting` based on `phase`, on 410/409/404 route to `/error/:type`)
- [ ] T037 [US1] Implement Error pages in apps/patient-pwa/src/pages/Error/index.tsx (render expired-link screen: "הקישור פג תוקף. צור קשר עם הצוות לקישור חדש." and used-link screen: "הקישור כבר נפתח. פנה לצוות לקישור חדש." — no error codes, plain Hebrew per FR-054)
- [ ] T038 [P] [US1] Implement elective Magic Link scheduling in apps/api/src/modules/magic-links/magic-links.scheduler.ts (on appointment creation for elective track: resolve timing rule via `(department_id, procedure_type)` → dept-only → system default, compute `send_offset_hours` relative to `visit_datetime`, enqueue delayed BullMQ job to generate MagicLink and call notifications producer at that time)

**Checkpoint**: US1 fully functional — patient can receive SMS and land on personalized page.

---

## Phase 4: User Story 2 — Pre-Visit Preparation Checklist (Priority: P2)

**Goal**: Elective patient sees procedure-specific checklist; checks persist across browser sessions; time-sensitive items highlight within 24h of visit.

**Independent Test**: Open elective magic link, see checklist with procedure-specific items, check 2 items, close browser, reopen magic link, confirm checked items remain checked.

- [ ] T039 [P] [US2] Implement checklist service in apps/api/src/modules/checklist/checklist.service.ts (look up ChecklistTemplate by `appointment.procedure_type`, load or create ChecklistProgress for appointment, merge template items with completion state, compute `hours_until_visit` and set `time_sensitive` flag active when < 24h and item is unchecked)
- [ ] T040 [P] [US2] Implement checklist router in apps/api/src/modules/checklist/checklist.router.ts (GET /visit/:token/checklist → service.getChecklist; POST /visit/:token/checklist/progress with body `{ completed_item_ids }` → upsert ChecklistProgress, return updated state)
- [ ] T041 [US2] Implement Checklist page in apps/patient-pwa/src/pages/Checklist/index.tsx (render grouped checklist items by category, checkbox tap calls POST /progress, visually highlight time-sensitive items when `hours_until_visit < 24` and `completed === false`, show completion banner when `all_complete === true`)
- [ ] T042 [US2] Implement checklist reminder scheduler in apps/api/src/modules/notifications/reminders.scheduler.ts (FR-011: when appointment is created, schedule a BullMQ delayed job to check if `magic_links.used_at IS NULL` at the configured reminder window; if still unopened, call notifications producer with type `checklist_reminder`; deduplication ensures exactly one reminder per appointment)

**Checkpoint**: US2 fully functional — checklist persists across sessions with 24h highlight.

---

## Phase 5: User Story 3 — Photo-Based Step-by-Step Navigation (Priority: P3)

**Goal**: Patient navigates from parking/entrance to department via one-photo-at-a-time steps; taps "אני כאן" to advance; final step transitions to waiting screen.

**Independent Test**: Using seeded 5-step navigation route, advance through all steps by tapping confirm, verify step counter updates correctly, verify final step routes to `/waiting`.

- [ ] T043 [P] [US3] Implement navigation service in apps/api/src/modules/navigation/navigation.service.ts (get route for appointment's department, track `current_step` progress, confirm step → advance or emit `phase: "waiting"` on last step, return only current + next step image_urls for prefetch, include `parking_coordinates` from department record)
- [ ] T044 [P] [US3] Implement navigation router in apps/api/src/modules/navigation/navigation.router.ts (GET /visit/:token/navigation → current route + step; POST /visit/:token/navigation/steps/:step_id/confirm → next step or `{ phase: "waiting", message: "הגעת! הצוות יודע שאתה כאן." }`)
- [ ] T045 [US3] Implement Navigation page in apps/patient-pwa/src/pages/Navigation/index.tsx (display current landmark photo full-width, Hebrew instruction text below, "אני כאן" primary button min 44px height, step counter "שלב X מתוך Y" visible at all times, back button to re-fetch previous step, on `phase: "waiting"` response navigate to `/visit/:token/waiting`)
- [ ] T046 [US3] Implement external map launch in apps/patient-pwa/src/pages/Navigation/index.tsx (render "נווט לחניון" button that opens `geo:{lat},{lng}?q={lat},{lng}(Hospital+Parking)` URL to launch device maps app per FR-017; show only if `parking_coordinates` present in response)

**Checkpoint**: US3 fully functional — 5-step photo navigation works end-to-end with correct phase transition.

---

## Phase 6: User Story 4 — Waiting Screen (Priority: P4)

**Goal**: Patient on waiting screen sees confirmation, staff-set wait estimate, and broadcast messages; auto-refreshes every 60 seconds without patient action.

**Independent Test**: Staff member sets wait estimate via PATCH /staff/queue/wait-estimate; patient waiting screen displays updated estimate within 60 seconds without manual refresh.

- [ ] T047 [P] [US4] Implement waiting service in apps/api/src/modules/waiting/waiting.service.ts (create or fetch WaitingQueue row on arrival, return status/estimate/broadcast; handle POST contact → log contact_message type with patient appointment_id to a `contact_messages` log or notifications table; broadcast update → write `broadcast_message` + `broadcast_sent_at` to all `waiting` status rows for the department; clear stale broadcast if > 60 min old on read)
- [ ] T048 [P] [US4] Implement waiting router in apps/api/src/modules/waiting/waiting.router.ts (GET /visit/:token/waiting → waiting service getStatus, return `{ status, arrival_confirmed, department, estimated_wait_minutes, broadcast_message, broadcast_sent_at, updated_at }`; POST /visit/:token/waiting/contact with validated `message_type` enum)
- [ ] T049 [US4] Implement Waiting page in apps/patient-pwa/src/pages/Waiting/index.tsx (call GET /waiting on mount and every 60 seconds via `setInterval`; show "הגעת! הצוות יודע שאתה כאן." arrival confirmation; render estimated wait in plain Hebrew "כ-X דקות" only when `estimated_wait_minutes !== null`; show patience message when estimate elapsed; render `broadcast_message` banner when present; render "צור קשר עם הצוות" button with pre-written message type picker)

**Checkpoint**: US4 fully functional — waiting screen auto-polls and reflects staff updates within 60 seconds.

---

## Phase 7: User Story 5 — Digital Forms & Document Capture (Priority: P5)

**Goal**: Patient fills forms, photos ID/insurance card, signs consent — all on phone. Staff exports completed forms as PDF.

**Independent Test**: Patient submits form with field data + image + signature; staff triggers POST /staff/patients/:id/export-pdf; returned URL serves a Hebrew RTL PDF with all submitted content.

- [ ] T050 [P] [US5] Implement forms service in apps/api/src/modules/forms/forms.service.ts (list DigitalForms for appointment; get form with field_data draft; autosave draft via upsert; upload image via sharp compress to ≤5MB JPEG + S3 upload, store S3 URL in captured_images_json; save base64 signature_data; submit → set `submitted_at`; restore draft on reopen by returning current field_data_json)
- [ ] T051 [P] [US5] Implement forms router in apps/api/src/modules/forms/forms.router.ts (GET /visit/:token/forms; GET /visit/:token/forms/:form_id; PUT /visit/:token/forms/:form_id body `{ field_data }`; POST /visit/:token/forms/:form_id/images multipart; POST /visit/:token/forms/:form_id/signature; POST /visit/:token/forms/:form_id/submit; enforce 413 for images > 5MB)
- [ ] T052 [P] [US5] Implement PDF service in apps/api/src/modules/pdf/pdf.service.ts (launch Puppeteer with shared browser pool; render HTML template with `dir="rtl"` containing all DigitalForms data, field values, captured_images, and signature_data for the appointment; print to PDF; upload PDF to S3; return signed URL valid 15 minutes)
- [ ] T053 [US5] Implement PDF export router in apps/api/src/modules/pdf/pdf.router.ts (POST /staff/patients/:appointment_id/export-pdf → trigger pdf.service, return `{ pdf_url, expires_at }` synchronously or `{ job_id, status: "generating" }` for large async jobs; GET /staff/export-jobs/:job_id → poll BullMQ job status)
- [ ] T054 [US5] Implement Forms page in apps/patient-pwa/src/pages/Forms/index.tsx (render form list from GET /forms; for open form: render text/select fields, image capture button using `<input type="file" accept="image/*" capture="environment">`, react-signature-canvas for signature fields; autosave on blur; submit button calls POST /submit; show saved state indicator per FR-027)

**Checkpoint**: US5 fully functional — patient completes forms on phone, staff exports PDF.

---

## Phase 8: User Story 6 — Emergency (ER) Track (Priority: P6)

**Goal**: Staff creates ER Magic Link with phone number only; patient lands directly on waiting screen; abbreviated consent forms available.

**Independent Test**: Staff POST /staff/er-links with phone number → patient receives SMS within 60 seconds → opens link → lands on waiting screen (not checklist); ER link expires after 12 hours.

- [ ] T055 [P] [US6] Implement ER link creation in apps/api/src/modules/magic-links/er-links.router.ts (POST /staff/er-links: validate E.164 phone_number, upsert Patient by phone, create ER Appointment (track: "er", status: "active"), generate MagicLink with `expires_at = NOW() + 12h`, immediately call notifications producer with type `magic_link`, return `{ appointment_id, magic_link_token, expires_at, sms_status: "queued" }`)
- [ ] T056 [US6] Update phase routing in apps/patient-pwa/src/pages/MagicLinkEntry/index.tsx to route ER track appointments (track === "er") directly to `/visit/:token/waiting`, bypassing checklist phase per FR-030
- [ ] T057 [US6] Implement abbreviated consent form initialization in apps/api/src/modules/forms/forms.service.ts (when ER appointment is created in T055, auto-create a `DigitalForm` row with `form_type: "consent-general"` for the appointment so patient sees it immediately in the waiting screen forms section per FR-031)

**Checkpoint**: US6 fully functional — ER onboarding flow works end-to-end in < 60 seconds.

---

## Phase 9: User Story 7 — Staff Back-Office Queue Dashboard (Priority: P7)

**Goal**: Staff logs in to desktop dashboard, sees waiting patients, updates status, sends broadcasts, manages stations, creates ER links — all in one action each.

**Independent Test**: Staff login → queue shows seeded patient → tap status to "In Treatment" → patient waiting screen reflects change within 60 seconds → send broadcast → patient sees message on next poll.

- [ ] T058 [P] [US7] Implement staff auth service in apps/api/src/modules/staff/auth.service.ts (login: validate email+password with bcrypt, check `locked_until`, increment `failed_attempts` or reset on success, lock for 15 min after 5 failures, issue JWT signed with JWT_SECRET with 60-min expiry, set in httpOnly `med_session` cookie; logout: add token to Redis revocation SET with TTL; session touch: update `last_active_at` on each authenticated request)
- [ ] T059 [P] [US7] Implement staff auth router in apps/api/src/modules/staff/auth.router.ts (POST /auth/login → return user object + set cookie, 401 for invalid creds, 423 with `locked_until` for locked account; POST /auth/logout → revoke token, clear cookie; GET /auth/me → return current user)
- [ ] T060 [P] [US7] Implement queue service in apps/api/src/modules/staff/queue.service.ts (get all non-done WaitingQueue rows for staff's department_id joined with patient name + stations + form counts; update patient status in WaitingQueue; set estimated_wait_minutes for department; write broadcast_message + broadcast_sent_at to all waiting rows for department)
- [ ] T061 [P] [US7] Implement queue router in apps/api/src/modules/staff/queue.router.ts (GET /staff/queue → queue service getQueue; PATCH /staff/queue/:appointment_id/status body `{ status }`; PATCH /staff/queue/wait-estimate body `{ estimated_wait_minutes }`; POST /staff/queue/broadcast body `{ message }` max 280 chars → return `{ sent, recipient_count, sent_at }`)
- [ ] T062 [P] [US7] Implement stations service in apps/api/src/modules/staff/stations.service.ts (add PatientStation + trigger notifications producer with type `station_update` for the patient; reorder stations — validate all station IDs present, update order_index values; mark complete — set status + completed_at + completed_by_staff_id)
- [ ] T063 [P] [US7] Implement stations router in apps/api/src/modules/staff/stations.router.ts (POST /staff/patients/:appointment_id/stations body `{ department_id, order_index }`; PUT /staff/patients/:appointment_id/stations/order body `{ station_ids }`; PATCH /staff/patients/:appointment_id/stations/:station_id body `{ status: "complete" }`)
- [ ] T064 [US7] Implement Login page in apps/staff-backoffice/src/pages/Login/index.tsx (email + password form, submit calls POST /auth/login, store user in auth context on success, redirect to /queue, show error message for 401, show lockout countdown for 423)
- [ ] T065 [US7] Implement Queue dashboard page in apps/staff-backoffice/src/pages/Queue/index.tsx (table with patient name, arrival time, time-in-queue, status selector; one-tap status update; department-wide wait estimate input; broadcast message form; "שלח קישור חירום" ER link creation with phone number input; auto-refresh every 30 seconds)
- [ ] T066 [US7] Implement PatientDetail page in apps/staff-backoffice/src/pages/PatientDetail/index.tsx (show clinical stations list with add-station dropdown, reorder controls, manual mark-complete button; show submitted forms count; "ייצא PDF" export button that calls POST /export-pdf and opens returned pdf_url)

**Checkpoint**: US7 fully functional — staff can manage queue and trigger all patient-facing updates.

---

## Phase 10: User Story 8 — Admin: System Configuration (Priority: P8)

**Goal**: Admin manages staff accounts, uploads navigation routes with photos, creates checklist templates, configures Magic Link timing rules — all via Back-Office UI, no code.

**Independent Test**: Admin creates a new staff user → logs in as that user → sees only assigned department queue. Admin uploads 5-step route with photos → next patient navigating sees updated route.

- [ ] T067 [P] [US8] Implement admin staff service in apps/api/src/modules/admin/admin-staff.service.ts (list staff with optional department_id filter; create staff user with bcrypt-hashed password, enforce min 12-char + email unique; update name/department/is_active; reset password with new bcrypt hash)
- [ ] T068 [P] [US8] Implement admin staff router in apps/api/src/modules/admin/admin-staff.router.ts (GET /admin/staff; POST /admin/staff; PATCH /admin/staff/:staff_id; POST /admin/staff/:staff_id/reset-password; all require `role: admin`)
- [ ] T069 [P] [US8] Implement admin routes service in apps/api/src/modules/admin/admin-routes.service.ts (create NavigationRoute for department; add RouteStep: accept JPEG/PNG image, compress to ≤200KB via sharp, upload to S3, store image_url + instruction_text + step_order; update step instruction or image; delete step and re-sequence remaining steps; reorder steps — validate all step IDs present, update step_order values and update steps_count)
- [ ] T070 [P] [US8] Implement admin routes router in apps/api/src/modules/admin/admin-routes.router.ts (GET /admin/routes; GET /admin/routes/:route_id with steps; POST /admin/routes body `{ name, department_id }`; POST /admin/routes/:route_id/steps multipart `image + instruction + order`; PUT /admin/routes/:route_id/steps/:step_id multipart; DELETE /admin/routes/:route_id/steps/:step_id; PUT /admin/routes/:route_id/steps/order body `{ step_ids }`)
- [ ] T071 [P] [US8] Implement admin checklists service in apps/api/src/modules/admin/admin-checklists.service.ts (list templates; get template by id; create template with items_json validation — each item needs stable UUID, Hebrew text, category enum, time_sensitive bool; update template with full items array replacement)
- [ ] T072 [P] [US8] Implement admin checklists router in apps/api/src/modules/admin/admin-checklists.router.ts (GET /admin/checklists; GET /admin/checklists/:template_id; POST /admin/checklists; PUT /admin/checklists/:template_id)
- [ ] T073 [P] [US8] Implement admin timing rules service in apps/api/src/modules/admin/admin-timing-rules.service.ts (CRUD for MagicLinkTimingRules; validate send_offset_hours < 0; enforce unique constraint on (department_id, procedure_type); implement rule resolution logic: procedure-specific match → department-wide match → system default from env)
- [ ] T074 [P] [US8] Implement admin timing rules router in apps/api/src/modules/admin/admin-timing-rules.router.ts (GET /admin/timing-rules; POST /admin/timing-rules; PUT /admin/timing-rules/:rule_id; DELETE /admin/timing-rules/:rule_id; 409 on duplicate rule)
- [ ] T075 [US8] Implement Admin section in apps/staff-backoffice/src/pages/Admin/ (index.tsx with tabs or sub-nav for: Staff Management — user list + create/edit form; Route Editor — route list + step upload form with image preview; Checklist Templates — template list + item editor; Timing Rules — department rule list + create/edit form; all guarded by `role === "admin"` check in auth context)

**Checkpoint**: US8 fully functional — admin can configure all system content without developer access.

---

## Phase 11: User Story 9 — Companion: Shared Wait Status (Priority: P9)

**Goal**: Staff issues companion link for a patient; companion receives SMS and views real-time waiting status; cannot send contact messages.

**Independent Test**: Staff POST /staff/patients/:id/companion-link → second phone receives SMS → opens companion link → sees same waiting status as patient → POST /waiting/contact returns 403.

- [ ] T076 [P] [US9] Implement companion service in apps/api/src/modules/staff/companion.service.ts (create Companion row for appointment with phone_number + consent_recorded_at = NOW(); create MagicLink with `link_type: "companion"`, expires at same time as patient's magic link; call notifications producer with type `magic_link` for companion phone number)
- [ ] T077 [P] [US9] Implement companion router in apps/api/src/modules/staff/companion.router.ts (POST /staff/patients/:appointment_id/companion-link body `{ phone_number }` → companion service, return `{ companion_id, magic_link_token, sms_status: "queued" }`)
- [ ] T078 [US9] Enforce companion read-only restriction in apps/api/src/middleware/auth.ts (when token resolves to `MagicLinks.link_type === "companion"`, allow GET /visit/:token/waiting but reject POST /visit/:token/waiting/contact with 403 `{ "error": "forbidden", "message": "פעולה זו אינה זמינה עבור מלווה." }`)
- [ ] T079 [US9] Add companion link issuance UI to apps/staff-backoffice/src/pages/PatientDetail/index.tsx (phone number input field + "שלח קישור למלווה" button that calls POST /companion-link; show success confirmation with SMS status)

**Checkpoint**: US9 fully functional — companion receives link and has read-only waiting status view.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Offline support, Hebrew RTL compliance, notification safeguards, security hardening.

- [ ] T080 [P] Implement Service Worker in apps/patient-pwa/src/sw.ts (vite-plugin-pwa injectManifest: `precacheAndRoute(self.__WB_MANIFEST)` for app shell; `NetworkFirst` strategy with named runtime cache for `/visit/*/navigation` and `/visit/*/checklist`; `CacheFirst` fallback; register offline banner event listener on `fetch` failure)
- [ ] T081 [P] Implement Hebrew offline banner component in apps/patient-pwa/src/components/OfflineBanner/index.tsx (listen to `online`/`offline` window events; display fixed banner "אין חיבור - מציג מידע שמור" in Hebrew when offline per FR-034; min 16pt font, sufficient contrast)
- [ ] T082 [P] Audit all patient PWA pages for Hebrew RTL accessibility compliance: verify `<html dir="rtl" lang="he">`, minimum 16pt (1rem = 16px base) font-size on all text, minimum 44×44px tap target dimensions on all interactive elements per FR-051 to FR-053
- [ ] T083 [P] Validate notification cap and deduplication in apps/api/src/modules/notifications/notifications.producer.ts (add integration test scenario: insert 4 notifications for an appointment, verify 5th enqueue is silently dropped and logged; verify second enqueue of same type for same appointment is rejected per FR-035)
- [ ] T084 [P] Configure HTTPS and security headers in apps/api/src/app.ts (Helmet with strict CSP, HSTS, X-Content-Type-Options; validate `PATIENT_APP_URL` CORS origin; add rate limiting middleware — 429 response per patient-api.md; confirm Magic Link URL contains only UUID token with no medical data per FR-005)
- [ ] T085 Run quickstart.md validation end-to-end: `pnpm install` → `docker compose up -d` → `pnpm --filter api db:migrate` → `pnpm --filter api db:seed` → `pnpm dev` → open seeded magic link URL on mobile browser → confirm checklist loads with patient name and department name

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — **BLOCKS all user stories**
- **User Stories (Phases 3–11)**: All depend on Foundational (Phase 2) completion
  - Can proceed in parallel by story once foundation is ready
  - Recommended sequential order for solo developer: P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9
- **Polish (Phase 12)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | Depends On | Notes |
|---|---|---|
| US1 Magic Link Entry | Foundational | Entry gate — nothing works without it |
| US2 Checklist | US1 (MagicLinkEntry routing) | Needs magic link to reach checklist page |
| US3 Navigation | US1 (MagicLinkEntry routing) | Needs magic link to reach navigation page |
| US4 Waiting Screen | US1 (MagicLinkEntry routing), US3 final step | Waiting screen reachable from navigation final step |
| US5 Digital Forms | US4 (WaitingQueue arrival) | Forms accessible from waiting phase |
| US6 ER Track | US1 (magic-links module), US4 (waiting screen) | ER track reuses magic-link generation + waiting screen |
| US7 Staff Queue | US4 (WaitingQueue model + waiting screen polling) | Staff updates are what patients see on waiting screen |
| US8 Admin Config | US7 (staff auth) | Admin is a role within staff auth system |
| US9 Companion | US4 (waiting screen read), US7 (staff UI to issue link) | Companion reads same waiting data; staff issues link |

### Within Each User Story

- Service tasks before router tasks (routers depend on services)
- API tasks before UI tasks (UI depends on API contract)
- Shared-types DTOs (Phase 2) before any service that uses them
- Tasks marked [P] within a phase can run simultaneously

---

## Parallel Execution Examples

### Phase 2 — Foundational (maximum parallelism)

```
In parallel:
  T012 migration 001_core.sql
  T013 migration 002_appointments.sql
  T014 migration 003_staff.sql
  T015 migration 004_checklists.sql
  T016 migration 005_navigation.sql
  T017 migration 006_waiting.sql
  T018 migration 007_forms.sql
  T023 shared-types/patient.ts
  T024 shared-types/visit.ts
  T025 shared-types/staff.ts
  T027 patient-pwa main.tsx
  T028 staff-backoffice main.tsx
  T030 patient-pwa api.ts
  T031 staff-backoffice api.ts
Sequential after migrations:
  T019 db.ts → T020 redis.ts → T021 app.ts → T022 auth middleware
```

### Phase 9 — US7 Staff Queue (service + router pairs in parallel)

```
In parallel:
  T058 auth.service.ts + T059 auth.router.ts
  T060 queue.service.ts + T061 queue.router.ts
  T062 stations.service.ts + T063 stations.router.ts
Sequential after APIs:
  T064 Login page → T065 Queue dashboard → T066 PatientDetail
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 Magic Link Entry
4. **STOP and VALIDATE**: Run quickstart.md, confirm magic link SMS → browser → personalized page works
5. Demo-ready: the core value proposition is provable

### Full Incremental Delivery

| Sprint | Delivers | Independently Testable |
|---|---|---|
| 1 | Phase 1 + 2 + US1 | Magic Link entry + SMS |
| 2 | US2 + US3 | Checklist + Navigation |
| 3 | US4 + US7 (auth + queue) | Waiting screen + Staff dashboard |
| 4 | US5 + US6 | Forms + ER track |
| 5 | US8 + US9 | Admin config + Companion |
| 6 | Phase 12 Polish | Offline SW + RTL audit + security |

### Parallel Team (3 developers after Foundational)

- **Dev A**: US1 → US3 → US5 (patient journey features)
- **Dev B**: US4 → US6 → US9 (queue + ER + companion)
- **Dev C**: US7 → US8 → Phase 12 (staff + admin + polish)

---

## Notes

- [P] tasks touch different files and have no blocking inter-dependencies within the phase
- Story labels map directly to spec.md user story numbers (US1 = Story 1, etc.)
- Each story phase is independently completable and testable — no story requires another story's API to be complete
- All patient-facing text must be Hebrew; staff/admin interfaces are English (per spec Assumptions)
- The `shared-types` Zod schemas (T023–T025) are the single source of truth — API services and client code both import from `packages/shared-types`
- Commit after each task or logical group; use `pnpm --filter <app> dev` to develop a single app in isolation
