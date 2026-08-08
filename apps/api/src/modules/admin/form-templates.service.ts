import { query, withTransaction } from '../../db/db';
import { presignGet, uploadEncrypted, deleteObject } from '../../services/s3';

type FormItemType = 'patient_upload' | 'staff_upload_sign' | 'text_field' | 'yes_no_list' | 'consent';
type FormSection = 'personal' | 'medical' | 'financial' | 'documents' | 'consent';

export interface CreateTemplateItemInput {
  procedure_type?: string | null;
  label: string;
  item_type: FormItemType;
  required: boolean;
  order_index: number;
  section?: FormSection;
  sub_label?: string | null;
  placeholder?: string | null;
  list_item_placeholder?: string | null;
}

export interface PatchTemplateItemInput {
  label?: string;
  required?: boolean;
  order_index?: number;
  is_active?: boolean;
  section?: FormSection;
  sub_label?: string | null;
  placeholder?: string | null;
  list_item_placeholder?: string | null;
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
    `INSERT INTO form_template_items
       (procedure_type, label, item_type, required, order_index, section, sub_label, placeholder, list_item_placeholder)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.procedure_type ?? null, input.label, input.item_type, input.required, input.order_index,
      input.section ?? 'documents', input.sub_label ?? null, input.placeholder ?? null, input.list_item_placeholder ?? null,
    ],
  );
  return hydrateUrl(rows[0]);
}

export async function patchTemplateItem(id: string, input: PatchTemplateItemInput) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.label                  !== undefined) { fields.push(`label = $${i++}`);                  values.push(input.label); }
  if (input.required               !== undefined) { fields.push(`required = $${i++}`);               values.push(input.required); }
  if (input.order_index            !== undefined) { fields.push(`order_index = $${i++}`);            values.push(input.order_index); }
  if (input.is_active              !== undefined) { fields.push(`is_active = $${i++}`);              values.push(input.is_active); }
  if (input.section                !== undefined) { fields.push(`section = $${i++}`);                values.push(input.section); }
  if (input.sub_label              !== undefined) { fields.push(`sub_label = $${i++}`);              values.push(input.sub_label); }
  if (input.placeholder            !== undefined) { fields.push(`placeholder = $${i++}`);            values.push(input.placeholder); }
  if (input.list_item_placeholder  !== undefined) { fields.push(`list_item_placeholder = $${i++}`);  values.push(input.list_item_placeholder); }
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
  const { rows: existing } = await query<{ is_protected: boolean }>(
    `SELECT is_protected FROM form_template_items WHERE id = $1`,
    [id],
  );
  if (!existing[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  if (existing[0].is_protected) {
    throw Object.assign(new Error('פריט מערכת מוגן. לא ניתן למחוק.'), { status: 409 });
  }
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
  const { rows: existing } = await query(
    `SELECT blank_form_url FROM form_template_items WHERE id = $1`,
    [id],
  );
  if (!existing[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  await query(`UPDATE form_template_items SET blank_form_url = NULL WHERE id = $1`, [id]);
  if (existing[0].blank_form_url) {
    await deleteObject(existing[0].blank_form_url as string);
  }
}
