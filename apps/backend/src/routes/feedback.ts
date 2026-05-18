import express, { Request, Response } from 'express';
import { db } from '../db.js';

const router = express.Router();

// POST /feedback — record a thumbs up/down on an outfit suggestion.
// Body: { theme: string, pieceIds: number[], feedback: 'up'|'down', reason?: string }
router.post('/', async (req: Request, res: Response) => {
  try {
    const { theme, pieceIds, feedback, reason } = req.body as {
      theme: string;
      pieceIds: number[];
      feedback: 'up' | 'down';
      reason?: string;
    };
    const userId = (req as any).userId as string;

    if (!theme || !Array.isArray(pieceIds) || pieceIds.length === 0) {
      return res.status(400).json({ error: 'theme and non-empty pieceIds are required' });
    }
    if (feedback !== 'up' && feedback !== 'down') {
      return res.status(400).json({ error: 'feedback must be "up" or "down"' });
    }

    // Sort ids ascending so the same outfit (in any piece order) hashes identically.
    // This is what lets us dedup repeat suggestions of the same combo.
    const sorted = [...pieceIds].filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const hash = sorted.join('-');

    await db.insertInto('outfit_feedback').values({
      user_id:        userId,
      theme,
      piece_ids:      JSON.stringify(sorted),
      piece_ids_hash: hash,
      feedback,
      reason:         reason ?? null,
    }).execute();

    res.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('feedback error:', msg);
    res.status(500).json({ error: 'Internal server error', detail: msg });
  }
});

// GET /feedback/summary?theme=X — aggregated signal for the current user.
// Returns { likedPieceIds, dislikedPieceIds, dislikedCombos } so frontend
// can show counts and admin can debug.
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const theme  = req.query.theme as string | undefined;

    let q = db.selectFrom('outfit_feedback')
      .select(['piece_ids', 'feedback', 'theme', 'piece_ids_hash'])
      .where('user_id', '=', userId);
    if (theme) q = q.where('theme', '=', theme);
    const rows = await q.execute();

    const pieceScore = new Map<number, number>();
    const dislikedCombos = new Set<string>();
    for (const r of rows) {
      const ids: number[] = JSON.parse(r.piece_ids);
      const delta = r.feedback === 'up' ? 1 : -1;
      for (const id of ids) pieceScore.set(id, (pieceScore.get(id) ?? 0) + delta);
      if (r.feedback === 'down') dislikedCombos.add(r.piece_ids_hash);
    }

    const liked   = [...pieceScore.entries()].filter(([, n]) => n > 0).map(([id]) => id);
    const disliked = [...pieceScore.entries()].filter(([, n]) => n < 0).map(([id]) => id);

    res.json({
      likedPieceIds:    liked,
      dislikedPieceIds: disliked,
      dislikedCombos:   [...dislikedCombos],
      totalFeedback:    rows.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('feedback summary error:', msg);
    res.status(500).json({ error: 'Internal server error', detail: msg });
  }
});

export default router;
