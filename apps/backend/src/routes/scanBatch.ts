import express, { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import sharp from 'sharp';
import { db } from '../db.js';
import { classifyItem } from '../lib/scanUtils.js';

const router = express.Router();
const MAX_BATCH = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: MAX_BATCH },
});

type ScanFile = { filename: string; mime: string; data: string };

// ── Process up to CONCURRENCY images at once, each as an independent
//    Gemini call with the proven CLASSIFY_PROMPT (not a batch prompt —
//    batch single-call had quality issues with multi-image attention).
//    Each result writes atomically to DB so the frontend sees them appear
//    progressively as polling ticks. ──────────────────────────────────────
const CONCURRENCY = 3;

async function processJobAsync(jobId: string, files: ScanFile[]) {
  try {
    if (!files.length) {
      await db.updateTable('scan_jobs').set({ status: 'complete' }).where('id', '=', jobId).execute();
      return;
    }

    // Resize all images first (CPU-bound, safe to parallelize fully)
    const resized = await Promise.all(
      files.map(async f => ({
        filename: f.filename,
        data:     (await sharp(Buffer.from(f.data, 'base64'))
          .rotate()
          .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer()
        ).toString('base64'),
      }))
    );

    const processOne = async (idx: number): Promise<void> => {
      const file = resized[idx];
      try {
        const classification = await classifyItem(Buffer.from(file.data, 'base64'), 'image/jpeg');
        if (!classification?.isClothing) throw new Error('Not clothing');

        const scannedItem = { ...classification, image: `data:image/jpeg;base64,${file.data}` };
        await sql`
          UPDATE scan_jobs
          SET results   = (results::jsonb || ${JSON.stringify([scannedItem])}::jsonb)::text,
              processed = processed + 1
          WHERE id = ${jobId}
        `.execute(db);
        console.log(`   ✅ [${file.filename}] ${classification.label}`);
      } catch (err) {
        await sql`
          UPDATE scan_jobs
          SET processed = processed + 1,
              failed    = failed + 1
          WHERE id = ${jobId}
        `.execute(db);
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`   ⚠️  [${file.filename}] skipped — ${msg}`);
      }
    };

    // Run in chunks so we never have more than CONCURRENCY Gemini calls
    // in flight simultaneously — keeps us well under rate limits and gives
    // each image full attention from a separate API call.
    for (let i = 0; i < resized.length; i += CONCURRENCY) {
      const indices = Array.from(
        { length: Math.min(CONCURRENCY, resized.length - i) },
        (_, k) => i + k,
      );
      await Promise.allSettled(indices.map(processOne));
    }

    await db.updateTable('scan_jobs').set({ status: 'complete' }).where('id', '=', jobId).execute();
    console.log(`✅ Job ${jobId} complete`);
  } catch (err) {
    console.error(`❌ Job ${jobId} failed:`, err);
    await db.updateTable('scan_jobs').set({ status: 'failed' }).where('id', '=', jobId).execute();
  }
}

// POST /scan/batch
router.post('/', upload.array('images', MAX_BATCH), async (req: Request, res: Response) => {
  try {
    const files  = req.files as Express.Multer.File[];
    const userId = (req as any).userId as string;

    if (!files?.length)           return res.status(400).json({ error: 'No image files provided' });
    if (files.length > MAX_BATCH) return res.status(400).json({ error: `Max ${MAX_BATCH} photos at a time` });

    const jobId = randomUUID();
    const memFiles: ScanFile[] = files.map(f => ({
      filename: f.originalname,
      mime:     f.mimetype,
      data:     f.buffer.toString('base64'),
    }));

    await db.insertInto('scan_jobs').values({ id: jobId, user_id: userId, total: files.length }).execute();

    // Respond immediately
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
