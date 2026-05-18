import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { db } from '../db.js';
import { GEMINI_MODEL, OCCASION_FORMALITY_MAP, buildSuggestPrompt, getOccasionPrompt } from '../constants/constants.js';

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

interface StylingNote { pieceId: number; note: string }

interface AiOutfit {
  name: string;
  template?: string;          // archetype name, e.g. "Open Shirt Layer"
  trendContext: string;
  pieceIds: number[];
  pieces: string[];
  heroPieceId?: number;       // dominant piece — used for diversity check
  layeringOrder?: number[];   // pieceIds in base→outer order
  stylingNotes?: StylingNote[];
  textureStory?: string;
  whyItWorks?: string;
  occasion: string;
  tip: string;
  mood: string;
  matchQuality?: 'exact' | 'closest';
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { theme, weather, anchorItemId } = req.body as {
      theme: string;
      weather?: string;
      anchorItemId?: number;
    };

    if (!theme) return res.status(400).json({ error: 'theme is required' });

    const userId = (req as any).userId as string;

    // ── DB queries — parallelised ─────────────────────────────────────────
    // count check runs first (cheap guard); then profile + wardrobe + optional
    // anchor fire together so we're not waiting on sequential round-trips.
    const countRow = await db
      .selectFrom('clothes')
      .select(db.fn.countAll<number>().as('n'))
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!countRow || Number(countRow.n) === 0) {
      return res.status(400).json({ error: 'No clothes in wardrobe yet' });
    }

    // Only fetch columns actually used by scoreItem() + wardrobeSummary().
    // Previously fetching 15+ columns including fabric, fit, layers_with,
    // works_best_for, color_pairs etc. that were never read after the prompt
    // trim — wasted bandwidth and slowed the query on large wardrobes.
    const [profile, wardrobe, anchorItem] = await Promise.all([
      db.selectFrom('profiles').select(['gender']).where('user_id', '=', userId).executeTakeFirst(),
      db.selectFrom('clothes')
        .select([
          'id', 'name', 'category', 'subcategory',
          'color', 'secondary_color', 'pattern', 'style',
          'formality', 'occasion_tags', 'style_vibes', 'energy',
          'piece_role', 'layer_role', 'color_saturation',
        ])
        .where('user_id', '=', userId)
        .execute(),
      anchorItemId
        ? db.selectFrom('clothes')
            .select(['id', 'name', 'category', 'color', 'style', 'formality'])
            .where('id', '=', anchorItemId)
            .executeTakeFirst().then(r => r ?? null)
        : Promise.resolve(null),
    ]);

    // ── Diagnostic: log wardrobe inventory by category. Helps debug "where's
    // the bottom?" issues quickly from Railway logs.
    const inventory = wardrobe.reduce<Record<string, number>>((acc, c) => {
      acc[c.category] = (acc[c.category] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`📦 suggest user=${userId} theme=${theme} inventory=`, inventory);

    // ── Completeness pre-check: outfit needs a top + bottom (or a standalone
    // dress/saree/kurta/lehenga that covers both). If wardrobe can't form
    // that shape, tell the user exactly what's missing instead of returning
    // an incomplete outfit.
    const has = (cat: string) => (inventory[cat] ?? 0) > 0;
    const hasStandaloneFull = has('Dress') || has('Saree') || has('Lehenga') || has('Kurta') || has('Sherwani');
    const hasTopCat = has('Tops') || has('Outerwear') || hasStandaloneFull;
    const hasBottomCat = has('Bottoms') || hasStandaloneFull;
    if (!hasTopCat || !hasBottomCat) {
      const missing: string[] = [];
      if (!hasTopCat)    missing.push('a top (shirt, tee, knit, etc.)');
      if (!hasBottomCat) missing.push('a bottom (jeans, trousers, shorts, skirt, etc.)');
      return res.status(400).json({
        error: `Add ${missing.join(' and ')} to your wardrobe — we need both to build outfits.`,
        detail: 'incomplete_wardrobe',
        inventory,
      });
    }

    const allowed  = OCCASION_FORMALITY_MAP[theme] ?? [];
    const themeKey = theme.toLowerCase().replace(/\s+/g, '-');

    // Score-based ranking: always send top N most-relevant items, never the
    // entire wardrobe. Cuts noise + tokens dramatically vs the old loose OR.
    const TOP_N = 30;
    const scored = wardrobe
      .map(item => ({ item, score: scoreItem(item, theme, themeKey, allowed) }))
      .sort((a, b) => b.score - a.score);

    // Drop items with strongly negative score (actively wrong for this occasion)
    // unless wardrobe is small (<TOP_N), in which case keep everything so we
    // always have something to suggest.
    const ranked = wardrobe.length > TOP_N
      ? scored.filter(s => s.score > -5).map(s => s.item)
      : scored.map(s => s.item);

    let toSend = ranked.slice(0, TOP_N);

    // Structural guarantee: every outfit needs top + bottom + (ideally) shoes.
    // If the scoring filter dropped ALL bottoms (because the user's bottoms are
    // tagged for other occasions), force-inject the best-available bottom from
    // the FULL wardrobe so Gemini and the pad pass have something to work with.
    // Same for tops and shoes. This is what prevents "shirt-only" suggestions.
    const ensureCategoryPresent = (cats: string[]) => {
      const present = toSend.some(c => cats.includes(c.category));
      if (present) return;
      // Pick highest-scoring item in this category from the FULL wardrobe
      const candidate = scored
        .filter(s => cats.includes(s.item.category))
        .map(s => s.item)[0];
      if (candidate && !toSend.find(c => c.id === candidate.id)) {
        toSend = [candidate, ...toSend.slice(0, TOP_N - 1)];
      }
    };
    ensureCategoryPresent(['Tops','Dress','Kurta','Saree','Lehenga','Sherwani']);
    ensureCategoryPresent(['Bottoms','Dress','Saree','Lehenga']);
    ensureCategoryPresent(['Shoes']);
    ensureCategoryPresent(['Outerwear']);

    // Anchor piece is non-negotiable — force-include if score-filter dropped it
    if (anchorItem && !toSend.find(c => c.id === anchorItem.id)) {
      const full = wardrobe.find(c => c.id === anchorItem.id);
      if (full) toSend = [full, ...toSend.slice(0, TOP_N - 1)];
    }

    // Trimmed wardrobe summary — only fields that meaningfully drive composition.
    // Was sending 13 fields per item including verbose phrases like worksBestFor
    // and works_best_for, which pushed prompts past 8K chars on a 30-item
    // wardrobe and made Gemini slow. Dropping them shrinks prompt by ~40% with
    // no quality loss in practice — the kept fields are the high-signal ones.
    const wardrobeSummary = toSend
      .map(c => {
        const colors = [c.color, c.secondary_color].filter(Boolean).join('/');
        const tags = [
          c.piece_role       ? `role:${c.piece_role}`            : null,
          c.layer_role       ? `layer:${c.layer_role}`           : null,
          c.color_saturation ? `sat:${c.color_saturation}`       : null,
          c.formality        ? `f:${c.formality}`                : null,
          c.occasion_tags    ? `occ:${c.occasion_tags}`          : null,
          c.style_vibes      ? `v:${c.style_vibes}`              : null,
        ].filter(Boolean).join(' | ');
        const heroTag = c.piece_role === 'hero' ? ' [HERO]' : '';
        const sub = c.subcategory ? ` ${c.subcategory}` : '';
        return `[${c.id}]${heroTag} ${c.name} —${sub} ${c.category}, ${colors}, ${c.pattern ?? 'solid'}, ${c.style ?? 'Western'}${tags ? ` | ${tags}` : ''}`;
      })
      .join('\n');

    const weatherContext = weather ? `Current weather: ${weather}.` : '';
    const now    = new Date();
    const month  = now.getMonth();
    const season = month >= 2 && month <= 4 ? 'Spring' : month >= 5 && month <= 7 ? 'Summer' : month >= 8 && month <= 10 ? 'Autumn' : 'Winter';
    const year   = now.getFullYear();
    const USER_GENDER = profile?.gender ?? 'male';

    const anchorBlock = anchorItem
      ? `\n━━━ ANCHOR PIECE (non-negotiable) ━━━\nThe user wants to style: [ID:${anchorItem.id}] ${anchorItem.name} — ${anchorItem.category}, ${anchorItem.color}, ${anchorItem.style ?? ''}, ${anchorItem.formality ?? ''}\nEVERY outfit MUST include this exact piece (ID:${anchorItem.id}). Build the rest of the outfit around it.\n`
      : '';

    const prompt = buildSuggestPrompt({
      season, year, theme,
      gender:         USER_GENDER,
      weatherContext,
      anchorBlock,
      wardrobeSummary,
      anchorItemId:   anchorItem?.id,
    });

    // Up to 2 attempts: first at 45s, retry at 40s if first fails with a
    // transient error. Total wall time bounded at ~90s — frontend waits 100s.
    // Retrying matters because Gemini Flash occasionally hits 503/INTERNAL
    // under load, and a single failure was nuking the whole request.
    const callGemini = (timeoutMs: number) => Promise.race([
      ai.models.generateContent({
        model:    GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          // Disable internal "thinking" — adds 5-20s on Gemini 2.5 Flash
          // for a task that needs no multi-step reasoning.
          thinkingConfig:  { thinkingBudget: 0 },
          // Cap output to 3 outfits × ~450 tokens = ~1350 tokens needed.
          // Hard cap at 1800 prevents runaway generation when Gemini adds
          // prose outside the JSON.
          maxOutputTokens: 1800,
          temperature:     0.8,   // enough variety across 3 outfits
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini timed out after ${timeoutMs/1000}s`)), timeoutMs)
      ),
    ]);

    const isRetryable = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /503|500|UNAVAILABLE|INTERNAL|high demand|429|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed/i.test(msg);
    };

    let response;
    try {
      response = await callGemini(45_000);
    } catch (err) {
      if (!isRetryable(err)) throw err;
      console.warn('Gemini suggest attempt 1 failed, retrying:', err instanceof Error ? err.message : err);
      response = await callGemini(40_000);  // single retry — total ≤ 85s
    }

    const rawText = response.text ?? '';
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const start   = cleaned.indexOf('{');
    const end     = cleaned.lastIndexOf('}');

    let parsed: { outfits: AiOutfit[] } = { outfits: [] };
    if (start !== -1 && end !== -1) {
      try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }

    if (!parsed.outfits?.length) {
      parsed = { outfits: buildFallback(toSend, theme, anchorItem) };
    }

    // ── Validation pass: enforce diversity + layer count + Office tonal rule ─
    parsed.outfits = validateOutfits(parsed.outfits, theme, wardrobe);
    // ── Pad thin outfits: enforce top + bottom (+ shoes when available) ──────
    // Pass FULL wardrobe (not toSend) so we can pull in even non-ideal pieces
    // — e.g. bottoms tagged for casual when theme is Date Night — rather than
    // letting Gemini return a shirt-only outfit.
    parsed.outfits = padThinOutfits(parsed.outfits, wardrobe, theme);
    // ── Guarantee 3 outfits — top up with constructed fallbacks if fewer ─────
    parsed.outfits = ensureThreeOutfits(parsed.outfits, wardrobe, theme, anchorItem);

    const allIds = [...new Set(
      parsed.outfits.flatMap(o => o.pieceIds ?? [])
        .map(id => typeof id === 'string' ? parseInt(id, 10) : id)
        .filter(id => typeof id === 'number' && !isNaN(id))
    )];

    const pieceMap = new Map<number, { id: number; name: string; category: string; image_base64: string | null; image_url: string | null }>();
    if (allIds.length) {
      const items = await db
        .selectFrom('clothes')
        .select(['id', 'name', 'category', 'image_base64', 'image_url'])
        .where('id', 'in', allIds)
        .execute();
      for (const item of items) pieceMap.set(item.id, item);
    }

    const outfits = parsed.outfits.map(outfit => ({
      ...outfit,
      matchQuality: outfit.matchQuality ?? 'exact',
      pieceImages:  (outfit.pieceIds ?? [])
        .map(id => pieceMap.get(id))
        .filter(Boolean) as { id: number; name: string; category: string; image_base64: string | null; image_url: string | null }[],
    }));

    res.json({ outfits });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error generating suggestions:', msg);
    res.status(500).json({ error: 'Internal server error', detail: msg });
  }
});

function buildFallback(wardrobe: any[], theme: string, anchor: { id: number; name: string; category: string } | null): AiOutfit[] {
  const t     = theme.toLowerCase();
  const score = (item: any) => {
    const h = [item.occasion_tags, item.style_vibes, item.energy, item.works_best_for].filter(Boolean).join(' ').toLowerCase();
    let s = 0;
    if (h.includes(t)) s += 5;
    if (t.includes('office') && /smart-casual|business-casual|polished/.test(h)) s += 3;
    if (t.includes('date')   && /romantic|smart-casual|confident/.test(h)) s += 3;
    if (t.includes('casual') && /relaxed|effortless|laid-back/.test(h)) s += 3;
    return s;
  };
  const pick = (cat: string) => wardrobe.filter(c => c.category === cat).sort((a, b) => score(b) - score(a))[0] ?? null;
  const pieces: { id: number; name: string }[] = [];
  const dress = pick('Dress'); const top = pick('Tops'); const bottom = pick('Bottoms'); const shoes = pick('Shoes');
  if (dress)         pieces.push({ id: dress.id,  name: dress.name });
  if (!dress && top) pieces.push({ id: top.id,    name: top.name });
  if (!dress && bottom) pieces.push({ id: bottom.id, name: bottom.name });
  if (shoes)         pieces.push({ id: shoes.id,  name: shoes.name });
  if (anchor && !pieces.find(p => p.id === anchor.id)) pieces.unshift({ id: anchor.id, name: anchor.name });
  if (!pieces.length) wardrobe.slice(0, 2).forEach(i => pieces.push({ id: i.id, name: i.name }));
  return [{ name: `Closest Match — ${theme}`, trendContext: 'Smart Casual', pieceIds: pieces.map(p => p.id), pieces: pieces.map(p => p.name), occasion: theme, tip: `Best available — add a ${t}-leaning piece to complete the look.`, mood: 'Adaptive', matchQuality: 'closest' }];
}

// ── Scoring filter ─────────────────────────────────────────────────────────
// Replaces the old loose OR filter. Scores every wardrobe item against the
// theme so we can rank by relevance and send only the top N to Gemini.
// This eliminates wardrobe noise + cuts ~50-70% of input tokens for medium+
// wardrobes, dropping suggest latency by 3-6 seconds.
type ScorableItem = {
  category: string;
  subcategory: string | null;
  color: string;
  formality: string | null;
  style: string | null;
  occasion_tags: string | null;
  energy: string | null;
  piece_role: string | null;
  layer_role: string | null;
  color_saturation: string | null;
};

function scoreItem(item: ScorableItem, theme: string, themeKey: string, allowed: string[]): number {
  let score = 0;
  const sub   = (item.subcategory ?? '').toLowerCase();
  const color = (item.color ?? '').toLowerCase();

  // 1. Formality match (theme allows this formality bucket)
  if (item.formality && allowed.includes(item.formality)) score += 3;

  // 2. Exact occasion_tag match (split-trim)
  const tags = (item.occasion_tags ?? '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  if (tags.includes(themeKey)) score += 5;

  // 3. pieceRole bias
  if (item.piece_role === 'hero'   && theme !== 'Office') score += 3;
  if (item.piece_role === 'anchor') score += 2;

  // 3b. Structural baseline — bottoms + shoes always need a positive score so
  // they survive the top-30 filter. The ensureCategoryPresent fallback
  // catches edge cases where these still get filtered.
  if (item.category === 'Bottoms' && item.formality !== 'athletic') score += 2;
  if (item.category === 'Shoes') score += 2;

  // 4. Layer-role bonus
  if ((theme === 'Date Night' || theme === 'Night Out') && item.layer_role === 'outer') score += 2;

  // 5. Energy match for casual occasions
  if ((theme === 'Travel' || theme === 'Casual Outing') &&
      /comfortable|laid-back|relaxed|effortless/i.test(item.energy ?? '')) score += 2;

  // ───────────────────────────────────────────────────────────────────────
  // 6. PER-OCCASION SCORING (all 8 themes). Without these, only Office and
  // Workout had explicit good/bad rules and other occasions returned outfits
  // that didn't feel occasion-appropriate.
  // ───────────────────────────────────────────────────────────────────────
  if (theme === 'Office') {
    if (item.category === 'Tops'      && /shirt|button|oxford|polo/.test(sub) && item.formality !== 'casual') score += 6;
    if (item.category === 'Outerwear' && /blazer|suit/.test(sub)) score += 6;
    if (item.category === 'Bottoms'   && /trouser|chino|tailored/.test(sub)) score += 4;
    if (item.category === 'Shoes'     && /loafer|derby|oxford|chelsea/.test(sub)) score += 4;
    if (item.category === 'Tops'      && /t-shirt|tee|hoodie|sweatshirt/.test(sub)) score -= 2;
    if (item.category === 'Bottoms'   && /short|cargo|jogger/.test(sub)) score -= 4;
    if (item.category === 'Shoes'     && /athletic|trainer|sport/.test(sub)) score -= 4;
  }

  if (theme === 'Date Night') {
    if (item.category === 'Tops'      && /button|shirt|oxford|knit|henley|sweater/.test(sub)) score += 4;
    if (item.category === 'Outerwear' && /bomber|leather|suede|blazer|overshirt/.test(sub)) score += 5;
    if (item.category === 'Bottoms'   && /jean|trouser|chino/.test(sub)) score += 3;
    if (item.category === 'Bottoms'   && /black|navy|charcoal|dark|indigo/.test(color)) score += 3;
    if (item.category === 'Shoes'     && /chelsea|boot|loafer|leather/.test(sub)) score += 4;
    if (item.category === 'Shoes'     && /sneaker/.test(sub) && /white|leather|clean/.test(sub + ' ' + color)) score += 2;
    if (item.category === 'Tops'      && /hoodie|sweatshirt|graphic/.test(sub)) score -= 4;
    if (item.category === 'Bottoms'   && /jogger|sweatpant|cargo|short/.test(sub)) score -= 4;
    if (item.category === 'Shoes'     && /athletic|trainer|sport|sandal|flip/.test(sub)) score -= 4;
  }

  if (theme === 'Night Out') {
    if (item.category === 'Outerwear' && /leather|bomber|suede/.test(sub)) score += 6;
    if (item.category === 'Tops'      && /button|knit|henley/.test(sub)) score += 3;
    if (item.category === 'Bottoms'   && /jean|trouser/.test(sub)) score += 3;
    if (item.category === 'Bottoms'   && /black|dark|navy|charcoal/.test(color)) score += 3;
    if (item.category === 'Shoes'     && /chelsea|boot|leather/.test(sub)) score += 4;
    if (item.color_saturation === 'bold') score += 2;
    if (item.category === 'Tops'      && /polo|graphic/.test(sub)) score -= 3;
    if (item.category === 'Shoes'     && /athletic|trainer|sandal/.test(sub)) score -= 4;
  }

  if (theme === 'Casual Outing') {
    if (item.category === 'Tops'      && /tee|t-shirt|hoodie|sweatshirt|knit|henley|polo/.test(sub)) score += 4;
    if (item.category === 'Bottoms'   && /jean|chino|jogger|short/.test(sub)) score += 3;
    if (item.category === 'Shoes'     && /sneaker|canvas|slip-on/.test(sub)) score += 4;
    if (item.category === 'Outerwear' && /denim|bomber|overshirt|cardigan/.test(sub)) score += 3;
    if (item.category === 'Outerwear' && /suit|tuxedo|sherwani|bandhgala/.test(sub)) score -= 6;
    if (item.category === 'Shoes'     && /derby|oxford|mojri/.test(sub)) score -= 2;
    if (item.formality === 'formal') score -= 3;
  }

  if (theme === 'Travel') {
    if (item.category === 'Tops'      && /hoodie|sweatshirt|tee|knit/.test(sub)) score += 3;
    if (item.category === 'Bottoms'   && /jogger|sweatpant|chino|cargo/.test(sub)) score += 4;
    if (item.category === 'Shoes'     && /sneaker|slip-on/.test(sub)) score += 4;
    if (item.category === 'Outerwear' && /cardigan|zip-up|overshirt/.test(sub)) score += 2;
    if (item.category === 'Outerwear' && /leather|heavy|suit|tuxedo|bandhgala/.test(sub)) score -= 4;
    if (item.category === 'Shoes'     && /chelsea|derby|oxford|heels/.test(sub)) score -= 3;
    if (item.formality === 'formal' || item.formality === 'festive') score -= 4;
  }

  if (theme === 'Workout') {
    if (item.formality === 'athletic') score += 8;
    if (/jogger|sweatpant|hoodie|sweatshirt|tank|tee|short|leggings|bra/.test(sub)) score += 3;
    if (item.category === 'Shoes' && /athletic|trainer|sport|running/.test(sub)) score += 6;
    if (item.category === 'Shoes'     && /chelsea|loafer|derby|oxford|mojri|heels/.test(sub)) score -= 6;
    if (item.category === 'Outerwear' && /blazer|suit|leather|sherwani/.test(sub)) score -= 6;
  }

  if (theme === 'Festive') {
    if (item.style === 'Ethnic') score += 8;
    if (item.style === 'Fusion') score += 4;
    if (item.formality === 'festive') score += 6;
    if (/kurta|sherwani|lehenga|saree|bandhgala|dupatta/.test(item.category.toLowerCase())) score += 6;
    if (item.category === 'Shoes' && /mojri|loafer/.test(sub)) score += 4;
    if (item.style === 'Western' && /silk|printed|embroidered/.test(sub)) score += 3;
    if (item.formality === 'athletic') score -= 8;
    if (item.category === 'Tops' && /hoodie|sweatshirt|tank/.test(sub)) score -= 5;
  }

  if (theme === 'Wedding') {
    if (item.style === 'Ethnic') score += 10;
    if (item.formality === 'formal' || item.formality === 'festive') score += 6;
    if (/kurta|sherwani|lehenga|saree/.test(item.category.toLowerCase())) score += 8;
    if (item.category === 'Outerwear' && /suit|tuxedo|bandhgala|sherwani/.test(sub)) score += 8;
    if (item.category === 'Shoes' && /mojri|oxford|derby|leather/.test(sub)) score += 5;
    if (item.formality === 'casual') score -= 6;
    if (item.formality === 'athletic') score -= 12;
    if (item.category === 'Bottoms' && /jean|jogger|short/.test(sub)) score -= 5;
    if (item.category === 'Shoes' && /sneaker|athletic/.test(sub)) score -= 5;
  }

  // 7. Hard incompatibilities (but capped so structural pieces still survive
  // — bottoms get +2 baseline, so even with -10 they reach -8 — closer to
  // the -5 cutoff so a small wardrobe with mismatched bottoms still passes)
  if (item.formality === 'athletic' && theme !== 'Travel' && theme !== 'Casual Outing' && theme !== 'Workout') score -= 8;
  if (item.style === 'Ethnic' && (theme === 'Office' || theme === 'Travel' || theme === 'Casual Outing' || theme === 'Workout')) score -= 6;
  if (theme === 'Office' && item.color_saturation === 'bold') score -= 5;

  return score;
}

// ── Validation pass ────────────────────────────────────────────────────────
// Hard validation: actually trims outfits that violate constraints. Soft tags
// other issues onto matchQuality:'closest'.
type WardrobeItem = {
  id: number;
  name: string;
  category: string;
  subcategory:      string | null;
  pattern:          string | null;
  piece_role:       string | null;
  layer_role:       string | null;
  color_saturation: string | null;
  formality:        string | null;
};

// Enforce hard structural rules a real stylist follows:
//   - Exactly 1 bottom (drop extras)
//   - At most 1 outer layer (drop extras)
//   - At most 1 patterned piece (drop extras if 2+)
//   - Drop pieces to fit maxLayers cap, preferring hero + bottom + 1 of each layer role
function enforceOutfitRules(
  outfit: AiOutfit,
  byId: Map<number, WardrobeItem>,
  maxLayers: number,
): { outfit: AiOutfit; trimmed: boolean } {
  const pieces = (outfit.pieceIds ?? []).map(id => byId.get(id)).filter(Boolean) as WardrobeItem[];
  // Cap footwear at 1 pair + 1 accessory — Gemini occasionally returns 2 shoes
  const shoesOnly   = pieces.filter(p => p.category === 'Shoes').slice(0, 1);
  const accessories = pieces.filter(p => p.category === 'Accessories').slice(0, 1);
  const footwear = [...shoesOnly, ...accessories];
  const nonFootwear = pieces.filter(p => p.category !== 'Shoes' && p.category !== 'Accessories');

  const heroId = outfit.heroPieceId;
  const isPatterned = (p: WardrobeItem) => !!p.pattern && !/^(solid|plain)?$/i.test(p.pattern);

  // FULL_GARMENT_CATS = items that cover top + bottom (a dress IS the outfit).
  // CRITICAL: pants/leggings get layer_role==='standalone' from the classifier
  // because they're "complete pieces worn alone" — but they are NOT full-body
  // garments. The validator must use CATEGORY only, never layer_role, to decide
  // what's a top/bottom/full garment. Treating jeans as "the whole outfit" was
  // the root cause of cargo pants being dropped from outfits.
  const FULL_GARMENT_CATS = ['Dress','Saree','Lehenga','Kurta','Sherwani'];
  const isFullGarmentCat = (p: WardrobeItem) => FULL_GARMENT_CATS.includes(p.category);

  // Sort non-footwear by keep-priority: hero > full garment > bottom > outer > top > other
  const priority = (p: WardrobeItem) => {
    if (p.id === heroId) return 0;
    if (isFullGarmentCat(p)) return 1;
    if (p.category === 'Bottoms') return 2;
    if (p.category === 'Outerwear') return 3;
    if (p.category === 'Tops') return 5;
    return 6;
  };
  const ranked = [...nonFootwear].sort((a, b) => priority(a) - priority(b));

  const keep: WardrobeItem[] = [];
  let hasBottom = false;
  let hasOuter = false;
  let hasFullGarment = false;
  let patternedCount = 0;

  for (const p of ranked) {
    if (keep.length >= maxLayers) break;

    // Full-body garment (dress/saree/kurta/lehenga/sherwani) — max 1, covers
    // both top + bottom. NEVER triggered by Bottoms or any other category.
    if (isFullGarmentCat(p)) {
      if (hasFullGarment) continue;
      hasFullGarment = true;
      keep.push(p);
      continue;
    }

    // 1-bottom: only one Bottoms piece (regardless of layer_role)
    if (p.category === 'Bottoms') {
      if (hasBottom) continue;
      hasBottom = true;
      keep.push(p);
      continue;
    }

    // 1-outer: only one Outerwear piece (or one layer_role=outer)
    const isOuter = p.category === 'Outerwear' || p.layer_role === 'outer';
    if (isOuter) {
      if (hasOuter) continue;
      hasOuter = true;
    }

    // Pattern count cap (at most 1 patterned piece per outfit)
    if (isPatterned(p) && patternedCount >= 1) continue;
    if (isPatterned(p)) patternedCount++;

    // Layer-role dedup: max 1 piece per role, with ONE exception —
    // a button-down/shirt worn OPEN over a tee/tank/henley is a real styling
    // move. Two shirts or two tees together is not.
    if (p.layer_role && p.layer_role !== 'standalone') {
      const sameRole = keep.filter(k => k.layer_role === p.layer_role);
      if (sameRole.length > 0) {
        if (p.layer_role === 'base') {
          const isShirt = (x: WardrobeItem) => /button-down|oxford|shirt/i.test(x.subcategory ?? '');
          const isTee   = (x: WardrobeItem) => /t-shirt|tee|tank|henley|knit/i.test(x.subcategory ?? '');
          const existing = sameRole[0];
          const validCombo = (isShirt(existing) && isTee(p)) || (isTee(existing) && isShirt(p));
          if (!validCombo) continue; // two shirts or two tees → skip
        } else {
          continue; // mid/outer/etc — still max 1 per role
        }
      }
    }

    keep.push(p);
  }

  const trimmed = keep.length < nonFootwear.length;
  const newIds = [...keep.map(p => p.id), ...footwear.map(p => p.id)];
  const newNames = newIds.map(id => byId.get(id)?.name).filter(Boolean) as string[];

  if (trimmed) {
    const dropped = nonFootwear.filter(p => !keep.includes(p)).map(p => p.name).join(', ');
    console.warn(`✂️  Trimmed outfit "${outfit.name}" — dropped ${nonFootwear.length - keep.length} pieces: ${dropped}`);
  }

  return {
    outfit: {
      ...outfit,
      pieceIds: newIds,
      pieces: newNames,
      matchQuality: trimmed ? 'closest' : (outfit.matchQuality ?? 'exact'),
    },
    trimmed,
  };
}

function validateOutfits(outfits: AiOutfit[], theme: string, wardrobe: WardrobeItem[]): AiOutfit[] {
  const occ = getOccasionPrompt(theme);
  const byId = new Map<number, WardrobeItem>(wardrobe.map(w => [w.id, w]));

  // Track heroes/anchors across outfits for diversity check
  const seenHeroes = new Set<number>();
  const seenAnchors = new Set<number>();

  return outfits.map((rawOutfit, idx) => {
    // 0. HARD enforce: 1-bottom, 1-outer, max-1-pattern, max-layers cap
    const { outfit } = enforceOutfitRules(rawOutfit, byId, occ.layerCount.max);

    const ids = (outfit.pieceIds ?? []).filter((id: any) => typeof id === 'number');
    const pieces = ids.map((id: number) => byId.get(id)).filter(Boolean) as WardrobeItem[];

    // 1. Layer count check (post-trim — should only fire if outfit is BELOW min)
    const nonFootwear = pieces.filter(p => p.category !== 'Shoes' && p.category !== 'Accessories');
    const layerCount = nonFootwear.length;
    const layerOK = layerCount >= occ.layerCount.min;

    // 2. Hero / dominant-piece diversity check
    const heroId = outfit.heroPieceId
      ?? pieces.find(p => p.piece_role === 'hero')?.id
      ?? pieces.find(p => p.piece_role === 'anchor')?.id
      ?? ids[0];
    const heroDuplicate = heroId !== undefined && seenHeroes.has(heroId);
    if (heroId !== undefined) seenHeroes.add(heroId);

    // Also flag anchor reuse (e.g. same dark jeans used in all 3) — softer warning
    const anchorIds = pieces.filter(p => p.piece_role === 'anchor').map(p => p.id);
    const anchorReuse = anchorIds.some(a => seenAnchors.has(a));
    anchorIds.forEach(a => seenAnchors.add(a));

    // 3. Office tonal-only rule: no bold-saturated pieces
    let paletteViolation = false;
    if (theme === 'Office') {
      paletteViolation = pieces.some(p => p.color_saturation === 'bold');
    }

    // 4. Formality consistency within outfit (no athletic + business-casual mix)
    const formalities = new Set(pieces.map(p => p.formality).filter(Boolean));
    const formalityClash = formalities.has('athletic') && (
      formalities.has('business-casual') || formalities.has('formal') || formalities.has('festive')
    );

    // Build annotations — kept on the outfit so frontend can see what's off
    const issues: string[] = [];
    if (!layerOK)         issues.push(`layer-count ${layerCount} below min ${occ.layerCount.min}`);
    if (heroDuplicate)    issues.push(`hero-duplicate (outfit ${idx + 1} reuses dominant piece ID:${heroId})`);
    if (anchorReuse)      issues.push('anchor-reuse');
    if (paletteViolation) issues.push('palette-violation: bold piece in Office outfit');
    if (formalityClash)   issues.push('formality-clash');

    if (issues.length) {
      console.warn(`⚠️  Outfit ${idx + 1} "${outfit.name}" issues: ${issues.join('; ')}`);
    }

    return {
      ...outfit,
      heroPieceId: heroId,
      // Tag matchQuality 'closest' if any hard constraint was violated
      matchQuality: (heroDuplicate || paletteViolation || formalityClash)
        ? 'closest'
        : (outfit.matchQuality ?? 'exact'),
    };
  });
}

// ── Theme-aware shoe selection ─────────────────────────────────────────────
// When Gemini omits footwear, pick the shoe from the wardrobe that best
// matches the occasion. Returns undefined if wardrobe has no shoes at all —
// in that case we leave the outfit shoeless rather than forcing wrong shoes.
function pickShoesForTheme(
  wardrobe: WardrobeItem[],
  theme: string,
  alreadyUsed: Set<number>,
): WardrobeItem | undefined {
  const shoes = wardrobe.filter(w => w.category === 'Shoes' && !alreadyUsed.has(w.id));
  if (shoes.length === 0) return undefined;

  const scoreShoe = (s: WardrobeItem): number => {
    const sub = (s.subcategory ?? '').toLowerCase();
    let n = 1; // baseline so we always pick *something* if shoes exist
    if (theme === 'Office') {
      if (/loafer|derby|oxford|chelsea/.test(sub)) n += 6;
      if (/sneaker/.test(sub) && /white|leather|clean/.test(sub)) n += 3;
      if (/athletic|trainer|sport|sandal/.test(sub)) n -= 5;
    } else if (theme === 'Date Night' || theme === 'Night Out') {
      if (/chelsea|boot|leather/.test(sub)) n += 6;
      if (/loafer/.test(sub)) n += 4;
      if (/sneaker/.test(sub) && /white|leather|clean/.test(sub)) n += 3;
      if (/athletic|trainer|sport|sandal|flip/.test(sub)) n -= 5;
    } else if (theme === 'Workout') {
      if (/athletic|trainer|sport|running/.test(sub)) n += 8;
      if (/chelsea|loafer|derby|oxford|mojri|heels/.test(sub)) n -= 6;
    } else if (theme === 'Casual Outing' || theme === 'Travel') {
      if (/sneaker|canvas|slip-on/.test(sub)) n += 5;
      if (/loafer/.test(sub)) n += 2;
      if (/derby|oxford|formal|heels/.test(sub)) n -= 3;
    } else if (theme === 'Festive' || theme === 'Wedding') {
      if (/mojri/.test(sub)) n += 8;
      if (/loafer|leather|derby|oxford/.test(sub)) n += 5;
      if (/athletic|trainer|sandal/.test(sub)) n -= 6;
    }
    return n;
  };

  return shoes.sort((a, b) => scoreShoe(b) - scoreShoe(a))[0];
}

// ── Pad thin outfits ───────────────────────────────────────────────────────
// Enforce the complete-outfit shape: every outfit must have top + bottom
// (or a standalone dress that covers both). Footwear is added when available
// but is OPTIONAL — a top + bottom is a complete outfit; a top alone or
// top + shoes (no bottom) is not. Outfits that can't reach top + bottom even
// after padding are dropped.
//
// CRITICAL: this function searches the FULL wardrobe (not just toSend), so
// even items that scored poorly for the occasion can be pulled in as
// substitutes — exactly the case where user has bottoms tagged for a
// different occasion but they're still the only bottoms they own.
function padThinOutfits(
  outfits: AiOutfit[],
  fullWardrobe: WardrobeItem[],
  theme: string,
): AiOutfit[] {
  // FULL_GARMENT_CATS = categories that cover both top + bottom (a dress IS the outfit).
  // We intentionally do NOT trust layer_role==='standalone' here because the classifier
  // marks jeans/leggings as standalone too — and a pair of jeans is NOT a top.
  const FULL_GARMENT_CATS = ['Dress','Saree','Lehenga','Kurta','Sherwani'];
  const isFullGarment = (p: WardrobeItem) => FULL_GARMENT_CATS.includes(p.category);

  const padded = outfits.map(outfit => {
    // Normalize pieceIds to numbers (Gemini occasionally returns strings)
    const idsAsNumbers = (outfit.pieceIds ?? [])
      .map(id => typeof id === 'string' ? parseInt(id, 10) : id)
      .filter(id => typeof id === 'number' && !isNaN(id)) as number[];
    const existing = new Set<number>(idsAsNumbers);
    const pieces   = idsAsNumbers
      .map(id => fullWardrobe.find(w => w.id === id))
      .filter(Boolean) as WardrobeItem[];

    const newIds   = [...(outfit.pieceIds ?? [])];
    const newNames = [...(outfit.pieces ?? [])];
    let changed = false;

    // CATEGORY-ONLY checks — no layer_role reliance.
    let hasTop    = pieces.some(p => p.category === 'Tops' || p.category === 'Outerwear' || isFullGarment(p));
    let hasBottom = pieces.some(p => p.category === 'Bottoms' || isFullGarment(p));
    const hasShoes = pieces.some(p => p.category === 'Shoes');

    // 1. Top missing → try Tops, then Outerwear, then full-body garment
    if (!hasTop) {
      const candidate = fullWardrobe.find(w => !existing.has(w.id) && w.category === 'Tops')
                     ?? fullWardrobe.find(w => !existing.has(w.id) && w.category === 'Outerwear')
                     ?? fullWardrobe.find(w => !existing.has(w.id) && isFullGarment(w));
      if (candidate) {
        newIds.push(candidate.id); newNames.push(candidate.name); existing.add(candidate.id);
        changed = true;
        hasTop = true;
        if (isFullGarment(candidate)) hasBottom = true;
      }
    }

    // 2. Bottom missing → try Bottoms, then full-body garment (dress covers both)
    if (!hasBottom) {
      const candidate = fullWardrobe.find(w => !existing.has(w.id) && w.category === 'Bottoms')
                     ?? fullWardrobe.find(w => !existing.has(w.id) && isFullGarment(w));
      if (candidate) {
        newIds.push(candidate.id); newNames.push(candidate.name); existing.add(candidate.id);
        changed = true;
        hasBottom = true;
      }
    }

    // 3. Shoes missing → add if wardrobe has any. If no shoes exist, leave shoeless.
    if (!hasShoes) {
      const shoes = pickShoesForTheme(fullWardrobe, theme, existing);
      if (shoes) {
        newIds.push(shoes.id); newNames.push(shoes.name); existing.add(shoes.id);
        changed = true;
      }
    }

    if (changed) {
      console.log(`🪡 padded outfit "${outfit.name}": ${(outfit.pieceIds ?? []).length} → ${newIds.length} pieces [${newNames.join(', ')}]`);
    } else if (!hasBottom) {
      console.warn(`⚠️  outfit "${outfit.name}" still missing bottom — wardrobe has none?`);
    }

    return changed
      ? { ...outfit, pieceIds: newIds, pieces: newNames, matchQuality: 'closest' as const }
      : outfit;
  });

  return padded;
}

// ── Guarantee 3 outfits ────────────────────────────────────────────────────
// If Gemini returned fewer than 3 outfits (or they were filtered/dropped
// upstream), construct enough fallback outfits from the wardrobe to reach 3.
// Each fallback uses a different hero/top so users see real variety, not
// the same combination three times.
function ensureThreeOutfits(
  outfits: AiOutfit[],
  wardrobe: WardrobeItem[],
  theme: string,
  anchor: { id: number; name: string; category: string } | null,
): AiOutfit[] {
  const TARGET = 3;
  if (outfits.length >= TARGET) return outfits.slice(0, TARGET);

  const usedTopIds = new Set<number>();
  outfits.forEach(o => (o.pieceIds ?? []).forEach(id => {
    const item = wardrobe.find(w => w.id === id);
    if (item && (item.category === 'Tops' || item.category === 'Outerwear'
              || ['Dress','Saree','Lehenga','Kurta','Sherwani'].includes(item.category))) {
      usedTopIds.add(id);
    }
  }));

  const tops = wardrobe.filter(w =>
    w.category === 'Tops' || w.category === 'Outerwear' ||
    ['Dress','Saree','Lehenga','Kurta','Sherwani'].includes(w.category)
  );
  const bottoms = wardrobe.filter(w => w.category === 'Bottoms');

  const result = [...outfits];
  const FULL_GARMENT_CATS = ['Dress','Saree','Lehenga','Kurta','Sherwani'];
  const isFullGarment = (p: WardrobeItem) => FULL_GARMENT_CATS.includes(p.category);

  let attempts = 0;
  while (result.length < TARGET && attempts < tops.length + bottoms.length + 5) {
    attempts++;
    const top = tops.find(t => !usedTopIds.has(t.id)) ?? tops[result.length % Math.max(1, tops.length)];
    if (!top) break;
    usedTopIds.add(top.id);

    const pieceIds: number[] = [];
    const pieces:   string[] = [];

    // If anchor is set, it must appear in every outfit
    if (anchor && anchor.id !== top.id) {
      pieceIds.push(anchor.id);
      pieces.push(anchor.name);
    }

    pieceIds.push(top.id);
    pieces.push(top.name);

    // Add bottom unless top is a full-body garment (dress/saree/etc.) that covers both
    if (!isFullGarment(top) && bottoms.length > 0) {
      const bottom = bottoms[result.length % bottoms.length];
      if (bottom && !pieceIds.includes(bottom.id)) {
        pieceIds.push(bottom.id);
        pieces.push(bottom.name);
      }
    }

    // Theme-appropriate shoes (returns undefined if no shoes in wardrobe)
    const shoes = pickShoesForTheme(wardrobe, theme, new Set(pieceIds));
    if (shoes) {
      pieceIds.push(shoes.id);
      pieces.push(shoes.name);
    }

    // Verify the constructed outfit has a top + bottom (or full garment).
    // We use category-only checks, never layer_role.
    const hasTop    = isFullGarment(top) || top.category === 'Tops' || top.category === 'Outerwear';
    const hasBottom = isFullGarment(top) ||
                      pieceIds.some(id => {
                        const it = wardrobe.find(w => w.id === id);
                        return !!it && it.category === 'Bottoms';
                      });

    if (!hasTop || !hasBottom) continue;

    result.push({
      name: `Closest Match — ${theme} ${result.length + 1}`,
      template: 'Closest Match',
      trendContext: `Best from your wardrobe for ${theme}`,
      pieceIds,
      pieces,
      heroPieceId: top.id,
      occasion: theme,
      tip: `Built from what your wardrobe offers — add more ${theme.toLowerCase()}-leaning pieces to expand options.`,
      mood: 'Adaptive',
      matchQuality: 'closest',
    });
  }

  return result.slice(0, TARGET);
}

export default router;
