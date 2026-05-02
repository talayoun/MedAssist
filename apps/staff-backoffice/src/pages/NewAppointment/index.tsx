import React, { useState } from 'react';
import { createAppointment, CreateAppointmentBody, ApiError } from '../../services/api';
import type { Department } from '@medassist/shared-types';

type Category = 'bring' | 'fast' | 'medication' | 'other';

interface CustomItemDraft {
  text: string;
  category: Category;
  time_sensitive: boolean;
}

interface Props {
  departments: Department[];
  defaultDepartmentId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onCreated: (result: { magic_link_token: string | null; sms_status: string }) => void;
}

export default function NewAppointment({
  departments,
  defaultDepartmentId,
  isAdmin,
  onClose,
  onCreated,
}: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId ?? '');
  const [procedureType, setProcedureType] = useState('pre-op-cardiac');
  const [visitDatetime, setVisitDatetime] = useState(defaultVisitDateTime());
  const [customItems, setCustomItems] = useState<CustomItemDraft[]>([]);
  const [sendNow, setSendNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCustomItem() {
    setCustomItems((prev) => [
      ...prev,
      { text: '', category: 'other', time_sensitive: false },
    ]);
  }

  function updateCustomItem(index: number, patch: Partial<CustomItemDraft>) {
    setCustomItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeCustomItem(index: number) {
    setCustomItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('נא להזין שם מטופל'); return; }
    const normalizedPhone = normalizeIsraeliPhone(phone.trim());
    if (!normalizedPhone) { setError('מספר טלפון לא תקין (למשל 0526068400)'); return; }
    if (!departmentId) { setError('נא לבחור מחלקה'); return; }
    if (!procedureType.trim()) { setError('נא להזין סוג פרוצדורה'); return; }
    if (!visitDatetime) { setError('נא לבחור מועד ביקור'); return; }

    const cleanedCustomItems = customItems
      .filter((it) => it.text.trim().length > 0)
      .map((it) => ({ text: it.text.trim(), category: it.category, time_sensitive: it.time_sensitive }));

    const body: CreateAppointmentBody = {
      patient_name: name.trim(),
      phone_number: normalizedPhone,
      department_id: departmentId,
      procedure_type: procedureType.trim(),
      visit_datetime: new Date(visitDatetime).toISOString(),
      custom_items: cleanedCustomItems,
      suppressed_template_item_ids: [],
      send_now: sendNow,
    };

    setSubmitting(true);
    try {
      const result = await createAppointment(body);
      onCreated({ magic_link_token: result.magic_link_token, sms_status: result.sms_status });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'שגיאה ביצירת הפגישה');
      } else {
        setError('שגיאה ביצירת הפגישה');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>מטופל חדש</h2>
          <button onClick={onClose} style={styles.closeBtn} aria-label="סגור">×</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.field}>
            <span style={styles.label}>שם המטופל</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              autoFocus
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>טלפון</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0521234567"
              inputMode="tel"
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>מחלקה</span>
            {isAdmin ? (
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                style={styles.input}
              >
                <option value="">בחר מחלקה</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            ) : (
              <input
                value={departments.find((d) => d.id === departmentId)?.name ?? ''}
                disabled
                style={{ ...styles.input, background: '#f3f4f6' }}
              />
            )}
          </label>

          <label style={styles.field}>
            <span style={styles.label}>סוג פרוצדורה</span>
            <input
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value)}
              list="procedure-type-options"
              placeholder="pre-op-cardiac"
              style={styles.input}
              autoComplete="off"
            />
            <datalist id="procedure-type-options">
              <option value="pre-op-cardiac" />
              <option value="pre-op-orthopedic" />
              <option value="pre-op-general" />
              <option value="pre-op-gastro" />
              <option value="pre-op-neuro" />
              <option value="colonoscopy" />
              <option value="gastroscopy" />
              <option value="cataract" />
              <option value="mri" />
              <option value="biopsy" />
            </datalist>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>מועד ביקור</span>
            <input
              type="datetime-local"
              value={visitDatetime}
              onChange={(e) => setVisitDatetime(e.target.value)}
              style={styles.input}
            />
          </label>

          <div style={styles.field}>
            <span style={styles.label}>פריטי צ׳קליסט מותאמים (אופציונלי)</span>
            {customItems.map((it, i) => (
              <div key={i} style={styles.customRow}>
                <input
                  value={it.text}
                  onChange={(e) => updateCustomItem(i, { text: e.target.value })}
                  placeholder="פריט נוסף..."
                  style={{ ...styles.input, flex: 1 }}
                />
                <select
                  value={it.category}
                  onChange={(e) => updateCustomItem(i, { category: e.target.value as Category })}
                  style={styles.smallSelect}
                >
                  <option value="bring">להביא</option>
                  <option value="fast">צום</option>
                  <option value="medication">תרופות</option>
                  <option value="other">אחר</option>
                </select>
                <label style={styles.tsLabel}>
                  <input
                    type="checkbox"
                    checked={it.time_sensitive}
                    onChange={(e) => updateCustomItem(i, { time_sensitive: e.target.checked })}
                  />
                  דחוף
                </label>
                <button type="button" onClick={() => removeCustomItem(i)} style={styles.removeBtn}>×</button>
              </div>
            ))}
            <button type="button" onClick={addCustomItem} style={styles.addBtn}>+ הוסף פריט</button>
          </div>

          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
            />
            שלח SMS עכשיו (ולא לפי הזמנון)
          </label>

          {error && <p style={styles.errorMsg}>{error}</p>}

          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>ביטול</button>
            <button type="submit" disabled={submitting} style={styles.submitBtn}>
              {submitting ? 'יוצר...' : 'צור פגישה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Accepts 05XXXXXXX or +97205XXXXXXX, returns E.164 +972XXXXXXXXX or null if invalid. */
function normalizeIsraeliPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  // Local format: 0XXXXXXXXX (10 digits starting with 0)
  if (/^0\d{9}$/.test(digits)) return `+972${digits.slice(1)}`;
  // Already E.164 without +: 972XXXXXXXXX
  if (/^972\d{9}$/.test(digits)) return `+${digits}`;
  // Full E.164 with +
  if (/^\+972\d{9}$/.test(raw.trim())) return raw.trim();
  return null;
}

function defaultVisitDateTime(): string {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  // datetime-local expects local-time-without-Z "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    width: 'min(560px, 90vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    direction: 'rtl',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    color: '#6b7280',
    lineHeight: 1,
  },
  form: { padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: {
    padding: '8px 12px',
    borderRadius: 7,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    direction: 'rtl',
    fontFamily: 'inherit',
  },
  customRow: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' },
  smallSelect: {
    padding: '8px',
    borderRadius: 7,
    border: '1.5px solid #d1d5db',
    fontSize: 13,
  },
  tsLabel: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6b7280',
  },
  removeBtn: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: 6,
    width: 30,
    height: 30,
    cursor: 'pointer',
    color: '#b91c1c',
    fontSize: 18,
    lineHeight: 1,
  },
  addBtn: {
    alignSelf: 'flex-start',
    background: '#eef2ff',
    color: '#4f46e5',
    border: '1px dashed #a5b4fc',
    borderRadius: 7,
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  checkbox: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151',
  },
  errorMsg: { color: '#b91c1c', fontSize: 13, margin: 0 },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-start', marginTop: 8 },
  cancelBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14,
  },
  submitBtn: {
    padding: '8px 18px',
    background: '#1a56db',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
};
