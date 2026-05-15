import { task, metadata } from '@trigger.dev/sdk/v3';
import { db } from '../db.js';
import { ai } from '../lib/scanUtils.js';
import type { ItemClassification } from '../lib/scanUtils.js';
import { GEMINI_MODEL, buildBatchPrompt } from '../constants/constants.js';
import dotenv from 'dotenv';
dotenv.config();

// 5 images per Gemini call — reliable JSON parsing at this size.
// Batches run in parallel so total time = one batch, not N batches.
const GEMINI_BATCH_SIZE = 5;

type ScanFile = { id: number; job_id: string; filename: string; mime: string; data: string };

export const batchScanTask = task({
  id: 'batch-scan',
  maxDuration: 300,
  run: async (payload: { jobId: string; userId: string }) => {
    const { jobId } = payload;

    const files = await db
      .selectFrom('scan_job_files').selectAll()
      .where('job_id', '=', jobId).where('processed', '=', false)
      .execute();

    const total = files.length;
    metadata.set('total',     total);
    metadata.set('processed', 0);
    metadata.set('failed',    0);

    // ── Slice into batches ─────────────────────────────────────────────────
    const batches: ScanFile[][] = [];
    for (let i = 0; i < files.length; i += GEMINI_BATCH_SIZE) {
      batches.push(files.slice(i, i + GEMINI_BATCH_SIZE));
    }

    // ── Run ALL batches in parallel ────────────────────────────────────────
    const batchResults = await Promise.all(
      batches.map(async (batch) => {
        let classifications: (ItemClassification | null)[] = new Array(batch.length).fill(null);
        try {
          classifications = await classifyBatch(batch);
        } catch (err) {
          console.warn(`Gemini batch failed:`, err);
        }
        return { batch, classifications };
      })
    );

    // ── Collect all results, then write to DB in two queries ───────────────
    let processed = 0;
    let failed    = 0;
    const scannedItems: object[] = [];
    const processedFileIds: number[] = [];

    for (const { batch, classifications } of batchResults) {
      for (let j = 0; j < batch.length; j++) {
        const file           = batch[j];
        const classification = classifications[j];

        if (classification?.isClothing) {
          scannedItems.push({
            ...classification,
            image: `data:${file.mime};base64,${file.data}`,
          });
          processed++;
        } else {
          failed++;
          processed++;
          console.warn(`   ⚠️  ${file.filename} skipped — not clothing`);
        }
        processedFileIds.push(file.id);
      }
    }

    // Single UPDATE for all results
    await db.updateTable('scan_jobs').set({
      results:   JSON.stringify(scannedItems),
      processed,
      failed,
      status:    'complete',
    }).where('id', '=', jobId).execute();

    // Single DELETE for all processed files
    await db.deleteFrom('scan_job_files').where('job_id', '=', jobId).execute();

    // Signal frontend with final counts
    metadata.set('processed', processed);
    metadata.set('total',     total);
    metadata.set('failed',    failed);

    console.log(`✅ Batch job ${jobId} complete — ${processed} processed, ${failed} failed`);
    return { processed, failed, total };
  },
});

// ── Send N images in one Gemini request ───────────────────────────────────

async function classifyBatch(files: ScanFile[]): Promise<(ItemClassification | null)[]> {
  const n = files.length;
  const parts: any[] = [
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
  if (start === -1 || end === -1) throw new Error('No JSON array in Gemini batch response');

  const arr: (ItemClassification | null)[] = JSON.parse(cleaned.slice(start, end + 1));
  while (arr.length < n) arr.push(null);
  return arr.slice(0, n);
}
