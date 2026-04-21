import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
      ['011_checklist_per_appointment_overrides.sql']
    );
    console.log('Registered 011 in _migrations.');
  } finally {
    client.release();
    await pool.end();
  }
}

fix().catch((e) => { console.error(e); process.exit(1); });
