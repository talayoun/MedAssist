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
  appointment_id          UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  form_template_item_id   UUID REFERENCES form_template_items(id) ON DELETE SET NULL,
  label                   TEXT NOT NULL,  -- snapshot copied from template at creation
  item_type               TEXT NOT NULL CHECK (item_type IN ('patient_upload','staff_upload_sign')),
  staff_file_url          TEXT,           -- S3 KEY of staff-uploaded consent PDF (sign type)
  required                BOOLEAN NOT NULL DEFAULT false,
  order_index             INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','staff_uploaded','patient_submitted')),
  staff_id                UUID REFERENCES staff_users(id) ON DELETE SET NULL, -- who assigned/uploaded
  department_id           UUID REFERENCES departments(id) ON DELETE SET NULL, -- nullable; enforcement post-MVP
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Patient submissions: uploaded files and signatures
patient_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_form_item_id UUID NOT NULL REFERENCES patient_form_items(id) ON DELETE CASCADE,
  file_url            TEXT NOT NULL,      -- S3 KEY (not URL); presigned on read
  doc_type            TEXT NOT NULL CHECK (doc_type IN ('image_upload', 'signature')),
  uploaded_by_patient BOOLEAN NOT NULL DEFAULT true,
  is_current          BOOLEAN NOT NULL DEFAULT true,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- PDF export snapshots
patient_pdf_exports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id        UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  pdf_key               TEXT NOT NULL,   -- S3 KEY; presigned on read (15min TTL)
  item_count            INTEGER NOT NULL,
  generated_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**Status enum:** `'complete'` removed — `'patient_submitted'` is terminal. PDF export is staff-side and does not advance item state.

**Storage convention:** All `*_url` / `*_key` columns store the S3 KEY (e.g. `forms/appointments/{id}/images/...jpg`), never a public URL. URLs are presigned on read with TTL ≤ 15min and never persisted in DB or returned to clients without presigning.

### Indexes

```sql
CREATE INDEX ON patient_form_items(appointment_id);
CREATE INDEX ON patient_form_items(appointment_id, status);
CREATE INDEX ON patient_documents(patient_form_item_id);
CREATE INDEX ON patient_documents(appointment_id);
CREATE INDEX ON form_template_items(is_active, procedure_type);
CREATE INDEX ON patient_pdf_exports(appointment_id);

-- Race-safety: only one current document per form item
CREATE UNIQUE INDEX uniq_current_doc_per_item
  ON patient_documents(patient_form_item_id) WHERE is_current = true;

-- Idempotency: prevent duplicate items on rerun of appointment-creation logic
CREATE UNIQUE INDEX uniq_appt_template_item
  ON patient_form_items(appointment_id, form_template_item_id)
  WHERE form_template_item_id IS NOT NULL;
```

### Triggers

```sql
-- patient_form_items.updated_at maintained by trigger (status changes drive "new since last export")
CREATE TRIGGER trg_pfi_updated_at BEFORE UPDATE ON patient_form_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Drop

Drop `digital_forms` table (from migration 007). **Prerequisite:** confirm table is empty in production before DROP — manual audit `SELECT count(*) FROM digital_forms;`. The DROP statement lives in a SEPARATE migration (016) so it can be held back if rows exist; migration 015 only adds the new tables.

---

## Status Transitions

```
patient_upload items:
  pending → patient_submitted   (patient uploads file)
  patient_submitted → patient_submitted (re-upload; status unchanged, is_current toggles)

staff_upload_sign items:
  pending → staff_uploaded      (staff uploads a patient-specific PDF, OR
                                 auto-set at appointment creation if blank_form_url exists on template)
  staff_uploaded → patient_submitted  (patient signs)
  patient_submitted → patient_submitted (re-sign; status unchanged)
```

If the template item has a `blank_form_url`, `patient_form_items` is created with `staff_file_url = blank_form_url` and `status = 'staff_uploaded'` — patient can sign immediately. If no `blank_form_url`, status stays `'pending'` and signature endpoint returns 409 Conflict ("ממתין להעלאת מסמך מהצוות").

**Re-upload race-safety:** wrap in transaction with `SELECT … FOR UPDATE` on the `patient_form_items` row, then `UPDATE patient_documents SET is_current=false WHERE patient_form_item_id=$1 AND is_current=true; INSERT patient_documents (..., is_current=true);`. Partial unique index `uniq_current_doc_per_item` is the defense-in-depth backstop — a concurrent insert without the lock raises a unique violation, mapped to 409.

**Orphan handling (S3 succeeds, DB fails):** flow is `INSERT patient_documents (file_url=key, is_current=true) WITHIN TRANSACTION → S3 PUT → COMMIT`. If S3 PUT fails, transaction rolls back; if commit fails after S3 PUT, an orphan S3 object exists but no DB row references it. Acceptable for MVP; out-of-scope: nightly orphan-sweep job listing S3 keys not referenced in `patient_documents.file_url`.

---

## API

All URLs returned to clients are presigned (TTL = 15min). S3 KEYs are stored in DB; never return raw S3 URLs.

### Patient-facing (magic link JWT via `requireMagicLinkToken` + `denyCompanionWrite` on writes)

Mounted inside `visitRouter` at `/:token/forms`.

```
GET  /api/visit/:token/forms                    [requireMagicLinkToken]
  Response 200: {
    items: [{
      id, label, item_type, status, required, order_index,
      staff_file_url,       -- presigned URL of consent PDF for sign-type items (nullable)
      patient_file_url,     -- presigned URL of latest patient_documents WHERE is_current=true (nullable)
    }]
  }

POST /api/visit/:token/forms/:itemId/upload     [requireMagicLinkToken + denyCompanionWrite]
  Body: multipart/form-data (multer), field "file"
  Validation:
    - Multer limits: { fileSize: 5 * 1024 * 1024, files: 1 }
    - MIME magic-byte check via `file-type` npm pkg on the buffer (NOT trust header) — accept image/jpeg, image/png, image/webp; 415 on mismatch
    - Sharp safety: sharp(buf, { limitInputPixels: 24_000_000, failOn: 'error' }) → compress ≤200 KB
  Flow:
    1. Verify item ownership (DB: patient_form_items.appointment_id = token.appointmentId) → 403 on mismatch
    2. Verify item_type = 'patient_upload' → 400 if mismatch
    3. BEGIN TX → SELECT … FOR UPDATE on patient_form_items row
    4. UPDATE patient_documents SET is_current=false WHERE patient_form_item_id=$1 AND is_current=true
    5. INSERT patient_documents (file_url=s3Key, doc_type='image_upload', is_current=true)
    6. S3 PUT (server-side encryption AES256, Content-Type from validated MIME, Content-Disposition: attachment)
    7. UPDATE patient_form_items SET status='patient_submitted', updated_at=NOW()
    8. COMMIT
  Response 200: { item_id, file_url (presigned 15min) }

POST /api/visit/:token/forms/:itemId/signature  [requireMagicLinkToken + denyCompanionWrite]
  Body: { signature_data: string }   -- data URL or base64 PNG
  Route-scoped middleware: express.json({ limit: '150kb' })
  Validation:
    - Strip data URL prefix if present
    - Decode base64; reject if decoded size > 100 KB → 413
    - Magic-byte check: bytes[0..7] === [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A] → 415 if not PNG
    - Optional: re-encode through sharp(buf).png() to strip metadata and confirm valid image
  Flow:
    1. Ownership check (same as upload) → 403
    2. Verify item_type = 'staff_upload_sign' AND status = 'staff_uploaded' → 409 if not ready to sign
    3. BEGIN TX → FOR UPDATE
    4. Toggle is_current on prior signature row, INSERT new patient_documents (doc_type='signature')
    5. S3 PUT (Content-Type: image/png, Content-Disposition: attachment)
    6. UPDATE status='patient_submitted'
    7. COMMIT
  Response 200: { item_id, file_url (presigned) }
```

### Staff-facing (staff JWT via `requireStaffAuth`)

```
GET  /api/staff/patients/:appointmentId/forms
  Response 200: {
    items: [{ id, label, item_type, status, required, order_index,
              staff_file_url (presigned, nullable), patient_file_url (presigned, nullable),
              patient_submitted_at (nullable) }],
    latest_export: { pdf_url (presigned), generated_at, item_count } | null,
    new_since_last_export: number   -- count(patient_form_items WHERE updated_at > latest_export.generated_at AND status = 'patient_submitted'); 0 if no export yet, total submitted otherwise
  }

POST /api/staff/patients/:appointmentId/forms/:itemId/upload
  Body: multipart/form-data, field "file" (PDF only)
  Validation:
    - Multer limits: { fileSize: 20 * 1024 * 1024, files: 1 }
    - MIME magic-byte check via `file-type` → must be application/pdf; 415 if not
  Flow: S3 PUT → UPDATE patient_form_items SET staff_file_url=s3Key, status='staff_uploaded', staff_id=auth.userId, updated_at=NOW()
  Note: this REPLACES any prior staff_file_url. Patient signatures (patient_documents) for this item are not deleted, but staff should warn before replacing if status = 'patient_submitted' (UI concern).
  Response 200: { item_id, staff_file_url (presigned) }

POST /api/staff/patients/:appointmentId/forms/exports
  Validation: item_count cap = 30 (config), 422 if appointment has more current docs
  Flow:
    1. Fetch all patient_form_items + their staff_file_url + current patient_documents for appointment, ordered by order_index
    2. pdf-lib renders PDF: header (patient name, procedure, timestamp) → for each item, embed signed consent PDF page(s) and any patient document image, ordered → footer
    3. S3 PUT at forms/appointments/{id}/exports/{timestamp}-export.pdf
    4. INSERT patient_pdf_exports (pdf_key, item_count, generated_by_staff_id)
  Response 200: { pdf_url (presigned 15min), generated_at, item_count }
```

### Admin (staff JWT via `requireStaffAuth` + `requireAdmin`)

Front-end route guard: `RequireAdmin` wrapper component (mirror existing admin pages).

```
GET    /api/admin/form-templates                      → returns ALL active items, client-side groups by procedure_type
GET    /api/admin/form-templates/:id
POST   /api/admin/form-templates                      body: { procedure_type?, label, item_type, required, order_index }
PUT    /api/admin/form-templates/:id                  body: same fields (partial)
DELETE /api/admin/form-templates/:id                  soft-delete: sets is_active = false; returns 204
POST   /api/admin/form-templates/:id/blank            multipart PDF upload → S3, updates blank_form_url
DELETE /api/admin/form-templates/:id/blank            removes blank_form_url (sets to NULL); returns 204
```

### Status code summary

| Code | When |
|------|------|
| 200 | OK with body |
| 204 | DELETE success, no body |
| 400 | item_type/route mismatch, missing required fields |
| 403 | Ownership / token mismatch |
| 409 | State conflict (sign before staff upload) |
| 413 | Payload too large (signature) |
| 415 | MIME magic-byte mismatch |
| 422 | Item count cap exceeded on export |

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

Structure (ordered by `patient_form_items.order_index`):
1. **Header page**: patient name, procedure type, department, export timestamp
2. **For each item**:
   - Section header with item label
   - If `staff_file_url` is set (sign-type items): embed all pages of the staff-uploaded consent PDF (`PDFDocument.load(buf).copyPages(...)`)
   - If `patient_documents` rows exist with `is_current=true` for this item: embed each (image_upload as image, signature as PNG image)
3. **Footer page**: "MedAssist — Generated {datetime} by {staff_name}"

Constraints:
- Cap `item_count` at 30 per export (prevents OOM); 422 if exceeded.
- Fetch S3 objects sequentially (not parallel) via GetObjectCommand → Buffer.
- Embed PNG/JPEG via `embedPng`/`embedJpg`; embed PDF pages via `copyPages`.
- Skip items with no staff_file_url AND no patient_documents (incomplete items don't render a section).

---

## Patient PWA — Checklist Page

Document items appear in a **separate "Documents" section below regular checklist items**. Section has its own heading ("מסמכים להגשה"). The checklist page makes two independent GET calls on mount:

1. `GET /api/visit/:token/checklist` — existing
2. `GET /api/visit/:token/forms` — new

**Loading coherence:** reserve a fixed-height skeleton for the Documents section (height ≈ Nx80px based on cached/expected count, fall back to 240px placeholder) so late-arriving items don't shift the checklist below — protects the constitutional 3-tap target stability.

**Offline:** cache the last-loaded `/forms` response in service worker (same SWR pattern as checklist). Disable upload/sign actions when `!navigator.onLine`; show inline `"אין חיבור — לא ניתן להעלות כעת"` toast.

**Tap targets / RTL / fonts:** every interactive row ≥ 44×44px, label ≥ 16pt; status icons accompanied by Hebrew text labels (not icon-only) for screen readers.

### `patient_upload` flow

Tap row → `<input type="file" accept="image/*" capture="environment">` (native picker; iOS Safari shows sheet — acceptable). On select → preview thumbnail → "שלח" / "החלף קובץ" buttons. Upload progress indicator for slow connections. After success: row shows ✅ + thumbnail + "החלף מסמך" action.

### `staff_upload_sign` flow

Tap row → opens dedicated `/forms/:itemId` sub-route (not inline modal — needed because of iOS Safari iframe PDF rendering bug):

1. **PDF view:** "צפה במסמך לחתימה" button opens the consent PDF in a NEW tab (presigned URL with Content-Disposition: inline). Mobile browsers handle this natively. Avoid `<iframe>`/`<embed>` — broken on iOS.
2. **Signature canvas:** below the PDF link, full-width `<canvas>` with `touch-action: none`, min-height 220px, RTL row-reverse buttons:
   - "נקה" (clear) — top-left in RTL = top-right visually
   - "שלח חתימה" (submit) — disabled until canvas has at least one stroke
3. Pen + touch events: handle `pointerdown`/`pointermove`/`pointerup` (covers stylus pressure).
4. On submit: `canvas.toDataURL('image/png')` → POST `/signature`. Show spinner; on success, navigate back to checklist with success toast.

### Re-upload UX

For any item with status `patient_submitted`: row exposes a "החלף מסמך" / "חתום מחדש" action that re-runs the same flow. Confirmation dialog: `"להחליף את המסמך הקיים? הגרסה הקודמת תישמר אך לא תשמש."`

---

## Staff Backoffice — Patient Detail Page

Currently a 121-byte stub at `apps/staff-backoffice/src/pages/PatientDetail/index.tsx`. Full implementation.

Layout: stacked cards (`direction: rtl` for Hebrew, desktop-first).

1. **Patient info card** — name, department, procedure type, phone, wait time
2. **Stations card** — existing station logic
3. **Documents card**:
   - **Header:** title "מסמכים" + "N חדשים" amber badge (`new_since_last_export > 0`) + "🔄 רענן" manual refresh button + "ייצא PDF" primary button
   - **2-column grid** (not 3 — 3 was too cramped given thumbnail + multiple actions per cell). Each cell:
     - Status icon + Hebrew label: ⏳ "ממתין", 📤 "ממתין לצוות", ✅ "הוגש"
     - Item name
     - Thumbnail preview of submitted patient file (or PDF icon for signed consent)
     - Click thumbnail → modal lightbox with full-size view
     - For `staff_upload_sign` items: "העלה מסמך" / "החלף מסמך" button (file picker → progress → confirm); if status = `patient_submitted`, replace requires confirmation `"המטופל כבר חתם — להחליף את הטופס?"`
   - **"ייצא PDF" flow:**
     1. Open new tab synchronously (`window.open('about:blank', '_blank')`) — avoids pop-up blocker
     2. POST `/exports` with loading spinner on button
     3. On success: `newTab.location.href = presignedUrl`
     4. On error: close tab, show toast
   - **Last export info** (small text below): "ייצוא אחרון: {relative time} • N מסמכים" or "טרם בוצע ייצוא"

---

## Admin UI — Form Templates Page

New route at `/admin/form-templates`. Wrap in `RequireAdmin` like other admin pages. NavLink added to AdminLayout header with label **"תבניות טפסים"** (parallel to "תבניות צ'קליסט", "מסלולי ניווט").

Two sections on one page:

**"טפסים בסיסיים — נוספים לכל מטופל"** (`procedure_type IS NULL`): explicitly additive (not fallback) — these stack on top of any procedure-specific templates. List of items with inline edit (label, type, required toggle, order_index numeric input), "הוסף פריט" button.

**"טפסים לפי סוג הליך"**: client-side grouped by procedure type from the single GET response. Same inline-edit UX as checklist templates. For `staff_upload_sign` items:
- "העלה טופס ריק" if no `blank_form_url`
- If set: shows filename + "החלף" + "הסר" buttons (the latter calls `DELETE /:id/blank`)

Soft-delete only (`is_active=false` toggle). No Trash bin integration in MVP — items just disappear from the list. Drag-reorder deferred; numeric `order_index` input.

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

1. Fetch all `form_template_items` WHERE `is_active = true` AND (`procedure_type = appointment.procedure_type` OR `procedure_type IS NULL`) — uses `(is_active, procedure_type)` index
2. Insert one `patient_form_items` row per template item, in same TX as appointment insert (atomic):
   - Copy `label`, `item_type`, `required`, `order_index` from template (snapshot)
   - For `staff_upload_sign` items: copy `blank_form_url` → `staff_file_url` (snapshot — later admin updates to template blank PDF do NOT propagate to existing appointments) and set `status = 'staff_uploaded'`
   - Otherwise `status = 'pending'`
3. Idempotency: `uniq_appt_template_item` partial unique index prevents duplicates if logic re-runs.

Files to change: `apps/api/src/modules/staff/appointments.router.ts` + `appointments.service.ts`.

---

## Security

- **Companion deny on writes:** all patient-facing write endpoints (`/upload`, `/signature`) mount `denyCompanionWrite` middleware AFTER `requireMagicLinkToken`. Companion magic links must NOT be able to upload IDs or forge signatures.
- **IDOR protection:** every patient-facing handler verifies `patient_form_items.appointment_id = token.appointmentId` via DB query before any S3 or DB write. Return 403 on mismatch. Test coverage: explicit cross-appointment IDOR test for each write endpoint.
- **MIME magic-byte validation:** `file-type` (npm) on the multer buffer BEFORE sharp/S3. Header-trust is forbidden. 415 on mismatch.
- **Sharp safety:** `sharp(buf, { limitInputPixels: 24_000_000, failOn: 'error' })` to block decompression bombs. Wrap in try/catch; 415 on sharp throw.
- **Signature PNG validation:** decoded base64 must start with PNG magic bytes; size ≤100 KB; route-scoped `express.json({ limit: '150kb' })` (NOT a global limit change).
- **Multer per-route limits:** `{ fileSize: 5MB images / 20MB PDFs, files: 1 }` declared on each upload route's multer instance.
- **S3 PUT options:** `ServerSideEncryption: 'AES256'`, `ContentType` from validated MIME, `ContentDisposition: 'attachment'` (forces download even if attacker stores HTML-shaped bytes).
- **Presigned URLs only:** never store or return raw S3 URLs; all client responses presign with TTL = 15min.
- **Audit:** `staff_id` populated by staff upload handler, `generated_by_staff_id` by export handler (both from `req.auth.userId`).
- **Department scoping deferred to post-MVP — explicit MVP risk acceptance:** any staff JWT can read any appointment's documents. MVP runs in a single-department deployment; multi-department rollout MUST add `appointment.department_id === auth.departmentId || auth.role === 'admin'` check before going live in such an environment. `department_id` column added now to avoid a second migration.
- **No PII in logs** (constitution): never log patient names, file contents, signatures, or token values. Log appointment_id and item_id only.
- **Rate limiting** on patient write endpoints: out of scope for MVP, document as known DoS surface (5MB × N uploads per token).

---

## What Is Out of Scope (MVP)

- Export history endpoint (`GET /forms/exports`)
- Staff PATCH to waive/edit an item
- Staff-side ad-hoc item creation (admin templates cover the standard set)
- Patient delete-without-replace endpoint (re-upload is the only path)
- Department scoping middleware enforcement (column added; check deferred)
- Trash-bin integration for form templates (only `is_active=false` toggle)
- Drag-reorder in admin (numeric `order_index` input only)
- Text fields, checkboxes, or any field type other than file upload and signature
- Patient-initiated PDF generation
- Push notification when patient submits all documents
- S3 orphan-sweep job
- Per-token upload rate limiting
- Auto-polling on staff Documents card (manual refresh button instead)
- Old-export invalidation when patient re-uploads (old PDFs remain valid snapshots; new export reflects current state)

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
pnpm --filter api add pdf-lib file-type
```

`file-type` is required for MIME magic-byte validation on upload buffers. All other dependencies (S3 SDK, sharp, multer) already installed.
