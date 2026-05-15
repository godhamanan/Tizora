import express, { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { ai } from '../lib/scanUtils.js';
import type { ItemClassification } from '../lib/scanUtils.js';
import { GEMINI_MODEL, buildBatchPrompt } from '../constants/constants.js';

const router = express.Router();
const MAX_BATCH = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: MAX_BATCH },
});

type ScanFile = { filename: string; mime: string; data: string };

async function classifyBatch(files: ScanFile[]): Promise<(ItemClassification | null)[]> {
  const n     = files.length;
  const parts = [
    ...files.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } })),
    { text: buildBatchPrompt(n) },
  ];
  const response = await ai.models.generateContent({
    model:    GEMINI_MODEL,
    contents: [{ role: 'user', parts }],
  });
  const raw     = response.text ?? '';
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const start   = cleaned.indexOf('[');
  const end     = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array in Gemini response');
  const arr: (ItemClassification | null)[] = JSON.parse(cleaned.slice(start, end + 1));
  while (arr.length < n) arr.push(null);
  return arr.slice(0, n);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
      if (retryable && i < attempts - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

async function processJobAsync(jobId: string, files: ScanFile[]) {
  try {
    if (!files.length) {
      await db.updateTable('scan_jobs').set({ status: 'complete' }).where('id', '=', jobId).execute();
      return;
    }

    // Split into batches, run in parallel
    const BATCH_SIZE = 5;
    const batches: ScanFile[][] = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) batches.push(files.slice(i, i + BATCH_SIZE));

    const batchResults = await Promise.all(
      batches.map(async (batch, idx) => {
        // Stagger starts slightly to avoid hitting Gemini simultaneously
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 500));
        let classifications: (ItemClassification | null)[] = new Array(batch.length).fill(null);
        try {
          classifications = await withRetry(() => classifyBatch(batch));
        } catch (err) {
          console.warn(`Gemini batch ${idx} failed after retries:`, err);
        }
        return { batch, classifications };
      })
    );

    const scannedItems: object[] = [];
    let processed = 0;
    let failed    = 0;

    for (const { batch, classifications } of batchResults) {
      for (let j = 0; j < batch.length; j++) {
        const file           = batch[j];
        const classification = classifications[j];
        if (classification?.isClothing) {
          scannedItems.push({ ...classification, image: `data:${file.mime};base64,${file.data}` });
          processed++;
          console.log(`   ✅ ${classification.label}`);
        } else {
          failed++;
          processed++;
          console.warn(`   ⚠️  ${file.filename} skipped`);
        }
      }
    }

    // Single write for all results
    await db.updateTable('scan_jobs').set({
      results:   JSON.stringify(scannedItems),
      processed,
      failed,
      status:    'complete',
    }).where('id', '=', jobId).execute();

    console.log(`✅ Job ${jobId}: ${processed} processed, ${failed} failed`);
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

    const jobId   = randomUUID();
    const memFiles: ScanFile[] = files.map(f => ({
      filename: f.originalname,
      mime:     f.mimetype,
      data:     f.buffer.toString('base64'),
    }));

    await db.insertInto('scan_jobs').values({ id: jobId, user_id: userId, total: files.length }).execute();

    // Respond immediately — files stay in memory, no DB round-trip needed
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
