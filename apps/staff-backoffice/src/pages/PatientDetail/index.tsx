import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getStaffForms, staffUploadConsent, exportForms, getAppointment, ApiError,
  type AppointmentDetail,
} from '../../services/api';
import type { StaffFormsResponseDTO, FormItemDTO } from '@medassist/shared-types';

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px 24px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#f1f5f9', text: '#64748b' },
  staff_uploaded: { bg: '#fef9c3', text: '#854d0e' },
  patient_submitted: { bg: '#dcfce7', text: '#166534' },
};

const statusLabels: Record<string, string> = {
  pending: 'ממתין',
  staff_uploaded: 'הועלה על ידי צוות',
  patient_submitted: 'הוגש על ידי מטופל',
};

function FormItemRow({ item, appointmentId, onUpdate }: {
  item: FormItemDTO;
  appointmentId: string;
  onUpdate: (updated: FormItemDTO) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const colors = statusColors[item.status] ?? statusColors.pending;

  const handleConsentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const updated = await staffUploadConsent(appointmentId, item.id, file);
      onUpdate(updated);
    } catch (err) {
      setUploadErr(err instanceof ApiError ? err.message : 'שגיאה בהעלאה');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      gap: '12px',
      marginBottom: '8px',
    }}>
      <span style={{ fontWeight: 600, flex: 1, fontSize: '14px' }}>{item.label}</span>
      <span style={{
        fontSize: '12px',
        background: colors.bg,
        color: colors.text,
        padding: '3px 10px',
        borderRadius: '12px',
        whiteSpace: 'nowrap',
        fontWeight: 600,
      }}>
        {statusLabels[item.status] ?? item.status}
      </span>
      {item.item_type === 'staff_upload_sign' && item.status === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={handleConsentUpload}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            style={{
              padding: '6px 14px',
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {uploading ? 'מעלה...' : 'העלה PDF'}
          </button>
          {uploadErr && <span style={{ fontSize: '12px', color: '#dc2626' }}>{uploadErr}</span>}
        </div>
      )}
      {item.item_type === 'staff_upload_sign' && item.status === 'staff_uploaded' && item.staff_file_url && (
        <a
          href={item.staff_file_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '6px 14px',
            background: '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          צפה
        </a>
      )}
    </div>
  );
}

export default function PatientDetail() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const [apptData, setApptData] = useState<AppointmentDetail | null>(null);
  const [formsData, setFormsData] = useState<StaffFormsResponseDTO | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    Promise.all([
      getAppointment(appointmentId),
      getStaffForms(appointmentId),
    ]).then(([appt, forms]) => {
      setApptData(appt);
      setFormsData(forms);
    }).catch((err) => {
      setLoadErr(err instanceof ApiError ? err.message : 'שגיאה בטעינת נתונים');
    });
  }, [appointmentId]);

  const handleExport = async () => {
    if (!appointmentId || exporting) return;
    setExporting(true);
    setExportErr(null);
    const newTab = window.open('about:blank', '_blank');
    try {
      const { pdf_url } = await exportForms(appointmentId);
      if (newTab) newTab.location.href = pdf_url;
    } catch {
      newTab?.close();
      setExportErr('שגיאה בייצוא');
    } finally {
      setExporting(false);
    }
  };

  const handleUpdate = (updated: FormItemDTO) => {
    setFormsData((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev
    );
  };

  if (!appointmentId) return <div style={{ padding: '24px' }}>מזהה תור חסר</div>;

  return (
    <div style={{
      maxWidth: '800px',
      margin: '32px auto',
      padding: '0 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      direction: 'rtl',
    }}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/queue')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#1b3a6b',
          fontSize: '14px',
          fontWeight: 600,
          padding: '4px 0',
          marginBottom: '16px',
        }}
      >
{'חזרה לתור ←'}
      </button>

      {/* Patient info header */}
      {apptData && (
        <div style={{ ...card, marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '2px' }}>שם מטופל</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{apptData.patient_name}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '2px' }}>מחלקה</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{apptData.department_name}</div>
            </div>
            {apptData.procedure_type && (
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '2px' }}>פרוצדורה</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{apptData.procedure_type}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents card */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>מסמכים</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(formsData?.new_since_last_export ?? 0) > 0 && (
              <span style={{
                background: '#dc2626',
                color: '#fff',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 700,
              }}>
                {formsData!.new_since_last_export} חדשים
              </span>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              style={{
                padding: '8px 16px',
                background: '#1b3a6b',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer',
                opacity: exporting ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {exporting ? 'מייצא...' : 'ייצא PDF'}
            </button>
          </div>
        </div>

        {exportErr && <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{exportErr}</p>}

        {loadErr ? (
          <p style={{ color: '#dc2626', fontSize: '14px' }}>{loadErr}</p>
        ) : !formsData ? (
          <p style={{ color: '#64748b', fontSize: '14px' }}>טוען מסמכים...</p>
        ) : formsData.items.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '14px' }}>אין מסמכים לתור זה</p>
        ) : (
          formsData.items.map((item) => (
            <FormItemRow
              key={item.id}
              item={item}
              appointmentId={appointmentId}
              onUpdate={handleUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}
