import { createContext, useContext } from 'react';

export type AppPhase = 'checklist' | 'navigation' | 'waiting' | null;

export const VisitPhaseContext = createContext<AppPhase>(null);

export function useVisitPhase(): AppPhase {
  return useContext(VisitPhaseContext);
}
