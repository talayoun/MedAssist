/**
 * Wipe every row of application data and re-run the seed.
 *
 * This is the booth ritual for demo day: run it between visitors so every
 * walkthrough starts from an identical state, and once beforehand to clear the
 * accumulated test residue (hundreds of `test-route-*` rows, the leftover
 * `אורתופדיה (בדיקת הרשאות)` department, 500+ throwaway patients).
 *
 * The migration ledger is deliberately preserved — this resets data, not schema.
 */
import { Pool } from 'pg';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { spawnSync } from 'child_process';
import { join } from 'path';

// Children before parents. `CASCADE` on TRUNCATE follows foreign keys anyway,
// but listing them keeps it obvious what this command destroys.
const TABLES = [
  'checklist_progress',
  'nav_progress',
  'companions',
  'notifications',
  'patient_stations',
  'waiting_queue',
  'patient_pdf_exports',
  'patient_form_values',
  'patient_form_items',
  'patient_documents',
  'magic_links',
  'appointments',
  'route_steps',
  'navigation_routes',
  'form_template_items',
  'checklist_templates',
  'magic_link_timing_rules',
  'patients',
  'staff_users',
  'departments',
];

async function resetDemo() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Run this through `doppler run --`.');
    process.exit(1);
  }

  // A destructive command must never be one typo away from a real database.
  const dbName = new URL(url).pathname.replace(/^\//, '');
  const forced = process.argv.includes('--force');
  if (!dbName.endsWith('_dev') && !forced) {
    console.error(`Refusing to wipe "${dbName}" — this command only runs against a *_dev database.`);
    console.error('Pass --force if you genuinely mean to reset this one.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    console.log(`\n🧹 Wiping application data in "${dbName}" (${TABLES.length} tables)...`);
    await pool.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    console.log('   Done. Migration history preserved.\n');
  } catch (err) {
    console.error('Reset failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }

  // The seed enqueues its magic-link job to Redis after COMMIT, so truncating
  // the notifications table leaves those jobs behind. Without this, every reset
  // adds one more pending message: start the worker with sending enabled and it
  // drains the whole backlog at once, to a real phone, in front of a visitor.
  // One reset must mean exactly one pending message.
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue('notifications', { connection });
  try {
    const pending = await queue.getJobCounts();
    await queue.obliterate({ force: true });
    const cleared = Object.values(pending).reduce((sum, n) => sum + n, 0);
    console.log(`📭 Notification queue cleared (${cleared} job${cleared === 1 ? '' : 's'} discarded).
`);
  } catch (err) {
    console.error('Could not clear the notification queue:', err);
    process.exit(1);
  } finally {
    await queue.close();
    await connection.quit();
  }

  // Run the seed in its own process: it owns its Postgres pool, its Redis
  // connection and its BullMQ queue, and it closes all three on the way out.
  const seedPath = join(__dirname, 'seed.ts');
  const result = spawnSync('npx', ['tsx', seedPath], { stdio: 'inherit', shell: true });
  process.exit(result.status ?? 1);
}

resetDemo();
