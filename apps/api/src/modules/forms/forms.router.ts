import { Router, Request, Response, NextFunction } from 'express';
import { requireMagicLinkToken, denyCompanionWrite } from '../../middleware/auth';
import { imageUpload, pdfUpload } from './upload.middleware';
import { FormValueRequestDTO } from '@medassist/shared-types';
import * as svc from './forms.service';

const router = Router({ mergeParams: true });
router.use(requireMagicLinkToken);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  if (!req.magicLink) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const items = await svc.listForAppointment(req.magicLink.appointmentId);
    res.json({ items });
  } catch (err) { next(err); }
});

router.post(
  '/:itemId/upload',
  denyCompanionWrite,
  ...imageUpload,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.magicLink) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const result = await svc.uploadPatientImage(
        req.params.itemId as string,
        req.magicLink.appointmentId,
        req.file!.buffer,
        req.file!.mimetype,
      );
      res.json(result);
    } catch (err) { next(err); }
  },
);

router.post(
  '/:itemId/upload-pdf',
  denyCompanionWrite,
  ...pdfUpload,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.magicLink) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const result = await svc.uploadPatientPdf(
        req.params.itemId as string,
        req.magicLink.appointmentId,
        req.file!.buffer,
      );
      res.json(result);
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:itemId/value',
  denyCompanionWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.magicLink) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const parsed = FormValueRequestDTO.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    try {
      const result = await svc.setItemValue(
        req.params.itemId as string,
        req.magicLink.appointmentId,
        parsed.data.item_type,
        parsed.data.value,
      );
      res.json(result);
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:itemId/document',
  denyCompanionWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.magicLink) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const result = await svc.deleteDocument(req.params.itemId as string, req.magicLink.appointmentId);
      res.json(result);
    } catch (err) { next(err); }
  },
);

router.post(
  '/:itemId/signature',
  denyCompanionWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.magicLink) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { signature_data } = req.body as { signature_data?: string };
    if (!signature_data || typeof signature_data !== 'string') {
      res.status(400).json({ error: 'signature_data required' });
      return;
    }
    if (signature_data.length > 140_000) {
      res.status(413).json({ error: 'signature_too_large' });
      return;
    }
    try {
      const result = await svc.submitSignature(
        req.params.itemId as string,
        req.magicLink.appointmentId,
        signature_data,
      );
      res.json(result);
    } catch (err) { next(err); }
  },
);

export default router;
