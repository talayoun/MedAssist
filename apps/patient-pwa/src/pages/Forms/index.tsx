import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import {
  listForms, getForm, saveFormDraft, uploadFormImage, submitSignature, submitForm, ApiError,
} from '../../services/api';
import AppHeader from '../../components/AppHeader';

const TEAL = '#0D9488';
const TEAL_HOVER = '#0F766E';
const FALLBACK_FORM_ID = 'intake';

const HEALTH_FUNDS = [
  { value: 'clalit', label: 'כללית' },
  { value: 'maccabi', label: 'מכבי' },
  { value: 'meuhedet', label: 'מאוחדת' },
  { value: 'leumit', label: 'לאומית' },
];

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f7fafc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  content: { maxWidth: '480px', margin: '0 auto', width: '100%', padding: '24px 16px 40px' } as React.CSSProperties,
  header: { textAlign: 'right', marginBottom: '20px' } as React.CSSProperties,
  h1: { fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' } as React.CSSProperties,
  subheader: { fontSize: '1rem', color: '#475569' } as React.CSSProperties,
  card: {
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
    padding: '20px',
    marginBottom: '20px',
  } as React.CSSProperties,
  cardTitle: { fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', marginBottom: '16px', textAlign: 'right' } as React.CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' } as React.CSSProperties,
  label: { fontSize: '0.9375rem', fontWeight: 600, color: '#374151', textAlign: 'right' } as React.CSSProperties,
  input: {
    minHeight: '44px',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1.5px solid #e2e8f0',
    fontSize: '1rem',
    textAlign: 'right',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  select: {
    minHeight: '44px',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1.5px solid #e2e8f0',
    fontSize: '1rem',
    textAlign: 'right',
    boxSizing: 'border-box',
    background: '#fff',
  } as React.CSSProperties,
  savedNote: { fontSize: '0.8125rem', color: '#16a34a', textAlign: 'right', minHeight: '18px' } as React.CSSProperties,
  photoBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    minHeight: '52px',
    background: '#f0fdfa',
    border: `1.5px dashed ${TEAL}`,
    borderRadius: '12px',
    color: TEAL_HOVER,
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
  photoPreview: { width: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: '12px', marginTop: '12px', display: 'block' } as React.CSSProperties,
  consentText: { fontSize: '0.9375rem', color: '#374151', textAlign: 'right', lineHeight: 1.6, marginBottom: '14px' } as React.CSSProperties,
  sigWrap: { border: '1.5px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#fff' } as React.CSSProperties,
  sigActions: { display: 'flex', justifyContent: 'flex-end', marginTop: '10px' } as React.CSSProperties,
  clearBtn: {
    minHeight: '40px',
    padding: '8px 16px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    minHeight: '64px',
    background: TEAL,
    color: '#fff',
    border: 'none',
    borderRadius: '16px',
    fontSize: '1.25rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(13,148,136,0.35)',
  } as React.CSSProperties,
  errorText: { color: '#c00', fontSize: '0.875rem', textAlign: 'right', marginBottom: '12px' } as React.CSSProperties,
  submittedCard: {
    background: '#f0fdf4',
    borderInlineStart: '4px solid #16a34a',
    borderRadius: '16px',
    padding: '28px',
    textAlign: 'center',
  } as React.CSSProperties,
};

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Forms() {
  const { token } = useParams<{ token: string }>();
  const formIdRef = useRef(FALLBACK_FORM_ID);
  const sigRef = useRef<SignatureCanvas>(null);

  const [loading, setLoading] = useState(true);
  const [idNumber, setIdNumber] = useState('');
  const [dob, setDob] = useState('');
  const [healthFund, setHealthFund] = useState('');
  const [savedNote, setSavedNote] = useState(false);

  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [uploadingCard, setUploadingCard] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [hasSignature, setHasSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Hydrate an existing draft if one is already provisioned server-side.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { forms } = await listForms(token);
        const existing = forms[0];
        if (!existing) return;
        formIdRef.current = existing.form_id;
        const detail = await getForm(token, existing.form_id);
        const data = detail.fields.reduce<Record<string, unknown>>((acc, f) => {
          acc[f.id] = f.value;
          return acc;
        }, {});
        if (typeof data.id_number === 'string') setIdNumber(data.id_number);
        if (typeof data.date_of_birth === 'string') setDob(data.date_of_birth);
        if (typeof data.health_fund === 'string') setHealthFund(data.health_fund);
        const cardImage = detail.captured_images.find((img) => img.id === 'health_fund_card');
        if (cardImage?.url) setCardImagePreview(cardImage.url);
        if (detail.signature_data) setHasSignature(true);
        if (detail.submitted) setSubmitted(true);
      } catch {
        // No form provisioned yet on the server — continue with a blank local draft.
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const saveDraft = useCallback(async (next: { idNumber: string; dob: string; healthFund: string }) => {
    if (!token) return;
    try {
      await saveFormDraft(token, formIdRef.current, {
        id_number: next.idNumber,
        date_of_birth: next.dob,
        health_fund: next.healthFund,
      });
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2000);
    } catch {
      // Backend draft endpoint not available yet — the field stays filled locally.
    }
  }, [token]);

  const handleCardCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    const reader = new FileReader();
    reader.onload = () => setCardImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    setUploadingCard(true);
    setUploadError(null);
    try {
      await uploadFormImage(token, formIdRef.current, file);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message || 'שגיאה בהעלאת התמונה' : 'שגיאה בהעלאת התמונה');
    } finally {
      setUploadingCard(false);
    }
  }, [token]);

  const handleSignatureEnd = useCallback(async () => {
    if (!token || !sigRef.current || sigRef.current.isEmpty()) return;
    setHasSignature(true);
    setSignatureError(null);
    const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png');
    try {
      await submitSignature(token, formIdRef.current, dataUrl);
    } catch (err) {
      setSignatureError(err instanceof ApiError ? err.message || 'שגיאה בשמירת החתימה' : 'שגיאה בשמירת החתימה');
    }
  }, [token]);

  const handleClearSignature = useCallback(() => {
    sigRef.current?.clear();
    setHasSignature(false);
  }, []);

  const allRequiredFilled = idNumber.trim().length > 0 && dob.trim().length > 0 && healthFund.length > 0 && cardImagePreview !== null && hasSignature;

  const handleSubmit = useCallback(async () => {
    if (!token || !allRequiredFilled || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveDraft({ idNumber, dob, healthFund });
      await submitForm(token, formIdRef.current);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message || 'שגיאה בשליחת הטופס' : 'שגיאה בשליחת הטופס');
    } finally {
      setSubmitting(false);
    }
  }, [token, allRequiredFilled, submitting, saveDraft, idNumber, dob, healthFund]);

  if (loading) {
    return (
      <div style={{ ...styles.page, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>טוען טופס...</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={styles.page}>
        <AppHeader />
        <div style={styles.content}>
          <div style={styles.submittedCard}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a', marginBottom: '8px' }}>✓ הטופס נשלח</div>
            <p style={{ fontSize: '1.0625rem', color: '#475569' }}>הפרטים שלך התקבלו בהצלחה. תודה!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <AppHeader />
      <div style={styles.content}>
        <div style={styles.header}>
          <h1 style={styles.h1}>טופס קבלה</h1>
          <p style={styles.subheader}>נא להשלים את הפרטים החסרים לפני הביקור</p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>פרטים אישיים</h2>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="id-number">מספר תעודת זהות</label>
            <input
              id="id-number"
              type="text"
              inputMode="numeric"
              maxLength={9}
              dir="ltr"
              style={{ ...styles.input, textAlign: 'left' }}
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
              onBlur={() => saveDraft({ idNumber, dob, healthFund })}
              placeholder="123456789"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="dob">תאריך לידה</label>
            <input
              id="dob"
              type="date"
              style={styles.input}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              onBlur={() => saveDraft({ idNumber, dob, healthFund })}
            />
          </div>

          <div style={{ ...styles.field, marginBottom: 0 }}>
            <label style={styles.label} htmlFor="health-fund">קופת חולים</label>
            <select
              id="health-fund"
              style={styles.select}
              value={healthFund}
              onChange={(e) => setHealthFund(e.target.value)}
              onBlur={() => saveDraft({ idNumber, dob, healthFund })}
            >
              <option value="">בחר קופת חולים...</option>
              {HEALTH_FUNDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <p style={styles.savedNote}>{savedNote ? '✓ נשמר' : ''}</p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>צילום כרטיס קופת חולים</h2>
          <label style={styles.photoBtn}>
            <span>{uploadingCard ? 'מעלה...' : cardImagePreview ? 'צלם שוב' : '📷 צלם כרטיס'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCardCapture}
              style={{ display: 'none' }}
            />
          </label>
          {uploadError && <p style={styles.errorText}>{uploadError}</p>}
          {cardImagePreview && <img src={cardImagePreview} alt="תצוגה מקדימה של כרטיס קופת חולים" style={styles.photoPreview} />}
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>חתימה על טופס הסכמה כללי</h2>
          <p style={styles.consentText}>
            הנני מאשר/ת כי קראתי והבנתי את תנאי הטיפול, ומסכים/ה לקבל את הטיפול הרפואי המוצע לי במהלך הביקור.
          </p>
          <div style={styles.sigWrap}>
            <SignatureCanvas
              ref={sigRef}
              penColor={TEAL}
              onEnd={handleSignatureEnd}
              canvasProps={{ width: 400, height: 160, style: { width: '100%', height: '160px', touchAction: 'none' } }}
            />
          </div>
          <div style={styles.sigActions}>
            <button type="button" style={styles.clearBtn} onClick={handleClearSignature}>נקה חתימה</button>
          </div>
          {signatureError && <p style={styles.errorText}>{signatureError}</p>}
        </div>

        {submitError && <p style={styles.errorText}>{submitError}</p>}

        <button
          type="button"
          style={{ ...styles.submitBtn, opacity: allRequiredFilled && !submitting ? 1 : 0.5 }}
          onClick={handleSubmit}
          disabled={!allRequiredFilled || submitting}
        >
          <CheckIcon />
          <span>{submitting ? 'שולח...' : 'שליחה'}</span>
        </button>
      </div>
    </div>
  );
}
