# MedAssist MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the 5 missing pieces that block MVP: Telegram delivery swap, Forms API + page, Admin API + page, and two stub staff pages.

**Architecture:** All existing modules (magic-links, checklist, navigation, waiting, staff auth/queue/stations) are fully implemented. This plan closes only the gaps. Each task runs on its own git branch and merges back when done.

**Tech Stack:** TypeScript 5, Express 4, PostgreSQL (pg), React 18, BullMQ, Telegram Bot API (fetch — no SDK), pdfkit (add), react-signature-canvas (already in PWA deps), Zod shared-types (all DTOs already defined)

---

## Actual Gaps (from codebase inspection)

| Gap | Files |
|---|---|
| Twilio in consumer | `apps/api/src/modules/notifications/notifications.consumer.ts` |
| Forms API missing | `apps/api/src/modules/forms/` (empty — create both files) |
| PDF service missing | `apps/api/src/modules/pdf/pdf.service.ts` |
| Admin API missing | `apps/api/src/modules/admin/` (empty — create both files) |
| Forms page stub | `apps/patient-pwa/src/pages/Forms/index.tsx` |
| PatientDetail stub | `apps/staff-backoffice/src/pages/PatientDetail/index.tsx` |
| Admin page stub | `apps/staff-backoffice/src/pages/Admin/index.tsx` |
| Routes not mounted | `visit.router.ts` (forms) + `app.ts` (admin) |

---

## Task 1: Telegram Consumer Swap

**Branch:** `feat/telegram-consumer`

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.consumer.ts`

- [ ] **Step 1: Create a Telegram bot**

  Message @BotFather on Telegram: `/newbot` → follow prompts → copy the `BOT_TOKEN`.
  Message your new bot once. Then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser.
  Find `"chat":{"id":NNNNNNNN}` — that number is your `CHAT_ID`.
  Repeat for each team member who wants messages.

- [ ] **Step 2: Add env vars**

  In `apps/api/.env`:
  ```
  TELEGRAM_BOT_TOKEN=your_bot_token
  TELEGRAM_CHAT_IDS=chatid1,chatid2
  ```

- [ ] **Step 3: Replace consumer implementation**

  Full replacement of `apps/api/src/modules/notifications/notifications.consumer.ts`:

  ```typescript
  import { Job } from 'bullmq';
  import { query } from '../../db/db';
  import { createNotificationWorker, NotificationJobData } from './queue';

  const MAX_RETRY_COUNT = 3;

  async function sendTelegram(message: string): Promise<string> {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const chatId of chatIds) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Telegram error for chat ${chatId}: ${body}`);
      }
    }
    return `telegram:${Date.now()}`;
  }

  async function processNotification(job: Job<NotificationJobData>): Promise<void> {
    const { notificationId, message, retryCount } = job.data;

    const { rows } = await query<{ retry_count: number; status: string }>(
      'SELECT retry_count, status FROM notifications WHERE id = $1',
      [notificationId]
    );
    if (rows.length === 0 || rows[0].status === 'sent') return;

    try {
      const providerMessageId = await sendTelegram(message);
      await query(
        `UPDATE notifications SET status = 'sent', provider_message_id = $1 WHERE id = $2`,
        [providerMessageId, notificationId]
      );
    } catch (err) {
      const currentRetry = retryCount + 1;
      if (currentRetry >= MAX_RETRY_COUNT) {
        await query(
          `UPDATE notifications SET status = 'failed', retry_count = $1 WHERE id = $2`,
          [currentRetry, notificationId]
        );
        console.error(`[notifications] Permanently failed ${notificationId}:`, err);
        return;
      }
      await query(`UPDATE notifications SET retry_count = $1 WHERE id = $2`, [currentRetry, notificationId]);
      throw err;
    }
  }

  export function startNotificationWorker() {
    const worker = createNotificationWorker(processNotification);
    worker.on('completed', (job) => console.log(`[notifications] Job ${job.id} completed`));
    worker.on('failed', (job, err) => console.error(`[notifications] Job ${job?.id} failed:`, err.message));
    return worker;
  }
  ```

- [ ] **Step 4: Verify end-to-end**

  ```bash
  # Terminal 1 — start worker
  pnpm --filter api worker

  # Terminal 2 — seed (enqueues a magic link notification)
  pnpm --filter api db:seed
  ```

  Expected: Telegram bot sends a message to all configured chat IDs within a few seconds.

- [ ] **Step 5: Commit and merge**

  ```bash
  git add apps/api/src/modules/notifications/notifications.consumer.ts
  git commit -m "feat(notifications): replace Twilio with Telegram Bot API"
  git checkout 001-patient-visit-companion && git merge feat/telegram-consumer
  ```

---

## Task 2: DB Setup & Smoke Test

**Branch:** `feat/smoke-test`

- [ ] **Step 1: Run migrations**

  ```bash
  pnpm --filter api db:migrate
  ```
  Expected: 8 lines `✓ 001_core.sql` … `✓ 008_nav_progress.sql`.

- [ ] **Step 2: Run seed**

  ```bash
  pnpm --filter api db:seed
  ```
  Expected: magic link URL printed + "SMS queued" message.

- [ ] **Step 3: Start full stack**

  ```bash
  # Terminal 1
  pnpm dev
  # Terminal 2
  pnpm --filter api worker
  ```

- [ ] **Step 4: Test patient flow**

  Copy magic link from seed output. Open in mobile Chrome (or DevTools mobile view).
  - Magic link → spinner → `/checklist` ✓
  - Check off an item → refresh → item still checked ✓
  - Tap through navigation steps → arrives at `/waiting` ✓
  - Waiting page auto-refreshes every 60s ✓

- [ ] **Step 5: Test staff flow**

  Open `http://localhost:5174`.
  Login: `staff@medassist.test` / `StaffPassword123` → Queue page loads ✓.
  Send a broadcast → message appears on waiting page ✓.

---

## Task 3: Forms Service + Router

**Branch:** `feat/forms-api`

**Files:**
- Create: `apps/api/src/modules/forms/forms.service.ts`
- Create: `apps/api/src/modules/forms/forms.router.ts`
- Modify: `apps/api/src/modules/visit.router.ts`
- Create: `apps/api/tests/forms.test.ts`

- [ ] **Step 1: Write failing test**

  Create `apps/api/tests/forms.test.ts`:

  ```typescript
  import { describe, it, expect, beforeAll } from 'vitest';
  import request from 'supertest';
  import app from '../src/app';
  import { query } from '../src/db/db';

  let token: string;
  let formId: string;

  beforeAll(async () => {
    const { rows } = await query<{ token: string }>(
      'SELECT token FROM magic_links ORDER BY created_at DESC LIMIT 1'
    );
    token = rows[0].token;
  });

  describe('Forms API', () => {
    it('GET /forms returns a list', async () => {
      const res = await request(app).get(`/api/visit/${token}/forms`);
      expect(res.status).toBe(200);
      expect(res.body.forms).toBeInstanceOf(Array);
      expect(res.body.forms.length).toBeGreaterThan(0);
      formId = res.body.forms[0].form_id;
    });

    it('GET /forms/:id returns detail with fields', async () => {
      const res = await request(app).get(`/api/visit/${token}/forms/${formId}`);
      expect(res.status).toBe(200);
      expect(res.body.fields).toBeInstanceOf(Array);
      expect(res.body.signature_required).toBe(true);
    });

    it('PUT /forms/:id saves a draft', async () => {
      const res = await request(app)
        .put(`/api/visit/${token}/forms/${formId}`)
        .send({ field_data: { full_name: 'רועי דוידוביץ', consent_to_treatment: true } });
      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(true);
    });

    it('POST /forms/:id/signature saves signature', async () => {
      const res = await request(app)
        .post(`/api/visit/${token}/forms/${formId}/signature`)
        .send({ signature_data: 'data:image/png;base64,abc123' });
      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(true);
    });

    it('POST /forms/:id/submit submits the form', async () => {
      await request(app)
        .put(`/api/visit/${token}/forms/${formId}`)
        .send({ field_data: { full_name: 'רועי', id_number: '123456789', consent_to_treatment: true } });
      const res = await request(app)
        .post(`/api/visit/${token}/forms/${formId}/submit`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.submitted).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test — verify it fails (route not mounted)**

  ```bash
  cd apps/api && pnpm vitest run tests/forms.test.ts
  ```
  Expected: FAIL with 404.

- [ ] **Step 3: Create forms service**

  Create `apps/api/src/modules/forms/forms.service.ts`:

  ```typescript
  import { query } from '../../db/db';

  interface FieldDef {
    id: string;
    type: 'text' | 'checkbox';
    label: string;
    required: boolean;
  }

  const FORM_DEFS: Record<string, { label: string; signature_required: boolean; fields: FieldDef[] }> = {
    consent_general: {
      label: 'טופס הסכמה לטיפול',
      signature_required: true,
      fields: [
        { id: 'full_name', type: 'text', label: 'שם מלא', required: true },
        { id: 'id_number', type: 'text', label: 'מספר זהות', required: true },
        { id: 'consent_to_treatment', type: 'checkbox', label: 'אני מסכים לקבל טיפול', required: true },
        { id: 'consent_to_info_sharing', type: 'checkbox', label: 'אני מסכים לשיתוף מידע רפואי', required: false },
      ],
    },
    anesthesia_consent: {
      label: 'הסכמה להרדמה',
      signature_required: true,
      fields: [
        { id: 'allergies', type: 'text', label: 'אלרגיות ידועות (אם אין — כתוב "אין")', required: true },
        { id: 'previous_anesthesia', type: 'checkbox', label: 'עברתי הרדמה בעבר', required: false },
        { id: 'anesthesia_consent', type: 'checkbox', label: 'אני מסכים להרדמה ומבין את הסיכונים', required: true },
      ],
    },
  };

  const PROCEDURE_FORMS: Record<string, string[]> = {
    'pre-op-cardiac': ['consent_general', 'anesthesia_consent'],
  };
  const DEFAULT_FORMS = ['consent_general'];

  interface FormRow {
    id: string;
    form_type: string;
    field_data_json: Record<string, unknown>;
    signature_data: string | null;
    submitted_at: Date | null;
  }

  export async function getFormsForAppointment(appointmentId: string) {
    const { rows: [appt] } = await query<{ id: string; patient_id: string; procedure_type: string | null }>(
      'SELECT id, patient_id, procedure_type FROM appointments WHERE id = $1',
      [appointmentId]
    );
    if (!appt) throw Object.assign(new Error('appointment_not_found'), { status: 404 });

    const formTypes = PROCEDURE_FORMS[appt.procedure_type ?? ''] ?? DEFAULT_FORMS;

    const { rows: existing } = await query<{ id: string; form_type: string; submitted_at: Date | null }>(
      'SELECT id, form_type, submitted_at FROM digital_forms WHERE appointment_id = $1',
      [appointmentId]
    );
    const byType = new Map(existing.map((r) => [r.form_type, r]));

    for (const ft of formTypes) {
      if (!byType.has(ft)) {
        const { rows: [created] } = await query<{ id: string }>(
          `INSERT INTO digital_forms (patient_id, appointment_id, form_type)
           VALUES ($1, $2, $3) RETURNING id`,
          [appt.patient_id, appointmentId, ft]
        );
        byType.set(ft, { id: created.id, form_type: ft, submitted_at: null });
      }
    }

    return formTypes.map((ft) => {
      const row = byType.get(ft)!;
      const def = FORM_DEFS[ft];
      return {
        form_id: row.id,
        form_type: ft,
        label: def?.label ?? ft,
        submitted: row.submitted_at !== null,
        signature_required: def?.signature_required ?? false,
      };
    });
  }

  export async function getForm(appointmentId: string, formId: string) {
    const { rows: [form] } = await query<FormRow>(
      'SELECT id, form_type, field_data_json, signature_data, submitted_at FROM digital_forms WHERE id = $1 AND appointment_id = $2',
      [formId, appointmentId]
    );
    if (!form) throw Object.assign(new Error('form_not_found'), { status: 404 });

    const def = FORM_DEFS[form.form_type];
    if (!def) throw Object.assign(new Error('unknown_form_type'), { status: 404 });

    const saved = form.field_data_json ?? {};
    return {
      form_id: form.id,
      form_type: form.form_type,
      label: def.label,
      fields: def.fields.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        required: f.required,
        value: (saved[f.id] ?? null) as string | boolean | null,
      })),
      captured_images: [] as never[],
      signature_required: def.signature_required,
      signature_data: form.signature_data,
      submitted: form.submitted_at !== null,
    };
  }

  export async function saveFormDraft(
    appointmentId: string,
    formId: string,
    fieldData: Record<string, unknown>
  ) {
    const { rows: [row] } = await query<{ updated_at: Date }>(
      `UPDATE digital_forms SET field_data_json = $1, updated_at = NOW()
       WHERE id = $2 AND appointment_id = $3 AND submitted_at IS NULL RETURNING updated_at`,
      [JSON.stringify(fieldData), formId, appointmentId]
    );
    if (!row) throw Object.assign(new Error('form_not_found_or_submitted'), { status: 409 });
    return { saved: true, updated_at: new Date(row.updated_at).toISOString() };
  }

  export async function saveSignature(
    appointmentId: string,
    formId: string,
    signatureData: string
  ) {
    const { rowCount } = await query(
      `UPDATE digital_forms SET signature_data = $1, updated_at = NOW()
       WHERE id = $2 AND appointment_id = $3 AND submitted_at IS NULL`,
      [signatureData, formId, appointmentId]
    );
    if (!rowCount) throw Object.assign(new Error('form_not_found_or_submitted'), { status: 409 });
    return { saved: true };
  }

  export async function submitForm(appointmentId: string, formId: string) {
    const { rows: [form] } = await query<FormRow>(
      'SELECT id, form_type, field_data_json, signature_data, submitted_at FROM digital_forms WHERE id = $1 AND appointment_id = $2',
      [formId, appointmentId]
    );
    if (!form) throw Object.assign(new Error('form_not_found'), { status: 404 });
    if (form.submitted_at) throw Object.assign(new Error('already_submitted'), { status: 409 });

    const def = FORM_DEFS[form.form_type];
    if (!def) throw Object.assign(new Error('unknown_form_type'), { status: 404 });

    const data = form.field_data_json ?? {};
    const missing = def.fields
      .filter((f) => f.required && !data[f.id])
      .map((f) => f.id);
    if (missing.length > 0) {
      throw Object.assign(new Error('missing_required_fields'), { status: 422, fields: missing });
    }
    if (def.signature_required && !form.signature_data) {
      throw Object.assign(new Error('signature_required'), { status: 422 });
    }

    const { rows: [updated] } = await query<{ submitted_at: Date }>(
      `UPDATE digital_forms SET submitted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING submitted_at`,
      [formId]
    );
    return { submitted: true, submitted_at: new Date(updated.submitted_at).toISOString() };
  }
  ```

- [ ] **Step 4: Create forms router**

  Create `apps/api/src/modules/forms/forms.router.ts`:

  ```typescript
  import { Router, Request, Response, NextFunction } from 'express';
  import { z } from 'zod';
  import { requireMagicLinkToken, denyCompanionWrite } from '../../middleware/auth';
  import { getFormsForAppointment, getForm, saveFormDraft, saveSignature, submitForm } from './forms.service';

  const router = Router({ mergeParams: true });

  router.get('/', requireMagicLinkToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const forms = await getFormsForAppointment(req.magicLink!.appointmentId);
      res.json({ forms });
    } catch (err) { next(err); }
  });

  router.get('/:formId', requireMagicLinkToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const form = await getForm(req.magicLink!.appointmentId, req.params.formId);
      res.json(form);
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 404) { res.status(404).json({ error: 'form_not_found' }); return; }
      next(err);
    }
  });

  router.put(
    '/:formId',
    requireMagicLinkToken, denyCompanionWrite,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = z.object({ field_data: z.record(z.unknown()) }).safeParse(req.body);
        if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
        res.json(await saveFormDraft(req.magicLink!.appointmentId, req.params.formId, parsed.data.field_data));
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 409) { res.status(409).json({ error: 'already_submitted' }); return; }
        next(err);
      }
    }
  );

  router.post(
    '/:formId/signature',
    requireMagicLinkToken, denyCompanionWrite,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = z.object({ signature_data: z.string().min(1) }).safeParse(req.body);
        if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
        res.json(await saveSignature(req.magicLink!.appointmentId, req.params.formId, parsed.data.signature_data));
      } catch (err) { next(err); }
    }
  );

  router.post(
    '/:formId/submit',
    requireMagicLinkToken, denyCompanionWrite,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await submitForm(req.magicLink!.appointmentId, req.params.formId));
      } catch (err) {
        const e = err as { status?: number; fields?: string[] };
        if (e.status === 422) { res.status(422).json({ error: (err as Error).message, fields: e.fields }); return; }
        if (e.status === 409) { res.status(409).json({ error: 'already_submitted' }); return; }
        next(err);
      }
    }
  );

  export default router;
  ```

- [ ] **Step 5: Mount forms router in visit.router.ts**

  In `apps/api/src/modules/visit.router.ts`, add:

  ```typescript
  // Add import at top:
  import formsRouter from './forms/forms.router';

  // Add mount after waitingRouter line:
  visitRouter.use('/:token/forms', formsRouter);
  ```

- [ ] **Step 6: Run tests — all 5 should pass**

  ```bash
  cd apps/api && pnpm vitest run tests/forms.test.ts
  ```

- [ ] **Step 7: Commit and merge**

  ```bash
  git add apps/api/src/modules/forms/ apps/api/src/modules/visit.router.ts apps/api/tests/forms.test.ts
  git commit -m "feat(forms): implement Forms API (service, router, tests)"
  git checkout 001-patient-visit-companion && git merge feat/forms-api
  ```

---

## Task 4: Forms Page (Patient PWA)

**Branch:** `feat/forms-page`

**Files:**
- Modify: `apps/patient-pwa/src/pages/Forms/index.tsx`

- [ ] **Step 1: Verify react-signature-canvas is installed**

  ```bash
  cd apps/patient-pwa && pnpm list react-signature-canvas
  ```

  If missing: `pnpm add react-signature-canvas @types/react-signature-canvas`

- [ ] **Step 2: Replace the stub**

  Full replacement of `apps/patient-pwa/src/pages/Forms/index.tsx`:

  ```tsx
  import React, { useEffect, useState, useRef, useCallback } from 'react';
  import { useParams } from 'react-router-dom';
  import SignatureCanvas from 'react-signature-canvas';
  import { listForms, getForm, saveFormDraft, submitSignature, submitForm, ApiError } from '../../services/api';
  import type { FormSummary, FormDetail } from '@medassist/shared-types';

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', padding: '24px 16px', maxWidth: '480px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
    h1: { fontSize: '1.375rem', fontWeight: 700, marginBottom: 8 },
    sub: { color: '#555', marginBottom: 24, fontSize: '1rem' },
    card: { background: '#f9f9f9', borderRadius: 8, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', border: '1px solid #e0e0e0' },
    cardTitle: { fontWeight: 600, fontSize: '1.0625rem', margin: 0 },
    badge: { display: 'inline-block', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600, marginTop: 6 },
    field: { marginBottom: 16 },
    label: { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9375rem' },
    input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '1rem', boxSizing: 'border-box' },
    btn: { display: 'block', width: '100%', padding: 14, background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, fontSize: '1.0625rem', fontWeight: 600, cursor: 'pointer', minHeight: 52, marginTop: 16 },
    btnSec: { display: 'block', width: '100%', padding: 12, background: '#f1f3f4', border: '1px solid #ccc', borderRadius: 8, fontSize: '1rem', cursor: 'pointer', minHeight: 44, marginTop: 8 },
    err: { color: '#c00', fontSize: '0.9375rem', marginTop: 8 },
  } as const;

  export default function Forms() {
    const { token } = useParams<{ token: string }>();
    const [forms, setForms] = useState<FormSummary[] | null>(null);
    const [active, setActive] = useState<FormDetail | null>(null);
    const [values, setValues] = useState<Record<string, string | boolean>>({});
    const [sigSaved, setSigSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const sigRef = useRef<SignatureCanvas>(null);

    useEffect(() => {
      if (!token) return;
      listForms(token).then((r) => setForms(r.forms)).catch(() => setError('שגיאה בטעינת הטפסים'));
    }, [token]);

    const openForm = useCallback(async (formId: string) => {
      if (!token) return;
      setError(null);
      const detail = await getForm(token, formId).catch(() => null);
      if (!detail) { setError('שגיאה בטעינת הטופס'); return; }
      setActive(detail);
      const init: Record<string, string | boolean> = {};
      detail.fields.forEach((f) => { init[f.id] = f.value !== null ? f.value as string | boolean : f.type === 'checkbox' ? false : ''; });
      setValues(init);
      setSigSaved(!!detail.signature_data);
    }, [token]);

    const handleSaveSig = useCallback(async () => {
      if (!token || !active || !sigRef.current) return;
      if (sigRef.current.isEmpty()) { setError('נא לחתום לפני השמירה'); return; }
      try {
        await submitSignature(token, active.form_id, sigRef.current.toDataURL('image/png'));
        setSigSaved(true);
        setError(null);
      } catch { setError('שגיאה בשמירת החתימה'); }
    }, [token, active]);

    const handleSubmit = useCallback(async () => {
      if (!token || !active) return;
      setSubmitting(true);
      setError(null);
      try {
        await saveFormDraft(token, active.form_id, values);
        await submitForm(token, active.form_id);
        setForms((prev) => prev?.map((f) => f.form_id === active.form_id ? { ...f, submitted: true } : f) ?? null);
        setActive(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'שגיאה בשליחת הטופס');
      } finally { setSubmitting(false); }
    }, [token, active, values]);

    if (!active) {
      return (
        <div style={s.page}>
          <h1 style={s.h1}>טפסים רפואיים</h1>
          <p style={s.sub}>נא למלא ולחתום על כל הטפסים לפני הביקור</p>
          {error && <p style={s.err}>{error}</p>}
          {!forms ? <p style={{ color: '#555' }}>טוען...</p> : forms.map((f) => (
            <div key={f.form_id} style={s.card} onClick={() => !f.submitted && openForm(f.form_id)}>
              <p style={s.cardTitle}>{f.label}</p>
              <span style={{ ...s.badge, background: f.submitted ? '#d4edda' : '#fff3cd', color: f.submitted ? '#155724' : '#856404' }}>
                {f.submitted ? '✅ הושלם' : '⬜ ממתין למילוי'}
              </span>
            </div>
          ))}
          {forms?.length > 0 && forms.every((f) => f.submitted) && (
            <p style={{ color: '#28a745', fontWeight: 600, textAlign: 'center', marginTop: 24 }}>✅ כל הטפסים הושלמו!</p>
          )}
        </div>
      );
    }

    return (
      <div style={s.page}>
        <button style={{ ...s.btnSec, width: 'auto', marginBottom: 16 }} onClick={() => setActive(null)}>← חזרה</button>
        <h2 style={s.h1}>{active.label}</h2>
        {error && <p style={s.err}>{error}</p>}

        {active.fields.map((field) => (
          <div key={field.id} style={s.field}>
            {field.type === 'checkbox' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={values[field.id] as boolean ?? false}
                  onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.checked }))}
                  style={{ width: 22, height: 22, accentColor: '#1a73e8' }}
                />
                <span style={{ fontSize: '1rem' }}>{field.label}{field.required && <span style={{ color: '#c00' }}> *</span>}</span>
              </label>
            ) : (
              <>
                <label style={s.label}>{field.label}{field.required && <span style={{ color: '#c00' }}> *</span>}</label>
                <input
                  type="text"
                  value={values[field.id] as string ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  style={s.input as React.CSSProperties}
                />
              </>
            )}
          </div>
        ))}

        {active.signature_required && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>חתימה *</p>
            {sigSaved ? (
              <p style={{ color: '#28a745' }}>✅ החתימה נשמרה</p>
            ) : (
              <>
                <div style={{ border: '1.5px solid #d1d5db', borderRadius: 8, background: '#fff' }}>
                  <SignatureCanvas ref={sigRef} canvasProps={{ width: 380, height: 140 }} />
                </div>
                <button style={s.btnSec} onClick={() => sigRef.current?.clear()}>נקה חתימה</button>
                <button style={s.btn} onClick={handleSaveSig}>שמור חתימה</button>
              </>
            )}
          </div>
        )}

        <button
          style={{ ...s.btn, background: submitting ? '#888' : '#1a73e8' } as React.CSSProperties}
          onClick={handleSubmit}
          disabled={submitting || (active.signature_required && !sigSaved)}
        >
          {submitting ? 'שולח...' : 'שלח טופס'}
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 3: Test in browser**

  Navigate to `http://localhost:5173/visit/<TOKEN>/forms`.
  - Form list shows two forms with pending status
  - Open consent form → fill fields → draw signature → save sig → submit → ✅
  - Return to list → form shows as completed

- [ ] **Step 4: Commit and merge**

  ```bash
  git add apps/patient-pwa/src/pages/Forms/index.tsx
  git commit -m "feat(patient-pwa): implement Forms page with fields and signature"
  git checkout 001-patient-visit-companion && git merge feat/forms-page
  ```

---

## Task 5: PDF Export

**Branch:** `feat/pdf-export`

**Files:**
- Create: `apps/api/src/modules/pdf/pdf.service.ts`
- Modify: `apps/api/src/modules/staff/stations.router.ts` (add export endpoint)

- [ ] **Step 1: Install pdfkit**

  ```bash
  cd apps/api && pnpm add pdfkit && pnpm add -D @types/pdfkit
  ```

- [ ] **Step 2: Create PDF service**

  Create `apps/api/src/modules/pdf/pdf.service.ts`:

  ```typescript
  import PDFDocument from 'pdfkit';
  import { query } from '../../db/db';

  export async function generateAppointmentPDF(appointmentId: string): Promise<Buffer> {
    const { rows: [info] } = await query<{
      patient_name: string; procedure_type: string | null;
      department_name: string; visit_datetime: Date | null;
    }>(`
      SELECT p.name AS patient_name, a.procedure_type,
             d.name AS department_name, a.visit_datetime
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN departments d ON d.id = a.department_id
      WHERE a.id = $1
    `, [appointmentId]);

    if (!info) throw Object.assign(new Error('appointment_not_found'), { status: 404 });

    const { rows: forms } = await query<{
      form_type: string; field_data_json: Record<string, unknown>;
      signature_data: string | null; submitted_at: Date | null;
    }>(
      `SELECT form_type, field_data_json, signature_data, submitted_at
       FROM digital_forms WHERE appointment_id = $1 AND submitted_at IS NOT NULL
       ORDER BY submitted_at ASC`,
      [appointmentId]
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('MedAssist — סיכום ביקור', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12)
        .text(`מטופל: ${info.patient_name}`, { align: 'right' })
        .text(`מחלקה: ${info.department_name}`, { align: 'right' });
      if (info.visit_datetime) {
        doc.text(`תאריך: ${new Date(info.visit_datetime).toLocaleDateString('he-IL')}`, { align: 'right' });
      }
      doc.text(`הופק: ${new Date().toLocaleDateString('he-IL')}`, { align: 'right' });

      if (forms.length === 0) {
        doc.moveDown().fontSize(12).text('לא הוגשו טפסים.', { align: 'right' });
      }

      for (const form of forms) {
        doc.addPage();
        doc.fontSize(16).text(`טופס: ${form.form_type}`, { align: 'right' });
        if (form.submitted_at) {
          doc.fontSize(10).text(`הוגש: ${new Date(form.submitted_at).toLocaleString('he-IL')}`, { align: 'right' });
        }
        doc.moveDown(0.5);
        for (const [key, val] of Object.entries(form.field_data_json ?? {})) {
          doc.fontSize(11).text(`${key}: ${String(val ?? '')}`, { align: 'right' });
        }
        if (form.signature_data) {
          doc.moveDown(0.5).text('✓ חתימה מצורפת', { align: 'right' });
        }
      }

      doc.end();
    });
  }
  ```

- [ ] **Step 3: Add export endpoint to stations.router.ts**

  Open `apps/api/src/modules/staff/stations.router.ts`. Add at the top (with existing imports):

  ```typescript
  import { generateAppointmentPDF } from '../pdf/pdf.service';
  ```

  Add before `export default router`:

  ```typescript
  /** POST /api/staff/patients/:appointmentId/export-pdf */
  router.post(
    '/:appointmentId/export-pdf',
    requireStaffAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const pdf = await generateAppointmentPDF(req.params.appointmentId);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="visit-${req.params.appointmentId}.pdf"`,
          'Content-Length': String(pdf.length),
        });
        res.send(pdf);
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
        next(err);
      }
    }
  );
  ```

- [ ] **Step 4: Test PDF endpoint manually**

  ```bash
  # Get appointment ID
  psql $DATABASE_URL -c "SELECT id FROM appointments LIMIT 1"

  # Download PDF (replace values)
  curl -X POST http://localhost:3000/api/staff/patients/<APPT_ID>/export-pdf \
    -H "Cookie: med_session=<JWT>" \
    --output /tmp/test.pdf

  # Open PDF
  start /tmp/test.pdf
  ```

  Expected: a valid PDF opens with patient name and department.

- [ ] **Step 5: Commit and merge**

  ```bash
  git add apps/api/src/modules/pdf/ apps/api/src/modules/staff/stations.router.ts
  git commit -m "feat(pdf): add PDF export endpoint for submitted forms"
  git checkout 001-patient-visit-companion && git merge feat/pdf-export
  ```

---

## Task 6: Admin API

**Branch:** `feat/admin-api`

**Files:**
- Create: `apps/api/src/modules/admin/admin.service.ts`
- Create: `apps/api/src/modules/admin/admin.router.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/tests/admin.test.ts`

- [ ] **Step 1: Write failing test**

  Create `apps/api/tests/admin.test.ts`:

  ```typescript
  import { describe, it, expect, beforeAll } from 'vitest';
  import request from 'supertest';
  import app from '../src/app';
  import { query } from '../src/db/db';
  import jwt from 'jsonwebtoken';

  let adminCookie: string;

  beforeAll(async () => {
    const { rows: [admin] } = await query<{ id: string; role: string; department_id: string | null }>(
      "SELECT id, role, department_id FROM staff_users WHERE role = 'admin' LIMIT 1"
    );
    const token = jwt.sign(
      { sub: admin.id, role: admin.role, departmentId: admin.department_id, email: 'admin@test' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    adminCookie = `med_session=${token}`;
  });

  describe('Admin API', () => {
    it('GET /api/admin/routes returns routes list', async () => {
      const res = await request(app).get('/api/admin/routes').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.routes).toBeInstanceOf(Array);
    });

    it('GET /api/admin/checklists returns templates', async () => {
      const res = await request(app).get('/api/admin/checklists').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.templates).toBeInstanceOf(Array);
    });

    it('GET /api/admin/staff returns staff list', async () => {
      const res = await request(app).get('/api/admin/staff').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.staff).toBeInstanceOf(Array);
      expect(res.body.staff.length).toBeGreaterThan(0);
    });

    it('GET /api/admin/routes returns 403 for non-admin', async () => {
      const { rows: [staff] } = await query<{ id: string; department_id: string | null }>(
        "SELECT id, department_id FROM staff_users WHERE role = 'staff' LIMIT 1"
      );
      const token = jwt.sign(
        { sub: staff.id, role: 'staff', departmentId: staff.department_id, email: 'staff@test' },
        process.env.JWT_SECRET!, { expiresIn: '1h' }
      );
      const res = await request(app)
        .get('/api/admin/routes')
        .set('Cookie', `med_session=${token}`);
      expect(res.status).toBe(403);
    });
  });
  ```

- [ ] **Step 2: Run test — verify it fails (route not mounted)**

  ```bash
  cd apps/api && pnpm vitest run tests/admin.test.ts
  ```
  Expected: FAIL with 404.

- [ ] **Step 3: Create admin service**

  Create `apps/api/src/modules/admin/admin.service.ts`:

  ```typescript
  import { query } from '../../db/db';

  export async function listNavigationRoutes() {
    const { rows } = await query<{ id: string; name: string; department_id: string; steps_count: number }>(
      'SELECT id, name, department_id, steps_count FROM navigation_routes ORDER BY name ASC'
    );
    return rows.map((r) => ({
      route_id: r.id,
      name: r.name,
      department_id: r.department_id,
      steps_count: r.steps_count,
    }));
  }

  export async function listChecklistTemplates() {
    const { rows } = await query<{ id: string; procedure_type: string; items_json: Array<unknown> }>(
      'SELECT id, procedure_type, items_json FROM checklist_templates ORDER BY procedure_type ASC'
    );
    return rows.map((r) => ({
      template_id: r.id,
      procedure_type: r.procedure_type,
      item_count: Array.isArray(r.items_json) ? r.items_json.length : 0,
    }));
  }

  export async function listStaffUsers(departmentId?: string) {
    const base = `
      SELECT su.id, su.name, su.email, su.role, su.department_id,
             d.name AS department_name, su.is_active, su.last_active_at, su.created_at
      FROM staff_users su LEFT JOIN departments d ON d.id = su.department_id
    `;
    const { rows } = departmentId
      ? await query(`${base} WHERE su.department_id = $1 ORDER BY su.name ASC`, [departmentId])
      : await query(`${base} ORDER BY su.name ASC`);

    return rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, role: r.role,
      department_id: r.department_id,
      department_name: r.department_name ?? undefined,
      is_active: r.is_active,
      last_active_at: r.last_active_at ? new Date(r.last_active_at).toISOString() : null,
      created_at: new Date(r.created_at).toISOString(),
    }));
  }
  ```

- [ ] **Step 4: Create admin router**

  Create `apps/api/src/modules/admin/admin.router.ts`:

  ```typescript
  import { Router, Request, Response, NextFunction } from 'express';
  import { requireStaffAuth, requireAdmin } from '../../middleware/auth';
  import { listNavigationRoutes, listChecklistTemplates, listStaffUsers } from './admin.service';

  const router = Router();

  router.get('/routes', requireStaffAuth, requireAdmin,
    async (_req: Request, res: Response, next: NextFunction) => {
      try { res.json({ routes: await listNavigationRoutes() }); } catch (err) { next(err); }
    }
  );

  router.get('/checklists', requireStaffAuth, requireAdmin,
    async (_req: Request, res: Response, next: NextFunction) => {
      try { res.json({ templates: await listChecklistTemplates() }); } catch (err) { next(err); }
    }
  );

  router.get('/staff', requireStaffAuth, requireAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json({ staff: await listStaffUsers(req.query.department_id as string | undefined) });
      } catch (err) { next(err); }
    }
  );

  export default router;
  ```

- [ ] **Step 5: Mount admin router in app.ts**

  In `apps/api/src/app.ts`, add:

  ```typescript
  // Add import at top with other router imports:
  import adminRouter from './modules/admin/admin.router';

  // Add mount after existing app.use('/api/staff', ...) lines:
  app.use('/api/admin', adminRouter);
  ```

- [ ] **Step 6: Run tests — all 4 should pass**

  ```bash
  cd apps/api && pnpm vitest run tests/admin.test.ts
  ```

- [ ] **Step 7: Commit and merge**

  ```bash
  git add apps/api/src/modules/admin/ apps/api/src/app.ts apps/api/tests/admin.test.ts
  git commit -m "feat(admin): implement Admin API (service, router, tests)"
  git checkout 001-patient-visit-companion && git merge feat/admin-api
  ```

---

## Task 7: PatientDetail Page

**Branch:** `feat/patient-detail-page`

**Files:**
- Modify: `apps/staff-backoffice/src/pages/PatientDetail/index.tsx`

- [ ] **Step 1: Replace the stub**

  Full replacement of `apps/staff-backoffice/src/pages/PatientDetail/index.tsx`:

  ```tsx
  import React, { useEffect, useState } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { getQueue, markStationComplete } from '../../services/api';
  import type { QueuePatient } from '@medassist/shared-types';

  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  export default function PatientDetail() {
    const { appointmentId } = useParams<{ appointmentId: string }>();
    const navigate = useNavigate();
    const [patient, setPatient] = useState<QueuePatient | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
      if (!appointmentId) return;
      getQueue()
        .then((q) => {
          const found = q.patients.find((p) => p.appointment_id === appointmentId);
          if (found) setPatient(found);
          else setError('מטופל לא נמצא בתור');
        })
        .catch(() => setError('שגיאה בטעינת הפרטים'));
    }, [appointmentId]);

    async function handleStationComplete(stationId: string) {
      if (!appointmentId) return;
      await markStationComplete(appointmentId, stationId);
      setPatient((prev) =>
        prev
          ? { ...prev, stations: prev.stations.map((s) => s.station_id === stationId ? { ...s, status: 'complete' } : s) }
          : prev
      );
    }

    async function handleExportPDF() {
      if (!appointmentId) return;
      setDownloading(true);
      try {
        const res = await fetch(`${API_BASE}/api/staff/patients/${appointmentId}/export-pdf`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `visit-${appointmentId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch { setError('שגיאה בהפקת PDF'); }
      finally { setDownloading(false); }
    }

    const s: Record<string, React.CSSProperties> = {
      page: { minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', direction: 'rtl' },
      header: { background: '#1a56db', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 },
      backBtn: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
      body: { padding: 24, maxWidth: 700, margin: '0 auto' },
      card: { background: '#fff', borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
      cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 12, marginTop: 0 },
      row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' },
      completeBtn: { padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
      pdfBtn: { padding: '10px 20px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
    };

    if (error) return <div style={s.page}><div style={s.body}><p style={{ color: '#c00' }}>{error}</p></div></div>;
    if (!patient) return <div style={s.page}><div style={s.body}><p>טוען...</p></div></div>;

    return (
      <div style={s.page}>
        <header style={s.header}>
          <button style={s.backBtn} onClick={() => navigate('/queue')}>→ חזרה</button>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{patient.patient_name}</span>
        </header>
        <div style={s.body}>
          <div style={s.card}>
            <p style={s.cardTitle}>מידע כללי</p>
            <p>סטטוס: <strong>{patient.status}</strong></p>
            <p>המתין: {patient.minutes_waiting} דקות</p>
            <p>טפסים: {patient.forms_submitted}/{patient.forms_total} הוגשו</p>
          </div>

          {patient.stations.length > 0 && (
            <div style={s.card}>
              <p style={s.cardTitle}>עמדות</p>
              {patient.stations.map((st) => (
                <div key={st.station_id} style={s.row}>
                  <span>{st.order_index}. {st.department}</span>
                  {st.status === 'complete'
                    ? <span style={{ color: '#10b981', fontWeight: 600 }}>✓ הושלם</span>
                    : <button style={s.completeBtn} onClick={() => handleStationComplete(st.station_id)}>סמן כהושלם</button>
                  }
                </div>
              ))}
            </div>
          )}

          <div style={s.card}>
            <p style={s.cardTitle}>ייצוא מסמכים</p>
            <button style={s.pdfBtn} onClick={handleExportPDF} disabled={downloading}>
              {downloading ? 'מוריד...' : '📄 הורד PDF'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Test in browser**

  Login as staff → Queue → click "פרטים →" on a patient.
  Verify: detail page loads, station management works, PDF downloads.

- [ ] **Step 3: Commit and merge**

  ```bash
  git add apps/staff-backoffice/src/pages/PatientDetail/index.tsx
  git commit -m "feat(staff-backoffice): implement PatientDetail page"
  git checkout 001-patient-visit-companion && git merge feat/patient-detail-page
  ```

---

## Task 8: Admin Page

**Branch:** `feat/admin-page`

**Files:**
- Modify: `apps/staff-backoffice/src/pages/Admin/index.tsx`

- [ ] **Step 1: Replace the stub**

  Full replacement of `apps/staff-backoffice/src/pages/Admin/index.tsx`:

  ```tsx
  import React, { useEffect, useState } from 'react';
  import { listRoutes, listChecklists, listStaff } from '../../services/api';
  import type { AdminRoute, ChecklistTemplate, StaffUser } from '@medassist/shared-types';

  type Tab = 'staff' | 'routes' | 'checklists';

  export default function Admin() {
    const [tab, setTab] = useState<Tab>('staff');
    const [staff, setStaff] = useState<StaffUser[] | null>(null);
    const [routes, setRoutes] = useState<AdminRoute[] | null>(null);
    const [checklists, setChecklists] = useState<ChecklistTemplate[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setError(null);
      if (tab === 'staff' && !staff) listStaff().then((r) => setStaff(r.staff)).catch(() => setError('שגיאה'));
      if (tab === 'routes' && !routes) listRoutes().then((r) => setRoutes(r.routes)).catch(() => setError('שגיאה'));
      if (tab === 'checklists' && !checklists) listChecklists().then((r) => setChecklists(r.templates)).catch(() => setError('שגיאה'));
    }, [tab]);

    const s: Record<string, React.CSSProperties> = {
      page: { minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', direction: 'rtl' },
      header: { background: '#1a56db', color: '#fff', padding: '16px 24px' },
      title: { margin: 0, fontSize: 20, fontWeight: 700 },
      tabs: { display: 'flex', borderBottom: '2px solid #e5e7eb', padding: '0 24px', background: '#fff' },
      tab: { padding: '12px 20px', cursor: 'pointer', border: 'none', background: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', borderBottom: '2px solid transparent', marginBottom: -2 },
      activeTab: { color: '#1a56db', borderBottom: '2px solid #1a56db' },
      body: { padding: 24, maxWidth: 800, margin: '0 auto' },
      table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
      th: { background: '#f3f4f6', padding: '10px 16px', textAlign: 'right', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e5e7eb' },
      td: { padding: '10px 16px', fontSize: 14, borderBottom: '1px solid #f0f0f0' },
    } as const;

    const tabStyle = (t: Tab): React.CSSProperties => ({ ...s.tab, ...(tab === t ? s.activeTab : {}) });

    return (
      <div style={s.page}>
        <header style={s.header}><h1 style={s.title}>ניהול מערכת</h1></header>
        <div style={s.tabs}>
          {(['staff', 'routes', 'checklists'] as Tab[]).map((t) => (
            <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
              {t === 'staff' ? 'צוות' : t === 'routes' ? 'מסלולי ניווט' : 'רשימות הכנה'}
            </button>
          ))}
        </div>
        <div style={s.body}>
          {error && <p style={{ color: '#c00' }}>{error}</p>}

          {tab === 'staff' && (!staff ? <p>טוען...</p> : (
            <table style={s.table as React.CSSProperties}>
              <thead><tr>
                <th style={s.th as React.CSSProperties}>שם</th>
                <th style={s.th as React.CSSProperties}>אימייל</th>
                <th style={s.th as React.CSSProperties}>תפקיד</th>
                <th style={s.th as React.CSSProperties}>מחלקה</th>
              </tr></thead>
              <tbody>{staff.map((u) => (
                <tr key={u.id}>
                  <td style={s.td as React.CSSProperties}>{u.name}</td>
                  <td style={s.td as React.CSSProperties}>{u.email}</td>
                  <td style={s.td as React.CSSProperties}>{u.role === 'admin' ? 'מנהל' : 'צוות'}</td>
                  <td style={s.td as React.CSSProperties}>{u.department_name ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}

          {tab === 'routes' && (!routes ? <p>טוען...</p> : (
            <table style={s.table as React.CSSProperties}>
              <thead><tr>
                <th style={s.th as React.CSSProperties}>שם מסלול</th>
                <th style={s.th as React.CSSProperties}>שלבים</th>
              </tr></thead>
              <tbody>{routes.map((r) => (
                <tr key={r.route_id}>
                  <td style={s.td as React.CSSProperties}>{r.name}</td>
                  <td style={s.td as React.CSSProperties}>{r.steps_count}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}

          {tab === 'checklists' && (!checklists ? <p>טוען...</p> : (
            <table style={s.table as React.CSSProperties}>
              <thead><tr>
                <th style={s.th as React.CSSProperties}>סוג פרוצדורה</th>
                <th style={s.th as React.CSSProperties}>פריטים</th>
              </tr></thead>
              <tbody>{checklists.map((t) => (
                <tr key={t.template_id}>
                  <td style={s.td as React.CSSProperties}>{t.procedure_type}</td>
                  <td style={s.td as React.CSSProperties}>{t.item_count}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Test in browser**

  Login as `admin@medassist.test` / `AdminPassword123` → navigate to `/admin`.
  Verify: three tabs load with data (staff list, navigation routes, checklist templates).

- [ ] **Step 3: Commit and merge**

  ```bash
  git add apps/staff-backoffice/src/pages/Admin/index.tsx
  git commit -m "feat(staff-backoffice): implement Admin page with staff/routes/checklists tabs"
  git checkout 001-patient-visit-companion && git merge feat/admin-page
  ```

---

## Final End-to-End Checklist

Run all tests then walk every flow manually:

```bash
pnpm test
```

- [ ] All API tests pass (`forms.test.ts`, `admin.test.ts`)
- [ ] `db:seed` → Telegram message received ✓
- [ ] Magic link → checklist → check items → persist on refresh ✓
- [ ] Checklist → navigation → step through → arrive at waiting ✓
- [ ] Waiting screen auto-refreshes; shows broadcast from staff ✓
- [ ] Forms → fill fields → sign → submit ✓
- [ ] Staff login → queue → broadcast → status update ✓
- [ ] Staff PatientDetail → station management → PDF download ✓
- [ ] Admin login → admin page → staff/routes/checklists visible ✓
