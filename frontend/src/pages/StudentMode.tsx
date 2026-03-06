import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

// ── Types ──────────────────────────────────────────────────────────────────────
interface AnswerPart {
  label: string;
  answer: number;
  unit: string;
}

interface Question {
  id: string;
  question: string;
  answer?: number;
  answers?: AnswerPart[];
  order_matters?: boolean;
  type: string;
  difficulty?: string;
  unit?: string;
}

interface Session {
  id: string;
  createdAt: string;
  imagePaths?: string[];
  completed?: boolean;
  isExtra?: boolean;
  questions: Question[];
}

interface WrongQuestionPart {
  label: string;
  correctAnswer: number;
  studentAnswer: number;
  unit: string;
}

interface WrongQuestion {
  question: string;
  type?: string;
  date: string;
  // single answer (old format, backward-compatible)
  correctAnswer?: string;
  studentAnswer?: string;
  // multi answer
  parts?: WrongQuestionPart[];
}

interface Scores {
  totalPoints: number;
  history: { date: string; earned: number; activity: string }[];
  redeemed: { date: string; points: number; amount: number }[];
  wrongQuestions: WrongQuestion[];
}

interface SavedProgress {
  sessionId: string;
  queue: Question[];
  sessionPoints: number;
  totalDone: number;
  correctCount: number;
}

type StudentView = 'home' | 'exercise' | 'complete';
type AnswerState = 'idle' | 'correct' | 'wrong';

interface StudentModeProps {
  onSwitchToParent: () => void;
}

const API = `${window.location.protocol}//${window.location.hostname}:3001/api`;
const POINTS_PER_QUESTION = 10;
const STORAGE_KEY = 'imath_progress';

// ── Helpers ────────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().split('T')[0];
}

function loadProgress(): SavedProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedProgress) : null;
  } catch {
    return null;
  }
}

function clearProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Header ─────────────────────────────────────────────────────────────────────
function Header({
  onSwitchToParent,
  totalPoints,
}: {
  onSwitchToParent: () => void;
  totalPoints: number;
}) {
  return (
    <header className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="text-3xl">🌟</span>
        <div>
          <h1 className="text-xl font-extrabold text-white drop-shadow-md leading-tight">iMath</h1>
          <p className="text-blue-100 text-[11px] font-semibold">Học Toán Thật Vui!</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-amber-400 text-amber-900 font-extrabold px-3 py-1.5 rounded-2xl text-sm shadow-md">
          ⭐ {totalPoints} điểm
        </div>
        <button
          onClick={onSwitchToParent}
          className="btn-scale flex items-center gap-1.5 bg-white/25 hover:bg-white/40 text-white font-bold px-3 py-1.5 rounded-2xl text-sm backdrop-blur-sm border border-white/30 shadow"
        >
          👨‍👩‍👧 Ba/Mẹ
        </button>
      </div>
    </header>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StudentMode({ onSwitchToParent }: StudentModeProps) {
  const [view, setView] = useState<StudentView>('home');
  const [scores, setScores] = useState<Scores>({
    totalPoints: 0,
    history: [],
    redeemed: [],
    wrongQuestions: [],
  });
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSavedProgress, setHasSavedProgress] = useState(false);

  // Exercise state
  const [queue, setQueue] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [originalQueue, setOriginalQueue] = useState<Question[]>([]);
  const [sessionPoints, setSessionPoints] = useState(0);
  const [totalDone, setTotalDone] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answerInput, setAnswerInput] = useState('');
  const [multiInputs, setMultiInputs] = useState<string[]>([]);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [skipsUsed, setSkipsUsed] = useState(0);
  const [skipping, setSkipping] = useState(false);
  const [extraLoading, setExtraLoading] = useState(false);
  const [floatPts, setFloatPts] = useState<{ id: number; pts: number; positive: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fire confetti when complete view loads
  useEffect(() => {
    if (view === 'complete') {
      setTimeout(() => {
        confetti({
          particleCount: 220,
          spread: 100,
          origin: { y: 0.55 },
          colors: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#2ECC71', '#8B5CF6', '#F97316'],
        });
      }, 200);
    }
  }, [view]);

  // ── Auto-save progress during exercise ──────────────────────────────────────
  useEffect(() => {
    if (view === 'exercise' && session && queue.length > 0) {
      const data: SavedProgress = {
        sessionId: session.id,
        queue,
        sessionPoints,
        totalDone,
        correctCount,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [queue, sessionPoints, totalDone, correctCount, view, session]);

  // ── Load data on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    loadHomeData();
  }, []);

  async function loadHomeData() {
    setLoading(true);
    try {
      const [scoresRes, exRes] = await Promise.all([
        fetch(`${API}/scores`),
        fetch(`${API}/exercises`),
      ]);
      const scoresData: Scores = await scoresRes.json();
      const exData: { sessions: Session[] } = await exRes.json();

      if (!scoresData.wrongQuestions) scoresData.wrongQuestions = [];
      setScores(scoresData);

      if (exData.sessions.length > 0) {
        const latestSession = exData.sessions[exData.sessions.length - 1];
        setSession(latestSession);
        const saved = loadProgress();
        setHasSavedProgress(
          saved !== null && saved.sessionId === latestSession.id && saved.queue.length > 0
        );
      } else {
        setHasSavedProgress(false);
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }

  // ── Start session ────────────────────────────────────────────────────────────
  function startExercise(questions: Question[]) {
    setOriginalQueue(questions);
    setQueue([...questions]);
    setCurrentQ(questions[0]);
    setSessionPoints(0);
    setTotalDone(0);
    setCorrectCount(0);
    setAnswerInput('');
    setMultiInputs([]);
    setAnswerState('idle');
    setSkipsUsed(0);
    setView('exercise');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleResume() {
    const saved = loadProgress();
    if (!saved || !session || saved.queue.length === 0) {
      handleStartLatest();
      return;
    }
    setOriginalQueue(session.questions);
    setQueue(saved.queue);
    setCurrentQ(saved.queue[0]);
    setSessionPoints(saved.sessionPoints);
    setTotalDone(saved.totalDone);
    setCorrectCount(saved.correctCount);
    setAnswerInput('');
    setMultiInputs([]);
    setAnswerState('idle');
    setSkipsUsed(0);
    setView('exercise');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleStartLatest() {
    if (!session) return;
    clearProgress();
    startExercise(session.questions);
  }

  async function handleRequestExtra() {
    if (!session) return;
    if (session.imagePaths && session.imagePaths.length > 0) {
      setExtraLoading(true);
      try {
        const res = await fetch(`${API}/generate-extra`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imagePaths: session.imagePaths,
            previousQuestions: session.questions.map((q) => q.question),
            count: 10,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const newSession: Session = data.session;
          setSession(newSession);
          clearProgress();
          startExercise(newSession.questions);
          return;
        }
      } catch {
        // fallback
      } finally {
        setExtraLoading(false);
      }
    }
    const shuffled = [...session.questions].sort(() => Math.random() - 0.5);
    clearProgress();
    startExercise(shuffled);
  }

  // ── Skip question ─────────────────────────────────────────────────────────────
  async function handleSkip() {
    if (skipsUsed >= 2 || answerState !== 'idle' || !currentQ || skipping) return;
    setSkipping(true);
    try {
      const isMultiAnswer = Array.isArray(currentQ.answers) && (currentQ.answers?.length ?? 0) > 0;
      const res = await fetch(`${API}/generate-skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalQuestion: currentQ.question,
          type: currentQ.type,
          difficulty: currentQ.difficulty ?? 'easy',
          isMultiAnswer,
          orderMatters: currentQ.order_matters ?? true,
          answersCount: currentQ.answers?.length ?? 2,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newQ: Question = {
          id: `skip_${Date.now()}`,
          question: data.question.question,
          answer: data.question.answer,
          answers: data.question.answers,
          order_matters: data.question.order_matters,
          type: data.question.type,
          difficulty: data.question.difficulty,
          unit: data.question.unit ?? '',
        };
        setQueue((prev) => [newQ, ...prev.slice(1)]);
        setCurrentQ(newQ);
        setSkipsUsed((s) => s + 1);
        setAnswerInput('');
        setMultiInputs([]);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } catch {
      // ignore
    } finally {
      setSkipping(false);
    }
  }

  // ── Answer submission ────────────────────────────────────────────────────────
  async function handleCheckAnswer() {
    if (!currentQ || answerState !== 'idle') return;

    const isMulti = Array.isArray(currentQ.answers) && (currentQ.answers?.length ?? 0) > 0;

    if (isMulti) {
      const parts = currentQ.answers!;
      const parsedInputs = parts.map((_, i) => parseFloat((multiInputs[i] ?? '').trim()));
      if (parsedInputs.some(isNaN)) return;

      let allCorrect: boolean;
      if (currentQ.order_matters === false) {
        const studentSorted = [...parsedInputs].sort((a, b) => a - b);
        const correctSorted = parts.map((p) => p.answer).sort((a, b) => a - b);
        allCorrect = studentSorted.every((val, i) => val === correctSorted[i]);
      } else {
        allCorrect = parsedInputs.every((val, i) => val === parts[i].answer);
      }

      if (allCorrect) {
        const newPoints = sessionPoints + POINTS_PER_QUESTION;
        setSessionPoints(newPoints);
        setCorrectCount((c) => c + 1);
        setAnswerState('correct');
        setFeedbackMsg('✅ Tất cả đúng rồi! 🎉');
        setFloatPts({ id: Date.now(), pts: POINTS_PER_QUESTION, positive: true });
        setTimeout(() => setFloatPts(null), 1200);

        const newTotal = scores.totalPoints + POINTS_PER_QUESTION;
        const newScores: Scores = {
          totalPoints: newTotal,
          history: [
            ...scores.history,
            { date: today(), earned: POINTS_PER_QUESTION, activity: 'exercise session' },
          ],
          redeemed: scores.redeemed,
          wrongQuestions: scores.wrongQuestions,
        };
        setScores(newScores);
        await fetch(`${API}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newScores),
        }).catch(() => {});

        setTimeout(() => advanceQueue(), 1500);
      } else {
        setAnswerState('wrong');
        setFloatPts({ id: Date.now(), pts: 5, positive: false });
        setTimeout(() => setFloatPts(null), 1200);

        const newTotal = Math.max(0, scores.totalPoints - 5);
        const newSessionPts = Math.max(0, sessionPoints - 5);
        setSessionPoints(newSessionPts);

        const newWrongEntries: WrongQuestion[] = [];
        let feedbackLines: string[];

        if (currentQ.order_matters === false) {
          // unordered: single summary feedback, save as one combined entry
          const correctStr = parts
            .map((p) => `${p.answer}${p.unit ? ' ' + p.unit : ''}`)
            .join(' và ');
          feedbackLines = [`❌ Sai rồi! 💪 Đáp án đúng là: ${correctStr}`];
          newWrongEntries.push({
            question: currentQ.question,
            type: 'multi_answer',
            date: today(),
            parts: parts.map((part, i) => ({
              label: part.label,
              correctAnswer: part.answer,
              studentAnswer: parsedInputs[i],
              unit: part.unit ?? '',
            })),
          });
        } else {
          // ordered: per-part feedback, save as ONE combined entry
          newWrongEntries.push({
            question: currentQ.question,
            type: 'multi_answer',
            date: today(),
            parts: parts.map((part, i) => ({
              label: part.label,
              correctAnswer: part.answer,
              studentAnswer: parsedInputs[i],
              unit: part.unit ?? '',
            })),
          });
          feedbackLines = parts.map((part, i) => {
            const unitStr = part.unit ? ` ${part.unit}` : '';
            const isPartCorrect = parsedInputs[i] === part.answer;
            return isPartCorrect
              ? `✅ ${part.label}: ${part.answer}${unitStr} — Đúng!`
              : `❌ ${part.label}: bạn điền ${parsedInputs[i]}, đáp án đúng là ${part.answer}${unitStr}`;
          });
        }

        setFeedbackMsg(feedbackLines.join('\n'));

        const newScores: Scores = {
          totalPoints: newTotal,
          history: scores.history,
          redeemed: scores.redeemed,
          wrongQuestions: [...scores.wrongQuestions, ...newWrongEntries],
        };
        setScores(newScores);
        await fetch(`${API}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newScores),
        }).catch(() => {});

        setTimeout(() => advanceQueue(), 2500);
      }
    } else {
      // ── Single-answer (existing logic) ────────────────────────────────────────
      const userAnswer = parseFloat(answerInput.trim());
      if (isNaN(userAnswer)) return;

      const unit = currentQ.unit ? ` ${currentQ.unit}` : '';

      if (userAnswer === currentQ.answer) {
        const newPoints = sessionPoints + POINTS_PER_QUESTION;
        setSessionPoints(newPoints);
        setCorrectCount((c) => c + 1);
        setAnswerState('correct');
        setFeedbackMsg('Đúng rồi! Giỏi lắm! 🎉');
        setFloatPts({ id: Date.now(), pts: POINTS_PER_QUESTION, positive: true });
        setTimeout(() => setFloatPts(null), 1200);

        const newTotal = scores.totalPoints + POINTS_PER_QUESTION;
        const newScores: Scores = {
          totalPoints: newTotal,
          history: [
            ...scores.history,
            { date: today(), earned: POINTS_PER_QUESTION, activity: 'exercise session' },
          ],
          redeemed: scores.redeemed,
          wrongQuestions: scores.wrongQuestions,
        };
        setScores(newScores);
        await fetch(`${API}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newScores),
        }).catch(() => {});

        setTimeout(() => advanceQueue(), 1500);
      } else {
        setAnswerState('wrong');
        setFeedbackMsg(`Đáp án đúng là: ${currentQ.answer}${unit}`);
        setFloatPts({ id: Date.now(), pts: 5, positive: false });
        setTimeout(() => setFloatPts(null), 1200);

        const newTotal = Math.max(0, scores.totalPoints - 5);
        const newSessionPts = Math.max(0, sessionPoints - 5);
        setSessionPoints(newSessionPts);

        const wrongEntry: WrongQuestion = {
          question: currentQ.question,
          type: 'single',
          correctAnswer: `${currentQ.answer}${unit}`,
          studentAnswer: answerInput.trim(),
          date: today(),
        };
        const newScores: Scores = {
          totalPoints: newTotal,
          history: scores.history,
          redeemed: scores.redeemed,
          wrongQuestions: [...scores.wrongQuestions, wrongEntry],
        };
        setScores(newScores);
        await fetch(`${API}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newScores),
        }).catch(() => {});

        setTimeout(() => advanceQueue(), 2000);
      }
    }
  }

  function advanceQueue() {
    setQueue((prev) => {
      const remaining = prev.slice(1);
      if (remaining.length === 0) {
        if (session) {
          fetch(`${API}/sessions/${session.id}/complete`, { method: 'PATCH' }).catch(() => {});
          setSession((s) => (s ? { ...s, completed: true } : s));
        }
        setView('complete');
        clearProgress();
        return [];
      }
      setCurrentQ(remaining[0]);
      setSkipsUsed(0);
      return remaining;
    });
    setTotalDone((d) => d + 1);
    setAnswerInput('');
    setMultiInputs([]);
    setAnswerState('idle');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCheckAnswer();
  };

  // ── Progress calculations ────────────────────────────────────────────────────
  const totalOriginal = originalQueue.length;
  const currentOriginalIndex = Math.min(totalDone + 1, totalOriginal);
  const progressPct = totalOriginal > 0 ? Math.round((totalDone / totalOriginal) * 100) : 0;
  const completionPct = totalOriginal > 0 ? Math.round((correctCount / totalOriginal) * 100) : 0;

  // ── Home view ────────────────────────────────────────────────────────────────
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 via-blue-300 to-purple-300 flex flex-col">
        <Header onSwitchToParent={onSwitchToParent} totalPoints={scores.totalPoints} />

        <main className="flex-1 flex flex-col items-center justify-center px-5 pb-10 gap-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <span className="text-5xl animate-spin">⭐</span>
              <p className="text-white text-xl font-extrabold animate-pulse">Đang tải...</p>
            </div>
          ) : (
            <div className="animate-fade-in w-full max-w-md flex flex-col gap-5">
              {/* Mascot greeting */}
              <div className="flex items-center gap-3 bg-white/30 backdrop-blur-sm rounded-3xl px-5 py-3 shadow border border-white/40">
                <span className="text-4xl">🐨</span>
                <p className="text-white font-bold text-sm leading-snug">
                  Xin chào! Hôm nay mình học Toán nhé! 📚
                </p>
              </div>

              {/* Points card */}
              <div className="bg-white rounded-3xl shadow-2xl p-6 text-center border border-amber-100">
                <div className="animate-pulse-star text-7xl mb-3 inline-block">⭐</div>
                <p className="text-6xl font-extrabold text-amber-500 mb-1 leading-none">
                  {scores.totalPoints}
                </p>
                <p className="text-gray-400 font-semibold text-sm">Tổng điểm của bé 🌟</p>
              </div>

              {/* Action buttons */}
              {session ? (
                <div className="flex flex-col gap-3">
                  {!session.completed && (
                    <button
                      onClick={hasSavedProgress ? handleResume : handleStartLatest}
                      className="btn-scale w-full py-5 rounded-3xl bg-gradient-to-r from-rose-400 to-orange-400 text-white font-extrabold text-xl shadow-xl border border-rose-300"
                    >
                      {hasSavedProgress ? '📚 Tiếp tục bài tập' : '📚 Làm Bài Tập'}
                    </button>
                  )}

                  {session.completed && !session.isExtra && (
                    <>
                      <div className="w-full py-4 rounded-3xl bg-gradient-to-r from-green-400 to-emerald-500 text-white font-extrabold text-lg text-center shadow-lg border border-green-300 animate-bounce-in">
                        ✅ Đã hoàn thành! Giỏi quá!
                      </div>
                      <button
                        onClick={handleRequestExtra}
                        disabled={extraLoading}
                        className="btn-scale w-full py-5 rounded-3xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-extrabold text-xl shadow-xl border border-violet-400 disabled:opacity-60"
                      >
                        {extraLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin inline-block">⭐</span> Đang tạo bài...
                          </span>
                        ) : (
                          '🎁 Làm thêm bài'
                        )}
                      </button>
                    </>
                  )}

                  {session.completed && session.isExtra && (
                    <>
                      <div className="w-full py-4 rounded-3xl bg-gradient-to-r from-teal-400 to-cyan-500 text-white font-extrabold text-lg text-center shadow-lg border border-teal-300 animate-bounce-in">
                        ✅ Đã hoàn thành bài bonus! Tuyệt vời!
                      </div>
                      <button
                        disabled
                        className="w-full py-5 rounded-3xl bg-gradient-to-r from-violet-400 to-purple-500 text-white font-extrabold text-xl shadow-xl border border-violet-300 opacity-40 cursor-not-allowed"
                      >
                        🎁 Làm thêm bài
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-white/70 rounded-3xl p-7 text-center shadow-lg border border-white/50">
                  <p className="text-4xl mb-3">📚</p>
                  <p className="text-indigo-700 font-extrabold text-lg">Chưa có bài tập.</p>
                  <p className="text-gray-500 font-semibold text-sm mt-1">
                    Nhờ ba/mẹ tạo bài nhé! 🎓
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Exercise view ────────────────────────────────────────────────────────────
  if (view === 'exercise' && currentQ) {
    const isCorrect = answerState === 'correct';
    const isWrong = answerState === 'wrong';
    const isBusy = isCorrect || isWrong || skipping;
    const skipsLeft = 2 - skipsUsed;
    const isMultiAnswer = Array.isArray(currentQ.answers) && (currentQ.answers?.length ?? 0) > 0;
    const allInputsFilled = isMultiAnswer
      ? multiInputs.length === currentQ.answers!.length &&
        multiInputs.every((v) => v.trim() !== '')
      : answerInput.trim() !== '';

    return (
      <div
        className={`min-h-screen flex flex-col transition-colors duration-300 ${
          isCorrect
            ? 'bg-gradient-to-b from-green-400 to-emerald-300'
            : isWrong
            ? 'bg-gradient-to-b from-rose-400 to-red-300'
            : 'bg-gradient-to-b from-sky-400 via-blue-300 to-indigo-300'
        }`}
      >
        {/* Floating points indicator */}
        {floatPts && (
          <div
            key={floatPts.id}
            className={`fixed top-1/3 left-1/2 -translate-x-1/2 pointer-events-none z-50 text-3xl font-extrabold animate-float-up ${
              floatPts.positive ? 'text-green-300' : 'text-red-300'
            }`}
          >
            {floatPts.positive ? `+${floatPts.pts}` : `-${floatPts.pts}`} ⭐
          </div>
        )}

        {/* Exercise header */}
        <header className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="bg-white/30 backdrop-blur-sm text-white font-extrabold px-4 py-2 rounded-2xl text-sm border border-white/30 shadow">
              Câu {currentOriginalIndex}/{totalOriginal} 🔢
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-400 text-amber-900 font-extrabold px-3 py-2 rounded-2xl shadow-md text-sm">
            ⭐ +{sessionPoints}
          </div>
        </header>

        {/* Progress bar */}
        <div className="mx-5 mb-2">
          <div className="h-2.5 bg-white/30 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-amber-300 to-green-400 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <main className="flex-1 flex flex-col items-center justify-center px-5 pb-8 gap-5">
          {/* Question card */}
          <div
            className={`bg-white rounded-3xl shadow-2xl p-7 w-full max-w-md overflow-hidden text-center transition-all duration-300 border-4 ${
              isCorrect
                ? 'border-green-400 scale-[1.02]'
                : isWrong
                ? 'border-rose-400'
                : 'border-transparent'
            }`}
          >
            <p className="text-gray-400 text-xs font-bold mb-3 uppercase tracking-widest">
              {currentQ.type === 'word_problem' || currentQ.type === 'multi_answer'
                ? '📝 Bài toán'
                : '🧮 Tính'}
            </p>
            <p className="text-2xl font-extrabold text-indigo-700 leading-relaxed mb-5">
              {currentQ.question}
            </p>

            {/* Feedback */}
            {(isCorrect || isWrong) && (
              <div
                className={`animate-bounce-in text-lg font-extrabold py-3 px-4 rounded-2xl mb-4 text-left ${
                  isCorrect ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-500'
                }`}
              >
                {feedbackMsg.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-1' : ''}>
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* Answer inputs */}
            {!isCorrect && (
              isMultiAnswer ? (
                <div className="flex flex-col gap-3 mt-2 w-full">
                  {currentQ.order_matters === false ? (
                    <p className="text-indigo-400 text-xs font-semibold text-center">
                      (Không cần theo thứ tự) 💡
                    </p>
                  ) : (
                    <p className="text-indigo-400 text-xs font-semibold text-center">
                      Điền đúng vào từng ô nhé! 📝
                    </p>
                  )}
                  {currentQ.answers!.map((part, i) => (
                    <div key={i} className="flex gap-2 items-center w-full min-w-0">
                      <span className="text-indigo-600 font-bold text-sm flex-shrink-0 text-right">
                        {part.label}:
                      </span>
                      <input
                        ref={i === 0 ? inputRef : undefined}
                        type="number"
                        inputMode="numeric"
                        value={multiInputs[i] ?? ''}
                        onChange={(e) => {
                          const next = [...multiInputs];
                          next[i] = e.target.value;
                          setMultiInputs(next);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && i === currentQ.answers!.length - 1)
                            handleCheckAnswer();
                        }}
                        disabled={isBusy}
                        placeholder="Đáp án..."
                        className="input-glow flex-1 min-w-0 text-xl font-extrabold text-center border-4 border-indigo-200 rounded-2xl py-2 px-3 focus:border-indigo-500 disabled:opacity-50 transition-all"
                      />
                      {part.unit && (
                        <span className="bg-indigo-100 text-indigo-700 font-extrabold px-3 py-2 rounded-2xl text-sm whitespace-nowrap flex-shrink-0">
                          {part.unit}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2 items-center w-full min-w-0">
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="numeric"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isBusy}
                    placeholder="Nhập đáp án..."
                    className="input-glow flex-1 min-w-0 text-2xl font-extrabold text-center border-4 border-indigo-200 rounded-2xl py-3 px-3 focus:border-indigo-500 disabled:opacity-50 transition-all"
                  />
                  {currentQ.unit && (
                    <span className="bg-indigo-100 text-indigo-700 font-extrabold px-3 py-3 rounded-2xl text-lg whitespace-nowrap flex-shrink-0">
                      {currentQ.unit}
                    </span>
                  )}
                  <button
                    onClick={handleCheckAnswer}
                    disabled={!answerInput.trim() || isBusy}
                    className="btn-scale flex-shrink-0 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white font-extrabold text-xl px-4 rounded-2xl py-3 shadow-md"
                  >
                    ✓
                  </button>
                </div>
              )
            )}

            {skipping && (
              <p className="text-indigo-400 text-sm font-bold mt-3 animate-pulse">
                Đang đổi câu hỏi mới... ⏳
              </p>
            )}
          </div>

          {/* Check button */}
          {!isCorrect && !isBusy && (
            <button
              onClick={handleCheckAnswer}
              disabled={!allInputsFilled}
              className="btn-scale w-full max-w-md py-5 rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-40 text-white font-extrabold text-2xl shadow-xl border border-indigo-400"
            >
              Kiểm tra ✅
            </button>
          )}

          {/* Skip section */}
          {!isCorrect && (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleSkip}
                disabled={skipsUsed >= 2 || answerState !== 'idle' || skipping}
                className="btn-scale flex items-center gap-2 bg-white/25 hover:bg-white/40 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-2xl text-sm backdrop-blur-sm border border-white/30 shadow"
              >
                Đổi câu hỏi 🔄
              </button>
              {/* Skip icons */}
              <div className="flex items-center gap-1.5">
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className={`text-xl transition-opacity ${i < skipsLeft ? 'opacity-100' : 'opacity-25'}`}
                  >
                    🔄
                  </span>
                ))}
                <span className="text-white/60 text-xs font-semibold ml-1">
                  {skipsLeft} lần còn lại
                </span>
              </div>
            </div>
          )}

          {/* Quit button */}
          <button
            onClick={() => {
              if (queue.length > 0 && session) {
                const data: SavedProgress = {
                  sessionId: session.id,
                  queue,
                  sessionPoints,
                  totalDone,
                  correctCount,
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
              }
              setView('home');
              loadHomeData();
            }}
            className="text-white/60 font-bold text-sm hover:text-white/90 transition-colors"
          >
            ← Về trang chủ
          </button>
        </main>
      </div>
    );
  }

  // ── Complete view ────────────────────────────────────────────────────────────
  if (view === 'complete') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-300 via-orange-200 to-pink-200 flex flex-col">
        <header className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🌟</span>
            <div>
              <h1 className="text-xl font-extrabold text-white drop-shadow-md leading-tight">iMath</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-400 text-amber-900 font-extrabold px-3 py-1.5 rounded-2xl text-sm shadow-md">
            ⭐ {scores.totalPoints} điểm
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-5 pb-10 gap-5">
          {/* Trophy + congrats */}
          <div className="animate-pop-in bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center border-4 border-amber-200">
            <div className="text-7xl mb-3 animate-bounce">🏆</div>
            <h2 className="text-3xl font-extrabold text-amber-600 mb-1">Xuất sắc!</h2>
            <p className="text-gray-500 font-semibold mb-6">Bé đã hoàn thành bài tập! 🎊</p>

            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                <p className="text-3xl font-extrabold text-amber-500">+{sessionPoints}</p>
                <p className="text-amber-700 text-xs font-bold mt-1">điểm lần này</p>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                <p className="text-3xl font-extrabold text-indigo-500">{scores.totalPoints}</p>
                <p className="text-indigo-700 text-xs font-bold mt-1">tổng điểm</p>
              </div>
              <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
                <p className="text-3xl font-extrabold text-green-500">{completionPct}%</p>
                <p className="text-green-700 text-xs font-bold mt-1">hoàn thành</p>
              </div>
            </div>
          </div>

          <div className="animate-slide-up w-full max-w-md flex flex-col gap-3">
            <button
              onClick={handleRequestExtra}
              disabled={extraLoading}
              className="btn-scale w-full py-5 rounded-3xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-extrabold text-xl shadow-xl border border-violet-400 disabled:opacity-60"
            >
              {extraLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin inline-block">⭐</span> Đang tạo bài...
                </span>
              ) : (
                '🎁 Làm thêm bài'
              )}
            </button>
            <button
              onClick={() => {
                setView('home');
                loadHomeData();
              }}
              className="btn-scale w-full py-5 rounded-3xl bg-white text-indigo-600 font-extrabold text-xl shadow-lg hover:bg-indigo-50 border border-indigo-100"
            >
              🏠 Về Trang Chủ
            </button>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
