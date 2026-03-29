const Database = require('better-sqlite3');
const db = new Database('./data/imath.db');

// ── 1. Insert a test fraction session + question ──────────────────────────────
const sessionId = 'test_fraction_session';
const qId = sessionId + '_q1';

// Clean up any previous run
db.prepare('DELETE FROM questions WHERE session_id = ?').run(sessionId);
db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

// Find student1 id
const student = db.prepare("SELECT id FROM users WHERE username = 'student1'").get();
const teacher = db.prepare("SELECT id FROM users WHERE role = 'teacher' LIMIT 1").get();
if (!student) { console.log('ERROR: student1 not found'); process.exit(1); }

db.prepare(`INSERT INTO sessions (id, created_by, student_id, image_paths, created_at, question_count, is_extra, completed)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0)`)
  .run(sessionId, teacher.id, student.id, '[]', '2026-03-29', 1);

db.prepare(`INSERT INTO questions (id, session_id, question_text, type, difficulty, answer, answer_text, answers_json, order_matters, unit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(qId, sessionId, 'Rút gọn phân số 15/25', 'fraction', 'medium', null, '3/5', null, 1, '');

// ── 2. Read back ──────────────────────────────────────────────────────────────
const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(qId);
console.log('\n--- DB round-trip ---');
console.log('type       :', row.type);
console.log('answer     :', row.answer);
console.log('answer_text:', row.answer_text);
console.log('PASS type = fraction     :', row.type === 'fraction' ? 'PASS' : 'FAIL');
console.log('PASS answer = null       :', row.answer === null ? 'PASS' : 'FAIL');
console.log('PASS answer_text = "3/5" :', row.answer_text === '3/5' ? 'PASS' : 'FAIL');

// ── 3. Verify wrong_answers stores fraction type correctly ────────────────────
db.prepare('DELETE FROM wrong_answers WHERE question_id = ?').run(qId);
db.prepare(`INSERT INTO wrong_answers (student_id, question_id, question_text, correct_answer, student_answer, type, parts_json, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(student.id, qId, 'Rút gọn phân số 15/25', '3/5', '2/5', 'fraction', null, '2026-03-29');

const wa = db.prepare('SELECT * FROM wrong_answers WHERE question_id = ?').get(qId);
console.log('\n--- Wrong answer round-trip ---');
console.log('type           :', wa.type);
console.log('correct_answer :', wa.correct_answer);
console.log('student_answer :', wa.student_answer);
console.log('PASS type = fraction    :', wa.type === 'fraction' ? 'PASS' : 'FAIL');
console.log('PASS correct = "3/5"   :', wa.correct_answer === '3/5' ? 'PASS' : 'FAIL');
console.log('PASS student = "2/5"   :', wa.student_answer === '2/5' ? 'PASS' : 'FAIL');

// ── 4. Cleanup ────────────────────────────────────────────────────────────────
db.prepare('DELETE FROM wrong_answers WHERE question_id = ?').run(qId);
db.prepare('DELETE FROM questions WHERE session_id = ?').run(sessionId);
db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

db.close();
console.log('\n--- Cleanup done ---');
