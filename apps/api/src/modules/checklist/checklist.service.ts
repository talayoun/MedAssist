import { query } from '../../db/db';

interface TemplateItem {
  id: string;
  text: string;
  category: 'bring' | 'fast' | 'medication' | 'other';
  time_sensitive: boolean;
}

export interface ChecklistItemResponse {
  id: string;
  text: string;
  category: string;
  time_sensitive: boolean;
  completed: boolean;
}

export interface ChecklistResponse {
  template_id: string;
  procedure_type: string;
  items: ChecklistItemResponse[];
  hours_until_visit: number | null;
  all_complete: boolean;
}

export async function getChecklist(appointmentId: string): Promise<ChecklistResponse> {
  // Get appointment details
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

  // Get template by procedure_type
  const { rows: [template] } = await query<{
    id: string;
    procedure_type: string;
    items_json: TemplateItem[];
  }>(
    `SELECT id, procedure_type, items_json FROM checklist_templates WHERE procedure_type = $1 LIMIT 1`,
    [appt.procedure_type]
  );

  if (!template) {
    throw Object.assign(new Error('template_not_found'), { status: 404 });
  }

  // Get or create progress
  const { rows: progressRows } = await query<{
    completed_items_json: string[];
  }>(
    'SELECT completed_items_json FROM checklist_progress WHERE appointment_id = $1',
    [appointmentId]
  );

  const completedIds = new Set<string>(progressRows[0]?.completed_items_json ?? []);

  // Compute hours until visit
  let hoursUntilVisit: number | null = null;
  if (appt.visit_datetime) {
    hoursUntilVisit = Math.max(
      0,
      (new Date(appt.visit_datetime).getTime() - Date.now()) / (1000 * 60 * 60)
    );
  }

  const items: ChecklistItemResponse[] = template.items_json.map((item) => ({
    id: item.id,
    text: item.text,
    category: item.category,
    time_sensitive: item.time_sensitive && hoursUntilVisit !== null && hoursUntilVisit < 24,
    completed: completedIds.has(item.id),
  }));

  return {
    template_id: template.id,
    procedure_type: template.procedure_type,
    items,
    hours_until_visit: hoursUntilVisit !== null ? Math.round(hoursUntilVisit) : null,
    all_complete: items.every((i) => i.completed),
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

  // Check all_complete against template
  const { rows: [template] } = await query<{ items_json: TemplateItem[] }>(
    'SELECT items_json FROM checklist_templates WHERE id = $1',
    [templateId]
  );

  const allComplete = template.items_json.every((item) => completedItemIds.includes(item.id));

  return { completed_item_ids: completedItemIds, all_complete: allComplete };
}
