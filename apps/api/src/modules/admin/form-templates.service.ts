import { query, withTransaction } from '../../db/db';
import { presignGet, uploadEncrypted } from '../../services/s3';

export interface CreateTemplateItemInput {
  procedure_type?: string | null;
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

async function hydrateUrl(row: Record<string, unknown>) {
  return {
    ...row,
    blank_form_url: await presignGet(row.blank_form_url as string | null),
  };
}

export async function listTemplateItems() {
  const { rows } = await query(
    `SELECT * FROM form_template_items WHERE is_active = true ORDER BY procedure_type NULLS FIRST, order_index`,
  );
  return Promise.all(rows.map(hydrateUrl));
}

export async function createTemplateItem(input: CreateTemplateItemInput) {
  const { rows } = await query(
    `INSERT INTO form_template_items (procedure_type, label, item_type, required, order_index)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.procedure_type ?? null, input.label, input.item_type, input.required, input.order_index],
  );
  return hydrateUrl(rows[0]);
}

export async function patchTemplateItem(id: string, input: PatchTemplateItemInput) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.label       !== undefined) { fields.push(`label = $${i++}`);       values.push(input.label); }
  if (input.required    !== undefined) { fields.push(`required = $${i++}`);    values.push(input.required); }
  if (input.order_index !== undefined) { fields.push(`order_index = $${i++}`); values.push(input.order_index); }
  if (input.is_active   !== undefined) { fields.push(`is_active = $${i++}`);   values.push(input.is_active); }
  if (fields.length === 0) {
    const err = Object.assign(new Error('No fields to update'), { status: 400 });
    throw err;
  }
  values.push(id);
  const { rows } = await query(
    `UPDATE form_template_items SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  return hydrateUrl(rows[0]);
}

export async function softDeleteTemplateItem(id: string) {
  const { rows } = await query(
    `UPDATE form_template_items SET is_active = false WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
}

export async function uploadBlankForm(id: string, buffer: Buffer, contentType: string) {
  const key = `forms/templates/${id}/blank.pdf`;
  await uploadEncrypted(key, buffer, contentType, 'inline');
  const { rows } = await query(
    `UPDATE form_template_items SET blank_form_url = $1 WHERE id = $2 RETURNING *`,
    [key, id],
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  return hydrateUrl(rows[0]);
}

export async function deleteBlankForm(id: string) {
  const { rows } = await query(
    `UPDATE form_template_items SET blank_form_url = NULL WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
}
