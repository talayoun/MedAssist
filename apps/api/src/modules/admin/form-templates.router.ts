import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth';
import { pdfUpload } from '../forms/upload.middleware';
import * as svc from './form-templates.service';

const SectionEnum = z.enum(['personal', 'medical', 'financial', 'documents', 'consent']);

const CreateSchema = z.object({
  procedure_type: z.string().max(80).nullable().optional(),
  label: z.string().min(1).max(200),
  item_type: z.enum(['patient_upload', 'staff_upload_sign', 'text_field', 'yes_no_list', 'consent']),
  required: z.boolean(),
  order_index: z.number().int().min(0),
  section: SectionEnum.optional(),
  sub_label: z.string().max(300).nullable().optional(),
  placeholder: z.string().max(200).nullable().optional(),
  list_item_placeholder: z.string().max(200).nullable().optional(),
});

const PatchSchema = z.object({
  label:       z.string().min(1).max(200).optional(),
  required:    z.boolean().optional(),
  order_index: z.number().int().min(0).optional(),
  is_active:   z.boolean().optional(),
  section: SectionEnum.optional(),
  sub_label: z.string().max(300).nullable().optional(),
  placeholder: z.string().max(200).nullable().optional(),
  list_item_placeholder: z.string().max(200).nullable().optional(),
});

const router = Router();
router.use(requireAdmin);

router.get('/form-templates', async (_req, res, next) => {
  try { res.json({ items: await svc.listTemplateItems() }); }
  catch (err) { next(err); }
});

router.post('/form-templates', async (req, res, next) => {
  try {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    res.status(201).json(await svc.createTemplateItem(parsed.data));
  }
  catch (err) { next(err); }
});

router.patch('/form-templates/:id', async (req, res, next) => {
  try {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    res.json(await svc.patchTemplateItem(req.params.id, parsed.data));
  }
  catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 409) { res.status(409).json({ error: 'item_protected', message: e.message }); return; }
    next(err);
  }
});

router.delete('/form-templates/:id', async (req, res, next) => {
  try { await svc.softDeleteTemplateItem(req.params.id); res.sendStatus(204); }
  catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 409) { res.status(409).json({ error: 'item_protected', message: e.message }); return; }
    next(err);
  }
});

router.post('/form-templates/:id/blank', ...pdfUpload, async (req, res, next) => {
  try {
    res.json(await svc.uploadBlankForm(req.params.id as string, req.file!.buffer, req.file!.mimetype as string));
  }
  catch (err) { next(err); }
});

router.delete('/form-templates/:id/blank', async (req, res, next) => {
  try { await svc.deleteBlankForm(req.params.id); res.sendStatus(204); }
  catch (err) { next(err); }
});

export default router;
