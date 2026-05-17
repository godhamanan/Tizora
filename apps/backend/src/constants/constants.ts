// ── Gemini model ───────────────────────────────────────────────────────────

export const GEMINI_MODEL = 'gemini-2.5-flash';

// ── Occasion rules (shared by suggest route + pre-filter) ──────────────────

export const OCCASION_FORMALITY_MAP: Record<string, string[]> = {
  'Casual Outing': ['casual', 'smart-casual'],
  'Date Night':    ['smart-casual', 'business-casual'],
  'Night Out':     ['smart-casual', 'business-casual'],
  'Office':        ['business-casual', 'formal', 'smart-casual'],
  'Festive':       ['festive', 'formal'],
  'Wedding':       ['festive', 'formal'],
  'Workout':       ['athletic', 'casual'],
  'Travel':        ['casual', 'smart-casual'],
};

// Legacy shape — kept for backward compat / fallback only. New code uses OCCASION_PROMPTS below.
export const OCCASION_RULES: Record<string, { formality: string; male: string; female: string; avoid: string }> = {
  'Casual Outing': { formality: 'casual',                          male: 'hoodies, oversized tees, joggers, casual shorts, clean sneakers.',               female: 'oversized knits, casual co-ords, casual dresses, sneakers.',                             avoid: 'formal, business-casual, festive' },
  'Date Night':    { formality: 'smart-casual to business-casual', male: 'fitted button-downs, dark slim jeans, chinos, chelsea boots, loafers.',          female: 'midi dresses, fitted tops with tailored trousers, wrap dresses, heels or ankle boots.', avoid: 'casual tees, hoodies, sportswear, heavy ethnic' },
  'Night Out':     { formality: 'smart-casual to party',           male: 'statement shirts, dark slim jeans, leather jackets, chelsea boots.',              female: 'bodycon or mini dresses, satin tops, sequins, heels or strappy sandals.',              avoid: 'office wear, ethnic, sportswear, hoodies' },
  'Office':        { formality: 'business-casual to formal',       male: 'Oxford/dress shirts, structured trousers, blazers, chinos, brogues. NO jeans, tees.', female: 'blazers, tailored trousers, pencil skirts, structured blouses, midi dresses.',      avoid: 'casual, party, festive, athletic, ripped jeans' },
  'Festive':       { formality: 'festive to casual',               male: 'kurtas, indo-western fusion jackets, embroidered shirts, mojris.',                female: 'lehengas, salwar suits, anarkalis, indo-western fusion dresses, jhumkas.',             avoid: 'plain western office wear, sportswear, loungewear' },
  'Wedding':       { formality: 'formal to festive',               male: 'sherwanis, bandhgalas, jodhpuris, formal suits, heavily embroidered kurtas.',     female: 'sarees, lehengas, heavily embellished salwar suits, anarkalis.',                      avoid: 'casual western, sportswear, loungewear, plain tees' },
  'Workout':       { formality: 'athletic',                        male: 'performance tees, athletic shorts, joggers, sweatpants, hoodies, training shoes.', female: 'sports bras, leggings, athletic shorts, cropped hoodies, trainers.',                 avoid: 'formal wear, leather, dress shoes, tailored trousers' },
  'Travel':        { formality: 'casual to smart-casual',          male: 'joggers, comfortable chinos, casual shirts, hoodies, clean sneakers.',            female: 'comfortable trousers, casual dresses, hoodies, sneakers.',                           avoid: 'formal, heels, heavy ethnic, anything restrictive' },
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
  // 2025-26 aesthetic anchor — gives Gemini a real cultural reference
  inspirationReference: string;
  styleDirection: string[];
  archetypes: Archetype[];
  // Concrete outfit examples: 3-5 GOOD and 2-3 BAD per occasion. The bad ones
  // are stronger teachers than the good ones — they prevent specific failure modes.
  goodExamples: string[];
  badExamples: string[];
  rules: string[];
  preferredColors: string[];
  // Acceptable footwear categories — keeps Gemini from suggesting chelsea boots for vacation
  footwear: string[];
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

  // ─── OFFICE ────────────────────────────────────────────────────────────────
  'Office': {
    goal: 'Quietly professional. Refined and intentional. Polish from fit + fabric, never from color or layering.',
    inspirationReference: 'Modern startup founder, not corporate lawyer. Quiet luxury — The Row, Sunspel, Cos, Loro Piana. NOT 2018 corporate or Wall Street.',
    styleDirection: ['tonal dressing', 'soft tailoring', 'understated confidence', 'fit + fabric over loudness', 'modern smart-casual'],
    archetypes: [
      { name: 'Classic Shirt',        composition: ['button-down OR oxford shirt (formality smart-casual / business-casual)', 'chinos OR tailored trousers', 'leather loafers OR clean white leather sneakers'] },
      { name: 'Smart Casual Knit',    composition: ['fine knit polo OR merino crewneck (NOT chunky)', 'tailored trousers OR dark chinos', 'leather loafers'] },
      { name: 'Soft Tailoring',       composition: ['unstructured blazer', 'clean tee OR fine button-down', 'tailored trousers'] },
      { name: 'Elevated Knit Layer',  composition: ['fine cardigan OR overshirt', 'button-down inside', 'chinos OR tailored trousers'] },
    ],
    goodExamples: [
      'Cream merino crewneck + navy chinos + brown leather loafers',
      'Light blue oxford + olive chinos + white leather sneakers',
      'Charcoal cashmere knit + black tailored trousers + black chelsea boots',
      'Unstructured navy blazer + white tee + cream chinos + tan loafers',
    ],
    badExamples: [
      'Hot pink shirt + black jeans — saturation too loud for office',
      'Graphic tee + cargos — no business signal, reads as weekend',
      'Suit jacket + tee + ripped jeans — formality clash',
      'Hoodie + chinos — sportswear breaks the polish',
    ],
    rules: [
      '2–3 pieces MAX (excluding footwear). Office wins through restraint.',
      'ZERO bold-saturation pieces. No electric, hot, vivid colors of any kind.',
      'NEVER: hoodies, sweatshirts, graphic tees, cargos, ripped denim, athletic wear, logo sneakers',
      'If wardrobe has a button-down with business-casual or formal formality, USE IT as the anchor — do not default to a tee',
      'Maximum 1 outer layer (blazer OR cardigan, never both)',
      'Maximum 1 pattern across the whole outfit',
    ],
    preferredColors: ['navy', 'charcoal', 'white', 'cream', 'light blue', 'olive', 'beige', 'gray', 'black', 'taupe', 'soft brown'],
    footwear: ['leather loafers', 'derbies', 'chelsea boots', 'clean white leather sneakers'],
    avoid: ['athletic wear', 'graphic tees', 'cargo pants', 'ripped denim', 'logo sneakers', 'chunky soled sneakers'],
    silhouetteGuidance: ['structured top + clean lower half', 'avoid oversized-on-oversized'],
    outfitsShouldFeel: ['refined', 'quietly stylish', 'effortless professional', 'composed', 'confident without trying'],
    layerCount: { min: 2, max: 3 },
    templates: ['Classic Shirt', 'Smart Casual Knit', 'Soft Tailoring', 'Elevated Knit Layer'],
    female: {
      inspirationReference: 'Modern creative director — Phoebe Philo, Khaite, Toteme. Tailored but soft. Never costumey-corporate.',
      archetypes: [
        { name: 'Tailored Shirt', composition: ['silk blouse OR fine shirt', 'tailored trousers OR pencil skirt', 'leather loafers OR block heels'] },
        { name: 'Soft Tailoring', composition: ['unstructured blazer', 'clean tee OR blouse', 'tailored trousers'] },
        { name: 'Polished Knit',  composition: ['fine knit top', 'midi skirt OR tailored trousers', 'loafers OR ankle boots'] },
        { name: 'Sheath Dress',   composition: ['knee-length sheath OR midi dress', 'low pumps OR loafers'] },
      ],
      goodExamples: [
        'Cream silk blouse + tailored navy trousers + black loafers',
        'Black fine merino + camel midi skirt + ankle boots',
      ],
      templates: ['Tailored Shirt', 'Soft Tailoring', 'Polished Knit', 'Sheath Dress'],
    },
  },

  // ─── DATE NIGHT ────────────────────────────────────────────────────────────
  'Date Night': {
    goal: 'Intentional, attractive, layered, confident. Considered but never trying too hard.',
    inspirationReference: 'A24 protagonist on a Friday night. Pattinson on a coffee run before a wine bar. Tonal, slightly textured, slightly cinematic. NOT corporate, NOT loud-streetwear.',
    styleDirection: ['elevated casual', 'intentional layering', 'dark palettes', 'one focal piece', 'subtle statement energy'],
    archetypes: [
      { name: 'Open Shirt Layer', composition: ['button-down/overshirt worn UNBUTTONED OPEN (focal piece)', 'tee OR tank OR henley as inner ONLY — never another button-down', 'dark jeans OR any available trousers', 'clean white sneakers OR chelsea boots'] },
      { name: 'Bomber & Tee',     composition: ['bomber OR jacket (Outerwear)', 'fitted clean tee OR henley inside', 'any available jeans/trousers', 'chelsea boots OR clean sneakers'] },
      { name: 'Elevated Knit',    composition: ['fine knit crewneck OR sweater OR collared shirt (worn closed, tucked)', 'any available trousers OR jeans', 'chelsea boots OR loafers'] },
      { name: 'Monochrome Minimal',composition: ['any clean dark-toned top (tee, knit, or slim shirt)', 'any available dark trousers or jeans', 'sleek footwear'] },
    ],
    goodExamples: [
      'Cream button-down (worn open) + black fitted tee + dark navy jeans + clean white sneakers',
      'Black bomber + white tee + black slim jeans + black chelsea boots',
      'Charcoal cashmere crewneck + black tailored trousers + brown chelsea boots',
      'Black henley + dark indigo jeans + black boots',
    ],
    badExamples: [
      'Button-down + chinos + loafers — reads as office, not date',
      'Hoodie + shorts — no intention, no effort',
      'Graphic tee + cargos — wrong tone, too casual-streetwear',
      'Polo + dad jeans — corporate-weekend energy, not romantic',
      'TWO button-down shirts worn together — not a real layer, just two collars',
      'Open shirt with ANOTHER open shirt as inner — inner must be a tee/tank/henley only',
    ],
    rules: [
      'EVERY outfit MUST have ≥1 top AND ≥1 bottom — a 1-piece outfit is NEVER acceptable.',
      '2–3 pieces (don\'t over-layer). If wardrobe is limited, build 2-piece combos.',
      'ONE focal point: the open shirt (worn unbuttoned) OR bomber OR knit. Never two statement pieces.',
      'Bottoms: dark jeans/trousers preferred. If unavailable, use ANY available bottom — an imperfect bottom beats no bottom.',
      'Open shirt layer: button-down WORN OPEN over any clean inner top — tee is ideal, but any fitted shirt works as the inner if no tee exists.',
      'AVOID corporate energy — button-down + chinos + loafers = office, not date.',
      'AVOID hoodies and graphic tees as the outer/visible layer.',
    ],
    preferredColors: ['black', 'charcoal', 'navy', 'deep brown', 'olive', 'cream as accent', 'dusty earth tones'],
    footwear: ['clean white leather sneakers', 'chelsea boots', 'loafers', 'minimal black boots'],
    avoid: ['bright loud colors as background', 'sportswear', 'hoodies as outer layer', 'cargo bottoms', 'pastel button-downs'],
    silhouetteGuidance: ['balance structured (jacket, shirt) + relaxed (tee, fitted jeans)', 'never bulky', 'never sloppy'],
    outfitsShouldFeel: ['confident', 'attractive', 'cinematic', 'considered', 'effortless'],
    layerCount: { min: 2, max: 3 },
    templates: ['Open Shirt Layer', 'Bomber & Tee', 'Elevated Knit', 'Monochrome Minimal'],
    female: {
      inspirationReference: 'Hailey Bieber off-duty dinner. Mary-Kate Olsen at a wine bar. Tonal, textured, one elevated piece.',
      archetypes: [
        { name: 'Slip & Layer',     composition: ['silk slip top OR camisole', 'tailored trousers OR midi skirt', 'heels OR ankle boots'] },
        { name: 'Knit & Skirt',     composition: ['fitted fine knit', 'leather OR midi skirt', 'boots OR heels'] },
        { name: 'Midi Dress',       composition: ['fitted midi dress (dark or neutral)', 'heels OR ankle boots'] },
        { name: 'Elevated Casual',  composition: ['fitted top OR fine knit', 'tailored trousers OR dark jeans', 'sleek footwear'] },
      ],
      goodExamples: [
        'Black silk slip + tailored cream trousers + black mules',
        'Cream knit + leather midi skirt + ankle boots',
      ],
      templates: ['Slip & Layer', 'Knit & Skirt', 'Midi Dress', 'Elevated Casual'],
    },
  },

  // ─── NIGHT OUT ─────────────────────────────────────────────────────────────
  'Night Out': {
    goal: 'Bold, energetic, fashion-forward. Late dinner into a low-lit bar.',
    inspirationReference: 'Friday late dinner into a club afterparty. The Weeknd at a private studio. Tarantino late-90s LA. Dark, textured, statement.',
    styleDirection: ['elevated streetwear', 'dark palettes', 'sharper contrasts', 'fashion-forward layering', 'statement energy'],
    archetypes: [
      { name: 'Statement Outerwear', composition: ['bold jacket / bomber / leather (the focal point)', 'clean inner tee OR fitted top', 'dark jeans OR slim trousers', 'statement footwear'] },
      { name: 'Layered Streetwear',  composition: ['open overshirt OR flannel (statement)', 'inner clean tee', 'cargos OR dark denim', 'sneakers OR boots'] },
      { name: 'Monochrome Dark',     composition: ['dark-on-dark layered top', 'dark slim trousers', 'statement footwear'] },
    ],
    goodExamples: [
      'Dark green corduroy jacket + black tee + black slim jeans + black boots',
      'Black leather jacket + white tee + black denim + chunky-sole boots',
      'Open dark flannel + black tee + black cargos + black sneakers',
    ],
    badExamples: [
      'Office shirt + chinos + loafers — too tame, no energy',
      'Pastel button-down + light jeans — too soft, reads brunch not bar',
      'Sandals or beach footwear — wrong context',
      'Khakis + polo — golf club energy',
    ],
    rules: [
      '2–3 non-footwear pieces',
      'ONE statement piece — usually outerwear or footwear. Never both.',
      'Dark bottoms strongly preferred',
      'AVOID office energy (chinos + button-down + loafers is forbidden)',
      'AVOID pastel-only palettes',
    ],
    preferredColors: ['black', 'charcoal', 'deep burgundy', 'olive', 'rust', 'cream as accent only'],
    footwear: ['black chelsea boots', 'chunky-sole boots', 'leather sneakers', 'minimal black sneakers'],
    avoid: ['sandals', 'office loafers as the only footwear', 'pastel palettes', 'beachwear'],
    silhouetteGuidance: ['layered but not bulky', 'one structured + one relaxed piece'],
    outfitsShouldFeel: ['edgy', 'confident', 'nightlife-ready', 'stylish without trying too hard'],
    layerCount: { min: 2, max: 3 },
    templates: ['Statement Outerwear', 'Layered Streetwear', 'Monochrome Dark'],
    female: {
      inspirationReference: 'Bella Hadid post-dinner. Off-duty Kardashian. Slim, dark, statement footwear or bag.',
      archetypes: [
        { name: 'Mini & Boots',      composition: ['mini dress OR fitted top + skirt', 'knee-high OR ankle boots'] },
        { name: 'Statement Top',     composition: ['satin OR sequin top', 'dark trousers OR slim skirt', 'heels'] },
        { name: 'Leather & Slim',    composition: ['leather jacket', 'fitted dark top', 'slim trousers OR skirt', 'boots OR heels'] },
      ],
      templates: ['Mini & Boots', 'Statement Top', 'Leather & Slim'],
    },
  },

  // ─── CASUAL OUTING ─────────────────────────────────────────────────────────
  'Casual Outing': {
    goal: 'Relaxed, effortless, naturally stylish. Comfortable without trying.',
    inspirationReference: 'Sunday brunch followed by a flea market. Aimé Leon Dore. Sunday Best. Casual but quietly considered — never sloppy, never office.',
    styleDirection: ['clean casual', 'modern basics', 'easy layering', 'low effort, high taste'],
    archetypes: [
      { name: 'Easy Casual',     composition: ['tee OR fine knit', 'jeans OR chinos', 'clean sneakers'] },
      { name: 'Hoodie & Pants',  composition: ['hoodie OR sweatshirt', 'relaxed jeans OR joggers', 'sneakers'] },
      { name: 'Elevated Easy',   composition: ['fine knit OR casual shirt', 'chinos OR dark jeans', 'clean sneakers OR boots'] },
    ],
    goodExamples: [
      'Cream fitted tee + dark indigo jeans + white sneakers',
      'Olive hoodie + black sweatpants + white sneakers',
      'Light knit polo + cream chinos + brown loafers',
      'Black tee + olive chinos + canvas sneakers',
    ],
    badExamples: [
      'Button-down + tailored trousers + leather loafers — too office for Sunday',
      'Suit jacket + jeans — formality clash, reads costume',
      'Festive ethnic kurta + sneakers — wrong context',
    ],
    rules: [
      '2–3 pieces',
      'Comfort prioritized — relaxed fits, never skin-tight',
      'NO business-casual / formal pieces. NO ties, dress shirts, blazers (unless casual-styled)',
      'Maximum 1 pattern',
    ],
    preferredColors: ['cream', 'olive', 'navy', 'gray', 'white', 'tan', 'rust', 'denim-blue', 'soft brown'],
    footwear: ['clean white sneakers', 'canvas sneakers', 'casual loafers', 'low-top boots'],
    avoid: ['dress shirts (unless very casual)', 'ties', 'formal pieces', 'heels'],
    outfitsShouldFeel: ['approachable', 'relaxed', 'stylish naturally', 'low-effort high-taste'],
    layerCount: { min: 2, max: 3 },
    templates: ['Easy Casual', 'Hoodie & Pants', 'Elevated Easy'],
  },

  // ─── TRAVEL ────────────────────────────────────────────────────────────────
  'Travel': {
    goal: 'Comfortable, wrinkle-resistant, airport-aesthetic. Put together with zero effort.',
    inspirationReference: 'JFK at 6am. Hailey Bieber airport pulls. Comfortable but considered — looks like you barely tried but did.',
    styleDirection: ['comfort first', 'soft fabrics', 'easy layering', 'airport-aesthetic'],
    archetypes: [
      { name: 'Hoodie & Sweats',   composition: ['hoodie OR zip-up', 'joggers OR sweatpants', 'clean sneakers'] },
      { name: 'Tee & Relaxed',     composition: ['plain tee OR fine knit', 'relaxed chinos OR cargos', 'clean sneakers'] },
      { name: 'Soft Layered',      composition: ['lightweight zip-up OR cardigan', 'tee OR fine knit', 'sweatpants OR relaxed pants', 'clean sneakers'] },
    ],
    goodExamples: [
      'Gray hoodie + black joggers + white sneakers',
      'Cream tee + olive cargos + white sneakers',
      'Black fine knit + gray sweatpants + slip-on sneakers',
    ],
    badExamples: [
      'Button-down + tailored trousers + dress shoes — too restrictive for 4-hour seated travel',
      'Leather bomber + turtleneck + cargos — wrong climate (assume mild), too heavy',
      'Tank top + shorts — looks underdressed in airport',
      'Suit jacket + tee + jeans — formality clash',
    ],
    rules: [
      '2–3 pieces. Maximum 1 outer layer (light cardigan / zip-up only — NEVER heavy bomber or leather)',
      'NEVER: leather jackets, heavy bombers, turtlenecks paired with other tops, suit jackets, dress shoes',
      'Athleisure ENCOURAGED (joggers, hoodies, sweats)',
      'Footwear must be slip-on-friendly (security checkpoint test)',
    ],
    preferredColors: ['gray', 'black', 'navy', 'olive', 'cream', 'tan', 'charcoal'],
    footwear: ['clean white sneakers', 'slip-on sneakers', 'casual sneakers'],
    avoid: ['leather jackets', 'heavy bombers', 'dress shoes', 'restrictive trousers', 'turtlenecks (in temperate travel)'],
    outfitsShouldFeel: ['comfortable', 'put together', 'effortless', 'travel-ready'],
    layerCount: { min: 2, max: 3 },
    templates: ['Hoodie & Sweats', 'Tee & Relaxed', 'Soft Layered'],
  },

  // ─── WORKOUT ───────────────────────────────────────────────────────────────
  'Workout': {
    goal: 'Performance-ready. Clean athletic or elevated athleisure. Functional and sharp.',
    inspirationReference: 'Gymshark athlete. Nike x Fear of God campaign. Lululemon men\'s ABC pant. Clean, technical, never sloppy — gym-ready but styled.',
    styleDirection: ['performance-first', 'clean athletic', 'elevated athleisure', 'functional layering'],
    archetypes: [
      { name: 'Classic Athletic',    composition: ['performance tee OR fitted tank', 'athletic shorts OR slim joggers', 'athletic sneakers / trainers'] },
      { name: 'Athleisure Layer',    composition: ['zip-up hoodie OR lightweight athletic jacket', 'fitted performance tee inside', 'slim joggers OR sweatpants', 'training sneakers'] },
      { name: 'Elevated Athleisure', composition: ['clean hoodie OR sweatshirt', 'slim joggers OR athletic shorts', 'clean white trainers'] },
    ],
    goodExamples: [
      'Black performance tee + black slim joggers + white athletic sneakers',
      'Gray zip-up hoodie + white fitted tee + black athletic shorts + training shoes',
      'Navy hoodie + black slim sweatpants + white clean trainers',
      'Charcoal sweatshirt + olive joggers + clean white sneakers',
    ],
    badExamples: [
      'Button-down + chinos + loafers — office wear, completely wrong for gym',
      'Heavy leather jacket + jeans — restrictive, zero athletic function',
      'Formal trousers + tee — formality clash, no athletic context',
      'Chelsea boots + joggers — footwear completely mismatched',
    ],
    rules: [
      '2–3 pieces. Performance and comfort ABOVE all else.',
      'ONLY athletic-formality pieces: tees, tanks, hoodies, joggers, shorts, sweatpants, zip-ups',
      'NEVER: button-downs, tailored trousers, leather jackets, blazers, dress shoes',
      'Fabrics: moisture-wicking, stretch, jersey, fleece — the clothing must move with the body',
      'If wardrobe lacks athletic pieces, use the most casual items available with matchQuality:"closest"',
    ],
    preferredColors: ['black', 'white', 'gray', 'navy', 'charcoal', 'olive', 'slate', 'cream'],
    footwear: ['athletic sneakers', 'training shoes', 'running shoes', 'clean white trainers'],
    avoid: ['leather shoes', 'dress shoes', 'formal wear', 'heavy outerwear', 'tailored pieces'],
    outfitsShouldFeel: ['athletic', 'clean', 'functional', 'energized', 'put-together'],
    layerCount: { min: 2, max: 3 },
    templates: ['Classic Athletic', 'Athleisure Layer', 'Elevated Athleisure'],
    female: {
      inspirationReference: 'Lululemon women\'s campaign. Gymshark female athlete. Alo Yoga. Clean and athletic, confidently functional.',
      archetypes: [
        { name: 'Classic Athletic',    composition: ['sports bra OR fitted athletic tank', 'leggings OR athletic shorts', 'athletic sneakers'] },
        { name: 'Athleisure Casual',   composition: ['cropped hoodie OR zip-up sweatshirt', 'high-waist leggings OR joggers', 'clean trainers'] },
        { name: 'Elevated Athleisure', composition: ['matching athletic set OR co-ord (sports bra + leggings)', 'light jacket optional', 'clean trainers'] },
      ],
      goodExamples: [
        'Black sports bra + black high-waist leggings + white trainers',
        'Lilac cropped hoodie + black leggings + white clean sneakers',
      ],
      templates: ['Classic Athletic', 'Athleisure Casual', 'Elevated Athleisure'],
    },
  },

  // ─── FESTIVE ───────────────────────────────────────────────────────────────
  'Festive': {
    goal: 'Celebratory and expressive. Cultural reference if wardrobe is Ethnic-leaning; else clean Western festive energy.',
    inspirationReference: 'Diwali rooftop / Holi morning if Ethnic. Coachella afternoon / Sangeet rooftop / music festival if Western. Always expressive — never office, never gym.',
    styleDirection: ['celebratory', 'expressive', 'rich textures', 'culturally grounded', 'one expressive focal piece'],
    archetypes: [
      { name: 'Kurta & Bottom',    composition: ['kurta (preferably embroidered or rich-tone)', 'churidar OR pants OR dark jeans', 'mojris OR clean sneakers'] },
      { name: 'Fusion Layered',    composition: ['fusion overshirt OR short kurta', 'tee inside', 'jeans OR trousers', 'sneakers OR mojris'] },
      { name: 'Statement Western', composition: ['statement printed / embroidered / silk shirt (the focal piece)', 'dark trousers OR dark jeans', 'clean leather footwear'] },
      { name: 'Elevated Casual',   composition: ['rich-tone knit OR linen shirt', 'dark trousers', 'boots OR loafers'] },
    ],
    goodExamples: [
      'Cream embroidered kurta + dark jeans + tan mojris',
      'Black short kurta over tee + dark trousers + white sneakers',
      'Rust printed silk shirt + black trousers + brown chelsea boots',
      'Maroon linen shirt + cream trousers + tan loafers',
    ],
    badExamples: [
      'Plain office button-down + chinos — no festive energy, reads boardroom',
      'Hoodie + sweatpants — far too casual for celebration',
      'Suit + tie — formal-corporate, not festive-expressive',
      'Athletic tee + joggers — gym energy, completely wrong context',
    ],
    rules: [
      '2–4 pieces',
      'STRONGLY prefer Ethnic archetypes if wardrobe has Ethnic pieces (kurta, sherwani, etc.)',
      'If wardrobe is purely Western: pivot to "Statement Western" — printed/silk/rich-tone shirts + dark bottoms',
      'AVOID plain western office shirts, sportswear, loungewear, athletic wear',
      'Rich tones + textures (silk, linen, embroidery) encouraged',
      'ONE expressive focal piece per outfit — never two competing statements',
    ],
    preferredColors: ['cream', 'maroon', 'gold-accent', 'navy', 'olive', 'rust', 'deep green', 'mustard', 'burgundy'],
    footwear: ['mojris', 'clean leather loafers', 'chelsea boots', 'clean white sneakers'],
    avoid: ['plain white office shirts', 'athletic wear', 'hoodies', 'sweatpants', 'flip-flops', 'distressed denim'],
    silhouetteGuidance: ['expressive top + clean bottom', 'never bulky-on-bulky', 'let the hero piece breathe'],
    outfitsShouldFeel: ['celebratory', 'expressive', 'culturally grounded', 'memorable'],
    layerCount: { min: 2, max: 4 },
    templates: ['Kurta & Bottom', 'Fusion Layered', 'Statement Western', 'Elevated Casual'],
    female: {
      inspirationReference: 'Sangeet rooftop, Holi morning, Diwali night. Embellished but never costumey.',
      archetypes: [
        { name: 'Lehenga / Saree', composition: ['lehenga OR saree', 'optional dupatta', 'jhumkas + heels OR mojris'] },
        { name: 'Anarkali / Suit', composition: ['anarkali OR salwar-suit', 'dupatta', 'mojris OR heels'] },
        { name: 'Fusion Set',      composition: ['kurta OR fusion top', 'palazzo OR jeans', 'sandals OR mojris'] },
      ],
      templates: ['Lehenga / Saree', 'Anarkali / Suit', 'Fusion Set'],
    },
  },

  // ─── WEDDING ───────────────────────────────────────────────────────────────
  'Wedding': {
    goal: 'Elevated formal presence. Camera-ready. Cultural reference dictates form.',
    inspirationReference: 'Sabyasachi groom\'s lehenga ceremony if Ethnic. Tom Ford black-tie if Western. Always formal-luxury textures.',
    styleDirection: ['elevated formal', 'luxury textures', 'culturally aware', 'camera-ready'],
    archetypes: [
      { name: 'Sherwani / Bandhgala', composition: ['sherwani OR bandhgala', 'churidar OR formal trousers', 'mojris OR formal leather shoes'] },
      { name: 'Formal Kurta Layered', composition: ['heavy embellished kurta', 'churidar OR formal pants', 'optional waistcoat / Nehru jacket', 'mojris'] },
      { name: 'Western Suit',         composition: ['suit jacket + matching trousers', 'dress shirt', 'optional tie / pocket square', 'leather oxford OR derby shoes'] },
      { name: 'Indo-Western',         composition: ['fusion jacket OR bandhgala', 'tailored trousers', 'leather shoes OR mojris'] },
    ],
    goodExamples: [
      'Cream sherwani + matching churidar + tan mojris',
      'Black suit jacket + matching trousers + white dress shirt + black tie + black oxfords',
      'Maroon bandhgala + black tailored trousers + black mojris',
    ],
    badExamples: [
      'Hoodie + jeans — completely inappropriate',
      'Casual tee + chinos — too informal for wedding camera moments',
      'Sportswear of any kind',
    ],
    rules: [
      '3–4 pieces — formal layering EXPECTED',
      'STRONGLY prefer Ethnic archetypes if wardrobe has Ethnic pieces',
      'NEVER: hoodies, sportswear, casual basics, denim, sneakers',
      'Camera test: would this look elevated in family photos?',
    ],
    preferredColors: ['cream', 'maroon', 'gold', 'navy', 'champagne', 'deep green', 'black', 'charcoal'],
    footwear: ['mojris', 'leather oxford / derby shoes', 'formal leather loafers'],
    avoid: ['denim', 'sneakers', 'casual tees', 'hoodies'],
    outfitsShouldFeel: ['elevated', 'formal', 'present', 'camera-ready'],
    layerCount: { min: 3, max: 4 },
    templates: ['Sherwani / Bandhgala', 'Formal Kurta Layered', 'Western Suit', 'Indo-Western'],
    female: {
      inspirationReference: 'Sabyasachi bride or wedding guest. Manish Malhotra. Embellished, never plain.',
      archetypes: [
        { name: 'Heavy Lehenga',     composition: ['heavily embellished lehenga', 'dupatta', 'jhumkas + heels'] },
        { name: 'Saree',             composition: ['silk OR embellished saree', 'matching blouse', 'heels OR mojris'] },
        { name: 'Anarkali',          composition: ['heavy anarkali', 'dupatta', 'heels OR mojris'] },
        { name: 'Indo-Western Gown', composition: ['fusion gown OR floor-length set', 'heels'] },
      ],
      templates: ['Heavy Lehenga', 'Saree', 'Anarkali', 'Indo-Western Gown'],
    },
  },
};

// Map any unknown theme to a sensible default
export function getOccasionPrompt(theme: string): OccasionPrompt {
  return OCCASION_PROMPTS[theme] ?? OCCASION_PROMPTS['Casual Outing'];
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
  const footwearList    = occ.footwear.join(', ');
  const avoidLine       = occ.avoid?.length ? `\n\nAVOID:\n${occ.avoid.map(s => `• ${s}`).join('\n')}` : '';
  const silhouette      = occ.silhouetteGuidance?.length ? `\n\nSilhouette guidance:\n${occ.silhouetteGuidance.map(s => `• ${s}`).join('\n')}` : '';
  const feels           = occ.outfitsShouldFeel.join(', ');
  const templateList    = occ.templates.map(t => `"${t}"`).join(' | ');
  const goodExamples    = occ.goodExamples.map(s => `  ✓ ${s}`).join('\n');
  const badExamples     = occ.badExamples.map(s => `  ✗ ${s}`).join('\n');

  return `You are a senior personal stylist with 2025–26 sensibility. You think like a human stylist — not a fashion algorithm. You compose INTENTIONAL outfits, never random piles of clothes. Every outfit has a clear archetype, ONE focal point, and a coherent palette. You believe restraint is a stylist's mark: a clean 2-piece outfit always beats a cluttered 4-piece reach.

━━━ CONTEXT ━━━
Season: ${p.season} ${p.year} | Occasion: "${p.theme}" | User: ${p.gender} | ${p.weatherContext}
${p.anchorBlock}
━━━ STYLING SYSTEM — "${p.theme}" ━━━

GOAL: ${occ.goal}

REFERENCE: ${occ.inspirationReference}

Style direction:
${styleDirection}

Allowed archetypes — pick a DIFFERENT one for each of the 3 outfits:

${archetypes}

✓ EXAMPLES of OUTFITS THAT WORK for this occasion:
${goodExamples}

✗ EXAMPLES of OUTFITS THAT FAIL (NEVER produce anything like these):
${badExamples}

Rules:
${rules}
• Layer count: ${occ.layerCount.min}–${occ.layerCount.max} pieces (EXCLUDING footwear)
• Footwear: ${footwearList}

Preferred palette: ${preferredColors}${avoidLine}${silhouette}

Outfits should feel: ${feels}

━━━ WARDROBE ━━━
${p.wardrobeSummary}

━━━ HOW TO COMPOSE — think before output ━━━

For EACH outfit, internally answer in order:
  1. WHAT'S THE HERO? Pick ONE focal piece first — either a [HERO]-tagged piece, an outerwear with character, or the most thematically-strong item in the wardrobe.
  2. WHAT BUILDS AROUND IT? Add ONLY pieces that support the hero — neutrals, complementary colors, balancing silhouettes.
  3. CAN I REMOVE A PIECE? If yes, remove it. Stop at ${occ.layerCount.min}–${occ.layerCount.max} pieces.
  4. WOULD A STYLIST PHOTOGRAPH THIS? If the outfit feels random, generic, or like inventory — rebuild.

━━━ STRICT REQUIREMENTS ━━━

🚨 MINIMUM OUTFIT RULE: Every outfit MUST contain ≥1 top (or dress) AND ≥1 bottom. A 1-piece outfit is NEVER acceptable — if no ideal bottom exists, use ANY available bottom and set matchQuality:"closest".
🚨 LAYER CAP: Max ${occ.layerCount.max} non-footwear pieces. Target ${occ.layerCount.min}–${occ.layerCount.max}. If wardrobe is limited, prioritise complete 2-piece combos (focal top + any bottom) over leaving slots empty.

1. Each of the 3 outfits MUST use a DIFFERENT archetype: ${templateList}
2. The HERO PIECE must be different across all 3 outfits (no reusing the same anchor with swapped layers).
3. Each outfit must have EXACTLY ONE statement / focal piece — never two competing statements.
4. EXACTLY 1 bottom per outfit. EXACTLY 1 outer-layer max. Maximum 1 pattern across the outfit.
5. Formality consistent within an outfit. Never mix athletic with business-casual or formal.
6. Footwear must match the occasion (see Footwear list above).
7. ONLY use piece IDs from the wardrobe above. Never invent IDs.
8. Set "template" to the archetype name you used.
9. If a needed slot is missing from the wardrobe, gracefully use the closest available piece AND set matchQuality:"closest".
${p.anchorItemId ? `10. MANDATORY: piece ID:${p.anchorItemId} must appear in EVERY outfit's pieceIds.` : ''}

━━━ TIP VOICE — stylist, not Pinterest caption ━━━
These tips are how a real friend-stylist would speak. Short. Confident. Specific.
Examples:
  • "The bomber does the talking — let everything else whisper."
  • "Cuff the sleeves once. Untuck halfway. That's the whole thing."
  • "Leave the shirt open. It changes the entire outfit."
  • "Tonal browns + cream tee — heavy reads considered."
  • "Polish from fabric, not from color."
  • "Black on black with one texture shift — that's the move."
  • "Roll the cuff. Don't roll the hem. Trust me."
  • "One statement only — the rest stays quiet."
  • "Loose top, slim bottom. Or vice versa. Never both loose."
NEVER: "perfect for", "ideal for", "this outfit is great for" — that's marketing copy, not styling advice.

━━━ OUTPUT JSON (no markdown, no prose, no commentary before/after) ━━━
{"outfits":[{
  "name":"Short evocative title (2-4 words)",
  "template":"${occ.templates[0]}",
  "trendContext":"One-line aesthetic context",
  "pieceIds":[1,2,3],
  "pieces":["Piece A","Piece B","Piece C"],
  "heroPieceId":1,
  "stylingNotes":[{"pieceId":1,"note":"leave open"}],
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
  "occasionTags": ["casual-outing", "travel", "college", "brunch", "coffee-run", "errands", "movie-night"],
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
  Vocabulary includes (combine freely): casual-outing, travel, airport, road-trip, beach,
    college, lecture, library, coffee-run, errands, brunch, lunch-out, dinner-out, date-night,
    casual-date, first-date, movie-night, house-party, club, concert, festive, wedding,
    sangeet, mehendi, reception, family-gathering, family-outing, diwali, holi, eid, christmas,
    office, work-from-office, meeting, presentation, interview, conference, networking,
    work-from-home, lounge, sleepover, workout, gym, run, yoga, hike, sports, picnic, garden-party,
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
  • Black slim jeans → casual-outing, date-night, dinner, college, travel, concert, night-out
  • White Oxford shirt → office, interview, date-night, dinner, smart-casual, brunch, presentation
  • Cream linen co-ord → casual-outing, beach, brunch, garden-party, festive, travel
  • Tailored blazer → office, interview, date-night, dinner, wedding-guest, after-work-drinks
  • Plain hoodie → lounge, casual-outing, college, travel, airport, errands, movie-night

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
Sportswear: formality="athletic". Energy = ["active","fresh"].
  occasionTags MUST be: "workout" + "gym" (always), PLUS "travel" if light/breathable.
  NEVER: office, wedding, date-night, dinner, festive.

━━━ STRICT CLASSIFICATION CHECKS ━━━
1. Button-down/Oxford → formality smart-casual or business-casual, MUST include "office" in occasions
2. Kurta/Lehenga/Saree/Sherwani → style "Ethnic", MUST include "festive" or "wedding", NEVER office
3. Athletic / Gym wear → formality "athletic", MUST include "workout" AND "gym", NEVER office/wedding/date-night
4. Never assign "office" to ethnic or athletic wear
5. Never assign "festive"/"wedding" to t-shirts or basic Western casual
6. Blazer → MUST include "office" in occasions
7. Bandhgala → "wedding"/"festive"/"dinner"/"reception", NEVER "office"/"workout"
8. Joggers / Sweatpants / Track pants → MUST include "workout" + "casual-outing" + "travel", NEVER "office" or "date-night"
9. Hoodie / Sweatshirt → MUST include "casual-outing" + "travel"; also "workout" if athletic-fabric

━━━ FIELD VOCABULARY ━━━
category: Tops | Bottoms | Kurta | Saree | Lehenga | Sherwani | Dupatta | Dress | Outerwear | Shoes | Accessories
  Tops subcategories: T-Shirt | Polo | Henley | Button-Down | Oxford | Dress Shirt | Tank | Tunic | Crop Top | Bodysuit | Blouse | Sweater | Knit | Hoodie | Sweatshirt | Turtleneck | Mock-Neck
  Bottoms subcategories: Jeans | Chinos | Trousers | Cargo Pants | Joggers | Sweatpants | Shorts | Cargo Shorts | Skirt | Pencil Skirt | Midi Skirt | Mini Skirt
  Outerwear subcategories: Blazer | Suit Jacket | Tuxedo | Bandhgala | Bomber Jacket | Denim Jacket | Leather Jacket | Suede Jacket | Trench Coat | Overcoat | Parka | Cardigan | Overshirt | Vest
  Shoes subcategories: Sneakers (White Leather / Athletic / Canvas / Chunky-Sole) | Loafers | Chelsea Boots | Derby / Oxford Shoes | Sandals | Slip-On | Mules | Heels | Ankle Boots | Knee-High Boots | Mojris
season values: spring | summer | autumn | winter | all-season  (use array, can have multiple)
genderStyle: menswear | womenswear | unisex

━━━ OCCASION TAGGING — HARD RULES (these directly drive outfit suggestions) ━━━

The "occasionTags" field MUST use these EXACT keys (these match the styling system, no synonyms):
casual-outing | travel | workout | office | date-night | night-out | festive | wedding | brunch
Plus secondary tags: coffee-run | errands | lounge | gym | family-gathering | formal-event | photo-shoot | concert | beach | airport

NON-NEGOTIABLE TAGGING RULES — apply religiously:
• Button-Down / Oxford / Dress Shirt with formality "business-casual" or "formal" → MUST include "office" in occasionTags
• Polo with formality "smart-casual" → MUST include "office" AND "casual-outing" in occasionTags
• Blazer / Suit Jacket → MUST include "office" AND "date-night" in occasionTags
• Tailored Trousers / Chinos → MUST include "office" in occasionTags
• Bomber Jacket / Leather Jacket / Suede Jacket → MUST include "date-night" AND "night-out", NEVER "office"
• Hoodie / Sweatshirt → MUST include "travel" AND "casual-outing", ALSO include "workout" if it's athletic fabric; NEVER "office" or "date-night"
• Cargo Pants / Cargo Shorts → MUST include "travel" AND "casual-outing", NEVER "office"
• Joggers / Sweatpants → "travel" + "casual-outing" + "workout" + "gym", NEVER "office" or "date-night"
• Linen Shirt / Linen Trousers / Resort Print → MUST include "casual-outing" AND "beach", NEVER "office"
• Sandals → "casual-outing" + "beach" ONLY, NEVER "office" or "date-night" or "night-out"
• Kurta / Saree / Lehenga / Sherwani → "festive" + "wedding" + "family-gathering" ONLY, NEVER "office" or "gym"
• Sportswear (athletic formality) → "workout" + "gym" + "travel", NEVER "office" or "wedding" or "date-night"
• Graphic Tee / Slogan Tee → "casual-outing" + "travel" ONLY, NEVER "office" or "date-night"
• Sequin / Satin / Bold-saturation pieces → "night-out" + "date-night" + (if appropriate) "festive" / "wedding"

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
  "occasionTags": ["casual-outing", "travel", "college", "brunch", "coffee-run", "errands", "movie-night"],
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
occasionTags     array 5–10 entries (see vocabulary below — use EXACT keys: casual-outing, workout, festive, not weekend/vacation/festival)
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
  casual-outing, travel, airport, road-trip, beach, college, lecture, library,
  coffee-run, errands, brunch, lunch-out, dinner-out, date-night, casual-date, first-date,
  movie-night, house-party, club, concert, festive, wedding, sangeet, mehendi, reception,
  family-gathering, family-outing, diwali, holi, eid, christmas, office, work-from-office,
  meeting, presentation, interview, conference, networking, work-from-home, lounge,
  sleepover, workout, gym, run, yoga, hike, sports, picnic, garden-party, rooftop,
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
  • Black slim jeans → casual-outing, date-night, dinner, college, travel, concert, night-out, casual-date
  • White Oxford shirt → office, interview, date-night, dinner, brunch, presentation, smart-casual
  • Cream linen co-ord → casual-outing, beach, brunch, garden-party, festive, travel
  • Tailored blazer → office, interview, date-night, dinner, wedding-guest, after-work-drinks
  • Plain hoodie → lounge, casual-outing, college, travel, airport, errands, workout, movie-night
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
Sportswear → formality="athletic" energy=["active","fresh"]
  occasionTags MUST be: "workout" + "gym" (always), PLUS "travel" if light/breathable.
  NEVER: office, wedding, date-night, dinner, festive.

━━━ OCCASION TAGGING — HARD RULES (these directly drive outfit suggestions) ━━━

The "occasionTags" field MUST use these EXACT keys (these match the styling system, no synonyms):
casual-outing | travel | workout | office | date-night | night-out | festive | wedding | brunch
Plus secondary tags: coffee-run | errands | lounge | gym | family-gathering | formal-event | photo-shoot | concert | beach | airport

NON-NEGOTIABLE TAGGING RULES — apply religiously to every piece:
• Button-Down / Oxford / Dress Shirt with formality "business-casual" or "formal" → MUST include "office" in occasionTags
• Polo with formality "smart-casual" → MUST include "office" AND "casual-outing" in occasionTags
• Blazer / Suit Jacket → MUST include "office" AND "date-night" in occasionTags
• Tailored Trousers / Chinos → MUST include "office" in occasionTags
• Bomber Jacket / Leather Jacket / Suede Jacket → MUST include "date-night" AND "night-out", NEVER "office"
• Hoodie / Sweatshirt → MUST include "travel" AND "casual-outing"; ALSO include "workout" if athletic fabric; NEVER "office" or "date-night"
• Cargo Pants / Cargo Shorts → MUST include "travel" AND "casual-outing", NEVER "office"
• Joggers / Sweatpants → "travel" + "casual-outing" + "workout" + "gym", NEVER "office" or "date-night"
• Linen Shirt / Linen Trousers / Resort Print → MUST include "casual-outing" AND "beach", NEVER "office"
• Sandals → "casual-outing" + "beach" ONLY, NEVER "office" or "date-night" or "night-out"
• Kurta / Saree / Lehenga / Sherwani → "festive" + "wedding" + "family-gathering" ONLY, NEVER "office" or "gym"
• Graphic / Slogan Tee → "casual-outing" + "travel" ONLY, NEVER "office" or "date-night"
• Sequin / Satin / Bold-saturation piece → "night-out" + "date-night" + (if appropriate) "festive" / "wedding"
• Sportswear (athletic formality) → "workout" + "gym" + "travel", NEVER "office" or "wedding" or "date-night"

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
