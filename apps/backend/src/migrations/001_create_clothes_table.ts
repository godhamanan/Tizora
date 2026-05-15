import { Kysely, sql } from 'kysely';
import { db } from '../db.js';

async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('clothes')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('color', 'text', (col) => col.notNull())
    .addColumn('pattern', 'text')
    .addColumn('occasion', 'text')
    .addColumn('season', 'text')
    .addColumn('style', 'text')
    .addColumn('image_base64', 'text', (col) => col.notNull())
    .addColumn('favorite', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('last_worn', 'timestamp')
    .addColumn('created_at', 'timestamp', (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  console.log('✅ Created clothes table');

  await db.schema
    .createTable('outfit_history')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('outfit_label', 'text', (col) => col.notNull())
    .addColumn('clothing_ids', 'text', (col) => col.notNull())
    .addColumn('occasion', 'text')
    .addColumn('worn_on', 'timestamp', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  console.log('✅ Created outfit_history table');
}

// Run directly — Windows-safe, no import.meta.url check
console.log('Running migration: 001_create_clothes_table');
try {
  await up(db);
  console.log('Migration completed successfully');
  process.exit(0);
} catch (error: any) {
  if (error?.code === '42P01' || error?.message?.includes('already exists')) {
    console.log('⚠️  Tables already exist — skipping');
    process.exit(0);
  }
  console.error('Migration failed:', error);
  process.exit(1);
}