import express, { Request, Response } from 'express';
import { db } from '../db.js';
import { uploadImage } from '../r2.js';
import sharp from 'sharp';

const router = express.Router();

// GET /clothes — list all, supports ?category=
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    let query = db.selectFrom('clothes')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc');

    const { category } = req.query;

    if (category && category !== 'All') {
      query = query.where('category', '=', category as string);
    }

    const items = await query.execute();

    res.json(items);
  } catch (error) {
    console.error('Error fetching clothes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /clothes/:id — single item
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const userId = (req as any).userId as string;

    const item = await db
      .selectFrom('clothes')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /clothes — save a single confirmed clothing item
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name, category, subcategory, color, secondary_color, pattern, fabric, fit,
      formality, season, style, gender_style,
      layers_with, pairs_well_with, style_notes,
      style_vibes, occasion_tags, energy, works_best_for,
      image_base64, image_url,
    } = req.body;

    if (!name || !category || !color || (!image_base64 && !image_url)) {
      return res.status(400).json({ error: 'name, category, color, and either image_base64 or image_url are required' });
    }

    // Upload to R2 — resize to max 900px wide before upload for fast rendering
    let finalImageUrl: string | null = image_url ?? null;
    if (image_base64) {
      const match = image_base64.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) return res.status(400).json({ error: 'Invalid image_base64 format' });
      const raw     = Buffer.from(match[2], 'base64');
      const resized = await sharp(raw)
        .rotate()  // apply EXIF orientation, then strip it — fixes sideways iPhone portraits
        .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      finalImageUrl = await uploadImage(resized, 'image/jpeg', (req as any).userId);
      console.log(`☁️  Saved to R2 (${Math.round(resized.length / 1024)}KB): ${finalImageUrl}`);
    }

    const inserted = await db
      .insertInto('clothes')
      .values({
        name,
        category,
        subcategory:     subcategory     ?? null,
        color,
        secondary_color: secondary_color ?? null,
        pattern:         pattern         ?? null,
        fabric:          fabric          ?? null,
        fit:             fit             ?? null,
        formality:       formality       ?? null,
        season:          season          ?? null,
        style:           style           ?? null,
        gender_style:    gender_style    ?? null,
        layers_with:     layers_with     ?? null,
        pairs_well_with: pairs_well_with ?? null,
        style_notes:     style_notes     ?? null,
        style_vibes:     style_vibes     ?? null,
        occasion_tags:   occasion_tags   ?? null,
        energy:          energy          ?? null,
        works_best_for:  works_best_for  ?? null,
        image_base64:    null,
        image_url:       finalImageUrl,
        user_id:         (req as any).userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json(inserted);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error saving item:', msg);
    res.status(500).json({ error: 'Failed to save item', detail: msg });
  }
});

// PATCH /clothes/:id — edit name, category, favorite, etc.
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const userId = (req as any).userId as string;
    const {
      name, category, subcategory, color, secondary_color, pattern, fabric, fit,
      formality, season, style, gender_style,
      layers_with, pairs_well_with, style_notes,
      style_vibes, occasion_tags, energy, works_best_for,
      favorite,
    } = req.body;

    const updated = await db
      .updateTable('clothes')
      .set({
        ...(name            !== undefined && { name }),
        ...(category        !== undefined && { category }),
        ...(subcategory     !== undefined && { subcategory }),
        ...(color           !== undefined && { color }),
        ...(secondary_color !== undefined && { secondary_color }),
        ...(pattern         !== undefined && { pattern }),
        ...(fabric          !== undefined && { fabric }),
        ...(fit             !== undefined && { fit }),
        ...(formality       !== undefined && { formality }),
        ...(season          !== undefined && { season }),
        ...(style           !== undefined && { style }),
        ...(gender_style    !== undefined && { gender_style }),
        ...(layers_with     !== undefined && { layers_with }),
        ...(pairs_well_with !== undefined && { pairs_well_with }),
        ...(style_notes     !== undefined && { style_notes }),
        ...(style_vibes     !== undefined && { style_vibes }),
        ...(occasion_tags   !== undefined && { occasion_tags }),
        ...(energy          !== undefined && { energy }),
        ...(works_best_for  !== undefined && { works_best_for }),
        ...(favorite        !== undefined && { favorite }),
      })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /clothes — delete all items for this user
router.delete('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const result = await db.deleteFrom('clothes').where('user_id', '=', userId).executeTakeFirst();
    res.json({ success: true, deleted: Number(result.numDeletedRows) });
  } catch (error) {
    console.error('Error clearing wardrobe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /clothes/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const userId = (req as any).userId as string;

    await db.deleteFrom('clothes').where('id', '=', id).where('user_id', '=', userId).execute();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
