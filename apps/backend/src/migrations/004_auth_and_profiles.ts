import { sql } from 'kysely';
import { db } from '../db.js';

async function up(): Promise<void> {
  // Better Auth requires quoted camelCase column names
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
      "id"         TEXT        PRIMARY KEY,
      "expiresAt"  TIMESTAMPTZ NOT NULL,
      "token"      TEXT        NOT NULL UNIQUE,
      "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
      "ipAddress"  TEXT,
      "userAgent"  TEXT,
      "userId"     TEXT        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS account (
      "id"                     TEXT        PRIMARY KEY,
      "accountId"              TEXT        NOT NULL,
      "providerId"             TEXT        NOT NULL,
      "userId"                 TEXT        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accessToken"            TEXT,
      "refreshToken"           TEXT,
      "idToken"                TEXT,
      "accessTokenExpiresAt"   TIMESTAMPTZ,
      "refreshTokenExpiresAt"  TIMESTAMPTZ,
      "scope"                  TEXT,
      "password"               TEXT,
      "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now()
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

  // Profiles table — our own, uses snake_case via Kysely
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id             TEXT    PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
      gender              TEXT,
      onboarding_complete BOOLEAN NOT NULL DEFAULT false,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  // Scope wardrobe items to users
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clothes' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE clothes ADD COLUMN user_id TEXT REFERENCES "user"("id") ON DELETE CASCADE;
      END IF;
    END $$
  `.execute(db);

  console.log('✅ Auth tables (camelCase), profiles, user_id on clothes — done');
}

console.log('Running migration: 004_auth_and_profiles');
try {
  await up();
  console.log('Migration completed successfully');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
