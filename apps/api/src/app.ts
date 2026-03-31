import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import visitRouter from './modules/visit.router';
import authRouter from './modules/staff/auth.router';
import queueRouter from './modules/staff/queue.router';
import stationsRouter from './modules/staff/stations.router';

const app = express();

// Security headers
app.use(helmet());

// CORS — only allow the patient PWA and staff back-office origins
const allowedOrigins = [
  process.env.PATIENT_APP_URL ?? 'http://localhost:5173',
  process.env.STAFF_APP_URL ?? 'http://localhost:5174',
];
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. Supertest, curl)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
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

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found' });
});

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: 'server_error',
    message: 'שגיאה זמנית. נסה שנית.',
  });
});

export default app;

// Start server when run directly
if (require.main === module) {
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}
