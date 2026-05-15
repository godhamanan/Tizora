import { Kysely, PostgresDialect, Generated, sql } from 'kysely';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ── Table interfaces ───────────────────────────────────────────────────────

export interface ClothesTable {
  id: Generated<number>;
  name: string;
  category: string;
  subcategory: string | null;
  color: string;
  secondary_color: string | null;
  pattern: string | null;
  fabric: string | null;
  fit: string | null;
  formality: string | null;
  season: string | null;
  style: string | null;
  gender_style: string | null;
  layers_with: string | null;    // JSON array
  pairs_well_with: string | null; // JSON array
  style_notes: string | null;
  style_vibes: string | null;    // JSON array of moods (e.g. minimal/clean/modern)
  occasion_tags: string | null;  // JSON array of specific scenarios (weekend/coffee-run/airport)
  energy: string | null;         // JSON array of energy descriptors (effortless/laid-back)
  works_best_for: string | null; // JSON array of styling contexts
  image_base64: string | null;
  image_url: string | null;
  favorite: Generated<boolean>;
  last_worn: Date | null;
  user_id: string | null;
  created_at: Generated<Date>;
}

export interface ProfilesTable {
  user_id: string;
  gender: string | null;
  onboarding_complete: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface OutfitHistoryTable {
  id: Generated<number>;
  outfit_label: string;         // user-facing name e.g. "Monday Work Look"
  clothing_ids: string;         // JSON array of clothing IDs
  occasion: string | null;
  worn_on: Date;
  created_at: Generated<Date>;
}

export interface ScanJobsTable {
  id: string;
  user_id: string;
  status: Generated<string>;
  total: number;
  processed: Generated<number>;
  failed: Generated<number>;
  results: Generated<string>;
  created_at: Generated<Date>;
}

export interface ScanJobFilesTable {
  id: Generated<number>;
  job_id: string;
  filename: string;
  mime: string;
  data: string;
  processed: Generated<boolean>;
}

export interface CatalogTable {
  id: Generated<number>;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  color: string;
  secondary_color: string | null;
  pattern: string | null;
  fabric: string | null;
  fit: string | null;
  formality: string | null;
  style: string | null;
  gender_style: string | null;
  season: string | null;
  style_vibes: string | null;
  occasion_tags: string | null;
  image_url: string;
  created_at: Generated<Date>;
}

export interface Database {
  clothes: ClothesTable;
  outfit_history: OutfitHistoryTable;
  profiles: ProfilesTable;
  scan_jobs: ScanJobsTable;
  scan_job_files: ScanJobFilesTable;
  catalog: CatalogTable;
}

// ── Kysely instance ────────────────────────────────────────────────────────

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});

// ── Connection test ────────────────────────────────────────────────────────

export async function testConnection() {
  try {
    await sql`SELECT 1`.execute(db);
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}
