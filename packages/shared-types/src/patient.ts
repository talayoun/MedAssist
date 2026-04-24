import { z } from 'zod';

export const E164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be in E.164 format (e.g. +972501234567)');

export const AppointmentTrackSchema = z.enum(['elective', 'er']);
export const AppointmentStatusSchema = z.enum(['scheduled', 'active', 'completed', 'cancelled']);
export const MagicLinkTypeSchema = z.enum(['patient', 'companion']);

export const PatientDTO = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone_number: E164PhoneSchema,
  created_at: z.string().datetime(),
});

export const AppointmentDTO = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  department_id: z.string().uuid(),
  procedure_type: z.string().nullable(),
  track: AppointmentTrackSchema,
  visit_datetime: z.string().datetime().nullable(),
  status: AppointmentStatusSchema,
  magic_link_send_time: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const MagicLinkDTO = z.object({
  id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  token: z.string().uuid(),
  track: AppointmentTrackSchema,
  expires_at: z.string().datetime(),
  used_at: z.string().datetime().nullable(),
  link_type: MagicLinkTypeSchema,
  created_at: z.string().datetime(),
});

export const VisitContextDTO = z.object({
  track: AppointmentTrackSchema,
  phase: z.enum(['checklist', 'navigation', 'waiting']),
  patient: z.object({
    name: z.string(),
    department: z.string(),
    visit_date: z.string().nullable(),
  }),
  appointment_id: z.string().uuid(),
});

export type Patient = z.infer<typeof PatientDTO>;
export type Appointment = z.infer<typeof AppointmentDTO>;
export type MagicLink = z.infer<typeof MagicLinkDTO>;
export type VisitContext = z.infer<typeof VisitContextDTO>;
export type AppointmentTrack = z.infer<typeof AppointmentTrackSchema>;
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;
export type MagicLinkType = z.infer<typeof MagicLinkTypeSchema>;
