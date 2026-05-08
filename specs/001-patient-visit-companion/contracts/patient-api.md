# API Contract: Patient-Facing Endpoints

**Branch**: `001-patient-visit-companion` | **Date**: 2026-03-28
**Base path**: `/api`
**Auth**: Magic Link token in URL path — no session cookie, no Authorization header for patient routes
**Format**: All requests and responses are `application/json`
**RTL note**: All user-visible string fields in responses are in Hebrew

---

## Overview

Patient endpoints are authenticated by a Magic Link token embedded in the URL path (`:token`). The server validates the token on every request:
- If the token is valid and unused: returns context
- If the token is expired: `410 Gone` with `{ "error": "link_expired" }`
- If the token is already used on a different device session: `409 Conflict` with `{ "error": "link_used" }`

No session cookies are issued to patients. Every request carries the token.

---

## 1. Resolve Magic Link

Opens a Magic Link and returns the patient's session context. Marks the token as used on first call.

```
GET /visit/:token
```

**Response 200 OK** (elective, pre-visit):
```json
{
  "track": "elective",
  "phase": "checklist",
  "patient": {
    "name": "שרה כהן",
    "department": "קרדיולוגיה",
    "visit_date": "2026-04-05"
  },
  "appointment_id": "uuid"
}
```

**Response 200 OK** (elective, day-of — navigation active):
```json
{
  "track": "elective",
  "phase": "navigation",
  "patient": { "name": "...", "department": "...", "visit_date": "..." },
  "appointment_id": "uuid"
}
```

**Response 200 OK** (ER or arrived — waiting active):
```json
{
  "track": "er",
  "phase": "waiting",
  "patient": { "name": "...", "department": "...", "visit_date": "..." },
  "appointment_id": "uuid"
}
```

**Error responses**:
- `410 Gone` — `{ "error": "link_expired", "message": "הקישור פג תוקף. פנה לצוות לקבלת קישור חדש." }`
- `409 Conflict` — `{ "error": "link_used", "message": "הקישור כבר נפתח. פנה לצוות לקישור חדש." }`
- `404 Not Found` — `{ "error": "link_not_found" }`

---

## 2. Checklist

### Get checklist with progress

```
GET /visit/:token/checklist
```

**Response 200 OK**:
```json
{
  "template_id": "uuid",
  "procedure_type": "pre-op-cardiac",
  "items": [
    {
      "id": "item-uuid-1",
      "text": "הגע בצום של 6 שעות לפחות",
      "category": "fast",
      "time_sensitive": true,
      "completed": false
    },
    {
      "id": "item-uuid-2",
      "text": "הבא תעודת זהות",
      "category": "bring",
      "time_sensitive": false,
      "completed": true
    }
  ],
  "hours_until_visit": 18,
  "all_complete": false
}
```

### Save checklist progress

```
POST /visit/:token/checklist/progress
```

**Request body**:
```json
{
  "completed_item_ids": ["item-uuid-2", "item-uuid-3"]
}
```

**Response 200 OK**:
```json
{
  "completed_item_ids": ["item-uuid-2", "item-uuid-3"],
  "all_complete": false
}
```

---

## 3. Navigation

### Get navigation route

```
GET /visit/:token/navigation
```

**Response 200 OK**:
```json
{
  "route_id": "uuid",
  "route_name": "חניון מרכזי → קרדיולוגיה",
  "total_steps": 6,
  "current_step": 2,
  "parking_coordinates": {
    "lat": 31.7683,
    "lng": 35.2137
  },
  "steps": [
    {
      "step_id": "uuid",
      "order": 2,
      "image_url": "https://storage.example.com/routes/step-2.jpg",
      "instruction": "פנה שמאלה בכניסה הראשית",
      "is_current": true
    }
  ]
}
```

Note: `steps` array contains only the current step and the next step (for prefetch). The full route is not exposed to the client at once.

### Confirm step arrival (advance to next step)

```
POST /visit/:token/navigation/steps/:step_id/confirm
```

**Response 200 OK** (more steps remain):
```json
{
  "next_step": {
    "step_id": "uuid",
    "order": 3,
    "image_url": "https://storage.example.com/routes/step-3.jpg",
    "instruction": "עלה במעלית לקומה 4",
    "is_current": true
  },
  "total_steps": 6,
  "current_step": 3
}
```

**Response 200 OK** (final step confirmed — transition to waiting):
```json
{
  "phase": "waiting",
  "message": "הגעת! הצוות יודע שאתה כאן."
}
```

---

## 4. Waiting Screen

### Get waiting status

Called every 60 seconds by the patient app (polling).

```
GET /visit/:token/waiting
```

**Response 200 OK**:
```json
{
  "status": "waiting",
  "arrival_confirmed": true,
  "department": "קרדיולוגיה",
  "estimated_wait_minutes": 20,
  "broadcast_message": "אנחנו קצת מאחרים — תודה על הסבלנות.",
  "broadcast_sent_at": "2026-04-05T09:15:00Z",
  "updated_at": "2026-04-05T09:20:00Z"
}
```

**Notes**:
- `estimated_wait_minutes` is `null` when no estimate has been set — client must not show a placeholder
- `broadcast_message` is `null` when no broadcast has been sent or the last one is stale (>60 min old)
- `status` values: `"waiting"` | `"in_treatment"` | `"done"`

### Send contact message to desk

```
POST /visit/:token/waiting/contact
```

**Request body**:
```json
{
  "message_type": "need_help"
}
```

Allowed `message_type` values (pre-written messages only — free text not accepted):
- `"need_help"` — "אני זקוק לעזרה"
- `"confirm_here"` — "אני כאן ומחכה"
- `"question"` — "יש לי שאלה"

**Response 200 OK**:
```json
{ "sent": true }
```

---

## 5. Digital Forms

### List forms for this appointment

```
GET /visit/:token/forms
```

**Response 200 OK**:
```json
{
  "forms": [
    {
      "form_id": "uuid",
      "form_type": "admission",
      "label": "טופס קבלה",
      "submitted": false,
      "signature_required": false
    },
    {
      "form_id": "uuid",
      "form_type": "consent-general",
      "label": "הסכמה לטיפול",
      "submitted": false,
      "signature_required": true
    }
  ]
}
```

### Get form (with saved draft)

```
GET /visit/:token/forms/:form_id
```

**Response 200 OK**:
```json
{
  "form_id": "uuid",
  "form_type": "admission",
  "label": "טופס קבלה",
  "fields": [
    { "id": "full_name", "type": "text", "label": "שם מלא", "required": true, "value": "שרה כהן" },
    { "id": "id_number", "type": "text", "label": "מספר תעודת זהות", "required": true, "value": "" }
  ],
  "captured_images": [
    { "id": "id-card", "label": "תמונת תעודת זהות", "url": null }
  ],
  "signature_required": false,
  "signature_data": null,
  "submitted": false
}
```

### Save form draft (autosave)

```
PUT /visit/:token/forms/:form_id
```

**Request body**:
```json
{
  "field_data": {
    "full_name": "שרה כהן",
    "id_number": "123456789"
  }
}
```

**Response 200 OK**:
```json
{ "saved": true, "updated_at": "2026-04-05T09:10:00Z" }
```

### Upload captured image (ID / insurance card)

```
POST /visit/:token/forms/:form_id/images
```

**Request**: `multipart/form-data` with `image` field (JPEG or PNG)

**Response 200 OK**:
```json
{
  "image_id": "uuid",
  "field_id": "id-card",
  "url": "https://storage.example.com/forms/image-uuid.jpg"
}
```

**Validation**:
- File type: JPEG or PNG only
- Max size: 5 MB (server rejects with `413`)

### Submit signature

```
POST /visit/:token/forms/:form_id/signature
```

**Request body**:
```json
{
  "signature_data": "data:image/png;base64,..."
}
```

**Response 200 OK**:
```json
{ "saved": true }
```

### Submit form (final)

```
POST /visit/:token/forms/:form_id/submit
```

**Request body**: `{}` (no body required; all data already saved via draft/signature calls)

**Response 200 OK**:
```json
{ "submitted": true, "submitted_at": "2026-04-05T09:25:00Z" }
```

---

## 6. Companion

### Get waiting status (companion view — read-only)

Same structure as patient waiting status, but the token is from a `Companions.magic_link_id` link. The endpoint is shared:

```
GET /visit/:token/waiting
```

The server differentiates companion vs. patient based on `MagicLinks.link_type`. Companion responses are identical to patient waiting responses but write operations (`POST /waiting/contact`) are rejected with `403 Forbidden`.

---

## Common Error Envelope

All error responses follow this format:

```json
{
  "error": "machine_readable_code",
  "message": "Human-readable explanation in Hebrew for patient-visible errors"
}
```

HTTP status codes:
- `400` — Invalid request body
- `403` — Action not allowed for this token type
- `404` — Resource not found
- `409` — Token already used
- `410` — Token expired
- `413` — Uploaded file too large
- `429` — Rate limit exceeded
- `500` — Server error (response body: `{ "error": "server_error", "message": "שגיאה זמנית. נסה שנית." }`)
