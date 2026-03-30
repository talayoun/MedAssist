import twilio from 'twilio';
import { Job } from 'bullmq';
import { query } from '../../db/db';
import { createNotificationWorker, NotificationJobData } from './queue';

const MAX_RETRY_COUNT = 3;

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { notificationId, phoneNumber, message, retryCount } = job.data;

  // Fetch current retry_count from DB (authoritative)
  const { rows } = await query<{ retry_count: number; status: string }>(
    'SELECT retry_count, status FROM notifications WHERE id = $1',
    [notificationId]
  );

  if (rows.length === 0 || rows[0].status === 'sent') return;

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  try {
    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_NUMBER!,
      to: phoneNumber,
    });

    await query(
      `UPDATE notifications
       SET status = 'sent', provider_message_id = $1
       WHERE id = $2`,
      [msg.sid, notificationId]
    );
  } catch (err) {
    const currentRetry = retryCount + 1;

    if (currentRetry >= MAX_RETRY_COUNT) {
      await query(
        `UPDATE notifications SET status = 'failed', retry_count = $1 WHERE id = $2`,
        [currentRetry, notificationId]
      );
      console.error(`[notifications] Permanently failed notification ${notificationId}:`, err);
      return; // Don't rethrow — remove from queue
    }

    await query(
      `UPDATE notifications SET retry_count = $1 WHERE id = $2`,
      [currentRetry, notificationId]
    );
    // Rethrow to let BullMQ retry with configured backoff
    throw err;
  }
}

export function startNotificationWorker() {
  const worker = createNotificationWorker(processNotification);

  worker.on('completed', (job) => {
    console.log(`[notifications] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[notifications] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
