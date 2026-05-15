import { Request, Response, NextFunction } from 'express';
import { auth } from '../auth.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) headers.set(key, Array.isArray(val) ? val.join(', ') : val);
    }
    const session = await auth.api.getSession({ headers });
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    (req as any).userId = session.user.id;
    (req as any).user   = session.user;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
