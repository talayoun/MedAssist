# Data Model: MedAssist — Patient Visit Companion System

**Phase**: 1 | **Branch**: `001-patient-visit-companion` | **Date**: 2026-03-28

All entities are derived from the feature spec Key Entities section and the architecture document. Physical implementation (column types, indexes, migrations) is defined at build time. This document is technology-agnostic.

---

## Entity Map

```
Patients ──────────────────────────────────────────────────┐
    │                                                       │
    ├── Appointments ──┬── MagicLinks (1:many)              │
    │       │          └── ChecklistProgress (1:1)          │
    │       │          └── DigitalForms (1:many)            │
    │       │          └── Notifications (1:many)           │
    │       │          └── Companions (1:many)              │
    │       │          └── PatientStations (1:many)         │
    │       │                                               │
    │       └── Departments ──┬── NavigationRoutes          │
    │                         │       └── RouteSteps        │
    │                         ├── WaitingQueue entries      │
    │                         ├── StaffUsers                │
    │                         └── MagicLinkTimingRules      │
    │                                                       │
    └── ChecklistTemplates (via procedure_type) ────────────┘
```

---

## Entities

### Patients

Represents a person with a hospital visit. Stores only coordination data — no clinical data.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `name` | Patient's full name | Required, non-empty |
| `phone_number` | Mobile phone number (E.164 format) | Required, unique |
| `created_at` | Record creation timestamp | Required |

**Validation rules**:
- Phone number must be in E.164 format (e.g., `+972501234567`)
- Name must be non-empty; medical data must never be stored here

---

### Appointments

Links a patient to a department visit. The core record for a hospital encounter.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `patient_id` | → Patients | Required, FK |
| `department_id` | → Departments | Required, FK |
| `procedure_type` | Procedure identifier (e.g., `"pre-op-cardiac"`) | Required for elective; nullable for ER |
| `track` | Visit type | Enum: `elective` \| `er` |
| `visit_datetime` | Scheduled appointment time | Required for elective; nullable for ER |
| `status` | Current appointment state | Enum: `scheduled` \| `active` \| `completed` \| `cancelled` |
| `magic_link_send_time` | Scheduled send time for the Magic Link SMS | Nullable (computed from MagicLinkTimingRules; null for ER — sent immediately) |
| `created_at` | Record creation timestamp | Required |
| `updated_at` | Last update timestamp | Required |

**State transitions**:
```
scheduled → active (when patient opens Magic Link)
active → completed (when staff marks visit done)
active → cancelled (explicit cancellation — out of scope v1.0, but state reserved)
```

---

### MagicLinks

A unique, single-use, time-limited URL token tied to one appointment.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `appointment_id` | → Appointments | Required, FK |
| `token` | Random UUID embedded in the URL | UUID, unique, indexed |
| `track` | Mirrors the appointment track | Enum: `elective` \| `er` |
| `expires_at` | Expiry timestamp | Required; elective: configurable (default 72 h after send); ER: 12 h after send |
| `used_at` | Timestamp of first use | Nullable; set on first valid open |
| `link_type` | Who this link is for | Enum: `patient` \| `companion` |
| `created_at` | Creation timestamp | Required |

**Validation rules**:
- A valid Magic Link is one where `used_at IS NULL` AND `expires_at > NOW()`
- An already-used link (`used_at IS NOT NULL`) redirects to a "request new link" screen
- An expired link (`expires_at <= NOW()`) shows a plain-language expiry message
- The URL path contains only the `token` value — no other patient or visit data

**State transitions**:
```
unused + not expired → valid (token accepted, session context returned, used_at set)
unused + expired     → expired (plain-language screen shown)
used                 → consumed (redirect to request-new-link screen)
```

---

### Departments

A hospital department or ward that MedAssist serves.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `hospital_id` | Hospital identifier (for multi-hospital v2 extension) | Required |
| `name` | Department display name in Hebrew | Required |
| `navigation_route_id` | → NavigationRoutes | Nullable (a dept may not yet have a configured route) |
| `created_at` | Creation timestamp | Required |

---

### NavigationRoutes

An ordered set of photo steps guiding a patient from a named entry point to a department.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `department_id` | → Departments | Required, FK |
| `name` | Route display name (e.g., "Central Parking → Cardiology") | Required |
| `steps_count` | Cached total step count | Required; updated on step insert/delete |
| `created_at` | Creation timestamp | Required |
| `updated_at` | Last update timestamp | Required |

**MVP routes (5 required)**:
1. Main Entrance → Department
2. Central Parking → Department
3. Emergency Entrance → Department
4. Surgery Wing → Department
5. Outpatient Clinics → Department

---

### RouteSteps

One landmark in a navigation route. Shown one at a time to the patient.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `route_id` | → NavigationRoutes | Required, FK |
| `step_order` | 1-based position in the route | Required; unique per route |
| `image_url` | Object storage URL for the landmark photo | Required; max 200 KB enforced on upload |
| `instruction_text` | Short direction in Hebrew (e.g., "פנה שמאלה בכניסה הראשית") | Required; max 120 characters recommended |
| `created_at` | Creation timestamp | Required |

**Validation rules**:
- `step_order` values must be contiguous (1, 2, 3…); reorder operation must re-sequence all steps
- `image_url` must point to a compressed image ≤200 KB; server enforces on upload

---

### WaitingQueue

Real-time queue state for one patient in one department. One row per active patient per department visit.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `appointment_id` | → Appointments | Required, FK, unique (one queue row per appointment) |
| `department_id` | → Departments | Required, FK |
| `arrival_time` | Timestamp when patient confirmed arrival | Required |
| `estimated_wait_minutes` | Staff-entered wait estimate | Nullable; shown only when set |
| `status` | Patient's current queue state | Enum: `waiting` \| `in_treatment` \| `done` |
| `broadcast_message` | Latest broadcast text from staff | Nullable; shown on all waiting patients' screens |
| `broadcast_sent_at` | Timestamp of latest broadcast | Nullable |
| `updated_at` | Last status update timestamp | Required |

**Validation rules**:
- `broadcast_message` is department-wide; stored here for simplicity (all rows in a dept share the same latest broadcast, shown on refresh)
- When `status` transitions to `done`, the row may be soft-deleted or archived rather than hard-deleted

---

### PatientStations

One clinical stop in a patient's journey (e.g., Triage → X-ray → Pharmacy).

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `appointment_id` | → Appointments | Required, FK |
| `department_id` | → Departments (the station's destination dept) | Required, FK |
| `order_index` | Display order for this station in the journey | Required |
| `status` | Station completion state | Enum: `pending` \| `complete` |
| `completed_at` | Timestamp when station was marked complete | Nullable |
| `completed_by_staff_id` | → StaffUsers | Nullable (set when staff manually marks complete) |
| `created_at` | Creation timestamp | Required |

**State transitions**:
```
pending → complete (patient self-confirms arrival OR staff marks complete)
```

---

### Notifications

Immutable audit log of every SMS send attempt to a patient.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `patient_id` | → Patients | Required, FK |
| `appointment_id` | → Appointments | Required, FK |
| `type` | Notification event type | Enum: `magic_link` \| `checklist_reminder` \| `station_update` \| `broadcast` |
| `sent_at` | Timestamp of send attempt | Required |
| `status` | Delivery outcome | Enum: `sent` \| `failed` \| `retrying` |
| `retry_count` | Number of retry attempts so far | Required; default 0; max 3 |
| `triggering_event` | Human-readable description of what triggered this send | Required |
| `provider_message_id` | External SMS provider message ID for delivery tracking | Nullable |

**Business rules**:
- System MUST NOT send a notification of any `type` more than once per `appointment_id` (deduplication check before enqueue)
- Total notifications per `appointment_id` must not exceed 4 (cap check before enqueue)
- A new retry is scheduled only if `retry_count < 3`; the job is dropped after 3 failures

---

### StaffUsers

Hospital staff members with authenticated access to the Back-Office.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `name` | Display name | Required |
| `email` | Login email | Required, unique |
| `password_hash` | bcrypt hash of password | Required; minimum 12-character password enforced at creation |
| `role` | Access level | Enum: `staff` \| `admin` |
| `department_id` | → Departments (null for admin) | Nullable for admin role; Required for staff role |
| `locked_until` | Account lockout expiry | Nullable; set for 15 minutes after 5 failed login attempts |
| `last_active_at` | Timestamp of last API activity | Nullable; used for 60-minute inactivity session timeout |
| `is_active` | Soft-delete flag | Required; default true |
| `created_at` | Creation timestamp | Required |

**Validation rules**:
- `staff` role: `department_id` required; can only read/write patients in their department
- `admin` role: `department_id` nullable; full access across all departments
- `locked_until > NOW()`: all login attempts rejected until lockout expires

---

### ChecklistTemplates

A procedure-specific ordered list of preparation items, managed by admins.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `procedure_type` | Matches `Appointments.procedure_type` | Required |
| `hospital_id` | Scoped to a hospital | Required |
| `items_json` | Ordered array of checklist items | Required; see schema below |
| `created_at` | Creation timestamp | Required |
| `updated_at` | Last update timestamp | Required |

**`items_json` schema** (each element):
```json
{
  "id": "string (stable UUID per item)",
  "text": "string (Hebrew instruction, e.g., 'הגע בצום של 6 שעות')",
  "category": "bring | fast | medication | other",
  "time_sensitive": true | false
}
```

---

### ChecklistProgress

Persistent checklist completion state per patient per appointment.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `patient_id` | → Patients | Required, FK |
| `appointment_id` | → Appointments | Required, FK |
| `template_id` | → ChecklistTemplates | Required, FK |
| `completed_items_json` | Array of item IDs that the patient has checked off | Required; default empty array |
| `last_updated_at` | Last modification timestamp | Required |

---

### DigitalForms

A patient-completed admission or consent form with captured images and digital signature.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `patient_id` | → Patients | Required, FK |
| `appointment_id` | → Appointments | Required, FK |
| `form_type` | Template identifier for the form | Required; e.g., `"admission"`, `"consent-general"`, `"consent-anesthesia"` |
| `field_data_json` | Filled form field values | Required; default empty object |
| `captured_images_json` | Object storage URLs for captured ID / insurance card photos | Required; default empty array |
| `signature_data` | Base64-encoded signature image or raw SVG path data | Nullable; set when patient signs |
| `pdf_url` | Signed object storage URL for the exported PDF | Nullable; set after export generation |
| `submitted_at` | Timestamp of final submission | Nullable; null = in progress |
| `created_at` | Creation timestamp | Required |
| `updated_at` | Last save timestamp | Required |

**Validation rules**:
- `field_data_json` is saved on every change (draft autosave) — `submitted_at` remains null until patient explicitly submits
- `pdf_url` is generated on-demand when staff triggers export; the URL is a short-lived signed URL (not permanently stored in plain text)

---

### Companions

A secondary Magic Link recipient with read-only access to a patient's waiting status.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `appointment_id` | → Appointments | Required, FK |
| `phone_number` | Companion's mobile number | Required (E.164) |
| `magic_link_id` | → MagicLinks (companion's own link) | Required, FK |
| `consent_recorded_at` | Timestamp when patient consent was confirmed | Required (consent is confirmed by staff action of issuing the link) |
| `created_at` | Creation timestamp | Required |

---

### MagicLinkTimingRules

Admin-configured rules for when to schedule Magic Link SMS sends for elective patients.

| Field | Description | Constraints |
|---|---|---|
| `id` | Unique identifier | UUID, PK |
| `department_id` | → Departments | Required, FK |
| `procedure_type` | If set, rule applies only to this procedure type | Nullable; null = applies to all procedures in the department |
| `send_offset_hours` | Hours relative to `visit_datetime` when the SMS should be sent | Required; negative = before visit (e.g., `-24` = 24 hours before) |
| `created_at` | Creation timestamp | Required |

**Rule resolution** (most-specific wins):
1. Match on `(department_id, procedure_type)` — procedure-specific rule
2. Match on `(department_id, NULL)` — department-wide fallback
3. System default (configured at deploy time) — global fallback

---

## State Transition Summary

| Entity | States | Terminal State |
|---|---|---|
| Appointment | `scheduled → active → completed` | `completed` |
| MagicLink | `unused+valid → consumed` \| `unused+expired` | `consumed` or `expired` |
| WaitingQueue.status | `waiting → in_treatment → done` | `done` |
| PatientStation.status | `pending → complete` | `complete` |
| Notification.status | `retrying → sent` \| `retrying → failed` | `sent` or `failed` |
| DigitalForm | `draft (submitted_at null) → submitted` | `submitted` |
