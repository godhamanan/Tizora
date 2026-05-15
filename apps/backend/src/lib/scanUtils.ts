import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL, CLASSIFY_PROMPT } from '../constants/constants.js';
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
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON found in response`);
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
    // Hard cap per attempt — prevents Gemini connection hangs from blocking forever
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 40_000)
    );
    return Promise.race([call, timeout]);
  });
  return parseJSON<ItemClassification>(response.text ?? '');
}
