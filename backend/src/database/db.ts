import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { SCHEMA_SQL } from './schema';
import { cleanBookText } from '../utils/textUtils';

const DATA_DIR = path.resolve(__dirname, '../../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'imath.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize all tables
db.exec(SCHEMA_SQL);

// Safe migrations for existing databases
try {
  db.exec('ALTER TABLE questions ADD COLUMN answer_text TEXT');
} catch {
  // Column already exists — ignore
}
try {
  db.exec('ALTER TABLE sessions ADD COLUMN superseded INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists — ignore
}
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN module TEXT DEFAULT 'imath'`);
} catch {
  // Column already exists — ignore
}
try {
  db.exec(`ALTER TABLE scores ADD COLUMN module TEXT DEFAULT 'imath'`);
} catch {
  // Column already exists — ignore
}
try {
  db.exec(`ALTER TABLE score_history ADD COLUMN module TEXT DEFAULT 'imath'`);
} catch {
  // Column already exists — ignore
}
try {
  db.exec(`ALTER TABLE story_pages ADD COLUMN side TEXT DEFAULT 'single'`);
} catch {
  // Column already exists — ignore
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Migration: normalize + clean existing extracted_text (NFC + line-join + footer removal)
try {
  const pages = db.prepare(
    'SELECT id, extracted_text FROM story_pages WHERE extracted_text IS NOT NULL'
  ).all() as { id: number; extracted_text: string }[];
  const updateStmt = db.prepare('UPDATE story_pages SET extracted_text = ? WHERE id = ?');
  let count = 0;
  for (const page of pages) {
    const cleaned = cleanBookText(page.extracted_text.normalize('NFC'));
    updateStmt.run(cleaned, page.id);
    count++;
  }
  if (count > 0) console.log(`[DB] Cleaned ${count} story page(s)`);
} catch (e) {
  console.log('[DB] Text-clean migration skipped:', e);
}

// Log warning about potential double-page OCR issue for existing pages
try {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM story_pages').get() as { c: number };
  if (c > 0) {
    console.log(`[DB] ⚠️  ${c} story page(s) exist. If any were photographed as open-book spreads, please re-upload those stories for accurate OCR.`);
  }
} catch { /* ignore */ }

// Migration: rebuild users table if CHECK constraint doesn't include 'admin'
const usersSchema = db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
).get() as { sql: string } | undefined;
if (usersSchema && !usersSchema.sql.includes("'admin'")) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    BEGIN;
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','teacher','parent','student')),
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1
    );
    INSERT INTO users_new SELECT * FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    COMMIT;
  `);
  db.pragma('foreign_keys = ON');
  console.log('[DB] Rebuilt users table with updated role CHECK constraint');
}

// Migration: create teacher_students table if it doesn't exist (idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS teacher_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL UNIQUE,
    assigned_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  )
`);

// Migration: promote existing 'teacher' username account to 'admin' role (once)
const hasAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
if (!hasAdmin) {
  const oldTeacher = db.prepare("SELECT id FROM users WHERE username = 'teacher' AND role = 'teacher'").get() as { id: number } | undefined;
  if (oldTeacher) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(oldTeacher.id);
    console.log("[DB] Migrated user 'teacher' from role teacher → admin");
  }
}

// Seed default admin account on first run
const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!existingAdmin) {
  db.prepare(
    'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
  ).run('admin', hashPassword('admin123'), 'admin', 'Quản trị viên');
  console.log('[DB] Seeded default admin account (username: admin, password: admin123)');
}

export { db };
