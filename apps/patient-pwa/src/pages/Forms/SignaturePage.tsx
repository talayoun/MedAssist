import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SignatureCanvas, clearCanvas } from '../../components/SignatureCanvas';
import { submitFormSignature } from '../../services/api';

export function SignaturePage() {
  const { token, itemId } = useParams<{ token: string; itemId: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (!token || !itemId) {
    return <main style={{ padding: '16px' }}>Invalid parameters</main>;
  }

  const handleSubmit = () => {
    if (!canvasRef.current || !hasDrawn) {
      setError('אנא חתום בתיבה');
      return;
    }
    setSubmitting(true);
    setError(null);
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) {
        setError('שגיאה ביצירת החתימה');
        setSubmitting(false);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          await submitFormSignature(token, itemId, base64);
          navigate(`/visit/${token}/checklist`);
        } catch {
          setError('שגיאה בשמירת החתימה');
        } finally {
          setSubmitting(false);
        }
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  };

  return (
    <main style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '16px' }}>חתימת הסכמה</h1>

      <p style={{ marginBottom: '12px', color: '#475569' }}>חתום בתיבה למטה:</p>
      <SignatureCanvas canvasRef={canvasRef} onDraw={() => setHasDrawn(true)} />

      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        <button
          type="button"
          onClick={() => { if (canvasRef.current) clearCanvas(canvasRef.current); setHasDrawn(false); }}
          style={{
            flex: 1,
            minHeight: '44px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            color: '#475569',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          נקה
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            flex: 1,
            minHeight: '44px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.5 : 1,
            fontSize: '1rem',
          }}
        >
          {submitting ? 'שולח...' : 'שלח חתימה'}
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', marginTop: '12px' }}>{error}</p>}
    </main>
  );
}
