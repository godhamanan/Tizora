import express, { Request, Response } from 'express';
import { db } from '../db.js';

const router = express.Router();

// GET /profile
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const profile = await db
      .selectFrom('profiles')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    res.json(profile ?? { user_id: userId, gender: null, onboarding_complete: false });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /profile — upsert
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { gender, onboarding_complete } = req.body as {
      gender?: string;
      onboarding_complete?: boolean;
    };

    const existing = await db
      .selectFrom('profiles')
      .select('user_id')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (existing) {
      const updated = await db
        .updateTable('profiles')
        .set({
          ...(gender              !== undefined && { gender }),
          ...(onboarding_complete !== undefined && { onboarding_complete }),
        })
        .where('user_id', '=', userId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return res.json(updated);
    }

    const created = await db
      .insertInto('profiles')
      .values({
        user_id:             userId,
        gender:              gender              ?? null,
        onboarding_complete: onboarding_complete ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json(created);
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
