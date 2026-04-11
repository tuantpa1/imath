import fs from 'fs';
import path from 'path';
import { db } from '../database/db';
import {
  Scores,
  ScoreHistory,
  ScoreRedeemed,
  Exercises,
  Session,
  Question,
  MultiAnswerQuestion,
  SingleAnswerQuestion,
  FractionQuestion,
  MultipleChoiceQuestion,
  Rewards,
} from './storageService';

const DATA_DIR = path.resolve(__dirname, '../../../data');
const REWARDS_PATH = path.join(DATA_DIR, 'rewards.json');

// --- Types ---

// Normalize whatever the AI returns for a comparison question into a valid symbol
const VALID_SYMBOLS = new Set(['<', '>', '=']);
const WORD_TO_SYMBOL: Record<string, string> = {
  'nhỏ hơn': '<', 'bé hơn': '<', 'ít hơn': '<', 'less than': '<',
  'lớn hơn': '>', 'nhiều hơn': '>', 'greater than': '>',
  'bằng': '=', 'bằng nhau': '=', 'equal': '=', 'equals': '=',
};

function normalizeComparisonSymbol(q: { answer?: unknown; answer_text?: string | null }): string | null {
  const candidates = [q.answer_text, q.answer !== null && q.answer !== undefined ? String(q.answer) : null];
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c).trim();
    if (VALID_SYMBOLS.has(s)) return s;
    const lower = s.toLowerCase();
    for (const [word, sym] of Object.entries(WORD_TO_SYMBOL)) {
      if (lower.includes(word)) return sym;
    }
  }
  return null;
}

export interface RawClaudeQuestion {
  question: string;
  type: string;
  difficulty: 'easy' | 'medium' | 'hard';
  answer?: number;
  answer_text?: string;  // fraction questions: "3/5"
  answers?: Array<{ label: string; answer: number; unit: string }>;
  order_matters?: boolean;
  choices?: { options: string[]; correct_index: number };  // multiple_choice
  unit?: string;
}

// --- Errors ---

export class ForbiddenError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// --- Helpers ---

function normalizeDate(raw: string): string {
  return raw.split('T')[0].split(' ')[0];
}

/** Kept for migrate.ts compatibility */
export function getDefaultStudentId(): number {
  const row = db
    .prepare("SELECT id FROM users WHERE username = 'student1' AND role = 'student'")
    .get() as { id: number } | undefined;
  if (!row) {
    throw new Error('Default student (student1) not found. Run: npm run migrate');
  }
  return row.id;
}

// --- Scores ---

export function readScores(studentId: number): Scores {
  const earnedRow = db
    .prepare('SELECT COALESCE(SUM(points_change), 0) AS total FROM score_history WHERE student_id = ?')
    .get(studentId) as { total: number };
  const redeemedRow = db
    .prepare('SELECT COALESCE(SUM(points), 0) AS total FROM redemptions WHERE student_id = ?')
    .get(studentId) as { total: number };

  const historyRows = db
    .prepare('SELECT points_change AS earned, activity, created_at FROM score_history WHERE student_id = ? ORDER BY id ASC')
    .all(studentId) as Array<{ earned: number; activity: string; created_at: string }>;

  const history: ScoreHistory[] = historyRows.map((r) => ({
    date: normalizeDate(r.created_at),
    earned: r.earned,
    activity: r.activity,
  }));

  const redeemedRows = db
    .prepare('SELECT points, date FROM redemptions WHERE student_id = ? ORDER BY id ASC')
    .all(studentId) as Array<{ points: number; date: string }>;

  const redeemed: ScoreRedeemed[] = redeemedRows.map((r) => ({
    date: normalizeDate(r.date),
    points: r.points,
    amount: 0,
  }));

  const wrongRows = db
    .prepare('SELECT question_text, correct_answer, student_answer, type, parts_json, date FROM wrong_answers WHERE student_id = ? ORDER BY id ASC')
    .all(studentId) as Array<{
    question_text: string;
    correct_answer: string;
    student_answer: string;
    type: string;
    parts_json: string | null;
    date: string;
  }>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrongQuestions: any[] = wrongRows.map((r) => {
    const date = normalizeDate(r.date);
    if (r.type === 'multi_answer' && r.parts_json) {
      return { question: r.question_text, type: 'multi_answer', date, parts: JSON.parse(r.parts_json) };
    }
    return { question: r.question_text, type: r.type || 'single', correctAnswer: r.correct_answer, studentAnswer: r.student_answer, date };
  });

  return {
    totalPoints: earnedRow.total - redeemedRow.total,
    history,
    redeemed,
    wrongQuestions,
  };
}

export function writeScores(studentId: number, data: Scores): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM score_history WHERE student_id = ?').run(studentId);
    const insertHistory = db.prepare(
      'INSERT INTO score_history (student_id, points_change, activity, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const h of data.history) {
      insertHistory.run(studentId, h.earned, h.activity, h.date);
    }

    db.prepare('DELETE FROM redemptions WHERE student_id = ?').run(studentId);
    const insertRedemption = db.prepare(
      'INSERT INTO redemptions (student_id, points, redeemed_by, date) VALUES (?, ?, ?, ?)'
    );
    for (const r of data.redeemed) {
      insertRedemption.run(studentId, r.points, studentId, r.date);
    }

    db.prepare('DELETE FROM wrong_answers WHERE student_id = ?').run(studentId);
    const insertWrong = db.prepare(
      `INSERT INTO wrong_answers (student_id, question_id, question_text, correct_answer, student_answer, type, parts_json, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const w of data.wrongQuestions as any[]) {
      if (w.type === 'multi_answer' && w.parts) {
        insertWrong.run(studentId, '', w.question, '', '', 'multi_answer', JSON.stringify(w.parts), w.date);
      } else {
        insertWrong.run(studentId, '', w.question, w.correctAnswer ?? '', w.studentAnswer ?? '', w.type ?? 'single', null, w.date);
      }
    }
  });
  tx();
}

export function redeemPoints(studentId: number, points: number, redeemedBy: number): void {
  const today = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO redemptions (student_id, points, redeemed_by, date) VALUES (?, ?, ?, ?)').run(
    studentId, points, redeemedBy, today
  );
}

export function getTotalPoints(studentId: number): number {
  const earned = db.prepare('SELECT COALESCE(SUM(points_change), 0) AS t FROM score_history WHERE student_id = ?').get(studentId) as { t: number };
  const spent = db.prepare('SELECT COALESCE(SUM(points), 0) AS t FROM redemptions WHERE student_id = ?').get(studentId) as { t: number };
  return earned.t - spent.t;
}

// --- Exercises ---

export function readExercises(studentId: number): Exercises {
  const sessionRows = db
    .prepare('SELECT id, created_at, image_paths, completed, is_extra FROM sessions WHERE student_id = ? AND superseded = 0 ORDER BY created_at ASC, id ASC')
    .all(studentId) as Array<{
    id: string; created_at: string; image_paths: string; completed: number; is_extra: number;
  }>;

  const sessions: Session[] = sessionRows.map((s) => {
    const questionRows = db
      .prepare('SELECT id, question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit FROM questions WHERE session_id = ? ORDER BY rowid ASC')
      .all(s.id) as Array<{
      id: string; question_text: string; type: string; difficulty: 'easy' | 'medium' | 'hard';
      answer: number | null; answer_text: string | null; answers_json: string | null; order_matters: number; unit: string;
    }>;

    const questions: Question[] = questionRows.map((q) => {
      if (q.type === 'multiple_choice' && q.answers_json) {
        const mc: MultipleChoiceQuestion = {
          id: q.id, question: q.question_text, type: 'multiple_choice', difficulty: q.difficulty,
          choices: JSON.parse(q.answers_json) as { options: string[]; correct_index: number }, unit: q.unit,
        };
        return mc;
      }
      if (q.type === 'multi_answer' && q.answers_json) {
        const multi: MultiAnswerQuestion = {
          id: q.id, question: q.question_text, type: 'multi_answer', difficulty: q.difficulty,
          order_matters: q.order_matters === 1, answers: JSON.parse(q.answers_json), unit: q.unit,
        };
        return multi;
      }
      if (q.type === 'fraction') {
        const frac: FractionQuestion = {
          id: q.id, question: q.question_text, type: 'fraction', difficulty: q.difficulty,
          answer_text: q.answer_text ?? String(q.answer ?? ''), unit: q.unit,
        };
        return frac;
      }
      const singleAnswerText = q.type === 'comparison'
        ? (normalizeComparisonSymbol({ answer: q.answer, answer_text: q.answer_text }) ?? undefined)
        : (q.answer_text ?? undefined);
      const single: SingleAnswerQuestion = {
        id: q.id, question: q.question_text, type: q.type, difficulty: q.difficulty,
        answer: q.answer ?? 0, answer_text: singleAnswerText, unit: q.unit,
      };
      return single;
    });

    return {
      id: s.id,
      createdAt: normalizeDate(s.created_at),
      imagePaths: JSON.parse(s.image_paths),
      completed: s.completed === 1,
      isExtra: s.is_extra === 1,
      questions,
    };
  });

  return { sessions };
}

export function writeExercises(studentId: number, data: Exercises): void {
  const createdBy = (db.prepare("SELECT id FROM users WHERE role = 'teacher' LIMIT 1").get() as { id: number } | undefined)?.id ?? studentId;

  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM sessions WHERE student_id = ?').all(studentId) as Array<{ id: string }>;
    for (const s of existing) {
      db.prepare('DELETE FROM questions WHERE session_id = ?').run(s.id);
    }
    db.prepare('DELETE FROM sessions WHERE student_id = ?').run(studentId);

    const insertSession = db.prepare(
      `INSERT INTO sessions (id, created_by, student_id, image_paths, created_at, question_count, is_extra, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertQuestion = db.prepare(
      `INSERT INTO questions (id, session_id, question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const session of data.sessions) {
      insertSession.run(session.id, createdBy, studentId, JSON.stringify(session.imagePaths ?? []), session.createdAt, session.questions.length, session.isExtra ? 1 : 0, session.completed ? 1 : 0);
      for (const q of session.questions) {
        if ('answers' in q) {
          insertQuestion.run(q.id, session.id, q.question, 'multi_answer', q.difficulty, null, null, JSON.stringify(q.answers), q.order_matters ? 1 : 0, q.unit ?? '');
        } else if (q.type === 'fraction' && 'answer_text' in q) {
          insertQuestion.run(q.id, session.id, q.question, 'fraction', q.difficulty, null, (q as FractionQuestion).answer_text, null, 1, q.unit ?? '');
        } else {
          insertQuestion.run(q.id, session.id, q.question, q.type, q.difficulty, (q as SingleAnswerQuestion).answer, null, null, 1, q.unit ?? '');
        }
      }
    }
  });
  tx();
}

export function createSession(
  studentId: number,
  createdBy: number,
  imagePaths: string[],
  rawQuestions: RawClaudeQuestion[],
  isExtra: boolean
): Session {
  const now = Date.now();
  const sessionId = `session_${now}_${studentId}`;
  const today = new Date().toISOString().split('T')[0];

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, created_by, student_id, image_paths, created_at, question_count, is_extra, completed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(sessionId, createdBy, studentId, JSON.stringify(imagePaths), today, rawQuestions.length, isExtra ? 1 : 0);

    const insertQ = db.prepare(
      `INSERT INTO questions (id, session_id, question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    rawQuestions.forEach((q, i) => {
      const qId = `${sessionId}_q${i + 1}`;
      if (q.type === 'multiple_choice' && q.choices) {
        insertQ.run(qId, sessionId, q.question, 'multiple_choice', q.difficulty, null, null, JSON.stringify(q.choices), 1, q.unit ?? '');
      } else if (q.answers) {
        insertQ.run(qId, sessionId, q.question, 'multi_answer', q.difficulty, null, null, JSON.stringify(q.answers), (q.order_matters ?? true) ? 1 : 0, q.unit ?? '');
      } else if (q.type === 'comparison') {
        const symbol = normalizeComparisonSymbol(q);
        insertQ.run(qId, sessionId, q.question, 'comparison', q.difficulty, null, symbol, null, 1, q.unit ?? '');
      } else if (q.type === 'fraction' && q.answer_text) {
        insertQ.run(qId, sessionId, q.question, 'fraction', q.difficulty, null, q.answer_text, null, 1, q.unit ?? '');
      } else {
        insertQ.run(qId, sessionId, q.question, q.type, q.difficulty, q.answer ?? 0, null, null, 1, q.unit ?? '');
      }
    });
  });
  tx();

  const questions: Question[] = rawQuestions.map((q, i) => {
    const qId = `${sessionId}_q${i + 1}`;
    if (q.type === 'multiple_choice' && q.choices) {
      const mc: MultipleChoiceQuestion = { id: qId, question: q.question, type: 'multiple_choice', difficulty: q.difficulty, choices: q.choices, unit: q.unit ?? '' };
      return mc;
    }
    if (q.answers) {
      const m: MultiAnswerQuestion = { id: qId, question: q.question, type: 'multi_answer', difficulty: q.difficulty, order_matters: q.order_matters ?? true, answers: q.answers, unit: q.unit ?? '' };
      return m;
    }
    if (q.type === 'fraction' && q.answer_text) {
      const f: FractionQuestion = { id: qId, question: q.question, type: 'fraction', difficulty: q.difficulty, answer_text: q.answer_text, unit: q.unit ?? '' };
      return f;
    }
    const answerText = q.type === 'comparison'
      ? (normalizeComparisonSymbol(q) ?? undefined)
      : q.answer_text;
    const s: SingleAnswerQuestion = { id: qId, question: q.question, type: q.type, difficulty: q.difficulty, answer: q.answer ?? 0, answer_text: answerText, unit: q.unit ?? '' };
    return s;
  });

  return { id: sessionId, createdAt: today, imagePaths, completed: false, isExtra, questions };
}

/**
 * Asserts that the given session belongs to the given student.
 * Throws ForbiddenError if the session doesn't exist or belongs to a different student.
 * Call this before any session UPDATE / DELETE that uses a client-supplied sessionId.
 */
export function verifySessionOwnership(sessionId: string, studentId: number): void {
  const row = db
    .prepare('SELECT id FROM sessions WHERE id = ? AND student_id = ?')
    .get(sessionId, studentId);
  if (!row) throw new ForbiddenError('Session not found or access denied');
}

export function markSessionComplete(sessionId: string, studentId: number): void {
  verifySessionOwnership(sessionId, studentId);
  db.prepare('UPDATE sessions SET completed = 1 WHERE id = ? AND student_id = ?')
    .run(sessionId, studentId);
}

export function deleteQuestion(questionId: string, userId: number, role: string): number {
  const qRow = db
    .prepare('SELECT session_id FROM questions WHERE id = ?')
    .get(questionId) as { session_id: string } | undefined;
  if (!qRow) throw new Error('Question not found');

  const sessionRow = db
    .prepare('SELECT created_by FROM sessions WHERE id = ?')
    .get(qRow.session_id) as { created_by: number } | undefined;
  if (!sessionRow) throw new Error('Session not found');
  if (role === 'parent' && sessionRow.created_by !== userId) {
    throw new ForbiddenError('Access denied');
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM questions WHERE id = ?').run(questionId);
    const remaining = (
      db.prepare('SELECT COUNT(*) AS c FROM questions WHERE session_id = ?')
        .get(qRow.session_id) as { c: number }
    ).c;
    if (remaining === 0) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(qRow.session_id);
    } else {
      db.prepare('UPDATE sessions SET question_count = ? WHERE id = ?').run(remaining, qRow.session_id);
    }
    return remaining;
  });
  return tx();
}

/**
 * Generates questions for ALL active students in one batch:
 * - Deletes every incomplete session per student (completed sessions preserved)
 * - Creates one new session per student with the same rawQuestions
 * Returns the number of students that received sessions.
 */
export function createSessionForAllStudents(
  createdBy: number,
  imagePaths: string[],
  rawQuestions: RawClaudeQuestion[],
  studentIds?: number[],
): number {
  const students: Array<{ id: number }> = studentIds !== undefined
    ? studentIds.map((id) => ({ id }))
    : db.prepare("SELECT id FROM users WHERE role = 'student' AND is_active = 1").all() as Array<{ id: number }>;

  if (students.length === 0) return 0;

  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const imagePathsJson = JSON.stringify(imagePaths);

  const tx = db.transaction(() => {
    for (const { id: studentId } of students) {
      // Mark all incomplete sessions as superseded (preserve for teacher history)
      db.prepare('UPDATE sessions SET superseded = 1 WHERE student_id = ? AND completed = 0').run(studentId);

      // Create new session
      const sessionId = `session_all_${now}_${studentId}`;
      db.prepare(
        `INSERT INTO sessions (id, created_by, student_id, image_paths, created_at, question_count, is_extra, completed)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)`
      ).run(sessionId, createdBy, studentId, imagePathsJson, today, rawQuestions.length);

      const insertQ = db.prepare(
        `INSERT INTO questions (id, session_id, question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      rawQuestions.forEach((q, i) => {
        const qId = `${sessionId}_q${i + 1}`;
        if (q.type === 'multiple_choice' && q.choices) {
          insertQ.run(qId, sessionId, q.question, 'multiple_choice', q.difficulty, null, null, JSON.stringify(q.choices), 1, q.unit ?? '');
        } else if (q.answers) {
          insertQ.run(qId, sessionId, q.question, 'multi_answer', q.difficulty, null, null, JSON.stringify(q.answers), (q.order_matters ?? true) ? 1 : 0, q.unit ?? '');
        } else if (q.type === 'fraction' && q.answer_text) {
          insertQ.run(qId, sessionId, q.question, 'fraction', q.difficulty, null, q.answer_text, null, 1, q.unit ?? '');
        } else {
          insertQ.run(qId, sessionId, q.question, q.type, q.difficulty, q.answer ?? 0, null, null, 1, q.unit ?? '');
        }
      });
    }
  });
  tx();

  return students.length;
}

export function deleteAllSessions(studentId: number): void {
  const tx = db.transaction(() => {
    const sessions = db.prepare('SELECT id FROM sessions WHERE student_id = ?').all(studentId) as { id: string }[];
    for (const s of sessions) {
      db.prepare('DELETE FROM questions WHERE session_id = ?').run(s.id);
    }
    db.prepare('DELETE FROM sessions WHERE student_id = ?').run(studentId);
  });
  tx();
}

/**
 * Copies questions from a draft/preview session to new sessions for each student,
 * then deletes the source draft session.
 * Returns the number of students that received sessions.
 */
export function distributeSessionToStudents(
  sourceSessionId: string,
  createdBy: number,
  studentIds: number[],
): number {
  if (studentIds.length === 0) return 0;

  const sourceSession = db.prepare(
    'SELECT image_paths, created_at FROM sessions WHERE id = ? AND created_by = ?'
  ).get(sourceSessionId, createdBy) as { image_paths: string; created_at: string } | undefined;
  if (!sourceSession) throw new Error('Draft session not found');

  const sourceQuestions = db.prepare(
    'SELECT question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit FROM questions WHERE session_id = ? ORDER BY rowid ASC'
  ).all(sourceSessionId) as Array<{
    question_text: string; type: string; difficulty: string;
    answer: number | null; answer_text: string | null; answers_json: string | null;
    order_matters: number; unit: string;
  }>;

  if (sourceQuestions.length === 0) throw new Error('No questions in draft session');

  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  const tx = db.transaction(() => {
    for (const studentId of studentIds) {
      // Mark all incomplete sessions as superseded (preserve for teacher history)
      db.prepare('UPDATE sessions SET superseded = 1 WHERE student_id = ? AND completed = 0').run(studentId);

      const sessionId = `session_dist_${now}_${studentId}`;
      db.prepare(
        `INSERT INTO sessions (id, created_by, student_id, image_paths, created_at, question_count, is_extra, completed)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)`
      ).run(sessionId, createdBy, studentId, sourceSession.image_paths, today, sourceQuestions.length);

      const insertQ = db.prepare(
        `INSERT INTO questions (id, session_id, question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      sourceQuestions.forEach((q, i) => {
        insertQ.run(
          `${sessionId}_q${i + 1}`, sessionId,
          q.question_text, q.type, q.difficulty,
          q.answer, q.answer_text, q.answers_json,
          q.order_matters, q.unit
        );
      });
    }

    // Delete the draft session
    db.prepare('DELETE FROM questions WHERE session_id = ?').run(sourceSessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sourceSessionId);
  });
  tx();

  return studentIds.length;
}

// --- Rewards ---

export function readRewards(): Rewards {
  if (!fs.existsSync(REWARDS_PATH)) return { rate: 100, currency: 'VND', rewardPerPoint: 100 };
  return JSON.parse(fs.readFileSync(REWARDS_PATH, 'utf-8')) as Rewards;
}

export function writeRewards(data: Rewards): void {
  fs.writeFileSync(REWARDS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Teacher–Student assignments ---

export function hasIncompleteTeacherSession(studentId: number): boolean {
  // Only check the most recent session created by a teacher for this student
  const latest = db.prepare(`
    SELECT s.completed FROM sessions s
    JOIN users u ON u.id = s.created_by
    WHERE s.student_id = ? AND u.role = 'teacher'
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT 1
  `).get(studentId) as { completed: number } | undefined;
  return !!latest && latest.completed === 0;
}

export function getTeacherStudentIds(teacherId: number): number[] {
  const rows = db.prepare(
    'SELECT student_id FROM teacher_students WHERE teacher_id = ?'
  ).all(teacherId) as { student_id: number }[];
  return rows.map(r => r.student_id);
}

export function isStudentInTeacherClass(teacherId: number, studentId: number): boolean {
  const row = db.prepare(
    'SELECT 1 FROM teacher_students WHERE teacher_id = ? AND student_id = ?'
  ).get(teacherId, studentId);
  return !!row;
}

export function assignStudentToTeacher(teacherId: number, studentId: number): void {
  db.prepare(
    'INSERT OR REPLACE INTO teacher_students (teacher_id, student_id) VALUES (?, ?)'
  ).run(teacherId, studentId);
}

export function removeStudentFromTeacher(studentId: number): void {
  db.prepare('DELETE FROM teacher_students WHERE student_id = ?').run(studentId);
}

export function getStudentTeacher(studentId: number): { teacher_id: number; display_name: string } | null {
  return db.prepare(`
    SELECT ts.teacher_id, u.display_name
    FROM teacher_students ts
    JOIN users u ON u.id = ts.teacher_id
    WHERE ts.student_id = ?
  `).get(studentId) as { teacher_id: number; display_name: string } | null;
}
