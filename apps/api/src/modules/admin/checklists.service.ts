import { query } from '../../db/db';
import { randomUUID } from 'crypto';

export interface ChecklistTemplateRow {
  id: string;
  procedure_type: string;
  items_json: ChecklistItemJson[];
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItemJson {
  id: string;
  text: string;
  category: 'bring' | 'fast' | 'medication' | 'other';
  time_sensitive: boolean;
}

export async function listTemplates(includeArchived = false): Promise<ChecklistTemplateRow[]> {
  const { rows } = await query<ChecklistTemplateRow>(
    `SELECT id, procedure_type, items_json, archived, created_at, updated_at
     FROM checklist_templates
     ${includeArchived ? '' : 'WHERE archived = FALSE'}
     ORDER BY procedure_type ASC`
  );
  return rows;
}

export async function getTemplate(id: string): Promise<ChecklistTemplateRow | null> {
  const { rows } = await query<ChecklistTemplateRow>(
    `SELECT id, procedure_type, items_json, archived, created_at, updated_at
     FROM checklist_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export interface CreateTemplateInput {
  procedure_type: string;
  items: Array<{ id?: string; text: string; category: 'bring' | 'fast' | 'medication' | 'other'; time_sensitive: boolean }>;
}

export async function createTemplate(input: CreateTemplateInput): Promise<ChecklistTemplateRow> {
  const items: ChecklistItemJson[] = input.items.map((it) => ({
    id: it.id ?? randomUUID(),
    text: it.text,
    category: it.category,
    time_sensitive: it.time_sensitive,
  }));

  // Resolve hospital_id from departments (single-hospital MVP)
  const { rows: deptRows } = await query<{ hospital_id: string }>(
    'SELECT hospital_id FROM departments LIMIT 1'
  );
  if (!deptRows[0]) throw Object.assign(new Error('no departments found'), { status: 500 });
  const hospitalId = deptRows[0].hospital_id;

  const { rows } = await query<ChecklistTemplateRow>(
    `INSERT INTO checklist_templates (procedure_type, hospital_id, items_json)
     VALUES ($1, $2, $3)
     RETURNING id, procedure_type, items_json, archived, created_at, updated_at`,
    [input.procedure_type, hospitalId, JSON.stringify(items)]
  );
  return rows[0];
}

export interface UpdateTemplateInput {
  procedure_type?: string;
  items?: Array<{ id?: string; text: string; category: 'bring' | 'fast' | 'medication' | 'other'; time_sensitive: boolean }>;
}

export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<ChecklistTemplateRow | null> {
  const existing = await getTemplate(id);
  if (!existing) return null;

  const newProcedureType = input.procedure_type ?? existing.procedure_type;
  const newItems: ChecklistItemJson[] = input.items
    ? input.items.map((it) => ({
        id: it.id ?? randomUUID(),
        text: it.text,
        category: it.category,
        time_sensitive: it.time_sensitive,
      }))
    : existing.items_json;

  const { rows } = await query<ChecklistTemplateRow>(
    `UPDATE checklist_templates
     SET procedure_type = $1, items_json = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, procedure_type, items_json, archived, created_at, updated_at`,
    [newProcedureType, JSON.stringify(newItems), id]
  );
  return rows[0] ?? null;
}

interface ActiveUseCount { active_count: string }

export async function deleteTemplate(
  id: string
): Promise<{ deleted: boolean; archived?: boolean; active_count?: number; error?: string }> {
  const existing = await getTemplate(id);
  if (!existing) return { deleted: false, error: 'not_found' };

  // Count appointments actively using this template (phase not terminal)
  const { rows: activeRows } = await query<ActiveUseCount>(
    `SELECT COUNT(*)::text AS active_count
     FROM checklist_progress cp
     JOIN appointments a ON a.id = cp.appointment_id
     WHERE cp.template_id = $1
       AND a.current_phase NOT IN ('done', 'expired')`,
    [id]
  );
  const activeCount = parseInt(activeRows[0].active_count, 10);

  if (activeCount > 0) {
    return { deleted: false, active_count: activeCount, error: 'template_in_active_use' };
  }

  // Count any historic usage (completed appointments)
  const { rows: historyRows } = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM checklist_progress WHERE template_id = $1`,
    [id]
  );
  const historyCount = parseInt(historyRows[0].total, 10);

  if (historyCount > 0) {
    // Soft-delete: preserve FK integrity for historic records
    await query(
      `UPDATE checklist_templates SET archived = TRUE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return { deleted: false, archived: true };
  }

  // Zero usage: hard delete
  await query('DELETE FROM checklist_templates WHERE id = $1', [id]);
  return { deleted: true, archived: false };
}
