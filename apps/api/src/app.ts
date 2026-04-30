import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import visitRouter from './modules/visit.router';
import authRouter from './modules/staff/auth.router';
import queueRouter from './modules/staff/queue.router';
import stationsRouter from './modules/staff/stations.router';
import departmentsRouter from './modules/staff/departments.router';
import appointmentsRouter from './modules/staff/appointments.router';
import adminChecklistsRouter from './modules/admin/checklists.router';
import adminNavigationRoutesRouter from './modules/admin/navigation-routes.router';
import adminTrashRouter from './modules/admin/trash.router';
import adminFormTemplatesRouter from './modules/admin/form-templates.router';
import staffFormsRouter from './modules/forms/forms.staff.router';
import { startTrashPurgeScheduler } from './modules/admin/trash.scheduler';

const app = express();

// Security headers
app.use(helmet());

// CORS — allow configured origins plus always-allow localhost for dev
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  ...(process.env.PATIENT_APP_URL ? process.env.PATIENT_APP_URL.split(',').map(s => s.trim()) : []),
  ...(process.env.STAFF_APP_URL  ? process.env.STAFF_APP_URL.split(',').map(s => s.trim())  : []),
]);
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. Supertest, curl)
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Route mounts ──────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/visit', visitRouter);
app.use('/api/staff', queueRouter);
app.use('/api/staff', stationsRouter);
app.use('/api/staff', departmentsRouter);
app.use('/api/staff', appointmentsRouter);
app.use('/api/admin', adminChecklistsRouter);
app.use('/api/admin', adminNavigationRoutesRouter);
app.use('/api/admin', adminTrashRouter);
app.use('/api/admin', adminFormTemplatesRouter);
app.use('/api/staff', staffFormsRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found' });
});

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status < 500) {
    res.status(status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({
    error: 'server_error',
    message: 'שגיאה זמנית. נסה שנית.',
  });
});

export default app;

// Start server when run directly
if (require.main === module) {
  startTrashPurgeScheduler();
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}
