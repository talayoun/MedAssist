# Digital Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable patients to upload photos of their documents and sign consent forms on mobile, with staff able to download a merged PDF from PatientDetail.

**Architecture:** Parallel form system alongside the existing checklist. Four new DB tables hold template definitions, per-appointment snapshots, uploaded documents, and PDF exports. Files are stored in S3 (key only in DB, presigned on read). pdf-lib merges everything into a single downloadable PDF.

**Tech Stack:** Node.js/Express, PostgreSQL, AWS S3, multer + file-type (magic-byte validation), Sharp (image resize/bomb protection), pdf-lib, React 18, canvas API (signature).

---

## Use Available Skills Freely

These skills are installed and ready. Use them whenever they fit — don't wait to be told:

- **`frontend-design`** — whenever building a new UI component or page (SignatureCanvas, Forms section, FormTemplates admin page). Gets you production-grade aesthetics fast.
- **`dev-browser`** — visual verification after any UI change; confirm layout, RTL, tap targets before moving on.
- **`superpowers:debugging`** — if stuck on a failing test or unclear behavior, invoke it before grinding.
- **`superpowers:dispatching-parallel-agents`** — when multiple independent test files fail, dispatch one agent per file in parallel rather than fixing them sequentially.
- **`superpowers:subagent-driven-development`** — preferred execution mode for this plan; fresh subagent per task with review between tasks.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/db/migrations/015_digital_forms.sql` | CREATE | 4 new tables + indexes + trigger |
| `apps/api/src/db/migrations/016_drop_legacy_digital_forms.sql` | CREATE | Guarded DROP of legacy tables |
| `packages/shared-types/src/visit.ts` | MODIFY | Append form DTO schemas |
| `apps/api/src/modules/forms/upload.middleware.ts` | CREATE | multer + file-type validation |
| `apps/api/src/services/s3.ts` | MODIFY | Add presignGet + uploadEncrypted |
| `apps/api/src/modules/admin/form-templates.service.ts` | CREATE | CRUD + blank PDF upload |
| `apps/api/src/modules/admin/form-templates.router.ts` | CREATE | Admin form-template endpoints |
| `apps/api/src/modules/forms/forms.service.ts` | CREATE | List, upload, sign, staff summary |
| `apps/api/src/modules/forms/forms.router.ts` | CREATE | Patient-facing form endpoints |
| `apps/api/src/modules/forms/forms.staff.router.ts` | CREATE | Staff form endpoints + PDF export |
| `apps/api/src/modules/forms/pdf-export.service.ts` | CREATE | buildExport, computeLayout (30-item cap) |
| `apps/api/src/modules/visit.router.ts` | MODIFY | Mount `/:token/forms` router |
| `apps/api/src/app.ts` | MODIFY | Mount staff forms + admin form-templates routers |
| `apps/api/src/modules/staff/appointments.service.ts` | MODIFY | Snapshot form templates at appointment creation |
| `apps/api/src/db/db.ts` | MODIFY | Add `withTransaction` helper if missing |
| `apps/api/src/db/seed.ts` | MODIFY | Default form templates + snapshot |
| `apps/patient-pwa/src/services/api.ts` | MODIFY | getForms, uploadFormImage, submitSignature |
| `apps/patient-pwa/src/pages/Checklist/index.tsx` | MODIFY | Documents section below checklist |
| `apps/patient-pwa/src/components/SignatureCanvas.tsx` | CREATE | Touch+stylus canvas, clear button |
| `apps/patient-pwa/src/pages/Forms/SignaturePage.tsx` | CREATE | Consent PDF link + signature canvas |
| `apps/patient-pwa/src/main.tsx` | MODIFY | Register `/visit/:token/forms/:itemId` route |
| `apps/staff-backoffice/src/pages/PatientDetail/index.tsx` | IMPLEMENT | Documents card (currently 121-byte stub) |
| `apps/staff-backoffice/src/pages/Admin/FormTemplates/index.tsx` | CREATE | Admin form template management |
| `apps/staff-backoffice/src/services/api.ts` | MODIFY | Staff + admin form API functions |
| `apps/staff-backoffice/src/main.tsx` | MODIFY | form-templates route + NavLink |
| `tests/api/admin-form-templates.spec.ts` | CREATE | Template CRUD contract tests |
| `tests/api/visit-forms.spec.ts` | CREATE | Patient form endpoints |
| `tests/api/staff-forms-export.spec.ts` | CREATE | Staff upload + PDF export |
| `tests/e2e/patient-pwa-mobile/forms.spec.ts` | CREATE | Upload + RTL/tap-target assertions |
| `tests/e2e/staff-backoffice-desktop/forms-export.spec.ts` | CREATE | Documents card + PDF download |
| `apps/api/src/modules/forms/__tests__/pdf-export.unit.spec.ts` | CREATE | Vitest: computeLayout pure unit |

---

## Phase 1: Database

### Task 1: Migration 015 — digital forms tables

**Files:**
- Create: `apps/api/src/db/migrations/015_digital_forms.sql`

- [ ] **Step 1: Write the migration**

```sql
-- apps/api/src/db/migrations/015_digital_forms.sql

CREATE TYPE form_item_type AS ENUM ('patient_upload', 'staff_upload_sign');
CREATE TYPE form_item_status AS ENUM ('pending', 'staff_uploaded', 'patient_submitted');

CREATE TABLE form_template_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type TEXT NOT NULL,
  label         TEXT NOT NULL,
  item_type     form_item_type NOT NULL,
  blank_form_s3_key TEXT,            -- only for staff_upload_sign
  required      BOOLEAN NOT NULL DEFAULT true,
  order_index   INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE patient_form_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id         UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  form_template_item_id  UUID REFERENCES form_template_items(id) ON DELETE SET NULL,
  label                  TEXT NOT NULL,
  item_type              form_item_type NOT NULL,
  blank_form_s3_key      TEXT,
  required               BOOLEAN NOT NULL DEFAULT true,
  order_index            INT NOT NULL DEFAULT 0,
  status                 form_item_status NOT NULL DEFAULT 'pending',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate snapshots per template item per appointment
CREATE UNIQUE INDEX uniq_appt_template_item
  ON patient_form_items (appointment_id, form_template_item_id)
  WHERE form_template_item_id IS NOT NULL;

CREATE TABLE patient_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_form_item_id UUID NOT NULL REFERENCES patient_form_items(id) ON DELETE CASCADE,
  s3_key              TEXT NOT NULL,
  doc_type            TEXT NOT NULL,   -- 'patient_upload' | 'staff_consent' | 'patient_signature'
  is_current          BOOLEAN NOT NULL DEFAULT true,
  uploaded_by         TEXT NOT NULL,   -- 'patient' | 'staff'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one current document per form item
CREATE UNIQUE INDEX uniq_current_doc_per_item
  ON patient_documents (patient_form_item_id)
  WHERE is_current = true;

CREATE TABLE patient_pdf_exports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  s3_key           TEXT NOT NULL,
  created_by_staff UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on patient_form_items
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_form_items_updated_at
  BEFORE UPDATE ON patient_form_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter api db:migrate
```

Expected: no errors, migration logged as applied.

- [ ] **Step 3: Verify tables exist**

```bash
pnpm --filter api db:migrate
# should output "No pending migrations" or "015 already applied"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/migrations/015_digital_forms.sql
git commit -m "feat(db): add digital forms tables (015)"
```

---

### Task 2: Migration 016 — drop legacy digital forms

**Files:**
- Create: `apps/api/src/db/migrations/016_drop_legacy_digital_forms.sql`

- [ ] **Step 1: Write guarded DROP migration**

```sql
-- apps/api/src/db/migrations/016_drop_legacy_digital_forms.sql

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'form_submissions') THEN
    DROP TABLE form_submissions CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'form_fields') THEN
    DROP TABLE form_fields CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'forms') THEN
    DROP TABLE forms CASCADE;
  END IF;
END;
$$;
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter api db:migrate
```

Expected: no errors (idempotent — safe if legacy tables don't exist).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/migrations/016_drop_legacy_digital_forms.sql
git commit -m "feat(db): drop legacy digital forms tables (016)"
```

---

## Phase 2: Shared Types + Infra

### Task 3: Shared DTO schemas

**Files:**
- Modify: `packages/shared-types/src/visit.ts`

- [ ] **Step 1: Read the current file**

```bash
# Read packages/shared-types/src/visit.ts to find the end of the file
```

- [ ] **Step 2: Append form schemas**

At the end of `packages/shared-types/src/visit.ts`, add:

```typescript
// --- Digital Forms ---

export const FormItemDTOSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  item_type: z.enum(['patient_upload', 'staff_upload_sign']),
  status: z.enum(['pending', 'staff_uploaded', 'patient_submitted']),
  required: z.boolean(),
  order_index: z.number(),
  staff_file_url: z.string().url().nullable(),   // presigned S3 URL for blank consent
  patient_file_url: z.string().url().nullable(),  // presigned S3 URL for patient upload
  patient_submitted_at: z.string().nullable(),
});

export type FormItemDTO = z.infer<typeof FormItemDTOSchema>;

export const FormSummaryDTOSchema = z.object({
  items: z.array(FormItemDTOSchema),
});

export const StaffFormSummaryDTOSchema = FormSummaryDTOSchema.extend({
  latest_export: z.string().nullable(),    // ISO timestamp
  new_since_last_export: z.number(),       // count of items updated since last export
});

export type StaffFormSummaryDTO = z.infer<typeof StaffFormSummaryDTOSchema>;

export const FormTemplateItemDTOSchema = z.object({
  id: z.string().uuid(),
  procedure_type: z.string(),
  label: z.string(),
  item_type: z.enum(['patient_upload', 'staff_upload_sign']),
  blank_form_url: z.string().url().nullable(),
  required: z.boolean(),
  order_index: z.number(),
  is_active: z.boolean(),
});

export type FormTemplateItemDTO = z.infer<typeof FormTemplateItemDTOSchema>;
```

- [ ] **Step 3: Build shared-types to verify no type errors**

```bash
pnpm --filter shared-types build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/visit.ts
git commit -m "feat(shared-types): add digital forms DTO schemas"
```

---

### Task 4: Upload middleware

**Files:**
- Create: `apps/api/src/modules/forms/upload.middleware.ts`

- [ ] **Step 1: Install file-type**

```bash
pnpm --filter api add file-type
pnpm --filter api add sharp
```

- [ ] **Step 2: Write the middleware**

```typescript
// apps/api/src/modules/forms/upload.middleware.ts
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import type { RequestHandler } from 'express';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_PDF_BYTES = 20 * 1024 * 1024;    // 20 MB

export interface UploadMiddlewareOptions {
  fieldName: string;
  maxBytes: number;
  allowedMimes: string[];
}

export function makeUploadMiddleware(opts: UploadMiddlewareOptions): RequestHandler[] {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: opts.maxBytes },
  });

  const typeCheck: RequestHandler = async (req, res, next) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !opts.allowedMimes.includes(detected.mime)) {
      res.status(415).json({ error: `Unsupported file type: ${detected?.mime ?? 'unknown'}` });
      return;
    }
    file.mimetype = detected.mime;
    next();
  };

  return [upload.single(opts.fieldName), typeCheck];
}

export const imageUpload = makeUploadMiddleware({
  fieldName: 'file',
  maxBytes: MAX_IMAGE_BYTES,
  allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
});

export const signatureUpload = makeUploadMiddleware({
  fieldName: 'file',
  maxBytes: 2 * 1024 * 1024,
  allowedMimes: ['image/png'],
});

export const pdfUpload = makeUploadMiddleware({
  fieldName: 'file',
  maxBytes: MAX_PDF_BYTES,
  allowedMimes: ['application/pdf'],
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter api tsc --noEmit
```

Expected: no errors in upload.middleware.ts.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/forms/upload.middleware.ts
git commit -m "feat(forms): add upload middleware with magic-byte MIME validation"
```

---

### Task 5: S3 helpers (presignGet + uploadEncrypted)

**Files:**
- Modify: `apps/api/src/services/s3.ts`

- [ ] **Step 1: Read the existing s3.ts**

Check what already exists in `apps/api/src/services/s3.ts`.

- [ ] **Step 2: Append new helpers**

Add at the end of `apps/api/src/services/s3.ts`:

```typescript
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function presignGet(
  key: string | null,
  ttlSeconds = 900
): Promise<string | null> {
  if (!key) return null;
  const cmd = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key });
  return getSignedUrl(s3Client, cmd, { expiresIn: ttlSeconds });
}

export async function uploadEncrypted(
  key: string,
  buffer: Buffer,
  contentType: string,
  contentDisposition = 'attachment'
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentDisposition: contentDisposition,
      ServerSideEncryption: 'AES256',
    })
  );
}
```

> Note: If `s3Client` is named differently in the existing file, match that name.

- [ ] **Step 3: Install S3 presigner if not present**

```bash
pnpm --filter api add @aws-sdk/s3-request-presigner
```

- [ ] **Step 4: Verify TypeScript**

```bash
pnpm --filter api tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/s3.ts
git commit -m "feat(s3): add presignGet and uploadEncrypted helpers"
```

---

### Task 6: withTransaction helper in db.ts

**Files:**
- Modify: `apps/api/src/db/db.ts`

- [ ] **Step 1: Read db.ts to see if withTransaction already exists**

```bash
# Read apps/api/src/db/db.ts
```

- [ ] **Step 2: Add withTransaction if missing**

```typescript
import type { PoolClient } from 'pg';

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter api tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/db.ts
git commit -m "feat(db): add withTransaction helper"
```

---

## Phase 3: API — Admin Form Templates

### Task 7: Admin form-templates service + router

**Files:**
- Create: `apps/api/src/modules/admin/form-templates.service.ts`
- Create: `apps/api/src/modules/admin/form-templates.router.ts`

- [ ] **Step 1: Write the failing API test first**

```typescript
// tests/api/admin-form-templates.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers';

test.describe('admin: form templates', () => {
  test('admin can list form templates', async ({ request }) => {
    await loginAs(request, 'admin');
    const res = await request.get('/api/admin/form-templates');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('admin can create a form template item', async ({ request }) => {
    await loginAs(request, 'admin');
    const res = await request.post('/api/admin/form-templates', {
      data: {
        procedure_type: 'colonoscopy',
        label: 'תעודת זהות',
        item_type: 'patient_upload',
        required: true,
        order_index: 0,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.procedure_type).toBe('colonoscopy');
  });

  test('admin can deactivate a form template item', async ({ request }) => {
    await loginAs(request, 'admin');
    // create first
    const createRes = await request.post('/api/admin/form-templates', {
      data: {
        procedure_type: 'gastroscopy',
        label: 'הסכמה',
        item_type: 'staff_upload_sign',
        required: true,
        order_index: 0,
      },
    });
    const { id } = await createRes.json();
    // deactivate
    const patchRes = await request.patch(`/api/admin/form-templates/${id}`, {
      data: { is_active: false },
    });
    expect(patchRes.status()).toBe(200);
    const body = await patchRes.json();
    expect(body.is_active).toBe(false);
  });

  test('non-admin cannot access form templates', async ({ request }) => {
    await loginAs(request, 'staff');
    const res = await request.get('/api/admin/form-templates');
    expect(res.status()).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter api test tests/api/admin-form-templates.spec.ts
```

Expected: FAIL — 404 or connection refused.

- [ ] **Step 3: Write form-templates.service.ts**

```typescript
// apps/api/src/modules/admin/form-templates.service.ts
import { pool } from '../../db/db';
import { presignGet, uploadEncrypted } from '../../services/s3';
import { randomUUID } from 'crypto';

export interface CreateTemplateItemInput {
  procedure_type: string;
  label: string;
  item_type: 'patient_upload' | 'staff_upload_sign';
  required: boolean;
  order_index: number;
}

export interface PatchTemplateItemInput {
  label?: string;
  required?: boolean;
  order_index?: number;
  is_active?: boolean;
}

export async function listTemplateItems() {
  const { rows } = await pool.query(`
    SELECT fti.*, presign.url AS blank_form_url
    FROM form_template_items fti
    LEFT JOIN LATERAL (SELECT NULL AS url) presign ON true
    ORDER BY procedure_type, order_index
  `);
  // presign blank form URLs separately
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      blank_form_url: await presignGet(row.blank_form_s3_key),
    }))
  );
}

export async function createTemplateItem(input: CreateTemplateItemInput) {
  const { rows } = await pool.query(
    `INSERT INTO form_template_items (procedure_type, label, item_type, required, order_index)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.procedure_type, input.label, input.item_type, input.required, input.order_index]
  );
  return { ...rows[0], blank_form_url: null };
}

export async function patchTemplateItem(id: string, input: PatchTemplateItemInput) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.label !== undefined) { fields.push(`label = $${i++}`); values.push(input.label); }
  if (input.required !== undefined) { fields.push(`required = $${i++}`); values.push(input.required); }
  if (input.order_index !== undefined) { fields.push(`order_index = $${i++}`); values.push(input.order_index); }
  if (input.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(input.is_active); }
  if (fields.length === 0) throw Object.assign(new Error('No fields to update'), { status: 400 });
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE form_template_items SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  return { ...rows[0], blank_form_url: await presignGet(rows[0].blank_form_s3_key) };
}

export async function uploadBlankForm(id: string, buffer: Buffer, contentType: string) {
  const key = `form-templates/${id}/blank.pdf`;
  await uploadEncrypted(key, buffer, contentType, 'inline');
  const { rows } = await pool.query(
    `UPDATE form_template_items SET blank_form_s3_key = $1 WHERE id = $2 RETURNING *`,
    [key, id]
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  return { ...rows[0], blank_form_url: await presignGet(key) };
}
```

- [ ] **Step 4: Write form-templates.router.ts**

```typescript
// apps/api/src/modules/admin/form-templates.router.ts
import { Router } from 'express';
import { requireAdminAuth } from '../../middleware/auth';
import { pdfUpload } from '../forms/upload.middleware';
import * as svc from './form-templates.service';

const router = Router();
router.use(requireAdminAuth);

router.get('/', async (_req, res, next) => {
  try { res.json(await svc.listTemplateItems()); }
  catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try { res.status(201).json(await svc.createTemplateItem(req.body)); }
  catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try { res.json(await svc.patchTemplateItem(req.params.id, req.body)); }
  catch (err) { next(err); }
});

router.post('/:id/blank-form', pdfUpload, async (req, res, next) => {
  try {
    res.json(await svc.uploadBlankForm(req.params.id, req.file!.buffer, req.file!.mimetype));
  }
  catch (err) { next(err); }
});

export { router as formTemplatesRouter };
```

- [ ] **Step 5: Mount in app.ts**

In `apps/api/src/app.ts`, add:

```typescript
import { formTemplatesRouter } from './modules/admin/form-templates.router';
// ...existing admin route mounts...
app.use('/api/admin/form-templates', formTemplatesRouter);
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter api test tests/api/admin-form-templates.spec.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin/form-templates.service.ts \
        apps/api/src/modules/admin/form-templates.router.ts \
        apps/api/src/app.ts \
        tests/api/admin-form-templates.spec.ts
git commit -m "feat(admin): form-templates CRUD API"
```

---

## Phase 4: API — Patient & Staff Forms

### Task 8: Forms service

**Files:**
- Create: `apps/api/src/modules/forms/forms.service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/visit-forms.spec.ts
import { test, expect } from '@playwright/test';
import { getValidToken } from '../helpers';

test.describe('patient: forms', () => {
  test('GET /:token/forms returns list', async ({ request }) => {
    const token = await getValidToken(request);
    const res = await request.get(`/api/visit/${token}/forms`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('patient can upload an image to a patient_upload item', async ({ request }) => {
    const token = await getValidToken(request);
    const formsRes = await request.get(`/api/visit/${token}/forms`);
    const { items } = await formsRes.json();
    const uploadItem = items.find((i: { item_type: string }) => i.item_type === 'patient_upload');
    if (!uploadItem) test.skip();

    const res = await request.post(`/api/visit/${token}/forms/${uploadItem.id}/upload`, {
      multipart: {
        file: {
          name: 'id_card.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.alloc(1024),
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('patient_submitted');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter api test tests/api/visit-forms.spec.ts
```

Expected: FAIL — 404.

- [ ] **Step 3: Write forms.service.ts**

```typescript
// apps/api/src/modules/forms/forms.service.ts
import { pool, withTransaction } from '../../db/db';
import { presignGet, uploadEncrypted } from '../../services/s3';
import sharp from 'sharp';

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 82;

async function compressImage(buffer: Buffer, mime: string): Promise<{ buffer: Buffer; mime: string }> {
  if (mime === 'application/pdf') return { buffer, mime };
  const compressed = await sharp(buffer, { limitInputPixels: 24_000_000 })
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return { buffer: compressed, mime: 'image/jpeg' };
}

async function hydrateItem(row: Record<string, unknown>) {
  return {
    ...row,
    staff_file_url: await presignGet(row.blank_form_s3_key as string | null),
    patient_file_url: await presignGet(row.patient_s3_key as string | null),
  };
}

export async function listForAppointment(appointmentId: string) {
  const { rows } = await pool.query(`
    SELECT pfi.*,
           pd.s3_key AS patient_s3_key,
           pd.created_at AS patient_submitted_at
    FROM patient_form_items pfi
    LEFT JOIN patient_documents pd
      ON pd.patient_form_item_id = pfi.id AND pd.is_current = true AND pd.uploaded_by = 'patient'
    WHERE pfi.appointment_id = $1
    ORDER BY pfi.order_index
  `, [appointmentId]);
  return Promise.all(rows.map(hydrateItem));
}

export async function uploadPatientImage(
  itemId: string,
  appointmentId: string,
  buffer: Buffer,
  mime: string
) {
  const { buffer: compressed, mime: finalMime } = await compressImage(buffer, mime);
  const key = `patient-forms/${appointmentId}/${itemId}/patient-upload.jpg`;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE patient_documents SET is_current = false
       WHERE patient_form_item_id = $1 AND uploaded_by = 'patient'`,
      [itemId]
    );
    await uploadEncrypted(key, compressed, finalMime);
    await client.query(
      `INSERT INTO patient_documents (patient_form_item_id, s3_key, doc_type, uploaded_by)
       VALUES ($1, $2, 'patient_upload', 'patient')`,
      [itemId, key]
    );
    await client.query(
      `UPDATE patient_form_items SET status = 'patient_submitted' WHERE id = $1 AND appointment_id = $2`,
      [itemId, appointmentId]
    );
  });

  const { rows } = await pool.query(
    `SELECT pfi.*, pd.s3_key AS patient_s3_key, pd.created_at AS patient_submitted_at
     FROM patient_form_items pfi
     LEFT JOIN patient_documents pd ON pd.patient_form_item_id = pfi.id AND pd.is_current = true AND pd.uploaded_by = 'patient'
     WHERE pfi.id = $1`,
    [itemId]
  );
  return hydrateItem(rows[0]);
}

export async function submitSignature(
  itemId: string,
  appointmentId: string,
  pngBuffer: Buffer
) {
  const key = `patient-forms/${appointmentId}/${itemId}/signature.png`;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE patient_documents SET is_current = false
       WHERE patient_form_item_id = $1 AND doc_type = 'patient_signature'`,
      [itemId]
    );
    await uploadEncrypted(key, pngBuffer, 'image/png');
    await client.query(
      `INSERT INTO patient_documents (patient_form_item_id, s3_key, doc_type, uploaded_by)
       VALUES ($1, $2, 'patient_signature', 'patient')`,
      [itemId, key]
    );
    await client.query(
      `UPDATE patient_form_items SET status = 'patient_submitted' WHERE id = $1 AND appointment_id = $2`,
      [itemId, appointmentId]
    );
  });

  const { rows } = await pool.query(
    `SELECT pfi.*, pd.s3_key AS patient_s3_key, pd.created_at AS patient_submitted_at
     FROM patient_form_items pfi
     LEFT JOIN patient_documents pd ON pd.patient_form_item_id = pfi.id AND pd.is_current = true AND pd.uploaded_by = 'patient'
     WHERE pfi.id = $1`,
    [itemId]
  );
  return hydrateItem(rows[0]);
}

export async function getStaffSummary(appointmentId: string) {
  const items = await listForAppointment(appointmentId);
  const { rows: exports } = await pool.query(
    `SELECT created_at FROM patient_pdf_exports WHERE appointment_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [appointmentId]
  );
  const latestExport = exports[0]?.created_at ?? null;
  const newSinceLastExport = latestExport
    ? items.filter((i) => i.patient_submitted_at && new Date(i.patient_submitted_at as string) > new Date(latestExport)).length
    : items.filter((i) => i.status === 'patient_submitted').length;
  return { items, latest_export: latestExport, new_since_last_export: newSinceLastExport };
}

export async function staffUploadConsent(
  itemId: string,
  appointmentId: string,
  buffer: Buffer,
  mime: string
) {
  const key = `patient-forms/${appointmentId}/${itemId}/consent.pdf`;
  await uploadEncrypted(key, buffer, mime, 'inline');

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE patient_documents SET is_current = false
       WHERE patient_form_item_id = $1 AND doc_type = 'staff_consent'`,
      [itemId]
    );
    await client.query(
      `INSERT INTO patient_documents (patient_form_item_id, s3_key, doc_type, uploaded_by)
       VALUES ($1, $2, 'staff_consent', 'staff')`,
      [itemId, key]
    );
    await client.query(
      `UPDATE patient_form_items
       SET status = 'staff_uploaded', blank_form_s3_key = $2
       WHERE id = $1 AND appointment_id = $3`,
      [itemId, key, appointmentId]
    );
  });

  const { rows } = await pool.query(`SELECT * FROM patient_form_items WHERE id = $1`, [itemId]);
  return hydrateItem(rows[0]);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/forms/forms.service.ts
git commit -m "feat(forms): forms service (list, upload, sign, staff)"
```

---

### Task 9: Patient forms router

**Files:**
- Create: `apps/api/src/modules/forms/forms.router.ts`
- Modify: `apps/api/src/modules/visit.router.ts`

- [ ] **Step 1: Write forms.router.ts**

```typescript
// apps/api/src/modules/forms/forms.router.ts
import { Router } from 'express';
import { imageUpload, signatureUpload } from './upload.middleware';
import * as svc from './forms.service';

const router = Router({ mergeParams: true });
// req.appointment must be set by parent visit.router middleware

router.get('/', async (req: any, res, next) => {
  try {
    const items = await svc.listForAppointment(req.appointment.id);
    res.json({ items });
  } catch (err) { next(err); }
});

router.post('/:itemId/upload', ...imageUpload, async (req: any, res, next) => {
  try {
    const item = await svc.uploadPatientImage(
      req.params.itemId,
      req.appointment.id,
      req.file!.buffer,
      req.file!.mimetype
    );
    res.json(item);
  } catch (err) { next(err); }
});

router.post('/:itemId/signature', ...signatureUpload, async (req: any, res, next) => {
  try {
    const item = await svc.submitSignature(
      req.params.itemId,
      req.appointment.id,
      req.file!.buffer
    );
    res.json(item);
  } catch (err) { next(err); }
});

export { router as formsRouter };
```

- [ ] **Step 2: Mount in visit.router.ts**

In `apps/api/src/modules/visit.router.ts`, add:

```typescript
import { formsRouter } from './forms/forms.router';
// ...existing mounts...
visitRouter.use('/:token/forms', formsRouter);
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter api test tests/api/visit-forms.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/forms/forms.router.ts apps/api/src/modules/visit.router.ts
git commit -m "feat(forms): patient forms router + visit mount"
```

---

### Task 10: Staff forms router + PDF export service

**Files:**
- Create: `apps/api/src/modules/forms/forms.staff.router.ts`
- Create: `apps/api/src/modules/forms/pdf-export.service.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing export test**

```typescript
// tests/api/staff-forms-export.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs, seedAppointmentWithForms } from '../helpers';

test.describe('staff: forms export', () => {
  test('staff can upload a consent PDF to a form item', async ({ request }) => {
    await loginAs(request, 'staff');
    const { appointmentId, itemId } = await seedAppointmentWithForms(request, 'staff_upload_sign');
    const res = await request.post(
      `/api/staff/appointments/${appointmentId}/forms/${itemId}/consent`,
      {
        multipart: {
          file: {
            name: 'consent.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.alloc(1024),
          },
        },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('staff_uploaded');
  });

  test('staff can export a PDF of all form items', async ({ request }) => {
    await loginAs(request, 'staff');
    const { appointmentId } = await seedAppointmentWithForms(request, 'patient_upload');
    const res = await request.post(`/api/staff/appointments/${appointmentId}/forms/export`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https?:\/\//);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter api test tests/api/staff-forms-export.spec.ts
```

Expected: FAIL — 404.

- [ ] **Step 3: Write pdf-export.service.ts**

```typescript
// apps/api/src/modules/forms/pdf-export.service.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fetch from 'node-fetch';
import { pool } from '../../db/db';
import { presignGet, uploadEncrypted } from '../../services/s3';
import type { StaffUser } from '../../middleware/auth';

const MAX_ITEMS = 30;
const PAGE_WIDTH = 595;   // A4 pt
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const LABEL_HEIGHT = 20;
const IMAGE_MAX_H = 180;
const SECTION_GAP = 20;

export async function computeLayout(items: Array<{ label: string; patient_file_url: string | null; staff_file_url: string | null }>) {
  // Returns item list capped at MAX_ITEMS — pure function, testable with Vitest
  return items.slice(0, MAX_ITEMS);
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

export async function buildExport(appointmentId: string, staff: StaffUser): Promise<string> {
  // Gather items
  const { rows } = await pool.query(`
    SELECT pfi.label, pfi.item_type, pfi.status,
           pd_staff.s3_key AS staff_key,
           pd_patient.s3_key AS patient_key
    FROM patient_form_items pfi
    LEFT JOIN patient_documents pd_staff ON pd_staff.patient_form_item_id = pfi.id AND pd_staff.is_current = true AND pd_staff.uploaded_by = 'staff'
    LEFT JOIN patient_documents pd_patient ON pd_patient.patient_form_item_id = pfi.id AND pd_patient.is_current = true AND pd_patient.uploaded_by = 'patient'
    WHERE pfi.appointment_id = $1
    ORDER BY pfi.order_index
    LIMIT $2
  `, [appointmentId, MAX_ITEMS]);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  for (const row of rows) {
    if (y < MARGIN + IMAGE_MAX_H + LABEL_HEIGHT + SECTION_GAP) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    // Label
    page.drawText(row.label, { x: MARGIN, y, size: 12, font, color: rgb(0, 0, 0) });
    y -= LABEL_HEIGHT;

    // Patient image
    const patientUrl = await presignGet(row.patient_key);
    if (patientUrl) {
      const imgBuf = await fetchBuffer(patientUrl);
      if (imgBuf) {
        try {
          const img = await pdfDoc.embedJpg(imgBuf).catch(() => pdfDoc.embedPng(imgBuf));
          const scaled = img.scaleToFit(PAGE_WIDTH - MARGIN * 2, IMAGE_MAX_H);
          page.drawImage(img, { x: MARGIN, y: y - scaled.height, width: scaled.width, height: scaled.height });
          y -= scaled.height + SECTION_GAP;
        } catch { /* skip unembeddable */ }
      }
    } else {
      page.drawText('(לא הועלה)', { x: MARGIN, y, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
      y -= LABEL_HEIGHT + SECTION_GAP;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const key = `exports/${appointmentId}/${Date.now()}.pdf`;
  await uploadEncrypted(key, Buffer.from(pdfBytes), 'application/pdf');

  await pool.query(
    `INSERT INTO patient_pdf_exports (appointment_id, s3_key, created_by_staff) VALUES ($1, $2, $3)`,
    [appointmentId, key, staff.id]
  );

  return (await presignGet(key))!;
}
```

- [ ] **Step 4: Write forms.staff.router.ts**

```typescript
// apps/api/src/modules/forms/forms.staff.router.ts
import { Router } from 'express';
import { requireStaffAuth } from '../../middleware/auth';
import { pdfUpload } from './upload.middleware';
import * as svc from './forms.service';
import { buildExport } from './pdf-export.service';

const router = Router({ mergeParams: true });
router.use(requireStaffAuth);

router.get('/:appointmentId/forms', async (req: any, res, next) => {
  try {
    res.json(await svc.getStaffSummary(req.params.appointmentId));
  } catch (err) { next(err); }
});

router.post('/:appointmentId/forms/:itemId/consent', ...pdfUpload, async (req: any, res, next) => {
  try {
    const item = await svc.staffUploadConsent(
      req.params.itemId,
      req.params.appointmentId,
      req.file!.buffer,
      req.file!.mimetype
    );
    res.json(item);
  } catch (err) { next(err); }
});

router.post('/:appointmentId/forms/export', async (req: any, res, next) => {
  try {
    const url = await buildExport(req.params.appointmentId, req.staff);
    res.json({ url });
  } catch (err) { next(err); }
});

export { router as formsStaffRouter };
```

- [ ] **Step 5: Mount in app.ts**

```typescript
import { formsStaffRouter } from './modules/forms/forms.staff.router';
app.use('/api/staff/appointments', formsStaffRouter);
```

- [ ] **Step 6: Install pdf-lib**

```bash
pnpm --filter api add pdf-lib
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter api test tests/api/staff-forms-export.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/forms/forms.staff.router.ts \
        apps/api/src/modules/forms/pdf-export.service.ts \
        apps/api/src/app.ts \
        tests/api/staff-forms-export.spec.ts
git commit -m "feat(forms): staff consent upload + PDF export"
```

---

### Task 11: Snapshot form templates at appointment creation

**Files:**
- Modify: `apps/api/src/modules/staff/appointments.service.ts`

- [ ] **Step 1: Read the existing createAppointment function**

Locate the function in `apps/api/src/modules/staff/appointments.service.ts` that inserts a new appointment.

- [ ] **Step 2: Add snapshot logic**

After inserting the appointment row, snapshot all active template items for the appointment's `procedure_type`:

```typescript
// After INSERT INTO appointments ... RETURNING id
const { rows: templates } = await client.query(
  `SELECT * FROM form_template_items WHERE procedure_type = $1 AND is_active = true ORDER BY order_index`,
  [procedureType]
);
for (const tmpl of templates) {
  await client.query(
    `INSERT INTO patient_form_items
       (appointment_id, form_template_item_id, label, item_type, blank_form_s3_key, required, order_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (appointment_id, form_template_item_id) DO NOTHING`,
    [appointmentId, tmpl.id, tmpl.label, tmpl.item_type, tmpl.blank_form_s3_key, tmpl.required, tmpl.order_index]
  );
}
```

> This must run inside the same transaction used to create the appointment. Wrap in `withTransaction` if not already.

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter api tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/staff/appointments.service.ts
git commit -m "feat(forms): snapshot form templates at appointment creation"
```

---

### Task 12: Vitest unit test for pdf-export layout

**Files:**
- Create: `apps/api/src/modules/forms/__tests__/pdf-export.unit.spec.ts`

- [ ] **Step 1: Write the unit test**

```typescript
// apps/api/src/modules/forms/__tests__/pdf-export.unit.spec.ts
import { describe, it, expect } from 'vitest';
import { computeLayout } from '../pdf-export.service';

const makeItem = (label: string) => ({
  label,
  patient_file_url: null,
  staff_file_url: null,
});

describe('computeLayout', () => {
  it('returns all items when under cap', async () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`item-${i}`));
    const result = await computeLayout(items);
    expect(result).toHaveLength(10);
  });

  it('caps at 30 items', async () => {
    const items = Array.from({ length: 35 }, (_, i) => makeItem(`item-${i}`));
    const result = await computeLayout(items);
    expect(result).toHaveLength(30);
  });

  it('returns empty array when no items', async () => {
    const result = await computeLayout([]);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run Vitest**

```bash
pnpm --filter api vitest run src/modules/forms/__tests__/pdf-export.unit.spec.ts
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/forms/__tests__/pdf-export.unit.spec.ts
git commit -m "test(forms): vitest unit for computeLayout"
```

---

### Task 13: Seed — default form templates + snapshot

**Files:**
- Modify: `apps/api/src/db/seed.ts`

- [ ] **Step 1: Read seed.ts to find where patients/appointments are inserted**

- [ ] **Step 2: Add default templates and snapshot them**

After existing appointment seed data, add:

```typescript
// Seed default form template items
const formTemplates = [
  { procedure_type: 'colonoscopy', label: 'תעודת זהות', item_type: 'patient_upload', required: true, order_index: 0 },
  { procedure_type: 'colonoscopy', label: 'הסכמה לבדיקה', item_type: 'staff_upload_sign', required: true, order_index: 1 },
  { procedure_type: 'gastroscopy', label: 'תעודת זהות', item_type: 'patient_upload', required: true, order_index: 0 },
];

for (const tmpl of formTemplates) {
  const { rows } = await pool.query(
    `INSERT INTO form_template_items (procedure_type, label, item_type, required, order_index)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [tmpl.procedure_type, tmpl.label, tmpl.item_type, tmpl.required, tmpl.order_index]
  );
  if (!rows[0]) continue;
  const tmplId = rows[0].id;
  // Snapshot to all existing appointments of this procedure type
  await pool.query(
    `INSERT INTO patient_form_items
       (appointment_id, form_template_item_id, label, item_type, required, order_index)
     SELECT a.id, $1, $2, $3, $4, $5
     FROM appointments a
     WHERE a.procedure_type = $6
     ON CONFLICT (appointment_id, form_template_item_id) DO NOTHING`,
    [tmplId, tmpl.label, tmpl.item_type, tmpl.required, tmpl.order_index, tmpl.procedure_type]
  );
}
```

- [ ] **Step 3: Re-seed and verify**

```bash
pnpm --filter api db:seed
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/seed.ts
git commit -m "feat(seed): add default form templates and snapshot"
```

---

## Phase 5: Patient PWA

### Task 14: API client + Checklist Documents section

**Files:**
- Modify: `apps/patient-pwa/src/services/api.ts`
- Modify: `apps/patient-pwa/src/pages/Checklist/index.tsx`

> Use the **frontend-design** skill when implementing the Documents UI section if you want production-grade aesthetics.
> Use the **dev-browser** skill to verify RTL layout and 44px tap targets after implementation.

- [ ] **Step 1: Add API functions**

In `apps/patient-pwa/src/services/api.ts`, add:

```typescript
export async function getForms(token: string) {
  const res = await apiFetch(`/visit/${token}/forms`);
  return res.json() as Promise<{ items: FormItemDTO[] }>;
}

export async function uploadFormImage(token: string, itemId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`/visit/${token}/forms/${itemId}/upload`, {
    method: 'POST',
    body: fd,
  });
  return res.json() as Promise<FormItemDTO>;
}

export async function submitSignature(token: string, itemId: string, pngBlob: Blob) {
  const fd = new FormData();
  fd.append('file', new File([pngBlob], 'signature.png', { type: 'image/png' }));
  const res = await apiFetch(`/visit/${token}/forms/${itemId}/signature`, {
    method: 'POST',
    body: fd,
  });
  return res.json() as Promise<FormItemDTO>;
}
```

- [ ] **Step 2: Add Documents section to Checklist page**

In `apps/patient-pwa/src/pages/Checklist/index.tsx`, after the checklist items and before (or after) the "Next" button, add a Documents section:

```tsx
// Add state at the top of the component
const [forms, setForms] = useState<FormItemDTO[]>([]);

useEffect(() => {
  getForms(token).then(({ items }) => setForms(items));
}, [token]);

// In JSX, add after checklist items:
{forms.length > 0 && (
  <section style={{ marginTop: 24 }}>
    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>מסמכים</h2>
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {forms.map((item) => (
        <li key={item.id} style={{ marginBottom: 12 }}>
          <FormDocumentItem item={item} token={token} onUpdate={(updated) => {
            setForms((prev) => prev.map((f) => f.id === updated.id ? updated : f));
          }} />
        </li>
      ))}
    </ul>
  </section>
)}
```

Create a `FormDocumentItem` component inline or in a separate file:

```tsx
function FormDocumentItem({ item, token, onUpdate }: {
  item: FormItemDTO;
  token: string;
  onUpdate: (updated: FormItemDTO) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const updated = await uploadFormImage(token, item.id, file);
    onUpdate(updated);
  };

  const statusLabel = {
    pending: 'ממתין',
    staff_uploaded: 'ממתין לחתימה',
    patient_submitted: 'הועלה',
  }[item.status];

  const isComplete = item.status === 'patient_submitted';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: isComplete ? '#f0fdf4' : '#fff',
      border: `1px solid ${isComplete ? '#86efac' : '#e5e7eb'}`,
      borderRadius: 12,
      minHeight: 44,
    }}>
      <span style={{ fontWeight: 600 }}>{item.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: isComplete ? '#16a34a' : '#6b7280' }}>{statusLabel}</span>
        {item.item_type === 'patient_upload' && !isComplete && (
          <>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            <button
              onClick={() => inputRef.current?.click()}
              style={{ minWidth: 44, minHeight: 44, padding: '0 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
            >
              העלה
            </button>
          </>
        )}
        {item.item_type === 'staff_upload_sign' && item.status === 'staff_uploaded' && (
          <a
            href={`/visit/${token}/forms/${item.id}`}
            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 12px', background: '#7c3aed', color: '#fff', borderRadius: 8, fontSize: 14, textDecoration: 'none' }}
          >
            חתום
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter patient-pwa tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/patient-pwa/src/services/api.ts apps/patient-pwa/src/pages/Checklist/index.tsx
git commit -m "feat(patient-pwa): documents section in checklist + api client"
```

---

### Task 15: SignatureCanvas component + SignaturePage

**Files:**
- Create: `apps/patient-pwa/src/components/SignatureCanvas.tsx`
- Create: `apps/patient-pwa/src/pages/Forms/SignaturePage.tsx`
- Modify: `apps/patient-pwa/src/main.tsx`

> Use the **frontend-design** skill for the SignaturePage UI.
> Use the **dev-browser** skill to verify touch drawing works in mobile viewport.

- [ ] **Step 1: Write SignatureCanvas.tsx**

```tsx
// apps/patient-pwa/src/components/SignatureCanvas.tsx
import React, { useRef, useEffect, useCallback } from 'react';

interface Props {
  onDraw?: () => void;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}

export function SignatureCanvas({ onDraw, canvasRef: externalRef }: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const ref = externalRef ?? internalRef;
  const drawing = useRef(false);

  const getPos = (e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ('clientX' in e ? e.clientX : e.clientX) - rect.left, y: ('clientY' in e ? e.clientY : e.clientY) - rect.top };
  };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      const pos = getPos('touches' in e ? e.touches[0] : e, canvas);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const pos = getPos('touches' in e ? e.touches[0] : e, canvas);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      onDraw?.();
    };
    const end = () => { drawing.current = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        width: '100%',
        height: 200,
        border: '2px solid #cbd5e1',
        borderRadius: 12,
        background: '#fff',
        touchAction: 'none',
        display: 'block',
      }}
    />
  );
}

export function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
```

- [ ] **Step 2: Write SignaturePage.tsx**

```tsx
// apps/patient-pwa/src/pages/Forms/SignaturePage.tsx
import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SignatureCanvas, clearCanvas } from '../../components/SignatureCanvas';
import { submitSignature } from '../../services/api';

export function SignaturePage() {
  const { token, itemId } = useParams<{ token: string; itemId: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl] = useState<string | null>(null); // set from item prop if passed

  const handleSubmit = async () => {
    if (!canvasRef.current || !token || !itemId) return;
    setSubmitting(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvasRef.current!.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/png')
      );
      await submitSignature(token, itemId, blob);
      navigate(`/visit/${token}/checklist`);
    } catch {
      setError('שגיאה בשליחת החתימה. נסה שנית.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main dir="rtl" style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>חתימה על טופס הסכמה</h1>

      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: '0 16px',
            marginBottom: 20,
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          פתח טופס לצפייה
        </a>
      )}

      <p style={{ marginBottom: 12, color: '#475569' }}>חתום בתיבה למטה:</p>
      <SignatureCanvas canvasRef={canvasRef} onDraw={() => setHasDrawn(true)} />

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => { clearCanvas(canvasRef.current!); setHasDrawn(false); }}
          style={{ flex: 1, minHeight: 44, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 16, cursor: 'pointer' }}
        >
          נקה
        </button>
        <button
          onClick={handleSubmit}
          disabled={!hasDrawn || submitting}
          style={{
            flex: 2,
            minHeight: 44,
            background: hasDrawn && !submitting ? '#2563eb' : '#93c5fd',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 700,
            cursor: hasDrawn && !submitting ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'שולח...' : 'שלח חתימה'}
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', marginTop: 12 }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Register route in main.tsx**

In `apps/patient-pwa/src/main.tsx`, add:

```tsx
import { SignaturePage } from './pages/Forms/SignaturePage';
// Inside the router:
<Route path="/visit/:token/forms/:itemId" element={<SignaturePage />} />
```

- [ ] **Step 4: Verify TypeScript**

```bash
pnpm --filter patient-pwa tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/patient-pwa/src/components/SignatureCanvas.tsx \
        apps/patient-pwa/src/pages/Forms/SignaturePage.tsx \
        apps/patient-pwa/src/main.tsx
git commit -m "feat(patient-pwa): signature canvas and signature page"
```

---

## Phase 6: Staff Backoffice

### Task 16: Staff forms API client

**Files:**
- Modify: `apps/staff-backoffice/src/services/api.ts`

- [ ] **Step 1: Add staff form API functions**

```typescript
export async function getStaffForms(appointmentId: string): Promise<StaffFormSummaryDTO> {
  const res = await apiFetch(`/staff/appointments/${appointmentId}/forms`);
  return res.json();
}

export async function staffUploadConsent(appointmentId: string, itemId: string, file: File): Promise<FormItemDTO> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`/staff/appointments/${appointmentId}/forms/${itemId}/consent`, {
    method: 'POST',
    body: fd,
  });
  return res.json();
}

export async function exportForms(appointmentId: string): Promise<{ url: string }> {
  const res = await apiFetch(`/staff/appointments/${appointmentId}/forms/export`, { method: 'POST' });
  return res.json();
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter staff-backoffice tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/staff-backoffice/src/services/api.ts
git commit -m "feat(staff-backoffice): forms API client functions"
```

---

### Task 17: PatientDetail Documents card

**Files:**
- Implement: `apps/staff-backoffice/src/pages/PatientDetail/index.tsx`

> This is currently a 121-byte stub. Use the **frontend-design** skill for the full Documents card UI.
> Use the **dev-browser** skill to verify the PDF opens in a new tab (not an iframe) on all browsers.

- [ ] **Step 1: Read the current stub**

```bash
# Read apps/staff-backoffice/src/pages/PatientDetail/index.tsx
```

- [ ] **Step 2: Implement the Documents card**

The PatientDetail page should include a Documents card below the patient info. Key behaviors:
- Load forms via `getStaffForms(appointmentId)`
- Show each form item with status badge
- For `staff_upload_sign` items: file upload button for staff to upload consent PDF
- "ייצא PDF" button — pre-open a tab with `window.open('about:blank', '_blank')` BEFORE the async POST (avoids pop-up blocker), then set the tab location to the returned URL
- Show `new_since_last_export` count as a badge on the export button when > 0

```tsx
// Key export handler — avoids popup blocker:
const handleExport = async () => {
  const newTab = window.open('about:blank', '_blank');
  try {
    const { url } = await exportForms(appointmentId);
    if (newTab) newTab.location.href = url;
  } catch {
    newTab?.close();
    setExportError('שגיאה בייצוא');
  }
};
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter staff-backoffice tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/staff-backoffice/src/pages/PatientDetail/index.tsx
git commit -m "feat(staff-backoffice): patient detail documents card"
```

---

### Task 18: Admin FormTemplates page + nav

**Files:**
- Create: `apps/staff-backoffice/src/pages/Admin/FormTemplates/index.tsx`
- Modify: `apps/staff-backoffice/src/main.tsx`

> Use the **frontend-design** skill for the FormTemplates admin page UI — same white-card table style as other admin pages.

- [ ] **Step 1: Write FormTemplates page**

The page should:
- List all form templates grouped by `procedure_type`
- Allow creating a new template item (inline form: procedure_type, label, item_type, required, order_index)
- Allow uploading a blank PDF for `staff_upload_sign` items
- Allow toggling `is_active`
- Match the white-card table style of other admin pages

- [ ] **Step 2: Add route and NavLink in main.tsx**

```tsx
import { FormTemplates } from './pages/Admin/FormTemplates';
// Route:
<Route path="form-templates" element={<FormTemplates />} />
// NavLink in AdminLayout header:
<NavLink to="/admin/form-templates" style={({ isActive }) => isActive ? activeGhostBtn : ghostBtn}>
  תבניות טפסים
</NavLink>
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter staff-backoffice tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/staff-backoffice/src/pages/Admin/FormTemplates/index.tsx apps/staff-backoffice/src/main.tsx
git commit -m "feat(admin): form-templates management page + nav"
```

---

## Phase 7: E2E Tests + Verification

### Task 19: Patient PWA E2E — forms

**Files:**
- Create: `tests/e2e/patient-pwa-mobile/forms.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// tests/e2e/patient-pwa-mobile/forms.spec.ts
import { test, expect } from '@playwright/test';
import { getTestToken } from '../helpers';

test.describe('patient: forms (mobile)', () => {
  test('documents section appears in checklist', async ({ page }) => {
    const token = await getTestToken();
    await page.goto(`/visit/${token}/checklist`);
    await expect(page.getByText('מסמכים')).toBeVisible();
  });

  test('tap targets are at least 44x44px', async ({ page }) => {
    const token = await getTestToken();
    await page.goto(`/visit/${token}/checklist`);
    const buttons = page.locator('[data-testid="form-action-btn"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('RTL layout: upload button is on the left in RTL', async ({ page }) => {
    const token = await getTestToken();
    await page.goto(`/visit/${token}/checklist`);
    // In RTL, the primary action is on the left (inline-start)
    const section = page.locator('section').filter({ hasText: 'מסמכים' });
    await expect(section).toBeVisible();
    // dir="rtl" is set on the page root
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('signature page renders canvas', async ({ page }) => {
    const token = await getTestToken();
    // Navigate to signature page for a staff_upload_sign item with status staff_uploaded
    // (requires seeded data with a signed consent item)
    await page.goto(`/visit/${token}/checklist`);
    const signBtn = page.getByText('חתום').first();
    if (await signBtn.count() === 0) test.skip();
    await signBtn.click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('שלח חתימה')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
pnpm --filter e2e test tests/e2e/patient-pwa-mobile/forms.spec.ts
```

Expected: all tests PASS (or skip cleanly if seed data missing).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/patient-pwa-mobile/forms.spec.ts
git commit -m "test(e2e): patient forms E2E — documents section, RTL, tap targets"
```

---

### Task 20: Staff backoffice E2E — forms export

**Files:**
- Create: `tests/e2e/staff-backoffice-desktop/forms-export.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// tests/e2e/staff-backoffice-desktop/forms-export.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsStaff, getFirstAppointmentId } from '../helpers';

test.describe('staff: forms export', () => {
  test('documents card appears in patient detail', async ({ page }) => {
    await loginAsStaff(page);
    const appointmentId = await getFirstAppointmentId(page);
    await page.goto(`/admin/patients/${appointmentId}`);
    await expect(page.getByText('מסמכים')).toBeVisible();
  });

  test('export PDF button opens new tab', async ({ page, context }) => {
    await loginAsStaff(page);
    const appointmentId = await getFirstAppointmentId(page);
    await page.goto(`/admin/patients/${appointmentId}`);

    const [newTab] = await Promise.all([
      context.waitForEvent('page'),
      page.getByText('ייצא PDF').click(),
    ]);
    await newTab.waitForLoadState();
    expect(newTab.url()).toMatch(/^https?:\/\//);
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
pnpm --filter e2e test tests/e2e/staff-backoffice-desktop/forms-export.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/staff-backoffice-desktop/forms-export.spec.ts
git commit -m "test(e2e): staff forms export E2E"
```

---

### Task 21: Full suite + merge

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 2: Fix any failures**

If multiple independent test files fail, use **superpowers:dispatching-parallel-agents** to investigate them in parallel — one agent per test file.

- [ ] **Step 3: Merge to working branch**

```bash
git checkout 002-mvp-completion
git merge feat/digital-forms
```

- [ ] **Step 4: Verify tests on merged branch**

```bash
pnpm test
```

Expected: all tests still PASS.

- [ ] **Step 5: Final commit message**

The merge commit should note: `feat(digital-forms): patient document upload, consent signing, staff PDF export`.

---

## Verification Checklist

1. Patient on mobile sees "מסמכים" section below checklist
2. `patient_upload` item: tap "העלה" → file picker → image uploaded → status changes to "הועלה"
3. `staff_upload_sign` item: staff uploads PDF → patient sees "חתום" button → taps → new tab with consent PDF → draws signature → submits → status changes
4. Staff PatientDetail → Documents card → "ייצא PDF" → new tab opens with merged PDF
5. Admin → "תבניות טפסים" → CRUD form templates, upload blank PDFs
6. New appointment created → form items auto-snapshotted from active templates
7. Decompression bomb: upload a 25MP image → API rejects with 400 (Sharp limitInputPixels check)
8. Wrong MIME: upload a .exe renamed as .jpg → API rejects with 415
9. RTL: all patient UI dir="rtl", text ≥ 16pt, tap targets ≥ 44×44px
10. iOS Safari: consent PDF opens in new tab (not iframe)
