import type { ReactNode } from 'react';
import logo from '../../assets/medassist-logo.png';
import { useVisitInfo } from '../../context/VisitPhaseContext';

export default function AppHeader({ children, patientName: patientNameProp }: { children?: ReactNode; patientName?: string }) {
  const { patientName: contextName } = useVisitInfo();
  const patientName = patientNameProp ?? contextName;
  const initial = patientName?.trim()?.[0] ?? '';

  return (
    <header className="bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] px-6 h-[72px] flex items-center justify-between shrink-0">
      <img src={logo} alt="MedAssist" className="h-[28px] object-contain block" />
      {patientName ? (
        <div className="flex items-center gap-2.5">
          <span className="text-base font-semibold text-text">שלום, {patientName}</span>
          <span className="w-9 h-9 rounded-full bg-teal text-white flex items-center justify-center text-sm font-bold shrink-0">
            {initial}
          </span>
        </div>
      ) : (
        children
      )}
    </header>
  );
}
