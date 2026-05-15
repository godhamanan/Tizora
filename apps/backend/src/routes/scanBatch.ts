import express, { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { db } from '../db.js';
import { classifyItem } from '../lib/scanUtils.js';

const router = express.Router();
const MAX_BATCH = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: MAX_BATCH },
});

type ScanFile = { filename: string; mime: string; data: string };

// ── Process each image individually in parallel.
//    As each one finishes, append result atomically to scan_jobs.results
//    so the frontend's polling sees images appear one by one. ─────────────
async function processJobAsync(jobId: string, files: ScanFile[]) {
  try {
    if (!files.length) {
      await db.updateTable('scan_jobs').set({ status: 'complete' }).where('id', '=', jobId).execute();
      return;
    }

    await Promise.allSettled(
      files.map(async (file, idx) => {
        // Stagger starts by 250ms each — avoids hitting Gemini in lockstep
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 250));

        try {
          const buffer         = Buffer.from(file.data, 'base64');
          const classification = await classifyItem(buffer, file.mime);

          if (!classification?.isClothing) throw new Error('Not clothing');

          const scannedItem = {
            ...classification,
            image: `data:${file.mime};base64,${file.data}`,
          };

          // Atomic append using Postgres jsonb concatenation — no race conditions
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
      })
    );

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
