import { randomUUID } from 'crypto';
import { query } from '../../db/db';
import { generateToken } from '../magic-links/magic-links.service';
import { scheduleMagicLinkForAppointment } from '../magic-links/magic-links.scheduler';
import { enqueueNotification } from '../notifications/notifications.producer';
import { seedProgressForAppointment } from '../checklist/checklist.service';
import type { ChecklistCategory, ChecklistCustomItem } from '../checklist/merge';
import type { StaffAuthContext } from '@medassist/shared-types';

export interface CreateAppointmentInput {
  patient_name: string;
  phone_number: string;
  department_id: string;
  procedure_type: string;
  visit_datetime: string;
  custom_items: Array<{
    text: string;
    category: ChecklistCategory;
    time_sensitive: boolean;
  }>;
  suppressed_template_item_ids: string[];
  send_now: boolean;
}

export interface CreateAppointmentResult {
  appointment_id: string;
  patient_id: string;
  magic_link_token: string | null;
  sms_status: 'queued_now' | 'scheduled';
}

/**
 * Create an elective appointment from the staff back-office:
 * upsert patient by phone, create appointment, seed checklist overrides,
 * and either enqueue the magic link SMS now or schedule it via the timing rules.
 */
export async function createElectiveAppointment(
  input: CreateAppointmentInput,
  caller: StaffAuthContext
): Promise<CreateAppointmentResult> {
  if (caller.role === 'staff' && input.department_id !== caller.departmentId) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }

  const { rows: [dept] } = await query<{ id: string; name: string }>(
    'SELECT id, name FROM departments WHERE id = $1',
    [input.department_id]
  );
  if (!dept) {
    throw Object.assign(new Error('department_not_found'), { status: 404 });
  }

  const { rows: [template] } = await query<{ id: string }>(
    'SELECT id FROM checklist_templates WHERE procedure_type = $1 LIMIT 1',
    [input.procedure_type]
  );
  if (!template) {
    throw Object.assign(new Error('template_not_found'), {
      status: 400,
      message: `No checklist template for procedure_type '${input.procedure_type}'`,
    });
  }

  // Upsert patient by phone (reuse existing rows to preserve history)
  const { rows: existing } = await query<{ id: string; name: string }>(
    'SELECT id, name FROM patients WHERE phone_number = $1',
    [input.phone_number]
  );

  let patientId: string;
  if (existing.length > 0) {
    patientId = existing[0].id;
    if (existing[0].name !== input.patient_name) {
      await query('UPDATE patients SET name = $1 WHERE id = $2', [input.patient_name, patientId]);
    }
  } else {
    const { rows: [created] } = await query<{ id: string }>(
      `INSERT INTO patients (name, phone_number) VALUES ($1, $2) RETURNING id`,
      [input.patient_name, input.phone_number]
    );
    patientId = created.id;
  }

  const { rows: [appt] } = await query<{ id: string }>(
    `INSERT INTO appointments
       (patient_id, department_id, procedure_type, track, visit_datetime, status)
     VALUES ($1, $2, $3, 'elective', $4, 'scheduled')
     RETURNING id`,
    [patientId, input.department_id, input.procedure_type, input.visit_datetime]
  );
  const appointmentId = appt.id;

  const customItemsWithIds: ChecklistCustomItem[] = input.custom_items.map((ci) => ({
    id: randomUUID(),
    text: ci.text,
    category: ci.category,
    time_sensitive: ci.time_sensitive,
  }));

  await seedProgressForAppointment(
    appointmentId,
    patientId,
    template.id,
    customItemsWithIds,
    input.suppressed_template_item_ids
  );

  // Snapshot active form templates for this procedure type (and global ones)
  const { rows: formTemplates } = await query(
    `SELECT id, label, item_type, required, order_index
     FROM form_template_items
     WHERE (procedure_type = $1 OR procedure_type IS NULL) AND is_active = true
     ORDER BY order_index`,
    [input.procedure_type],
  );
  for (const tmpl of formTemplates) {
    await query(
      `INSERT INTO patient_form_items
         (appointment_id, form_template_item_id, label, item_type, required, order_index)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (appointment_id, form_template_item_id) WHERE form_template_item_id IS NOT NULL DO NOTHING`,
      [appointmentId, tmpl.id, tmpl.label, tmpl.item_type, tmpl.required, tmpl.order_index],
    );
  }

  if (input.send_now) {
    const ttlHours = parseInt(process.env.ELECTIVE_LINK_TTL_HOURS ?? '72', 10);
    const token = await generateToken(appointmentId, 'elective', ttlHours);
    const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
    const linkUrl = `${patientAppUrl}/${token}`;
    const message = `שלום ${input.patient_name}, קישור לביקורך ב${dept.name}: ${linkUrl}`;

    await enqueueNotification({
      patientId,
      appointmentId,
      phoneNumber: input.phone_number,
      type: 'magic_link',
      message,
      triggeringEvent: `elective_onboarding_now:${appointmentId}`,
    });

    await query(
      'UPDATE appointments SET magic_link_send_time = NOW(), updated_at = NOW() WHERE id = $1',
      [appointmentId]
    );

    return {
      appointment_id: appointmentId,
      patient_id: patientId,
      magic_link_token: token,
      sms_status: 'queued_now',
    };
  }

  await scheduleMagicLinkForAppointment({
    id: appointmentId,
    patient_id: patientId,
    department_id: input.department_id,
    procedure_type: input.procedure_type,
    visit_datetime: new Date(input.visit_datetime),
    phone_number: input.phone_number,
    patient_name: input.patient_name,
    department_name: dept.name,
  });

  return {
    appointment_id: appointmentId,
    patient_id: patientId,
    magic_link_token: null,
    sms_status: 'scheduled',
  };
}
