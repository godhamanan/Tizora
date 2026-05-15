import { sql } from 'kysely';
import { db } from '../db.js';

const columns: { name: string; type: string }[] = [
  { name: 'style_vibes',    type: 'text' }, // JSON-as-comma-string: ["minimal","clean","modern"]
  { name: 'occasion_tags',  type: 'text' }, // JSON-as-comma-string: ["weekend","coffee-run","airport"]
  { name: 'energy',         type: 'text' }, // JSON-as-comma-string: ["effortless","laid-back"]
  { name: 'works_best_for', type: 'text' }, // JSON-as-comma-string: ["daytime casual looks","airport layering"]
];

console.log('Running migration: 006_add_rich_metadata');
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
  console.log('Migration 006 completed');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
