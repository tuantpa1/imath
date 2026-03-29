import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { SCHEMA_SQL } from './schema';

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

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Seed default teacher account on first run
const existingTeacher = db.prepare("SELECT id FROM users WHERE username = 'teacher'").get();
if (!existingTeacher) {
  db.prepare(
    'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
  ).run('teacher', hashPassword('teacher123'), 'teacher', 'Giáo viên');
  console.log('[db] Seeded default teacher account (username: teacher, password: teacher123)');
}

export { db };
