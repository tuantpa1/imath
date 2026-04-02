import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { requireRole } from '../middleware/roleMiddleware';
import { readScores, getTotalPoints, getTeacherStudentIds, isStudentInTeacherClass } from '../services/storageServiceSQLite';
import { getUserGenerateLimit, getCurrentDate } from '../services/rateLimitService';
import type { AuthRequest } from '../middleware/authMiddleware';

const router = Router();
router.use(requireRole('teacher'));

// GET /teacher/students — students in this teacher's class only
router.get('/students', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;

  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_active,
           GROUP_CONCAT(p.display_name, ', ') AS parents
    FROM users u
    JOIN teacher_students ts ON ts.student_id = u.id
    LEFT JOIN family_links fl ON fl.student_id = u.id
    LEFT JOIN users p ON p.id = fl.parent_id
    WHERE ts.teacher_id = ? AND u.role = 'student'
    GROUP BY u.id
    ORDER BY u.display_name
  `).all(teacherId) as Array<{
    id: number; username: string; display_name: string; is_active: number; parents: string | null;
  }>;

  if (rows.length === 0) {
    res.json({ students: [], message: 'Chưa có học sinh nào trong lớp' });
    return;
  }

  const students = rows.map((s) => ({
    ...s,
    total_points: getTotalPoints(s.id),
    session_count: (db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE student_id = ?').get(s.id) as { n: number }).n,
  }));

  res.json({ students });
});

// GET /teacher/students/:id/scores
router.get('/students/:id/scores', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }

  if (!isStudentInTeacherClass(teacherId, studentId)) {
    res.status(403).json({ error: 'Học sinh không thuộc lớp của bạn' });
    return;
  }

  try {
    res.json(readScores(studentId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi đọc điểm số' });
  }
});

// GET /teacher/students/:id/wrong-answers
router.get('/students/:id/wrong-answers', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }

  if (!isStudentInTeacherClass(teacherId, studentId)) {
    res.status(403).json({ error: 'Học sinh không thuộc lớp của bạn' });
    return;
  }

  const rows = db.prepare(
    'SELECT question_text, correct_answer, student_answer, type, parts_json, date FROM wrong_answers WHERE student_id = ? ORDER BY id DESC'
  ).all(studentId) as Array<{
    question_text: string; correct_answer: string; student_answer: string;
    type: string; parts_json: string | null; date: string;
  }>;
  res.json(rows);
});

// GET /teacher/batch-completion?batch_ts=TIMESTAMP — per-student completion for a specific batch
router.get('/batch-completion', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;
  const { batch_ts } = req.query as { batch_ts?: string };
  if (!batch_ts) { res.status(400).json({ error: 'batch_ts is required' }); return; }

  const studentIds = getTeacherStudentIds(teacherId);
  if (studentIds.length === 0) { res.json([]); return; }

  const placeholders = studentIds.map(() => '?').join(',');
  const students = db.prepare(
    `SELECT u.id, u.display_name FROM users u WHERE u.id IN (${placeholders}) AND u.is_active = 1 ORDER BY u.display_name`
  ).all(...studentIds) as Array<{ id: number; display_name: string }>;

  const result = students.map((s) => {
    const session = db.prepare(`
      SELECT id, completed FROM sessions
      WHERE created_by = ? AND student_id = ?
        AND (id LIKE ? OR id LIKE ?)
      LIMIT 1
    `).get(teacherId, s.id, `session_all_${batch_ts}_%`, `session_dist_${batch_ts}_%`) as { id: string; completed: number } | undefined;

    let score: number | null = null;
    if (session?.completed) {
      const scoreRow = db.prepare(
        'SELECT total_points FROM scores WHERE student_id = ? AND session_id = ?'
      ).get(s.id, session.id) as { total_points: number } | undefined;
      score = scoreRow?.total_points ?? null;
    }
    return { id: s.id, name: s.display_name, completed: !!session?.completed, score };
  });

  res.json(result);
});

// GET /teacher/batch-questions?batch_ts=TIMESTAMP — questions from a distributed batch
router.get('/batch-questions', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;
  const { batch_ts } = req.query as { batch_ts?: string };
  if (!batch_ts) { res.status(400).json({ error: 'batch_ts is required' }); return; }

  // Find any student session from this batch (all students got the same questions)
  const session = db.prepare(`
    SELECT s.id FROM sessions s
    WHERE s.created_by = ? AND s.student_id != ?
      AND (s.id LIKE ? OR s.id LIKE ?)
    LIMIT 1
  `).get(teacherId, teacherId, `session_all_${batch_ts}_%`, `session_dist_${batch_ts}_%`) as { id: string } | undefined;

  if (!session) { res.json([]); return; }

  const questions = db.prepare(
    'SELECT id, question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit FROM questions WHERE session_id = ? ORDER BY rowid ASC'
  ).all(session.id) as Array<{
    id: string; question_text: string; type: string; difficulty: string;
    answer: number | null; answer_text: string | null; answers_json: string | null;
    order_matters: number; unit: string;
  }>;

  res.json(questions);
});

// GET /teacher/leaderboard — class leaderboard only
router.get('/leaderboard', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;
  const studentIds = getTeacherStudentIds(teacherId);

  if (studentIds.length === 0) {
    res.json([]);
    return;
  }

  const placeholders = studentIds.map(() => '?').join(',');
  const students = db.prepare(
    `SELECT id, display_name FROM users WHERE id IN (${placeholders}) AND is_active = 1`
  ).all(...studentIds) as Array<{ id: number; display_name: string }>;

  const leaderboard = students.map((s) => ({
    id: s.id,
    displayName: s.display_name,
    points: getTotalPoints(s.id),
  })).sort((a, b) => b.points - a.points);

  res.json(leaderboard);
});

// GET /teacher/sessions — sessions created by this teacher for their class (excludes drafts)
router.get('/sessions', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;

  // Get sessions created by this teacher where student_id != teacherId (exclude drafts)
  // Group by created_at date + question_count to identify distribution batches
  const sessions = db.prepare(`
    SELECT s.id, s.created_at, s.question_count, s.completed,
           u.display_name AS student_name
    FROM sessions s
    JOIN users u ON u.id = s.student_id
    WHERE s.created_by = ? AND s.student_id != ?
    ORDER BY s.created_at DESC, s.id DESC
  `).all(teacherId, teacherId) as Array<{
    id: string; created_at: string; question_count: number; completed: number; student_name: string;
  }>;

  // Group by batch_ts extracted from session ID (precise — one entry per distribution event)
  const batches = new Map<string, { batch_ts: string; date: string; question_count: number; student_count: number; completed_count: number }>();
  for (const s of sessions) {
    const date = s.created_at.split('T')[0].split(' ')[0];
    const tsMatch = s.id.match(/^session_(?:all|dist)_(\d+)_/);
    const batchTs = tsMatch ? tsMatch[1] : `${date}_${s.question_count}`;
    if (!batches.has(batchTs)) {
      batches.set(batchTs, { batch_ts: batchTs, date, question_count: s.question_count, student_count: 0, completed_count: 0 });
    }
    const b = batches.get(batchTs)!;
    b.student_count++;
    if (s.completed) b.completed_count++;
  }

  const result = Array.from(batches.values()).sort((a, b) => b.batch_ts.localeCompare(a.batch_ts));
  res.json(result);
});

// GET /teacher/completion — completion status for the most recent distributed batch
router.get('/completion', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;
  const studentIds = getTeacherStudentIds(teacherId);

  if (studentIds.length === 0) {
    res.json({ session_date: null, total_students: 0, completed_count: 0, students: [] });
    return;
  }

  // Find the most recently created active (non-superseded) distributed session for this teacher
  const latestSession = db.prepare(`
    SELECT id, created_at, question_count
    FROM sessions
    WHERE created_by = ? AND student_id != ? AND superseded = 0
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(teacherId, teacherId) as { id: string; created_at: string; question_count: number } | undefined;

  if (!latestSession) {
    const students = db.prepare(
      `SELECT u.id, u.display_name FROM users u WHERE u.id IN (${studentIds.map(() => '?').join(',')}) AND u.is_active = 1`
    ).all(...studentIds) as Array<{ id: number; display_name: string }>;
    res.json({
      session_date: null,
      total_students: students.length,
      completed_count: 0,
      students: students.map((s) => ({ id: s.id, name: s.display_name, completed: false, score: null })),
    });
    return;
  }

  const batchDate = latestSession.created_at.split('T')[0].split(' ')[0];

  const placeholders = studentIds.map(() => '?').join(',');
  const students = db.prepare(
    `SELECT u.id, u.display_name FROM users u WHERE u.id IN (${placeholders}) AND u.is_active = 1 ORDER BY u.display_name`
  ).all(...studentIds) as Array<{ id: number; display_name: string }>;

  // Extract batch_ts from the latest session's ID to find all sessions in this batch
  const batchTsMatch = latestSession.id.match(/^session_(?:all|dist)_(\d+)_/);
  const batchTs = batchTsMatch ? batchTsMatch[1] : null;

  const result = students.map((s) => {
    // Find their session from this batch using batch_ts for accuracy
    const session = batchTs
      ? db.prepare(`
          SELECT s.id, s.completed FROM sessions s
          WHERE s.created_by = ? AND s.student_id = ?
            AND (s.id LIKE ? OR s.id LIKE ?)
          LIMIT 1
        `).get(teacherId, s.id, `session_all_${batchTs}_%`, `session_dist_${batchTs}_%`) as { id: string; completed: number } | undefined
      : db.prepare(`
          SELECT s.id, s.completed FROM sessions s
          WHERE s.created_by = ? AND s.student_id = ? AND s.question_count = ?
            AND (s.created_at LIKE ? OR s.created_at LIKE ?) AND s.superseded = 0
          ORDER BY s.created_at DESC LIMIT 1
        `).get(teacherId, s.id, latestSession.question_count, `${batchDate}%`, `${batchDate}T%`) as { id: string; completed: number } | undefined;

    let score: number | null = null;
    if (session?.completed) {
      const scoreRow = db.prepare(
        'SELECT total_points FROM scores WHERE student_id = ? AND session_id = ?'
      ).get(s.id, session.id) as { total_points: number } | undefined;
      score = scoreRow?.total_points ?? null;
    }

    return { id: s.id, name: s.display_name, completed: !!session?.completed, score };
  });

  const completedCount = result.filter((s) => s.completed).length;
  res.json({
    session_date: batchDate,
    question_count: latestSession.question_count,
    total_students: result.length,
    completed_count: completedCount,
    students: result,
  });
});

// GET /teacher/usage — this teacher's own API usage only
router.get('/usage', (req: Request, res: Response) => {
  const teacherId = (req as AuthRequest).user.userId;
  const date = getCurrentDate();

  const usageRows = db.prepare(
    'SELECT action, count FROM api_usage WHERE user_id = ? AND date = ?'
  ).all(teacherId, date) as Array<{ action: string; count: number }>;

  const usageMap = new Map<string, number>();
  for (const row of usageRows) {
    usageMap.set(row.action, row.count);
  }

  res.json({
    generate_exercises_used: usageMap.get('generate_exercises') ?? 0,
    generate_exercises_limit: getUserGenerateLimit(teacherId, 'teacher'),
    skip_question_used: usageMap.get('skip_question') ?? 0,
    resetsAt: '00:00 ngày mai (UTC+7)',
  });
});

export default router;
