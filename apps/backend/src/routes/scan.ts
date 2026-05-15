import express, { Request, Response } from 'express';
import multer from 'multer';
import { classifyItem } from '../lib/scanUtils.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── POST /scan ─────────────────────────────────────────────────────────────
router.post('/', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY is not set' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const imageBuffer = req.file.buffer;
    const mediaType   = req.file.mimetype;

    console.log(`\n📸 Scan: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log('🔍 Classifying item...');

    const classification = await classifyItem(imageBuffer, mediaType);
    console.log(`   → ${classification.label} (isClothing: ${classification.isClothing})`);

    if (!classification.isClothing) {
      return res.status(422).json({
        error: 'No clothing item detected. Please upload a photo of a single garment.',
      });
    }

    console.log('✅ Scan complete\n');

    // R2 upload happens at save time (POST /clothes), not here.
    // Only return classification + base64 for review.
    res.json({
      item: {
        ...classification,
        image: `data:${mediaType};base64,${imageBuffer.toString('base64')}`,
      },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Scan error:', msg);
    res.status(500).json({ error: 'Failed to scan image', detail: msg });
  }
});

export default router;
