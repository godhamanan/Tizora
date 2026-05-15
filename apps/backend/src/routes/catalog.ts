import express, { Request, Response } from 'express';
import { db } from '../db.js';

const router = express.Router();

// GET /catalog — optional ?category= and ?gender=men|women
router.get('/', async (req: Request, res: Response) => {
  try {
    let query = db.selectFrom('catalog').selectAll().orderBy('created_at', 'desc');

    const { category, gender } = req.query;

    if (category && category !== 'All') {
      query = query.where('category', '=', category as string);
    }

    if (gender === 'men') {
      query = query.where('gender_style', 'in', ['menswear', 'unisex']);
    } else if (gender === 'women') {
      query = query.where('gender_style', 'in', ['womenswear', 'unisex']);
    }

    const items = await query.execute();
    res.json(items);
  } catch (error) {
    console.error('Error fetching catalog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
