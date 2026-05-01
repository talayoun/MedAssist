import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { randomUUID } from 'crypto';
import { query, withTransaction } from '../../db/db';
import { getObjectBuffer, uploadEncrypted, presignGet } from '../../services/s3';

export const MAX_EXPORT_ITEMS = 30;

export function computeLayout<T>(items: T[]): T[] {
  if (items.length > MAX_EXPORT_ITEMS) {
    throw Object.assign(new Error('Too many items for export'), { status: 422 });
  }
  return items;
}
const PAGE_WIDTH = 595;   // A4 pt
const PAGE_HEIGHT = 842;  // A4 pt
const MARGIN = 50;

export async function buildExport(appointmentId: string, staffId: string) {
  // 1. Fetch items with current documents
  const { rows: items } = await query(
    `SELECT
       pfi.id,
       pfi.label,
       pfi.item_type,
       pfi.status,
       pfi.staff_file_url,
       pd.file_url       AS patient_file_url,
       pd.doc_type       AS patient_doc_type
     FROM patient_form_items pfi
     LEFT JOIN patient_documents pd
       ON pd.patient_form_item_id = pfi.id AND pd.is_current = true
     WHERE pfi.appointment_id = $1
     ORDER BY pfi.order_index`,
    [appointmentId],
  );

  computeLayout(items);

  // 2. Fetch patient / appointment metadata
  const { rows: apptRows } = await query(
    `SELECT p.name AS patient_name, a.procedure_type, d.name AS department_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN departments d ON d.id = a.department_id
     WHERE a.id = $1`,
    [appointmentId],
  );
  if (!apptRows[0]) throw Object.assign(new Error('Appointment not found'), { status: 404 });
  const { patient_name, procedure_type, department_name } = apptRows[0] as {
    patient_name: string;
    procedure_type: string;
    department_name: string;
  };

  // 3. Build PDF
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const now = new Date();

  // Helper to add a text page
  function addTextPage(lines: Array<{ text: string; size: number; bold?: boolean }>) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN - 30;
    for (const { text, size, bold } of lines) {
      page.drawText(text, {
        x: MARGIN,
        y,
        size,
        font: bold ? boldFont : font,
        color: rgb(0, 0, 0),
      });
      y -= size + 8;
    }
  }

  // Header page
  addTextPage([
    { text: 'MedAssist — Patient Forms Export', size: 18, bold: true },
    { text: '', size: 8 },
    { text: `Patient: ${patient_name}`, size: 13, bold: true },
    { text: `Procedure: ${procedure_type ?? '—'}`, size: 12 },
    { text: `Department: ${department_name}`, size: 12 },
    { text: `Generated: ${now.toISOString()}`, size: 11 },
  ]);

  // Item sections (sequentially to avoid S3 pressure)
  for (const item of items) {
    const hasStaffFile = !!item.staff_file_url;
    const hasPatientFile = !!item.patient_file_url;
    if (!hasStaffFile && !hasPatientFile) continue;

    // Section header page
    addTextPage([
      { text: `Section: ${item.label}`, size: 14, bold: true },
      { text: `Type: ${item.item_type}  Status: ${item.status}`, size: 10 },
    ]);

    // Embed staff consent PDF pages
    if (hasStaffFile) {
      const pdfBytes = await getObjectBuffer(item.staff_file_url as string);
      const embedded = await PDFDocument.load(pdfBytes);
      const pageIndices = embedded.getPageIndices();
      const copiedPages = await pdf.copyPages(embedded, pageIndices);
      for (const p of copiedPages) pdf.addPage(p);
    }

    // Embed patient document (image or signature)
    if (hasPatientFile) {
      const imgBytes = await getObjectBuffer(item.patient_file_url as string);
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      let embeddedImage;
      if ((item.patient_doc_type as string) === 'signature') {
        embeddedImage = await pdf.embedPng(imgBytes);
      } else {
        // Try JPEG first; fall back to PNG
        try {
          embeddedImage = await pdf.embedJpg(imgBytes);
        } catch {
          embeddedImage = await pdf.embedPng(imgBytes);
        }
      }
      const dims = embeddedImage.scale(
        Math.min(1, (PAGE_WIDTH - 2 * MARGIN) / embeddedImage.width),
      );
      page.drawImage(embeddedImage, {
        x: MARGIN,
        y: (PAGE_HEIGHT - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    }
  }

  // Footer page
  addTextPage([
    { text: `MedAssist — Generated ${now.toISOString()}`, size: 11 },
  ]);

  const pdfBytes = await pdf.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // 4. Upload and record
  const ts = Date.now();
  const key = `forms/appointments/${appointmentId}/exports/${ts}-${randomUUID()}.pdf`;

  await withTransaction(async (client) => {
    await uploadEncrypted(key, pdfBuffer, 'application/pdf', 'attachment');
    await client.query(
      `INSERT INTO patient_pdf_exports
         (appointment_id, pdf_key, item_count, generated_by_staff_id)
       VALUES ($1, $2, $3, $4)`,
      [appointmentId, key, items.length, staffId],
    );
  });

  return { pdf_url: await presignGet(key), generated_at: now.toISOString(), item_count: items.length };
}
