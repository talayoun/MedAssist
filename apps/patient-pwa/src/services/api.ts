import type { VisitContext, ChecklistResponse, NavigationRoute, WaitingResponse, FormSummary, FormDetail } from '@medassist/shared-types';

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
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'unknown_error', body.message ?? res.statusText);
  }

  return body as T;
}

// ─── Magic Link ───────────────────────────────────────────────────────────────

export function resolveVisit(token: string): Promise<VisitContext> {
  return apiRequest<VisitContext>(`/visit/${token}`);
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export function getChecklist(token: string): Promise<ChecklistResponse> {
  return apiRequest<ChecklistResponse>(`/visit/${token}/checklist`);
}

export function saveChecklistProgress(
  token: string,
  completedItemIds: string[]
): Promise<{ completed_item_ids: string[]; all_complete: boolean }> {
  return apiRequest(`/visit/${token}/checklist/progress`, {
    method: 'POST',
    body: JSON.stringify({ completed_item_ids: completedItemIds }),
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export function getNavigation(token: string): Promise<NavigationRoute> {
  return apiRequest<NavigationRoute>(`/visit/${token}/navigation`);
}

export function confirmStep(
  token: string,
  stepId: string
): Promise<{ next_step?: NavigationRoute['steps'][0]; total_steps?: number; current_step?: number; phase?: string; message?: string }> {
  return apiRequest(`/visit/${token}/navigation/steps/${stepId}/confirm`, { method: 'POST' });
}

// ─── Waiting ──────────────────────────────────────────────────────────────────

export function getWaitingStatus(token: string): Promise<WaitingResponse> {
  return apiRequest<WaitingResponse>(`/visit/${token}/waiting`);
}

export function sendContactMessage(
  token: string,
  messageType: 'need_help' | 'confirm_here' | 'question'
): Promise<{ sent: boolean }> {
  return apiRequest(`/visit/${token}/waiting/contact`, {
    method: 'POST',
    body: JSON.stringify({ message_type: messageType }),
  });
}

// ─── Forms ────────────────────────────────────────────────────────────────────

export function listForms(token: string): Promise<{ forms: FormSummary[] }> {
  return apiRequest(`/visit/${token}/forms`);
}

export function getForm(token: string, formId: string): Promise<FormDetail> {
  return apiRequest<FormDetail>(`/visit/${token}/forms/${formId}`);
}

export function saveFormDraft(
  token: string,
  formId: string,
  fieldData: Record<string, unknown>
): Promise<{ saved: boolean; updated_at: string }> {
  return apiRequest(`/visit/${token}/forms/${formId}`, {
    method: 'PUT',
    body: JSON.stringify({ field_data: fieldData }),
  });
}

export function submitSignature(
  token: string,
  formId: string,
  signatureData: string
): Promise<{ saved: boolean }> {
  return apiRequest(`/visit/${token}/forms/${formId}/signature`, {
    method: 'POST',
    body: JSON.stringify({ signature_data: signatureData }),
  });
}

export function submitForm(
  token: string,
  formId: string
): Promise<{ submitted: boolean; submitted_at: string }> {
  return apiRequest(`/visit/${token}/forms/${formId}/submit`, { method: 'POST', body: '{}' });
}

export { ApiError };
