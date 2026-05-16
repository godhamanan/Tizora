import { sql } from 'kysely';
import { db } from './db.js';

async function addColumnIfMissing(table: string, col: string, type: string) {
  try {
    await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN ${sql.id(col)} ${sql.raw(type)}`.execute(db);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }
}

async function dropColumnIfExists(table: string, col: string) {
  try {
    await sql`ALTER TABLE ${sql.table(table)} DROP COLUMN IF EXISTS ${sql.id(col)}`.execute(db);
  } catch { /* ignore */ }
}

export async function runMigrations(): Promise<void> {
  console.log('🔄 Running migrations…');

  // ── 001: core tables ────────────────────────────────────────────────────
  await db.schema.createTable('clothes').ifNotExists()
    .addColumn('id',           'serial', c => c.primaryKey())
    .addColumn('name',         'text',   c => c.notNull())
    .addColumn('category',     'text',   c => c.notNull())
    .addColumn('color',        'text',   c => c.notNull())
    .addColumn('pattern',      'text')
    .addColumn('occasion',     'text')
    .addColumn('season',       'text')
    .addColumn('style',        'text')
    .addColumn('image_base64', 'text')
    .addColumn('favorite',     'boolean', c => c.defaultTo(false).notNull())
    .addColumn('last_worn',    'timestamp')
    .addColumn('created_at',   'timestamp', c => c.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  await db.schema.createTable('outfit_history').ifNotExists()
    .addColumn('id',           'serial', c => c.primaryKey())
    .addColumn('outfit_label', 'text',   c => c.notNull())
    .addColumn('clothing_ids', 'text',   c => c.notNull())
    .addColumn('occasion',     'text')
    .addColumn('worn_on',      'timestamp', c => c.notNull())
    .addColumn('created_at',   'timestamp', c => c.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // ── 002: metadata columns ───────────────────────────────────────────────
  for (const col of ['secondary_color','fabric','fit','style_notes']) {
    await addColumnIfMissing('clothes', col, 'text');
  }

  // ── 003a: rich metadata ─────────────────────────────────────────────────
  for (const col of ['subcategory','formality','gender_style','layers_with','pairs_well_with']) {
    await addColumnIfMissing('clothes', col, 'text');
  }

  // ── 003b: image_url ─────────────────────────────────────────────────────
  await addColumnIfMissing('clothes', 'image_url', 'text');
  try { await sql`ALTER TABLE clothes ALTER COLUMN image_base64 DROP NOT NULL`.execute(db); } catch { /* already nullable */ }

  // ── 004: auth + profiles ────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS "user" (
      "id"            TEXT        PRIMARY KEY,
      "name"          TEXT        NOT NULL,
      "email"         TEXT        NOT NULL UNIQUE,
      "emailVerified" BOOLEAN     NOT NULL DEFAULT false,
      "image"         TEXT,
      "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS session (
      "id"        TEXT        PRIMARY KEY,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "token"     TEXT        NOT NULL UNIQUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS account (
      "id"                    TEXT        PRIMARY KEY,
      "accountId"             TEXT        NOT NULL,
      "providerId"            TEXT        NOT NULL,
      "userId"                TEXT        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accessToken"           TEXT,
      "refreshToken"          TEXT,
      "idToken"               TEXT,
      "accessTokenExpiresAt"  TIMESTAMPTZ,
      "refreshTokenExpiresAt" TIMESTAMPTZ,
      "scope"                 TEXT,
      "password"              TEXT,
      "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS verification (
      "id"         TEXT        PRIMARY KEY,
      "identifier" TEXT        NOT NULL,
      "value"      TEXT        NOT NULL,
      "expiresAt"  TIMESTAMPTZ NOT NULL,
      "createdAt"  TIMESTAMPTZ,
      "updatedAt"  TIMESTAMPTZ
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id             TEXT    PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
      gender              TEXT,
      onboarding_complete BOOLEAN NOT NULL DEFAULT false,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  // add user_id to clothes if missing
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clothes' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE clothes ADD COLUMN user_id TEXT REFERENCES "user"("id") ON DELETE CASCADE;
      END IF;
    END $$
  `.execute(db);

  // ── 005: scan jobs ───────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS scan_jobs (
      id         TEXT        PRIMARY KEY,
      user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      status     TEXT        NOT NULL DEFAULT 'processing',
      total      INTEGER     NOT NULL DEFAULT 0,
      processed  INTEGER     NOT NULL DEFAULT 0,
      failed     INTEGER     NOT NULL DEFAULT 0,
      results    TEXT        NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS scan_job_files (
      id        SERIAL  PRIMARY KEY,
      job_id    TEXT    NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
      filename  TEXT    NOT NULL,
      mime      TEXT    NOT NULL,
      data      TEXT    NOT NULL,
      processed BOOLEAN NOT NULL DEFAULT false
    )
  `.execute(db);

  // ── 006: rich metadata on clothes ────────────────────────────────────────
  for (const col of ['style_vibes','occasion_tags','energy','works_best_for']) {
    await addColumnIfMissing('clothes', col, 'text');
  }

  // ── 010: Phase 0 styling intelligence — drives smarter suggestions ──────
  for (const col of [
    'color_undertone', 'color_saturation', 'piece_role',
    'layer_role', 'fabric_weight', 'color_pairs', 'contrast_affinity',
  ]) {
    await addColumnIfMissing('clothes', col, 'text');
  }

  // ── 007: drop legacy columns ─────────────────────────────────────────────
  for (const col of ['aesthetic','occasion','occasions','tags']) {
    await dropColumnIfExists('clothes', col);
  }

  // ── 009: catalog ─────────────────────────────────────────────────────────
  await db.schema.createTable('catalog').ifNotExists()
    .addColumn('id',              'serial',      c => c.primaryKey())
    .addColumn('name',            'text',        c => c.notNull())
    .addColumn('brand',           'text')
    .addColumn('category',        'text',        c => c.notNull())
    .addColumn('subcategory',     'text')
    .addColumn('color',           'text',        c => c.notNull())
    .addColumn('secondary_color', 'text')
    .addColumn('pattern',         'text')
    .addColumn('fabric',          'text')
    .addColumn('fit',             'text')
    .addColumn('formality',       'text')
    .addColumn('style',           'text')
    .addColumn('gender_style',    'text')
    .addColumn('season',          'text')
    .addColumn('style_vibes',     'text')
    .addColumn('occasion_tags',   'text')
    .addColumn('image_url',       'text',        c => c.notNull())
    .addColumn('created_at',      'timestamptz', c => c.defaultTo(sql`now()`))
    .execute();

  console.log('✅ All migrations complete');
}
