import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { requireRole } from '../middleware/roleMiddleware';
import { readScores, getTotalPoints } from '../services/storageServiceSQLite';
import { hashPassword } from '../services/authService';
import { getAllUsageToday } from '../services/rateLimitService';
import { getAllQuotas, topUpTokens, setQuota, getUsageHistory } from '../services/tokenQuotaService';

const router = Router();
router.use(requireRole('teacher'));

// GET /teacher/students — all students with linked parent names
router.get('/students', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_active,
           GROUP_CONCAT(p.display_name, ', ') AS parents
    FROM users u
    LEFT JOIN family_links fl ON fl.student_id = u.id
    LEFT JOIN users p ON p.id = fl.parent_id
    WHERE u.role = 'student'
    GROUP BY u.id
    ORDER BY u.display_name
  `).all() as Array<{
    id: number; username: string; display_name: string; is_active: number; parents: string | null;
  }>;
  res.json(rows);
});

// GET /teacher/parents — all parents with linked student names
router.get('/parents', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_active,
           GROUP_CONCAT(s.display_name, ', ') AS children
    FROM users u
    LEFT JOIN family_links fl ON fl.parent_id = u.id
    LEFT JOIN users s ON s.id = fl.student_id
    WHERE u.role = 'parent'
    GROUP BY u.id
    ORDER BY u.display_name
  `).all() as Array<{
    id: number; username: string; display_name: string; is_active: number; children: string | null;
  }>;
  res.json(rows);
});

// GET /teacher/students/:id/scores
router.get('/students/:id/scores', (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'Invalid student id' }); return; }
  try {
    res.json(readScores(studentId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error reading scores' });
  }
});

// GET /teacher/students/:id/wrong-answers
router.get('/students/:id/wrong-answers', (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'Invalid student id' }); return; }
  const rows = db.prepare(
    'SELECT question_text, correct_answer, student_answer, type, parts_json, date FROM wrong_answers WHERE student_id = ? ORDER BY id DESC'
  ).all(studentId) as Array<{
    question_text: string; correct_answer: string; student_answer: string;
    type: string; parts_json: string | null; date: string;
  }>;
  res.json(rows);
});

// GET /teacher/leaderboard — students ranked by points
router.get('/leaderboard', (_req: Request, res: Response) => {
  const students = db.prepare(
    "SELECT id, display_name FROM users WHERE role = 'student' AND is_active = 1 ORDER BY display_name"
  ).all() as Array<{ id: number; display_name: string }>;

  const leaderboard = students.map((s) => ({
    id: s.id,
    displayName: s.display_name,
    points: getTotalPoints(s.id),
  })).sort((a, b) => b.points - a.points);

  res.json(leaderboard);
});

// POST /teacher/students — create a student or parent account
router.post('/students', async (req: Request, res: Response) => {
  const { username, password, displayName, role, linkToStudentId, linkToParentId } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: string;
    linkToStudentId?: number;
    linkToParentId?: number;
  };

  if (!username || !password || !displayName || !role) {
    res.status(400).json({ error: 'username, password, displayName, role required' });
    return;
  }
  if (!['student', 'parent'].includes(role)) {
    res.status(400).json({ error: 'role must be student or parent' });
    return;
  }

  try {
    const hash = await hashPassword(password);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run(username, hash, role, displayName);
    const newId = result.lastInsertRowid as number;

    if (role === 'student' && linkToParentId) {
      db.prepare('INSERT OR IGNORE INTO family_links (parent_id, student_id) VALUES (?, ?)').run(linkToParentId, newId);
    }
    if (role === 'parent' && linkToStudentId) {
      db.prepare('INSERT OR IGNORE INTO family_links (parent_id, student_id) VALUES (?, ?)').run(newId, linkToStudentId);
    }

    // Auto-create unlimited quota row for new parent (prevents FOREIGN KEY errors in token_usage_log)
    if (role === 'parent') {
      db.prepare(
        'INSERT OR IGNORE INTO token_quotas (parent_id, total_tokens, used_tokens) VALUES (?, 999999999, 0)'
      ).run(newId);
    }

    res.json({ ok: true, id: newId });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    } else {
      res.status(500).json({ error: 'Không thể tạo tài khoản' });
    }
  }
});

// POST /teacher/family-links — link parent to student
router.post('/family-links', (req: Request, res: Response) => {
  const { parentId, studentId } = req.body as { parentId?: number; studentId?: number };
  if (!parentId || !studentId) {
    res.status(400).json({ error: 'parentId and studentId required' });
    return;
  }
  try {
    db.prepare('INSERT OR IGNORE INTO family_links (parent_id, student_id) VALUES (?, ?)').run(parentId, studentId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// DELETE /teacher/users/:id — soft-delete a student or parent
router.delete('/users/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const changes = db.prepare(
    "UPDATE users SET is_active = 0 WHERE id = ? AND role IN ('student','parent')"
  ).run(id).changes;
  if (!changes) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});

// PATCH /teacher/users/:id/reactivate — restore a deactivated user
router.patch('/users/:id/reactivate', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const changes = db.prepare(
    "UPDATE users SET is_active = 1 WHERE id = ? AND role IN ('student','parent')"
  ).run(id).changes;
  if (!changes) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});

// GET /teacher/usage — API usage overview for all users today
router.get('/usage', (_req: Request, res: Response) => {
  const users = db.prepare(
    "SELECT id, username, role FROM users WHERE is_active = 1 AND role IN ('teacher','parent','student')"
  ).all() as Array<{ id: number; username: string; role: string }>;

  const usageRows = getAllUsageToday();
  const usageMap = new Map<string, number>();
  for (const row of usageRows) {
    usageMap.set(`${row.user_id}:${row.action}`, row.count);
  }

  const result = users.map((u) => ({
    username: u.username,
    role: u.role,
    generate_exercises_used: usageMap.get(`${u.id}:generate_exercises`) ?? 0,
    skip_question_used: usageMap.get(`${u.id}:skip_question`) ?? 0,
  }));

  res.json(result);
});

// GET /teacher/quotas — all parents with quota info
router.get('/quotas', (_req: Request, res: Response) => {
  res.json(getAllQuotas());
});

// POST /teacher/quotas/:parentId/topup — add tokens to a parent's quota
router.post('/quotas/:parentId/topup', (req: Request, res: Response) => {
  const parentId = Number(req.params.parentId);
  if (isNaN(parentId)) { res.status(400).json({ error: 'Invalid parentId' }); return; }
  const { tokens } = req.body as { tokens?: number };
  if (!tokens || tokens <= 0) { res.status(400).json({ error: 'tokens must be > 0' }); return; }
  try {
    const result = topUpTokens(parentId, tokens);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to top up tokens' });
  }
});

// POST /teacher/quotas/:parentId/set — set absolute quota (resets used_tokens)
router.post('/quotas/:parentId/set', (req: Request, res: Response) => {
  const parentId = Number(req.params.parentId);
  if (isNaN(parentId)) { res.status(400).json({ error: 'Invalid parentId' }); return; }
  const { tokens } = req.body as { tokens?: number };
  if (tokens === undefined || tokens === null || tokens < 0) {
    res.status(400).json({ error: 'tokens must be >= 0' });
    return;
  }
  try {
    const result = setQuota(parentId, tokens);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to set quota' });
  }
});

// GET /teacher/quotas/:parentId/history — recent token usage for a parent
router.get('/quotas/:parentId/history', (req: Request, res: Response) => {
  const parentId = Number(req.params.parentId);
  if (isNaN(parentId)) { res.status(400).json({ error: 'Invalid parentId' }); return; }
  res.json(getUsageHistory(parentId));
});

export default router;
