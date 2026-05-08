import type {
  StaffUser, QueueResponse, PatientStationDTO, AppointmentPhase, Department,
  TimingRule, AdminRoute, ChecklistTemplate
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

export function listRoutes(): Promise<{ routes: AdminRoute[] }> {
  return apiRequest('/admin/routes');
}

export function listChecklists(): Promise<{ templates: ChecklistTemplate[] }> {
  return apiRequest('/admin/checklists');
}

export function listTimingRules(): Promise<{ rules: TimingRule[] }> {
  return apiRequest('/admin/timing-rules');
}

export { ApiError };
