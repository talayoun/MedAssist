import multer from 'multer';
import { fromBuffer } from 'file-type';
import type { RequestHandler } from 'express';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;   // 5 MB per spec
const PDF_MAX_BYTES   = 20 * 1024 * 1024;  // 20 MB per spec

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_PDF_MIMES   = ['application/pdf'];

function makeMimeCheckMiddleware(allowedMimes: string[]): RequestHandler {
  return async (req, res, next) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const detected = await fromBuffer(file.buffer);
    if (!detected || !allowedMimes.includes(detected.mime)) {
      res.status(415).json({ error: `Unsupported file type: ${detected?.mime ?? 'unknown'}` });
      return;
    }
    file.mimetype = detected.mime;
    next();
  };
}

function makeUpload(maxBytes: number): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
  });
}

export const imageUpload: RequestHandler[] = [
  makeUpload(IMAGE_MAX_BYTES).single('file'),
  makeMimeCheckMiddleware(ALLOWED_IMAGE_MIMES),
];

export const pdfUpload: RequestHandler[] = [
  makeUpload(PDF_MAX_BYTES).single('file'),
  makeMimeCheckMiddleware(ALLOWED_PDF_MIMES),
];
