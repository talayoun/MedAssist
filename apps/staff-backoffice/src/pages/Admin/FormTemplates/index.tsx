import React, { useEffect, useState, useRef } from 'react';
import {
  listFormTemplates, createFormTemplate, patchFormTemplate,
  deleteFormTemplate, uploadFormTemplateBlank, ApiError,
} from '../../../services/api';
import type { FormTemplateItemDTO } from '@medassist/shared-types';

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px 24px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  marginBottom: '24px',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  patient_upload: 'העלאה על ידי מטופל',
  staff_upload_sign: 'PDF לחתימה',
};

interface NewItemDraft {
  procedure_type: string;
  label: string;
  item_type: 'patient_upload' | 'staff_upload_sign';
  required: boolean;
  order_index: number;
}

const defaultDraft: NewItemDraft = {
  procedure_type: '',
  label: '',
  item_type: 'patient_upload',
  required: true,
  order_index: 0,
};

export function FormTemplates() {
  const [items, setItems] = useState<FormTemplateItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<NewItemDraft>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: tpls } = await listFormTemplates();
      setItems(tpls);
    } catch {
      setError('שגיאה בטעינת תבניות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveErr(null);
    try {
      const created = await createFormTemplate({
        procedure_type: draft.procedure_type.trim() || null,
        label: draft.label.trim(),
        item_type: draft.item_type,
        required: draft.required,
        order_index: draft.order_index,
      });
      setItems((prev) => [...prev, created]);
      setDraft(defaultDraft);
      setShowForm(false);
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : 'שגיאה ביצירת תבנית');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: FormTemplateItemDTO) => {
    try {
      const updated = await patchFormTemplate(item.id, { is_active: !item.is_active });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('למחוק תבנית זו?')) return;
    setDeleteErr(null);
    try {
      await deleteFormTemplate(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setDeleteErr('שגיאה במחיקת התבנית');
    }
  };

  const handleBlankUpload = async (item: FormTemplateItemDTO, file: File) => {
    try {
      const updated = await uploadFormTemplateBlank(item.id, file);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      // non-fatal
    }
  };

  const grouped = items.reduce<Record<string, FormTemplateItemDTO[]>>((acc, item) => {
    const key = item.procedure_type ?? '(כל הסוגים)';
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div style={{
      maxWidth: '900px',
      margin: '32px auto',
      padding: '0 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      direction: 'rtl',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>תבניות טפסים</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          style={{
            padding: '8px 18px',
            background: '#1b3a6b',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {showForm ? 'ביטול' : '+ תבנית חדשה'}
        </button>
      </div>

      {showForm && (
        <div style={card}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>תבנית חדשה</h2>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                סוג הפרוצדורה (ריק = כללי)
                <input
                  type="text"
                  value={draft.procedure_type}
                  onChange={(e) => setDraft((d) => ({ ...d, procedure_type: e.target.value }))}
                  placeholder="pre-op-cardiac"
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                תווית
                <input
                  type="text"
                  required
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  placeholder="תעודת זהות"
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                סוג פריט
                <select
                  value={draft.item_type}
                  onChange={(e) => setDraft((d) => ({ ...d, item_type: e.target.value as NewItemDraft['item_type'] }))}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                >
                  <option value="patient_upload">העלאה על ידי מטופל</option>
                  <option value="staff_upload_sign">PDF לחתימה</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                סדר
                <input
                  type="number"
                  value={draft.order_index}
                  onChange={(e) => setDraft((d) => ({ ...d, order_index: parseInt(e.target.value, 10) || 0 }))}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
              />
              חובה
            </label>
            {saveErr && <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '8px' }}>{saveErr}</p>}
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 20px',
                background: '#1b3a6b',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
                fontSize: '14px',
              }}
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </form>
        </div>
      )}

      {deleteErr && <p style={{ color: '#dc2626', marginBottom: '16px' }}>{deleteErr}</p>}

      {loading ? (
        <p style={{ color: '#64748b' }}>טוען...</p>
      ) : error ? (
        <p style={{ color: '#dc2626' }}>{error}</p>
      ) : (
        Object.entries(grouped).map(([procedureType, groupItems]) => (
          <div key={procedureType} style={card}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '12px', color: '#475569' }}>
              {procedureType}
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>תווית</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>סוג</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>חובה</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>פעיל</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>PDF בסיס</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px' }}></th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 4px', fontWeight: 600 }}>{item.label}</td>
                    <td style={{ padding: '10px 4px', color: '#64748b' }}>{ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>{item.required ? '✓' : ''}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        style={{
                          padding: '3px 10px',
                          background: item.is_active ? '#dcfce7' : '#f1f5f9',
                          color: item.is_active ? '#166534' : '#64748b',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {item.is_active ? 'פעיל' : 'כבוי'}
                      </button>
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                      {item.item_type === 'staff_upload_sign' && (
                        <>
                          <input
                            ref={(el) => { uploadRefs.current[item.id] = el; }}
                            type="file"
                            accept="application/pdf"
                            style={{ display: 'none' }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBlankUpload(item, f); }}
                          />
                          <button
                            type="button"
                            onClick={() => uploadRefs.current[item.id]?.click()}
                            style={{
                              padding: '3px 10px',
                              background: item.blank_form_url ? '#dbeafe' : '#f8fafc',
                              color: item.blank_form_url ? '#1d4ed8' : '#94a3b8',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            {item.blank_form_url ? 'החלף PDF' : 'העלה PDF'}
                          </button>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        style={{
                          padding: '3px 10px',
                          background: 'transparent',
                          color: '#ef4444',
                          border: '1px solid #fca5a5',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
