import { purgeExpiredTrash } from './trash.service';

export function startTrashPurgeScheduler(): void {
  const run = async () => {
    try {
      await purgeExpiredTrash();
    } catch (err) {
      console.error('[trash-purge] error:', err);
    }
  };

  run();
  setInterval(run, 24 * 60 * 60 * 1000);
}
