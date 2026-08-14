import type { CSSProperties, ReactNode } from 'react';

interface Props {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title, body, confirmLabel, danger = true, busy = false, error = null, onConfirm, onCancel,
}: Props) {
  return (
    <div style={s.backdrop} onClick={onCancel}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{title}</h2>
          <button onClick={onCancel} style={s.closeBtn}>×</button>
        </div>
        <div style={s.modalBody}>
          {body}
          {error && <p style={s.error}>{error}</p>}
          <div style={s.modalActions}>
            <button onClick={onCancel} style={s.cancelBtn} disabled={busy}>ביטול</button>
            <button
              onClick={onConfirm}
              style={danger ? s.dangerBtn : s.primaryBtn}
              disabled={busy}
            >
              {busy ? 'מבצע...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Values lifted verbatim from src/pages/Admin/index.tsx so nothing shifts visually.
const s: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, width: 'min(640px, 90vw)', maxHeight: '90vh', overflowY: 'auto', direction: 'rtl', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: { background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280', lineHeight: 1 },
  modalBody: { padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-start', marginTop: 8 },
  cancelBtn: { padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer' },
  dangerBtn: { padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  error: { color: '#b91c1c', fontSize: 13, margin: 0 },
};
