# iMath — Math Learning Platform for Primary School Students

## Project Overview
Web application to help primary school children (ages 6–11) practice math.
Parents upload textbook photos → Claude AI generates exercises → Children complete them and earn reward points.

## Status
**All features implemented.** Multi-answer questions, mobile layout fixes, and wrong-answer history grouping all complete.

## Tech Stack
- **Frontend:** React + TypeScript (port 3000)
- **Backend:** Node.js + Express + TypeScript (port 3001)
- **AI:** Claude API (`claude-sonnet-4-20250514`) with vision for image reading
- **Storage:** JSON files in `/data` folder (no database)
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
│       ├── components/
│       ├── pages/
│       │   ├── StudentMode.tsx   # API URL uses window.location.hostname (dynamic)
│       │   └── ParentMode.tsx    # API URL uses window.location.hostname (dynamic)
│       ├── App.css               # Global styles + animation keyframes + mobile safeguards
│       └── App.tsx
├── backend/
│   └── src/
│       ├── routes/
│       │   ├── dataRoutes.ts     # scores, exercises, rewards CRUD
│       │   └── uploadRoutes.ts   # image upload, exercise/skip/extra generation
│       ├── services/
│       │   ├── claudeService.ts  # Claude API integration + mergeRelatedQuestions
│       │   └── storageService.ts # JSON file read/write + Question union type
│       └── index.ts              # Listens on 0.0.0.0, CORS open to all origins
└── data/
    ├── exercises.json
    ├── scores.json
    └── rewards.json
```

## Two Modes
- **Student Mode** (default, no PIN): do exercises, view points, request extra exercises
- **Parent Mode** (PIN protected): upload images, generate exercises, convert points to rewards

## Data Structure

### scores.json
```json
{
  "totalPoints": 0,
  "history": [
    { "date": "2026-03-04", "earned": 50, "activity": "exercise session" }
  ],
  "redeemed": [
    { "date": "2026-03-04", "points": 100, "amount": 10000 }
  ],
  "wrongQuestions": [
    { "question": "5 + 3 = ?", "type": "single", "correctAnswer": "8", "studentAnswer": "7", "date": "2026-03-04" },
    {
      "question": "Tổng 16, hiệu 2. Tìm hai số đó.",
      "type": "multi_answer",
      "date": "2026-03-04",
      "parts": [
        { "label": "Số lớn", "correctAnswer": 9, "studentAnswer": 7, "unit": "" },
        { "label": "Số bé",  "correctAnswer": 7, "studentAnswer": 9, "unit": "" }
      ]
    }
  ]
}
```

**Backward compatibility:** old entries without `type` or `parts` still render correctly in Parent Mode (detected by presence of `correctAnswer` string field).

### exercises.json
```json
{
  "sessions": [
    {
      "id": "session_001",
      "createdAt": "2026-03-04",
      "imagePaths": [],
      "completed": false,
      "isExtra": false,
      "questions": [
        { "id": "q1", "question": "5 + 3 = ?", "answer": 8, "type": "addition", "difficulty": "easy", "unit": "" },
        {
          "id": "q2", "question": "Tính chu vi và diện tích hình chữ nhật dài 8cm, rộng 5cm",
          "type": "multi_answer", "order_matters": true, "difficulty": "medium",
          "answers": [{ "label": "Chu vi", "answer": 26, "unit": "cm" }, { "label": "Diện tích", "answer": 40, "unit": "cm²" }]
        },
        {
          "id": "q3", "question": "Tổng của hai số là 16, hiệu là 2. Tìm hai số đó.",
          "type": "multi_answer", "order_matters": true, "difficulty": "medium",
          "answers": [{ "label": "Số lớn", "answer": 9, "unit": "" }, { "label": "Số bé", "answer": 7, "unit": "" }]
        }
      ]
    }
  ]
}
```

### Question Formats
- **Single answer** (`answer` field): standard question with one numeric answer
- **Multi-answer** (`type: "multi_answer"`, `answers` array): multiple labeled input boxes

**Detection:** `question.answers` array present → multi-answer mode; `question.answer` field → single-answer mode (no change to existing behavior)

**`order_matters` rules:**
- `true` — student must fill each labeled box with the correct value (e.g. "Số lớn" must get the larger number, "Chu vi" must get the perimeter). Wrong order = wrong answer.
- `false` — any order accepted (only for fully interchangeable labels like "Số thứ nhất"/"Số thứ hai" with no bigger/smaller constraint)
- **Default for "find two numbers" problems:** always `order_matters: true` with labels "Số lớn" / "Số bé"

### TypeScript Types (backend — storageService.ts)
```typescript
type Question = SingleAnswerQuestion | MultiAnswerQuestion;
// Discriminant: type === 'multi_answer' → MultiAnswerQuestion; else → SingleAnswerQuestion
```

## Core Rules & Logic

### Exercise Generation
- Parent uploads .jpg/.png of textbook page
- Backend sends image to Claude API (vision)
- Claude extracts math content and returns JSON array of questions
- Post-processing: `mergeRelatedQuestions()` in `claudeService.ts` merges any split "find two numbers" pairs that Claude returns as separate single-answer questions into one `multi_answer` question
- Exercise types: addition, subtraction, multiplication, division, word problems, multi_answer

### Multi-Answer Scoring
- **Correct (all parts right):** +10 points, show "✅ Tất cả đúng rồi! 🎉"
- **Wrong (order_matters: true):** -5 points, show per-part feedback: "✅ Số lớn: 9 — Đúng! / ❌ Số bé: bạn điền 9, đáp án đúng là 7"
- **Wrong (order_matters: false):** -5 points, show summary: "❌ Sai rồi! 💪 Đáp án đúng là: 9 và 7"
- Wrong multi-answer saved as ONE entry with `parts[]` array (not split per part)

### Scoring & Retry Logic
- Correct answer → earn 10 points per question (`POINTS_PER_QUESTION = 10`)
- Wrong answer → -5 points, advance after feedback delay
- Progress auto-saved to `localStorage` (`imath_progress` key) so a page refresh resumes the session
- Skip button: 2 skips per question, calls `/api/generate-skip` for a replacement question

### Points & Rewards
- Points accumulate across all sessions → saved to `scores.json`
- Parent sets conversion rate (e.g. 100 points = 10,000 VND)
- All monetary values in VND
- Parent Mode: redeem points → reward money

### Wrong Questions Display (Parent Mode)
- Single-answer entry: shows "✓ Đúng: X  ✗ Bé trả lời: Y"
- Multi-answer entry: shows one row per part — "Label: ✓ Đúng: X  ✗ Bé trả lời: Y"
- Grouped by date, newest first

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
cd backend && npm run dev    # port 3001
cd frontend && npm run dev   # port 3000

# Type-check
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Network / LAN Access
- Backend binds to `0.0.0.0` and accepts CORS from any origin
- Vite dev server binds to `0.0.0.0`
- API URLs in StudentMode and ParentMode use `window.location.hostname` (dynamic — works on both localhost and LAN IP)
- `npm start` prints the machine's LAN IP so other devices can connect
- See `NETWORK_SETUP.md` for the full Vietnamese setup guide

## Constraints
- Use `claude-sonnet-4-20250514` model for all Claude API calls
- Do NOT use a database — JSON files only
- Allowed UI libraries: Tailwind CSS, canvas-confetti, Google Fonts (Baloo 2)

## UI Design System
- **Font:** `'Baloo 2'` via Google Fonts (applied globally in App.css)
- **Color palette:** rose/orange (primary action), violet/purple (Parent Mode), teal/cyan (secondary), amber (points)
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
