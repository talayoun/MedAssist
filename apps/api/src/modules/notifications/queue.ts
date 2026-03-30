import { Queue, Worker, Job } from 'bullmq';
import redis from '../../db/redis';

export interface NotificationJobData {
  notificationId: string;
  patientId: string;
  appointmentId: string;
  phoneNumber: string;
  message: string;
  type: 'magic_link' | 'checklist_reminder' | 'station_update' | 'broadcast';
  retryCount: number;
}

const connection = redis;

export const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection,
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
    connection,
    concurrency: 5,
  });
}
