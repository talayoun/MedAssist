import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { query, withTransaction } from '../../db/db';
import { presignGet, uploadEncrypted } from '../../services/s3';
import type { PoolClient } from 'pg';
import type { StaffAuthContext } from '@medassist/shared-types';

const MAX_IMAGE_BYTES = 200 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ─── Staff auth helpers ───────────────────────────────────────────────────────

export async function verifyAppointmentDept(
  appointmentId: string,
  ctx: StaffAuthContext,
): Promise<void> {
  if (ctx.role === 'admin') return;
  const { rows } = await query(
    `SELECT department_id FROM appointments WHERE id = $1`,
    [appointmentId],
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  if (rows[0].department_id !== ctx.departmentId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function hydrateItem(row: Record<string, unknown>) {
  return {
    ...row,
    staff_file_url:            await presignGet(row.staff_file_url as string | null),
    patient_file_url:          await presignGet(row.patient_file_url as string | null),
    patient_file_download_url: await presignGet(row.patient_file_url as string | null, 900, 'attachment'),
  };
}

async function verifyOwnershipTx(
  client: PoolClient,
  itemId: string,
  appointmentId: string,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT id FROM patient_form_items
     WHERE id = $1 AND appointment_id = $2
     FOR UPDATE`,
    [itemId, appointmentId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

async function compressImage(buffer: Buffer): Promise<{ data: Buffer; mime: string }> {
  let out = await sharp(buffer)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  if (out.length > MAX_IMAGE_BYTES) {
    const quality = Math.max(20, Math.floor(80 * MAX_IMAGE_BYTES / out.length));
    out = await sharp(out).jpeg({ quality }).toBuffer();
  }

  return { data: out, mime: 'image/jpeg' };
}

// ─── Patient-facing ──────────────────────────────────────────────────────────

export async function listForAppointment(appointmentId: string) {
  const { rows } = await query(
    `SELECT
       pfi.id,
       pfi.label,
       pfi.item_type,
       pfi.status,
       pfi.required,
       pfi.order_index,
       pfi.staff_file_url,
       pd.file_url          AS patient_file_url,
       pd.submitted_at      AS patient_submitted_at
     FROM patient_form_items pfi
     LEFT JOIN patient_documents pd
       ON pd.patient_form_item_id = pfi.id AND pd.is_current = true
     WHERE pfi.appointment_id = $1
     ORDER BY pfi.order_index`,
    [appointmentId],
  );
  return Promise.all(rows.map(hydrateItem));
}

export async function uploadPatientImage(
  itemId: string,
  appointmentId: string,
  buffer: Buffer,
  _mime: string,
): Promise<Record<string, unknown>> {
  // Quick IDOR check before expensive compression
  const { rows: ownerCheck } = await query(
    `SELECT id FROM patient_form_items WHERE id = $1 AND appointment_id = $2`,
    [itemId, appointmentId],
  );
  if (!ownerCheck[0]) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const { data: compressed, mime } = await compressImage(buffer);
  const ts = Date.now();
  const key = `forms/appointments/${appointmentId}/images/${ts}-${randomUUID()}.jpg`;

  let updatedRow: Record<string, unknown> = {};

  await withTransaction(async (client) => {
    await verifyOwnershipTx(client, itemId, appointmentId);

    await client.query(
      `UPDATE patient_documents SET is_current = false
       WHERE patient_form_item_id = $1 AND is_current = true`,
      [itemId],
    );

    await client.query(
      `INSERT INTO patient_documents
         (appointment_id, patient_form_item_id, file_url, doc_type, uploaded_by_patient, is_current)
       VALUES ($1, $2, $3, 'image_upload', true, true)`,
      [appointmentId, itemId, key],
    );

    const { rows } = await client.query(
      `UPDATE patient_form_items
       SET status = 'patient_submitted', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [itemId],
    );
    updatedRow = rows[0];

    await uploadEncrypted(key, compressed, mime);
  });

  return updatedRow;
}

export async function submitSignature(
  itemId: string,
  appointmentId: string,
  base64Data: string,
): Promise<Record<string, unknown>> {
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length > 100 * 1024) {
    throw Object.assign(new Error('Signature too large'), { status: 413 });
  }
  if (!buffer.slice(0, 8).equals(PNG_MAGIC)) {
    throw Object.assign(new Error('Invalid PNG data'), { status: 415 });
  }

  const ts = Date.now();
  const key = `forms/appointments/${appointmentId}/signatures/${ts}.png`;

  let updatedRow: Record<string, unknown> = {};

  await withTransaction(async (client) => {
    await verifyOwnershipTx(client, itemId, appointmentId);

    const { rows: itemRows } = await client.query(
      `SELECT status, item_type FROM patient_form_items WHERE id = $1`,
      [itemId],
    );
    const item = itemRows[0];
    if (item.item_type !== 'staff_upload_sign' || item.status !== 'staff_uploaded') {
      throw Object.assign(
        new Error('ממתין להעלאת מסמך מהצוות'),
        { status: 409 },
      );
    }

    await client.query(
      `UPDATE patient_documents SET is_current = false
       WHERE patient_form_item_id = $1 AND is_current = true`,
      [itemId],
    );

    await client.query(
      `INSERT INTO patient_documents
         (appointment_id, patient_form_item_id, file_url, doc_type, uploaded_by_patient, is_current)
       VALUES ($1, $2, $3, 'signature', true, true)`,
      [appointmentId, itemId, key],
    );

    const { rows } = await client.query(
      `UPDATE patient_form_items
       SET status = 'patient_submitted', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [itemId],
    );
    updatedRow = rows[0];

    await uploadEncrypted(key, buffer, 'image/png');
  });

  return updatedRow;
}

// ─── Staff-facing ────────────────────────────────────────────────────────────

export async function staffUploadConsent(
  itemId: string,
  appointmentId: string,
  buffer: Buffer,
  mime: string,
  staffId: string,
  ctx: StaffAuthContext,
): Promise<Record<string, unknown>> {
  await verifyAppointmentDept(appointmentId, ctx);
  const key = `forms/appointments/${appointmentId}/consent/${itemId}.pdf`;

  let updatedRow: Record<string, unknown> = {};

  await withTransaction(async (client) => {
    const { rows: check } = await client.query(
      `SELECT id FROM patient_form_items
       WHERE id = $1 AND appointment_id = $2 AND item_type = 'staff_upload_sign'
       FOR UPDATE`,
      [itemId, appointmentId],
    );
    if (!check[0]) {
      throw Object.assign(new Error('Not found'), { status: 404 });
    }

    const { rows } = await client.query(
      `UPDATE patient_form_items
       SET staff_file_url = $1, staff_id = $2, status = 'staff_uploaded', updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [key, staffId, itemId],
    );
    updatedRow = rows[0];

    await uploadEncrypted(key, buffer, mime, 'inline');
  });

  return hydrateItem(updatedRow);
}

export async function getStaffSummary(appointmentId: string, ctx: StaffAuthContext) {
  await verifyAppointmentDept(appointmentId, ctx);
  const [itemsResult, exportResult] = await Promise.all([
    query(
      `SELECT
         pfi.id,
         pfi.label,
         pfi.item_type,
         pfi.status,
         pfi.required,
         pfi.order_index,
         pfi.staff_file_url,
         pd.file_url          AS patient_file_url,
         pd.submitted_at      AS patient_submitted_at
       FROM patient_form_items pfi
       LEFT JOIN patient_documents pd
         ON pd.patient_form_item_id = pfi.id AND pd.is_current = true
       WHERE pfi.appointment_id = $1
       ORDER BY pfi.order_index`,
      [appointmentId],
    ),
    query(
      `SELECT pdf_key, generated_at, item_count
       FROM patient_pdf_exports
       WHERE appointment_id = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
      [appointmentId],
    ),
  ]);

  const items = await Promise.all(itemsResult.rows.map(hydrateItem));

  const latestExport = exportResult.rows[0] ?? null;
  let newSinceLastExport = 0;
  if (latestExport) {
    const { rows: newRows } = await query(
      `SELECT COUNT(*)::int AS cnt
       FROM patient_form_items
       WHERE appointment_id = $1
         AND status = 'patient_submitted'
         AND updated_at > $2`,
      [appointmentId, latestExport.generated_at],
    );
    newSinceLastExport = newRows[0].cnt;
  } else {
    const { rows: allRows } = await query(
      `SELECT COUNT(*)::int AS cnt
       FROM patient_form_items
       WHERE appointment_id = $1 AND status = 'patient_submitted'`,
      [appointmentId],
    );
    newSinceLastExport = allRows[0].cnt;
  }

  return {
    items,
    latest_export: latestExport
      ? {
          pdf_url:      await presignGet(latestExport.pdf_key),
          generated_at: latestExport.generated_at,
          item_count:   latestExport.item_count,
        }
      : null,
    new_since_last_export: newSinceLastExport,
  };
}
