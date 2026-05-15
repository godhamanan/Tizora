import express, { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { auth } from '@trigger.dev/sdk/v3';
import { batchScanTask } from '../trigger/batchScan.js';

const router = express.Router();
const MAX_BATCH = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: MAX_BATCH },
});

// POST /scan/batch — store files, trigger async task, return runId + publicToken
router.post('/', upload.array('images', MAX_BATCH), async (req: Request, res: Response) => {
  try {
    const files  = req.files as Express.Multer.File[];
    const userId = (req as any).userId as string;

    if (!files?.length)          return res.status(400).json({ error: 'No image files provided' });
    if (files.length > MAX_BATCH) return res.status(400).json({ error: `You can upload up to ${MAX_BATCH} photos at a time.` });

    const jobId = randomUUID();

    // Persist files + job row so the task can read them
    await db.insertInto('scan_jobs').values({
      id: jobId, user_id: userId, total: files.length,
    }).execute();

    await db.insertInto('scan_job_files')
      .values(files.map(f => ({
        job_id:   jobId,
        filename: f.originalname,
        mime:     f.mimetype,
        data:     f.buffer.toString('base64'),
      })))
      .execute();

    // Hand off to Trigger.dev — returns immediately
    const handle = await batchScanTask.trigger({ jobId, userId });

    // Scoped public token so the frontend can subscribe to THIS run only
    const publicToken = await auth.createPublicToken({
      scopes:         { read: { runs: [handle.id] } },
      expirationTime: '4h',
    });

    res.json({ jobId, runId: handle.id, publicToken, total: files.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Batch scan error:', msg);
    res.status(500).json({ error: 'Failed to start batch scan', detail: msg });
  }
});

// GET /scan/batch/:jobId — poll current results from DB (frontend calls on each Trigger signal)
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

// DELETE /scan/batch/:jobId — cleanup after user reviews
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
