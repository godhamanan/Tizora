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
    parsed.outfits = validateOutfits(parsed.outfits, theme, toSend);

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

  // 1. Formality match (theme allows this formality bucket)
  if (item.formality && allowed.includes(item.formality)) score += 3;

  // 2. Exact occasion_tag match (split-trim — not the old substring bug)
  const tags = (item.occasion_tags ?? '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  if (tags.includes(themeKey)) score += 5;

  // 3. pieceRole bias — hero pieces shine in most occasions, but NOT Office
  if (item.piece_role === 'hero' && theme !== 'Office') score += 3;
  if (item.piece_role === 'anchor') score += 2;

  // 4. Layer-role bonus for layered occasions
  if ((theme === 'Date Night' || theme === 'Night Out') && item.layer_role === 'outer') score += 2;

  // 5. Energy match for casual occasions
  if ((theme === 'Travel' || theme === 'Casual Outing') &&
      /comfortable|laid-back|relaxed|effortless/i.test(item.energy ?? '')) {
    score += 2;
  }

  // 5b. Athletic items score high for Workout
  if (theme === 'Workout') {
    if (item.formality === 'athletic') score += 8;
    const sub = (item.subcategory ?? '').toLowerCase();
    if (/jogger|sweatpant|hoodie|sweatshirt|tank|tee|short/.test(sub)) score += 3;
  }

  // 6. OFFICE-specific strong preferences ────────────────────────────────
  if (theme === 'Office') {
    // Big boost for formal shirts / blazers / trousers — the Office archetype anchors
    const sub = (item.subcategory ?? '').toLowerCase();
    if (item.category === 'Tops' && /shirt|button|oxford|polo/.test(sub) && item.formality !== 'casual') score += 6;
    if (item.category === 'Outerwear' && /blazer|suit/.test(sub)) score += 6;
    if (item.category === 'Bottoms' && /trouser|chino|tailored/.test(sub)) score += 4;
    // Soft penalty: casual tees lose ground when better Office options exist
    if (item.category === 'Tops' && /t-shirt|tee|hoodie|sweatshirt/.test(sub)) score -= 2;
    if (item.category === 'Bottoms' && /short|cargo|jogger/.test(sub)) score -= 4;
  }

  // 7. Hard incompatibilities (strong negative)
  if (item.formality === 'athletic' && theme !== 'Travel' && theme !== 'Casual Outing' && theme !== 'Workout') score -= 10;
  if (item.style === 'Ethnic' && (theme === 'Office' || theme === 'Travel' || theme === 'Casual Outing' || theme === 'Workout')) score -= 8;
  if (theme === 'Office' && item.color_saturation === 'bold') score -= 5;
  if (theme === 'Office' && item.piece_role === 'hero' && item.color_saturation !== 'muted') score -= 3;

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
  const footwear = pieces.filter(p => p.category === 'Shoes' || p.category === 'Accessories');
  const nonFootwear = pieces.filter(p => p.category !== 'Shoes' && p.category !== 'Accessories');

  const heroId = outfit.heroPieceId;
  const isPatterned = (p: WardrobeItem) => !!p.pattern && !/^(solid|plain)?$/i.test(p.pattern);

  // Sort non-footwear by keep-priority:
  //   hero > standalone (dress) > bottom > outer > mid > base > other
  // Earlier-listed wins when we dedupe categories.
  const priority = (p: WardrobeItem) => {
    if (p.id === heroId) return 0;
    if (p.layer_role === 'standalone' || p.category === 'Dress') return 1;
    if (p.category === 'Bottoms') return 2;
    if (p.layer_role === 'outer' || p.category === 'Outerwear') return 3;
    if (p.layer_role === 'mid') return 4;
    if (p.layer_role === 'base' || p.category === 'Tops') return 5;
    return 6;
  };
  const ranked = [...nonFootwear].sort((a, b) => priority(a) - priority(b));

  const keep: WardrobeItem[] = [];
  let hasBottom = false;
  let hasOuter = false;
  let hasStandalone = false;
  let patternedCount = 0;
  const seenLayerRoles = new Set<string>();

  for (const p of ranked) {
    if (keep.length >= maxLayers) break;

    // 1-standalone: a dress/kurta is the whole outfit, max 1
    if (p.layer_role === 'standalone' || p.category === 'Dress' || p.category === 'Kurta' || p.category === 'Saree' || p.category === 'Lehenga') {
      if (hasStandalone) continue;
      hasStandalone = true;
      keep.push(p);
      continue;
    }

    // 1-bottom: only one Bottoms piece
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

    // Dedupe by layer_role (so we don't have 2 base layers like tee + tee)
    if (p.layer_role && p.layer_role !== 'standalone' && seenLayerRoles.has(p.layer_role)) continue;

    // Pattern count cap (at most 1 patterned piece per outfit)
    if (isPatterned(p) && patternedCount >= 1) continue;
    if (isPatterned(p)) patternedCount++;

    if (p.layer_role) seenLayerRoles.add(p.layer_role);
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

export default router;
