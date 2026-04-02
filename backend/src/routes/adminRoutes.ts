import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { requireRole } from '../middleware/roleMiddleware';
import { readScores, getTotalPoints, assignStudentToTeacher, removeStudentFromTeacher } from '../services/storageServiceSQLite';
import { hashPassword } from '../services/authService';
import { getAllUsageToday, getUserGenerateLimit, setUserGenerateLimit } from '../services/rateLimitService';
import type { AuthRequest } from '../middleware/authMiddleware';

const router = Router();
router.use(requireRole('admin'));

// === USER MANAGEMENT ===

// GET /admin/users — all users with role-specific extra info
router.get('/users', (_req: Request, res: Response) => {
  const users = db.prepare(
    'SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY role, display_name'
  ).all() as Array<{ id: number; username: string; display_name: string; role: string; is_active: number; created_at: string }>;

  const result = users.map((u) => {
    const base = { ...u };
    if (u.role === 'student') {
      const teacherRow = db.prepare(`
        SELECT t.display_name AS teacher_name
        FROM teacher_students ts
        JOIN users t ON t.id = ts.teacher_id
        WHERE ts.student_id = ?
      `).get(u.id) as { teacher_name: string } | undefined;
      const parentRow = db.prepare(`
        SELECT GROUP_CONCAT(p.display_name, ', ') AS parent_name
        FROM family_links fl
        JOIN users p ON p.id = fl.parent_id
        WHERE fl.student_id = ?
      `).get(u.id) as { parent_name: string | null } | undefined;
      return { ...base, teacher_name: teacherRow?.teacher_name ?? null, parent_name: parentRow?.parent_name ?? null };
    }
    if (u.role === 'teacher') {
      const count = db.prepare('SELECT COUNT(*) AS n FROM teacher_students WHERE teacher_id = ?').get(u.id) as { n: number };
      return { ...base, student_count: count.n };
    }
    if (u.role === 'parent') {
      const children = db.prepare(`
        SELECT s.display_name
        FROM family_links fl
        JOIN users s ON s.id = fl.student_id
        WHERE fl.parent_id = ?
      `).all(u.id) as Array<{ display_name: string }>;
      return { ...base, children: children.map((c) => c.display_name) };
    }
    return base;
  });

  res.json({ users: result });
});

// GET /admin/students — all students with teacher + parent info
router.get('/students', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_active,
           t.display_name AS teacher_name,
           GROUP_CONCAT(p.display_name, ', ') AS parents
    FROM users u
    LEFT JOIN teacher_students ts ON ts.student_id = u.id
    LEFT JOIN users t ON t.id = ts.teacher_id
    LEFT JOIN family_links fl ON fl.student_id = u.id
    LEFT JOIN users p ON p.id = fl.parent_id
    WHERE u.role = 'student'
    GROUP BY u.id
    ORDER BY u.display_name
  `).all() as Array<{
    id: number; username: string; display_name: string; is_active: number;
    teacher_name: string | null; parents: string | null;
  }>;
  res.json(rows);
});

// GET /admin/teachers — all teachers with student counts and names
router.get('/teachers', (_req: Request, res: Response) => {
  const teachers = db.prepare(
    "SELECT id, username, display_name, is_active FROM users WHERE role = 'teacher' ORDER BY display_name"
  ).all() as Array<{ id: number; username: string; display_name: string; is_active: number }>;

  const result = teachers.map((t) => {
    const students = db.prepare(`
      SELECT s.id, s.display_name
      FROM teacher_students ts
      JOIN users s ON s.id = ts.student_id
      WHERE ts.teacher_id = ?
      ORDER BY s.display_name
    `).all(t.id) as Array<{ id: number; display_name: string }>;
    return { ...t, student_count: students.length, students };
  });

  res.json({ teachers: result });
});

// GET /admin/parents — all parents with linked children
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
  `).all() as Array<{ id: number; username: string; display_name: string; is_active: number; children: string | null }>;
  res.json(rows);
});

// POST /admin/users — create any account
router.post('/users', async (req: Request, res: Response) => {
  const { username, password, displayName, role, linkToParentId, assignToTeacherId } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: string;
    linkToParentId?: number;
    assignToTeacherId?: number;
  };

  if (!username || !password || !displayName || !role) {
    res.status(400).json({ error: 'username, password, displayName, role là bắt buộc' });
    return;
  }
  if (!['admin', 'teacher', 'parent', 'student'].includes(role)) {
    res.status(400).json({ error: 'role phải là admin, teacher, parent hoặc student' });
    return;
  }

  try {
    const hash = await hashPassword(password);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run(username, hash, role, displayName);
    const newId = result.lastInsertRowid as number;

    if (role === 'student') {
      if (linkToParentId) {
        db.prepare('INSERT OR IGNORE INTO family_links (parent_id, student_id) VALUES (?, ?)').run(linkToParentId, newId);
      }
      if (assignToTeacherId) {
        assignStudentToTeacher(assignToTeacherId, newId);
      }
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

// DELETE /admin/users/:id — soft-delete
router.delete('/users/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }

  // Prevent deleting own account
  const authReq = req as AuthRequest;
  if (authReq.user.userId === id) {
    res.status(400).json({ error: 'Không thể tự xóa tài khoản của mình' });
    return;
  }

  const changes = db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id).changes;
  if (!changes) { res.status(404).json({ error: 'Không tìm thấy người dùng' }); return; }
  res.json({ ok: true });
});

// DELETE /admin/users/:id/permanent — hard-delete with full cascade
router.delete('/users/:id/permanent', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }

  const authReq = req as AuthRequest;
  if (authReq.user.userId === id) {
    res.status(400).json({ error: 'Không thể tự xóa tài khoản của mình' });
    return;
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
  if (!user) { res.status(404).json({ error: 'Không tìm thấy người dùng' }); return; }

  if (user.role === 'parent') {
    const linked = db.prepare('SELECT COUNT(*) AS n FROM family_links WHERE parent_id = ?').get(id) as { n: number };
    if (linked.n > 0) {
      res.status(400).json({ error: 'Không thể xóa phụ huynh còn liên kết với học sinh' });
      return;
    }
  }

  db.transaction(() => {
    if (user.role === 'student') {
      db.prepare('DELETE FROM wrong_answers WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM score_history WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM redemptions WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM scores WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM questions WHERE session_id IN (SELECT id FROM sessions WHERE student_id = ? OR created_by = ?)').run(id, id);
      db.prepare('DELETE FROM sessions WHERE student_id = ? OR created_by = ?').run(id, id);
      db.prepare('DELETE FROM family_links WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM teacher_students WHERE student_id = ?').run(id);
    } else if (user.role === 'teacher') {
      db.prepare('DELETE FROM teacher_students WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM questions WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ?)').run(id);
      db.prepare('DELETE FROM sessions WHERE created_by = ?').run(id);
    } else if (user.role === 'parent') {
      db.prepare('DELETE FROM redemptions WHERE redeemed_by = ?').run(id);
      db.prepare('DELETE FROM questions WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ?)').run(id);
      db.prepare('DELETE FROM sessions WHERE created_by = ?').run(id);
      db.prepare('DELETE FROM family_links WHERE parent_id = ?').run(id);
    }
    db.prepare('DELETE FROM api_usage WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM user_limits WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();

  res.json({ ok: true });
});

// PATCH /admin/users/:id/reactivate
router.patch('/users/:id/reactivate', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }
  const changes = db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(id).changes;
  if (!changes) { res.status(404).json({ error: 'Không tìm thấy người dùng' }); return; }
  res.json({ ok: true });
});

// === TEACHER-STUDENT ASSIGNMENT ===

// GET /admin/teacher-students — all assignments + unassigned students
router.get('/teacher-students', (_req: Request, res: Response) => {
  const assignments = db.prepare(`
    SELECT ts.id, ts.teacher_id, t.display_name AS teacher_name,
           ts.student_id, s.display_name AS student_name, ts.assigned_at
    FROM teacher_students ts
    JOIN users t ON t.id = ts.teacher_id
    JOIN users s ON s.id = ts.student_id
    ORDER BY t.display_name, s.display_name
  `).all() as Array<{
    id: number; teacher_id: number; teacher_name: string;
    student_id: number; student_name: string; assigned_at: string;
  }>;

  const unassigned = db.prepare(`
    SELECT u.id, u.display_name
    FROM users u
    WHERE u.role = 'student'
      AND u.id NOT IN (SELECT student_id FROM teacher_students)
    ORDER BY u.display_name
  `).all() as Array<{ id: number; display_name: string }>;

  res.json({ assignments, unassigned_students: unassigned });
});

// POST /admin/teacher-students — assign student to teacher
router.post('/teacher-students', (req: Request, res: Response) => {
  const { teacherId, studentId } = req.body as { teacherId?: number; studentId?: number };
  if (!teacherId || !studentId) {
    res.status(400).json({ error: 'teacherId và studentId là bắt buộc' });
    return;
  }

  const teacher = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").get(teacherId);
  if (!teacher) { res.status(400).json({ error: 'Giáo viên không tồn tại' }); return; }

  const student = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(studentId);
  if (!student) { res.status(400).json({ error: 'Học sinh không tồn tại' }); return; }

  assignStudentToTeacher(teacherId, studentId);
  res.json({ ok: true });
});

// DELETE /admin/teacher-students/:studentId — remove student from teacher
router.delete('/teacher-students/:studentId', (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  if (isNaN(studentId)) { res.status(400).json({ error: 'studentId không hợp lệ' }); return; }
  removeStudentFromTeacher(studentId);
  res.json({ ok: true });
});

// === RATE LIMITS ===

// GET /admin/usage — API usage for all users
router.get('/usage', (_req: Request, res: Response) => {
  const users = db.prepare(
    "SELECT id, username, role FROM users WHERE is_active = 1 AND role IN ('admin','teacher','parent','student')"
  ).all() as Array<{ id: number; username: string; role: string }>;

  const usageRows = getAllUsageToday();
  const usageMap = new Map<string, number>();
  for (const row of usageRows) {
    usageMap.set(`${row.user_id}:${row.action}`, row.count);
  }

  const result = users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    generate_exercises_used: usageMap.get(`${u.id}:generate_exercises`) ?? 0,
    generate_exercises_limit: getUserGenerateLimit(u.id, u.role),
    skip_question_used: usageMap.get(`${u.id}:skip_question`) ?? 0,
  }));

  res.json(result);
});

// PATCH /admin/users/:id/limit — set daily generate limit
router.patch('/users/:id/limit', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }
  const { generateLimit } = req.body as { generateLimit?: number };
  if (generateLimit === undefined || generateLimit < 0) {
    res.status(400).json({ error: 'generateLimit phải >= 0' });
    return;
  }
  setUserGenerateLimit(id, generateLimit);
  res.json({ ok: true, generateLimit });
});

// === VIEW DATA ===

// GET /admin/leaderboard — all students ranked by points
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

// GET /admin/students/:id/scores
router.get('/students/:id/scores', (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }
  try {
    res.json(readScores(studentId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi đọc điểm số' });
  }
});

// GET /admin/students/:id/wrong-answers
router.get('/students/:id/wrong-answers', (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: 'ID không hợp lệ' }); return; }
  const rows = db.prepare(
    'SELECT question_text, correct_answer, student_answer, type, parts_json, date FROM wrong_answers WHERE student_id = ? ORDER BY id DESC'
  ).all(studentId) as Array<{
    question_text: string; correct_answer: string; student_answer: string;
    type: string; parts_json: string | null; date: string;
  }>;
  res.json(rows);
});

export default router;
