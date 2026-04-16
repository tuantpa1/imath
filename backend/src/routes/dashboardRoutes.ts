import { Router, Request, Response } from 'express';
import type { AuthRequest } from '../middleware/authMiddleware';
import { db } from '../database/db';
import { getTeacherStudentIds } from '../services/storageServiceSQLite';

const router = Router();

function authReq(req: Request): AuthRequest {
  return req as AuthRequest;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function calcStreak(studentId: number): number {
  const days = db.prepare(`
    SELECT DISTINCT date(created_at) AS day
    FROM score_history
    WHERE student_id = ?
    ORDER BY day DESC
    LIMIT 30
  `).all(studentId) as { day: string }[];

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];
    if (days[i].day === expectedStr) streak++;
    else break;
  }
  return streak;
}

function calcPoints(studentId: number): { total: number; imath: number; iread: number } {
  const total = (db.prepare(
    `SELECT COALESCE(SUM(points_change),0) AS v FROM score_history WHERE student_id=? AND points_change > 0`
  ).get(studentId) as { v: number }).v;

  const imath = (db.prepare(
    `SELECT COALESCE(SUM(points_change),0) AS v FROM score_history WHERE student_id=? AND module='imath' AND points_change > 0`
  ).get(studentId) as { v: number }).v;

  const iread = (db.prepare(
    `SELECT COALESCE(SUM(points_change),0) AS v FROM score_history WHERE student_id=? AND module='iread' AND points_change > 0`
  ).get(studentId) as { v: number }).v;

  return { total, imath, iread };
}

function calcWeeklyProgress(studentId: number) {
  // iMath: non-superseded sessions this student has
  const imathTotal = (db.prepare(
    `SELECT COUNT(*) AS v FROM sessions WHERE student_id=? AND superseded=0`
  ).get(studentId) as { v: number }).v;

  const imathDone = (db.prepare(
    `SELECT COUNT(*) AS v FROM sessions WHERE student_id=? AND superseded=0 AND completed=1`
  ).get(studentId) as { v: number }).v;

  // iRead: story_assignments for this student
  const ireadTotal = (db.prepare(
    `SELECT COUNT(*) AS v FROM story_assignments WHERE student_id=?`
  ).get(studentId) as { v: number }).v;

  const ireadDone = (db.prepare(
    `SELECT COUNT(*) AS v FROM reading_sessions
     WHERE student_id=? AND status='completed'`
  ).get(studentId) as { v: number }).v;

  return {
    imath: { done: imathDone, total: imathTotal },
    iread: { done: ireadDone, total: ireadTotal },
  };
}

// ── GET /api/dashboard/student ────────────────────────────────────────────────

router.get('/student', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (user.role !== 'student') {
    res.status(403).json({ error: 'Chỉ dành cho học sinh' });
    return;
  }

  const sid = user.userId;

  const points = calcPoints(sid);
  const streak = calcStreak(sid);
  const weeklyProgress = calcWeeklyProgress(sid);

  // iMath tasks: incomplete non-superseded sessions
  const imathSessions = db.prepare(`
    SELECT s.id, s.created_at, s.question_count
    FROM sessions s
    WHERE s.student_id = ? AND s.completed = 0 AND s.superseded = 0
    ORDER BY s.created_at DESC
    LIMIT 3
  `).all(sid) as { id: string; created_at: string; question_count: number }[];

  // iRead tasks: assigned stories not yet completed
  const ireadAssignments = db.prepare(`
    SELECT sa.story_id, st.title, st.total_pages,
           rs.status, rs.current_page
    FROM story_assignments sa
    JOIN stories st ON sa.story_id = st.id
    LEFT JOIN reading_sessions rs ON rs.story_id = sa.story_id AND rs.student_id = sa.student_id
    WHERE sa.student_id = ? AND (rs.status IS NULL OR rs.status != 'completed')
    ORDER BY sa.assigned_at DESC
    LIMIT 3
  `).all(sid) as {
    story_id: number;
    title: string;
    total_pages: number;
    status: string | null;
    current_page: number | null;
  }[];

  const tasks = [
    ...imathSessions.map((s) => ({
      id: s.id as unknown as number,
      type: 'imath' as const,
      title: `Bài tập toán (${s.question_count} câu)`,
      status: 'not_started' as const,
      detail: 'Chưa làm',
      isUrgent: false,
      refId: s.id as unknown as number,
    })),
    ...ireadAssignments.map((a) => {
      const inProgress = a.status === 'reading' || a.status === 'quiz';
      return {
        id: a.story_id,
        type: 'iread' as const,
        title: a.title,
        status: (inProgress ? 'in_progress' : 'not_started') as 'not_started' | 'in_progress',
        detail: inProgress
          ? `Đang đọc dở trang ${a.current_page ?? 1}/${a.total_pages}`
          : 'Chưa làm',
        isUrgent: false,
        refId: a.story_id,
      };
    }),
  ].slice(0, 5);

  res.json({ points, streak, weeklyProgress, tasks });
});

// ── GET /api/dashboard/parent ─────────────────────────────────────────────────

router.get('/parent', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (user.role !== 'parent') {
    res.status(403).json({ error: 'Chỉ dành cho phụ huynh' });
    return;
  }

  const parentId = user.userId;

  const childRows = db.prepare(`
    SELECT u.id, u.display_name
    FROM family_links fl
    JOIN users u ON fl.student_id = u.id
    WHERE fl.parent_id = ? AND u.is_active = 1
  `).all(parentId) as { id: number; display_name: string }[];

  const children = childRows.map((c) => ({
    id: c.id,
    display_name: c.display_name,
    points: calcPoints(c.id),
    weeklyProgress: calcWeeklyProgress(c.id),
  }));

  // Build notifications
  const notifications: {
    type: string;
    childName: string;
    childId: number;
    message: string;
    detail: string;
    level: 'good' | 'alert' | 'info';
    createdAt: string;
  }[] = [];

  for (const child of children) {
    // 1. Hoàn thành sách gần đây (good)
    const completedStories = db.prepare(`
      SELECT rs.completed_at, st.title, rs.correct_answers, rs.total_questions
      FROM reading_sessions rs
      JOIN stories st ON rs.story_id = st.id
      WHERE rs.student_id = ? AND rs.status = 'completed'
        AND rs.completed_at > datetime('now', '-2 days')
      ORDER BY rs.completed_at DESC
      LIMIT 2
    `).all(child.id) as {
      completed_at: string;
      title: string;
      correct_answers: number;
      total_questions: number;
    }[];

    for (const s of completedStories) {
      notifications.push({
        type: 'completed_story',
        childName: child.display_name,
        childId: child.id,
        message: `${child.display_name} hoàn thành "${s.title}"`,
        detail: `iRead · ${s.correct_answers}/${s.total_questions} câu đúng · +${s.correct_answers * 10}⭐`,
        level: 'good',
        createdAt: s.completed_at,
      });
    }

    // 2. Sai nhiều câu liên tiếp (alert)
    const recentWrong = db.prepare(`
      SELECT COUNT(*) AS cnt FROM wrong_answers
      WHERE student_id = ? AND date > datetime('now', '-1 day')
    `).get(child.id) as { cnt: number };

    if (recentWrong.cnt >= 3) {
      notifications.push({
        type: 'wrong_streak',
        childName: child.display_name,
        childId: child.id,
        message: `${child.display_name} làm sai ${recentWrong.cnt} câu gần đây`,
        detail: 'iMath · 24 giờ qua',
        level: 'alert',
        createdAt: new Date().toISOString(),
      });
    }

    // 3. Không học N ngày (alert nếu >= 2 ngày)
    const lastActivity = db.prepare(`
      SELECT MAX(created_at) AS last FROM score_history WHERE student_id = ?
    `).get(child.id) as { last: string | null };

    if (lastActivity.last) {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastActivity.last).getTime()) / 86400000
      );
      if (daysSince >= 2) {
        notifications.push({
          type: 'inactive',
          childName: child.display_name,
          childId: child.id,
          message: `${child.display_name} chưa học ${daysSince} ngày`,
          detail: 'Hãy nhắc bé học nhé!',
          level: 'alert',
          createdAt: lastActivity.last,
        });
      }
    }

    // 4. Hoàn thành bài toán gần đây (good)
    const completedExercises = db.prepare(`
      SELECT sh.created_at, sh.points_change
      FROM score_history sh
      WHERE sh.student_id = ? AND sh.module = 'imath' AND sh.points_change > 0
        AND sh.created_at > datetime('now', '-1 day')
        AND sh.activity LIKE '%correct%'
      ORDER BY sh.created_at DESC
      LIMIT 1
    `).get(child.id) as { created_at: string; points_change: number } | undefined;

    if (completedExercises) {
      notifications.push({
        type: 'completed_exercise',
        childName: child.display_name,
        childId: child.id,
        message: `${child.display_name} đang làm tốt bài toán`,
        detail: `iMath · +${completedExercises.points_change}⭐ hôm nay`,
        level: 'good',
        createdAt: completedExercises.created_at,
      });
    }
  }

  notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ children, notifications: notifications.slice(0, 5) });
});

// ── GET /api/dashboard/teacher ────────────────────────────────────────────────

router.get('/teacher', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (user.role !== 'teacher') {
    res.status(403).json({ error: 'Chỉ dành cho giáo viên' });
    return;
  }

  const teacherId = user.userId;
  const studentIds = getTeacherStudentIds(teacherId);

  // Empty class — return zeroed data
  if (studentIds.length === 0) {
    res.json({
      classInfo: { totalStudents: 0, activeToday: 0, inactiveCount: 0, needAttentionCount: 0 },
      leaderboard: [],
      notifications: [{
        type: 'class_progress',
        message: 'Lớp chưa có học sinh nào',
        detail: 'Vào tab "Phân lớp" để thêm học sinh',
        level: 'info',
        studentIds: [],
      }],
    });
    return;
  }

  const inList = studentIds.join(',');

  // Active today
  const activeToday = (db.prepare(`
    SELECT COUNT(DISTINCT student_id) AS cnt
    FROM score_history
    WHERE student_id IN (${inList})
      AND created_at >= date('now')
  `).get() as { cnt: number }).cnt;

  // Inactive >= 3 days
  const inactiveStudents: number[] = [];
  for (const sid of studentIds) {
    const last = db.prepare(
      `SELECT MAX(created_at) AS last FROM score_history WHERE student_id=?`
    ).get(sid) as { last: string | null };
    const days = last?.last
      ? Math.floor((Date.now() - new Date(last.last).getTime()) / 86400000)
      : 999;
    if (days >= 3) inactiveStudents.push(sid);
  }

  // Need attention: >= 5 wrong answers in last 24h
  const needAttentionStudents: number[] = [];
  for (const sid of studentIds) {
    const w = db.prepare(
      `SELECT COUNT(*) AS cnt FROM wrong_answers WHERE student_id=? AND date > datetime('now', '-1 day')`
    ).get(sid) as { cnt: number };
    if (w.cnt >= 5) needAttentionStudents.push(sid);
  }

  const classInfo = {
    totalStudents: studentIds.length,
    activeToday,
    inactiveCount: inactiveStudents.length,
    needAttentionCount: needAttentionStudents.length,
  };

  // Weekly leaderboard (top 5)
  const lbRows = db.prepare(`
    SELECT student_id, SUM(points_change) AS weekly_pts
    FROM score_history
    WHERE student_id IN (${inList})
      AND points_change > 0
      AND created_at > datetime('now', '-7 days')
    GROUP BY student_id
    ORDER BY weekly_pts DESC
    LIMIT 5
  `).all() as { student_id: number; weekly_pts: number }[];

  // Max points for relative bar
  const maxPoints = lbRows.length > 0 ? lbRows[0].weekly_pts : 0;

  const leaderboard = lbRows.map((row, i) => {
    const nameRow = db.prepare(
      'SELECT display_name FROM users WHERE id=?'
    ).get(row.student_id) as { display_name: string } | undefined;
    return {
      rank: i + 1,
      studentId: row.student_id,
      name: nameRow?.display_name ?? `HS ${row.student_id}`,
      points: row.weekly_pts,
      maxPoints,
    };
  });

  // Notifications
  const notifications: {
    type: string;
    message: string;
    detail: string;
    level: 'good' | 'alert' | 'info';
    studentIds?: number[];
  }[] = [];

  // Inactive group alert
  if (inactiveStudents.length > 0) {
    const names = inactiveStudents.map((sid) => {
      const r = db.prepare('SELECT display_name FROM users WHERE id=?').get(sid) as
        | { display_name: string }
        | undefined;
      return r?.display_name ?? `HS ${sid}`;
    });
    notifications.push({
      type: 'inactive_group',
      message: `${inactiveStudents.length} học sinh chưa học >= 3 ngày`,
      detail: names.slice(0, 3).join(', ') + (names.length > 3 ? ` và ${names.length - 3} em khác` : ''),
      level: 'alert',
      studentIds: inactiveStudents,
    });
  }

  // Wrong streak alert
  if (needAttentionStudents.length > 0) {
    const names = needAttentionStudents.map((sid) => {
      const r = db.prepare('SELECT display_name FROM users WHERE id=?').get(sid) as
        | { display_name: string }
        | undefined;
      return r?.display_name ?? `HS ${sid}`;
    });
    notifications.push({
      type: 'wrong_streak',
      message: `${needAttentionStudents.length} học sinh làm sai nhiều câu`,
      detail: names.slice(0, 3).join(', ') + (names.length > 3 ? ` và ${names.length - 3} em khác` : ''),
      level: 'alert',
      studentIds: needAttentionStudents,
    });
  }

  // Class progress — completed stories this week
  const completedStoriesCount = (db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM reading_sessions
    WHERE student_id IN (${inList})
      AND status = 'completed'
      AND completed_at > datetime('now', '-7 days')
  `).get() as { cnt: number }).cnt;

  if (completedStoriesCount > 0) {
    notifications.push({
      type: 'class_progress',
      message: `${completedStoriesCount} lần hoàn thành sách tuần này`,
      detail: 'iRead · 7 ngày qua',
      level: 'good',
    });
  }

  // General class activity info
  const completedExercisesCount = (db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM sessions
    WHERE student_id IN (${inList})
      AND completed = 1
      AND created_at > datetime('now', '-7 days')
  `).get() as { cnt: number }).cnt;

  if (completedExercisesCount > 0) {
    notifications.push({
      type: 'class_progress',
      message: `${completedExercisesCount} bài tập toán đã hoàn thành tuần này`,
      detail: 'iMath · 7 ngày qua',
      level: 'info',
    });
  }

  if (notifications.length === 0) {
    notifications.push({
      type: 'class_progress',
      message: 'Lớp học đang hoạt động bình thường',
      detail: `${activeToday}/${studentIds.length} học sinh học hôm nay`,
      level: 'info',
    });
  }

  res.json({ classInfo, leaderboard, notifications: notifications.slice(0, 5) });
});

export default router;
