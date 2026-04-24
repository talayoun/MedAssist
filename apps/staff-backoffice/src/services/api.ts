import type {
  StaffUser, QueueResponse, PatientStationDTO, AppointmentPhase, Department,
  TimingRule, AdminRoute, AdminRouteStep, ChecklistTemplate
} from '@medassist/shared-types';
import type { z } from 'zod';

type PatientStation = z.infer<typeof PatientStationDTO>;

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    credentials: 'include', // send httpOnly JWT cookie
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new ApiError(401, 'not_authenticated', 'Session expired');
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'unknown_error', body.message ?? res.statusText);
  }

  return body as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function login(email: string, password: string): Promise<{ user: StaffUser }> {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<{ logged_out: boolean }> {
  return apiRequest('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ user: StaffUser }> {
  return apiRequest('/auth/me');
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export function getQueue(
  filter?: { departmentId?: string | null; phase?: AppointmentPhase | null }
): Promise<QueueResponse> {
  const params = new URLSearchParams();
  if (filter?.departmentId) params.set('department_id', filter.departmentId);
  if (filter?.phase) params.set('phase', filter.phase);
  const qs = params.toString();
  return apiRequest(`/staff/queue${qs ? `?${qs}` : ''}`);
}

export function getDepartments(): Promise<{ departments: Department[] }> {
  return apiRequest('/staff/departments');
}

export function updatePatientStatus(
  appointmentId: string,
  status: 'waiting' | 'in_treatment' | 'done'
): Promise<{ appointment_id: string; status: string; updated_at: string }> {
  return apiRequest(`/staff/queue/${appointmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function resetArrivalToNow(
  appointmentId: string
): Promise<{ appointment_id: string; arrival_time: string }> {
  return apiRequest(`/staff/queue/${appointmentId}/reset-arrival`, {
    method: 'POST',
  });
}

export function setWaitEstimate(
  estimatedWaitMinutes: number,
  departmentId?: string | null
): Promise<{ updated: boolean }> {
  return apiRequest('/staff/queue/wait-estimate', {
    method: 'PATCH',
    body: JSON.stringify({
      estimated_wait_minutes: estimatedWaitMinutes,
      ...(departmentId ? { department_id: departmentId } : {}),
    }),
  });
}

export function sendBroadcast(
  message: string,
  departmentId?: string | null
): Promise<{ sent: boolean; recipient_count: number; sent_at: string }> {
  return apiRequest('/staff/queue/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      message,
      ...(departmentId ? { department_id: departmentId } : {}),
    }),
  });
}

export interface CreateAppointmentBody {
  patient_name: string;
  phone_number: string;
  department_id: string;
  procedure_type: string;
  visit_datetime: string;
  custom_items: Array<{
    text: string;
    category: 'bring' | 'fast' | 'medication' | 'other';
    time_sensitive: boolean;
  }>;
  suppressed_template_item_ids: string[];
  send_now: boolean;
}

export function createAppointment(
  body: CreateAppointmentBody
): Promise<{
  appointment_id: string;
  patient_id: string;
  magic_link_token: string | null;
  sms_status: 'queued_now' | 'scheduled';
}> {
  return apiRequest('/staff/appointments', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function resendInvite(
  appointmentId: string
): Promise<{ appointment_id: string; token: string; expires_at: string }> {
  return apiRequest(`/staff/queue/${appointmentId}/resend-invite`, {
    method: 'POST',
  });
}

// ─── Stations ─────────────────────────────────────────────────────────────────

export function addStation(
  appointmentId: string,
  departmentId: string,
  orderIndex: number
): Promise<PatientStation> {
  return apiRequest(`/staff/patients/${appointmentId}/stations`, {
    method: 'POST',
    body: JSON.stringify({ department_id: departmentId, order_index: orderIndex }),
  });
}

export function reorderStations(
  appointmentId: string,
  stationIds: string[]
): Promise<{ updated: boolean }> {
  return apiRequest(`/staff/patients/${appointmentId}/stations/order`, {
    method: 'PUT',
    body: JSON.stringify({ station_ids: stationIds }),
  });
}

export function markStationComplete(
  appointmentId: string,
  stationId: string
): Promise<{ station_id: string; status: string; completed_at: string }> {
  return apiRequest(`/staff/patients/${appointmentId}/stations/${stationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'complete' }),
  });
}

// ─── ER Links ─────────────────────────────────────────────────────────────────

export function createERLink(
  phoneNumber: string
): Promise<{ appointment_id: string; magic_link_token: string; expires_at: string; sms_status: string }> {
  return apiRequest('/staff/er-links', {
    method: 'POST',
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
}

// ─── Companion ────────────────────────────────────────────────────────────────

export function issueCompanionLink(
  appointmentId: string,
  phoneNumber: string
): Promise<{ companion_id: string; magic_link_token: string; sms_status: string }> {
  return apiRequest(`/staff/patients/${appointmentId}/companion-link`, {
    method: 'POST',
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

export function exportPatientPDF(
  appointmentId: string
): Promise<{ pdf_url?: string; expires_at?: string; job_id?: string; status?: string }> {
  return apiRequest(`/staff/patients/${appointmentId}/export-pdf`, { method: 'POST' });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function listStaff(departmentId?: string): Promise<{ staff: StaffUser[] }> {
  const qs = departmentId ? `?department_id=${departmentId}` : '';
  return apiRequest(`/admin/staff${qs}`);
}

// ─── Admin — Navigation Routes ────────────────────────────────────────────────

export function listNavigationRoutes(
  includeArchived = false
): Promise<{ routes: AdminRoute[] }> {
  const qs = includeArchived ? '?include_archived=true' : '';
  return apiRequest(`/admin/navigation-routes${qs}`);
}

export function getNavigationRoute(routeId: string): Promise<AdminRoute> {
  return apiRequest(`/admin/navigation-routes/${routeId}`);
}

export interface NavigationRouteStepInput {
  image_url: string;
  instruction_text: string;
}

export function createNavigationRoute(body: {
  name: string;
  from_department_id: string | null;
  to_department_id: string;
  is_default: boolean;
  steps: NavigationRouteStepInput[];
}): Promise<AdminRoute> {
  return apiRequest('/admin/navigation-routes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateNavigationRoute(
  routeId: string,
  patch: {
    name?: string;
    from_department_id?: string | null;
    to_department_id?: string;
    is_default?: boolean;
    archived?: boolean;
  }
): Promise<AdminRoute> {
  return apiRequest(`/admin/navigation-routes/${routeId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteNavigationRoute(
  routeId: string
): Promise<{ deleted: boolean; archived: boolean }> {
  return apiRequest(`/admin/navigation-routes/${routeId}`, { method: 'DELETE' });
}

export function addNavigationStep(
  routeId: string,
  body: NavigationRouteStepInput
): Promise<AdminRouteStep> {
  return apiRequest(`/admin/navigation-routes/${routeId}/steps`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateNavigationStep(
  routeId: string,
  stepId: string,
  patch: { image_url?: string; instruction_text?: string }
): Promise<AdminRouteStep> {
  return apiRequest(`/admin/navigation-routes/${routeId}/steps/${stepId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteNavigationStep(
  routeId: string,
  stepId: string
): Promise<{ deleted: boolean }> {
  return apiRequest(`/admin/navigation-routes/${routeId}/steps/${stepId}`, {
    method: 'DELETE',
  });
}

export function reorderNavigationSteps(
  routeId: string,
  orderedIds: string[]
): Promise<{ ok: boolean }> {
  return apiRequest(`/admin/navigation-routes/${routeId}/steps/order`, {
    method: 'PUT',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

export async function uploadNavigationStepImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${BASE_URL}/api/admin/navigation-routes/upload-image`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, 'upload_failed', text);
  }
  const data = await res.json();
  return data.image_url as string;
}

export function listChecklists(includeArchived = false): Promise<{ templates: ChecklistTemplate[] }> {
  const qs = includeArchived ? '?include_archived=true' : '';
  return apiRequest(`/admin/checklists${qs}`);
}

export function getChecklist(templateId: string): Promise<ChecklistTemplate> {
  return apiRequest(`/admin/checklists/${templateId}`);
}

export interface ChecklistItemInput {
  id?: string;
  text: string;
  category: 'bring' | 'fast' | 'medication' | 'other';
  time_sensitive: boolean;
}

export function createChecklist(
  procedureType: string,
  items: ChecklistItemInput[]
): Promise<ChecklistTemplate> {
  return apiRequest('/admin/checklists', {
    method: 'POST',
    body: JSON.stringify({ procedure_type: procedureType, items }),
  });
}

export function updateChecklist(
  templateId: string,
  patch: { procedure_type?: string; items?: ChecklistItemInput[] }
): Promise<ChecklistTemplate> {
  return apiRequest(`/admin/checklists/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteChecklist(
  templateId: string
): Promise<{ deleted: boolean; archived: boolean }> {
  return apiRequest(`/admin/checklists/${templateId}`, { method: 'DELETE' });
}

export function listTimingRules(): Promise<{ rules: TimingRule[] }> {
  return apiRequest('/admin/timing-rules');
}

export { ApiError };
