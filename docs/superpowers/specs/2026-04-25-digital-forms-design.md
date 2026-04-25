# Digital Forms — Design Spec
**Date:** 2026-04-25
**Branch:** feat/digital-forms (off 002-mvp-completion)

---

## Context

Patients need to submit documents (ID, referral letters) and sign consent forms before or during their hospital visit. Staff need to export a compiled PDF of all submitted documents per patient. This is the last remaining Must-Have feature before `002-mvp-completion` can merge to `main`.

---

## What a "Form" Is

Not a traditional data-entry form. A form item is one of two things:

- **`patient_upload`** — patient photographs or uploads their own document (ID card, referral letter, insurance card). Staff define the label; patient provides the file.
- **`staff_upload_sign`** — staff uploads a blank consent PDF; patient views it and signs using a touch/stylus canvas. Patient signature is required for this type.

---

## Architecture Approach

Parallel form system that mirrors the existing checklist templates pattern exactly. No new admin UX patterns — same CRUD conventions.

---

## Database

### New tables (migration 015)

```sql
-- Admin-configured template items
form_template_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type  TEXT,          -- NULL = default, applies to all patients
  label           TEXT NOT NULL, -- e.g. "צלם תעודת זהות"
  item_type       TEXT NOT NULL CHECK (item_type IN ('patient_upload', 'staff_upload_sign')),
  blank_form_url  TEXT,          -- S3 URL of blank consent PDF (sign type only)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  required        BOOLEAN NOT NULL DEFAULT false, -- default for all appointments
  order_index     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Per-appointment: which items are expected (created at appointment time from template)
patient_form_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id          UUID NOT NULL REFERENCES appointments(id),
  form_template_item_id   UUID REFERENCES form_template_items(id) ON DELETE SET NULL, -- nullable for future ad-hoc
  label                   TEXT NOT NULL,  -- snapshot copied from template at creation
  item_type               TEXT NOT NULL,  -- snapshot copied from template at creation
  staff_file_url          TEXT,           -- S3 URL of staff-uploaded consent PDF (sign type)
  required                BOOLEAN NOT NULL DEFAULT false,
  order_index             INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','staff_uploaded','patient_submitted','complete')),
  staff_id                UUID,           -- who assigned (audit)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Patient submissions: uploaded files and signatures
patient_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      UUID NOT NULL REFERENCES appointments(id),
  patient_form_item_id UUID NOT NULL REFERENCES patient_form_items(id),
  file_url            TEXT NOT NULL,      -- S3 URL
  doc_type            TEXT NOT NULL CHECK (doc_type IN ('image_upload', 'signature')),
  uploaded_by_patient BOOLEAN NOT NULL DEFAULT true,
  is_current          BOOLEAN NOT NULL DEFAULT true, -- false on re-upload
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- PDF export snapshots
patient_pdf_exports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id        UUID NOT NULL REFERENCES appointments(id),
  pdf_url               TEXT NOT NULL,   -- permanent S3 URL (presigned on-the-fly when served)
  item_count            INTEGER NOT NULL,
  generated_by_staff_id UUID,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### Indexes

```sql
CREATE INDEX ON patient_form_items(appointment_id);
CREATE INDEX ON patient_documents(patient_form_item_id);
CREATE INDEX ON patient_documents(appointment_id);
CREATE INDEX ON form_template_items(procedure_type);
CREATE INDEX ON patient_pdf_exports(appointment_id);
```

### Drop

Drop `digital_forms` table (from migration 007). **Prerequisite:** confirm table is empty in production before DROP. If rows exist, archive first.

---

## Status Transitions

```
patient_upload items:
  pending → patient_submitted   (patient uploads file)

staff_upload_sign items:
  pending → staff_uploaded      (staff uploads a patient-specific PDF, OR
                                 auto-set at appointment creation if blank_form_url exists on template)
  staff_uploaded → patient_submitted  (patient signs)
```

If the template item has a `blank_form_url`, `patient_form_items` is created with `staff_file_url = blank_form_url` and `status = 'staff_uploaded'` — patient can sign immediately. If no `blank_form_url`, status stays `'pending'` and staff must upload before the patient can proceed.

On re-upload: transaction sets old `patient_documents` row `is_current = false`, inserts new row `is_current = true`.

---

## API

### Patient-facing (magic link JWT via `requireMagicLinkToken`)

Mounted inside `visitRouter` at `/:token/forms`.

```
GET  /api/visit/:token/forms
  Response: {
    items: [{
      id, label, item_type, status, required, order_index,
      staff_file_url,       -- for staff_upload_sign: URL of blank consent PDF
      patient_file_url,     -- derived: patient_documents.file_url WHERE is_current=true (nullable)
    }]
  }

POST /api/visit/:token/forms/:itemId/upload
  Body: multipart/form-data, field "file"
  Validation: MIME magic-byte check (JPEG/PNG/WebP only), max 5 MB
  Flow: sharp compress → ≤200 KB → S3 PUT → insert patient_documents (is_current=true, set old is_current=false) → update patient_form_items.status = 'patient_submitted'
  Security: verify patient_form_items.appointment_id = token's appointmentId (DB check)

POST /api/visit/:token/forms/:itemId/signature
  Body: { signature_data: string }  -- base64 PNG canvas export
  Validation: body ≤100 KB
  Flow: decode base64 → S3 PUT as PNG → insert patient_documents → update status = 'patient_submitted'
  Security: same appointmentId ownership check
```

### Staff-facing (staff JWT via `requireStaffAuth`)

```
GET  /api/staff/patients/:appointmentId/forms
  Response: {
    items: [{ id, label, item_type, status, required, order_index,
              staff_file_url, patient_file_url }],
    latest_export: { pdf_url, generated_at, item_count } | null,
    new_since_last_export: number
  }

POST /api/staff/patients/:appointmentId/forms/:itemId/upload
  Body: multipart/form-data, field "file" (PDF)
  Validation: MIME check (application/pdf), max 20 MB
  Flow: S3 PUT → update patient_form_items.staff_file_url + status = 'staff_uploaded'

POST /api/staff/patients/:appointmentId/forms/exports
  Flow: fetch all patient_documents WHERE is_current=true for appointment →
        pdf-lib renders PDF (header + images + signature + footer) →
        S3 PUT at forms/appointments/{id}/exports/{timestamp}-export.pdf →
        insert patient_pdf_exports row →
        return { pdf_url (presigned 15min TTL), generated_at, item_count }
```

### Admin (admin JWT via `requireStaffAuth + requireAdmin`)

```
GET    /api/admin/form-templates
GET    /api/admin/form-templates/:id
POST   /api/admin/form-templates          body: { procedure_type?, label, item_type, required, order_index }
PUT    /api/admin/form-templates/:id      body: same fields (partial)
DELETE /api/admin/form-templates/:id      soft-delete: sets is_active = false
POST   /api/admin/form-templates/:id/blank   multipart PDF upload → S3, updates blank_form_url
```

---

## S3 Key Schema

```
forms/appointments/{appointmentId}/images/{timestamp}-{uuid}.jpg
forms/appointments/{appointmentId}/signatures/{timestamp}.png
forms/appointments/{appointmentId}/exports/{timestamp}-export.pdf
forms/templates/{templateItemId}/blank.pdf
```

Import S3 from existing `apps/api/src/services/s3.ts` (already extracted, do not import from navigation module).

---

## PDF Generation

Library: `pdf-lib` (not Puppeteer). Install: `pnpm --filter api add pdf-lib`.

Structure:
1. Header row: patient name, procedure type, export timestamp
2. For each `patient_documents` WHERE `is_current = true`, ordered by `patient_form_items.order_index`:
   - Section label
   - Embedded image (fetched from S3 URL as Buffer, embedded as JPEG/PNG)
3. Signature section: embed signature PNG from S3
4. Footer: "MedAssist — Generated {datetime}"

Signature images: fetch from S3 URL — do not embed as base64 in the PDF builder.

---

## Patient PWA — Checklist Page

Document items appear in a **separate "Documents" section below regular checklist items**. Section has its own heading ("מסמכים להגשה"). The checklist page makes two independent GET calls on mount:

1. `GET /api/visit/:token/checklist` — existing
2. `GET /api/visit/:token/forms` — new

Each section handles its own loading/error state.

Tapping a `patient_upload` item → opens native file picker / camera (`<input type="file" accept="image/*" capture="environment">`).

Tapping a `staff_upload_sign` item → opens inline PDF viewer (using `<iframe>` or `<embed>` on the `staff_file_url`) + signature canvas below. Patient signs, taps submit.

Signature canvas: `<canvas>` element, touch + stylus events, RTL-compatible. On submit: `canvas.toDataURL('image/png')` → POST to `/signature` endpoint.

---

## Staff Backoffice — Patient Detail Page

Currently a 121-byte stub at `apps/staff-backoffice/src/pages/PatientDetail/index.tsx`. Full implementation.

Layout: stacked cards (direction: ltr for desktop).

1. **Patient info card** — name, department, procedure type, phone, wait time
2. **Stations card** — existing station logic
3. **Documents card**:
   - 3-column grid of form items (status icon + label + action)
   - Status icons: ⏳ pending, 📤 awaiting staff upload, ✅ submitted
   - For `staff_upload_sign` items pending staff upload: "העלה מסמך" button
   - "N חדשים" amber badge if `new_since_last_export > 0`
   - "ייצא PDF" button → POST /exports → open presigned URL in new tab
   - Last export info: "ייצוא אחרון: לפני X שעות • N מסמכים"

---

## Admin UI — Form Templates Page

New route at `/admin/form-templates`. NavLink added to AdminLayout header.

Two sections on one page:

**"טפסים בסיסיים"** (`procedure_type = NULL`): always attached to every patient. List of items with inline edit (label, type, required toggle), "הוסף פריט" button.

**"טפסים לפי סוג הליך"**: grouped by procedure type. Same inline-edit UX as checklist templates. For `staff_upload_sign` items: "העלה טופס ריק" button (uploads blank PDF template).

All CRUD is inline — no separate edit pages.

---

## Shared Types

Extend existing DTOs in `packages/shared-types/src/visit.ts` (lines 85-129) — do not replace. Add `patient_file_url`, `staff_file_url`, `status` fields to `FormSummaryDTO`. Add `item_type` discriminant.

---

## Module Structure

```
apps/api/src/modules/forms/
  forms.router.ts          (patient-facing, mounted in visit.router.ts)
  forms.service.ts

apps/api/src/modules/admin/
  form-templates.router.ts
  form-templates.service.ts

apps/staff-backoffice/src/pages/
  PatientDetail/index.tsx  (full implementation, currently stub)
  Admin/FormTemplates/index.tsx  (new)

apps/patient-pwa/src/pages/
  Forms/index.tsx           (signature canvas + PDF viewer sub-flow)
  Checklist/index.tsx       (add Documents section)

packages/shared-types/src/visit.ts   (extend existing DTOs)
```

---

## Appointment Creation Flow (Template Application)

When a new appointment is created (`POST /api/staff/appointments`):

1. Fetch all `form_template_items` WHERE `is_active = true` AND (`procedure_type = appointment.procedure_type` OR `procedure_type IS NULL`)
2. Insert one `patient_form_items` row per template item (copy label, item_type, required, order_index)
   - For `staff_upload_sign` items: also copy `blank_form_url` → `staff_file_url` as the default consent PDF. Staff can override with a patient-specific upload later.

Files to change: `apps/api/src/modules/staff/appointments.router.ts` + `appointments.service.ts`.

---

## Security

- Every patient-facing upload/signature handler verifies `patient_form_items.appointment_id = token's appointmentId` via DB query before proceeding. Return 403 on mismatch.
- MIME magic-byte validation on all file uploads (not just Content-Type header).
- Signature body capped at 100 KB via Express body-parser limit on that route.
- Department scoping: `department_id` column added as nullable to `patient_form_items`; enforcement deferred to post-MVP.

---

## What Is Out of Scope (MVP)

- Export history endpoint (`GET /forms/exports`)
- Staff PATCH to waive/edit an item
- Staff-side ad-hoc item creation (admin templates cover the standard set)
- Department scoping middleware enforcement
- Text fields, checkboxes, or any field type other than file upload and signature
- Patient-initiated PDF generation
- Push notification when patient submits all documents

---

## Verification

1. Admin creates a form template item (patient_upload, label "תעודת זהות", global default)
2. Staff creates new appointment → `patient_form_items` row auto-created
3. Patient opens checklist page → Documents section appears with "תעודת זהות" item
4. Patient taps item → selects photo → upload succeeds → item shows ✅
5. Admin creates a `staff_upload_sign` item → staff uploads blank consent PDF from patient detail
6. Patient sees consent PDF + canvas → signs → status = patient_submitted
7. Staff clicks "ייצא PDF" → PDF opens in new tab with patient photo + signature
8. Staff exports again after patient re-uploads → new PDF reflects updated document

---

## Dependencies to Install

```bash
pnpm --filter api add pdf-lib
```

All other dependencies (S3 SDK, sharp, multer) already installed.
