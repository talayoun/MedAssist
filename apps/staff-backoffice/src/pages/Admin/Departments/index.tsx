import React, { useEffect, useState } from 'react';
import { listDepartments, patchDepartmentArrival, ApiError } from '../../../services/api';
import type { DepartmentArrivalInfo } from '@medassist/shared-types';

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px 24px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  marginBottom: '24px',
};

interface EditDraft {
  address: string;
  parking_info: string;
  transit_info: string;
  map_lat: string;
  map_lng: string;
}

function toDraft(dept: DepartmentArrivalInfo): EditDraft {
  return {
    address: dept.address ?? '',
    parking_info: dept.parking_info ?? '',
    transit_info: dept.transit_info ?? '',
    map_lat: dept.map_lat != null ? String(dept.map_lat) : '',
    map_lng: dept.map_lng != null ? String(dept.map_lng) : '',
  };
}

function truncate(text: string | null, max = 40): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function Departments() {
  const [departments, setDepartments] = useState<DepartmentArrivalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { departments: depts } = await listDepartments();
      setDepartments(depts);
    } catch {
      setError('שגיאה בטעינת מחלקות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  function startEdit(dept: DepartmentArrivalInfo) {
    setEditingId(dept.id);
    setDraft(toDraft(dept));
    setSaveErr(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setSaveErr(null);
  }

  async function handleSave(id: string) {
    if (!draft) return;
    const lat = draft.map_lat.trim() === '' ? null : Number(draft.map_lat);
    const lng = draft.map_lng.trim() === '' ? null : Number(draft.map_lng);
    if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
      setSaveErr('קואורדינטות חייבות להיות מספרים');
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const updated = await patchDepartmentArrival(id, {
        address: draft.address.trim() || null,
        parking_info: draft.parking_info.trim() || null,
        transit_info: draft.transit_info.trim() || null,
        map_lat: lat,
        map_lng: lng,
      });
      setDepartments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      cancelEdit();
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      maxWidth: '900px',
      margin: '32px auto',
      padding: '0 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      direction: 'rtl',
    }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>פרטי הגעה למחלקות</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '6px' }}>
          כתובת, חניה, תחבורה ציבורית ומיקום במפה — מוצג למטופל לפני שלבי הניווט בתוך בית החולים.
        </p>
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }}>טוען...</p>
      ) : error ? (
        <p style={{ color: '#dc2626' }}>{error}</p>
      ) : departments.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 24px', color: '#64748b' }}>
          <p style={{ fontSize: '15px' }}>אין מחלקות מוגדרות עדיין.</p>
        </div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>מחלקה</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>כתובת</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>חניה</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>ערוך</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <React.Fragment key={dept.id}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 4px', fontWeight: 600 }}>{dept.name}</td>
                    <td style={{ padding: '10px 4px', color: '#475569' }}>{truncate(dept.address)}</td>
                    <td style={{ padding: '10px 4px', color: '#475569' }}>{truncate(dept.parking_info)}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => (editingId === dept.id ? cancelEdit() : startEdit(dept))}
                        style={{
                          padding: '4px 14px',
                          background: editingId === dept.id ? '#f8fafc' : '#CCFBF1',
                          color: editingId === dept.id ? '#64748b' : '#0F766E',
                          border: `1px solid ${editingId === dept.id ? '#e2e8f0' : '#5EEAD4'}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {editingId === dept.id ? 'סגור' : 'ערוך'}
                      </button>
                    </td>
                  </tr>
                  {editingId === dept.id && draft && (
                    <tr>
                      <td colSpan={4} style={{ padding: '4px 4px 20px' }}>
                        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                            כתובת
                            <input
                              value={draft.address}
                              onChange={(e) => setDraft((d) => d && ({ ...d, address: e.target.value }))}
                              placeholder="רחוב הרופאים 15, תל אביב"
                              style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                            חניה
                            <input
                              value={draft.parking_info}
                              onChange={(e) => setDraft((d) => d && ({ ...d, parking_info: e.target.value }))}
                              placeholder="חניון מבקרים בקומה -1, כניסה מרחוב הרופאים"
                              style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                            תחבורה ציבורית
                            <input
                              value={draft.transit_info}
                              onChange={(e) => setDraft((d) => d && ({ ...d, transit_info: e.target.value }))}
                              placeholder="קווי אוטובוס 12, 45 — תחנה &quot;בית החולים&quot;"
                              style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                            />
                          </label>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                              קו רוחב (lat)
                              <input
                                value={draft.map_lat}
                                onChange={(e) => setDraft((d) => d && ({ ...d, map_lat: e.target.value }))}
                                placeholder="32.0641"
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                              />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                              קו אורך (lng)
                              <input
                                value={draft.map_lng}
                                onChange={(e) => setDraft((d) => d && ({ ...d, map_lng: e.target.value }))}
                                placeholder="34.7756"
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                              />
                            </label>
                          </div>
                          {saveErr && <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }}>{saveErr}</p>}
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
                            <button
                              type="button"
                              onClick={() => handleSave(dept.id)}
                              disabled={saving}
                              style={{
                                padding: '8px 20px',
                                background: '#0D9488',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: saving ? 'not-allowed' : 'pointer',
                                opacity: saving ? 0.6 : 1,
                                fontSize: '13px',
                              }}
                            >
                              {saving ? 'שומר...' : 'שמור'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              style={{
                                padding: '8px 20px',
                                background: '#fff',
                                color: '#374151',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '13px',
                              }}
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
