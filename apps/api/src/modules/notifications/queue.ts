import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

export interface NotificationJobData {
  notificationId: string;
  patientId: string;
  appointmentId: string;
  phoneNumber: string;
  message: string;
  type: 'magic_link' | 'checklist_reminder' | 'station_update' | 'broadcast';
  retryCount: number;
}

// BullMQ Queue connection (standard)
const queueConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});


export const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 5 * 60 * 1000, // 5 minutes between retries
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export function createNotificationWorker(
  processor: (job: Job<NotificationJobData>) => Promise<void>
): Worker<NotificationJobData> {
  return new Worker<NotificationJobData>('notifications', processor, {
    connection: new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    }),
    concurrency: 5,
  });
}
