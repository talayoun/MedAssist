import React, { useEffect, useState, useRef } from 'react';
import {
  listFormTemplates, createFormTemplate,
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

type ItemType = 'patient_upload' | 'staff_upload_sign' | 'text_field' | 'yes_no_list' | 'consent';
type Section = 'personal' | 'medical' | 'financial' | 'documents' | 'consent';

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  patient_upload: 'העלאת מסמך (מטופל)',
  staff_upload_sign: 'מסמך צוות + חתימה',
  text_field: 'שדה טקסט',
  yes_no_list: 'כן/לא + רשימה',
  consent: 'הסכמה (checkbox)',
};

const SECTION_LABELS: Record<Section, string> = {
  personal: 'פרטים אישיים',
  medical: 'מידע רפואי',
  financial: 'כספי ובירוקרטי',
  documents: 'מסמכים רפואיים',
  consent: 'הסכמות וחתימות',
};

const UPLOAD_TYPES: ItemType[] = ['patient_upload', 'staff_upload_sign'];

interface NewItemDraft {
  label: string;
  required: boolean;
  item_type: ItemType;
  section: Section;
  sub_label: string;
  placeholder: string;
  list_item_placeholder: string;
}

const defaultDraft: NewItemDraft = {
  label: '',
  required: true,
  item_type: 'patient_upload',
  section: 'documents',
  sub_label: '',
  placeholder: '',
  list_item_placeholder: '',
};

export function FormTemplates() {
  const [items, setItems] = useState<FormTemplateItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<NewItemDraft>(defaultDraft);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const draftFileRef = useRef<HTMLInputElement | null>(null);
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

  const isUploadType = UPLOAD_TYPES.includes(draft.item_type);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadType && !draftFile) {
      setSaveErr('יש להעלות קובץ PDF');
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      let created = await createFormTemplate({
        procedure_type: null,
        label: draft.label.trim(),
        item_type: draft.item_type,
        required: draft.required,
        order_index: 0,
        section: draft.section,
        sub_label: draft.sub_label.trim() || null,
        placeholder: draft.placeholder.trim() || null,
        list_item_placeholder: draft.list_item_placeholder.trim() || null,
      });
      if (isUploadType && draftFile) {
        created = await uploadFormTemplateBlank(created.id, draftFile);
      }
      setItems((prev) => [...prev, created]);
      setDraft(defaultDraft);
      setDraftFile(null);
      setShowForm(false);
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : 'שגיאה ביצירת תבנית');
    } finally {
      setSaving(false);
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
          onClick={() => { setShowForm((v) => !v); setDraftFile(null); if (draftFileRef.current) draftFileRef.current.value = ''; }}
          style={{
            padding: '8px 18px',
            background: '#0D9488',
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
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                שם הטופס
                <input
                  type="text"
                  required
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  placeholder="תעודת זהות"
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                סוג פריט
                <select
                  value={draft.item_type}
                  onChange={(e) => setDraft((d) => ({ ...d, item_type: e.target.value as ItemType }))}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                >
                  {(Object.keys(ITEM_TYPE_LABELS) as ItemType[]).map((t) => (
                    <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                קטגוריה
                <select
                  value={draft.section}
                  onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value as Section }))}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                >
                  {(Object.keys(SECTION_LABELS) as Section[]).map((s) => (
                    <option key={s} value={s}>{SECTION_LABELS[s]}</option>
                  ))}
                </select>
              </label>
            </div>

            {(draft.item_type === 'text_field' || draft.item_type === 'consent') && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                  {draft.item_type === 'consent' ? 'תת-כותרת (טקסט הסכמה)' : 'Placeholder'}
                  <input
                    type="text"
                    value={draft.item_type === 'consent' ? draft.sub_label : draft.placeholder}
                    onChange={(e) => setDraft((d) => (
                      draft.item_type === 'consent'
                        ? { ...d, sub_label: e.target.value }
                        : { ...d, placeholder: e.target.value }
                    ))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%' }}
                  />
                </label>
              </div>
            )}

            {draft.item_type === 'yes_no_list' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                  Placeholder לשורת רשימה (למשל: &quot;פרט את האלרגיה&quot;)
                  <input
                    type="text"
                    value={draft.list_item_placeholder}
                    onChange={(e) => setDraft((d) => ({ ...d, list_item_placeholder: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%' }}
                  />
                </label>
              </div>
            )}

            {isUploadType && (
              <div style={{ marginBottom: '12px' }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>קובץ PDF</span>
                <input
                  ref={draftFileRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => draftFileRef.current?.click()}
                  style={{
                    padding: '8px 16px',
                    background: draftFile ? '#CCFBF1' : '#f8fafc',
                    color: draftFile ? '#0F766E' : '#0D9488',
                    border: `1px solid ${draftFile ? '#5EEAD4' : '#cbd5e1'}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {draftFile ? draftFile.name : 'בחר קובץ PDF'}
                </button>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
              />
              טופס/מסמך חובה במילוי
            </label>
            {saveErr && <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '8px' }}>{saveErr}</p>}
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 20px',
                background: '#0D9488',
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
      ) : items.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 24px', color: '#64748b' }}>
          <p style={{ fontSize: '15px', marginBottom: 8 }}>אין תבניות טפסים עדיין.</p>
          <p style={{ fontSize: '13px' }}>לחץ על &quot;+ תבנית חדשה&quot; כדי להוסיף את הטופס הראשון.</p>
        </div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>שם הטופס</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>חובה</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>PDF</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 600 }}>מחק</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 4px', fontWeight: 600 }}>{item.label}</td>
                  <td style={{ padding: '10px 4px', textAlign: 'center' }}>{item.required ? '✓' : ''}</td>
                  <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                    {!UPLOAD_TYPES.includes(item.item_type as ItemType) ? (
                      <span style={{ color: '#cbd5e1' }}>—</span>
                    ) : item.blank_form_url ? (
                      <button
                        type="button"
                        onClick={() => window.open(item.blank_form_url!, '_blank')}
                        style={{
                          padding: '3px 10px',
                          background: '#CCFBF1',
                          color: '#0F766E',
                          border: '1px solid #5EEAD4',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        צפה ב-PDF
                      </button>
                    ) : (
                      <>
                        <input
                          ref={(el) => { if (el) uploadRefs.current[item.id] = el; }}
                          type="file"
                          accept="application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleBlankUpload(item, f); e.target.value = ''; } }}
                        />
                        <button
                          type="button"
                          onClick={() => uploadRefs.current[item.id]?.click()}
                          style={{
                            padding: '3px 10px',
                            background: '#f8fafc',
                            color: '#94a3b8',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          העלה PDF
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
      )}
    </div>
  );
}
