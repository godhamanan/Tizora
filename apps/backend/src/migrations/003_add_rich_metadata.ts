import { sql } from 'kysely';
import { db } from '../db.js';

const columns: { name: string; type: string }[] = [
  { name: 'subcategory',    type: 'text' },
  { name: 'formality',      type: 'text' },
  { name: 'aesthetic',      type: 'text' },  // JSON array
  { name: 'occasions',      type: 'text' },  // JSON array
  { name: 'gender_style',   type: 'text' },
  { name: 'layers_with',    type: 'text' },  // JSON array
  { name: 'pairs_well_with', type: 'text' }, // JSON array
];

console.log('Running migration: 003_add_rich_metadata');
try {
  for (const col of columns) {
    try {
      await sql`ALTER TABLE clothes ADD COLUMN ${sql.id(col.name)} ${sql.raw(col.type)}`.execute(db);
      console.log(`  ✅ Added: ${col.name}`);
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log(`  ⚠️  ${col.name} already exists, skipping`);
      } else {
        throw err;
      }
    }
  }
  console.log('Migration 003 completed');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
