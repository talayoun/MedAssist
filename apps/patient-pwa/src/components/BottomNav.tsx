import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useVisitPhase } from '../context/VisitPhaseContext';

function IconChecklist({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round" strokeLinejoin="round"
      className="transition-[stroke-width] duration-200"
    >
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v0Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconNavigation({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round" strokeLinejoin="round"
      className="transition-[stroke-width] duration-200"
    >
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}

function IconClock({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round" strokeLinejoin="round"
      className="transition-[stroke-width] duration-200"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconUser({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round" strokeLinejoin="round"
      className="transition-[stroke-width] duration-200"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

type TabDef = {
  id: string;
  label: string;
  pathSuffix: string | null;
  icon: (props: { active: boolean }) => React.ReactElement;
  enabled: boolean;
};

const TABS: TabDef[] = [
  { id: 'checklist', label: 'הכנה מקדימה', pathSuffix: 'checklist', icon: IconChecklist, enabled: true },
  { id: 'navigation', label: 'ניווט', pathSuffix: 'navigation', icon: IconNavigation, enabled: true },
  { id: 'waiting', label: 'המתנה', pathSuffix: 'waiting', icon: IconClock, enabled: true },
  { id: 'soon', label: 'בקרוב', pathSuffix: null, icon: IconUser, enabled: false },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useParams<{ token: string }>();
  const phase = useVisitPhase();

  if (!phase) return null;

  function isTabUnlocked(tabId: string): boolean {
    if (tabId === 'checklist') return true;
    if (!phase) return false;
    if (tabId === 'navigation') return phase === 'navigation' || phase === 'waiting';
    if (tabId === 'waiting') return phase === 'waiting';
    return false;
  }

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed bottom-0 left-0 right-0 z-[100] w-full flex items-stretch border-t border-teal/20 bg-[rgba(236,252,248,0.94)] shadow-[0_-4px_28px_rgba(13,148,136,0.07),0_-1px_0_rgba(20,184,166,0.1)] backdrop-blur-[20px] backdrop-saturate-[180%]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map((tab) => {
        const fullPath = token && tab.pathSuffix ? `/visit/${token}/${tab.pathSuffix}` : null;
        const isActive = fullPath ? location.pathname === fullPath : false;
        const isLocked = !tab.enabled || !isTabUnlocked(tab.id);
        const isEnabled = !isLocked;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (isEnabled && fullPath) navigate(fullPath);
            }}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            aria-disabled={!isEnabled}
            tabIndex={isEnabled ? 0 : -1}
            className={`relative flex-1 flex flex-col items-center justify-center gap-[3px] min-h-16 px-0.5 py-2 pb-2.5 bg-transparent border-none text-base transition-colors duration-150 ${
              isActive ? 'text-teal' : 'text-[#94a3b8]'
            } ${isEnabled ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ opacity: isEnabled ? 1 : 0.38, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-[5px_6px] rounded-[10px] transition-colors duration-150 pointer-events-none ${
                isActive ? 'bg-teal/[0.09]' : 'bg-transparent'
              }`}
            />
            <span
              aria-hidden="true"
              className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-colors duration-150 pointer-events-none ${
                isActive ? 'bg-teal' : 'bg-transparent'
              }`}
            />
            <span
              className={`relative flex items-center justify-center transition-transform duration-200 ${isActive ? 'scale-[1.09]' : 'scale-100'}`}
            >
              <tab.icon active={isActive} />
              {isLocked && (
                <span className="absolute -top-1 -right-1 bg-[#94a3b8] rounded-full w-4 h-4 flex items-center justify-center">
                  <IconLock />
                </span>
              )}
            </span>
            <span
              className={`relative text-center max-w-[72px] leading-[1.1] transition-colors duration-150 ${
                isActive ? 'font-semibold -tracking-[0.01em]' : 'font-normal'
              }`}
              style={{ fontSize: '1rem' }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
