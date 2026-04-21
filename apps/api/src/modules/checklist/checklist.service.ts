import { query } from '../../db/db';
import {
  mergeChecklistItems,
  ChecklistTemplateItem,
  ChecklistCustomItem,
  ResolvedChecklistItem,
} from './merge';

export interface ChecklistItemResponse {
  id: string;
  text: string;
  category: string;
  time_sensitive: boolean;
  completed: boolean;
  source: 'template' | 'custom';
}

export interface ChecklistResponse {
  template_id: string;
  procedure_type: string;
  items: ChecklistItemResponse[];
  hours_until_visit: number | null;
  all_complete: boolean;
}

export async function getChecklist(appointmentId: string): Promise<ChecklistResponse> {
  const { rows: [appt] } = await query<{
    procedure_type: string | null;
    visit_datetime: Date | null;
    patient_id: string;
  }>(
    'SELECT procedure_type, visit_datetime, patient_id FROM appointments WHERE id = $1',
    [appointmentId]
  );

  if (!appt.procedure_type) {
    throw Object.assign(new Error('no_checklist'), { status: 404 });
  }

  const { rows: [template] } = await query<{
    id: string;
    procedure_type: string;
    items_json: ChecklistTemplateItem[];
  }>(
    `SELECT id, procedure_type, items_json FROM checklist_templates WHERE procedure_type = $1 LIMIT 1`,
    [appt.procedure_type]
  );

  if (!template) {
    throw Object.assign(new Error('template_not_found'), { status: 404 });
  }

  const { rows: progressRows } = await query<{
    completed_items_json: string[];
    custom_items_json: ChecklistCustomItem[];
    suppressed_template_item_ids_json: string[];
  }>(
    `SELECT completed_items_json, custom_items_json, suppressed_template_item_ids_json
     FROM checklist_progress WHERE appointment_id = $1`,
    [appointmentId]
  );

  const progress = progressRows[0];

  let hoursUntilVisit: number | null = null;
  if (appt.visit_datetime) {
    hoursUntilVisit = Math.max(
      0,
      (new Date(appt.visit_datetime).getTime() - Date.now()) / (1000 * 60 * 60)
    );
  }

  const { items, all_complete } = mergeChecklistItems({
    templateItems: template.items_json,
    customItems: progress?.custom_items_json ?? [],
    suppressedTemplateItemIds: progress?.suppressed_template_item_ids_json ?? [],
    completedItemIds: progress?.completed_items_json ?? [],
    hoursUntilVisit,
  });

  return {
    template_id: template.id,
    procedure_type: template.procedure_type,
    items: items as ChecklistItemResponse[],
    hours_until_visit: hoursUntilVisit !== null ? Math.round(hoursUntilVisit) : null,
    all_complete,
  };
}

export async function saveProgress(
  appointmentId: string,
  patientId: string,
  templateId: string,
  completedItemIds: string[]
): Promise<{ completed_item_ids: string[]; all_complete: boolean }> {
  await query(
    `INSERT INTO checklist_progress (patient_id, appointment_id, template_id, completed_items_json, last_updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (appointment_id) DO UPDATE
       SET completed_items_json = $4, last_updated_at = NOW()`,
    [patientId, appointmentId, templateId, JSON.stringify(completedItemIds)]
  );

  // all_complete must consider both template (minus suppressed) and custom items
  const { rows: [template] } = await query<{ items_json: ChecklistTemplateItem[] }>(
    'SELECT items_json FROM checklist_templates WHERE id = $1',
    [templateId]
  );

  const { rows: [progress] } = await query<{
    custom_items_json: ChecklistCustomItem[];
    suppressed_template_item_ids_json: string[];
  }>(
    `SELECT custom_items_json, suppressed_template_item_ids_json
     FROM checklist_progress WHERE appointment_id = $1`,
    [appointmentId]
  );

  const merged: ResolvedChecklistItem[] = mergeChecklistItems({
    templateItems: template.items_json,
    customItems: progress?.custom_items_json ?? [],
    suppressedTemplateItemIds: progress?.suppressed_template_item_ids_json ?? [],
    completedItemIds,
    hoursUntilVisit: null,
  }).items;

  const allComplete = merged.length > 0 && merged.every((i) => i.completed);

  return { completed_item_ids: completedItemIds, all_complete: allComplete };
}

/**
 * Seed the checklist_progress row for a new appointment with its per-appointment
 * customizations. Called once at appointment creation time.
 */
export async function seedProgressForAppointment(
  appointmentId: string,
  patientId: string,
  templateId: string,
  customItems: ChecklistCustomItem[],
  suppressedTemplateItemIds: string[]
): Promise<void> {
  await query(
    `INSERT INTO checklist_progress
       (patient_id, appointment_id, template_id,
        completed_items_json, custom_items_json, suppressed_template_item_ids_json,
        last_updated_at)
     VALUES ($1, $2, $3, '[]', $4, $5, NOW())
     ON CONFLICT (appointment_id) DO NOTHING`,
    [
      patientId,
      appointmentId,
      templateId,
      JSON.stringify(customItems),
      JSON.stringify(suppressedTemplateItemIds),
    ]
  );
}
