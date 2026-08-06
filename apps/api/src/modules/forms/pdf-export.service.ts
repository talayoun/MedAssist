import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { query, withTransaction } from '../../db/db';
import { getObjectBuffer, uploadEncrypted, presignGet } from '../../services/s3';
import type { StaffAuthContext } from '@medassist/shared-types';
import { verifyAppointmentDept } from './forms.service';

export const MAX_EXPORT_ITEMS = 30;

const HEBREW_RE = /[֐-׿יִ-ﭏ]/;

// Load font bytes once at module initialization (avoids repeated disk I/O)
/* eslint-disable @typescript-eslint/no-require-imports */
const FONT_HE_400 = readFileSync(require.resolve('@fontsource/heebo/files/heebo-hebrew-400-normal.woff2'));
const FONT_HE_700 = readFileSync(require.resolve('@fontsource/heebo/files/heebo-hebrew-700-normal.woff2'));
const FONT_LA_400 = readFileSync(require.resolve('@fontsource/heebo/files/heebo-latin-400-normal.woff2'));
const FONT_LA_700 = readFileSync(require.resolve('@fontsource/heebo/files/heebo-latin-700-normal.woff2'));
/* eslint-enable */

export function computeLayout<T>(items: T[]): T[] {
  if (items.length > MAX_EXPORT_ITEMS) {
    throw Object.assign(new Error('Too many items for export'), { status: 422 });
  }
  return items;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;

type PdfFont = import('pdf-lib').PDFFont;

type PdfLine = {
  text: string;
  size: number;
  bold?: boolean;
  hebrew?: boolean;
};

// Splits a label+value pair so a Hebrew value gets its own line (separate font)
function splitField(label: string, value: string, opts: { size: number; bold?: boolean } = { size: 12 }): PdfLine[] {
  if (HEBREW_RE.test(value)) {
    return [
      { text: label, ...opts },
      { text: value, ...opts, hebrew: true },
    ];
  }
  return [{ text: `${label} ${value}`, ...opts }];
}

export async function buildExport(appointmentId: string, staffId: string, ctx: StaffAuthContext) {
  await verifyAppointmentDept(appointmentId, ctx);

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

  // 3. Build PDF with separate Hebrew and Latin fonts to handle bilingual content
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const heFont: PdfFont = await pdf.embedFont(FONT_HE_400);
  const heBoldFont: PdfFont = await pdf.embedFont(FONT_HE_700);
  const laFont: PdfFont = await pdf.embedFont(FONT_LA_400);
  const laBoldFont: PdfFont = await pdf.embedFont(FONT_LA_700);
  const now = new Date();

  function pickFont(line: PdfLine): PdfFont {
    const useHebrew = line.hebrew ?? HEBREW_RE.test(line.text);
    return useHebrew
      ? (line.bold ? heBoldFont : heFont)
      : (line.bold ? laBoldFont : laFont);
  }

  function addTextPage(lines: PdfLine[]) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN - 30;
    for (const line of lines) {
      if (line.text) {
        page.drawText(line.text, {
          x: MARGIN,
          y,
          size: line.size,
          font: pickFont(line),
          color: rgb(0, 0, 0),
        });
      }
      y -= line.size + 8;
    }
  }

  // Header page
  addTextPage([
    { text: 'MedAssist - Patient Forms Export', size: 18, bold: true },
    { text: '', size: 8 },
    ...splitField('Patient:', patient_name, { size: 13, bold: true }),
    ...splitField('Department:', department_name, { size: 12 }),
    { text: `Procedure: ${procedure_type ?? '-'}`, size: 12 },
    { text: `Generated: ${now.toISOString()}`, size: 11 },
  ]);

  // Item sections (sequentially to avoid S3 pressure)
  for (const item of items) {
    const hasStaffFile = !!item.staff_file_url;
    const hasPatientFile = !!item.patient_file_url;
    if (!hasStaffFile && !hasPatientFile) continue;

    // Section header page
    addTextPage([
      ...splitField('Section:', item.label as string, { size: 14, bold: true }),
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
      const rawBytes = await getObjectBuffer(item.patient_file_url as string);
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      let embeddedImage;
      if ((item.patient_doc_type as string) === 'signature') {
        embeddedImage = await pdf.embedPng(rawBytes);
      } else {
        // Re-encode via sharp to guarantee pdf-lib JPEG compatibility
        const imgBytes = await sharp(rawBytes).jpeg({ quality: 85 }).toBuffer();
        embeddedImage = await pdf.embedJpg(imgBytes);
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
    { text: `MedAssist - Generated ${now.toISOString()}`, size: 11 },
  ]);

  const pdfBytes = await pdf.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // 4. Upload and record
  const ts = Date.now();
  const key = `forms/appointments/${appointmentId}/exports/${ts}-${randomUUID()}.pdf`;

  await withTransaction(async (client) => {
    await uploadEncrypted(key, pdfBuffer, 'application/pdf', 'inline');
    await client.query(
      `INSERT INTO patient_pdf_exports
         (appointment_id, pdf_key, item_count, generated_by_staff_id)
       VALUES ($1, $2, $3, $4)`,
      [appointmentId, key, items.length, staffId],
    );
  });

  return { pdf_url: await presignGet(key), generated_at: now.toISOString(), item_count: items.length };
}
