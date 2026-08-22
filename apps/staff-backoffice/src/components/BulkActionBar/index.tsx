import type { CSSProperties } from 'react';

interface Props {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}

/**
 * Renders only above 1 selected row: a single selected row already has its own
 * per-row delete button, so a bulk action there would be redundant. Change the
 * threshold to `count < 1` if that turns out to feel wrong in use.
 */
export function BulkActionBar({ count, onDelete, onClear }: Props) {
  if (count <= 1) return null;
  return (
    <div style={s.bar}>
      <span style={s.count}>{count} נבחרו</span>
      <button onClick={onDelete} style={s.dangerBtn}>מחק נבחרים</button>
      <button onClick={onClear} style={s.clearBtn}>נקה בחירה</button>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  bar: {
    direction: 'rtl', display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', marginBottom: 12, borderRadius: 8,
    background: '#F0FDFA', border: '1px solid #5EEAD4',
  },
  count: { fontWeight: 600, color: '#0F766E', marginInlineEnd: 'auto' },
  dangerBtn: {
    padding: '8px 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
    background: '#dc2626', color: '#fff', fontSize: 14,
  },
  clearBtn: {
    padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
    background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', fontSize: 14,
  },
};
