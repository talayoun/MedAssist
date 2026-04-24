import React, { useEffect, useState, useCallback } from 'react';
import {
  listChecklists, getChecklist, createChecklist, updateChecklist, deleteChecklist,
  ChecklistItemInput, ApiError,
} from '../../services/api';
import type { ChecklistTemplate } from '@medassist/shared-types';

type Category = 'bring' | 'fast' | 'medication' | 'other';

const CATEGORY_LABELS: Record<Category, string> = {
  bring: 'להביא',
  fast: 'צום',
  medication: 'תרופות',
  other: 'אחר',
};

interface ItemDraft extends ChecklistItemInput {
  _key: string;
}

interface EditState {
  templateId: string | null; // null = new
  procedureType: string;
  items: ItemDraft[];
}

export default function Admin() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { templates: tpls } = await listChecklists(showArchived);
      setTemplates(tpls);
    } catch {
      setError('שגיאה בטעינת תבניות');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  function openNew() {
    setEditError(null);
    setEditState({ templateId: null, procedureType: '', items: [] });
  }

  async function openEdit(templateId: string) {
    setEditError(null);
    try {
      const tpl = await getChecklist(templateId);
      const items: ItemDraft[] = (tpl.items ?? []).map((it, i) => ({ ...it, _key: `k${i}` }));
      setEditState({ templateId, procedureType: tpl.procedure_type, items });
    } catch {
      setError('שגיאה בטעינת תבנית');
    }
  }

  function addItem() {
    setEditState((prev) => prev && ({
      ...prev,
      items: [...prev.items, { _key: `k${Date.now()}`, text: '', category: 'other', time_sensitive: false }],
    }));
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setEditState((prev) => prev && ({
      ...prev,
      items: prev.items.map((it) => it._key === key ? { ...it, ...patch } : it),
    }));
  }

  function removeItem(key: string) {
    setEditState((prev) => prev && ({ ...prev, items: prev.items.filter((it) => it._key !== key) }));
  }

  function moveItem(key: string, dir: -1 | 1) {
    setEditState((prev) => {
      if (!prev) return prev;
      const idx = prev.items.findIndex((it) => it._key === key);
      if (idx + dir < 0 || idx + dir >= prev.items.length) return prev;
      const items = [...prev.items];
      [items[idx], items[idx + dir]] = [items[idx + dir], items[idx]];
      return { ...prev, items };
    });
  }

  async function handleSave() {
    if (!editState) return;
    setEditError(null);
    if (!editState.procedureType.trim()) { setEditError('נא להזין סוג פרוצדורה'); return; }
    const cleanItems: ChecklistItemInput[] = editState.items
      .filter((it) => it.text.trim())
      .map(({ _key: _k, ...it }) => ({ ...it, text: it.text.trim() }));

    setSaving(true);
    try {
      if (editState.templateId) {
        await updateChecklist(editState.templateId, {
          procedure_type: editState.procedureType.trim(),
          items: cleanItems,
        });
      } else {
        await createChecklist(editState.procedureType.trim(), cleanItems);
      }
      setEditState(null);
      await fetchTemplates();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEditError('סוג פרוצדורה זה כבר קיים');
      } else {
        setEditError('שגיאה בשמירה');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(templateId: string) {
    setDeleteError(null);
    try {
      const result = await deleteChecklist(templateId);
      setConfirmDeleteId(null);
      if (result.archived) {
        setError('התבנית הועברה לארכיון (יש מטופלים שסיימו שמשתמשים בה)');
      }
      await fetchTemplates();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError('יש מטופלים פעילים המשתמשים בתבנית זו. לא ניתן למחוק.');
      } else {
        setDeleteError('שגיאה במחיקה');
      }
    }
  }

  return (
    <div style={s.page}>
      <h1 style={s.heading}>ניהול — תבניות צ׳קליסט</h1>

      <div style={s.toolbar}>
        <button onClick={openNew} style={s.primaryBtn}>+ תבנית חדשה</button>
        <label style={s.archiveToggle}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          הצג מאורכבים
        </label>
      </div>

      {error && <p style={s.errorBanner}>{error}</p>}

      {loading ? (
        <p style={s.hint}>טוען...</p>
      ) : templates.length === 0 ? (
        <p style={s.hint}>אין תבניות. לחץ "תבנית חדשה" כדי ליצור.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>סוג פרוצדורה</th>
              <th style={s.th}>פריטים</th>
              <th style={s.th}>סטטוס</th>
              <th style={s.th}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.template_id} style={tpl.archived ? s.archivedRow : undefined}>
                <td style={s.td}>{tpl.procedure_type}</td>
                <td style={s.td}>{tpl.item_count}</td>
                <td style={s.td}>
                  {tpl.archived
                    ? <span style={s.archivedBadge}>בארכיון</span>
                    : <span style={s.activeBadge}>פעיל</span>}
                </td>
                <td style={s.td}>
                  {!tpl.archived && (
                    <>
                      <button onClick={() => openEdit(tpl.template_id)} style={s.editBtn}>עריכה</button>
                      <button onClick={() => { setDeleteError(null); setConfirmDeleteId(tpl.template_id); }} style={s.deleteBtn}>מחיקה</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Edit / Create modal */}
      {editState && (
        <div style={s.backdrop} onClick={() => setEditState(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>{editState.templateId ? 'עריכת תבנית' : 'תבנית חדשה'}</h2>
              <button onClick={() => setEditState(null)} style={s.closeBtn}>×</button>
            </div>

            <div style={s.modalBody}>
              <label style={s.fieldLabel}>סוג פרוצדורה</label>
              <input
                value={editState.procedureType}
                onChange={(e) => setEditState((p) => p && ({ ...p, procedureType: e.target.value }))}
                style={s.input}
                autoFocus
                placeholder="pre-op-cardiac"
              />

              <div style={s.itemsHeader}>
                <span style={s.fieldLabel}>פריטים ({editState.items.length})</span>
                <button type="button" onClick={addItem} style={s.addBtn}>+ הוסף פריט</button>
              </div>

              {editState.items.map((it, idx) => (
                <div key={it._key} style={s.itemRow}>
                  <div style={s.itemMoveCol}>
                    <button type="button" disabled={idx === 0} onClick={() => moveItem(it._key, -1)} style={s.moveBtn}>↑</button>
                    <button type="button" disabled={idx === editState.items.length - 1} onClick={() => moveItem(it._key, 1)} style={s.moveBtn}>↓</button>
                  </div>
                  <input
                    value={it.text}
                    onChange={(e) => updateItem(it._key, { text: e.target.value })}
                    placeholder="טקסט הפריט..."
                    style={{ ...s.input, flex: 1 }}
                  />
                  <select
                    value={it.category}
                    onChange={(e) => updateItem(it._key, { category: e.target.value as Category })}
                    style={s.smallSelect}
                  >
                    {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  <label style={s.tsLabel}>
                    <input
                      type="checkbox"
                      checked={it.time_sensitive}
                      onChange={(e) => updateItem(it._key, { time_sensitive: e.target.checked })}
                    />
                    דחוף
                  </label>
                  <button type="button" onClick={() => removeItem(it._key)} style={s.removeBtn}>×</button>
                </div>
              ))}

              {editError && <p style={s.errorMsg}>{editError}</p>}

              <div style={s.modalActions}>
                <button onClick={() => setEditState(null)} style={s.cancelBtn}>ביטול</button>
                <button onClick={handleSave} disabled={saving} style={s.primaryBtn}>
                  {saving ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div style={s.backdrop} onClick={() => setConfirmDeleteId(null)}>
          <div style={{ ...s.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>מחיקת תבנית</h2>
              <button onClick={() => setConfirmDeleteId(null)} style={s.closeBtn}>×</button>
            </div>
            <div style={s.modalBody}>
              <p>האם אתה בטוח שברצונך למחוק תבנית זו?</p>
              <p style={s.hint}>אם יש מטופלים שסיימו שהשתמשו בה, היא תועבר לארכיון.</p>
              {deleteError && <p style={s.errorMsg}>{deleteError}</p>}
              <div style={s.modalActions}>
                <button onClick={() => setConfirmDeleteId(null)} style={s.cancelBtn}>ביטול</button>
                <button onClick={() => handleDelete(confirmDeleteId)} style={s.dangerBtn}>מחק</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, direction: 'rtl', fontFamily: 'inherit', maxWidth: 900, margin: '0 auto' },
  heading: { fontSize: 22, fontWeight: 700, margin: '0 0 20px' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 },
  archiveToggle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', cursor: 'pointer' },
  hint: { color: '#6b7280', fontSize: 14 },
  errorBanner: { background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 7, fontSize: 13, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'right', padding: '8px 12px', borderBottom: '2px solid #e5e7eb', fontSize: 13, fontWeight: 700, color: '#374151' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 14, verticalAlign: 'middle' },
  archivedRow: { opacity: 0.5 },
  activeBadge: { background: '#d1fae5', color: '#065f46', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 },
  archivedBadge: { background: '#f3f4f6', color: '#6b7280', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 },
  editBtn: { marginLeft: 6, padding: '4px 10px', background: 'transparent', color: '#1b3a6b', border: '1.5px solid #1b3a6b', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  deleteBtn: { padding: '4px 10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', background: '#1b3a6b', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer' },
  dangerBtn: { padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, width: 'min(640px, 90vw)', maxHeight: '90vh', overflowY: 'auto', direction: 'rtl', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: { background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280', lineHeight: 1 },
  modalBody: { padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-start', marginTop: 8 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { padding: '8px 12px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: 14, direction: 'rtl', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  itemsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { alignSelf: 'flex-start', background: 'rgba(59,196,196,0.08)', color: '#2a9b9b', border: '1px dashed #3bc4c4', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  itemRow: { display: 'flex', gap: 6, alignItems: 'center' },
  itemMoveCol: { display: 'flex', flexDirection: 'column', gap: 2 },
  moveBtn: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 },
  smallSelect: { padding: '7px 6px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: 13 },
  tsLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' },
  removeBtn: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: '#b91c1c', fontSize: 16, lineHeight: 1, flexShrink: 0 },
  errorMsg: { color: '#b91c1c', fontSize: 13, margin: 0 },
};
