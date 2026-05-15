import { task, metadata } from '@trigger.dev/sdk/v3';
import { db } from '../db.js';
import { ai } from '../lib/scanUtils.js';
import type { ItemClassification } from '../lib/scanUtils.js';
import { GEMINI_MODEL, buildBatchPrompt } from '../constants/constants.js';
import dotenv from 'dotenv';
dotenv.config();

// ── How many images to send in one Gemini request ─────────────────────────
// 5 is optimal: reliable parsing, halves API calls for a 10-image batch.
const GEMINI_BATCH_SIZE = 5;

type ScanFile = { id: number; job_id: string; filename: string; mime: string; data: string };

export const batchScanTask = task({
  id: 'batch-scan',
  maxDuration: 300, // 5 min max
  run: async (payload: { jobId: string; userId: string }) => {
    const { jobId } = payload;

    const files = await db
      .selectFrom('scan_job_files')
      .selectAll()
      .where('job_id', '=', jobId)
      .where('processed', '=', false)
      .execute();

    const total = files.length;
    metadata.set('total',     total);
    metadata.set('processed', 0);
    metadata.set('failed',    0);

    let processed = 0;
    let failed    = 0;

    // ── Process in GEMINI_BATCH_SIZE groups ──────────────────────────────
    for (let i = 0; i < files.length; i += GEMINI_BATCH_SIZE) {
      const batch = files.slice(i, i + GEMINI_BATCH_SIZE);

      let classifications: (ItemClassification | null)[] = new Array(batch.length).fill(null);
      try {
        classifications = await classifyBatch(batch);
      } catch (batchErr) {
        console.warn(`Gemini batch ${i}–${i + batch.length} failed:`, batchErr);
      }

      for (let j = 0; j < batch.length; j++) {
        const file           = batch[j];
        const classification = classifications[j];

        try {
          if (!classification?.isClothing) throw new Error('Not clothing');

          // R2 upload happens at save time (POST /clothes), not here.
          const scannedItem = {
            ...classification,
            image: `data:${file.mime};base64,${file.data}`,
          };

          // Append result to scan_jobs row so GET /scan/batch/:jobId returns it
          const row = await db.selectFrom('scan_jobs')
            .select(['results', 'processed'])
            .where('id', '=', jobId)
            .executeTakeFirst();

          const results = JSON.parse(row?.results ?? '[]');
          results.push(scannedItem);

          processed++;
          await db.updateTable('scan_jobs').set({
            results:   JSON.stringify(results),
            processed: (row?.processed ?? 0) + 1,
          }).where('id', '=', jobId).execute();

          // Signal frontend — processed count bumped, frontend fetches new item from DB
          metadata.set('processed', processed);
          metadata.set('total',     total);

          console.log(`   ✅ [${processed}/${total}] ${classification.label}`);
        } catch {
          failed++;
          processed++;
          const row = await db.selectFrom('scan_jobs')
            .select(['processed', 'failed'])
            .where('id', '=', jobId)
            .executeTakeFirst();
          await db.updateTable('scan_jobs').set({
            processed: (row?.processed ?? 0) + 1,
            failed:    (row?.failed    ?? 0) + 1,
          }).where('id', '=', jobId).execute();
          metadata.set('processed', processed);
          metadata.set('failed',    failed);
          console.warn(`   ⚠️  ${file.filename} skipped`);
        }

        await db.updateTable('scan_job_files')
          .set({ processed: true })
          .where('id', '=', file.id)
          .execute();
      }
    }

    await db.updateTable('scan_jobs')
      .set({ status: 'complete' })
      .where('id', '=', jobId)
      .execute();

    await db.deleteFrom('scan_job_files').where('job_id', '=', jobId).execute();

    console.log(`✅ Batch job ${jobId} complete — ${processed} processed, ${failed} failed`);
    return { processed, failed, total };
  },
});

// ── Send N images in one Gemini request ──────────────────────────────────

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
  // Ensure length matches — pad with nulls if model returned fewer
  while (arr.length < n) arr.push(null);
  return arr.slice(0, n);
}
