# API Contract: Staff & Admin Endpoints

**Branch**: `001-patient-visit-companion` | **Date**: 2026-03-28
**Base path**: `/api`
**Auth**: JWT in `httpOnly` cookie (`med_session`), issued on login
**Format**: All requests and responses are `application/json`
**Role enforcement**: Every endpoint enforces role at the API layer. `staff` role is scoped to their `department_id`. `admin` role has cross-department access.

---

## Authentication

### Login

```
POST /auth/login
```

**Request body**:
```json
{
  "email": "sarah@hospital.co.il",
  "password": "SecurePassword123"
}
```

**Response 200 OK** — sets `httpOnly` cookie `med_session`:
```json
{
  "user": {
    "id": "uuid",
    "name": "שרה לוי",
    "email": "sarah@hospital.co.il",
    "role": "staff",
    "department_id": "uuid",
    "department_name": "קרדיולוגיה"
  }
}
```

**Error responses**:
- `401 Unauthorized` — `{ "error": "invalid_credentials" }`
- `423 Locked` — `{ "error": "account_locked", "locked_until": "2026-04-05T10:15:00Z" }`

### Logout

```
POST /auth/logout
```

Clears `med_session` cookie and adds token to Redis revocation set.

**Response 200 OK**: `{ "logged_out": true }`

### Get current user

```
GET /auth/me
```

**Response 200 OK**: Same `user` object as login response.
**Response 401** if session invalid or expired.

---

## Staff — Queue Management

All endpoints below require `role: staff` or `role: admin`. Staff members are automatically scoped to their `department_id`.

### Get department queue

```
GET /staff/queue
```

Returns all non-done patients in the staff member's department, ordered by arrival time.

**Response 200 OK**:
```json
{
  "department": "קרדיולוגיה",
  "patients": [
    {
      "appointment_id": "uuid",
      "patient_name": "יוסף ביטון",
      "arrival_time": "2026-04-05T08:30:00Z",
      "minutes_waiting": 45,
      "status": "waiting",
      "estimated_wait_minutes": 20,
      "stations": [
        { "station_id": "uuid", "department": "X-Ray", "order": 1, "status": "pending" }
      ],
      "forms_submitted": 1,
      "forms_total": 2
    }
  ],
  "broadcast_message": "אנחנו קצת מאחרים",
  "broadcast_sent_at": "2026-04-05T09:10:00Z"
}
```

### Update patient status

```
PATCH /staff/queue/:appointment_id/status
```

**Request body**:
```json
{
  "status": "in_treatment"
}
```

Allowed values: `"waiting"` | `"in_treatment"` | `"done"`

**Response 200 OK**:
```json
{ "appointment_id": "uuid", "status": "in_treatment", "updated_at": "2026-04-05T09:30:00Z" }
```

### Set estimated wait time

```
PATCH /staff/queue/wait-estimate
```

Sets the estimated wait for the entire department (shown to all waiting patients).

**Request body**:
```json
{ "estimated_wait_minutes": 25 }
```

**Response 200 OK**: `{ "updated": true }`

### Send broadcast message

```
POST /staff/queue/broadcast
```

**Request body**:
```json
{ "message": "אנחנו מאחרים כ-10 דקות — תודה על הסבלנות" }
```

**Response 200 OK**:
```json
{ "sent": true, "recipient_count": 8, "sent_at": "2026-04-05T09:15:00Z" }
```

**Validation**: `message` must not be empty; max 280 characters.

---

## Staff — Clinical Stations

### Add clinical station to patient journey

```
POST /staff/patients/:appointment_id/stations
```

**Request body**:
```json
{
  "department_id": "uuid",
  "order_index": 2
}
```

Adding a station triggers a notification to the patient (subject to the 4-notification cap).

**Response 201 Created**:
```json
{
  "station_id": "uuid",
  "department": "X-Ray",
  "order_index": 2,
  "status": "pending"
}
```

### Reorder stations

```
PUT /staff/patients/:appointment_id/stations/order
```

**Request body**:
```json
{
  "station_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Array must contain all existing pending station IDs for this appointment.

**Response 200 OK**: `{ "updated": true }`

### Mark station complete

```
PATCH /staff/patients/:appointment_id/stations/:station_id
```

**Request body**:
```json
{ "status": "complete" }
```

**Response 200 OK**:
```json
{ "station_id": "uuid", "status": "complete", "completed_at": "2026-04-05T09:45:00Z" }
```

---

## Staff — ER Magic Link

### Create ER Magic Link

```
POST /staff/er-links
```

**Request body**:
```json
{ "phone_number": "+972501234567" }
```

Creates a Patient record (if phone not already in system), an ER Appointment, and a MagicLink. Enqueues an SMS send immediately.

**Response 201 Created**:
```json
{
  "appointment_id": "uuid",
  "magic_link_token": "uuid",
  "expires_at": "2026-04-05T21:30:00Z",
  "sms_status": "queued"
}
```

**Validation**: `phone_number` must be valid E.164 format.

---

## Staff — Companion Link

### Issue companion Magic Link

```
POST /staff/patients/:appointment_id/companion-link
```

**Request body**:
```json
{ "phone_number": "+972509876543" }
```

Creates a Companion record and a MagicLink of `link_type: companion`. Enqueues an SMS send.

**Response 201 Created**:
```json
{
  "companion_id": "uuid",
  "magic_link_token": "uuid",
  "sms_status": "queued"
}
```

---

## Staff — PDF Export

### Export patient forms as PDF

```
POST /staff/patients/:appointment_id/export-pdf
```

Triggers server-side PDF generation (Puppeteer). Returns a short-lived signed URL.

**Response 200 OK**:
```json
{
  "pdf_url": "https://storage.example.com/exports/...?signed=...",
  "expires_at": "2026-04-05T10:30:00Z"
}
```

`pdf_url` is valid for 15 minutes.

**Response 202 Accepted** — if generation is async (for large forms):
```json
{ "job_id": "uuid", "status": "generating" }
```

**Poll job status**:
```
GET /staff/export-jobs/:job_id
```

---

## Admin — Staff Management

All endpoints require `role: admin`.

### List staff users

```
GET /admin/staff
```

Query params: `?department_id=uuid` (optional filter)

**Response 200 OK**:
```json
{
  "staff": [
    {
      "id": "uuid",
      "name": "שרה לוי",
      "email": "sarah@hospital.co.il",
      "role": "staff",
      "department_id": "uuid",
      "department_name": "קרדיולוגיה",
      "is_active": true,
      "last_active_at": "2026-04-04T14:30:00Z"
    }
  ]
}
```

### Create staff user

```
POST /admin/staff
```

**Request body**:
```json
{
  "name": "דוד מנחם",
  "email": "david@hospital.co.il",
  "password": "SecurePassword123",
  "role": "staff",
  "department_id": "uuid"
}
```

**Response 201 Created**: Staff user object (without `password_hash`)

**Validation**:
- Password minimum 12 characters
- Email unique across all staff
- `role: "staff"` requires `department_id`; `role: "admin"` may omit it

### Update staff user

```
PATCH /admin/staff/:staff_id
```

**Request body** (partial update — only provided fields are changed):
```json
{
  "name": "דוד מנחם",
  "department_id": "new-uuid",
  "is_active": false
}
```

**Response 200 OK**: Updated staff user object.

### Reset staff password

```
POST /admin/staff/:staff_id/reset-password
```

**Request body**:
```json
{ "new_password": "NewSecurePassword456" }
```

**Response 200 OK**: `{ "updated": true }`

---

## Admin — Navigation Routes

### List routes

```
GET /admin/routes
```

**Response 200 OK**:
```json
{
  "routes": [
    { "route_id": "uuid", "name": "חניון מרכזי → קרדיולוגיה", "department": "קרדיולוגיה", "steps_count": 6 }
  ]
}
```

### Get route with all steps

```
GET /admin/routes/:route_id
```

**Response 200 OK**:
```json
{
  "route_id": "uuid",
  "name": "חניון מרכזי → קרדיולוגיה",
  "department_id": "uuid",
  "steps": [
    {
      "step_id": "uuid",
      "order": 1,
      "image_url": "https://storage.example.com/routes/step-1.jpg",
      "instruction": "צא מהחניון לכיוון הכניסה הראשית"
    }
  ]
}
```

### Create route

```
POST /admin/routes
```

**Request body**:
```json
{
  "name": "כניסה ראשית → אורתופדיה",
  "department_id": "uuid"
}
```

**Response 201 Created**: Route object (steps_count: 0)

### Add route step (with image upload)

```
POST /admin/routes/:route_id/steps
```

**Request**: `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `image` | File (JPEG/PNG) | Landmark photo — server compresses to ≤200 KB |
| `instruction` | String | Hebrew direction text (max 120 chars) |
| `order` | Integer | Step position (appended to end if omitted) |

**Response 201 Created**: RouteStep object with `image_url`.

### Update route step

```
PUT /admin/routes/:route_id/steps/:step_id
```

**Request**: `multipart/form-data` (same fields as create; all optional — only provided fields updated)

**Response 200 OK**: Updated RouteStep object.

### Delete route step

```
DELETE /admin/routes/:route_id/steps/:step_id
```

Remaining steps are re-sequenced automatically.

**Response 200 OK**: `{ "deleted": true, "steps_resequenced": true }`

### Reorder route steps

```
PUT /admin/routes/:route_id/steps/order
```

**Request body**:
```json
{ "step_ids": ["uuid-1", "uuid-3", "uuid-2"] }
```

Array must contain all step IDs for this route.

**Response 200 OK**: `{ "updated": true }`

---

## Admin — Checklist Templates

### List templates

```
GET /admin/checklists
```

**Response 200 OK**:
```json
{
  "templates": [
    { "template_id": "uuid", "procedure_type": "pre-op-cardiac", "item_count": 8 }
  ]
}
```

### Get template

```
GET /admin/checklists/:template_id
```

**Response 200 OK**: Full template with `items_json` array.

### Create template

```
POST /admin/checklists
```

**Request body**:
```json
{
  "procedure_type": "outpatient-dermatology",
  "items": [
    { "text": "הבא תעודת זהות", "category": "bring", "time_sensitive": false },
    { "text": "הגע ללא בושם או קרם", "category": "other", "time_sensitive": false }
  ]
}
```

**Response 201 Created**: Full template object.

### Update template

```
PUT /admin/checklists/:template_id
```

**Request body**: Same structure as create (full replacement of `items` array).

**Response 200 OK**: Updated template object.

---

## Admin — Magic Link Timing Rules

### List timing rules

```
GET /admin/timing-rules
```

**Response 200 OK**:
```json
{
  "rules": [
    {
      "rule_id": "uuid",
      "department_id": "uuid",
      "department_name": "קרדיולוגיה",
      "procedure_type": null,
      "send_offset_hours": -24,
      "description": "All Cardiology patients — 24 hours before visit"
    }
  ]
}
```

### Create timing rule

```
POST /admin/timing-rules
```

**Request body**:
```json
{
  "department_id": "uuid",
  "procedure_type": "pre-op-cardiac",
  "send_offset_hours": -48
}
```

**Response 201 Created**: Rule object.

**Validation**:
- `send_offset_hours` must be negative (send before visit)
- Only one rule per `(department_id, procedure_type)` pair; duplicate returns `409 Conflict`

### Update timing rule

```
PUT /admin/timing-rules/:rule_id
```

**Request body**:
```json
{ "send_offset_hours": -36 }
```

**Response 200 OK**: Updated rule object.

### Delete timing rule

```
DELETE /admin/timing-rules/:rule_id
```

**Response 200 OK**: `{ "deleted": true }`

---

## Common Error Envelope

```json
{
  "error": "machine_readable_code",
  "message": "Human-readable description (English for staff/admin)"
}
```

HTTP status codes:
- `400` — Validation error (body includes `errors` array for field-level issues)
- `401` — Not authenticated
- `403` — Insufficient role for this action
- `404` — Resource not found
- `409` — Conflict (duplicate, version mismatch)
- `422` — Business rule violation (e.g., notification cap reached)
- `500` — Server error
