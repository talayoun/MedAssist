import { z } from 'zod';
import { E164PhoneSchema } from './patient';

// ─── Staff Users ──────────────────────────────────────────────────────────────

export const StaffRoleSchema = z.enum(['staff', 'admin']);

export const StaffUserDTO = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: StaffRoleSchema,
  department_id: z.string().uuid().nullable(),
  department_name: z.string().optional(),
  is_active: z.boolean(),
  last_active_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});

export const LoginRequestDTO = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const CreateStaffRequestDTO = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  role: StaffRoleSchema,
  department_id: z.string().uuid().optional(),
});

// ─── Queue ────────────────────────────────────────────────────────────────────

export const PatientStationDTO = z.object({
  station_id: z.string().uuid(),
  department: z.string(),
  order_index: z.number().int(),
  status: z.enum(['pending', 'complete']),
});

export const AppointmentPhaseSchema = z.enum([
  'link_sent', 'checklist', 'navigation', 'waiting', 'done', 'expired',
]);

export const QueuePatientDTO = z.object({
  appointment_id: z.string().uuid(),
  patient_name: z.string(),
  department_id: z.string().uuid(),
  department: z.string(),
  track: z.enum(['elective', 'er']),
  current_phase: AppointmentPhaseSchema,
  link_sent_at: z.string().datetime(),
  arrival_time: z.string().datetime().nullable(),
  minutes_waiting: z.number().int().nullable(),
  queue_status: z.enum(['waiting', 'in_treatment', 'done']).nullable(),
  estimated_wait_minutes: z.number().int().nullable(),
  stations: z.array(PatientStationDTO),
  forms_submitted: z.number().int(),
  forms_total: z.number().int(),
});

export const QueueResponseDTO = z.object({
  department_label: z.string(),
  patients: z.array(QueuePatientDTO),
  broadcast_message: z.string().nullable(),
  broadcast_sent_at: z.string().datetime().nullable(),
});

export const DepartmentDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const BroadcastRequestDTO = z.object({
  message: z.string().min(1).max(280),
});

export const WaitEstimateRequestDTO = z.object({
  estimated_wait_minutes: z.number().int().positive(),
});

export const StatusUpdateRequestDTO = z.object({
  status: z.enum(['waiting', 'in_treatment', 'done']),
});

export const ResendInviteResultDTO = z.object({
  appointment_id: z.string().uuid(),
  token: z.string(),
  expires_at: z.string().datetime(),
});

// ─── ER Link ──────────────────────────────────────────────────────────────────

export const ERLinkRequestDTO = z.object({
  phone_number: E164PhoneSchema,
});

// ─── Admin — Navigation Routes ────────────────────────────────────────────────

export const AdminRouteStepDTO = z.object({
  step_id: z.string().uuid(),
  order: z.number().int().positive(),
  image_url: z.string().url(),
  instruction: z.string().min(1).max(200),
});

export const AdminRouteDTO = z.object({
  route_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  from_department_id: z.string().uuid().nullable(),
  to_department_id: z.string().uuid(),
  is_default: z.boolean(),
  archived: z.boolean(),
  steps_count: z.number().int(),
  steps: z.array(AdminRouteStepDTO).optional(),
});

export const AdminRouteStepInputDTO = z.object({
  image_url: z.string().url(),
  instruction_text: z.string().min(1).max(200),
});

export const CreateAdminRouteRequestDTO = z.object({
  name: z.string().min(1).max(80),
  from_department_id: z.string().uuid().nullable(),
  to_department_id: z.string().uuid(),
  is_default: z.boolean().default(false),
  steps: z.array(AdminRouteStepInputDTO).max(20).default([]),
});

export const UpdateAdminRouteRequestDTO = z.object({
  name: z.string().min(1).max(80).optional(),
  from_department_id: z.string().uuid().nullable().optional(),
  to_department_id: z.string().uuid().optional(),
  is_default: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const ReorderAdminRouteStepsRequestDTO = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1).max(20),
});

// ─── Admin — Checklists ───────────────────────────────────────────────────────

export const ChecklistTemplateItemDTO = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  category: z.enum(['bring', 'fast', 'medication', 'other']),
  time_sensitive: z.boolean(),
});

export const ChecklistTemplateDTO = z.object({
  template_id: z.string().uuid(),
  procedure_type: z.string().min(1),
  item_count: z.number().int(),
  archived: z.boolean(),
  items: z.array(ChecklistTemplateItemDTO).optional(),
});

export const CreateChecklistTemplateRequestDTO = z.object({
  procedure_type: z.string().min(1),
  items: z.array(
    ChecklistTemplateItemDTO.omit({ id: true }).extend({ id: z.string().uuid().optional() })
  ).max(100),
});

export const UpdateChecklistTemplateRequestDTO = z.object({
  procedure_type: z.string().min(1).optional(),
  items: z.array(
    ChecklistTemplateItemDTO.omit({ id: true }).extend({ id: z.string().uuid().optional() })
  ).max(100).optional(),
});

// ─── Admin — Timing Rules ─────────────────────────────────────────────────────

export const TimingRuleDTO = z.object({
  rule_id: z.string().uuid(),
  department_id: z.string().uuid(),
  department_name: z.string().optional(),
  procedure_type: z.string().nullable(),
  send_offset_hours: z.number().int().negative(),
});

export const CreateTimingRuleRequestDTO = z.object({
  department_id: z.string().uuid(),
  procedure_type: z.string().optional(),
  send_offset_hours: z.number().int().negative('send_offset_hours must be negative'),
});

// ─── Companion ────────────────────────────────────────────────────────────────

export const CompanionLinkRequestDTO = z.object({
  phone_number: E164PhoneSchema,
});

export type StaffUser = z.infer<typeof StaffUserDTO>;
export type StaffRole = z.infer<typeof StaffRoleSchema>;
export type AppointmentPhase = z.infer<typeof AppointmentPhaseSchema>;
export type QueuePatient = z.infer<typeof QueuePatientDTO>;
export type QueueResponse = z.infer<typeof QueueResponseDTO>;
export type Department = z.infer<typeof DepartmentDTO>;
export type AdminRoute = z.infer<typeof AdminRouteDTO>;
export type AdminRouteStep = z.infer<typeof AdminRouteStepDTO>;
export type AdminRouteStepInput = z.infer<typeof AdminRouteStepInputDTO>;
export type CreateAdminRouteRequest = z.infer<typeof CreateAdminRouteRequestDTO>;
export type UpdateAdminRouteRequest = z.infer<typeof UpdateAdminRouteRequestDTO>;
export type ReorderAdminRouteStepsRequest = z.infer<typeof ReorderAdminRouteStepsRequestDTO>;
export type ChecklistTemplate = z.infer<typeof ChecklistTemplateDTO>;
export type ChecklistTemplateItem = z.infer<typeof ChecklistTemplateItemDTO>;
export type CreateChecklistTemplateRequest = z.infer<typeof CreateChecklistTemplateRequestDTO>;
export type UpdateChecklistTemplateRequest = z.infer<typeof UpdateChecklistTemplateRequestDTO>;
export type TimingRule = z.infer<typeof TimingRuleDTO>;
