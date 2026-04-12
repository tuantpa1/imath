import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { AuthRequest } from '../middleware/authMiddleware';
import { db } from '../database/db';
import { getTeacherStudentIds } from '../services/storageServiceSQLite';
import { extractTextFromImage, generateReadingQuestions } from '../services/geminiService';

const router = Router();

const IREAD_IMAGES_DIR = path.resolve(__dirname, '../../../data/uploads/iread');
if (!fs.existsSync(IREAD_IMAGES_DIR)) fs.mkdirSync(IREAD_IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IREAD_IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  },
});

function authReq(req: Request): AuthRequest {
  return req as AuthRequest;
}

function getParentStudentIds(parentId: number): number[] {
  const rows = db.prepare(
    'SELECT student_id FROM family_links WHERE parent_id = ?'
  ).all(parentId) as { student_id: number }[];
  return rows.map((r) => r.student_id);
}

// ── POST /api/iread/stories ───────────────────────────────────────────────────

router.post('/stories', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (!['teacher', 'parent'].includes(user.role)) {
    res.status(403).json({ error: 'Chỉ giáo viên hoặc phụ huynh mới có thể tạo truyện' });
    return;
  }

  const { title, language, level, cover_image_url } = req.body as {
    title?: string;
    language?: string;
    level?: string;
    cover_image_url?: string;
  };

  if (!title || !language) {
    res.status(400).json({ error: 'title và language là bắt buộc' });
    return;
  }
  if (!['vi', 'en'].includes(language)) {
    res.status(400).json({ error: 'language phải là "vi" hoặc "en"' });
    return;
  }

  const result = db.prepare(
    'INSERT INTO stories (title, language, level, cover_image_url, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(title, language, level ?? 'elementary', cover_image_url ?? null, user.userId);

  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(story);
});

// ── POST /api/iread/stories/:storyId/pages ────────────────────────────────────

router.post('/stories/:storyId/pages', upload.single('image'), async (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (!['teacher', 'parent'].includes(user.role)) {
    res.status(403).json({ error: 'Chỉ giáo viên hoặc phụ huynh mới có thể upload trang sách' });
    return;
  }

  const storyId = parseInt(req.params.storyId as string, 10);
  const story = db.prepare('SELECT * FROM stories WHERE id = ? AND created_by = ?').get(storyId, user.userId) as
    | { id: number; title: string; language: string; total_pages: number }
    | undefined;

  if (!story) {
    res.status(404).json({ error: 'Không tìm thấy truyện hoặc không có quyền truy cập' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'Thiếu file ảnh' });
    return;
  }

  const pageNumber = parseInt(req.body.page_number as string, 10) || (story.total_pages + 1);
  const imageUrl = `/uploads/iread/${req.file.filename}`;

  // Insert page with pending OCR
  const insertResult = db.prepare(
    'INSERT INTO story_pages (story_id, page_number, image_url, ocr_status) VALUES (?, ?, ?, ?)'
  ).run(storyId, pageNumber, imageUrl, 'pending');

  const pageId = insertResult.lastInsertRowid as number;

  // Update story total_pages
  db.prepare('UPDATE stories SET total_pages = total_pages + 1 WHERE id = ?').run(storyId);

  // Trigger OCR
  let extractedText = '';
  try {
    const base64 = fs.readFileSync(req.file.path).toString('base64');
    extractedText = await extractTextFromImage(base64, req.file.mimetype);
    db.prepare(
      'UPDATE story_pages SET extracted_text = ?, ocr_status = ? WHERE id = ?'
    ).run(extractedText, 'done', pageId);
  } catch (err) {
    db.prepare('UPDATE story_pages SET ocr_status = ? WHERE id = ?').run('failed', pageId);
    console.error('[iRead] OCR failed:', err);
  }

  const page = db.prepare('SELECT * FROM story_pages WHERE id = ?').get(pageId);
  res.status(201).json(page);
});

// ── POST /api/iread/stories/:storyId/generate-questions ──────────────────────

router.post('/stories/:storyId/generate-questions', async (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (!['teacher', 'parent'].includes(user.role)) {
    res.status(403).json({ error: 'Không có quyền truy cập' });
    return;
  }

  const storyId = parseInt(req.params.storyId as string, 10);
  const story = db.prepare('SELECT * FROM stories WHERE id = ? AND created_by = ?').get(storyId, user.userId) as
    | { id: number; title: string; language: 'vi' | 'en' }
    | undefined;

  if (!story) {
    res.status(404).json({ error: 'Không tìm thấy truyện hoặc không có quyền truy cập' });
    return;
  }

  const pages = db.prepare(
    'SELECT extracted_text FROM story_pages WHERE story_id = ? AND ocr_status = ? ORDER BY page_number'
  ).all(storyId, 'done') as { extracted_text: string }[];

  if (pages.length === 0) {
    res.status(400).json({ error: 'Chưa có trang sách nào được OCR thành công' });
    return;
  }

  const combinedText = pages.map((p) => p.extracted_text).join('\n\n');

  let questions;
  try {
    questions = await generateReadingQuestions(combinedText, story.language, story.title);
  } catch (err) {
    console.error('[iRead] Question generation failed:', err);
    res.status(500).json({ error: 'Tạo câu hỏi thất bại. Vui lòng thử lại.' });
    return;
  }

  // Delete old questions and insert new ones
  db.prepare('DELETE FROM reading_questions WHERE story_id = ?').run(storyId);

  const insertQ = db.prepare(
    'INSERT INTO reading_questions (story_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertAll = db.transaction((qs: typeof questions) => {
    for (const q of qs) {
      insertQ.run(storyId, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation ?? '');
    }
  });
  insertAll(questions);

  const saved = db.prepare('SELECT * FROM reading_questions WHERE story_id = ?').all(storyId);
  res.json(saved);
});

// ── GET /api/iread/stories/:storyId/questions ─────────────────────────────────

router.get('/stories/:storyId/questions', (req: Request, res: Response) => {
  const storyId = parseInt(req.params.storyId as string, 10);
  const questions = db.prepare(
    'SELECT * FROM reading_questions WHERE story_id = ? ORDER BY id'
  ).all(storyId);
  res.json(questions);
});

// ── POST /api/iread/stories/:storyId/assign ───────────────────────────────────

router.post('/stories/:storyId/assign', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (!['teacher', 'parent'].includes(user.role)) {
    res.status(403).json({ error: 'Không có quyền truy cập' });
    return;
  }

  const storyId = parseInt(req.params.storyId as string, 10);
  const story = db.prepare('SELECT id FROM stories WHERE id = ? AND created_by = ?').get(storyId, user.userId);
  if (!story) {
    res.status(404).json({ error: 'Không tìm thấy truyện hoặc không có quyền truy cập' });
    return;
  }

  const { studentIds } = req.body as { studentIds?: number[] };
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: 'studentIds là bắt buộc' });
    return;
  }

  // Verify students belong to this teacher/parent
  const allowedIds =
    user.role === 'teacher'
      ? getTeacherStudentIds(user.userId)
      : getParentStudentIds(user.userId);

  const allowedSet = new Set(allowedIds);
  const validIds = studentIds.filter((id) => allowedSet.has(id));

  if (validIds.length === 0) {
    res.status(403).json({ error: 'Không có học sinh hợp lệ để giao truyện' });
    return;
  }

  const insertAssign = db.prepare(
    'INSERT OR IGNORE INTO story_assignments (story_id, student_id, assigned_by) VALUES (?, ?, ?)'
  );
  const doInsert = db.transaction((ids: number[]) => {
    for (const sid of ids) insertAssign.run(storyId, sid, user.userId);
  });
  doInsert(validIds);

  res.json({ ok: true, assigned: validIds.length });
});

// ── GET /api/iread/stories ────────────────────────────────────────────────────

router.get('/stories', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (!['teacher', 'parent'].includes(user.role)) {
    res.status(403).json({ error: 'Không có quyền truy cập' });
    return;
  }

  const stories = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM reading_questions rq WHERE rq.story_id = s.id) AS question_count,
      (SELECT COUNT(*) FROM story_assignments sa WHERE sa.story_id = s.id) AS assigned_count
    FROM stories s
    WHERE s.created_by = ? AND s.is_active = 1
    ORDER BY s.created_at DESC
  `).all(user.userId);

  res.json(stories);
});

// ── GET /api/iread/bookshelf ──────────────────────────────────────────────────

router.get('/bookshelf', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (user.role !== 'student') {
    res.status(403).json({ error: 'Chỉ dành cho học sinh' });
    return;
  }

  const books = db.prepare(`
    SELECT
      s.id, s.title, s.language, s.level, s.cover_image_url, s.total_pages,
      COALESCE(rs.status, 'not_started') AS status,
      COALESCE(rs.current_page, 1) AS current_page,
      rs.score, rs.correct_answers, rs.total_questions, rs.completed_at
    FROM story_assignments sa
    JOIN stories s ON s.id = sa.story_id
    LEFT JOIN reading_sessions rs ON rs.story_id = s.id AND rs.student_id = ?
    WHERE sa.student_id = ? AND s.is_active = 1
    ORDER BY s.created_at DESC
  `).all(user.userId, user.userId);

  res.json(books);
});

// ── GET /api/iread/stories/:storyId/pages ─────────────────────────────────────

router.get('/stories/:storyId/pages', (req: Request, res: Response) => {
  const storyId = parseInt(req.params.storyId as string, 10);
  const pages = db.prepare(
    'SELECT * FROM story_pages WHERE story_id = ? ORDER BY page_number'
  ).all(storyId);
  res.json(pages);
});

// ── POST /api/iread/sessions ──────────────────────────────────────────────────

router.post('/sessions', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (user.role !== 'student') {
    res.status(403).json({ error: 'Chỉ dành cho học sinh' });
    return;
  }

  const { story_id } = req.body as { story_id?: number };
  if (!story_id) {
    res.status(400).json({ error: 'story_id là bắt buộc' });
    return;
  }

  // Check assignment
  const assigned = db.prepare(
    'SELECT 1 FROM story_assignments WHERE story_id = ? AND student_id = ?'
  ).get(story_id, user.userId);
  if (!assigned) {
    res.status(403).json({ error: 'Bạn chưa được giao truyện này' });
    return;
  }

  const existing = db.prepare(
    'SELECT * FROM reading_sessions WHERE story_id = ? AND student_id = ?'
  ).get(story_id, user.userId);

  if (existing) {
    res.json(existing);
    return;
  }

  const result = db.prepare(
    'INSERT INTO reading_sessions (story_id, student_id, status, started_at) VALUES (?, ?, ?, ?)'
  ).run(story_id, user.userId, 'reading', new Date().toISOString());

  const session = db.prepare('SELECT * FROM reading_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(session);
});

// ── PATCH /api/iread/sessions/:sessionId ─────────────────────────────────────

router.patch('/sessions/:sessionId', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (user.role !== 'student') {
    res.status(403).json({ error: 'Chỉ dành cho học sinh' });
    return;
  }

  const sessionId = parseInt(req.params.sessionId as string, 10);
  const session = db.prepare(
    'SELECT * FROM reading_sessions WHERE id = ? AND student_id = ?'
  ).get(sessionId, user.userId) as
    | { id: number; story_id: number; student_id: number; status: string; correct_answers: number }
    | undefined;

  if (!session) {
    res.status(404).json({ error: 'Không tìm thấy phiên đọc' });
    return;
  }

  const { current_page, status, score, correct_answers, total_questions } = req.body as {
    current_page?: number;
    status?: string;
    score?: number;
    correct_answers?: number;
    total_questions?: number;
  };

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (current_page !== undefined) { updates.push('current_page = ?'); params.push(current_page); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (score !== undefined) { updates.push('score = ?'); params.push(score); }
  if (correct_answers !== undefined) { updates.push('correct_answers = ?'); params.push(correct_answers); }
  if (total_questions !== undefined) { updates.push('total_questions = ?'); params.push(total_questions); }

  if (status === 'completed') {
    updates.push('completed_at = ?');
    params.push(new Date().toISOString());
  }

  if (updates.length > 0) {
    params.push(sessionId);
    db.prepare(`UPDATE reading_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  // Award points when completing
  if (status === 'completed' && session.status !== 'completed') {
    const earnedPoints = (correct_answers ?? session.correct_answers ?? 0) * 10;
    if (earnedPoints > 0) {
      const story = db.prepare('SELECT title FROM stories WHERE id = ?').get(session.story_id) as { title: string } | undefined;
      const activity = `iRead: ${story?.title ?? 'Đọc truyện'}`;

      db.prepare(
        'INSERT INTO score_history (student_id, points_change, activity, module) VALUES (?, ?, ?, ?)'
      ).run(user.userId, earnedPoints, activity, 'iread');

      // Upsert into scores table
      const existingScore = db.prepare(
        'SELECT id, total_points FROM scores WHERE student_id = ? AND module = ?'
      ).get(user.userId, 'iread') as { id: number; total_points: number } | undefined;

      if (existingScore) {
        db.prepare(
          'UPDATE scores SET total_points = total_points + ? WHERE id = ?'
        ).run(earnedPoints, existingScore.id);
      } else {
        db.prepare(
          'INSERT INTO scores (student_id, session_id, total_points, module) VALUES (?, ?, ?, ?)'
        ).run(user.userId, `iread_${session.story_id}`, earnedPoints, 'iread');
      }
    }
  }

  const updated = db.prepare('SELECT * FROM reading_sessions WHERE id = ?').get(sessionId);
  res.json(updated);
});

// ── DELETE /api/iread/questions/:questionId ───────────────────────────────────

router.delete('/questions/:questionId', (req: Request, res: Response) => {
  const { user } = authReq(req);
  if (!['teacher', 'parent'].includes(user.role)) {
    res.status(403).json({ error: 'Không có quyền truy cập' });
    return;
  }

  const questionId = parseInt(req.params.questionId as string, 10);

  // Verify ownership via story
  const question = db.prepare(`
    SELECT rq.id FROM reading_questions rq
    JOIN stories s ON s.id = rq.story_id
    WHERE rq.id = ? AND s.created_by = ?
  `).get(questionId, user.userId);

  if (!question) {
    res.status(404).json({ error: 'Không tìm thấy câu hỏi hoặc không có quyền xóa' });
    return;
  }

  db.prepare('DELETE FROM reading_questions WHERE id = ?').run(questionId);
  res.json({ ok: true });
});

export default router;
