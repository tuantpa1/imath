# iMath — Math Learning Platform for Primary School Students

## Project Overview
Web application to help primary school children (ages 6–11) practice math.
Parents upload textbook photos → Claude AI generates exercises → Children complete them and earn reward points.

## Tech Stack
- **Frontend:** React + TypeScript (localhost:3000)
- **Backend:** Node.js + Express + TypeScript (localhost:3001)
- **AI:** Claude API (claude-sonnet-4-20250514) with vision for image reading
- **Storage:** JSON files in /data folder (no database)
- **Language:** UI in Vietnamese, code in English
- **Font:** Baloo 2 (Google Fonts) — child-friendly rounded font
- **Animations:** canvas-confetti (session complete screen), custom CSS keyframes in App.css

## Project Structure
```
imath/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       │   ├── StudentMode.tsx
│       │   └── ParentMode.tsx
│       └── App.tsx
├── backend/
│   └── src/
│       ├── routes/
│       ├── services/
│       │   ├── claudeService.ts     # Claude API integration
│       │   └── storageService.ts    # JSON file read/write
│       └── index.ts
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
  ]
}
```

### exercises.json
```json
{
  "sessions": [
    {
      "id": "session_001",
      "createdAt": "2026-03-04",
      "questions": [
        { "id": "q1", "question": "5 + 3 = ?", "answer": 8, "type": "addition" }
      ]
    }
  ]
}
```

## Core Rules & Logic

### Exercise Generation
- Parent uploads .jpg/.png of textbook page
- Backend sends image to Claude API (vision)
- Claude extracts math content and returns JSON array of questions
- Exercise types: addition, subtraction, multiplication, division, word problems

### Scoring & Retry Logic
- Correct answer → earn points (configurable per question)
- Wrong answer → must complete 2 similar questions before continuing
- Cannot skip — retry until all correct
- Show encouraging message on correct answer 🎉
- Show gentle retry message on wrong answer 💪

### Points & Rewards
- Points accumulate across all sessions → saved to scores.json
- Parent sets conversion rate (e.g. 100 points = 10,000 VND)
- All monetary values in VND
- Parent Mode: redeem points → reward money

## UI/UX Requirements
- Cute, colorful, child-friendly design
- Large buttons, fun animations, friendly emoji/icons
- Simple enough for 6-year-olds to use independently
- Responsive for desktop and tablet

## Commands
```bash
# Install dependencies
cd frontend && npm install
cd backend && npm install

# Run development
cd backend && npm run dev    # localhost:3001
cd frontend && npm run dev   # localhost:3000
```

## Implementation Order (follow strictly, one step at a time)
1. Project setup: React + TypeScript frontend, Express + TypeScript backend
2. Two-mode layout with PIN switching
3. Backend: JSON file read/write service
4. Backend: Claude API integration (image → exercises)
5. Parent Mode: image upload UI + exercise generation
6. Student Mode: exercise UI + answer checking + retry logic
7. Scoring system + JSON persistence
8. Points & reward conversion in Parent Mode
9. UI polish: animations, colors, child-friendly design

## Constraints
- Use `claude-sonnet-4-20250514` model for all Claude API calls
- Do NOT use a database — JSON files only
- Allowed UI libraries: Tailwind CSS, canvas-confetti, Google Fonts (Baloo 2)
- Always wait for confirmation before moving to the next implementation step

## UI Design System (Step 9)
- **Font:** `'Baloo 2'` via Google Fonts (applied globally in App.css)
- **Color palette:** rose/orange (primary action), violet/purple (Parent Mode), teal/cyan (secondary), amber (points)
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
