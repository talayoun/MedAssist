import { Job } from 'bullmq';
import { query } from '../../db/db';
import { createNotificationWorker, NotificationJobData } from './queue';

const MAX_RETRY_COUNT = 3;

async function sendTelegram(message: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const errors: string[] = [];
  for (const chatId of chatIds) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!res.ok) {
      const body = await res.text();
      errors.push(`chat ${chatId}: ${body}`);
      console.error(`[notifications] Telegram send failed for chat ${chatId}: ${body}`);
    }
  }
  if (errors.length > 0 && errors.length === chatIds.length) {
    throw new Error(`Telegram send failed for all chats: ${errors.join('; ')}`);
  }
  return `telegram:${Date.now()}`;
}

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { notificationId, message, retryCount } = job.data;

  // Fetch current retry_count from DB (authoritative)
  const { rows } = await query<{ retry_count: number; status: string }>(
    'SELECT retry_count, status FROM notifications WHERE id = $1',
    [notificationId]
  );

  if (rows.length === 0 || rows[0].status === 'sent') return;

  try {
    const providerMessageId = await sendTelegram(message);
    await query(
      `UPDATE notifications SET status = 'sent', provider_message_id = $1 WHERE id = $2`,
      [providerMessageId, notificationId]
    );
  } catch (err) {
    const currentRetry = rows[0].retry_count + 1;

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
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('[notifications] TELEGRAM_BOT_TOKEN env var is required');
  }
  if (!process.env.TELEGRAM_CHAT_IDS) {
    throw new Error('[notifications] TELEGRAM_CHAT_IDS env var is required');
  }
  const worker = createNotificationWorker(processNotification);
  worker.on('completed', (job) => console.log(`[notifications] Job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`[notifications] Job ${job?.id} failed:`, err.message));
  return worker;
}
