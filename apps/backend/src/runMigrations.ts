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

  // ── 011: rename occasion tags — 'weekend'→'casual-outing', 'vacation'→'workout', 'festival'→'festive'
  await sql`UPDATE clothes SET occasion_tags = REPLACE(occasion_tags, 'weekend', 'casual-outing') WHERE occasion_tags LIKE '%weekend%'`.execute(db);
  await sql`UPDATE clothes SET occasion_tags = REPLACE(occasion_tags, 'vacation', 'workout') WHERE occasion_tags LIKE '%vacation%'`.execute(db);
  await sql`UPDATE clothes SET occasion_tags = REPLACE(occasion_tags, 'festival', 'festive') WHERE occasion_tags LIKE '%festival%'`.execute(db);

  // ── 012a: Phase 0 columns on catalog ────────────────────────────────────
  for (const col of [
    'color_undertone', 'color_saturation', 'piece_role',
    'layer_role', 'fabric_weight', 'color_pairs', 'contrast_affinity',
  ]) {
    await addColumnIfMissing('catalog', col, 'text');
  }

  // ── 012b: seed wardrobe essentials (idempotent — only if catalog is empty)
  const catalogCount = await db.selectFrom('catalog')
    .select(db.fn.countAll<number>().as('n'))
    .executeTakeFirst();

  if (!catalogCount || Number(catalogCount.n) === 0) {
    const img = (hex: string, text = 'FFFFFF') =>
      `https://placehold.co/400x500/${hex}/${text}`;

    // All array fields stored as comma-separated strings (matches scoreItem split logic).
    // occasion_tags uses renamed keys: casual-outing / workout / festive.
    await db.insertInto('catalog').values([

      // ── MEN'S ESSENTIALS ────────────────────────────────────────────────

      // TOPS
      { name: 'White Cotton T-Shirt',       category: 'Tops',     subcategory: 'T-Shirt',              color: 'white',      pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'casual',          style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'minimal,clean,relaxed,modern',          occasion_tags: 'casual-outing,travel,college,brunch,coffee-run,errands,movie-night',   color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'black,navy,olive,gray,tan',     contrast_affinity: 'flexible',    image_url: img('F5F5F5', '555555') },
      { name: 'Black Cotton T-Shirt',        category: 'Tops',     subcategory: 'T-Shirt',              color: 'black',      pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'casual',          style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'minimal,clean,modern',                  occasion_tags: 'casual-outing,travel,date-night,night-out,college,movie-night',        color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'white,gray,olive,rust,cream',   contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'Charcoal Fitted T-Shirt',     category: 'Tops',     subcategory: 'T-Shirt',              color: 'charcoal',   pattern: 'solid', fabric: 'cotton',      fit: 'slim',     formality: 'casual',          style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'minimal,clean,modern,dark-academia',    occasion_tags: 'casual-outing,date-night,travel,college,brunch',                       color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'cream,tan,white,olive,rust',    contrast_affinity: 'flexible',    image_url: img('3A3A3A') },
      { name: 'White Oxford Shirt',          category: 'Tops',     subcategory: 'Oxford',               color: 'white',      pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'business-casual', style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'clean,polished,tailored,old-money',     occasion_tags: 'office,date-night,brunch,interview,presentation,meeting,wedding',      color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'medium', color_pairs: 'navy,charcoal,black,tan',       contrast_affinity: 'flexible',    image_url: img('F5F5F5', '555555') },
      { name: 'Light Blue Oxford Shirt',     category: 'Tops',     subcategory: 'Oxford',               color: 'light blue', pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'business-casual', style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'clean,polished,classic',                occasion_tags: 'office,date-night,brunch,interview,presentation,meeting',              color_undertone: 'cool',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'medium', color_pairs: 'navy,charcoal,tan,gray',        contrast_affinity: 'tonal',       image_url: img('A8C5E0', '333333') },
      { name: 'Navy Button-Down Shirt',      category: 'Tops',     subcategory: 'Button-Down',          color: 'navy',       pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'clean,classic,polished,modern',         occasion_tags: 'office,date-night,casual-outing,brunch,dinner-out,after-work-drinks', color_undertone: 'cool',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'medium', color_pairs: 'white,gray,tan,cream',          contrast_affinity: 'contrastful', image_url: img('1A3050') },
      { name: 'Gray Hoodie',                 category: 'Tops',     subcategory: 'Hoodie',               color: 'gray',       pattern: 'solid', fabric: 'cotton-fleece', fit: 'relaxed', formality: 'casual',          style: 'Western', gender_style: 'menswear',  season: 'autumn,winter',    style_vibes: 'relaxed,cozy,clean,modern',             occasion_tags: 'casual-outing,travel,workout,college,movie-night,lounge,errands',     color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'mid',       fabric_weight: 'medium', color_pairs: 'black,white,navy,olive',        contrast_affinity: 'tonal',       image_url: img('9E9E9E') },
      { name: 'Navy Zip-Up Hoodie',          category: 'Tops',     subcategory: 'Hoodie',               color: 'navy',       pattern: 'solid', fabric: 'cotton-fleece', fit: 'regular', formality: 'casual',          style: 'Western', gender_style: 'menswear',  season: 'autumn,winter',    style_vibes: 'relaxed,clean,modern,sporty',           occasion_tags: 'casual-outing,travel,workout,college,movie-night,gym',                color_undertone: 'cool',    color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'mid',       fabric_weight: 'medium', color_pairs: 'black,white,gray,olive',        contrast_affinity: 'tonal',       image_url: img('1A3050') },
      { name: 'Cream Crewneck Sweatshirt',   category: 'Tops',     subcategory: 'Sweatshirt',           color: 'cream',      pattern: 'solid', fabric: 'cotton-fleece', fit: 'regular', formality: 'casual',          style: 'Western', gender_style: 'menswear',  season: 'autumn,winter',    style_vibes: 'cozy,clean,minimal,relaxed',            occasion_tags: 'casual-outing,travel,college,coffee-run,brunch',                      color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'mid',       fabric_weight: 'medium', color_pairs: 'black,navy,olive,gray,tan',     contrast_affinity: 'flexible',    image_url: img('F5EED5', '555555') },

      // BOTTOMS
      { name: 'Black Slim Jeans',            category: 'Bottoms',  subcategory: 'Jeans',                color: 'black',      pattern: 'solid', fabric: 'denim',       fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'minimal,clean,modern,dark-academia',    occasion_tags: 'casual-outing,date-night,night-out,college,brunch,dinner-out,concert', color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,cream,gray,navy,olive',   contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'Dark Indigo Slim Jeans',      category: 'Bottoms',  subcategory: 'Jeans',                color: 'navy',       pattern: 'solid', fabric: 'denim',       fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'clean,modern,classic,polished',         occasion_tags: 'casual-outing,date-night,brunch,dinner-out,college,concert',          color_undertone: 'cool',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,cream,gray,tan',          contrast_affinity: 'contrastful', image_url: img('1A3050') },
      { name: 'Khaki Chinos',                category: 'Bottoms',  subcategory: 'Chinos',               color: 'tan',        pattern: 'solid', fabric: 'cotton',      fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'spring,summer,autumn', style_vibes: 'clean,classic,polished,prep',       occasion_tags: 'office,casual-outing,brunch,date-night,dinner-out,meeting',           color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,navy,olive,cream,gray',   contrast_affinity: 'flexible',    image_url: img('C8A97E', '333333') },
      { name: 'Olive Chinos',                category: 'Bottoms',  subcategory: 'Chinos',               color: 'olive',      pattern: 'solid', fabric: 'cotton',      fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'spring,summer,autumn', style_vibes: 'clean,modern,relaxed,coastal',      occasion_tags: 'casual-outing,brunch,date-night,coffee-run,travel',                   color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,cream,tan,navy,gray',     contrast_affinity: 'flexible',    image_url: img('6B7C3A') },
      { name: 'Black Tailored Trousers',     category: 'Bottoms',  subcategory: 'Trousers',             color: 'black',      pattern: 'solid', fabric: 'wool-blend',  fit: 'slim',     formality: 'business-casual', style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'polished,tailored,sharp,quiet-luxury',  occasion_tags: 'office,date-night,wedding,dinner-out,interview,formal-event',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,cream,gray,navy,light-blue', contrast_affinity: 'flexible',  image_url: img('1A1A1A') },
      { name: 'Navy Tailored Trousers',      category: 'Bottoms',  subcategory: 'Trousers',             color: 'navy',       pattern: 'solid', fabric: 'wool-blend',  fit: 'slim',     formality: 'business-casual', style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'polished,classic,tailored,sharp',       occasion_tags: 'office,date-night,dinner-out,wedding,interview,presentation',         color_undertone: 'cool',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,cream,light-blue,tan',    contrast_affinity: 'contrastful', image_url: img('1A3050') },
      { name: 'Gray Athletic Joggers',       category: 'Bottoms',  subcategory: 'Joggers',              color: 'gray',       pattern: 'solid', fabric: 'cotton-fleece', fit: 'relaxed', formality: 'casual',          style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'relaxed,cozy,sporty',                   occasion_tags: 'casual-outing,workout,travel,lounge,movie-night,gym,errands',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,black,navy,charcoal',     contrast_affinity: 'tonal',       image_url: img('9E9E9E') },
      { name: 'Black Athletic Shorts',       category: 'Bottoms',  subcategory: 'Shorts',               color: 'black',      pattern: 'solid', fabric: 'polyester',   fit: 'regular',  formality: 'athletic',        style: 'Western', gender_style: 'menswear',  season: 'spring,summer',    style_vibes: 'sporty',                                occasion_tags: 'workout,gym,run,sports',                                               color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'standalone', fabric_weight: 'light',  color_pairs: 'white,gray,black',              contrast_affinity: 'flexible',    image_url: img('1A1A1A') },

      // OUTERWEAR
      { name: 'Navy Unstructured Blazer',    category: 'Outerwear', subcategory: 'Blazer',             color: 'navy',       pattern: 'solid', fabric: 'cotton-linen', fit: 'slim',    formality: 'business-casual', style: 'Western', gender_style: 'menswear',  season: 'spring,autumn',    style_vibes: 'polished,tailored,quiet-luxury,classic', occasion_tags: 'office,date-night,wedding,dinner-out,interview,after-work-drinks,brunch', color_undertone: 'cool', color_saturation: 'muted', piece_role: 'hero', layer_role: 'outer',      fabric_weight: 'medium', color_pairs: 'white,cream,tan,gray,light-blue', contrast_affinity: 'contrastful', image_url: img('1A3050') },
      { name: 'Charcoal Blazer',             category: 'Outerwear', subcategory: 'Blazer',             color: 'charcoal',   pattern: 'solid', fabric: 'wool-blend',   fit: 'slim',    formality: 'business-casual', style: 'Western', gender_style: 'menswear',  season: 'autumn,winter',    style_vibes: 'polished,sharp,tailored,dark-academia',  occasion_tags: 'office,date-night,wedding,dinner-out,interview,formal-event',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero', layer_role: 'outer',      fabric_weight: 'heavy',  color_pairs: 'white,cream,light-blue,tan',    contrast_affinity: 'contrastful', image_url: img('3A3A3A') },
      { name: 'Black Bomber Jacket',         category: 'Outerwear', subcategory: 'Bomber Jacket',      color: 'black',      pattern: 'solid', fabric: 'nylon',        fit: 'regular', formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'spring,autumn',    style_vibes: 'minimal,clean,modern,streetwear',        occasion_tags: 'date-night,night-out,casual-outing,travel,concert',                   color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero', layer_role: 'outer',      fabric_weight: 'medium', color_pairs: 'white,cream,gray,navy,olive',   contrast_affinity: 'contrastful', image_url: img('1A1A1A') },
      { name: 'Olive Bomber Jacket',         category: 'Outerwear', subcategory: 'Bomber Jacket',      color: 'olive',      pattern: 'solid', fabric: 'nylon',        fit: 'regular', formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'spring,autumn',    style_vibes: 'minimal,modern,streetwear,clean',        occasion_tags: 'date-night,casual-outing,travel,concert,night-out',                   color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'hero', layer_role: 'outer',      fabric_weight: 'medium', color_pairs: 'black,white,cream,tan,navy',    contrast_affinity: 'flexible',    image_url: img('6B7C3A') },

      // SHOES
      { name: 'White Leather Sneakers',      category: 'Shoes',    subcategory: 'Sneakers (White Leather)', color: 'white', pattern: 'solid', fabric: 'leather',     fit: 'regular',  formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'all-season',       style_vibes: 'minimal,clean,modern,classic',          occasion_tags: 'casual-outing,date-night,brunch,travel,college,coffee-run',           color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'black,navy,gray,olive,tan',     contrast_affinity: 'flexible',    image_url: img('F5F5F5', '555555') },
      { name: 'Black Chelsea Boots',         category: 'Shoes',    subcategory: 'Chelsea Boots',        color: 'black',      pattern: 'solid', fabric: 'leather',     fit: 'regular',  formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'autumn,winter',    style_vibes: 'clean,polished,classic,dark-academia',  occasion_tags: 'office,date-night,night-out,casual-outing,brunch,dinner-out',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'gray,cream,white,navy,olive',   contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'Brown Chelsea Boots',         category: 'Shoes',    subcategory: 'Chelsea Boots',        color: 'brown',      pattern: 'solid', fabric: 'leather',     fit: 'regular',  formality: 'smart-casual',    style: 'Western', gender_style: 'menswear',  season: 'autumn,winter',    style_vibes: 'clean,classic,polished,old-money',      occasion_tags: 'office,date-night,casual-outing,brunch,dinner-out,wedding',           color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'navy,cream,olive,tan,gray',     contrast_affinity: 'contrastful', image_url: img('7B5840') },
      { name: 'Black Leather Loafers',       category: 'Shoes',    subcategory: 'Loafers',              color: 'black',      pattern: 'solid', fabric: 'leather',     fit: 'regular',  formality: 'business-casual', style: 'Western', gender_style: 'menswear',  season: 'spring,summer,autumn', style_vibes: 'polished,classic,quiet-luxury,tailored', occasion_tags: 'office,date-night,brunch,dinner-out,interview,wedding',               color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'gray,navy,cream,tan,white',     contrast_affinity: 'flexible',    image_url: img('1A1A1A') },

      // ── WOMEN'S ESSENTIALS ──────────────────────────────────────────────

      // TOPS
      { name: 'White Classic T-Shirt',       category: 'Tops',     subcategory: 'T-Shirt',              color: 'white',      pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'casual',          style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'minimal,clean,relaxed,modern,clean-girl', occasion_tags: 'casual-outing,travel,college,brunch,coffee-run,errands',              color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'black,navy,olive,gray,tan',     contrast_affinity: 'flexible',    image_url: img('F5F5F5', '555555') },
      { name: 'Black Classic T-Shirt',        category: 'Tops',     subcategory: 'T-Shirt',              color: 'black',      pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'casual',          style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'minimal,clean,modern,clean-girl',       occasion_tags: 'casual-outing,travel,date-night,college,movie-night,night-out',       color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'white,gray,olive,rust,cream',   contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'White Silk Blouse',           category: 'Tops',     subcategory: 'Blouse',               color: 'white',      pattern: 'solid', fabric: 'silk',        fit: 'regular',  formality: 'business-casual', style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'polished,clean,elegant,office-siren,quiet-luxury', occasion_tags: 'office,date-night,brunch,dinner-out,interview,meeting,wedding',   color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'black,navy,tan,charcoal,camel', contrast_affinity: 'flexible',    image_url: img('F5F5F5', '555555') },
      { name: 'Cream Oversized Knit',        category: 'Tops',     subcategory: 'Knit',                 color: 'cream',      pattern: 'solid', fabric: 'wool',        fit: 'oversized', formality: 'casual',         style: 'Western', gender_style: 'womenswear', season: 'autumn,winter',    style_vibes: 'cozy,soft,clean,clean-girl,romantic',   occasion_tags: 'casual-outing,brunch,college,coffee-run,date-night',                  color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'base',       fabric_weight: 'heavy',  color_pairs: 'black,navy,tan,gray,white',     contrast_affinity: 'tonal',       image_url: img('F5EED5', '555555') },
      { name: 'Black Fitted Knit Top',       category: 'Tops',     subcategory: 'Knit',                 color: 'black',      pattern: 'solid', fabric: 'knit',        fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'autumn,winter',    style_vibes: 'minimal,clean,polished,modern,clean-girl', occasion_tags: 'casual-outing,date-night,brunch,dinner-out,office',                color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'medium', color_pairs: 'white,gray,tan,camel,cream',    contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'Black Bodysuit',              category: 'Tops',     subcategory: 'Bodysuit',             color: 'black',      pattern: 'solid', fabric: 'cotton',      fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'minimal,clean,modern,polished',         occasion_tags: 'casual-outing,date-night,night-out,office,brunch,dinner-out',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'white,gray,tan,camel,cream,navy', contrast_affinity: 'flexible',  image_url: img('1A1A1A') },
      { name: 'Gray Oversized Hoodie',       category: 'Tops',     subcategory: 'Hoodie',               color: 'gray',       pattern: 'solid', fabric: 'cotton-fleece', fit: 'oversized', formality: 'casual',       style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'cozy,relaxed,clean-girl,clean,sporty',  occasion_tags: 'casual-outing,workout,travel,college,movie-night,gym,lounge',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'mid',       fabric_weight: 'medium', color_pairs: 'black,white,navy,charcoal',     contrast_affinity: 'tonal',       image_url: img('9E9E9E') },
      { name: 'Black Cropped Sweatshirt',    category: 'Tops',     subcategory: 'Sweatshirt',           color: 'black',      pattern: 'solid', fabric: 'cotton-fleece', fit: 'regular', formality: 'casual',          style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'relaxed,clean,modern,clean-girl',       occasion_tags: 'casual-outing,workout,travel,college,coffee-run',                     color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'mid',       fabric_weight: 'medium', color_pairs: 'white,gray,tan,olive,navy',     contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'Black Sports Bra',            category: 'Tops',     subcategory: 'Tank',                 color: 'black',      pattern: 'solid', fabric: 'polyester-spandex', fit: 'slim', formality: 'athletic',       style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'sporty,clean-girl',                     occasion_tags: 'workout,gym,yoga,run,sports',                                         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'base',       fabric_weight: 'light',  color_pairs: 'black,gray,white,navy',         contrast_affinity: 'flexible',    image_url: img('1A1A1A') },

      // BOTTOMS
      { name: 'Black High-Waist Jeans',      category: 'Bottoms',  subcategory: 'Jeans',                color: 'black',      pattern: 'solid', fabric: 'denim',       fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'minimal,clean,modern,clean-girl',       occasion_tags: 'casual-outing,date-night,brunch,office,college,dinner-out,concert',  color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,cream,gray,navy,camel',   contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'White Straight-Leg Jeans',    category: 'Bottoms',  subcategory: 'Jeans',                color: 'white',      pattern: 'solid', fabric: 'denim',       fit: 'straight', formality: 'casual',          style: 'Western', gender_style: 'womenswear', season: 'spring,summer',    style_vibes: 'minimal,clean,fresh,clean-girl,coastal', occasion_tags: 'casual-outing,brunch,date-night,travel,college,coffee-run',           color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'black,navy,olive,tan,cream',    contrast_affinity: 'contrastful', image_url: img('F5F5F5', '555555') },
      { name: 'Beige Tailored Trousers',     category: 'Bottoms',  subcategory: 'Trousers',             color: 'beige',      pattern: 'solid', fabric: 'cotton-blend', fit: 'slim',    formality: 'business-casual', style: 'Western', gender_style: 'womenswear', season: 'spring,summer,autumn', style_vibes: 'polished,clean,quiet-luxury,tailored,office-siren', occasion_tags: 'office,date-night,brunch,dinner-out,interview,meeting', color_undertone: 'warm', color_saturation: 'muted', piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,black,navy,camel,tan', contrast_affinity: 'flexible', image_url: img('E8D5B7', '555555') },
      { name: 'Black Tailored Trousers',     category: 'Bottoms',  subcategory: 'Trousers',             color: 'black',      pattern: 'solid', fabric: 'wool-blend',   fit: 'slim',    formality: 'business-casual', style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'polished,clean,sharp,tailored,office-siren,quiet-luxury', occasion_tags: 'office,date-night,dinner-out,interview,meeting,formal-event', color_undertone: 'neutral', color_saturation: 'muted', piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'white,cream,tan,camel,light-blue', contrast_affinity: 'flexible', image_url: img('1A1A1A') },
      { name: 'Black Midi Skirt',            category: 'Bottoms',  subcategory: 'Midi Skirt',           color: 'black',      pattern: 'solid', fabric: 'satin',       fit: 'straight', formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'elegant,feminine,polished,romantic,clean-girl', occasion_tags: 'date-night,brunch,dinner-out,night-out,office,wedding',              color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'standalone', fabric_weight: 'light',  color_pairs: 'white,cream,tan,camel,light-blue', contrast_affinity: 'contrastful', image_url: img('1A1A1A') },
      { name: 'Black Mini Skirt',            category: 'Bottoms',  subcategory: 'Mini Skirt',           color: 'black',      pattern: 'solid', fabric: 'cotton',      fit: 'regular',  formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'spring,summer',    style_vibes: 'edgy,modern,clean,streetwear',          occasion_tags: 'date-night,night-out,casual-outing,concert,brunch',                   color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'standalone', fabric_weight: 'light',  color_pairs: 'white,cream,gray,olive',        contrast_affinity: 'contrastful', image_url: img('1A1A1A') },
      { name: 'Black Leggings',              category: 'Bottoms',  subcategory: 'Sweatpants',           color: 'black',      pattern: 'solid', fabric: 'polyester-spandex', fit: 'slim', formality: 'athletic',       style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'sporty,clean-girl',                     occasion_tags: 'workout,gym,yoga,run,sports,casual-outing',                           color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'neutral', layer_role: 'standalone', fabric_weight: 'light', color_pairs: 'white,gray,black,navy',         contrast_affinity: 'flexible',    image_url: img('1A1A1A') },

      // DRESSES
      { name: 'Black Fitted Midi Dress',     category: 'Dress',    subcategory: null,                   color: 'black',      pattern: 'solid', fabric: 'jersey',      fit: 'slim',     formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'elegant,minimal,polished,romantic,clean-girl', occasion_tags: 'date-night,night-out,dinner-out,brunch,wedding,formal-event',        color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'standalone', fabric_weight: 'light',  color_pairs: 'camel,tan,cream,gold,nude',     contrast_affinity: 'tonal',       image_url: img('1A1A1A') },
      { name: 'White Summer Dress',          category: 'Dress',    subcategory: null,                   color: 'white',      pattern: 'solid', fabric: 'cotton',      fit: 'relaxed',  formality: 'casual',          style: 'Western', gender_style: 'womenswear', season: 'spring,summer',    style_vibes: 'romantic,breezy,clean,coastal,feminine,clean-girl', occasion_tags: 'casual-outing,brunch,travel,beach,date-night,garden-party',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'standalone', fabric_weight: 'light',  color_pairs: 'tan,camel,olive,navy',          contrast_affinity: 'tonal',       image_url: img('F5F5F5', '555555') },

      // OUTERWEAR
      { name: 'Black Blazer',                category: 'Outerwear', subcategory: 'Blazer',             color: 'black',      pattern: 'solid', fabric: 'cotton-blend', fit: 'slim',    formality: 'business-casual', style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'polished,sharp,clean,office-siren,quiet-luxury', occasion_tags: 'office,date-night,dinner-out,interview,after-work-drinks,wedding',   color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'outer',      fabric_weight: 'medium', color_pairs: 'white,cream,gray,tan,camel',    contrast_affinity: 'contrastful', image_url: img('1A1A1A') },
      { name: 'Camel Trench Coat',           category: 'Outerwear', subcategory: 'Trench Coat',        color: 'camel',      pattern: 'solid', fabric: 'cotton',       fit: 'regular', formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'spring,autumn',    style_vibes: 'elegant,classic,timeless,quiet-luxury,old-money', occasion_tags: 'office,date-night,casual-outing,brunch,travel,airport',             color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'outer',      fabric_weight: 'medium', color_pairs: 'black,white,navy,cream,tan',    contrast_affinity: 'flexible',    image_url: img('C9A36E', '333333') },
      { name: 'Black Denim Jacket',          category: 'Outerwear', subcategory: 'Denim Jacket',       color: 'black',      pattern: 'solid', fabric: 'denim',        fit: 'regular', formality: 'casual',          style: 'Western', gender_style: 'womenswear', season: 'spring,autumn',    style_vibes: 'relaxed,casual,modern,clean,streetwear', occasion_tags: 'casual-outing,travel,brunch,college,concert,date-night',             color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'outer',      fabric_weight: 'medium', color_pairs: 'white,cream,gray,olive,navy',   contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'Cream Cardigan',              category: 'Outerwear', subcategory: 'Cardigan',           color: 'cream',      pattern: 'solid', fabric: 'knit',         fit: 'oversized', formality: 'casual',         style: 'Western', gender_style: 'womenswear', season: 'autumn,winter',    style_vibes: 'cozy,soft,romantic,clean-girl,feminine', occasion_tags: 'casual-outing,brunch,date-night,college,coffee-run',                 color_undertone: 'warm',    color_saturation: 'muted',  piece_role: 'hero',   layer_role: 'outer',      fabric_weight: 'medium', color_pairs: 'black,white,tan,camel,navy',    contrast_affinity: 'flexible',    image_url: img('F5EED5', '555555') },

      // SHOES
      { name: 'White Leather Sneakers',      category: 'Shoes',    subcategory: 'Sneakers (White Leather)', color: 'white', pattern: 'solid', fabric: 'leather',     fit: 'regular',  formality: 'casual',          style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'minimal,clean,modern,clean-girl',       occasion_tags: 'casual-outing,date-night,brunch,travel,college,coffee-run',           color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'black,navy,gray,olive,tan',     contrast_affinity: 'flexible',    image_url: img('F5F5F5', '555555') },
      { name: 'Black Ankle Boots',           category: 'Shoes',    subcategory: 'Ankle Boots',          color: 'black',      pattern: 'solid', fabric: 'leather',     fit: 'regular',  formality: 'smart-casual',    style: 'Western', gender_style: 'womenswear', season: 'autumn,winter',    style_vibes: 'clean,polished,modern,dark-academia,edgy', occasion_tags: 'casual-outing,date-night,night-out,brunch,office,dinner-out',       color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'gray,cream,white,tan,camel',    contrast_affinity: 'flexible',    image_url: img('1A1A1A') },
      { name: 'Black High Heels',            category: 'Shoes',    subcategory: 'Heels',                color: 'black',      pattern: 'solid', fabric: 'leather',     fit: 'regular',  formality: 'formal',          style: 'Western', gender_style: 'womenswear', season: 'all-season',       style_vibes: 'elegant,polished,dressy,office-siren',  occasion_tags: 'date-night,night-out,office,dinner-out,wedding,formal-event',         color_undertone: 'neutral', color_saturation: 'muted',  piece_role: 'anchor', layer_role: 'standalone', fabric_weight: 'medium', color_pairs: 'black,cream,tan,camel,white',   contrast_affinity: 'flexible',    image_url: img('1A1A1A') },

    ]).execute();

    console.log('✅ Seeded 50 wardrobe essentials into catalog');
  }

  console.log('✅ All migrations complete');
}
