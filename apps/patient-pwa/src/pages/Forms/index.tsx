import { useEffect, useState, useRef, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getForms, uploadFormImage, uploadFormPdf, deleteFormDocument, setFormValue, ApiError,
} from '../../services/api';
import AppHeader from '../../components/AppHeader';
import { Card } from '../../components/ui/Card';
import { InputField } from '../../components/ui/InputField';
import { useVisitInfo } from '../../context/VisitPhaseContext';
import type { FormItemDTO } from '@medassist/shared-types';

type Section = 'personal' | 'medical' | 'financial' | 'documents' | 'consent';

const SECTION_ORDER: { key: Section; label: string }[] = [
  { key: 'personal', label: 'פרטים אישיים' },
  { key: 'medical', label: 'מידע רפואי' },
  { key: 'financial', label: 'כספי ובירוקרטי' },
  { key: 'documents', label: 'מסמכים רפואיים' },
  { key: 'consent', label: 'הסכמות וחתימות' },
];

// Values the visit already holds, matched to intake fields by label: template items
// have no field key, only Hebrew text. The patient table stores nothing else usable
// (name and phone only, and no template asks for the phone), so this is the whole list.
const PREFILL_RULES: { match: RegExp; from: (info: { patientName: string | null }) => string | null }[] = [
  { match: /^שם\s*(מלא)?$/, from: (info) => info.patientName },
];

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// ─── Text field / consent / yes-no-list: patient-entered intake data ────────

function TextFieldItem({ item, token, onUpdate }: { item: FormItemDTO; token: string; onUpdate: (u: FormItemDTO) => void }) {
  const initial = (item.value as { text?: string } | null)?.text ?? '';
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);

  // A value that arrives after mount (the name prefill lands once the visit resolves)
  // must reach the input, but never over something the patient has already typed.
  useEffect(() => {
    setText((prev) => (prev === '' && initial !== '' ? initial : prev));
  }, [initial]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await setFormValue(token, item.id, { item_type: 'text_field', value: { text } });
      onUpdate(updated);
    } catch {
      // non-fatal, keep local text, retry on next blur
    } finally {
      setSaving(false);
    }
  }, [token, item.id, text, onUpdate]);

  return (
    <Card className="!p-4">
      <InputField
        label={item.label}
        placeholder={item.placeholder ?? undefined}
        value={text}
        onChange={setText}
        onBlur={save}
      />
      {saving && <span className="text-xs text-text-muted">שומר...</span>}
    </Card>
  );
}

function YesNoListItem({ item, token, onUpdate }: { item: FormItemDTO; token: string; onUpdate: (u: FormItemDTO) => void }) {
  const initial = item.value as { answer?: boolean; items?: string[] } | null;
  const [answer, setAnswer] = useState(initial?.answer ?? false);
  const [entries, setEntries] = useState<string[]>(initial?.items?.length ? initial.items : ['']);

  const persist = useCallback(
    async (nextAnswer: boolean, nextEntries: string[]) => {
      try {
        const updated = await setFormValue(token, item.id, {
          item_type: 'yes_no_list',
          value: { answer: nextAnswer, items: nextAnswer ? nextEntries.filter((e) => e.trim()) : [] },
        });
        onUpdate(updated);
      } catch {
        // non-fatal
      }
    },
    [token, item.id, onUpdate]
  );

  const handleAnswer = (val: boolean) => {
    setAnswer(val);
    persist(val, entries);
  };

  const updateEntry = (i: number, value: string) => {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? value : e)));
  };

  const addEntry = () => setEntries((prev) => [...prev, '']);
  const removeEntry = (i: number) => setEntries((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Card className="!p-4">
      <p className="text-[17px] font-semibold text-text text-right mb-3">{item.label}</p>
      <div className="flex gap-3 justify-end mb-3">
        <button
          type="button"
          onClick={() => handleAnswer(true)}
          className={`min-h-11 px-6 rounded-xl text-base font-bold border-2 ${
            answer ? 'bg-teal border-teal text-white' : 'bg-white border-border text-text'
          }`}
        >
          כן
        </button>
        <button
          type="button"
          onClick={() => handleAnswer(false)}
          className={`min-h-11 px-6 rounded-xl text-base font-bold border-2 ${
            !answer ? 'bg-teal border-teal text-white' : 'bg-white border-border text-text'
          }`}
        >
          לא
        </button>
      </div>
      {answer && (
        <div className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 flex-row-reverse">
              <input
                type="text"
                dir="rtl"
                value={entry}
                placeholder={item.list_item_placeholder ?? undefined}
                onChange={(e) => updateEntry(i, e.target.value)}
                onBlur={() => persist(answer, entries)}
                className="flex-1 h-12 px-4 rounded-xl border-2 border-border focus:border-teal focus:outline-none text-base text-text text-right"
              />
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => { removeEntry(i); persist(answer, entries.filter((_, idx) => idx !== i)); }}
                  className="min-w-11 min-h-11 flex items-center justify-center text-error"
                  aria-label="הסר"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addEntry}
            className="min-h-11 border-2 border-dashed border-teal text-teal rounded-xl text-base font-semibold"
          >
            + הוסף שורה
          </button>
        </div>
      )}
    </Card>
  );
}

function ConsentItem({ item, token, onUpdate }: { item: FormItemDTO; token: string; onUpdate: (u: FormItemDTO) => void }) {
  const initial = (item.value as { accepted?: boolean } | null)?.accepted ?? false;
  const [accepted, setAccepted] = useState(initial);

  const toggle = async () => {
    const next = !accepted;
    setAccepted(next);
    try {
      const updated = await setFormValue(token, item.id, { item_type: 'consent', value: { accepted: next } });
      onUpdate(updated);
    } catch {
      setAccepted(!next);
    }
  };

  return (
    <Card
      className="!p-4 flex items-start gap-3 flex-row-reverse cursor-pointer"
      onClick={toggle}
    >
      <div
        role="checkbox"
        aria-checked={accepted}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        className={`w-11 h-11 rounded-lg flex items-center justify-center border-2 flex-shrink-0 ${
          accepted ? 'bg-success border-success' : 'bg-white border-border'
        }`}
      >
        {accepted && (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <div className="flex-1 text-right">
        <p className="text-[17px] font-semibold text-text">{item.label}</p>
        {item.sub_label && <p className="text-base text-text-muted mt-1">{item.sub_label}</p>}
      </div>
    </Card>
  );
}

// ─── Documents: patient_upload / staff_upload_sign ───────────────────────────

function FormDocumentItem({
  item,
  token,
  onUpdate,
}: {
  item: FormItemDTO;
  token: string;
  onUpdate: (updated: FormItemDTO) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const updated = await uploadFormImage(token, item.id, file);
      onUpdate(updated as unknown as FormItemDTO);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'שגיאה בהעלאה');
    } finally {
      setUploading(false);
    }
  };

  const handlePdfChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const updated = await uploadFormPdf(token, item.id, file);
      onUpdate(updated as unknown as FormItemDTO);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'שגיאה בהעלאה');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const updated = await deleteFormDocument(token, item.id);
      onUpdate(updated);
      setConfirmDelete(false);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'שגיאה במחיקה');
    } finally {
      setDeleting(false);
    }
  };

  const statusLabel = {
    pending: 'ממתין',
    staff_uploaded: 'ממתין לחתימה',
    patient_submitted: 'הועלה',
  }[item.status];

  const isComplete = item.status === 'patient_submitted';

  return (
    <>
      <Card variant={isComplete ? 'success' : 'default'} className="flex items-center justify-between gap-3 !p-4">
        <span className="flex-1 text-[17px] font-semibold text-text text-right">{item.label}</span>
        <div className="flex items-center gap-2.5">
          {uploadError && <span className="text-xs text-error">{uploadError}</span>}
          <span className={`text-[13px] whitespace-nowrap ${isComplete ? 'text-success' : 'text-[#718096]'}`}>{statusLabel}</span>
          {item.item_type === 'patient_upload' && !isComplete && (
            <>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <button
                type="button"
                data-testid="form-action-btn"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className={`min-w-11 min-h-11 px-4 bg-teal text-white rounded-[10px] text-base font-bold flex items-center justify-center ${
                  uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {uploading ? '...' : 'העלה תמונה'}
              </button>
              <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfChange} />
              <button
                type="button"
                data-testid="form-action-pdf-btn"
                disabled={uploading}
                onClick={() => pdfInputRef.current?.click()}
                className={`min-w-11 min-h-11 px-4 bg-white border border-teal text-teal rounded-[10px] text-base font-bold flex items-center justify-center ${
                  uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {uploading ? '...' : 'העלה PDF'}
              </button>
            </>
          )}
          {item.item_type === 'patient_upload' && isComplete && (
            <button
              type="button"
              data-testid="form-action-delete-btn"
              onClick={() => setConfirmDelete(true)}
              className="min-w-11 min-h-11 px-3 bg-white border border-error text-error rounded-[10px] flex items-center justify-center"
              aria-label="מחק קובץ"
            >
              <TrashIcon />
            </button>
          )}
          {item.item_type === 'staff_upload_sign' && item.status === 'staff_uploaded' && (
            <a
              href={`/visit/${token}/forms/${item.id}`}
              data-testid="form-action-btn"
              className="min-w-11 min-h-11 px-4 bg-[#7c3aed] text-white rounded-[10px] text-base font-bold flex items-center justify-center no-underline"
            >
              חתום
            </a>
          )}
        </div>
      </Card>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ background: 'rgba(15, 23, 42, 0.55)' }}
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-[480px] bg-white rounded-t-3xl p-6 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-border rounded-full mb-2" />
            <div className="w-16 h-16 rounded-full bg-[#fef2f2] flex items-center justify-center text-error">
              <TrashIcon />
            </div>
            <h3 className="text-xl font-bold text-text">מחיקת קובץ</h3>
            <p className="text-base text-text-muted text-center">האם אתה בטוח שברצונך למחוק את הקובץ?</p>
            <div className="w-full flex flex-col gap-3 mt-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="w-full min-h-14 bg-error text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2"
              >
                <TrashIcon />
                <span>{deleting ? 'מוחק...' : 'מחק קובץ'}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="w-full min-h-14 bg-white border border-border rounded-2xl text-base font-bold text-text"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function renderItem(item: FormItemDTO, token: string, onUpdate: (u: FormItemDTO) => void) {
  switch (item.item_type) {
    case 'text_field':
      return <TextFieldItem key={item.id} item={item} token={token} onUpdate={onUpdate} />;
    case 'yes_no_list':
      return <YesNoListItem key={item.id} item={item} token={token} onUpdate={onUpdate} />;
    case 'consent':
      return <ConsentItem key={item.id} item={item} token={token} onUpdate={onUpdate} />;
    default:
      return <FormDocumentItem key={item.id} item={item} token={token} onUpdate={onUpdate} />;
  }
}

// A required item blocks the CTA only when the patient has a control to act on.
// A staff_upload_sign item still at 'pending' has no rendered affordance (staff has
// not uploaded the blank form yet), gating on it would strand the patient here.
function blocksSubmit(item: FormItemDTO): boolean {
  if (!item.required || item.status === 'patient_submitted') return false;
  if (item.item_type === 'staff_upload_sign' && item.status === 'pending') return false;
  return true;
}

export default function Forms() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isOnline, patientName } = useVisitInfo();
  const [formItems, setFormItems] = useState<FormItemDTO[]>([]);
  const [formsLoadErr, setFormsLoadErr] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const sectionRefs = useRef<Partial<Record<Section, HTMLDivElement | null>>>({});
  const prefilled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    getForms(token)
      .then(({ items }) => setFormItems(items))
      .catch(() => setFormsLoadErr('שגיאה בטעינת מסמכים'));
  }, [token]);

  // Fill in what the visit already knows so the patient never retypes it. The visit
  // fetch and the forms fetch race, so this runs again when the name lands; the ref
  // keeps it from re-sending a value it has already saved.
  useEffect(() => {
    if (!token || formItems.length === 0) return;
    const info = { patientName };

    formItems.forEach((item) => {
      if (item.item_type !== 'text_field') return;
      if (prefilled.current.has(item.id)) return;
      if (((item.value as { text?: string } | null)?.text ?? '').trim() !== '') return;

      const text = PREFILL_RULES.find((r) => r.match.test(item.label))?.from(info);
      if (!text) return;

      prefilled.current.add(item.id);
      setFormValue(token, item.id, { item_type: 'text_field', value: { text } })
        .then(handleUpdate)
        .catch(() => prefilled.current.delete(item.id));
    });
  }, [token, patientName, formItems]);

  const handleUpdate = (updated: FormItemDTO) => {
    setSubmitError(null);
    setFormItems((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  const handleSubmit = () => {
    if (!token) return;
    const missing = formItems.filter(blocksSubmit);
    if (missing.length > 0) {
      setSubmitError('יש להשלים את כל השדות המסומנים כחובה לפני המשך לניווט');
      document.getElementById(`form-item-${missing[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    navigate(`/visit/${token}/navigation`);
  };

  const sections = SECTION_ORDER.filter(({ key }) => formItems.some((i) => i.section === key));

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <AppHeader offlineMessage="אין חיבור לאינטרנט, לא ניתן לשלוח טפסים" />
      <div className="max-w-[480px] w-full mx-auto px-4 pt-4 pb-8">
        <div className="text-right mb-4">
          <h1 className="text-[28px] font-bold text-text mb-2">מסמכים</h1>
          <p className="text-base text-text-muted">מסמכים ותמונות שיש להעלות לפני הביקור</p>
        </div>

        {sections.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
            {sections.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="shrink-0 min-h-11 px-4 rounded-full border-2 border-teal text-teal bg-[#F0FDFA] text-sm font-semibold whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {formsLoadErr && <p className="text-error text-base mb-3">{formsLoadErr}</p>}

        {!formsLoadErr && formItems.length === 0 && (
          <p className="text-text-muted text-base">אין מסמכים הדורשים העלאה כרגע</p>
        )}

        {sections.map(({ key, label }) => (
          <div key={key} ref={(el) => { sectionRefs.current[key] = el; }} className="mb-6 scroll-mt-4">
            <h2 className="text-[20px] font-semibold text-text mb-3 text-right">{label}</h2>
            <div className="space-y-3">
              {formItems
                .filter((i) => i.section === key)
                .map((item) => (
                  <div key={item.id} id={`form-item-${item.id}`} className="scroll-mt-4">
                    {renderItem(item, token!, handleUpdate)}
                  </div>
                ))}
            </div>
          </div>
        ))}

        {submitError && (
          <p data-testid="forms-submit-error" role="alert" className="text-error text-base text-right mt-2">
            {submitError}
          </p>
        )}

        {formItems.length > 0 && (
          <button
            type="button"
            data-testid="forms-submit-btn"
            disabled={!isOnline}
            onClick={handleSubmit}
            className="w-full h-[64px] rounded-2xl font-bold text-[20px] flex items-center justify-center gap-3 shadow-md bg-teal hover:bg-teal-hover text-white disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>המשך לניווט</span>
          </button>
        )}
      </div>
    </div>
  );
}
