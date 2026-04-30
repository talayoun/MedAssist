import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { pdfUpload } from '../forms/upload.middleware';
import * as svc from './form-templates.service';

const router = Router();
router.use(requireAdmin);

router.get('/form-templates', async (_req, res, next) => {
  try { res.json(await svc.listTemplateItems()); }
  catch (err) { next(err); }
});

router.post('/form-templates', async (req, res, next) => {
  try { res.status(201).json(await svc.createTemplateItem(req.body)); }
  catch (err) { next(err); }
});

router.patch('/form-templates/:id', async (req, res, next) => {
  try { res.json(await svc.patchTemplateItem(req.params.id, req.body)); }
  catch (err) { next(err); }
});

router.delete('/form-templates/:id', async (req, res, next) => {
  try { await svc.softDeleteTemplateItem(req.params.id); res.sendStatus(204); }
  catch (err) { next(err); }
});

router.post('/form-templates/:id/blank', ...pdfUpload, async (req, res, next) => {
  try {
    res.json(await svc.uploadBlankForm(req.params.id, req.file!.buffer, req.file!.mimetype));
  }
  catch (err) { next(err); }
});

router.delete('/form-templates/:id/blank', async (req, res, next) => {
  try { await svc.deleteBlankForm(req.params.id); res.sendStatus(204); }
  catch (err) { next(err); }
});

export default router;
