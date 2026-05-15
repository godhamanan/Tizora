import { sql } from 'kysely';
import { db } from '../db.js';

async function up(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS scan_jobs (
      id          TEXT        PRIMARY KEY,
      user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      status      TEXT        NOT NULL DEFAULT 'processing',
      total       INTEGER     NOT NULL DEFAULT 0,
      processed   INTEGER     NOT NULL DEFAULT 0,
      failed      INTEGER     NOT NULL DEFAULT 0,
      results     TEXT        NOT NULL DEFAULT '[]',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS scan_job_files (
      id          SERIAL      PRIMARY KEY,
      job_id      TEXT        NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
      filename    TEXT        NOT NULL,
      mime        TEXT        NOT NULL,
      data        TEXT        NOT NULL,
      processed   BOOLEAN     NOT NULL DEFAULT false
    )
  `.execute(db);

  console.log('✅ scan_jobs and scan_job_files tables created');
}

console.log('Running migration: 005_scan_jobs');
try {
  await up();
  console.log('Migration completed successfully');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
