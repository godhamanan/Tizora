import express, { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import sharp from 'sharp';
import { db } from '../db.js';
import { classifyBatch } from '../lib/scanUtils.js';
import { bgWorker } from '../lib/bgRemovalWorker.js';
import { composeCard, composeCardFallback, checkExtractionQuality } from '../lib/imageCompose.js';

const router = express.Router();
const MAX_BATCH = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: MAX_BATCH },
});

type ScanFile    = { filename: string; mime: string; data: string };
type BgResult    = { ok: true; data: string } | { ok: false };

// ── Background removal batch ───────────────────────────────────────────────
// Processes images sequentially in the Python worker (CPU-bound, single process).
// Never throws — returns {ok:false} for any image that fails or times out.
async function bgRemoveBatch(imagesBase64: string[]): Promise<BgResult[]> {
  const results: BgResult[] = [];
  for (const b64 of imagesBase64) {
    try {
      const data = await bgWorker.remove(b64);
      results.push({ ok: true, data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`   ⚠️  rembg skipped: ${msg.slice(0, 80)}`);
      results.push({ ok: false });
    }
  }
  return results;
}

// ── Card compositing ───────────────────────────────────────────────────────
// Produces a consistent 800×1000 card.
// Prefers the rembg-cleaned version; falls back gracefully to the original.
async function buildCard(
  bgResult: BgResult,
  originalBase64: string
): Promise<string> {
  if (bgResult.ok) {
    try {
      const quality = await checkExtractionQuality(bgResult.data);
      if (quality === 'good') {
        const buf = await composeCard(bgResult.data);
        return `data:image/jpeg;base64,${buf.toString('base64')}`;
      }
    } catch { /* fall through to fallback */ }
  }
  const buf = await composeCardFallback(originalBase64);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

// ── Core async job ─────────────────────────────────────────────────────────
// Single Gemini call for classification AND rembg removal run in parallel.
// Gemini is network-bound; rembg is CPU-bound — they don't block each other.
async function processJobAsync(jobId: string, files: ScanFile[]) {
  try {
    if (!files.length) {
      await db.updateTable('scan_jobs').set({ status: 'complete' }).where('id', '=', jobId).execute();
      return;
    }

    // Delete stale jobs (>2h old) to prevent DB bloat
    await db.deleteFrom('scan_jobs')
      .where('created_at', '<', new Date(Date.now() - 2 * 60 * 60 * 1000))
      .execute();

    // Resize all images for Gemini (900px, parallel sharp calls)
    const resized = await Promise.all(
      files.map(async f => ({
        filename: f.filename,
        mime:     'image/jpeg' as const,
        data:     (await sharp(Buffer.from(f.data, 'base64'))
          .rotate()
          .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer()
        ).toString('base64'),
      }))
    );

    // ── Parallel pipeline ────────────────────────────────────────────────
    // Gemini classify:  ~15-25s  network-bound
    // rembg removal:    ~20-30s  CPU-bound in Python worker
    // Running in parallel means total ≈ max(gemini, rembg) instead of sum.
    // If rembg worker is offline the second branch resolves to null immediately.
    const [classifications, bgResults] = await Promise.all([
      classifyBatch(resized),
      bgWorker.isReady()
        ? bgRemoveBatch(resized.map(r => r.data))
        : Promise.resolve(null),
    ]);

    const successItems: object[] = [];
    let failed = 0;

    for (let i = 0; i < resized.length; i++) {
      const classification = classifications[i];
      if (!classification?.isClothing) {
        failed++;
        console.warn(`   ⚠️  [${resized[i].filename}] skipped — not clothing`);
        continue;
      }

      const bgResult: BgResult = bgResults?.[i] ?? { ok: false };
      const image = await buildCard(bgResult, resized[i].data);

      successItems.push({ ...classification, image });
      const tag = bgResult.ok ? '🖼️ ' : '📷';
      console.log(`   ✅ ${tag} [${resized[i].filename}] ${classification.label}`);
    }

    // Single DB write — same protocol as before
    await sql`
      UPDATE scan_jobs
      SET results   = ${JSON.stringify(successItems)}::text,
          processed = ${resized.length},
          failed    = ${failed},
          status    = 'complete'
      WHERE id = ${jobId}
    `.execute(db);

    console.log(`✅ Job ${jobId} — ${successItems.length} classified, ${failed} skipped`);
  } catch (err) {
    console.error(`❌ Job ${jobId} failed:`, err);
    await db.updateTable('scan_jobs').set({ status: 'failed' }).where('id', '=', jobId).execute();
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /scan/batch
router.post('/', upload.array('images', MAX_BATCH), async (req: Request, res: Response) => {
  try {
    const files  = req.files as Express.Multer.File[];
    const userId = (req as any).userId as string;

    if (!files?.length)           return res.status(400).json({ error: 'No image files provided' });
    if (files.length > MAX_BATCH) return res.status(400).json({ error: `Max ${MAX_BATCH} photos at a time` });

    const jobId    = randomUUID();
    const memFiles: ScanFile[] = files.map(f => ({
      filename: f.originalname,
      mime:     f.mimetype,
      data:     f.buffer.toString('base64'),
    }));

    await db.insertInto('scan_jobs').values({ id: jobId, user_id: userId, total: files.length }).execute();
    res.json({ jobId, total: files.length });

    setImmediate(() => processJobAsync(jobId, memFiles).catch(err => console.error('Uncaught processJobAsync:', err)));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Batch scan error:', msg);
    res.status(500).json({ error: 'Failed to start batch scan', detail: msg });
  }
});

// GET /scan/batch/:jobId
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const job    = await db
      .selectFrom('scan_jobs')
      .select(['id', 'status', 'total', 'processed', 'failed', 'results'])
      .where('id',      '=', req.params.jobId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /scan/batch/:jobId
router.delete('/:jobId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    await db.deleteFrom('scan_jobs')
      .where('id',      '=', req.params.jobId)
      .where('user_id', '=', userId)
      .execute();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
