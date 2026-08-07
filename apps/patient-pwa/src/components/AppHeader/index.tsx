import type { ReactNode } from 'react';
import logo from '../../assets/medassist-logo.png';

export default function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="bg-teal shadow-[0_1px_3px_rgba(0,0,0,0.12)] px-6 py-4 flex items-center justify-between shrink-0">
      <span className="bg-white rounded-[10px] px-3 py-1.5 flex items-center shrink-0">
        <img src={logo} alt="MedAssist" className="h-[26px] object-contain block" />
      </span>
      {children}
    </header>
  );
}
