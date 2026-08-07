import { useEffect, useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { getForms, uploadFormImage, uploadFormPdf, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import { Card } from '../../components/ui/Card';
import type { FormItemDTO } from '@medassist/shared-types';

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

  const statusLabel = {
    pending: 'ממתין',
    staff_uploaded: 'ממתין לחתימה',
    patient_submitted: 'הועלה',
  }[item.status];

  const isComplete = item.status === 'patient_submitted';

  return (
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
  );
}

export default function Forms() {
  const { token } = useParams<{ token: string }>();
  const [formItems, setFormItems] = useState<FormItemDTO[]>([]);
  const [formsLoadErr, setFormsLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getForms(token)
      .then(({ items }) => setFormItems(items))
      .catch(() => setFormsLoadErr('שגיאה בטעינת מסמכים'));
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <AppHeader />
      <div className="max-w-[480px] w-full mx-auto px-4 pt-4 pb-8">
        <div className="text-right mb-6">
          <h1 className="text-[28px] font-bold text-text mb-2">מסמכים</h1>
          <p className="text-base text-text-muted">מסמכים ותמונות שיש להעלות לפני הביקור</p>
        </div>

        {formsLoadErr && <p className="text-error text-base mb-3">{formsLoadErr}</p>}

        {!formsLoadErr && formItems.length === 0 && (
          <p className="text-text-muted text-base">אין מסמכים הדורשים העלאה כרגע</p>
        )}

        <div className="space-y-3">
          {formItems.map((item) => (
            <FormDocumentItem
              key={item.id}
              item={item}
              token={token!}
              onUpdate={(updated) => setFormItems((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
