# iLearn — Multi-Module Learning Platform for Primary School Students

## Project Overview
Web application to help primary school children (ages 6–11) learn through two modules:
- **iMath (module 1):** Parents/teachers upload textbook photos → Claude/Gemini AI generates math exercises → Children complete them and earn reward points.
- **iRead (module 2):** Teachers/parents upload story books → AI generates reading comprehension questions → Children read and answer to earn points.

Shared across modules: users, roles, points system, rewards, class management.

## Status
**iMath V2 complete.** 4 roles (admin/teacher/parent/student), class-scoped teacher routes, AdminDashboard (7 tabs), TeacherView (3 tabs), teacher_students table for class assignment. Session history preserved via `superseded` flag — new teacher tasks no longer wipe old incomplete ones from history. iRead Phase 0 database schema added (stories, story_pages, reading_questions, story_assignments, reading_sessions tables). `module` column added to sessions/scores/score_history tables for per-module point tracking.

## Tech Stack
- **Frontend:** React + TypeScript (port 3000)
- **Backend:** Node.js + Express + TypeScript (port 3001)
- **AI:** Claude (`claude-sonnet-4-20250514`) or Gemini 2.5 Flash (`gemini-2.5-flash`) — switched via `AI_MODEL` env var
- **Storage:** SQLite (`data/imath.db`) via `better-sqlite3` — JSON files retired to `*.backup`
- **Auth:** JWT (jsonwebtoken) + bcrypt, stored in localStorage
- **Language:** UI in Vietnamese, code in English
- **Font:** Baloo 2 (Google Fonts) — child-friendly rounded font
- **Animations:** canvas-confetti (session complete screen), custom CSS keyframes in App.css

## Project Structure
```
imath/
├── package.json                  # Root — "npm start" runs both servers
├── scripts/
│   ├── show-ip.js                # Auto-detects LAN IP, prints access guide
│   └── setup-firewall.bat        # Opens ports 3000/3001 in Windows Firewall (run as Admin once)
├── NETWORK_SETUP.md              # Vietnamese guide for LAN access
├── frontend/
│   ├── vite.config.ts            # host: '0.0.0.0' for LAN binding
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.tsx         # JWT login form (all roles); no default account hint
│       │   ├── StudentMode.tsx       # Student exercises + fraction keyboard + daily skip quota display
│       │   ├── ParentMode.tsx        # Upload images + generate + view questions + scores/redeem
│       │   ├── AdminDashboard.tsx    # 7-tab admin dashboard (admin role)
│       │   ├── TeacherView.tsx       # 3-tab class dashboard (teacher role)
│       │   └── TeacherDashboard.tsx  # LEGACY — no longer routed, kept for reference
│       ├── services/
│       │   ├── authService.ts    # login/logout/getToken/getCurrentUser
│       │   └── apiService.ts     # fetch wrapper with JWT header + 401/403/429/5xx handling
│       ├── App.css               # Global styles + animation keyframes + mobile safeguards
│       └── App.tsx               # Role-based routing: student/parent/teacher/admin/login
├── backend/
│   └── src/
│       ├── database/
│       │   ├── db.ts             # better-sqlite3 init, WAL mode, foreign_keys=ON, seeds admin account; migrations for admin role + teacher_students + superseded column
│       │   └── schema.ts         # SCHEMA_SQL — all CREATE TABLE IF NOT EXISTS statements
│       ├── middleware/
│       │   ├── authMiddleware.ts     # verifies JWT, attaches req.user
│       │   ├── roleMiddleware.ts     # requireRole('teacher') guard
│       │   └── resolveStudent.ts    # resolves target studentId per role
│       ├── routes/
│       │   ├── authRoutes.ts         # POST /auth/login (public)
│       │   ├── dataRoutes.ts         # scores, exercises, rewards CRUD + GET /api/usage
│       │   ├── uploadRoutes.ts       # generate-exercises (teacher/parent), generate-skip, generate-extra, generate-all (teacher→class only)
│       │   ├── parentRoutes.ts       # /parent/children, /parent/children/:id/redeem
│       │   ├── teacherRoutes.ts      # /teacher/* — class-scoped: students, leaderboard, scores, wrong-answers, usage, sessions, batch-questions, batch-completion, completion
│       │   └── adminRoutes.ts        # /admin/* — all users, teacher-student assignment, usage, account management
│       ├── services/
│       │   ├── authService.ts        # hashPassword, verifyToken, TokenPayload type
│       │   ├── claudeService.ts      # Claude API integration; returns { questions, usage }
│       │   ├── geminiService.ts      # Gemini 2.5 Flash integration — same interface as claudeService
│       │   ├── aiService.ts          # Router: reads AI_MODEL env var, delegates to claude or gemini
│       │   ├── rateLimitService.ts   # checkAndIncrement (transactional), getUserGenerateLimit, setUserGenerateLimit
│       │   └── storageServiceSQLite.ts  # all DB reads/writes, createSession, createSessionForAllStudents, distributeSessionToStudents
│       └── index.ts              # Express app, route mounting, listens on 0.0.0.0:3001
└── data/
    ├── imath.db                  # SQLite database (auto-created on first run)
    ├── images/                   # uploaded textbook images
    ├── exercises.json.backup     # retired
    └── scores.json.backup        # retired
```

## Four Roles
| Role | Login | What they can do |
|------|-------|------------------|
| **admin** | username + password | Full system management: create/delete/lock all accounts, assign students to teachers, view all scores, set rate limits |
| **teacher** | username + password | Class-scoped dashboard: view own class only, generate exercises for their students |
| **parent** | username + password | Upload images, generate exercises for linked children, view questions, view/redeem points |
| **student** | username + password | Do exercises, earn points, skip questions (daily limit) |

**Default admin account:** username `admin` / password `admin123` (seeded on first DB init)
**Migration:** existing `teacher`/`teacher123` account is promoted to `admin` role on first V2 startup

## Authentication Flow
1. Any role → `POST /auth/login` → receives JWT
2. All `/api/*`, `/teacher/*`, `/parent/*` routes require `Authorization: Bearer <token>`
3. `authMiddleware` verifies JWT, attaches `req.user = { userId, role }`
4. Role guard (`requireRole`) blocks wrong roles with 403
5. `resolveStudentId` middleware enforces data isolation:
   - `student` → always own userId (ignores any `?studentId` param)
   - `parent` → must pass `?studentId` of a linked child (verified via `family_links`)
   - `teacher` → must pass `?studentId` of a student in their class (verified via `teacher_students`)
   - `admin` → any valid studentId

## SQLite Schema (11 tables)
| Table | Purpose |
|-------|---------|
| `users` | All accounts (admin/teacher/parent/student), `is_active` soft-delete |
| `family_links` | parent_id ↔ student_id many-to-many |
| `teacher_students` | teacher_id ↔ student_id; `student_id UNIQUE` (1 student per class) |
| `sessions` | Exercise sessions per student (`created_by` tracks who generated; `superseded=1` marks tasks replaced by a newer one) |
| `questions` | Questions within a session (`answer_text` for fractions, `answers_json` for multi-answer) |
| `scores` | Per-student session scores |
| `score_history` | Points change log |
| `wrong_answers` | Wrong answer records with `parts_json` for multi-answer questions |
| `redemptions` | Points-to-reward conversions |
| `api_usage` | Daily API call counter per user+action (rate limiting) |
| `user_limits` | Per-user `daily_generate_limit` override (falls back to role default if no row) |
| `sqlite_sequence` | Auto-managed by SQLite for AUTOINCREMENT |

Schema auto-applied via `db.exec(SCHEMA_SQL)` on every server startup — no migration step needed.
Additive column migrations (e.g. `ALTER TABLE sessions ADD COLUMN superseded`) are done with try/catch in `db.ts` for existing databases.

**`foreign_keys = ON`** is set in `db.ts`. All cascade deletes must be ordered leaf → parent.

## API Rate Limits
| Role | Action | Default limit/day |
|------|--------|-----------|
| admin | generate_exercises | 0 (cannot generate) |
| teacher | generate_exercises | 20 |
| parent | generate_exercises | 10 |
| student | generate_exercises | **blocked** (403) |
| student | skip_question | 20 |

- Per-user limit override stored in `user_limits` table; admin can set via `PATCH /admin/users/:id/limit`
- `getUserGenerateLimit(userId, role)` reads `user_limits` first, falls back to role default
- Date key = `YYYY-MM-DD` in **UTC+7** (Vietnam time); resets at midnight UTC+7
- Over limit → **HTTP 429** with Vietnamese error message
- `checkAndIncrement` is a `better-sqlite3` transaction (race-safe, synchronous)
- Frontend shows usage indicator in ParentMode; StudentMode shows daily skips remaining

## API Routes

### Public
```
POST /auth/login          { username, password } → { token, user }
GET  /health              → { status: "ok" }
```

### Protected — all roles (JWT required)
```
GET  /api/scores          → { totalPoints, history, redeemed, wrongQuestions }
POST /api/scores          body: ScoresData
GET  /api/exercises       → { sessions: [...] }
POST /api/exercises       body: ExercisesData
DELETE /api/exercises/all
PATCH /api/sessions/:id/complete
DELETE /api/questions/:id
GET  /api/rewards
POST /api/rewards
GET  /api/usage           → { generate_exercises: {used,limit,remaining}, skip_question: {...}, resetsAt }

POST /api/generate-exercises   (teacher/parent only; rate-limited; multipart/images + count + studentId)
POST /api/generate-skip        (student: rate-limited to 20/day)
POST /api/generate-extra       (teacher/parent/student via resolveStudentId)
POST /api/generate-all         (teacher only; rate-limited; multipart/images + count → all students in teacher's class)
```

### Parent only
```
GET  /parent/children                       → [{ id, username, display_name }]
POST /parent/children/:id/redeem            { points }
```

### Teacher only (class-scoped)
```
GET  /teacher/students                      → { students, message? } — only students in this teacher's class
GET  /teacher/students/:id/scores           → 403 if student not in class
GET  /teacher/students/:id/wrong-answers    → 403 if student not in class
GET  /teacher/leaderboard                   → class leaderboard only
GET  /teacher/usage                         → this teacher's own API usage only
GET  /teacher/sessions                      → [{ batch_ts, date, question_count, student_count, completed_count }] — full history incl. superseded batches
GET  /teacher/batch-questions?batch_ts=     → questions from a specific batch
GET  /teacher/batch-completion?batch_ts=    → per-student completion status for a specific batch
GET  /teacher/completion                    → completion status for the most recent active (non-superseded) batch
```

### Admin only
```
GET  /admin/users                           → all users (all roles) with extra info
GET  /admin/students                        → all students with teacher + parent info
GET  /admin/teachers                        → all teachers with student counts + lists
GET  /admin/parents                         → all parents with children
POST /admin/users                           { username, password, displayName, role, linkToParentId?, assignToTeacherId? }
DELETE /admin/users/:id                     soft-delete (is_active=0)
DELETE /admin/users/:id/permanent           hard-delete with full cascade (all roles)
PATCH  /admin/users/:id/reactivate          restore is_active=1
GET  /admin/teacher-students                → { assignments, unassigned_students }
POST /admin/teacher-students                { teacherId, studentId } — assign student to teacher
DELETE /admin/teacher-students/:studentId   unassign student from teacher
GET  /admin/usage                           → all users' daily API usage
PATCH /admin/users/:id/limit               { generateLimit }
GET  /admin/leaderboard                     → global leaderboard
GET  /admin/students/:id/scores
GET  /admin/students/:id/wrong-answers
```

## Admin Dashboard (7 tabs)
| Tab | Content |
|-----|---------|
| 📊 Tổng quan | Stat cards (teachers/students/parents/total points) + global top-10 leaderboard |
| 👨‍🏫 Giáo viên | All teachers; expand to see class students; lock/unlock/delete |
| 👦 Học sinh | All students with teacher + parent info; "Chưa phân lớp" badge; expand for scores + wrong answers |
| 👨‍👩‍👧 Phụ huynh | All parents with children; lock/unlock/delete |
| 📈 Dùng API | Per-user rate limit usage with color-coded bars; inline limit editor |
| ➕ Thêm TK | Create any account (admin/teacher/parent/student); student gets optional teacher assignment + parent link |
| 🔗 Phân lớp | Assign students to teachers; unassigned students section; teacher class cards with ✕ unassign |

## Teacher View (3 tabs)
| Tab | Content |
|-----|---------|
| 📊 Lớp của tôi | Stat cards + usage indicator + class leaderboard; empty-class message if not assigned |
| 👦 Học sinh | Class students with points + session count; expand for scores + wrong answers (read-only) |
| 📚 Giao bài | Upload images → generate once → distribute to class; question preview with per-question delete |

## Parent Mode Views
| View | Content |
|------|---------|
| Dashboard | 3 buttons: Tải ảnh sách giáo khoa / Xem Câu Hỏi / Xem Điểm Của Bé |
| Upload | Drag-and-drop image upload + question count selector + generate button + usage indicator |
| Questions | Browse current session's questions with per-question delete |
| Scores | Total points + redeem form + redemption history + grouped wrong answers |

## Data Structures

### Question Formats (in SQLite `questions` table)
- **Single answer** (`type != 'multi_answer'`, `type != 'fraction'`): `answer REAL` + optional `unit`
- **Fraction** (`type = 'fraction'`): `answer_text TEXT` stores e.g. `"9/6"` — compared via cross-multiplication
- **Multi-answer** (`type = 'multi_answer'`, `answers_json`): multiple labeled boxes; each part may have `answer_text` for fractions

**`order_matters` rules:**
- `true` — each labeled box must match its corresponding answer (perimeter ≠ area)
- `false` — any order accepted (fully interchangeable labels only)
- Default for "find two numbers" problems: `order_matters: true`, labels "Số lớn" / "Số bé"

### Fraction Answer Handling
- DB stores `answer_text: "9/6"` (string); `answer` column is null for fraction questions
- `compareFractionAnswer`: cross-multiplication equivalence check (`a.num * b.den === b.num * a.den`)
- Student input uses the custom violet on-screen keyboard (suppresses iOS OS keyboard via `onPointerDown + preventDefault`)
- Fraction keyboard keys: `['1','2','3','4','5','6','7','8','9','/','0','⌫']`
- Multi-answer fraction parts: shared `FractionKeyboard` controlled by `focusedPartIndex` state

### Multi-Answer Scoring
- **All correct:** +10 points, "✅ Tất cả đúng rồi! 🎉"
- **Wrong (ordered):** -5 points, per-part feedback showing right/wrong per box
- **Wrong (unordered):** -5 points, summary with all correct values
- Saved as ONE `wrong_answers` row with `parts_json` array

### Scoring & Retry
- Correct → +10 (`POINTS_PER_QUESTION = 10`)
- Wrong → −5 points, auto-advance after delay
- Progress saved to `localStorage` keyed by `imath_progress_<userId>`
- Skip: 2 per question + 20 per day (students); calls `/api/generate-skip`

### Bulk Generate (`POST /api/generate-all`)
- Teacher-only; counts against teacher's daily generate limit
- Calls Claude/Gemini **once** — same questions distributed to all students in teacher's class
- For each student: marks all **incomplete** sessions as `superseded = 1`, then inserts new session
- Completed sessions and superseded sessions are preserved in DB (full history)
- Session IDs format: `session_all_<timestamp>_<studentId>` (guaranteed unique; timestamp = batch key)
- Returns `{ ok, studentCount, questionCount }`
- Returns 400 if teacher has no students assigned

### Session Superseding
- When a teacher assigns a new task, existing incomplete sessions are marked `superseded = 1` (not deleted)
- Students only see `superseded = 0` sessions in their exercise view
- Teacher history (`GET /teacher/sessions`) shows all batches including superseded ones
- `batch_ts` (the Unix timestamp embedded in session IDs) is the unique batch identifier — more reliable than `date + question_count` which can collide

### Account Management
- **Soft-delete** (`DELETE /admin/users/:id`): sets `is_active=0`; reactivatable via PATCH /admin/users/:id/reactivate
- **Hard-delete** (`DELETE /admin/users/:id/permanent`): full cascade in FK order:
  - Student: wrong_answers → score_history → redemptions → scores → questions (via sessions) → sessions → family_links → teacher_students → api_usage → user_limits → users
  - Teacher: teacher_students → questions/sessions (created_by) → api_usage → user_limits → users
  - Parent (only if no linked children): redemptions → questions/sessions → family_links → api_usage → user_limits → users
- Admin cannot delete their own account

## Commands
```bash
# One-time firewall setup (Windows, run as Administrator)
scripts/setup-firewall.bat

# Install all dependencies
cd frontend && npm install
cd backend && npm install
npm install   # root (installs concurrently)

# Start both servers + print LAN IP
npm start     # from project root

# Or start individually
cd backend && npm run dev    # port 3001 — compiles TS then runs with nodemon
cd frontend && npm run dev   # port 3000

# Type-check both
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# After backend source changes, rebuild dist/ so running server picks them up:
cd backend && npx tsc
# Then nodemon auto-restarts (watches dist/), or manually restart node process
```

## Network / LAN Access
- Backend binds to `0.0.0.0`, CORS open to all origins
- Vite dev server binds to `0.0.0.0`
- API URLs use `window.location.hostname` (dynamic — works on localhost and LAN IP)
- `npm start` prints the machine's LAN IP so tablets/phones can connect
- See `NETWORK_SETUP.md` for the Vietnamese setup guide

## Constraints
- AI model selected via `AI_MODEL` env var: `claude` (default) → `claude-sonnet-4-20250514`; `gemini` → `gemini-2.5-flash`
- To switch model on VPS: edit `.env` then `pm2 restart imath-backend --update-env`
- SQLite only — no external databases, no Redis
- Allowed UI libraries: Tailwind CSS, canvas-confetti, Google Fonts (Baloo 2)

## UI Design System
- **Font:** `'Baloo 2'` via Google Fonts (applied globally in App.css)
- **Color palette:** rose/orange (student), violet/purple (parent), indigo/violet (teacher), amber (points)
- **Mobile layout:** `box-sizing: border-box` on `*`, `overflow-x: hidden` on `body`, all flex input rows use `min-w-0` on inputs and `flex-shrink-0` on buttons/units
- **Animation classes** (defined in App.css):
  - `.animate-bounce-in` — pops in for feedback messages
  - `.animate-float-up` — floats +/- points on answer
  - `.animate-pop-in` — trophy on complete screen
  - `.animate-fade-in` — page entrance
  - `.animate-wiggle` — wrong answer shake
  - `.animate-pulse-star` — star icon pulse
  - `.animate-slide-up` — card entrance
- **`.btn-scale`** — hover scale(1.05) / active scale(0.97) on all buttons
- **`.input-glow`** — indigo glow ring on focus
- **Confetti:** `canvas-confetti` fires on `view === 'complete'` with school colors
