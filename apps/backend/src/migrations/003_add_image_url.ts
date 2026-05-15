import { Kysely, sql } from 'kysely';
import { db } from '../db.js';

async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('clothes')
    .addColumn('image_url', 'text')
    .execute();

  // Make image_base64 nullable so cloud-stored items don't need a base64 copy
  await sql`ALTER TABLE clothes ALTER COLUMN image_base64 DROP NOT NULL`.execute(db);

  console.log('✅ Added image_url column, made image_base64 nullable');
}

console.log('Running migration: 003_add_image_url');
try {
  await up(db);
  console.log('Migration completed successfully');
  process.exit(0);
} catch (error: any) {
  if (error?.code === '42701' || error?.message?.includes('already exists')) {
    console.log('⚠️  Column already exists — skipping');
    process.exit(0);
  }
  console.error('Migration failed:', error);
  process.exit(1);
}
