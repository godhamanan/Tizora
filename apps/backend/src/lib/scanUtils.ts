import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL, CLASSIFY_PROMPT, BATCH_CLASSIFY_PROMPT } from '../constants/constants.js';
import dotenv from 'dotenv';
dotenv.config();

export const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

export interface ItemClassification {
  isClothing: boolean;
  label: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  pattern: string;
  fabric: string | null;
  fit: string | null;
  style: string;
  formality: string;
  season: string[];
  genderStyle: string;
  layersWith: string[];
  pairsWellWith: string[];
  styleNotes: string | null;
  // Rich metadata for multi-occasion matching ─────────────────────────────
  styleVibes: string[];     // minimal, clean, relaxed, modern, romantic, edgy
  occasionTags: string[];   // weekend, travel, college, coffee-run, airport, brunch
  energy: string[];         // effortless, comfortable, laid-back, polished, confident
  worksBestFor: string[];   // "daytime casual looks", "airport layering", "smart-casual dinners"
}

function parseJSON<T>(raw: string): T {
  const cleaned  = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  const start    = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  if (start === -1) throw new Error('No JSON found in response');
  const end = cleaned[start] === '[' ? cleaned.lastIndexOf(']') : cleaned.lastIndexOf('}');
  if (end === -1) throw new Error('No JSON found in response');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        /503|500|UNAVAILABLE|INTERNAL|high demand|429|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|No JSON found/i.test(msg);
      if (retryable && i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));  // 1s, 2s, 4s, 8s, 16s
        continue;
      }
      console.error(`classifyItem final failure after ${i + 1} attempts:`, msg);
      throw err;
    }
  }
  throw new Error('unreachable');
}

export async function classifyItem(imageBuffer: Buffer, mimeType: string): Promise<ItemClassification> {
  const base64   = imageBuffer.toString('base64');
  const response = await withRetry(() => {
    const call = ai.models.generateContent({
      model:    GEMINI_MODEL,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: CLASSIFY_PROMPT },
      ]}],
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 40_000)
    );
    return Promise.race([call, timeout]);
  });
  return parseJSON<ItemClassification>(response.text ?? '');
}

// Raw shape Gemini returns for batch — includes imageIndex we strip before returning
type BatchRaw = ItemClassification & { imageIndex?: number };

// Single Gemini call for all images. Uses BATCH_CLASSIFY_PROMPT which:
//  • has explicit independence rules (no cross-image contamination)
//  • requires imageIndex in every result so we can re-order safely
//  • embeds full CLASSIFY_PROMPT vocabulary for classification quality
export async function classifyBatch(
  files: Array<{ data: string; mime: string }>
): Promise<ItemClassification[]> {
  const parts = [
    ...files.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } })),
    { text: BATCH_CLASSIFY_PROMPT },
  ];
  const response = await withRetry(() => {
    const call = ai.models.generateContent({
      model:    GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 120_000)
    );
    return Promise.race([call, timeout]);
  });

  const raw = parseJSON<BatchRaw[]>(response.text ?? '');
  if (!Array.isArray(raw)) throw new Error('Expected JSON array from batch classify');

  if (raw.length !== files.length) {
    console.warn(`Gemini returned ${raw.length} results for ${files.length} images — mapping by imageIndex`);
  }

  // Map results back to file positions using imageIndex.
  // Falls back to array position if imageIndex is missing.
  // Slots with no matching result stay undefined → caller treats as failed (?.isClothing).
  const mapped = new Array<ItemClassification | undefined>(files.length);
  for (const item of raw) {
    const idx = typeof item.imageIndex === 'number' ? item.imageIndex : raw.indexOf(item);
    if (idx >= 0 && idx < files.length) {
      const { imageIndex: _i, ...rest } = item;
      mapped[idx] = rest;
    }
  }

  return mapped as ItemClassification[];
}
