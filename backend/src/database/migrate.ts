import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { db, hashPassword } from './db';
import { Exercises, Scores } from '../services/storageService';

const DATA_DIR = path.resolve(__dirname, '../../../data');

// --- Read JSON source files ---

function readJsonFile<T>(filename: string): T | null {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) {
    console.warn(`[migrate] ${filename} not found, skipping`);
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

const exercises = readJsonFile<Exercises>('exercises.json');
const scores = readJsonFile<Scores>('scores.json');

// --- Ensure user accounts ---

function ensureUser(
  username: string,
  password: string,
  role: string,
  displayName: string
): number {
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(username) as { id: number } | undefined;
  if (existing) {
    console.log(`[migrate] User '${username}' already exists (id=${existing.id})`);
    return existing.id;
  }
  const result = db
    .prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    )
    .run(username, hashPassword(password), role, displayName);
  const id = Number(result.lastInsertRowid);
  console.log(`[migrate] Created user '${username}' (id=${id})`);
  return id;
}

const teacherId = ensureUser('teacher',  'teacher123', 'teacher', 'Giáo viên');
const parentId  = ensureUser('parent1',  'parent123',  'parent',  'Phụ huynh');
const studentId = ensureUser('student1', 'student123', 'student', 'Học sinh');

// --- Family link: parent1 → student1 ---

const existingLink = db
  .prepare('SELECT id FROM family_links WHERE parent_id = ? AND student_id = ?')
  .get(parentId, studentId);
if (!existingLink) {
  db.prepare('INSERT INTO family_links (parent_id, student_id) VALUES (?, ?)').run(
    parentId,
    studentId
  );
  console.log(`[migrate] Linked parent1 → student1`);
}

// --- Migrate exercises and questions ---

let sessionCount = 0;
let questionCount = 0;

if (exercises) {
  const migrateSessions = db.transaction(() => {
    const insertSession = db.prepare(
      `INSERT OR IGNORE INTO sessions
         (id, created_by, student_id, image_paths, created_at, question_count, is_extra, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertQuestion = db.prepare(
      `INSERT OR IGNORE INTO questions
         (id, session_id, question_text, type, difficulty, answer, answers_json, order_matters, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const session of exercises.sessions) {
      const inserted = insertSession.run(
        session.id,
        teacherId,
        studentId,
        JSON.stringify(session.imagePaths ?? []),
        session.createdAt,
        session.questions.length,
        session.isExtra ? 1 : 0,
        session.completed ? 1 : 0
      );
      if (inserted.changes > 0) sessionCount++;

      for (const q of session.questions) {
        let qInserted;
        if ('answers' in q) {
          qInserted = insertQuestion.run(
            q.id, session.id, q.question, 'multi_answer', q.difficulty,
            null, JSON.stringify(q.answers), q.order_matters ? 1 : 0, q.unit ?? ''
          );
        } else {
          qInserted = insertQuestion.run(
            q.id, session.id, q.question, q.type, q.difficulty,
            'answer' in q ? q.answer : null, null, 1, q.unit ?? ''
          );
        }
        if (qInserted.changes > 0) questionCount++;
      }
    }
  });

  migrateSessions();
}

// --- Migrate scores ---

let historyCount = 0;
let redeemedCount = 0;
let wrongCount = 0;

if (scores) {
  const migrateScores = db.transaction(() => {
    // Only migrate if no existing history for this student
    const existingHistory = db
      .prepare('SELECT COUNT(*) AS cnt FROM score_history WHERE student_id = ?')
      .get(studentId) as { cnt: number };

    if (existingHistory.cnt === 0) {
      const insertHistory = db.prepare(
        'INSERT INTO score_history (student_id, points_change, activity, created_at) VALUES (?, ?, ?, ?)'
      );
      for (const h of scores.history) {
        insertHistory.run(studentId, h.earned, h.activity, h.date);
        historyCount++;
      }
    } else {
      console.log(`[migrate] Score history already exists (${existingHistory.cnt} rows), skipping`);
    }

    const existingRedeemed = db
      .prepare('SELECT COUNT(*) AS cnt FROM redemptions WHERE student_id = ?')
      .get(studentId) as { cnt: number };

    if (existingRedeemed.cnt === 0) {
      const insertRedemption = db.prepare(
        'INSERT INTO redemptions (student_id, points, redeemed_by, date) VALUES (?, ?, ?, ?)'
      );
      for (const r of scores.redeemed) {
        insertRedemption.run(studentId, r.points, parentId, r.date);
        redeemedCount++;
      }
    } else {
      console.log(`[migrate] Redemptions already exist (${existingRedeemed.cnt} rows), skipping`);
    }

    const existingWrong = db
      .prepare('SELECT COUNT(*) AS cnt FROM wrong_answers WHERE student_id = ?')
      .get(studentId) as { cnt: number };

    if (existingWrong.cnt === 0) {
      const insertWrong = db.prepare(
        `INSERT INTO wrong_answers
           (student_id, question_id, question_text, correct_answer, student_answer, type, parts_json, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const w of scores.wrongQuestions as any[]) {
        if (w.type === 'multi_answer' && w.parts) {
          insertWrong.run(
            studentId, '', w.question, '', '', 'multi_answer',
            JSON.stringify(w.parts), w.date
          );
        } else {
          insertWrong.run(
            studentId, '', w.question,
            w.correctAnswer ?? '',
            w.studentAnswer ?? '',
            w.type ?? 'single',
            null,
            w.date
          );
        }
        wrongCount++;
      }
    } else {
      console.log(`[migrate] Wrong answers already exist (${existingWrong.cnt} rows), skipping`);
    }
  });

  migrateScores();
}

// --- Rename JSON files as backup ---

function backupJson(filename: string): void {
  const src = path.join(DATA_DIR, filename);
  const dst = path.join(DATA_DIR, `${filename}.backup`);
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    fs.renameSync(src, dst);
    console.log(`[migrate] Backed up ${filename} → ${filename}.backup`);
  }
}

backupJson('exercises.json');
backupJson('scores.json');

// --- Summary ---

console.log('\n========== Migration Complete ==========');
console.log(`Database:          data/imath.db`);
console.log(`Users:`);
console.log(`  teacher  (id=${teacherId})  password: teacher123`);
console.log(`  parent1  (id=${parentId})  password: parent123`);
console.log(`  student1 (id=${studentId})  password: student123`);
console.log(`Sessions migrated: ${sessionCount}`);
console.log(`Questions migrated: ${questionCount}`);
console.log(`Score history:     ${historyCount} entries`);
console.log(`Redemptions:       ${redeemedCount} entries`);
console.log(`Wrong answers:     ${wrongCount} entries`);
console.log('========================================\n');
