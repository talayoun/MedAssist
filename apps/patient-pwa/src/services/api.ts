import type { VisitContext, ChecklistResponse, NavigationRoute, WaitingResponse, FormItemDTO } from '@medassist/shared-types';

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

export function getForms(token: string): Promise<{ items: FormItemDTO[] }> {
  return apiRequest(`/visit/${token}/forms`);
}

export async function uploadFormImage(token: string, itemId: string, file: File): Promise<FormItemDTO> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE_URL}/api/visit/${token}/forms/${itemId}/upload`, {
    method: 'POST',
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'unknown_error', body.message ?? res.statusText);
  return body as FormItemDTO;
}

export function submitFormSignature(token: string, itemId: string, signatureData: string): Promise<FormItemDTO> {
  return apiRequest(`/visit/${token}/forms/${itemId}/signature`, {
    method: 'POST',
    body: JSON.stringify({ signature_data: signatureData }),
  });
}

export { ApiError };
