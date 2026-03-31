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
  Rewards,
} from './storageService';

const DATA_DIR = path.resolve(__dirname, '../../../data');
const REWARDS_PATH = path.join(DATA_DIR, 'rewards.json');

// --- Types ---

export interface RawClaudeQuestion {
  question: string;
  type: string;
  difficulty: 'easy' | 'medium' | 'hard';
  answer?: number;
  answer_text?: string;  // fraction questions: "3/5"
  answers?: Array<{ label: string; answer: number; unit: string }>;
  order_matters?: boolean;
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
    .prepare('SELECT id, created_at, image_paths, completed, is_extra FROM sessions WHERE student_id = ? ORDER BY created_at ASC, id ASC')
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
      const single: SingleAnswerQuestion = {
        id: q.id, question: q.question_text, type: q.type, difficulty: q.difficulty,
        answer: q.answer ?? 0, unit: q.unit,
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
  const count = (db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number }).c;
  const sessionId = `session_${String(count + 1).padStart(3, '0')}`;
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
      if (q.answers) {
        insertQ.run(qId, sessionId, q.question, 'multi_answer', q.difficulty, null, null, JSON.stringify(q.answers), (q.order_matters ?? true) ? 1 : 0, q.unit ?? '');
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
    if (q.answers) {
      const m: MultiAnswerQuestion = { id: qId, question: q.question, type: 'multi_answer', difficulty: q.difficulty, order_matters: q.order_matters ?? true, answers: q.answers, unit: q.unit ?? '' };
      return m;
    }
    if (q.type === 'fraction' && q.answer_text) {
      const f: FractionQuestion = { id: qId, question: q.question, type: 'fraction', difficulty: q.difficulty, answer_text: q.answer_text, unit: q.unit ?? '' };
      return f;
    }
    const s: SingleAnswerQuestion = { id: qId, question: q.question, type: q.type, difficulty: q.difficulty, answer: q.answer ?? 0, unit: q.unit ?? '' };
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
): number {
  const students = db
    .prepare("SELECT id FROM users WHERE role = 'student' AND is_active = 1")
    .all() as Array<{ id: number }>;

  if (students.length === 0) return 0;

  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const imagePathsJson = JSON.stringify(imagePaths);

  const tx = db.transaction(() => {
    for (const { id: studentId } of students) {
      // Remove all incomplete sessions (and their questions) for this student
      const incompleteIds = db
        .prepare('SELECT id FROM sessions WHERE student_id = ? AND completed = 0')
        .all(studentId) as Array<{ id: string }>;
      for (const s of incompleteIds) {
        db.prepare('DELETE FROM questions WHERE session_id = ?').run(s.id);
      }
      db.prepare('DELETE FROM sessions WHERE student_id = ? AND completed = 0').run(studentId);

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
        if (q.answers) {
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

// --- Rewards ---

export function readRewards(): Rewards {
  if (!fs.existsSync(REWARDS_PATH)) return { rate: 100, currency: 'VND', rewardPerPoint: 100 };
  return JSON.parse(fs.readFileSync(REWARDS_PATH, 'utf-8')) as Rewards;
}

export function writeRewards(data: Rewards): void {
  fs.writeFileSync(REWARDS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
