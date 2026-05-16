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

    // Guard before running Gemini — check wardrobe exists
    const countRow = await db
      .selectFrom('clothes')
      .select(db.fn.countAll<number>().as('n'))
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!countRow || Number(countRow.n) === 0) {
      return res.status(400).json({ error: 'No clothes in wardrobe yet' });
    }

    let anchorItem: { id: number; name: string; category: string; color: string; style: string | null; formality: string | null } | null = null;
    if (anchorItemId) {
      anchorItem = await db
        .selectFrom('clothes')
        .select(['id', 'name', 'category', 'color', 'style', 'formality'])
        .where('id', '=', anchorItemId)
        .executeTakeFirst() ?? null;
    }

    const profile = await db
      .selectFrom('profiles')
      .select(['gender'])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    const wardrobe = await db
      .selectFrom('clothes')
      .select([
        'id', 'name', 'category', 'subcategory',
        'color', 'secondary_color', 'pattern', 'fabric', 'fit',
        'formality', 'gender_style', 'season', 'style',
        'pairs_well_with', 'layers_with',
        'style_vibes', 'occasion_tags', 'energy', 'works_best_for',
        // Phase 0 styling intelligence
        'color_undertone', 'color_saturation', 'piece_role',
        'layer_role', 'fabric_weight', 'color_pairs', 'contrast_affinity',
      ])
      .where('user_id', '=', userId)
      .execute();

    const allowed  = OCCASION_FORMALITY_MAP[theme] ?? [];
    const themeKey = theme.toLowerCase().replace(/\s+/g, '-');

    const filtered = wardrobe.filter(item => {
      const byFormality = allowed.length === 0 || allowed.includes(item.formality ?? '');
      const byTag       = item.occasion_tags?.toLowerCase().includes(themeKey) ?? false;
      return byFormality || byTag;
    });

    // If anchor item got filtered out, force-include it
    if (anchorItem && !filtered.find(c => c.id === anchorItem!.id)) {
      const full = wardrobe.find(c => c.id === anchorItem!.id);
      if (full) filtered.unshift(full);
    }

    const toSend = filtered.length >= 8 ? filtered : wardrobe;

    const wardrobeSummary = toSend
      .map(c => {
        const colors = [c.color, c.secondary_color].filter(Boolean).join('/');
        // Promote Phase 0 styling fields to the front — they drive composition
        const styling = [
          c.piece_role        ? `role:${c.piece_role}`               : null,  // hero/anchor/neutral
          c.layer_role        ? `layer:${c.layer_role}`              : null,  // base/mid/outer/standalone
          c.color_saturation  ? `saturation:${c.color_saturation}`   : null,  // muted/medium/bold
          c.color_undertone   ? `undertone:${c.color_undertone}`     : null,
          c.color_pairs       ? `pairsColors:${c.color_pairs}`       : null,  // explicit color names
          c.contrast_affinity ? `contrast:${c.contrast_affinity}`    : null,
          c.fabric_weight     ? `weight:${c.fabric_weight}`          : null,
        ].filter(Boolean).join(' | ');
        const meta = [
          c.subcategory, c.fabric, c.fit, c.formality, c.gender_style,
          c.layers_with     ? `layersWith:${c.layers_with}`      : null,
          c.occasion_tags   ? `occasionTags:${c.occasion_tags}`  : null,
          c.style_vibes     ? `vibes:${c.style_vibes}`           : null,
          c.energy          ? `energy:${c.energy}`               : null,
          c.works_best_for  ? `worksBestFor:${c.works_best_for}` : null,
          c.pairs_well_with ? `pairsWell:${c.pairs_well_with}`   : null,
        ].filter(Boolean).join(' | ');
        const heroTag = c.piece_role === 'hero' ? ' [HERO]' : '';
        return `[ID:${c.id}]${heroTag} ${c.name} — ${c.category}, ${colors}, ${c.pattern ?? 'solid'}, ${c.style ?? 'Western'}${styling ? ` || ${styling}` : ''}${meta ? ` | ${meta}` : ''}`;
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

    const response = await Promise.race([
      ai.models.generateContent({
        model:    GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timed out after 40s')), 40_000)
      ),
    ]);

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

// ── Validation pass ────────────────────────────────────────────────────────
// Enforces the constraints the prompt asked Gemini to follow, but that Gemini
// sometimes ignores. Soft validation: we don't reject outfits, we annotate
// them so the frontend (or future retry logic) can react.
type WardrobeItem = {
  id: number;
  category: string;
  piece_role:       string | null;
  color_saturation: string | null;
  formality:        string | null;
};

function validateOutfits(outfits: AiOutfit[], theme: string, wardrobe: WardrobeItem[]): AiOutfit[] {
  const occ = getOccasionPrompt(theme);
  const byId = new Map<number, WardrobeItem>(wardrobe.map(w => [w.id, w]));

  // Track heroes/anchors across outfits for diversity check
  const seenHeroes = new Set<number>();
  const seenAnchors = new Set<number>();

  return outfits.map((outfit, idx) => {
    const ids = (outfit.pieceIds ?? []).filter(id => typeof id === 'number');
    const pieces = ids.map(id => byId.get(id)).filter(Boolean) as WardrobeItem[];

    // 1. Layer count check (pieces excluding footwear)
    const nonFootwear = pieces.filter(p => p.category !== 'Shoes' && p.category !== 'Accessories');
    const layerCount = nonFootwear.length;
    const layerOK = layerCount >= occ.layerCount.min && layerCount <= occ.layerCount.max;

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
    if (!layerOK)         issues.push(`layer-count ${layerCount} outside ${occ.layerCount.min}–${occ.layerCount.max}`);
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
