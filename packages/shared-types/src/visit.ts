import { z } from 'zod';

// ─── Checklist ────────────────────────────────────────────────────────────────

export const ChecklistCategorySchema = z.enum(['bring', 'fast', 'medication', 'other']);

export const ChecklistLinkTargetSchema = z.enum(['forms']);

export const ChecklistItemDTO = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  category: ChecklistCategorySchema,
  time_sensitive: z.boolean(),
  completed: z.boolean(),
  description: z.string().nullable(),
  link_target: ChecklistLinkTargetSchema.nullable(),
});

export const ChecklistResponseDTO = z.object({
  template_id: z.string().uuid(),
  procedure_type: z.string(),
  items: z.array(ChecklistItemDTO),
  hours_until_visit: z.number().nullable(),
  all_complete: z.boolean(),
});

export const ChecklistProgressRequestDTO = z.object({
  completed_item_ids: z.array(z.string().uuid()),
});

// ─── Navigation ───────────────────────────────────────────────────────────────

export const NavigationStepDTO = z.object({
  step_id: z.string().uuid(),
  order: z.number().int().positive(),
  image_url: z.string().url(),
  instruction: z.string().min(1),
  is_current: z.boolean(),
});

export const ParkingCoordinatesDTO = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const NavigationRouteDTO = z.object({
  route_id: z.string().uuid(),
  route_name: z.string(),
  total_steps: z.number().int().positive(),
  current_step: z.number().int().positive(),
  parking_coordinates: ParkingCoordinatesDTO.nullable(),
  steps: z.array(NavigationStepDTO),
  completed: z.boolean().optional(),
});

export const StepConfirmResponseDTO = z.union([
  z.object({
    next_step: NavigationStepDTO,
    total_steps: z.number().int(),
    current_step: z.number().int(),
  }),
  z.object({
    phase: z.literal('waiting'),
    message: z.string(),
  }),
]);

// ─── Waiting ──────────────────────────────────────────────────────────────────

export const WaitingStatusSchema = z.enum(['waiting', 'in_treatment', 'done']);

export const WaitingResponseDTO = z.object({
  status: WaitingStatusSchema,
  arrival_confirmed: z.boolean(),
  department: z.string(),
  estimated_wait_minutes: z.number().int().nullable(),
  broadcast_message: z.string().nullable(),
  broadcast_sent_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime(),
});

export const ContactMessageTypeSchema = z.enum(['need_help', 'confirm_here', 'question']);

export const ContactRequestDTO = z.object({
  message_type: ContactMessageTypeSchema,
});

// ─── Digital Forms ────────────────────────────────────────────────────────────

export const FormFieldDTO = z.object({
  id: z.string(),
  type: z.enum(['text', 'select', 'checkbox']),
  label: z.string(),
  required: z.boolean(),
  value: z.union([z.string(), z.boolean(), z.null()]),
});

export const FormSummaryDTO = z.object({
  form_id: z.string().uuid(),
  form_type: z.string(),
  label: z.string(),
  submitted: z.boolean(),
  signature_required: z.boolean(),
});

export const FormDetailDTO = z.object({
  form_id: z.string().uuid(),
  form_type: z.string(),
  label: z.string(),
  fields: z.array(FormFieldDTO),
  captured_images: z.array(
    z.object({ id: z.string(), label: z.string(), url: z.string().url().nullable() })
  ),
  signature_required: z.boolean(),
  signature_data: z.string().nullable(),
  submitted: z.boolean(),
});

export const FormDraftRequestDTO = z.object({
  field_data: z.record(z.unknown()),
});

export const SignatureRequestDTO = z.object({
  signature_data: z.string().min(1),
});

export type ChecklistItem = z.infer<typeof ChecklistItemDTO>;
export type ChecklistResponse = z.infer<typeof ChecklistResponseDTO>;
export type NavigationStep = z.infer<typeof NavigationStepDTO>;
export type NavigationRoute = z.infer<typeof NavigationRouteDTO>;
export type WaitingResponse = z.infer<typeof WaitingResponseDTO>;
export type WaitingStatus = z.infer<typeof WaitingStatusSchema>;
export type FormSummary = z.infer<typeof FormSummaryDTO>;
export type FormDetail = z.infer<typeof FormDetailDTO>;

// ─── Digital Forms v2 ─────────────────────────────────────────────────────────

export const FormSectionSchema = z.enum(['personal', 'medical', 'financial', 'documents', 'consent']);
export const FormItemTypeSchema = z.enum([
  'patient_upload', 'staff_upload_sign', 'text_field', 'yes_no_list', 'consent',
]);

export const TextFieldValueDTO = z.object({ text: z.string() });
export const YesNoListValueDTO = z.object({ answer: z.boolean(), items: z.array(z.string()) });
export const ConsentValueDTO = z.object({ accepted: z.boolean() });
export const FormItemValueDTO = z.union([TextFieldValueDTO, YesNoListValueDTO, ConsentValueDTO]).nullable();

export const FormItemDTOSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  item_type: FormItemTypeSchema,
  status: z.enum(['pending', 'staff_uploaded', 'patient_submitted']),
  required: z.boolean(),
  order_index: z.number().int(),
  staff_file_url: z.string().url().nullable(),
  patient_file_url: z.string().url().nullable(),
  patient_file_download_url: z.string().url().nullable(),
  patient_submitted_at: z.string().datetime().nullable(),
  section: FormSectionSchema,
  sub_label: z.string().nullable(),
  placeholder: z.string().nullable(),
  list_item_placeholder: z.string().nullable(),
  value: FormItemValueDTO,
});

// Per-item_type value payload for PATCH /:itemId/value — a discriminated request shape.
export const FormValueRequestDTO = z.discriminatedUnion('item_type', [
  z.object({ item_type: z.literal('text_field'), value: TextFieldValueDTO }),
  z.object({ item_type: z.literal('yes_no_list'), value: YesNoListValueDTO }),
  z.object({ item_type: z.literal('consent'), value: ConsentValueDTO }),
]);
export type FormValueRequest = z.infer<typeof FormValueRequestDTO>;

export type FormItemDTO = z.infer<typeof FormItemDTOSchema>;

export const FormsListResponseDTOSchema = z.object({
  items: z.array(FormItemDTOSchema),
});

export type FormsListResponseDTO = z.infer<typeof FormsListResponseDTOSchema>;

export const StaffFormsResponseDTOSchema = z.object({
  items: z.array(FormItemDTOSchema),
  latest_export: z.object({
    pdf_url: z.string().url(),
    generated_at: z.string().datetime(),
    item_count: z.number().int(),
  }).nullable(),
  new_since_last_export: z.number().int(),
});

export type StaffFormsResponseDTO = z.infer<typeof StaffFormsResponseDTOSchema>;

export const FormTemplateItemDTOSchema = z.object({
  id: z.string().uuid(),
  procedure_type: z.string().nullable(),
  label: z.string(),
  item_type: FormItemTypeSchema,
  blank_form_url: z.string().url().nullable(),
  required: z.boolean(),
  order_index: z.number().int(),
  is_active: z.boolean(),
  section: FormSectionSchema,
  sub_label: z.string().nullable(),
  placeholder: z.string().nullable(),
  list_item_placeholder: z.string().nullable(),
});

export type FormTemplateItemDTO = z.infer<typeof FormTemplateItemDTOSchema>;
