import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useVisitPhase } from '../context/VisitPhaseContext';

// ─── Icon components (thin-stroke SVG, 24×24 viewBox) ─────────────────────────

function IconChecklist({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'stroke-width 200ms ease' }}
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
      style={{ transition: 'stroke-width 200ms ease' }}
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
      style={{ transition: 'stroke-width 200ms ease' }}
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
      style={{ transition: 'stroke-width 200ms ease' }}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// ─── Tab definitions ───────────────────────────────────────────────────────────

type TabDef = {
  id: string;
  label: string;
  pathSuffix: string | null;
  icon: (props: { active: boolean }) => React.ReactElement;
  enabled: boolean;
};

// Active teal: #0d9488 — refined medical teal, distinct from generic blue
const TEAL = '#0d9488';
const TEAL_PILL = 'rgba(13, 148, 136, 0.09)';

const TABS: TabDef[] = [
  {
    id: 'checklist',
    label: 'הכנה מקדימה',
    pathSuffix: 'checklist',
    icon: IconChecklist,
    enabled: true,
  },
  {
    id: 'navigation',
    label: 'ניווט',
    pathSuffix: 'navigation',
    icon: IconNavigation,
    enabled: true,
  },
  {
    id: 'waiting',
    label: 'המתנה',
    pathSuffix: 'waiting',
    icon: IconClock,
    enabled: true,
  },
  {
    id: 'soon',
    label: 'בקרוב',
    pathSuffix: null,
    icon: IconUser,
    enabled: false,
  },
];

// ─── BottomNav ─────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useParams<{ token: string }>();
  const phase = useVisitPhase();

  function isTabUnlocked(tabId: string): boolean {
    // Checklist always accessible — must come before null guard (no flash on load)
    if (tabId === 'checklist') return true;
    if (!phase) return false;
    if (tabId === 'navigation') return phase === 'navigation' || phase === 'waiting';
    if (tabId === 'waiting') return phase === 'waiting';
    return false;
  }

  return (
    <nav
      aria-label="ניווט ראשי"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        // Subtle mint-green tinted frosted glass
        background: 'rgba(236, 252, 248, 0.94)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '1px solid rgba(20, 184, 166, 0.18)',
        boxShadow: '0 -4px 28px rgba(13, 148, 136, 0.07), 0 -1px 0 rgba(20, 184, 166, 0.1)',
        display: 'flex',
        alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 100,
        width: '100%',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {TABS.map((tab) => {
        const fullPath = token && tab.pathSuffix ? `/visit/${token}/${tab.pathSuffix}` : null;
        const isActive = fullPath ? location.pathname === fullPath : false;
        const isEnabled = tab.enabled && isTabUnlocked(tab.id);

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
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              minHeight: '64px',
              padding: '8px 2px 10px',
              background: 'transparent',
              border: 'none',
              cursor: isEnabled ? 'pointer' : 'default',
              color: isActive ? TEAL : '#94a3b8',
              opacity: isEnabled ? 1 : 0.38,
              position: 'relative',
              transition: 'color 180ms ease, opacity 250ms ease',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            {/* Active pill background */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: '5px 6px',
                borderRadius: '10px',
                background: isActive ? TEAL_PILL : 'transparent',
                transition: 'background 180ms ease',
                pointerEvents: 'none',
              }}
            />

            {/* Active dot above icon */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 6,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: isActive ? TEAL : 'transparent',
                transition: 'background 180ms ease',
                pointerEvents: 'none',
              }}
            />

            {/* Icon */}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: isActive ? 'scale(1.09)' : 'scale(1)',
                transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                position: 'relative',
              }}
            >
              <tab.icon active={isActive} />
            </span>

            {/* Label — min 1rem per constitution */}
            <span
              style={{
                fontSize: '1rem',
                fontWeight: isActive ? 600 : 400,
                lineHeight: 1.1,
                letterSpacing: isActive ? '-0.01em' : '0',
                transition: 'color 180ms ease',
                position: 'relative',
                textAlign: 'center',
                maxWidth: '72px',
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
