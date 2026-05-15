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

export function buildSuggestPrompt(p: SuggestPromptParams): string {
  const occ         = OCCASION_RULES[p.theme] ?? { formality: 'smart-casual', male: 'balanced smart-casual pieces.', female: 'balanced smart-casual pieces.', avoid: 'extremes of formal or athletic' };
  const genderGuide = p.gender === 'male' ? occ.male : occ.female;

  return `You are a senior personal stylist building genuinely considered outfits.

━━━ CONTEXT ━━━
Season: ${p.season} ${p.year} | Occasion: "${p.theme}" | User: ${p.gender} | ${p.weatherContext}
${p.anchorBlock}
━━━ OCCASION BRIEF: "${p.theme}" ━━━
Target formality: ${occ.formality}
What works for ${p.gender}: ${genderGuide}
STRICTLY AVOID: ${occ.avoid}

━━━ WARDROBE ━━━
${p.wardrobeSummary}

━━━ BUILD 3 OUTFITS ━━━
ALWAYS produce exactly 3 outfits. Never return empty.
- Only use piece IDs from the wardrobe above
- Formality MUST match within each outfit
- Colors MUST harmonize
- Use "pairsWell" hints when available
- If wardrobe lacks strong matches, use closest-match pieces and set matchQuality:"closest"
${p.anchorItemId ? `- MANDATORY: ID:${p.anchorItemId} in every outfit's pieceIds` : ''}

Return ONLY valid JSON (no markdown):
{"outfits":[{"name":"Title","trendContext":"Aesthetic","pieceIds":[1,2],"pieces":["Piece A","Piece B"],"occasion":"${p.theme}","tip":"Caption max 12 words.","mood":"Feeling","matchQuality":"exact"}]}`;
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
imageIndex      integer, 0-based, matches image position
isClothing      boolean
label           string — specific descriptive name
category        one of: Tops | Bottoms | Kurta | Saree | Lehenga | Sherwani | Dupatta | Dress | Outerwear | Shoes | Accessories
subcategory     string | null (e.g. T-Shirt, Blazer, Suit Jacket, Bomber Jacket, Denim Jacket, Cardigan, Joggers…)
primaryColor    string
secondaryColor  string | null
pattern         string (solid, striped, checked, printed, embroidered…)
fabric          string | null
fit             string | null (slim, regular, relaxed, oversized, boxy…)
style           "Western" | "Ethnic" | "Fusion"
formality       "casual" | "smart-casual" | "business-casual" | "formal" | "festive" | "athletic"
season          array: spring | summer | autumn | winter | all-season
genderStyle     "menswear" | "womenswear" | "unisex"
layersWith      array of layering pieces
pairsWellWith   array of complementary items (color-aware, occasion-aware)
styleNotes      string | null — one stylist sentence
styleVibes      array 4–8 entries (see vocabulary below)
occasionTags    array 5–10 entries (see vocabulary below)
energy          array 3–5 entries (see vocabulary below)
worksBestFor    array 3–6 FULL PHRASES (see examples below)

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
  "worksBestFor": string[]
}

Rules (apply to every image independently):
- Be GENEROUS with occasionTags (5–10 entries), styleVibes (4–8), worksBestFor (3–6 full phrases)
- Ethnic items (Kurta/Saree/Lehenga/Sherwani): style="Ethnic", NEVER office/college occasions
- Athletic/sportswear: formality="athletic", occasionTags=["gym","sports","run"] ONLY
- Blazer: category="Outerwear", occasions MUST include "office" and "date-night"
- DO NOT default formality to "casual" unless it genuinely is (tee, hoodie, shorts, jogger)`;
}
