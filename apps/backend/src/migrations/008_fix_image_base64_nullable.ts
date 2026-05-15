import { sql } from 'kysely';
import { db } from '../db.js';

console.log('Running migration: 008_fix_image_base64_nullable');
try {
  await sql`ALTER TABLE clothes ALTER COLUMN image_base64 DROP NOT NULL`.execute(db);
  console.log('  ✅ image_base64 is now nullable');
  process.exit(0);
} catch (error: any) {
  // "there is no constraint" means it was already nullable — safe to skip
  if (error.message?.includes('there is no constraint') || error.message?.includes('does not exist')) {
    console.log('  ⚠️  image_base64 already nullable — skipping');
    process.exit(0);
  }
  console.error('Migration failed:', error);
  process.exit(1);
}
