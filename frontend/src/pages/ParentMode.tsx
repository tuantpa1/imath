import { useState, useRef, useEffect } from 'react';
import { api, ApiError } from '../services/apiService';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Child {
  id: number;
  username: string;
  display_name: string;
}

interface AnswerPart {
  label: string;
  answer: number;
  unit: string;
}

interface GeneratedQuestion {
  question: string;
  answer?: number;
  answer_text?: string;
  answers?: AnswerPart[];
  order_matters?: boolean;
  type: string;
  difficulty: string;
  unit?: string;
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

interface ScoresData {
  totalPoints: number;
  history: { date: string; earned: number; activity: string }[];
  redeemed: { date: string; points: number; amount: number }[];
  wrongQuestions: WrongQuestion[];
}

type ParentView = 'dashboard' | 'upload' | 'scores';
type UploadState = 'idle' | 'loading' | 'success' | 'error';

interface ParentModeProps {
  onExitToStudent: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── Child selector ─────────────────────────────────────────────────────────────
function ChildSelector({
  children,
  selectedId,
  onChange,
}: {
  children: Child[];
  selectedId: number | null;
  onChange: (id: number) => void;
}) {
  if (children.length <= 1) return null;
  return (
    <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/30">
      <span className="text-white font-bold text-sm shrink-0">👦 Bé:</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
      >
        {children.map((c) => (
          <option key={c.id} value={c.id} className="text-gray-800">
            {c.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Shared header ──────────────────────────────────────────────────────────────
function Header({
  onExitToStudent,
  children,
  selectedChildId,
  onChildChange,
}: {
  onExitToStudent: () => void;
  children: Child[];
  selectedChildId: number | null;
  onChildChange: (id: number) => void;
}) {
  return (
    <header className="flex flex-col gap-2 px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-3xl">👨‍👩‍👧</span>
          <div>
            <h1 className="text-xl font-extrabold text-white drop-shadow-md leading-tight">iMath</h1>
            <p className="text-purple-100 text-[11px] font-semibold">Chế Độ Ba/Mẹ</p>
          </div>
        </div>
        <button
          onClick={onExitToStudent}
          className="btn-scale flex items-center gap-1.5 bg-white/25 hover:bg-white/40 text-white font-bold px-3 py-1.5 rounded-2xl text-sm backdrop-blur-sm border border-white/30 shadow"
        >
          🏠 Về trang học
        </button>
      </div>
      <ChildSelector children={children} selectedId={selectedChildId} onChange={onChildChange} />
    </header>
  );
}

// ── Difficulty badge ───────────────────────────────────────────────────────────
const diffStyle: Record<string, string> = {
  easy:   'bg-green-100 text-green-700 border border-green-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
  hard:   'bg-rose-100 text-rose-700 border border-rose-200',
};

// ── Success view ───────────────────────────────────────────────────────────────
function SuccessView({
  questions,
  onBack,
  onUploadMore,
}: {
  questions: GeneratedQuestion[];
  onBack: () => void;
  onUploadMore: () => void;
}) {
  const typeEmoji: Record<string, string> = {
    addition: '➕', subtraction: '➖', multiplication: '✖️',
    division: '➗', word_problem: '📝',
  };

  return (
    <div className="w-full max-w-lg flex flex-col gap-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl p-6 text-center border border-purple-100">
        <div className="text-5xl mb-2 animate-bounce-in inline-block">🎉</div>
        <h2 className="text-2xl font-extrabold text-purple-700 mt-1">
          Đã tạo {questions.length} bài tập mới!
        </h2>
        <p className="text-gray-400 text-sm mt-1">Bé có thể làm ngay bây giờ. 📚</p>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-purple-100">
        <div className="px-5 py-3.5 bg-purple-50 border-b border-purple-100">
          <p className="font-extrabold text-purple-700 text-sm">📋 Danh sách bài tập</p>
        </div>
        <ul className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {questions.map((q, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
              <span className="text-xl mt-0.5 shrink-0">{typeEmoji[q.type] ?? '❓'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm leading-snug">{q.question}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Đáp án:{' '}
                  <span className="font-extrabold text-purple-600">
                    {q.type === 'multi_answer' && q.answers
                      ? q.answers.map(a => `${a.label}: ${a.answer}${a.unit ? ' ' + a.unit : ''}`).join(' | ')
                      : q.type === 'fraction'
                      ? (q.answer_text || 'N/A')
                      : `${q.answer ?? ''}${q.unit ? ` ${q.unit}` : ''}`}
                  </span>
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${diffStyle[q.difficulty] ?? 'bg-gray-100 text-gray-500'}`}>
                {q.difficulty}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onUploadMore}
        className="btn-scale w-full py-4 rounded-3xl bg-gradient-to-r from-blue-400 to-cyan-500 text-white font-extrabold text-lg shadow-xl border border-blue-300"
      >
        📷 Tải thêm ảnh mới
      </button>
      <button
        onClick={onBack}
        className="text-white/70 font-bold text-sm hover:text-white transition-colors text-center"
      >
        ← Về trang chính
      </button>
    </div>
  );
}

// ── Scores view ───────────────────────────────────────────────────────────────
function ScoresView({ onBack, studentId }: { onBack: () => void; studentId: number }) {
  const [scoresData, setScoresData] = useState<ScoresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemMsg, setRedeemMsg] = useState('');
  const [redeemWarning, setRedeemWarning] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<ScoresData>(`/api/scores?studentId=${studentId}`)
      .then((data) => {
        if (!data.wrongQuestions) data.wrongQuestions = [];
        if (!data.redeemed) data.redeemed = [];
        setScoresData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [studentId]);

  const clearWrong = async () => {
    if (!scoresData) return;
    const updated = { ...scoresData, wrongQuestions: [] };
    await api.post(`/api/scores?studentId=${studentId}`, updated).catch(() => {});
    setScoresData(updated);
  };

  const handleRedeem = async () => {
    if (!scoresData) return;
    const pts = parseInt(redeemInput, 10);
    if (isNaN(pts) || pts <= 0) return;
    if (pts > scoresData.totalPoints) {
      setRedeemWarning('Số điểm không đủ!');
      setRedeemMsg('');
      return;
    }
    setRedeemWarning('');
    setRedeeming(true);

    try {
      await api.post(`/parent/children/${studentId}/redeem`, { points: pts });
      const updated: ScoresData = {
        ...scoresData,
        totalPoints: scoresData.totalPoints - pts,
        redeemed: [{ date: today(), points: pts, amount: 0 }, ...scoresData.redeemed],
      };
      setScoresData(updated);
      setRedeemMsg(`Đã đổi ${pts} điểm thành công! 🎉`);
    } catch (err) {
      setRedeemWarning(err instanceof ApiError ? err.message : 'Đổi điểm thất bại, vui lòng thử lại.');
    }
    setRedeemInput('');
    setRedeeming(false);
  };

  const wrongQuestions: WrongQuestion[] = scoresData?.wrongQuestions ?? [];
  const grouped = wrongQuestions.reduce<Record<string, WrongQuestion[]>>((acc, q) => {
    if (!acc[q.date]) acc[q.date] = [];
    acc[q.date].push(q);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <span className="text-5xl animate-spin">⭐</span>
        <p className="text-white font-extrabold animate-pulse">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg flex flex-col gap-4 animate-fade-in">
      {/* Points hero */}
      <div className="bg-white rounded-3xl shadow-2xl p-6 text-center border border-purple-100">
        <div className="text-5xl mb-2 animate-pulse-star inline-block">📊</div>
        <h2 className="text-2xl font-extrabold text-purple-700 mb-2">Điểm Của Bé</h2>
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-2">
          <span className="text-3xl">⭐</span>
          <span className="text-4xl font-extrabold text-amber-500">{scoresData?.totalPoints ?? 0}</span>
          <span className="text-amber-700 font-bold">điểm</span>
        </div>
      </div>

      {/* Redeem card */}
      <div className="bg-white rounded-3xl shadow-xl p-5 border border-purple-100">
        <h3 className="text-lg font-extrabold text-purple-700 mb-1 flex items-center gap-2">
          🎁 Đổi Quà
        </h3>
        <p className="text-xs text-gray-400 font-semibold mb-4">
          Điểm hiện có: <span className="text-amber-500 font-extrabold">{scoresData?.totalPoints ?? 0} ⭐</span>
        </p>

        <div className="flex gap-2 items-stretch">
          <input
            type="number"
            min={1}
            value={redeemInput}
            onChange={(e) => {
              setRedeemInput(e.target.value);
              setRedeemWarning('');
              setRedeemMsg('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
            placeholder="Nhập số điểm muốn đổi..."
            className="input-glow flex-1 text-base font-bold border-2 border-purple-200 rounded-2xl py-2.5 px-4 focus:border-purple-500 transition-all"
          />
          <button
            onClick={handleRedeem}
            disabled={!redeemInput || redeeming}
            className="btn-scale bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 disabled:opacity-40 text-white font-extrabold px-5 rounded-2xl shadow-md"
          >
            {redeeming ? '...' : 'Đổi'}
          </button>
        </div>

        {redeemWarning && (
          <p className="mt-2 text-orange-500 font-bold text-sm">⚠️ {redeemWarning}</p>
        )}
        {redeemMsg && (
          <p className="mt-2 text-green-600 font-bold text-sm animate-bounce-in">✅ {redeemMsg}</p>
        )}

        {/* Redemption history */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="font-extrabold text-gray-700 text-sm mb-3">📜 Lịch sử đổi quà</p>
          {(scoresData?.redeemed ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm font-semibold text-center py-3">
              Chưa có lịch sử đổi quà
            </p>
          ) : (
            <ul className="flex flex-col gap-2 max-h-40 overflow-y-auto">
              {(scoresData?.redeemed ?? []).map((r, i) => (
                <li key={i} className="flex items-center justify-between bg-purple-50 rounded-2xl px-4 py-2 border border-purple-100">
                  <span className="text-gray-500 font-semibold text-xs">📅 {r.date}</span>
                  <span className="text-purple-600 font-extrabold text-sm">— {r.points} điểm ⭐</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Wrong questions card */}
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-purple-100">
        <div className="px-5 py-3.5 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
          <p className="font-extrabold text-rose-700 text-sm">❌ Câu trả lời sai</p>
          {wrongQuestions.length > 0 && (
            <button
              onClick={clearWrong}
              className="text-xs text-red-400 hover:text-red-600 font-bold transition-colors"
            >
              Xóa lịch sử lỗi 🗑️
            </button>
          )}
        </div>
        {sortedDates.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 font-semibold">
            <p className="text-3xl mb-2">🎉</p>
            <p>Chưa có câu sai nào!</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {sortedDates.map((date) => (
              <div key={date}>
                <div className="px-5 py-2 bg-gray-50 text-xs font-extrabold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  📅 {date}
                </div>
                <ul className="divide-y divide-gray-50">
                  {grouped[date].map((q, i) => (
                    <li key={i} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                      <p className="font-bold text-gray-800 text-sm mb-1.5 leading-snug">{q.question}</p>
                      {q.parts ? (
                        <div className="flex flex-col gap-1.5">
                          {q.parts.map((part, pi) => (
                            <div key={pi} className="flex flex-wrap gap-2 items-center text-xs font-semibold">
                              <span className="text-gray-500 font-bold min-w-fit">{part.label}:</span>
                              <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-200">
                                ✓ Đúng: {part.correctAnswer}{part.unit ? ` ${part.unit}` : ''}
                              </span>
                              <span className="bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full border border-rose-200">
                                ✗ Bé trả lời: {part.studentAnswer}{part.unit ? ` ${part.unit}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3 text-xs font-semibold">
                          <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-200">
                            ✓ Đúng: {q.correctAnswer}
                          </span>
                          <span className="bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full border border-rose-200">
                            ✗ Bé trả lời: {q.studentAnswer}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onBack}
        className="text-white/70 font-bold text-sm hover:text-white transition-colors text-center pb-2"
      >
        ← Về trang chính
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ParentMode({ onExitToStudent }: ParentModeProps) {
  const [view, setView] = useState<ParentView>('dashboard');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [sizeWarning, setSizeWarning] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Child selection
  const [childList, setChildList] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [genUsage, setGenUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [tokenQuota, setTokenQuota] = useState<{
    total_tokens: number; used_tokens: number; remaining: number; unlimited: boolean;
  } | null>(null);

  useEffect(() => {
    api.get<Child[]>('/parent/children')
      .then((data) => {
        setChildList(data);
        if (data.length > 0) setSelectedChildId(data[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get<{ generate_exercises: { used: number; limit: number; remaining: number } }>('/api/usage')
      .then((data) => setGenUsage(data.generate_exercises))
      .catch(() => {});
    api.get('/parent/quota').then((data) => setTokenQuota(data as typeof tokenQuota)).catch(() => {});
  }, []);

  const applyFiles = (newFiles: File[]) => {
    const valid: File[] = [];
    let warning = '';
    for (const f of newFiles) {
      if (!['image/jpeg', 'image/png'].includes(f.type)) {
        warning = 'Chỉ chấp nhận file .jpg hoặc .png!';
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        warning = 'Một số ảnh quá lớn! Tối đa 5MB mỗi ảnh.';
        continue;
      }
      valid.push(f);
    }
    setSizeWarning(warning);
    setErrorMsg('');
    setUploadState('idle');
    setFiles((prev) => [...prev, ...valid]);
    setPreviewUrls((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    applyFiles(Array.from(e.dataTransfer.files));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const resetUpload = () => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    setFiles([]);
    setPreviewUrls([]);
    setUploadState('idle');
    setErrorMsg('');
    setSizeWarning('');
    setQuestions([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async () => {
    if (files.length === 0 || selectedChildId === null) return;
    setUploadState('loading');
    setErrorMsg('');
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('images', f));
      formData.append('count', String(questionCount));

      const genData = await api.post<{ questions: GeneratedQuestion[] }>(
        `/api/generate-exercises?studentId=${selectedChildId}`,
        formData
      );
      const rawQuestions: GeneratedQuestion[] = genData.questions ?? [];
      if (rawQuestions.length === 0) throw new Error('Không thể tạo bài tập, vui lòng thử lại.');

      setQuestions(rawQuestions);
      setUploadState('success');
      setGenUsage((prev) => prev ? { ...prev, used: prev.used + 1, remaining: prev.remaining - 1 } : prev);
      api.get('/parent/quota').then((data) => setTokenQuota(data as typeof tokenQuota)).catch(() => {});
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Đã xảy ra lỗi, vui lòng thử lại.');
      setErrorMsg(msg);
      setUploadState('error');
    }
  };

  const bgClass = 'min-h-screen bg-gradient-to-b from-purple-500 via-violet-400 to-indigo-400 flex flex-col';

  const noChildrenMsg = childList.length === 0 && (
    <div className="animate-fade-in bg-white/20 backdrop-blur-sm rounded-3xl p-6 text-center border border-white/30">
      <p className="text-white font-extrabold text-lg">⚠️ Chưa có học sinh nào được liên kết</p>
      <p className="text-white/80 text-sm mt-1">Liên hệ giáo viên để thêm học sinh vào tài khoản.</p>
    </div>
  );

  // ── Dashboard view ───────────────────────────────────────────────────────────
  if (view === 'dashboard') {
    return (
      <div className={bgClass}>
        <Header
          onExitToStudent={onExitToStudent}
          children={childList}
          selectedChildId={selectedChildId}
          onChildChange={setSelectedChildId}
        />
        <main className="flex-1 flex flex-col items-center justify-center px-5 pb-10 gap-5">
          {noChildrenMsg || (
            <>
              <div className="animate-fade-in bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center border border-purple-100">
                <div className="text-6xl mb-4">🎓</div>
                <h2 className="text-2xl font-extrabold text-purple-700 mb-2">Chào Ba/Mẹ!</h2>
                <p className="text-gray-500 font-semibold text-sm">
                  Quản lý bài tập cho bé tại đây. 📚
                </p>
                {childList.length > 0 && selectedChildId !== null && (
                  <p className="text-purple-400 text-xs font-bold mt-2">
                    Đang quản lý: {childList.find(c => c.id === selectedChildId)?.display_name}
                  </p>
                )}
              </div>

              <div className="w-full max-w-md flex flex-col gap-3">
                <button
                  onClick={() => { resetUpload(); setView('upload'); }}
                  className="btn-scale w-full py-5 rounded-3xl bg-gradient-to-r from-blue-400 to-cyan-500 text-white font-extrabold text-lg shadow-xl border border-blue-300 flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">📷</span>
                  <span>Tải Ảnh Sách Giáo Khoa</span>
                </button>

                <button
                  onClick={() => setView('scores')}
                  className="btn-scale w-full py-5 rounded-3xl bg-gradient-to-r from-green-400 to-teal-500 text-white font-extrabold text-lg shadow-xl border border-green-300 flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">📊</span>
                  <span>Xem Điểm Của Bé</span>
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  // ── Scores view ──────────────────────────────────────────────────────────────
  if (view === 'scores') {
    return (
      <div className={bgClass}>
        <Header
          onExitToStudent={onExitToStudent}
          children={childList}
          selectedChildId={selectedChildId}
          onChildChange={(id) => { setSelectedChildId(id); }}
        />
        <main className="flex-1 flex flex-col items-center px-4 py-5 gap-4 overflow-y-auto">
          {selectedChildId !== null && (
            <ScoresView onBack={() => setView('dashboard')} studentId={selectedChildId} />
          )}
        </main>
      </div>
    );
  }

  // ── Upload view ──────────────────────────────────────────────────────────────
  return (
    <div className={bgClass}>
      <Header
        onExitToStudent={onExitToStudent}
        children={childList}
        selectedChildId={selectedChildId}
        onChildChange={setSelectedChildId}
      />

      <main className="flex-1 flex flex-col items-center px-4 py-5 gap-4 overflow-y-auto">
        {uploadState === 'success' ? (
          <SuccessView
            questions={questions}
            onBack={() => { resetUpload(); setView('dashboard'); }}
            onUploadMore={resetUpload}
          />
        ) : (
          <div className="w-full max-w-lg flex flex-col gap-4 animate-fade-in">
            {/* Upload card */}
            <div className="bg-white rounded-3xl shadow-2xl p-6 border border-purple-100">
              <h2 className="text-xl font-extrabold text-purple-700 mb-4 text-center">
                📷 Tải Ảnh Sách Giáo Khoa
              </h2>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-4 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-purple-500 bg-purple-50 scale-[1.02] shadow-lg'
                    : 'border-purple-200 hover:border-purple-400 hover:bg-purple-50'
                }`}
              >
                {files.length === 0 ? (
                  <>
                    <div className="text-5xl mb-3">☁️</div>
                    <p className="font-extrabold text-purple-600 text-lg">Kéo ảnh vào đây</p>
                    <p className="text-gray-400 text-sm mt-1">hoặc nhấn để chọn file</p>
                    <p className="text-gray-300 text-xs mt-2">JPG, PNG • Tối đa 5MB • Nhiều ảnh</p>
                  </>
                ) : (
                  <>
                    <div
                      className="grid grid-cols-2 gap-2 mb-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {previewUrls.map((url, i) => (
                        <div key={i} className="relative rounded-xl overflow-hidden shadow-md">
                          <img
                            src={url}
                            alt={`Preview ${i + 1}`}
                            className="w-full h-32 object-cover"
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black shadow transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-purple-600 font-bold text-sm">
                      Đã chọn {files.length} ảnh 📷 — nhấn để thêm
                    </p>
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                multiple
                className="hidden"
                onChange={handleInputChange}
              />

              {sizeWarning && (
                <div className="mt-3 bg-orange-50 border border-orange-200 rounded-2xl p-3 text-orange-600 text-sm font-bold text-center">
                  ⚠️ {sizeWarning}
                </div>
              )}
            </div>

            {/* Question count */}
            <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center justify-between gap-4 border border-purple-100">
              <label className="font-extrabold text-gray-700 text-sm">Số câu hỏi:</label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={5}
                max={30}
                value={questionCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 5 && val <= 30) {
                    setQuestionCount(val);
                  } else if (e.target.value === '') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setQuestionCount('' as any);
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (isNaN(val) || val < 5) setQuestionCount(5);
                  else if (val > 30) setQuestionCount(30);
                }}
                className="input-glow w-20 text-center text-lg font-extrabold border-2 border-purple-200 rounded-xl py-1 focus:border-purple-500 transition-all"
              />
              <span className="text-gray-400 text-xs font-semibold">(5–30 câu)</span>
            </div>

            {/* Error */}
            {uploadState === 'error' && (
              <div className="bg-white rounded-2xl border-2 border-rose-200 p-4 text-center shadow">
                <p className="text-3xl mb-1">😓</p>
                <p className="text-rose-600 font-bold">{errorMsg}</p>
              </div>
            )}

            {/* Token quota indicator */}
            {tokenQuota && !tokenQuota.unlimited && (
              <div className={`rounded-2xl px-4 py-3 border text-sm font-semibold ${
                tokenQuota.remaining === 0
                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                  : tokenQuota.remaining < tokenQuota.total_tokens * 0.2
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-violet-50 border-violet-200 text-violet-700'
              }`}>
                {tokenQuota.remaining === 0 ? (
                  <p>🚫 Hết token! Liên hệ giáo viên để nạp thêm.</p>
                ) : (
                  <>
                    <p>🪙 Token còn lại: <span className="font-extrabold">{tokenQuota.remaining.toLocaleString()}</span> / {tokenQuota.total_tokens.toLocaleString()}</p>
                    {tokenQuota.remaining < tokenQuota.total_tokens * 0.2 && (
                      <p className="mt-1">⚠️ Sắp hết token, liên hệ giáo viên!</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={files.length === 0 || uploadState === 'loading' || selectedChildId === null || genUsage?.remaining === 0 || (tokenQuota?.remaining === 0 && !tokenQuota?.unlimited)}
              className={`btn-scale w-full py-5 rounded-3xl font-extrabold text-xl text-white shadow-xl transition-all border ${
                files.length > 0 && uploadState !== 'loading' && selectedChildId !== null && genUsage?.remaining !== 0 && !(tokenQuota?.remaining === 0 && !tokenQuota?.unlimited)
                  ? 'bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 border-purple-400'
                  : 'bg-gray-300 cursor-not-allowed border-gray-200'
              }`}
            >
              {uploadState === 'loading' ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl animate-spin inline-block">⭐</span>
                  Đang tạo bài tập...
                </span>
              ) : (
                '✨ Tạo bài tập'
              )}
            </button>
            {genUsage && (
              <p className="text-center text-sm text-violet-600 font-semibold mt-2">
                Hôm nay đã tạo: {genUsage.used}/{genUsage.limit} bài tập 📊
              </p>
            )}
            {genUsage?.remaining === 0 && (
              <p className="text-center text-sm text-rose-500 font-semibold mt-1">
                Đã đạt giới hạn hôm nay. Thử lại vào ngày mai! 🌙
              </p>
            )}

            <button
              onClick={() => { resetUpload(); setView('dashboard'); }}
              className="text-white/70 font-bold text-sm hover:text-white transition-colors text-center"
            >
              ← Quay lại
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
