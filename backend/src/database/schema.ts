export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','teacher','parent','student')),
    display_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS family_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    UNIQUE(parent_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_by INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    image_paths TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    question_count INTEGER DEFAULT 0,
    is_extra INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    superseded INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    type TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    answer REAL,
    answer_text TEXT,
    answers_json TEXT,
    order_matters INTEGER DEFAULT 1,
    unit TEXT DEFAULT '',
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    total_points INTEGER DEFAULT 0,
    completed_at TEXT,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS score_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    points_change INTEGER NOT NULL,
    activity TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wrong_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    student_answer TEXT NOT NULL,
    type TEXT DEFAULT 'single',
    parts_json TEXT,
    date TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    points INTEGER NOT NULL,
    redeemed_by INTEGER NOT NULL,
    date TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (redeemed_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    UNIQUE(user_id, action, date),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_limits (
    user_id INTEGER PRIMARY KEY,
    daily_generate_limit INTEGER NOT NULL DEFAULT 10,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS teacher_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL UNIQUE,
    assigned_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  -- iRead: Stories uploaded by teacher/parent
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    language TEXT NOT NULL CHECK(language IN ('vi', 'en')),
    level TEXT NOT NULL DEFAULT 'elementary',
    cover_image_url TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1,
    total_pages INTEGER DEFAULT 0,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- iRead: Individual scanned pages of a story
  CREATE TABLE IF NOT EXISTS story_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    extracted_text TEXT,
    ocr_status TEXT DEFAULT 'pending' CHECK(ocr_status IN ('pending', 'processing', 'done', 'failed')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES stories(id)
  );

  -- iRead: Auto-generated comprehension questions per story
  CREATE TABLE IF NOT EXISTS reading_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK(correct_option IN ('a', 'b', 'c', 'd')),
    explanation TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES stories(id)
  );

  -- iRead: Story assignments (teacher assigns story to student)
  CREATE TABLE IF NOT EXISTS story_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    assigned_by INTEGER NOT NULL,
    assigned_at TEXT DEFAULT (datetime('now')),
    UNIQUE(story_id, student_id),
    FOREIGN KEY (story_id) REFERENCES stories(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id)
  );

  -- iRead: Student reading + quiz progress per story
  CREATE TABLE IF NOT EXISTS reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started', 'reading', 'quiz', 'completed')),
    current_page INTEGER DEFAULT 1,
    score INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );
`;
