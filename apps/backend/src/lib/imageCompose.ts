import sharp from 'sharp';

// ── Card compositing spec ──────────────────────────────────────────────────
//
//   Canvas:     800 × 1000 px  (4:5 portrait — matches wardrobe card ratio)
//   Background: #F7F6F4        (warm off-white — editorial, not clinical)
//   Padding:    12% per side   (garment occupies max 76% width / 76% height)
//   Output:     JPEG q88       (~80-120 KB per card, sharp visual quality)
//
//   Shadow is handled in CSS (`filter: drop-shadow`) — zero server cost.

const CARD_W   = 800;
const CARD_H   = 1000;
const PADDING  = 0.12;
const BG       = { r: 247, g: 246, b: 244 } as const;

const MAX_W = Math.floor(CARD_W * (1 - PADDING * 2));  // 608 px
const MAX_H = Math.floor(CARD_H * (1 - PADDING * 2));  // 760 px

const JPEG_OPTS: sharp.JpegOptions = { quality: 88, mozjpeg: true };

// ── composeCard ────────────────────────────────────────────────────────────
// Takes the RGBA PNG returned by rembg (transparent background) and
// composites the garment onto the neutral card background.
export async function composeCard(rgbaPngBase64: string): Promise<Buffer> {
  const rgba = Buffer.from(rgbaPngBase64, 'base64');

  // Fit the garment within the padded area (upscale if too small)
  const garment = await sharp(rgba)
    .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return sharp({
    create: { width: CARD_W, height: CARD_H, channels: 3, background: BG },
  })
    .composite([{ input: garment, gravity: 'center' }])
    .jpeg(JPEG_OPTS)
    .toBuffer();
}

// ── composeCardFallback ────────────────────────────────────────────────────
// Used when rembg is unavailable or quality check fails.
// Produces the same card dimensions and background using the original image —
// so every card looks visually consistent even without background removal.
export async function composeCardFallback(jpegBase64: string): Promise<Buffer> {
  const jpeg = Buffer.from(jpegBase64, 'base64');

  const resized = await sharp(jpeg)
    .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  return sharp({
    create: { width: CARD_W, height: CARD_H, channels: 3, background: BG },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .jpeg(JPEG_OPTS)
    .toBuffer();
}

// ── checkExtractionQuality ────────────────────────────────────────────────
// Inspects the alpha channel of rembg output to detect clear failures:
//   > 85% transparent → garment was stripped (misfire on similar background)
//   <  3% transparent → background was not removed (uniform background)
// Both signal that the raw fallback will look better.
export async function checkExtractionQuality(
  rgbaPngBase64: string
): Promise<'good' | 'poor'> {
  const buf = Buffer.from(rgbaPngBase64, 'base64');

  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const total = info.width * info.height;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] as number) < 15) transparent++;
  }

  const ratio = transparent / total;
  if (ratio > 0.85 || ratio < 0.03) return 'poor';
  return 'good';
}
