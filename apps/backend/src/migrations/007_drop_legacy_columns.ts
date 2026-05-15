import { sql } from 'kysely';
import { db } from '../db.js';

const drops = ['aesthetic', 'occasion', 'occasions', 'tags'] as const;

console.log('Running migration: 007_drop_legacy_columns');
try {
  for (const col of drops) {
    try {
      await sql`ALTER TABLE clothes DROP COLUMN IF EXISTS ${sql.id(col)}`.execute(db);
      console.log(`  ✅ Dropped: ${col}`);
    } catch (err: any) {
      console.warn(`  ⚠️  Could not drop ${col}:`, err.message);
    }
  }
  console.log('Migration 007 completed');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
