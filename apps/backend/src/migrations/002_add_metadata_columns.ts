import { sql } from 'kysely';
import { db } from '../db.js';

const columns: { name: string; type: string }[] = [
  { name: 'secondary_color', type: 'text' },
  { name: 'fabric',          type: 'text' },
  { name: 'fit',             type: 'text' },
  { name: 'tags',            type: 'text' },
  { name: 'style_notes',     type: 'text' },
];

console.log('Running migration: 002_add_metadata_columns');
try {
  for (const col of columns) {
    try {
      await sql`ALTER TABLE clothes ADD COLUMN ${sql.id(col.name)} ${sql.raw(col.type)}`.execute(db);
      console.log(`  ✅ Added column: ${col.name}`);
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log(`  ⚠️  ${col.name} already exists, skipping`);
      } else {
        throw err;
      }
    }
  }
  console.log('Migration 002 completed');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
