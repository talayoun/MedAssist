import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import logo from '../../assets/medassist-logo.png';
import { useVisitInfo } from '../../context/VisitPhaseContext';
import { OfflineBanner } from '../ui/OfflineBanner';

export default function AppHeader({
  children,
  patientName: patientNameProp,
  isOnline: isOnlineProp,
  offlineMessage,
}: {
  children?: ReactNode;
  patientName?: string;
  isOnline?: boolean;
  offlineMessage?: string;
}) {
  const { patientName: contextName, isOnline: contextOnline } = useVisitInfo();
  const patientName = patientNameProp ?? contextName;
  const isOnline = isOnlineProp ?? contextOnline;
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  return (
    <>
      {!isOnline && <OfflineBanner message={offlineMessage} />}
      <header className="bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] px-6 h-[72px] flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => token && navigate(`/visit/${token}`)}
          disabled={!token}
          aria-label="חזרה לדף הבית"
          className="h-[44px] flex items-center bg-transparent border-none p-0 outline-none"
          style={{ WebkitTapHighlightColor: 'transparent', cursor: token ? 'pointer' : 'default' }}
        >
          <img src={logo} alt="MedAssist" className="h-[28px] object-contain block pointer-events-none select-none" />
        </button>
        {patientName ? (
          <div className="flex items-center gap-2.5">
            <span className="text-base font-semibold text-text">שלום, {patientName}</span>
            <span className="w-9 h-9 rounded-full bg-[#CCFBF1] flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
          </div>
        ) : (
          children
        )}
      </header>
    </>
  );
}
