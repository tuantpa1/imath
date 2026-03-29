# iMath — Math Learning Platform for Primary School Students

## Project Overview
Web application to help primary school children (ages 6–11) practice math.
Parents upload textbook photos → Claude AI generates exercises → Children complete them and earn reward points.

## Status
**All features implemented.** Multi-user auth (Phases 1–6), multi-answer questions, mobile layout, wrong-answer grouping, rate limiting, teacher dashboard, token quota system all complete.

## Tech Stack
- **Frontend:** React + TypeScript (port 3000)
- **Backend:** Node.js + Express + TypeScript (port 3001)
- **AI:** Claude (`claude-sonnet-4-20250514`) or Gemini 2.0 Flash — switched via `AI_MODEL` env var
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
│       │   ├── LoginPage.tsx     # JWT login form (all roles)
│       │   ├── StudentMode.tsx   # Student exercises + daily skip quota display
│       │   ├── ParentMode.tsx    # Upload images + generate exercises + usage + token quota indicator
│       │   └── TeacherDashboard.tsx  # 6-tab admin dashboard (incl. 🪙 Quota tab)
│       ├── services/
│       │   ├── authService.ts    # login/logout/getToken/getCurrentUser
│       │   └── apiService.ts     # fetch wrapper with JWT header + 401/403/429 handling
│       ├── App.css               # Global styles + animation keyframes + mobile safeguards
│       └── App.tsx               # Role-based routing: student/parent/teacher/login
├── backend/
│   └── src/
│       ├── database/
│       │   ├── db.ts             # better-sqlite3 init, WAL mode, seeds teacher account
│       │   └── schema.ts         # SCHEMA_SQL — all CREATE TABLE IF NOT EXISTS statements
│       ├── middleware/
│       │   ├── authMiddleware.ts     # verifies JWT, attaches req.user
│       │   ├── roleMiddleware.ts     # requireRole('teacher') guard
│       │   └── resolveStudent.ts    # resolves target studentId per role
│       ├── routes/
│       │   ├── authRoutes.ts         # POST /auth/login (public)
│       │   ├── dataRoutes.ts         # scores, exercises, rewards CRUD + GET /api/usage
│       │   ├── uploadRoutes.ts       # generate-exercises (rate-limited), generate-skip, generate-extra
│       │   ├── parentRoutes.ts       # /parent/children, /parent/children/:id/redeem, /parent/quota
│       │   └── teacherRoutes.ts      # /teacher/* — students, parents, scores, leaderboard, usage, quotas
│       ├── services/
│       │   ├── authService.ts        # hashPassword, verifyToken, TokenPayload type
│       │   ├── claudeService.ts      # Claude API integration + mergeRelatedQuestionsExport; returns GenerateResult/SkipResult
│       │   ├── geminiService.ts      # Gemini 2.0 Flash integration — same interface as claudeService
│       │   ├── aiService.ts          # Router: reads AI_MODEL env var, delegates to claude or gemini
│       │   ├── rateLimitService.ts   # checkAndIncrement (transactional), getUsage, getAllUsageToday
│       │   ├── storageServiceSQLite.ts  # all DB reads/writes, Question union type
│       │   └── tokenQuotaService.ts  # token quota per parent: getGroupParentId, checkQuota, deductTokens, topUpTokens, setQuota
│       └── index.ts              # Express app, route mounting, listens on 0.0.0.0:3001
└── data/
    ├── imath.db                  # SQLite database (auto-created on first run)
    ├── images/                   # uploaded textbook images
    ├── exercises.json.backup     # retired
    └── scores.json.backup        # retired
```

## Three Roles
| Role | Login | What they can do |
|------|-------|------------------|
| **teacher** | username + password | Full dashboard: manage students/parents, view all scores, API usage overview |
| **parent** | username + password | Upload images, generate exercises for linked children, view/redeem points |
| **student** | username + password | Do exercises, earn points, skip questions (daily limit) |

**Default teacher account:** username `teacher` / password `teacher123` (seeded on first DB init)

## Authentication Flow
1. Any role → `POST /auth/login` → receives JWT
2. All `/api/*`, `/teacher/*`, `/parent/*` routes require `Authorization: Bearer <token>`
3. `authMiddleware` verifies JWT, attaches `req.user = { userId, role }`
4. Role guard (`requireRole`) blocks wrong roles with 403
5. `resolveStudentId` middleware enforces data isolation:
   - `student` → always own userId (ignores any `?studentId` param)
   - `parent` → must pass `?studentId` of a linked child (verified via `family_links`)
   - `teacher` → any valid studentId

## SQLite Schema (10 tables)
| Table | Purpose |
|-------|---------|
| `users` | All accounts (teacher/parent/student), `is_active` soft-delete |
| `family_links` | parent_id ↔ student_id many-to-many |
| `sessions` | Exercise sessions created per student |
| `questions` | Questions within a session |
| `scores` | Per-student total and session scores |
| `score_history` | Points change log |
| `wrong_answers` | Wrong answer records with `parts_json` for multi-answer |
| `redemptions` | Points-to-reward conversions |
| `api_usage` | Daily Claude API call counter per user+action (rate limiting) |
| `token_quotas` | Per-parent lifetime token budget (total_tokens, used_tokens) |
| `token_usage_log` | Per-call token log (user_id, parent_id, action, input/output/total tokens) |
| `sqlite_sequence` | Auto-managed by SQLite for AUTOINCREMENT |

Schema auto-applied via `db.exec(SCHEMA_SQL)` on every server startup — no migration step needed.

## API Rate Limits
| Role | Action | Limit/day |
|------|--------|-----------|
| teacher | generate_exercises | 20 |
| parent | generate_exercises | 10 |
| student | generate_exercises | **blocked** (403) |
| student | skip_question | 20 |

- Date key = `YYYY-MM-DD` in **UTC+7** (Vietnam time)
- Resets at midnight UTC+7
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
GET  /api/rewards
POST /api/rewards
GET  /api/usage           → { generate_exercises: {used,limit,remaining}, skip_question: {...}, resetsAt }

POST /api/generate-exercises   (teacher/parent only; rate-limited; multipart/images + count + studentId)
POST /api/generate-skip        (student: rate-limited to 20/day)
POST /api/generate-extra       (teacher/parent/student via resolveStudentId)
```

### Parent only
```
GET  /parent/children                       → [{ id, username, display_name }]
POST /parent/children/:id/redeem            { points }
GET  /parent/quota                          → { total_tokens, used_tokens, remaining, unlimited }
```

### Teacher only
```
GET  /teacher/students                      → all students with parent names
GET  /teacher/parents                       → all parents with child names
GET  /teacher/students/:id/scores
GET  /teacher/students/:id/wrong-answers
GET  /teacher/leaderboard                   → sorted by points desc
GET  /teacher/usage                         → per-user daily API usage
POST /teacher/students                      { username, password, displayName, role, linkToParentId? }
POST /teacher/family-links                  { parentId, studentId }
DELETE /teacher/users/:id                   soft-delete (sets is_active=0)
PATCH  /teacher/users/:id/reactivate        restores is_active=1
GET  /teacher/quotas                        → all parents with quota info
POST /teacher/quotas/:parentId/topup        { tokens } → adds tokens to quota
POST /teacher/quotas/:parentId/set          { tokens } → sets absolute quota, resets used to 0
GET  /teacher/quotas/:parentId/history      → recent token usage log entries
```

## Teacher Dashboard (6 tabs)
| Tab | Content |
|-----|---------|
| 📊 Tổng quan | Student count + total points + leaderboard with medals |
| 👦 Học sinh | Searchable student list, detail panel (scores + wrong answers), deactivate/reactivate |
| 👨‍👩‍👧 PH | Parent list with linked children, inline deactivate/reactivate |
| 📈 Dùng API | Per-user rate limit usage with color-coded bars (green/amber/rose), refresh button |
| ➕ Thêm TK | Create student/parent account + link parent–student |
| 🪙 Quota | Token quota per parent: progress bar, top-up input, usage history panel |

## Data Structures

### Question Formats (in SQLite `questions` table)
- **Single answer** (`answer REAL`): one numeric answer + optional `unit`
- **Multi-answer** (`type = 'multi_answer'`, `answers_json`): multiple labeled boxes

**`order_matters` rules:**
- `true` — each labeled box must match its corresponding answer (perimeter ≠ area)
- `false` — any order accepted (fully interchangeable labels only)
- Default for "find two numbers" problems: `order_matters: true`, labels "Số lớn" / "Số bé"

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
- AI model selected via `AI_MODEL` env var: `claude` (default) → `claude-sonnet-4-20250514`; `gemini` → `gemini-2.0-flash`
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
