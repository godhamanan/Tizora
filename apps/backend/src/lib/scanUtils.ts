import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL, CLASSIFY_PROMPT, buildBatchPrompt } from '../constants/constants.js';
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

// Send all images in a single Gemini call — 1 round-trip for up to 5 images.
export async function classifyBatch(
  files: Array<{ data: string; mime: string }>
): Promise<ItemClassification[]> {
  const parts = [
    ...files.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } })),
    { text: buildBatchPrompt(files.length) },
  ];
  const response = await withRetry(() => {
    const call = ai.models.generateContent({
      model:    GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
    });
    // Longer timeout for batch — more images = more tokens to generate
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 90_000)
    );
    return Promise.race([call, timeout]);
  });
  const results = parseJSON<ItemClassification[]>(response.text ?? '');
  if (!Array.isArray(results)) throw new Error('Expected JSON array from batch classify');
  if (results.length !== files.length) throw new Error(`Expected ${files.length} results, got ${results.length}`);
  return results;
}
