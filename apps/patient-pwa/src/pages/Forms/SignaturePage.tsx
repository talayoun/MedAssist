import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SignatureCanvas, clearCanvas } from '../../components/SignatureCanvas';
import { submitFormSignature } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';

export function SignaturePage() {
  const { token, itemId } = useParams<{ token: string; itemId: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (!token || !itemId) {
    return <main className="p-4">Invalid parameters</main>;
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
      reader.onerror = () => { setError('שגיאה בקריאת הקובץ'); setSubmitting(false); };
      reader.readAsDataURL(blob);
    }, 'image/png');
  };

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <main className="max-w-[480px] mx-auto p-4">
        <div className="bg-white border-2 border-border rounded-2xl p-5">
          <div className="mb-4 text-right">
            <div className="text-[18px] font-semibold text-text">חתימה</div>
            <div className="text-sm text-text-muted mt-1">חתום בתוך המסגרת</div>
          </div>

          <SignatureCanvas canvasRef={canvasRef} onDraw={() => setHasDrawn(true)} />

          <div className="flex gap-3 mt-4 flex-row-reverse">
            <Button
              variant="ghost"
              size="medium"
              onClick={() => { if (canvasRef.current) clearCanvas(canvasRef.current); setHasDrawn(false); }}
            >
              נקה
            </Button>
            <Button variant="primary" size="medium" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'שולח...' : 'שמור חתימה'}
            </Button>
          </div>
        </div>

        {error && <p className="text-error mt-3 text-right">{error}</p>}
      </main>
    </div>
  );
}
