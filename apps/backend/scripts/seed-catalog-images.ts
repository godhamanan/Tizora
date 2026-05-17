/**
 * One-time script: download catalog clothing images from Pexels,
 * upload to R2 under deterministic paths, update DB rows.
 *
 * Run once after first deploy:
 *   PEXELS_API_KEY=<key> pnpm tsx scripts/seed-catalog-images.ts
 *
 * Get a FREE Pexels API key at: https://www.pexels.com/api/
 *
 * After this runs:
 *   - Images live at R2_PUBLIC_URL/catalog/{mens|womens}/{slug}.jpg
 *   - DB image_url fields are updated to those static R2 URLs
 *   - All future requests serve directly from R2 (no re-fetching ever)
 */

import dotenv from 'dotenv';
dotenv.config();

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { db } from '../src/db.js';

// ── Config ────────────────────────────────────────────────────────────────

const PEXELS_KEY    = process.env.PEXELS_API_KEY;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET     = process.env.R2_BUCKET_NAME;

if (!PEXELS_KEY)    { console.error('❌  PEXELS_API_KEY is required'); process.exit(1); }
if (!R2_PUBLIC_URL) { console.error('❌  R2_PUBLIC_URL is required');  process.exit(1); }
if (!R2_ACCOUNT_ID) { console.error('❌  R2_ACCOUNT_ID is required');  process.exit(1); }
if (!R2_ACCESS_KEY) { console.error('❌  R2_ACCESS_KEY_ID is required'); process.exit(1); }
if (!R2_SECRET_KEY) { console.error('❌  R2_SECRET_ACCESS_KEY is required'); process.exit(1); }
if (!R2_BUCKET)     { console.error('❌  R2_BUCKET_NAME is required');  process.exit(1); }

const r2 = new S3Client({
  region:      'auto',
  endpoint:    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY!, secretAccessKey: R2_SECRET_KEY! },
  forcePathStyle: true,
});

// ── Pexels search queries per item ────────────────────────────────────────
// Tuned for neutral backgrounds, fashion-forward results, no visible logos.

const SEARCH_QUERIES: Record<string, string> = {
  // Men's tops
  'White Cotton T-Shirt':       'white plain t-shirt men fashion',
  'Black Cotton T-Shirt':        'black plain t-shirt men fashion minimal',
  'Charcoal Fitted T-Shirt':     'charcoal grey t-shirt men fitted',
  'White Oxford Shirt':          'white oxford button down shirt men formal',
  'Light Blue Oxford Shirt':     'light blue dress shirt men',
  'Navy Button-Down Shirt':      'navy blue button down shirt men',
  'Gray Hoodie':                 'grey hoodie men casual',
  'Navy Zip-Up Hoodie':          'navy hoodie zip up men',
  'Cream Crewneck Sweatshirt':   'cream white sweatshirt men crewneck',
  // Men's bottoms
  'Black Slim Jeans':            'black slim jeans men fashion',
  'Dark Indigo Slim Jeans':      'dark blue slim fit jeans men',
  'Khaki Chinos':                'khaki chino trousers men',
  'Olive Chinos':                'olive green chinos trousers men',
  'Black Tailored Trousers':     'black dress trousers men formal',
  'Navy Tailored Trousers':      'navy blue trousers men tailored',
  'Gray Athletic Joggers':       'grey joggers men athletic',
  'Black Athletic Shorts':       'black athletic shorts men gym',
  // Men's outerwear
  'Navy Unstructured Blazer':    'navy blue blazer men unstructured',
  'Charcoal Blazer':             'charcoal grey blazer men formal',
  'Black Bomber Jacket':         'black bomber jacket men',
  'Olive Bomber Jacket':         'olive green bomber jacket men',
  // Men's shoes
  'White Leather Sneakers':      'white leather sneakers minimal clean',
  'Black Chelsea Boots':         'black chelsea boots men leather',
  'Brown Chelsea Boots':         'brown chelsea boots men leather',
  'Black Leather Loafers':       'black loafers men leather formal',

  // Women's tops
  'White Classic T-Shirt':       'white plain t-shirt women minimal',
  'Black Classic T-Shirt':        'black plain t-shirt women fashion',
  'White Silk Blouse':           'white silk blouse women elegant',
  'Cream Oversized Knit':        'cream oversized knit sweater women',
  'Black Fitted Knit Top':       'black fitted knit top women',
  'Black Bodysuit':              'black bodysuit women fashion',
  'Gray Oversized Hoodie':       'grey oversized hoodie women',
  'Black Cropped Sweatshirt':    'black cropped sweatshirt women',
  'Black Sports Bra':            'black sports bra women athletic',
  // Women's bottoms
  'Black High-Waist Jeans':      'black high waist jeans women',
  'White Straight-Leg Jeans':    'white straight jeans women',
  'Beige Tailored Trousers':     'beige tailored trousers women',
  'Black Tailored Trousers':     'black tailored trousers women',
  'Black Midi Skirt':            'black midi skirt women satin',
  'Black Mini Skirt':            'black mini skirt women fashion',
  'Black Leggings':              'black leggings women athletic',
  // Women's dresses
  'Black Fitted Midi Dress':     'black midi dress women elegant fitted',
  'White Summer Dress':          'white summer dress women casual',
  // Women's outerwear
  'Black Blazer':                'black blazer women formal',
  'Camel Trench Coat':           'camel trench coat women fashion',
  'Black Denim Jacket':          'black denim jacket women',
  'Cream Cardigan':              'cream white cardigan women knit',
  // Women's shoes
  'White Leather Sneakers':      'white leather sneakers women minimal',
  'Black Ankle Boots':           'black ankle boots women leather',
  'Black High Heels':            'black high heels women fashion',
};

// ── Helpers ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function searchPexels(query: string): Promise<string | null> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=portrait&size=large`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY! } });
  if (!res.ok) {
    console.warn(`    Pexels search failed (${res.status}) for: "${query}"`);
    return null;
  }
  const data = await res.json() as { photos: Array<{ width: number; height: number; src: { large2x: string; large: string } }> };
  // Prefer taller images (portrait) for wardrobe card proportions
  const sorted = (data.photos ?? []).sort((a, b) => (b.height / b.width) - (a.height / a.width));
  const photo = sorted[0];
  return photo?.src?.large2x ?? photo?.src?.large ?? null;
}

async function r2Exists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET!, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadToR2(buffer: Buffer, key: string): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket:      R2_BUCKET!,
    Key:         key,
    Body:        buffer,
    ContentType: 'image/jpeg',
    // Public-read (Cloudflare R2 uses bucket-level public access, not per-object ACL)
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const items = await db
    .selectFrom('catalog')
    .select(['id', 'name', 'gender_style'])
    .orderBy('id', 'asc')
    .execute();

  if (!items.length) {
    console.error('❌  Catalog is empty — run the app once to seed the catalog rows first');
    process.exit(1);
  }

  console.log(`\n📸 Seeding images for ${items.length} catalog items\n`);
  let ok = 0; let skipped = 0; let failed = 0;

  for (const item of items) {
    const gender  = item.gender_style === 'womenswear' ? 'womens' : 'mens';
    const slug    = toSlug(item.name ?? '');
    const r2Key   = `catalog/${gender}/${slug}.jpg`;
    const r2Url   = `${R2_PUBLIC_URL}/${r2Key}`;
    const query   = SEARCH_QUERIES[item.name ?? ''];

    process.stdout.write(`  [${String(item.id).padStart(2)}] ${(item.name ?? '').padEnd(32)} `);

    if (!query) {
      console.log('⚠️  no query — skipped');
      skipped++;
      continue;
    }

    try {
      // Skip if already in R2 (idempotent re-runs)
      if (await r2Exists(r2Key)) {
        // Still update DB in case URL drifted
        await db.updateTable('catalog').set({ image_url: r2Url }).where('id', '=', item.id).execute();
        console.log('✓  already in R2');
        ok++;
        continue;
      }

      // Search Pexels
      const srcUrl = await searchPexels(query);
      if (!srcUrl) {
        console.log('⚠️  no Pexels result');
        skipped++;
        continue;
      }

      // Download
      const raw = await fetch(srcUrl);
      if (!raw.ok) throw new Error(`download failed: ${raw.status}`);
      const rawBuf = Buffer.from(await raw.arrayBuffer());

      // Resize to 800×1000 (4:5 portrait — matches wardrobe card)
      const processed = await sharp(rawBuf)
        .resize(800, 1000, { fit: 'cover', position: 'entropy' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

      // Upload to R2
      await uploadToR2(processed, r2Key);

      // Update DB
      await db.updateTable('catalog').set({ image_url: r2Url }).where('id', '=', item.id).execute();

      console.log(`✅  ${Math.round(processed.length / 1024)}KB → ${r2Key}`);
      ok++;

    } catch (err) {
      console.log(`❌  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    // Gentle rate limit — Pexels free tier: 200 req/hour
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\n── Summary ──────────────────────────`);
  console.log(`✅  ${ok} uploaded / updated`);
  if (skipped) console.log(`⚠️   ${skipped} skipped (no query or no Pexels result)`);
  if (failed)  console.log(`❌  ${failed} failed`);
  console.log(`─────────────────────────────────────\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
