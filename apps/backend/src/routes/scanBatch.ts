import express, { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import sharp from 'sharp';
import { db } from '../db.js';
import { classifyBatch } from '../lib/scanUtils.js';

const router = express.Router();
const MAX_BATCH = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: MAX_BATCH },
});

type ScanFile = { filename: string; mime: string; data: string };

// ── Single Gemini call for all images using BATCH_CLASSIFY_PROMPT.
//    Resize all images first (CPU, parallel), then one API call returns
//    all classifications. imageIndex in each result ensures correct mapping
//    even if Gemini returns results out of order. ─────────────────────────
async function processJobAsync(jobId: string, files: ScanFile[]) {
  try {
    if (!files.length) {
      await db.updateTable('scan_jobs').set({ status: 'complete' }).where('id', '=', jobId).execute();
      return;
    }

    // Resize all images in parallel (CPU-bound, no API calls)
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

    // Single Gemini call for all images
    const classifications = await classifyBatch(resized);

    // Build results array and counts in memory — single DB write at the end
    const successItems: object[] = [];
    let failed = 0;

    for (let i = 0; i < resized.length; i++) {
      const classification = classifications[i];
      if (!classification?.isClothing) {
        failed++;
        console.warn(`   ⚠️  [${resized[i].filename}] skipped — not clothing`);
        continue;
      }
      successItems.push({ ...classification, image: `data:image/jpeg;base64,${resized[i].data}` });
      console.log(`   ✅ [${resized[i].filename}] ${classification.label}`);
    }

    // 1 write: all results + final counts + status
    await sql`
      UPDATE scan_jobs
      SET results   = ${JSON.stringify(successItems)}::text,
          processed = ${resized.length},
          failed    = ${failed},
          status    = 'complete'
      WHERE id = ${jobId}
    `.execute(db);
    console.log(`✅ Job ${jobId} complete — ${successItems.length} classified, ${failed} skipped`);
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
