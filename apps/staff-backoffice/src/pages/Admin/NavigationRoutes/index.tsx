import React, { useEffect, useState, useCallback } from 'react';
import {
  listNavigationRoutes, getNavigationRoute,
  createNavigationRoute, updateNavigationRoute, deleteNavigationRoute,
  addNavigationStep, updateNavigationStep, deleteNavigationStep, reorderNavigationSteps,
  getDepartments, ApiError,
} from '../../../services/api';
import type { AdminRoute, AdminRouteStep, Department } from '@medassist/shared-types';

interface StepDraft {
  _key: string;
  step_id?: string;        // present for persisted steps
  image_url: string;
  instruction_text: string;
}

interface EditState {
  routeId: string | null;  // null = new
  name: string;
  from_department_id: string | null;
  to_department_id: string;
  is_default: boolean;
  steps: StepDraft[];
  originalOrderIds?: string[]; // ids in original DB order, for reorder diff
}

export default function NavigationRoutes() {
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [routesRes, deptRes] = await Promise.all([
        listNavigationRoutes(showArchived),
        getDepartments(),
      ]);
      setRoutes(routesRes.routes);
      setDepartments(deptRes.departments);
    } catch {
      setError('שגיאה בטעינת מסלולים');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function deptName(id: string | null): string {
    if (!id) return 'כניסה ראשית / קבלה';
    return departments.find((d) => d.id === id)?.name ?? '—';
  }

  function openNew() {
    setEditError(null);
    setEditState({
      routeId: null,
      name: '',
      from_department_id: null,
      to_department_id: departments[0]?.id ?? '',
      is_default: false,
      steps: [],
    });
  }

  async function openEdit(routeId: string) {
    setEditError(null);
    try {
      const route = await getNavigationRoute(routeId);
      const steps: StepDraft[] = (route.steps ?? []).map((s, i) => ({
        _key: `k${i}`,
        step_id: s.step_id,
        image_url: s.image_url,
        instruction_text: s.instruction,
      }));
      setEditState({
        routeId,
        name: route.name,
        from_department_id: route.from_department_id,
        to_department_id: route.to_department_id,
        is_default: route.is_default,
        steps,
        originalOrderIds: steps.map((s) => s.step_id!).filter(Boolean),
      });
    } catch {
      setError('שגיאה בטעינת מסלול');
    }
  }

  function addStep() {
    setEditState((prev) => prev && ({
      ...prev,
      steps: [...prev.steps, { _key: `k${Date.now()}`, image_url: '', instruction_text: '' }],
    }));
  }

  function updateStep(key: string, patch: Partial<StepDraft>) {
    setEditState((prev) => prev && ({
      ...prev,
      steps: prev.steps.map((s) => s._key === key ? { ...s, ...patch } : s),
    }));
  }

  function removeStep(key: string) {
    setEditState((prev) => prev && ({ ...prev, steps: prev.steps.filter((s) => s._key !== key) }));
  }

  function moveStep(key: string, dir: -1 | 1) {
    setEditState((prev) => {
      if (!prev) return prev;
      const idx = prev.steps.findIndex((s) => s._key === key);
      if (idx + dir < 0 || idx + dir >= prev.steps.length) return prev;
      const steps = [...prev.steps];
      [steps[idx], steps[idx + dir]] = [steps[idx + dir], steps[idx]];
      return { ...prev, steps };
    });
  }

  async function handleSave() {
    if (!editState) return;
    setEditError(null);
    if (!editState.name.trim()) { setEditError('נא להזין שם למסלול'); return; }
    if (!editState.to_department_id) { setEditError('נא לבחור מחלקת יעד'); return; }
    if (editState.steps.length > 20) { setEditError('מקסימום 20 צעדים'); return; }
    for (const s of editState.steps) {
      if (!s.image_url.trim() || !s.instruction_text.trim()) {
        setEditError('כל צעד חייב URL תמונה והוראה');
        return;
      }
      try { new URL(s.image_url); } catch {
        setEditError(`URL לא תקין: ${s.image_url}`);
        return;
      }
    }

    setSaving(true);
    try {
      if (editState.routeId === null) {
        // Create route + steps in one POST
        await createNavigationRoute({
          name: editState.name.trim(),
          from_department_id: editState.from_department_id,
          to_department_id: editState.to_department_id,
          is_default: editState.is_default,
          steps: editState.steps.map((s) => ({
            image_url: s.image_url.trim(),
            instruction_text: s.instruction_text.trim(),
          })),
        });
      } else {
        // Update route metadata
        await updateNavigationRoute(editState.routeId, {
          name: editState.name.trim(),
          from_department_id: editState.from_department_id,
          to_department_id: editState.to_department_id,
          is_default: editState.is_default,
        });

        // Diff steps:
        //   - persisted & kept → update if text/url changed
        //   - removed → delete
        //   - new (no step_id) → add
        //   - finally → reorder
        const routeId = editState.routeId;
        const original = editState.originalOrderIds ?? [];
        const currentIds = new Set(
          editState.steps.map((s) => s.step_id).filter(Boolean) as string[]
        );

        // Delete removed
        for (const oldId of original) {
          if (!currentIds.has(oldId)) {
            await deleteNavigationStep(routeId, oldId);
          }
        }

        // Add new + update kept
        const finalOrderIds: string[] = [];
        for (const s of editState.steps) {
          if (s.step_id) {
            await updateNavigationStep(routeId, s.step_id, {
              image_url: s.image_url.trim(),
              instruction_text: s.instruction_text.trim(),
            });
            finalOrderIds.push(s.step_id);
          } else {
            const created = await addNavigationStep(routeId, {
              image_url: s.image_url.trim(),
              instruction_text: s.instruction_text.trim(),
            });
            finalOrderIds.push(created.step_id);
          }
        }

        // Reorder if order changed and there are steps
        if (finalOrderIds.length > 0) {
          await reorderNavigationSteps(routeId, finalOrderIds);
        }
      }

      setEditState(null);
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'duplicate_default_route') {
        setEditError('כבר קיים מסלול ברירת-מחדל לזוג מחלקות זה');
      } else {
        setEditError('שגיאה בשמירה');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(routeId: string) {
    setDeleteError(null);
    try {
      const result = await deleteNavigationRoute(routeId);
      setConfirmDeleteId(null);
      if (result.archived) {
        setError('המסלול הועבר לארכיון (יש היסטוריה של מטופלים שהשתמשו בו)');
      }
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError('יש מטופלים פעילים המשתמשים במסלול זה. לא ניתן למחוק.');
      } else {
        setDeleteError('שגיאה במחיקה');
      }
    }
  }

  return (
    <div style={s.page}>
      <h1 style={s.heading}>ניהול — מסלולי ניווט</h1>

      <div style={s.toolbar}>
        <button onClick={openNew} style={s.primaryBtn}>+ מסלול חדש</button>
        <label style={s.archiveToggle}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          הצג מאורכבים
        </label>
      </div>

      {error && <p style={s.errorBanner}>{error}</p>}

      {loading ? (
        <p style={s.hint}>טוען...</p>
      ) : routes.length === 0 ? (
        <p style={s.hint}>אין מסלולים. לחץ "מסלול חדש" כדי ליצור.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>מקור</th>
              <th style={s.th}>יעד</th>
              <th style={s.th}>שם</th>
              <th style={s.th}>ברירת-מחדל</th>
              <th style={s.th}>צעדים</th>
              <th style={s.th}>סטטוס</th>
              <th style={s.th}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.route_id} style={r.archived ? s.archivedRow : undefined}>
                <td style={s.td}>{deptName(r.from_department_id)}</td>
                <td style={s.td}>{deptName(r.to_department_id)}</td>
                <td style={s.td}>{r.name}</td>
                <td style={s.td}>{r.is_default ? '✓' : ''}</td>
                <td style={s.td}>{r.steps_count}</td>
                <td style={s.td}>
                  {r.archived
                    ? <span style={s.archivedBadge}>בארכיון</span>
                    : <span style={s.activeBadge}>פעיל</span>}
                </td>
                <td style={s.td}>
                  {!r.archived && (
                    <>
                      <button onClick={() => openEdit(r.route_id)} style={s.editBtn}>עריכה</button>
                      <button
                        onClick={() => { setDeleteError(null); setConfirmDeleteId(r.route_id); }}
                        style={s.deleteBtn}
                      >מחיקה</button>
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
              <h2 style={s.modalTitle}>{editState.routeId ? 'עריכת מסלול' : 'מסלול חדש'}</h2>
              <button onClick={() => setEditState(null)} style={s.closeBtn}>×</button>
            </div>

            <div style={s.modalBody}>
              <label style={s.fieldLabel}>שם המסלול</label>
              <input
                value={editState.name}
                onChange={(e) => setEditState((p) => p && ({ ...p, name: e.target.value }))}
                style={s.input}
                autoFocus
                placeholder="חניון מרכזי → קרדיולוגיה"
              />

              <div style={s.deptGrid}>
                <div>
                  <label style={s.fieldLabel}>ממחלקת מקור</label>
                  <select
                    value={editState.from_department_id ?? ''}
                    onChange={(e) => setEditState((p) => p && ({
                      ...p,
                      from_department_id: e.target.value === '' ? null : e.target.value,
                    }))}
                    style={s.input}
                  >
                    <option value="">כניסה ראשית / קבלה</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={s.fieldLabel}>למחלקת יעד</label>
                  <select
                    value={editState.to_department_id}
                    onChange={(e) => setEditState((p) => p && ({ ...p, to_department_id: e.target.value }))}
                    style={s.input}
                  >
                    <option value="" disabled>— בחר —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label style={s.defaultLabel}>
                <input
                  type="checkbox"
                  checked={editState.is_default}
                  onChange={(e) => setEditState((p) => p && ({ ...p, is_default: e.target.checked }))}
                />
                הגדר כמסלול ברירת-מחדל לזוג (מקור, יעד)
              </label>

              <div style={s.itemsHeader}>
                <span style={s.fieldLabel}>צעדים ({editState.steps.length}/20)</span>
                <button
                  type="button"
                  onClick={addStep}
                  disabled={editState.steps.length >= 20}
                  style={s.addBtn}
                >+ הוסף צעד</button>
              </div>

              {editState.steps.map((s_, idx) => (
                <div key={s_._key} style={st.stepRow}>
                  <div style={st.moveCol}>
                    <button type="button" disabled={idx === 0} onClick={() => moveStep(s_._key, -1)} style={s.moveBtn}>↑</button>
                    <span style={st.orderNum}>{idx + 1}</span>
                    <button type="button" disabled={idx === editState.steps.length - 1} onClick={() => moveStep(s_._key, 1)} style={s.moveBtn}>↓</button>
                  </div>
                  <div style={st.stepFields}>
                    <input
                      value={s_.image_url}
                      onChange={(e) => updateStep(s_._key, { image_url: e.target.value })}
                      placeholder="https://..."
                      style={s.input}
                    />
                    <textarea
                      value={s_.instruction_text}
                      onChange={(e) => updateStep(s_._key, { instruction_text: e.target.value })}
                      placeholder="הוראה למטופל..."
                      style={{ ...s.input, minHeight: 60, resize: 'vertical' }}
                      maxLength={200}
                    />
                  </div>
                  <button type="button" onClick={() => removeStep(s_._key)} style={s.removeBtn}>×</button>
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
              <h2 style={s.modalTitle}>מחיקת מסלול</h2>
              <button onClick={() => setConfirmDeleteId(null)} style={s.closeBtn}>×</button>
            </div>
            <div style={s.modalBody}>
              <p>האם אתה בטוח שברצונך למחוק מסלול זה?</p>
              <p style={s.hint}>אם יש היסטוריה של מטופלים שהשתמשו בו, הוא יועבר לארכיון.</p>
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

// ─── Styles ──────────────────────────────────────────────────────────────────
// Reuse the same look-and-feel as the checklists admin page.

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, direction: 'rtl', fontFamily: 'inherit', maxWidth: 1100, margin: '0 auto' },
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
  editBtn: { marginLeft: 6, padding: '4px 10px', background: '#eef2ff', color: '#4f46e5', border: '1px solid #a5b4fc', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  deleteBtn: { padding: '4px 10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer' },
  dangerBtn: { padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, width: 'min(720px, 92vw)', maxHeight: '90vh', overflowY: 'auto', direction: 'rtl', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: { background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280', lineHeight: 1 },
  modalBody: { padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-start', marginTop: 8 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { padding: '8px 12px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: 14, direction: 'rtl', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  deptGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  defaultLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' },
  itemsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { alignSelf: 'flex-start', background: '#eef2ff', color: '#4f46e5', border: '1px dashed #a5b4fc', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  moveBtn: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 },
  removeBtn: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: '#b91c1c', fontSize: 16, lineHeight: 1, flexShrink: 0, alignSelf: 'flex-start' },
  errorMsg: { color: '#b91c1c', fontSize: 13, margin: 0 },
};

const st: Record<string, React.CSSProperties> = {
  stepRow: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: 8, background: '#f9fafb', borderRadius: 7 },
  moveCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  orderNum: { fontSize: 11, color: '#6b7280', fontWeight: 600 },
  stepFields: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 },
};
