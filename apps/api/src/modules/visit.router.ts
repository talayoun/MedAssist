/**
 * Visit router: Combines all patient-facing endpoints under /api/visit/:token
 * Routes:
 *   GET    /api/visit/:token                           → magic-links.router
 *   GET    /api/visit/:token/checklist                 → checklist.router
 *   POST   /api/visit/:token/checklist/progress        → checklist.router
 *   GET    /api/visit/:token/navigation                → navigation.router
 *   POST   /api/visit/:token/navigation/steps/:id/confirm → navigation.router
 *   GET    /api/visit/:token/waiting                   → waiting.router
 *   POST   /api/visit/:token/waiting/contact           → waiting.router
 */

import { Router } from 'express';
import magicLinksRouter from './magic-links/magic-links.router';
import checklistRouter from './checklist/checklist.router';
import navigationRouter from './navigation/navigation.router';
import waitingRouter from './waiting/waiting.router';
import formsRouter from './forms/forms.router';

const visitRouter = Router();

// Initial token resolution
visitRouter.use(magicLinksRouter);

// Sub-routes under a token
visitRouter.use('/:token/checklist', checklistRouter);
visitRouter.use('/:token/navigation', navigationRouter);
visitRouter.use('/:token/waiting', waitingRouter);
visitRouter.use('/:token/forms', formsRouter);

export default visitRouter;
