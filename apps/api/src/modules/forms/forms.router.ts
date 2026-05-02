import { Router, Request, Response, NextFunction } from 'express';
import { requireMagicLinkToken, denyCompanionWrite } from '../../middleware/auth';
import { imageUpload } from './upload.middleware';
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
      res.status(400).json({ error: 'signature_too_large' });
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
