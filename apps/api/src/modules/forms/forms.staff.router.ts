import { Router, Request, Response, NextFunction } from 'express';
import { requireStaffAuth } from '../../middleware/auth';
import { pdfUpload } from './upload.middleware';
import * as svc from './forms.service';
import { buildExport } from './pdf-export.service';
import type { StaffAuthContext } from '@medassist/shared-types';

function callerCtx(req: Request): StaffAuthContext {
  return req.staffAuth!.role === 'admin'
    ? { role: 'admin' }
    : { role: 'staff', departmentId: req.staffAuth!.departmentId! };
}

const router = Router();
router.use(requireStaffAuth);

router.get('/patients/:appointmentId/forms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await svc.getStaffSummary(req.params.appointmentId as string, callerCtx(req));
    res.json(summary);
  } catch (err) { next(err); }
});

router.post(
  '/patients/:appointmentId/forms/:itemId/consent',
  ...pdfUpload,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.staffUploadConsent(
        req.params.itemId as string,
        req.params.appointmentId as string,
        req.file!.buffer,
        req.file!.mimetype as string,
        req.staffAuth!.sub,
        callerCtx(req),
      );
      res.json(result);
    } catch (err) { next(err); }
  },
);

router.post('/patients/:appointmentId/forms/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await buildExport(req.params.appointmentId as string, req.staffAuth!.sub, callerCtx(req));
    res.status(201).json(result);
  } catch (err) { next(err); }
});

export default router;
