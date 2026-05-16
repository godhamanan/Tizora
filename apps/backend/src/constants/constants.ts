// ── Gemini model ───────────────────────────────────────────────────────────

export const GEMINI_MODEL = 'gemini-2.5-flash';

// ── Occasion rules (shared by suggest route + pre-filter) ──────────────────

export const OCCASION_FORMALITY_MAP: Record<string, string[]> = {
  'Weekend':    ['casual', 'smart-casual'],
  'Date Night': ['smart-casual', 'business-casual'],
  'Night Out':  ['smart-casual', 'business-casual'],
  'Office':     ['business-casual', 'formal', 'smart-casual'],
  'Festival':   ['festive', 'formal'],
  'Wedding':    ['festive', 'formal'],
  'Vacation':   ['casual', 'smart-casual'],
  'Travel':     ['casual', 'smart-casual'],
};

// Legacy shape — kept for backward compat / fallback only. New code uses OCCASION_PROMPTS below.
export const OCCASION_RULES: Record<string, { formality: string; male: string; female: string; avoid: string }> = {
  'Weekend':    { formality: 'casual',                        male: 'hoodies, oversized tees, joggers, casual shorts, clean sneakers.',               female: 'oversized knits, casual co-ords, casual dresses, sneakers.',                             avoid: 'formal, business-casual, festive, athletic' },
  'Date Night': { formality: 'smart-casual to business-casual', male: 'fitted button-downs, dark slim jeans, chinos, chelsea boots, loafers.',          female: 'midi dresses, fitted tops with tailored trousers, wrap dresses, heels or ankle boots.', avoid: 'casual tees, hoodies, sportswear, heavy ethnic' },
  'Night Out':  { formality: 'smart-casual to party',         male: 'statement shirts, dark slim jeans, leather jackets, chelsea boots.',              female: 'bodycon or mini dresses, satin tops, sequins, heels or strappy sandals.',              avoid: 'office wear, ethnic, sportswear, hoodies' },
  'Office':     { formality: 'business-casual to formal',     male: 'Oxford/dress shirts, structured trousers, blazers, chinos, brogues. NO jeans, tees.', female: 'blazers, tailored trousers, pencil skirts, structured blouses, midi dresses.',      avoid: 'casual, party, festive, athletic, ripped jeans' },
  'Festival':   { formality: 'festive to casual',             male: 'kurtas, indo-western fusion jackets, embroidered shirts, mojris.',                female: 'lehengas, salwar suits, anarkalis, indo-western fusion dresses, jhumkas.',             avoid: 'plain western office wear, sportswear, loungewear' },
  'Wedding':    { formality: 'formal to festive',             male: 'sherwanis, bandhgalas, jodhpuris, formal suits, heavily embroidered kurtas.',     female: 'sarees, lehengas, heavily embellished salwar suits, anarkalis.',                      avoid: 'casual western, sportswear, loungewear, plain tees' },
  'Vacation':   { formality: 'casual to resort-casual',       male: 'linen shirts, shorts, lightweight chinos, printed shirts, sandals.',              female: 'sundresses, co-ord sets, linen trousers, breezy tops, sandals.',                      avoid: 'formal, heavy fabrics, festive, office wear' },
  'Travel':     { formality: 'casual to smart-casual',        male: 'joggers, comfortable chinos, casual shirts, hoodies, clean sneakers.',            female: 'comfortable trousers, casual dresses, hoodies, sneakers.',                           avoid: 'formal, heels, heavy ethnic, anything restrictive' },
};

// ── Per-occasion archetype-based styling system ─────────────────────────────
// Each block defines a complete styling brief: archetypes (concrete outfit
// compositions), rules, palette, silhouette, voice. Only the active occasion's
// block is injected into the Gemini prompt — keeps it focused.

export interface Archetype {
  name: string;          // e.g. "Open Shirt Layer"
  composition: string[]; // ordered piece slots (outer → bottom → footwear)
}

export interface OccasionPrompt {
  goal: string;
  styleDirection: string[];
  archetypes: Archetype[];
  rules: string[];
  preferredColors: string[];
  avoid?: string[];
  silhouetteGuidance?: string[];
  outfitsShouldFeel: string[];
  layerCount: { min: number; max: number };  // pieces excluding footwear
  templates: string[];                        // template IDs Gemini picks from (matches archetype names)
  // Optional gender overrides
  female?: Partial<Omit<OccasionPrompt, 'female'>>;
  male?:   Partial<Omit<OccasionPrompt, 'male'>>;
}

export const OCCASION_PROMPTS: Record<string, OccasionPrompt> = {
  'Office': {
    goal: 'Polished, intentional, minimal, clean. Quietly professional.',
    styleDirection: ['smart-casual', 'business-casual', 'tonal dressing', 'understated confidence', 'fit + fabric over loudness'],
    archetypes: [
      { name: 'Classic Shirt',       composition: ['button-down or oxford shirt', 'chinos or tailored trousers', 'loafers / leather sneakers'] },
      { name: 'Smart Casual Knit',   composition: ['polo / fine knit', 'chinos / structured trousers', 'loafers / minimal sneakers'] },
      { name: 'Relaxed Professional',composition: ['lightweight blazer or overshirt', 'clean tee or shirt', 'structured trousers'] },
    ],
    rules: [
      '2–3 pieces maximum (excluding footwear)',
      'avoid loud contrast — tonal palettes only',
      'avoid bold-saturation pieces (no electric, hot, vivid colors)',
      'avoid sportswear, graphic-heavy items, hoodies',
      'NO pieces with pieceRole:"hero" unless they are tonal (e.g. a navy blazer is fine, a hot pink shirt is not)',
    ],
    preferredColors: ['navy', 'charcoal', 'white', 'cream', 'olive', 'soft blue', 'beige', 'gray', 'black'],
    avoid: ['athletic wear', 'graphic tees', 'cargo pants', 'ripped denim', 'sneakers with logos'],
    silhouetteGuidance: ['structured top + clean lower half', 'avoid oversized-on-oversized'],
    outfitsShouldFeel: ['refined', 'modern', 'quietly stylish', 'effortless professional'],
    layerCount: { min: 2, max: 3 },
    templates: ['Classic Shirt', 'Smart Casual Knit', 'Relaxed Professional'],
    female: {
      archetypes: [
        { name: 'Tailored Shirt', composition: ['silk blouse or fine shirt', 'tailored trousers or pencil skirt', 'loafers or block heels'] },
        { name: 'Soft Tailoring', composition: ['blazer', 'clean tee or blouse', 'tailored trousers'] },
        { name: 'Polished Knit',  composition: ['fine knit top', 'midi skirt or trousers', 'loafers or boots'] },
      ],
      templates: ['Tailored Shirt', 'Soft Tailoring', 'Polished Knit'],
    },
  },

  'Date Night': {
    goal: 'Intentional, attractive, layered, confident.',
    styleDirection: ['elevated casual', 'layered styling', 'clean dark palettes', 'subtle statement energy'],
    archetypes: [
      { name: 'Open Shirt Layer', composition: ['open button-down shirt (worn unbuttoned)', 'fitted tee or tank inside', 'dark jeans or trousers', 'clean sneakers or boots'] },
      { name: 'Bomber & Tee',     composition: ['bomber / suede / leather jacket', 'fitted clean tee', 'dark bottoms', 'sneakers or boots'] },
      { name: 'Elevated Knit',    composition: ['textured knit or fine sweater', 'dark trousers or chinos', 'sleek footwear'] },
      { name: 'Monochrome Minimal',composition: ['tonal top layer', 'dark slim or relaxed trousers', 'sleek footwear'] },
    ],
    rules: [
      '2–4 pieces — intentional layering encouraged',
      'ONE focal point only: the jacket OR the shirt OR the knit. Never two statement pieces.',
      'darker bottoms strongly preferred',
      'balance structured + relaxed pieces',
    ],
    preferredColors: ['black', 'charcoal', 'olive', 'deep brown', 'navy', 'cream', 'dusty rose'],
    avoid: ['bright loud colors as background pieces', 'sportswear', 'hoodies as outer layer'],
    silhouetteGuidance: ['balance structured + relaxed pieces', 'avoid bulky layering'],
    outfitsShouldFeel: ['confident', 'attractive', 'modern', 'cinematic', 'effortless'],
    layerCount: { min: 2, max: 4 },
    templates: ['Open Shirt Layer', 'Bomber & Tee', 'Elevated Knit', 'Monochrome Minimal'],
    female: {
      archetypes: [
        { name: 'Slip & Layer',     composition: ['silk slip top or camisole', 'tailored trousers or midi skirt', 'heels or ankle boots'] },
        { name: 'Knit & Skirt',     composition: ['fitted knit', 'leather or midi skirt', 'boots or heels'] },
        { name: 'Midi Dress',       composition: ['fitted midi dress', 'heels or ankle boots'] },
        { name: 'Elevated Casual',  composition: ['fitted top', 'tailored trousers or dark jeans', 'sleek footwear'] },
      ],
      templates: ['Slip & Layer', 'Knit & Skirt', 'Midi Dress', 'Elevated Casual'],
    },
  },

  'Night Out': {
    goal: 'Bold, stylish, energetic, nightlife-ready.',
    styleDirection: ['elevated streetwear', 'dark palettes', 'sharper contrasts', 'fashion-forward layering'],
    archetypes: [
      { name: 'Statement Outerwear', composition: ['bold jacket or bomber', 'clean inner layer (tee/fitted top)', 'dark jeans or trousers', 'statement footwear'] },
      { name: 'Layered Streetwear',  composition: ['open overshirt or flannel', 'inner tee', 'cargos or dark denim', 'sneakers or boots'] },
      { name: 'Monochrome Dark',     composition: ['black-on-black layered top', 'dark slim trousers', 'statement footwear'] },
    ],
    rules: [
      'layering preferred — 3+ pieces ideal',
      'stronger contrast allowed (one bold piece + dark base)',
      'darker bottoms strongly preferred',
      'avoid officewear energy and pastel-only palettes',
    ],
    preferredColors: ['black', 'charcoal', 'deep burgundy', 'olive', 'rust', 'cream as accent'],
    silhouetteGuidance: ['layered but not bulky', 'one structured + one relaxed piece'],
    outfitsShouldFeel: ['edgy', 'confident', 'nightlife-ready', 'stylish without trying too hard'],
    layerCount: { min: 2, max: 4 },
    templates: ['Statement Outerwear', 'Layered Streetwear', 'Monochrome Dark'],
    female: {
      archetypes: [
        { name: 'Mini & Boots',      composition: ['mini dress or skirt + fitted top', 'knee-high or ankle boots'] },
        { name: 'Statement Top',     composition: ['satin or sequin top', 'dark trousers or skirt', 'heels'] },
        { name: 'Leather & Slim',    composition: ['leather jacket', 'fitted top', 'slim trousers or skirt', 'boots or heels'] },
      ],
      templates: ['Mini & Boots', 'Statement Top', 'Leather & Slim'],
    },
  },

  'Weekend': {
    goal: 'Relaxed, effortless, wearable.',
    styleDirection: ['clean casual', 'comfortable', 'modern basics', 'easy layering'],
    archetypes: [
      { name: 'Easy Casual',     composition: ['tee', 'jeans or chinos', 'sneakers'] },
      { name: 'Relaxed Layered', composition: ['hoodie or sweatshirt', 'relaxed pants or jeans', 'casual sneakers'] },
      { name: 'Elevated Casual', composition: ['knit or casual shirt', 'chinos or dark jeans', 'clean sneakers or boots'] },
    ],
    rules: [
      'comfort prioritized — fits should be relaxed not skin-tight',
      'layering optional (2–3 pieces)',
      'muted and earthy tones encouraged',
    ],
    preferredColors: ['cream', 'olive', 'navy', 'gray', 'white', 'tan', 'rust', 'denim-blue'],
    outfitsShouldFeel: ['approachable', 'relaxed', 'stylish naturally', 'low-effort high-taste'],
    layerCount: { min: 2, max: 3 },
    templates: ['Easy Casual', 'Relaxed Layered', 'Elevated Casual'],
  },

  'Travel': {
    goal: 'Comfortable, wrinkle-resistant, airport-aesthetic. Put together without trying.',
    styleDirection: ['comfort first', 'layering practicality', 'soft tailoring'],
    archetypes: [
      { name: 'Hoodie & Pants',   composition: ['hoodie or zip-up', 'joggers or relaxed pants', 'sneakers'] },
      { name: 'Tee & Pants',      composition: ['plain tee', 'cargo pants or relaxed chinos', 'sneakers'] },
      { name: 'Soft Layered',     composition: ['lightweight outerwear', 'tee or fine knit', 'relaxed pants', 'sneakers'] },
    ],
    rules: [
      '2–3 pieces, max one outer layer',
      'avoid restrictive fits, hard structure, uncomfortable footwear',
      'sportswear ACCEPTABLE here (joggers, hoodies, sweats)',
    ],
    preferredColors: ['gray', 'black', 'navy', 'olive', 'cream', 'tan'],
    outfitsShouldFeel: ['comfortable', 'put together', 'effortless'],
    layerCount: { min: 2, max: 3 },
    templates: ['Hoodie & Pants', 'Tee & Pants', 'Soft Layered'],
  },

  'Vacation': {
    goal: 'Resort-energy, breathable, lighter palettes.',
    styleDirection: ['breathable fabrics', 'relaxed silhouettes', 'resort styling'],
    archetypes: [
      { name: 'Linen Resort',     composition: ['linen shirt (open or buttoned)', 'shorts or relaxed trousers', 'sandals'] },
      { name: 'Print & Pants',    composition: ['printed resort shirt or tee', 'linen trousers or shorts', 'sandals or sneakers'] },
      { name: 'Soft Cotton',      composition: ['soft cotton tee', 'shorts', 'sandals'] },
    ],
    rules: [
      '2–3 pieces, light fabrics only',
      'avoid heavy fabrics, dark heavy outerwear, formal pieces',
    ],
    preferredColors: ['cream', 'sand', 'white', 'sky-blue', 'sage', 'soft pink', 'pale yellow'],
    outfitsShouldFeel: ['effortless', 'resort', 'breezy', 'sun-ready'],
    layerCount: { min: 2, max: 3 },
    templates: ['Linen Resort', 'Print & Pants', 'Soft Cotton'],
  },

  'Festival': {
    goal: 'Celebratory and expressive. Match the user style if Ethnic exists; else go Western festival-energy.',
    styleDirection: ['celebratory', 'expressive', 'rich textures'],
    archetypes: [
      // Ethnic path (preferred if user has Ethnic pieces)
      { name: 'Kurta & Bottom',   composition: ['kurta', 'churidar / pants / jeans', 'mojris or sneakers'] },
      { name: 'Fusion Layered',   composition: ['fusion overshirt or short kurta', 'tee inside', 'jeans or trousers'] },
      // Western fallback (no ethnic in wardrobe)
      { name: 'Statement Western',composition: ['statement printed/embroidered shirt', 'dark trousers or jeans', 'clean footwear'] },
      { name: 'Elevated Casual',  composition: ['rich-tone knit or shirt', 'dark trousers', 'boots or loafers'] },
    ],
    rules: [
      '2–4 pieces',
      'prefer Ethnic archetypes if the user has Ethnic pieces in wardrobe',
      'avoid plain western office shirts, sportswear, loungewear',
    ],
    preferredColors: ['cream', 'maroon', 'gold-accent', 'navy', 'olive', 'rust', 'deep green'],
    outfitsShouldFeel: ['celebratory', 'expressive', 'culturally grounded'],
    layerCount: { min: 2, max: 4 },
    templates: ['Kurta & Bottom', 'Fusion Layered', 'Statement Western', 'Elevated Casual'],
    female: {
      archetypes: [
        { name: 'Lehenga / Saree', composition: ['lehenga or saree', 'optional dupatta', 'jhumkas / heels or mojris'] },
        { name: 'Anarkali / Suit', composition: ['anarkali or salwar-suit', 'dupatta', 'mojris or heels'] },
        { name: 'Fusion Set',      composition: ['kurta or fusion top', 'palazzo or jeans', 'sandals or mojris'] },
      ],
      templates: ['Lehenga / Saree', 'Anarkali / Suit', 'Fusion Set'],
    },
  },

  'Wedding': {
    goal: 'Elevated formal presence. Match the user style (Ethnic for Indian weddings, formal Western otherwise).',
    styleDirection: ['elevated formal', 'luxury textures', 'culturally aware'],
    archetypes: [
      { name: 'Sherwani / Bandhgala', composition: ['sherwani or bandhgala', 'churidar or formal trousers', 'mojris or formal shoes'] },
      { name: 'Formal Kurta Layered', composition: ['heavy kurta', 'churidar or pants', 'optional waistcoat', 'mojris'] },
      { name: 'Western Suit',         composition: ['suit jacket + matching trousers', 'dress shirt', 'tie or pocket square', 'leather shoes'] },
      { name: 'Indo-Western',         composition: ['fusion jacket or bandhgala', 'tailored trousers', 'leather shoes or mojris'] },
    ],
    rules: [
      '3–4 pieces — formal layering expected',
      'prefer Ethnic if user has Ethnic pieces',
      'NEVER: hoodies, sportswear, casual basics, denim',
    ],
    preferredColors: ['cream', 'maroon', 'gold', 'navy', 'champagne', 'deep green', 'black', 'charcoal'],
    outfitsShouldFeel: ['elevated', 'formal', 'present'],
    layerCount: { min: 3, max: 4 },
    templates: ['Sherwani / Bandhgala', 'Formal Kurta Layered', 'Western Suit', 'Indo-Western'],
    female: {
      archetypes: [
        { name: 'Heavy Lehenga',    composition: ['heavily embellished lehenga', 'dupatta', 'jhumkas + heels'] },
        { name: 'Saree',            composition: ['silk or embellished saree', 'matching blouse', 'heels or mojris'] },
        { name: 'Anarkali',         composition: ['heavy anarkali', 'dupatta', 'heels or mojris'] },
        { name: 'Indo-Western Gown',composition: ['fusion gown or floor-length set', 'heels'] },
      ],
      templates: ['Heavy Lehenga', 'Saree', 'Anarkali', 'Indo-Western Gown'],
    },
  },
};

// Map any unknown theme to a sensible default
export function getOccasionPrompt(theme: string): OccasionPrompt {
  return OCCASION_PROMPTS[theme] ?? OCCASION_PROMPTS['Weekend'];
}

// ── Suggest prompt ─────────────────────────────────────────────────────────

export interface SuggestPromptParams {
  season: string;
  year: number;
  theme: string;
  gender: string;
  weatherContext: string;
  anchorBlock: string;
  wardrobeSummary: string;
  anchorItemId?: number;
}

// Merge gender-specific overrides into the base occasion block
function resolveOccasion(theme: string, gender: string): OccasionPrompt {
  const base = getOccasionPrompt(theme);
  const override = gender === 'female' ? base.female : base.male;
  if (!override) return base;
  return { ...base, ...override };
}

function renderArchetypes(archetypes: Archetype[]): string {
  return archetypes.map((a, i) => {
    const slots = a.composition.map(s => `  • ${s}`).join('\n');
    return `${i + 1}. ${a.name}\n${slots}`;
  }).join('\n\n');
}

export function buildSuggestPrompt(p: SuggestPromptParams): string {
  const occ = resolveOccasion(p.theme, p.gender);

  const archetypes      = renderArchetypes(occ.archetypes);
  const styleDirection  = occ.styleDirection.map(s => `• ${s}`).join('\n');
  const rules           = occ.rules.map(s => `• ${s}`).join('\n');
  const preferredColors = occ.preferredColors.join(', ');
  const avoidLine       = occ.avoid?.length ? `\nAVOID:\n${occ.avoid.map(s => `• ${s}`).join('\n')}` : '';
  const silhouette      = occ.silhouetteGuidance?.length ? `\nSilhouette guidance:\n${occ.silhouetteGuidance.map(s => `• ${s}`).join('\n')}` : '';
  const feels           = occ.outfitsShouldFeel.join(', ');
  const templateList    = occ.templates.map(t => `"${t}"`).join(' | ');

  return `You are a senior personal stylist with 2025–26 sensibility. You compose intentional outfits — never random piles of clothes. Every outfit has a clear archetype, a focal point, and a coherent palette. You think in silhouettes and layering, not just categories.

━━━ CONTEXT ━━━
Season: ${p.season} ${p.year} | Occasion: "${p.theme}" | User: ${p.gender} | ${p.weatherContext}
${p.anchorBlock}
━━━ STYLING SYSTEM — "${p.theme}" ━━━
Goal: ${occ.goal}

Style direction:
${styleDirection}

Allowed archetypes (pick a DIFFERENT one for each of the 3 outfits):

${archetypes}

Rules:
${rules}
• Layer count: ${occ.layerCount.min}–${occ.layerCount.max} pieces (excluding footwear)

Preferred palette: ${preferredColors}${avoidLine}${silhouette}

Outfits should feel: ${feels}

━━━ WARDROBE ━━━
${p.wardrobeSummary}

━━━ BUILD 3 OUTFITS — STRICT REQUIREMENTS ━━━
1. Each outfit MUST use a DIFFERENT archetype from: ${templateList}
2. The dominant piece in each outfit (the hero piece — the one that defines the outfit's identity) MUST be different across all 3 outfits. Do NOT use the same tee/shirt as the anchor twice.
3. Avoid simple "jacket-swap" variations — each outfit must have distinct visual energy.
4. Set "template" to the archetype name you used.
5. Layer count must respect ${occ.layerCount.min}–${occ.layerCount.max} pieces.
6. Only use piece IDs that exist in the wardrobe above.
7. Formality must be consistent within an outfit.
8. Colors must harmonize per the preferred palette above.
9. ${p.theme === 'Office' ? 'Office HARD RULE: no pieces with pieceRole:"hero" if their colorSaturation is "bold". Tonal/anchor pieces only.' : 'If wardrobe has hero pieces, at least 1 outfit SHOULD feature one as the focal point.'}
10. If wardrobe genuinely lacks an archetype's required slot, gracefully degrade to a similar archetype — never invent piece IDs.
${p.anchorItemId ? `11. MANDATORY: piece ID:${p.anchorItemId} must appear in EVERY outfit's pieceIds.` : ''}

━━━ TIP VOICE (stylist-grade, not robotic) ━━━
Examples of good tips:
• "The bomber does the talking — let everything else whisper."
• "Cuff the sleeves once. Untuck halfway. Don't overthink the rest."
• "Pair the tonal browns; the cream tee lifts heavy to considered."
• "Leave the shirt open — it changes everything."
• "Polish from fabric, not from logos."

━━━ OUTPUT JSON (no markdown, no prose) ━━━
{"outfits":[{
  "name":"Short evocative title",
  "template":"${occ.templates[0]}",
  "trendContext":"One-line aesthetic context",
  "pieceIds":[1,2,3],
  "pieces":["Piece A","Piece B","Piece C"],
  "heroPieceId":1,
  "layeringOrder":[1,2,3],
  "stylingNotes":[{"pieceId":1,"note":"leave open"}],
  "textureStory":"matte cotton + crisp denim",
  "whyItWorks":"One line on why these pieces sing together.",
  "occasion":"${p.theme}",
  "tip":"Stylist-voice one-liner, max 14 words.",
  "mood":"Feeling word",
  "matchQuality":"exact"
}]}`;
}

// ── Single-image classification prompt ────────────────────────────────────

export const CLASSIFY_PROMPT = `You are a senior wardrobe intelligence system trained to extract maximally useful styling metadata from a single garment photo. Your output drives outfit recommendations across many real-world occasions — be generous, specific, and visually grounded.

Background (bed, floor, hangers, shadows) — ignore completely. Focus only on the garment.

Set "isClothing" to false ONLY if no wearable item is visible at all. Otherwise always true.
Return ONLY raw JSON. No markdown. No prose. No code fences.

━━━ EXAMPLE OUTPUT (a plain white tee) ━━━
{
  "isClothing": true,
  "label": "Relaxed White Cotton T-Shirt",
  "category": "Tops",
  "subcategory": "T-Shirt",
  "primaryColor": "white",
  "secondaryColor": null,
  "pattern": "solid",
  "fabric": "cotton",
  "fit": "relaxed",
  "style": "Western",
  "formality": "casual",
  "season": ["all-season"],
  "genderStyle": "unisex",
  "layersWith": ["denim jacket", "overshirt", "cardigan", "blazer"],
  "pairsWellWith": ["blue jeans", "khaki chinos", "cargo pants", "tailored trousers"],
  "styleNotes": "Tuck for polish, leave out for ease. The most flexible piece in any wardrobe.",
  "styleVibes": ["minimal", "clean", "relaxed", "modern"],
  "occasionTags": ["weekend", "travel", "college", "casual-day-out", "coffee-run", "errands", "movie-night"],
  "energy": ["effortless", "comfortable", "laid-back"],
  "worksBestFor": ["daytime casual looks", "airport layering", "relaxed everyday outfits", "weekend brunches"]
}

━━━ THE 4 RICH METADATA FIELDS (these drive recommendations — fill them richly) ━━━

styleVibes (4–8 entries):
  The MOOD/AESTHETIC the piece projects. Be evocative.
  Vocabulary: minimal, clean, modern, romantic, edgy, preppy, boho, sporty, polished,
              quiet-luxury, dopamine, dark-academia, indo-fusion, coastal, y2k,
              office-siren, old-money, clean-girl, streetwear, grunge, soft, structured,
              flowy, sharp, cozy, breezy, tailored, deconstructed
  Pick whatever genuinely fits — don't force it. A linen shirt may be: clean, breezy, coastal, relaxed.

occasionTags (5–10 entries):
  SPECIFIC real-life scenarios this piece works for. Be granular — these are what users actually search.
  Vocabulary includes (combine freely): weekend, travel, airport, road-trip, vacation, beach,
    college, lecture, library, coffee-run, errands, brunch, lunch-out, dinner-out, date-night,
    casual-date, first-date, movie-night, house-party, club, concert, festival, wedding,
    sangeet, mehendi, reception, family-gathering, family-outing, diwali, holi, eid, christmas,
    office, work-from-office, meeting, presentation, interview, conference, networking,
    work-from-home, lounge, sleepover, gym, run, yoga, hike, sports, picnic, garden-party,
    rooftop, after-work-drinks, birthday, anniversary, photo-shoot
  → Be GENEROUS: if a piece can credibly serve 7 of these, list 7.

energy (3–5 entries):
  The FEELING the wearer gives off in this piece.
  Vocabulary: effortless, comfortable, laid-back, polished, confident, sharp, romantic,
              playful, sensual, sophisticated, approachable, commanding, fresh, easy,
              put-together, dressy, professional, elegant, cool, grounded
  → Mix — a fitted blazer may be: sharp, confident, professional, polished.

worksBestFor (3–6 entries, FULL PHRASES not single words):
  Concrete stylist-voice suggestions of what styling context this piece elevates.
  Examples:
    - "daytime casual looks"
    - "airport layering"
    - "smart-casual dinners"
    - "Sunday brunch with friends"
    - "polished office days"
    - "low-key date nights"
    - "summer beach holidays"
    - "winter layering anchor"
    - "festive family gatherings"
    - "first impressions and interviews"
  → Write these as a stylist would caption a Pinterest board. Specific, human, useful.

━━━ MULTI-OCCASION RULE (non-negotiable — this is the whole point) ━━━

The SAME piece often spans many occasions. Don't be conservative.

Examples of generous, correct multi-tagging:
  • Black slim jeans → casual, weekend, date-night, dinner, college, travel, concert, night-out
  • White Oxford shirt → office, interview, date-night, dinner, smart-casual, brunch, presentation
  • Cream linen co-ord → vacation, beach, brunch, garden-party, festival, summer-weekend
  • Tailored blazer → office, interview, date-night, dinner, wedding-guest, after-work-drinks
  • Plain hoodie → lounge, weekend, college, travel, airport, errands, movie-night

EXCEPT for these strict no-go pairings (don't ever combine):
  • Ethnic (Kurta/Saree/Lehenga/Sherwani) → NEVER office/work/gym/college-daily
  • Sportswear/athletic → NEVER office/wedding/dinner/date-night
  • Heavy embroidery/embellishment → NEVER office/college/errands
  • Beachwear / swim → NEVER office/wedding/formal

━━━ STYLE RULE (non-negotiable) ━━━
Ethnic garments (Kurta, Lehenga, Saree, Sherwani, Dupatta, embroidered ethnic):
  → style = "Ethnic"
  → category = the specific ethnic category (Kurta / Lehenga / Saree / Sherwani / Dupatta)
  → formality = "festive" or "formal"
  → occasions include: festive, wedding, family-gathering, diwali, holi, sangeet, mehendi (pick what fits)
  → occasionTags rich with: family-gathering, wedding, sangeet, reception, diwali, festive-evening

Indo-Western fusion (kurta with jeans styling, structured fusion jackets):
  → style = "Fusion"
  → occasions include: dinner, date-night, family-outing, festive, brunch

━━━ FORMALITY RULE ━━━
DO NOT default to "casual" unless the item is genuinely casual.

casual          → plain tees, hoodies, sweatshirts, casual shorts, flip-flops, joggers
smart-casual    → polo shirts, casual button-downs, chinos, loafers, clean sneakers
business-casual → Oxford/dress shirts, structured trousers, blazers, brogues
formal          → suits, tuxedos, formal kurtas, dress shoes
festive         → embroidered/embellished ethnic
athletic        → gym wear, tracksuits, running shoes, sports jerseys

━━━ BLAZER / SUIT RULE ━━━
Blazer: category="Outerwear", subcategory="Blazer", formality="business-casual" or "formal".
  Occasions MUST include "office" AND should include date-night, dinner, wedding-guest.
Full suit: subcategory="Suit Jacket", formality="formal", occasions=["office","wedding","dinner","interview"].
Tuxedo: subcategory="Tuxedo", occasions=["wedding","gala","dinner"] — NEVER office daily.
Bandhgala: style="Ethnic" or "Fusion", occasions=["wedding","festive","dinner","reception"].

━━━ ATHLETIC RULE ━━━
Sportswear: formality="athletic". Occasions=["sports","gym","run","yoga"] ONLY. Energy = ["active","fresh"].

━━━ STRICT CLASSIFICATION CHECKS ━━━
1. Button-down/Oxford → formality smart-casual or business-casual, MUST include "office" in occasions
2. Kurta/Lehenga/Saree/Sherwani → style "Ethnic", MUST include festive or wedding, NEVER office
3. Gym wear → athletic, occasions sports/gym ONLY
4. Never assign "office" to ethnic or athletic wear
5. Never assign "festive"/"wedding" to t-shirts or basic Western casual
6. Blazer → MUST include office in occasions
7. Bandhgala → wedding/festive/dinner/reception, NEVER office/sports

━━━ FIELD VOCABULARY ━━━
category: Tops | Bottoms | Kurta | Saree | Lehenga | Sherwani | Dupatta | Dress | Outerwear | Shoes | Accessories
  Outerwear subcategories: Blazer | Suit Jacket | Tuxedo | Bandhgala | Jacket | Coat | Cardigan
season values: spring | summer | autumn | winter | all-season  (use array, can have multiple)
genderStyle: menswear | womenswear | unisex

━━━ OUTPUT RULES ━━━
• Return ONLY the raw JSON object. No backticks, no prose.
• Every array field must be present (use [] not null if empty — but try not to be empty).
• Single-string fields: use null if truly unknown, never empty string.
• Be GENEROUS with occasionTags, styleVibes, energy, worksBestFor — these are the engine of personalization.`;

// ── Batch classification prompt (up to 5 images, single Gemini call) ────────
// Merges independence rules + imageIndex from new design with full
// vocabulary richness from CLASSIFY_PROMPT. imageIndex lets us map
// results back to files even if Gemini returns them out of canonical order.

export const BATCH_CLASSIFY_PROMPT = `You are a senior wardrobe intelligence and fashion styling system trained to extract rich, stylistically useful metadata from MULTIPLE independent wardrobe photos.

You will receive up to 5 wardrobe images. Classify each one independently and return a JSON array.

━━━ CRITICAL INDEPENDENCE RULES ━━━
• Treat EACH image completely independently
• Do NOT compare images against each other — do NOT let image N influence image N+1
• Ignore ALL backgrounds (beds, floors, hangers, mirrors, walls, furniture, shadows)
• Each image contains ONE primary wearable item
• Set "isClothing": false ONLY if no wearable item is visible at all, unusable blur, or completely irrelevant scene — otherwise ALWAYS true

━━━ OUTPUT RULES ━━━
Return ONLY a raw JSON array — no markdown, no prose, no code fences.
The array must have exactly one object per image, in image order.
Each object MUST include "imageIndex" matching its position (0-based).

━━━ EXAMPLE (image 0 = plain white tee) ━━━
[{
  "imageIndex": 0,
  "isClothing": true,
  "label": "Relaxed White Cotton T-Shirt",
  "category": "Tops",
  "subcategory": "T-Shirt",
  "primaryColor": "white",
  "secondaryColor": null,
  "pattern": "solid",
  "fabric": "cotton",
  "fit": "relaxed",
  "style": "Western",
  "formality": "casual",
  "season": ["all-season"],
  "genderStyle": "unisex",
  "layersWith": ["denim jacket", "overshirt", "cardigan", "blazer"],
  "pairsWellWith": ["blue jeans", "khaki chinos", "cargo pants", "tailored trousers"],
  "styleNotes": "Tuck for polish, leave out for ease. The most flexible piece in any wardrobe.",
  "styleVibes": ["minimal", "clean", "relaxed", "modern"],
  "occasionTags": ["weekend", "travel", "college", "casual-day-out", "coffee-run", "errands", "movie-night"],
  "energy": ["effortless", "comfortable", "laid-back"],
  "worksBestFor": ["daytime casual looks", "airport layering", "relaxed everyday outfits", "weekend brunches"]
}]

━━━ SCHEMA FIELDS (every object must include all fields) ━━━
imageIndex       integer, 0-based, matches image position
isClothing       boolean
label            string — specific descriptive name
category         one of: Tops | Bottoms | Kurta | Saree | Lehenga | Sherwani | Dupatta | Dress | Outerwear | Shoes | Accessories
subcategory      string | null (e.g. T-Shirt, Blazer, Suit Jacket, Bomber Jacket, Denim Jacket, Cardigan, Joggers…)
primaryColor     string
secondaryColor   string | null
pattern          string (solid, striped, checked, printed, embroidered…)
fabric           string | null
fit              string | null (slim, regular, relaxed, oversized, boxy…)
style            "Western" | "Ethnic" | "Fusion"
formality        "casual" | "smart-casual" | "business-casual" | "formal" | "festive" | "athletic"
season           array: spring | summer | autumn | winter | all-season
genderStyle      "menswear" | "womenswear" | "unisex"
layersWith       array of layering pieces
pairsWellWith    array of complementary items (color-aware, occasion-aware)
styleNotes       string | null — one stylist sentence
styleVibes       array 4–8 entries (see vocabulary below)
occasionTags     array 5–10 entries (see vocabulary below)
energy           array 3–5 entries (see vocabulary below)
worksBestFor     array 3–6 FULL PHRASES (see examples below)
colorUndertone   "warm" | "cool" | "neutral"
colorSaturation  "muted" | "medium" | "bold"
pieceRole        "hero" | "anchor" | "neutral"
layerRole        "base" | "mid" | "outer" | "standalone"
fabricWeight     "light" | "medium" | "heavy"
colorPairs       array of 4-6 color names
contrastAffinity "tonal" | "contrastful" | "flexible"

━━━ THE 4 RICH METADATA FIELDS ━━━

styleVibes — the mood/aesthetic the piece projects (4–8 entries):
  minimal, clean, modern, romantic, edgy, preppy, boho, sporty, polished, quiet-luxury,
  dopamine, dark-academia, indo-fusion, coastal, y2k, office-siren, old-money, clean-girl,
  streetwear, grunge, soft, structured, flowy, sharp, cozy, breezy, tailored, deconstructed,
  elevated, timeless, refined, rugged, monochrome, effortless, contemporary, classic

occasionTags — specific real-life scenarios (5–10 entries, BE GENEROUS):
  weekend, travel, airport, road-trip, vacation, beach, college, lecture, library,
  coffee-run, errands, brunch, lunch-out, dinner-out, date-night, casual-date, first-date,
  movie-night, house-party, club, concert, festival, wedding, sangeet, mehendi, reception,
  family-gathering, family-outing, diwali, holi, eid, christmas, office, work-from-office,
  meeting, presentation, interview, conference, networking, work-from-home, lounge,
  sleepover, gym, run, yoga, hike, sports, picnic, garden-party, rooftop,
  after-work-drinks, birthday, anniversary, photo-shoot, night-out, business-meeting,
  formal-event, black-tie, luxury-dinner, celebratory-dinner

energy — the feeling the wearer projects (3–5 entries):
  effortless, comfortable, laid-back, polished, confident, sharp, romantic, playful,
  sensual, sophisticated, approachable, commanding, fresh, easy, put-together, dressy,
  professional, elegant, cool, grounded, bold, elevated, cozy, relaxed, active

worksBestFor — stylist-voice full phrases (3–6 entries):
  "daytime casual looks" | "airport layering" | "smart-casual dinners" | "Sunday brunch with friends"
  "polished office days" | "low-key date nights" | "summer beach holidays" | "winter layering anchor"
  "festive family gatherings" | "first impressions and interviews" | "relaxed weekend errands"
  "elevated street style" | "night out with friends" | "business travel" | "casual-smart fusion"

━━━ MULTI-OCCASION RULE (non-negotiable) ━━━
The SAME piece spans many occasions — don't be conservative.
  • Black slim jeans → weekend, date-night, dinner, college, travel, concert, night-out, casual-date
  • White Oxford shirt → office, interview, date-night, dinner, brunch, presentation, smart-casual
  • Cream linen co-ord → vacation, beach, brunch, garden-party, festival, summer-weekend
  • Tailored blazer → office, interview, date-night, dinner, wedding-guest, after-work-drinks
  • Plain hoodie → lounge, weekend, college, travel, airport, errands, movie-night
NEVER combine: ethnic ↔ gym/office | sportswear ↔ office/wedding/dinner | heavy embellishment ↔ office/errands

━━━ FORMALITY RULES ━━━
casual          → plain tees, hoodies, sweatshirts, casual shorts, flip-flops, joggers
smart-casual    → polo shirts, casual button-downs, chinos, loafers, clean sneakers, bombers
business-casual → Oxford/dress shirts, structured trousers, blazers, brogues
formal          → suits, tuxedos, formal kurtas, dress shoes
festive         → embroidered/embellished ethnic
athletic        → gym wear, tracksuits, running shoes, sports jerseys

━━━ OUTERWEAR RULES ━━━
Blazer        → category="Outerwear" subcategory="Blazer" formality="business-casual/formal"
                occasionTags MUST include "office"; also date-night, dinner, wedding-guest
Suit Jacket   → subcategory="Suit Jacket" formality="formal" occasions: office, wedding, dinner, interview
Tuxedo        → subcategory="Tuxedo" formality="formal" occasions: wedding, black-tie, formal-event, luxury-dinner
                NEVER: travel, sports, lounge
Bandhgala     → style="Ethnic"/"Fusion" formality="formal"/"festive"
                occasions: wedding, festive, reception, celebratory-dinner
Bomber Jacket → subcategory="Bomber Jacket" formality="casual"/"smart-casual"
                occasions: night-out, travel, weekend, streetwear
Denim Jacket  → subcategory="Denim Jacket" formality="casual"
                occasions: layering, travel, weekend, coffee-run
Cardigan      → subcategory="Cardigan" formality="smart-casual"
                occasions: office-casual, layering, relaxed-smart

━━━ ETHNIC RULES ━━━
Kurta/Lehenga/Saree/Sherwani → style="Ethnic" formality="festive"/"formal"
  occasionTags MUST include festive/wedding/family-gathering
  NEVER: office, gym, college-daily, sports
Bandhgala → style="Ethnic"/"Fusion" → wedding, festive, dinner

━━━ ATHLETIC RULE ━━━
Sportswear → formality="athletic" occasionTags: sports, gym, run, yoga ONLY. energy=["active","fresh"]

━━━ STYLING INTELLIGENCE — these 7 fields drive outfit construction (fill thoughtfully) ━━━
colorUndertone   warm (red/yellow bias: camel/cream/olive/rust) | cool (blue/green bias: navy/mint/slate) | neutral (true black/white/charcoal)
colorSaturation  muted (dusty, earthy, faded) | medium (standard tones) | bold (vivid, attention-grabbing, e.g. hot pink, electric blue)
pieceRole        hero (focal point — bold color/pattern/distinctive) | anchor (structural neutral — white tee, navy blazer) | neutral (supporting)
layerRole        base (against skin/under others: tees, fitted shirts) | mid (over base: cardigans, overshirts) | outer (over everything: coats, bombers, blazers) | standalone (dresses, jumpsuits, bottoms)
fabricWeight     light (voile, jersey, summer) | medium (standard knits, chambray, denim) | heavy (winter coats, thick wool, heavy denim)
colorPairs       4-6 SPECIFIC color names this piece harmoniously pairs with (e.g. camel coat → ["cream","white","navy","olive","rust"]). NOT garment names — only colors.
contrastAffinity tonal (looks best with muted/similar pieces) | contrastful (demands contrast to shine — bold colors, statement pieces) | flexible (works either way — most anchors)

━━━ CONSISTENCY RULE ━━━
If multiple images show similar garments: still classify independently.
Preserve nuanced differences — avoid copy-pasting identical outputs unless truly identical.

━━━ FINAL RULES ━━━
• Return ONLY the raw JSON array. No backticks, no prose.
• Every array field must be present (use [] not null if empty).
• Single-string fields: use null if truly unknown, never empty string.
• Be GENEROUS with occasionTags, styleVibes, energy, worksBestFor.
• imageIndex is required in every object.`;

export function buildBatchPrompt(n: number): string {
  return `You are classifying exactly ${n} clothing item${n > 1 ? 's' : ''}. I have provided ${n} image${n > 1 ? 's' : ''} in order.

For EACH image (1 through ${n}), classify the single garment shown.
Return a JSON ARRAY of exactly ${n} objects, one per image, in the same order.
If an image has no wearable item, set "isClothing": false for that entry (do not skip it).

Return ONLY the raw JSON array. No markdown. No prose. No code fences.

Each object in the array must follow this exact schema:
{
  "isClothing": boolean,
  "label": string,
  "category": "Tops|Bottoms|Kurta|Saree|Lehenga|Sherwani|Dupatta|Dress|Outerwear|Shoes|Accessories",
  "subcategory": string | null,
  "primaryColor": string,
  "secondaryColor": string | null,
  "pattern": string,
  "fabric": string | null,
  "fit": string | null,
  "style": "Western|Ethnic|Fusion",
  "formality": "casual|smart-casual|business-casual|formal|festive|athletic",
  "season": string[],
  "genderStyle": "menswear|womenswear|unisex",
  "layersWith": string[],
  "pairsWellWith": string[],
  "styleNotes": string | null,
  "styleVibes": string[],
  "occasionTags": string[],
  "energy": string[],
  "worksBestFor": string[],
  "colorUndertone": "warm|cool|neutral",
  "colorSaturation": "muted|medium|bold",
  "pieceRole": "hero|anchor|neutral",
  "layerRole": "base|mid|outer|standalone",
  "fabricWeight": "light|medium|heavy",
  "colorPairs": string[],
  "contrastAffinity": "tonal|contrastful|flexible"
}

Rules (apply to every image independently):
- Be GENEROUS with occasionTags (5–10 entries), styleVibes (4–8), worksBestFor (3–6 full phrases)
- Ethnic items (Kurta/Saree/Lehenga/Sherwani): style="Ethnic", NEVER office/college occasions
- Athletic/sportswear: formality="athletic", occasionTags=["gym","sports","run"] ONLY
- Blazer: category="Outerwear", occasions MUST include "office" and "date-night"
- DO NOT default formality to "casual" unless it genuinely is (tee, hoodie, shorts, jogger)`;
}
