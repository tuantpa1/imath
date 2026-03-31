import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { requireRole } from '../middleware/roleMiddleware';
import type { AuthRequest } from '../middleware/authMiddleware';
import { readScores, getTotalPoints, redeemPoints } from '../services/storageServiceSQLite';

const router = Router();
router.use(requireRole('parent'));

// GET /parent/children — list this parent's linked students
router.get('/children', (req: Request, res: Response) => {
  const parentId = (req as AuthRequest).user.userId;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name
    FROM users u
    JOIN family_links fl ON fl.student_id = u.id
    WHERE fl.parent_id = ? AND u.is_active = 1
    ORDER BY u.display_name
  `).all(parentId) as Array<{ id: number; username: string; display_name: string }>;
  res.json(rows);
});

// GET /parent/children/:id/scores
router.get('/children/:id/scores', (req: Request, res: Response) => {
  const parentId = (req as AuthRequest).user.userId;
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const link = db.prepare('SELECT 1 FROM family_links WHERE parent_id = ? AND student_id = ?').get(parentId, studentId);
  if (!link) { res.status(403).json({ error: 'Forbidden: not your child' }); return; }

  try {
    res.json(readScores(studentId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /parent/children/:id/redeem — redeem points for a child
router.post('/children/:id/redeem', (req: Request, res: Response) => {
  const parentId = (req as AuthRequest).user.userId;
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const link = db.prepare('SELECT 1 FROM family_links WHERE parent_id = ? AND student_id = ?').get(parentId, studentId);
  if (!link) { res.status(403).json({ error: 'Forbidden: not your child' }); return; }

  const { points } = req.body as { points?: number };
  if (!points || points <= 0) { res.status(400).json({ error: 'points must be > 0' }); return; }

  const available = getTotalPoints(studentId);
  if (available < points) {
    res.status(400).json({ error: `Không đủ điểm: có ${available}, cần ${points}` });
    return;
  }

  redeemPoints(studentId, points, parentId);
  res.json({ ok: true, remaining: available - points });
});

export default router;
