import { createContext, useContext } from 'react';
import type { VisitContext } from '@medassist/shared-types';

export type AppPhase = VisitContext['phase'] | null;

export const VisitPhaseContext = createContext<AppPhase>(null);

export function useVisitPhase(): AppPhase {
  return useContext(VisitPhaseContext);
}
