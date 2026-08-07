import { createContext, useContext } from 'react';
import type { VisitContext } from '@medassist/shared-types';

export type AppPhase = VisitContext['phase'] | null;

export type VisitInfo = {
  phase: AppPhase;
  patientName: string | null;
};

export const VisitPhaseContext = createContext<VisitInfo>({ phase: null, patientName: null });

export function useVisitPhase(): AppPhase {
  return useContext(VisitPhaseContext).phase;
}

export function useVisitInfo(): VisitInfo {
  return useContext(VisitPhaseContext);
}
