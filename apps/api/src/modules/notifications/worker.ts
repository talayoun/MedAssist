import 'dotenv/config';
import { startNotificationWorker } from './notifications.consumer';

console.log('[worker] Starting notification worker...');
const worker = startNotificationWorker();

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, shutting down gracefully...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});
