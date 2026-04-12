import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '../services/apiService';
import { authService } from '../services/authService';
import TeacherIRead from '../components/iread/TeacherIRead';

// ── Types ──────────────────────────────────────────────────────────────────────
interface StudentRow {
  id: number;
  username: string;
  display_name: string;
  is_active: number;
  parents: string | null;
  total_points: number;
  session_count: number;
}

interface LeaderboardEntry {
  id: number;
  displayName: string;
  points: number;
}

interface TeacherUsage {
  generate_exercises_used: number;
  generate_exercises_limit: number;
  resetsAt: string;
}

interface WrongAnswer {
  question_text: string;
  correct_answer: string;
  student_answer: string;
  type: string;
  parts_json: string | null;
  date: string;
}

interface ScoresData {
  totalPoints: number;
  history: Array<{ date: string; earned: number; activity: string }>;
}

interface ClassData {
  students: StudentRow[];
  message?: string;
}

interface CompletionStudent {
  id: number;
  name: string;
  completed: boolean;
  score: number | null;
}

interface CompletionData {
  session_date: string | null;
  question_count?: number;
  total_students: number;
  completed_count: number;
  students: CompletionStudent[];
}

interface SessionBatch {
  batch_ts: string;
  date: string;
  question_count: number;
  student_count: number;
  completed_count: number;
}

interface GeneratedQuestion {
  id?: string;
  question: string;
  type: string;
  difficulty: string;
  answer?: number;
  answer_text?: string;
  answers?: Array<{ label: string; answer?: number; answer_text?: string; unit: string }>;
  order_matters?: boolean;
  choices?: { options: string[]; correct_index: number };
  unit?: string;
}

type Tab = 'class' | 'students' | 'generate' | 'iread';

const TEACHER = '/api/teacher';

// ── Helpers ────────────────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <span className="text-4xl animate-spin">⭐</span>
      <p className="text-white/80 font-bold animate-pulse">Đang tải...</p>
    </div>
  );
}

// ── Completion progress section ────────────────────────────────────────────────
function CompletionProgress() {
  const [data, setData] = useState<CompletionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<CompletionData>(`${TEACHER}/completion`)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-white rounded-3xl shadow-xl p-5 border border-violet-100 flex justify-center">
      <span className="animate-spin text-2xl">⭐</span>
    </div>
  );
  if (!data || data.total_students === 0) return null;

  const pct = data.total_students > 0
    ? Math.round((data.completed_count / data.total_students) * 100)
    : 0;

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-violet-100">
      <div className="px-5 py-3.5 bg-violet-50 border-b border-violet-100 flex items-center justify-between">
        <p className="font-extrabold text-violet-700 text-sm">📋 Tiến Độ Làm Bài</p>
        {data.session_date && (
          <span className="text-xs text-violet-400 font-semibold">{data.session_date}</span>
        )}
      </div>

      {!data.session_date ? (
        <p className="text-center text-gray-400 py-6 text-sm font-semibold">Chưa giao bài tập nào</p>
      ) : (
        <div className="p-4 flex flex-col gap-3">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : 'bg-violet-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-sm font-extrabold text-violet-700 shrink-0 w-20 text-right">
              {data.completed_count}/{data.total_students} xong
            </span>
          </div>

          {/* Student list */}
          <ul className="divide-y divide-gray-50">
            {data.students.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="text-lg shrink-0">{s.completed ? '✅' : '⏳'}</span>
                <span className={`flex-1 font-bold text-sm ${s.completed ? 'text-gray-800' : 'text-gray-400'}`}>
                  {s.name}
                </span>
                {s.completed && s.score !== null ? (
                  <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-0.5 shrink-0">
                    <span className="text-amber-500 text-xs">⭐</span>
                    <span className="font-extrabold text-amber-600 text-xs">{s.score}</span>
                  </span>
                ) : !s.completed ? (
                  <span className="text-xs text-gray-300 font-semibold shrink-0">Chưa xong</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Class tab ──────────────────────────────────────────────────────────────────
function ClassTab() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [usage, setUsage] = useState<TeacherUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<ClassData>(`${TEACHER}/students`),
      api.get<LeaderboardEntry[]>(`${TEACHER}/leaderboard`),
      api.get<TeacherUsage>(`${TEACHER}/usage`),
    ])
      .then(([cls, lb, u]) => {
        setStudents(cls.students ?? []);
        setEmpty(cls.students?.length === 0);
        setLeaderboard(lb ?? []);
        setUsage(u);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-5 py-12 px-4">
        <span className="text-6xl">🏫</span>
        <div className="text-center">
          <p className="font-extrabold text-white text-lg">Lớp chưa có học sinh</p>
          <p className="text-white/70 text-sm mt-1">Liên hệ admin để được phân lớp.</p>
        </div>
      </div>
    );
  }

  const totalPoints = leaderboard.reduce((s, e) => s + e.points, 0);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="flex flex-col gap-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl p-4 text-white shadow-xl">
          <p className="text-violet-200 font-bold text-xs mb-1">HỌC SINH</p>
          <p className="text-4xl font-extrabold">{students.length}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-4 text-white shadow-xl">
          <p className="text-amber-100 font-bold text-xs mb-1">TỔNG ĐIỂM</p>
          <p className="text-4xl font-extrabold">{totalPoints}</p>
        </div>
      </div>

      {/* Usage indicator */}
      {usage && (
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/20 flex items-center gap-3">
          <span className="text-xl">📈</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">Bài tập hôm nay</p>
            <p className="text-white/70 text-xs">
              Đã tạo {usage.generate_exercises_used}/{usage.generate_exercises_limit} lần
            </p>
          </div>
          {usage.generate_exercises_limit > 0 && (
            <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden min-w-[60px]">
              <div
                className={`h-full rounded-full transition-all ${
                  usage.generate_exercises_used >= usage.generate_exercises_limit
                    ? 'bg-rose-400'
                    : usage.generate_exercises_used / usage.generate_exercises_limit >= 0.7
                    ? 'bg-amber-400'
                    : 'bg-green-400'
                }`}
                style={{ width: `${Math.min(100, (usage.generate_exercises_used / usage.generate_exercises_limit) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Completion progress — Enhancement 3 */}
      <CompletionProgress />

      {/* Leaderboard */}
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-violet-100">
        <div className="px-5 py-3.5 bg-violet-50 border-b border-violet-100">
          <p className="font-extrabold text-violet-700 text-sm">🏆 Bảng Xếp Hạng Lớp</p>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-center text-gray-400 py-8 font-semibold">Chưa có điểm</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {leaderboard.map((entry, i) => (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-xl w-7 text-center shrink-0">{medals[i] ?? String(i + 1)}</span>
                <span className="flex-1 font-bold text-gray-800">{entry.displayName}</span>
                <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1">
                  <span className="text-amber-500">⭐</span>
                  <span className="font-extrabold text-amber-600 text-sm">{entry.points}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Student detail panel ───────────────────────────────────────────────────────
function StudentDetail({
  student,
  onClose,
}: {
  student: StudentRow;
  onClose: () => void;
}) {
  const [scores, setScores] = useState<ScoresData | null>(null);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ScoresData>(`${TEACHER}/students/${student.id}/scores`),
      api.get<WrongAnswer[]>(`${TEACHER}/students/${student.id}/wrong-answers`),
    ])
      .then(([s, w]) => { setScores(s); setWrongAnswers(w ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [student.id]);

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-violet-100 overflow-hidden">
      <div className="bg-violet-50 px-5 py-4 flex items-center justify-between border-b border-violet-100">
        <div>
          <p className="font-extrabold text-violet-700">{student.display_name}</p>
          <p className="text-violet-400 text-xs">
            @{student.username}
            {student.parents ? ` • PH: ${student.parents}` : ''}
            {student.is_active === 0 && <span className="ml-2 text-red-400 font-bold">• Vô hiệu</span>}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-extrabold text-lg transition-colors">✕</button>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><LoadingSpinner /></div>
      ) : (
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <span className="text-xl">⭐</span>
              <span className="text-2xl font-extrabold text-amber-500">{scores?.totalPoints ?? 0}</span>
              <span className="text-amber-700 font-bold text-sm">điểm</span>
            </div>
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3">
              <span className="text-xl">📝</span>
              <span className="text-2xl font-extrabold text-violet-500">{student.session_count}</span>
              <span className="text-violet-700 font-bold text-sm">bài</span>
            </div>
          </div>

          <div>
            <p className="font-extrabold text-rose-700 text-sm mb-2">❌ Câu sai gần đây</p>
            {wrongAnswers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Không có câu sai nào 🎉</p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-48 overflow-y-auto border border-gray-100 rounded-2xl">
                {wrongAnswers.slice(0, 15).map((w, i) => (
                  <li key={i} className="px-4 py-2.5">
                    <p className="text-gray-700 text-sm font-bold leading-snug">{w.question_text}</p>
                    {w.parts_json ? (
                      <p className="text-xs text-gray-400 mt-0.5">Nhiều đáp án</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">✓ {w.correct_answer} &nbsp;✗ {w.student_answer}</p>
                    )}
                    <p className="text-xs text-gray-300 mt-0.5">{w.date}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Students tab ───────────────────────────────────────────────────────────────
function StudentsTab() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [search, setSearch] = useState('');
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    api.get<ClassData>(`${TEACHER}/students`)
      .then((d) => { setStudents(d.students ?? []); setEmpty((d.students ?? []).length === 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-5 py-12 px-4">
        <span className="text-6xl">👦</span>
        <p className="font-extrabold text-white text-lg text-center">Chưa có học sinh nào trong lớp</p>
      </div>
    );
  }

  const filtered = students.filter((s) =>
    s.display_name.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      {selected && (
        <StudentDetail student={selected} onClose={() => setSelected(null)} />
      )}

      <input
        type="text"
        placeholder="🔍 Tìm học sinh..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-glow w-full border-2 border-violet-200 rounded-2xl py-2.5 px-4 font-bold text-sm focus:border-violet-500 transition-all bg-white"
      />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-violet-100">
        <div className="px-5 py-3.5 bg-violet-50 border-b border-violet-100">
          <p className="font-extrabold text-violet-700 text-sm">👦 Học Sinh Trong Lớp ({filtered.length})</p>
        </div>
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-8 font-semibold">Không tìm thấy</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((s) => (
              <li
                key={s.id}
                onClick={() => setSelected(selected?.id === s.id ? null : s)}
                className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                  s.is_active === 0 ? 'opacity-50 hover:bg-rose-50' : 'hover:bg-violet-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0 ${
                  s.is_active ? 'bg-gradient-to-br from-violet-400 to-purple-500' : 'bg-gray-300'
                }`}>
                  {s.display_name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{s.display_name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    @{s.username} • {s.session_count} bài{s.parents ? ` • PH: ${s.parents}` : ''}
                  </p>
                </div>
                <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1 shrink-0">
                  <span className="text-amber-500 text-xs">⭐</span>
                  <span className="font-extrabold text-amber-600 text-xs">{s.total_points}</span>
                </span>
                {s.is_active === 0 && (
                  <span className="text-xs bg-rose-100 text-rose-400 px-2 py-0.5 rounded-full shrink-0">Vô hiệu</span>
                )}
                <span className="text-violet-300 text-sm shrink-0">{selected?.id === s.id ? '▲' : '▼'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Generate tab — 2-step preview + history ────────────────────────────────────
function GenerateTab() {
  // Upload / generate state
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [countStr, setCountStr] = useState('10');
  const [generating, setGenerating] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [usage, setUsage] = useState<TeacherUsage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draft preview state (Enhancement 1)
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<GeneratedQuestion[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [distributeResult, setDistributeResult] = useState<{ studentCount: number; questionCount: number } | null>(null);

  // Session history state (Enhancement 2)
  const [sessionBatches, setSessionBatches] = useState<SessionBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchQuestions, setBatchQuestions] = useState<Record<string, GeneratedQuestion[]>>({});
  const [batchQLoading, setBatchQLoading] = useState<string | null>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const loadUsage = () => {
    api.get<TeacherUsage>(`${TEACHER}/usage`).then((u) => setUsage(u)).catch(() => {});
  };

  const loadHistory = () => {
    setHistoryLoading(true);
    api.get<SessionBatch[]>(`${TEACHER}/sessions`)
      .then((d) => { setSessionBatches(d ?? []); setHistoryLoading(false); })
      .catch(() => setHistoryLoading(false));
  };

  useEffect(() => {
    loadUsage();
    loadHistory();
  }, []);

  const applyFiles = (newFiles: File[]) => {
    const valid: File[] = [];
    for (const f of newFiles) {
      if (!['image/jpeg', 'image/png'].includes(f.type)) continue;
      if (f.size > MAX_FILE_SIZE) continue;
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid]);
    setPreviewUrls((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
    setError('');
  };

  const removeFile = (i: number) => {
    URL.revokeObjectURL(previewUrls[i]);
    setFiles((prev) => prev.filter((_, j) => j !== i));
    setPreviewUrls((prev) => prev.filter((_, j) => j !== i));
  };

  // Step 1: Generate draft (not distributed)
  const handleGenerate = async () => {
    if (files.length === 0) return;
    setGenerating(true);
    setError('');
    setDistributeResult(null);
    setDraftSessionId(null);
    setDraftQuestions([]);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('images', f));
      formData.append('count', String(parseInt(countStr, 10) || 10));
      const data = await api.post<{ ok: boolean; sessionId: string; questions: GeneratedQuestion[] }>(
        '/api/generate-preview',
        formData
      );
      setDraftSessionId(data.sessionId);
      setDraftQuestions(data.questions ?? []);
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
      setFiles([]);
      setPreviewUrls([]);
      loadUsage();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Đã xảy ra lỗi'));
    }
    setGenerating(false);
  };

  // Delete a question from the draft
  const handleDeleteQuestion = async (q: GeneratedQuestion) => {
    if (!q.id) return;
    setDeletingId(q.id);
    try {
      await api.delete(`/api/questions/${q.id}`);
      setDraftQuestions((prev) => prev.filter((x) => x.id !== q.id));
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  // Step 2: Distribute draft to students
  const handleDistribute = async () => {
    if (!draftSessionId || draftQuestions.length === 0) return;
    setDistributing(true);
    setError('');
    try {
      const data = await api.post<{ ok: boolean; studentCount: number }>(
        '/api/distribute-session',
        { sessionId: draftSessionId }
      );
      setDistributeResult({ studentCount: data.studentCount, questionCount: draftQuestions.length });
      setDraftSessionId(null);
      setDraftQuestions([]);
      loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Không thể giao bài'));
    }
    setDistributing(false);
  };

  const toggleBatch = async (batch: SessionBatch) => {
    const key = batch.batch_ts;
    if (expandedBatch === key) { setExpandedBatch(null); return; }
    setExpandedBatch(key);
    if (batchQuestions[key]) return; // already loaded
    setBatchQLoading(key);
    try {
      const qs = await api.get<GeneratedQuestion[]>(
        `${TEACHER}/batch-questions?batch_ts=${batch.batch_ts}`
      );
      setBatchQuestions((prev) => ({ ...prev, [key]: qs ?? [] }));
    } catch {
      setBatchQuestions((prev) => ({ ...prev, [key]: [] }));
    }
    setBatchQLoading(null);
  };

  const formatAnswer = (q: GeneratedQuestion): string => {
    if (q.type === 'multiple_choice' && q.choices) return `${['A','B','C','D'][q.choices.correct_index]}) ${q.choices.options[q.choices.correct_index]}`;
    if (q.type === 'comparison') return q.answer_text || String(q.answer ?? '');
    if (q.answers) return q.answers.map((a) => `${a.label}: ${a.answer_text ?? a.answer ?? '?'}${a.unit ? ' ' + a.unit : ''}`).join(' | ');
    if (q.answer_text) return q.answer_text;
    if (q.answer !== undefined) return String(q.answer) + (q.unit ? ' ' + q.unit : '');
    return '?';
  };

  const isAtLimit = usage !== null && usage.generate_exercises_limit > 0 && usage.generate_exercises_used >= usage.generate_exercises_limit;

  return (
    <div className="flex flex-col gap-5">
      {/* Usage indicator */}
      {usage && (
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/20 flex items-center justify-between gap-3">
          <p className="text-white font-bold text-sm">
            Hôm nay: {usage.generate_exercises_used}/{usage.generate_exercises_limit} lần tạo bài
          </p>
          {isAtLimit && (
            <span className="text-xs bg-rose-500/80 text-white px-2.5 py-1 rounded-full font-bold shrink-0">Đã hết lượt</span>
          )}
        </div>
      )}

      {/* Upload + Generate panel */}
      {!draftSessionId && (
        <div className="bg-white rounded-3xl shadow-xl p-5 border border-violet-100">
          <h3 className="font-extrabold text-violet-700 text-base mb-1">📸 Tạo Bài Tập</h3>
          <p className="text-gray-400 text-xs mb-4 font-semibold">
            Tải ảnh sách giáo khoa → AI tạo câu hỏi → xem trước → giao cho cả lớp.
          </p>

          {/* Drop zone */}
          <div
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); applyFiles(Array.from(e.dataTransfer.files)); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-4 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 mb-4 ${
              isDragging
                ? 'border-violet-500 bg-violet-50 scale-[1.02]'
                : 'border-violet-200 hover:border-violet-400 hover:bg-violet-50'
            }`}
          >
            {files.length === 0 ? (
              <>
                <div className="text-4xl mb-2">☁️</div>
                <p className="font-extrabold text-violet-600">Kéo ảnh vào đây</p>
                <p className="text-gray-400 text-sm mt-1">hoặc nhấn để chọn file (JPG/PNG)</p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                  {previewUrls.map((url, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden shadow">
                      <img src={url} alt="" className="w-full h-20 object-cover" />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black"
                      >✕</button>
                    </div>
                  ))}
                </div>
                <p className="text-violet-500 font-bold text-sm">{files.length} ảnh đã chọn — nhấn để thêm</p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={(e) => { applyFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
          />

          {/* Question count */}
          <div className="flex items-center gap-3 mb-4">
            <label className="font-extrabold text-gray-700 text-sm shrink-0">Số câu hỏi:</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={countStr}
              onChange={(e) => setCountStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => {
                const v = parseInt(countStr, 10);
                if (isNaN(v) || v < 5) setCountStr('5');
                else if (v > 30) setCountStr('30');
                else setCountStr(String(v));
              }}
              className="w-20 text-center text-lg font-extrabold border-2 border-violet-200 rounded-xl py-1 focus:border-violet-500 focus:outline-none transition-all"
            />
            <span className="text-gray-400 text-xs font-semibold">(5–30 câu)</span>
          </div>

          {error && (
            <div className="mb-4 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-rose-600 font-bold text-sm text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={() => { void handleGenerate(); }}
            disabled={files.length === 0 || generating || isAtLimit}
            className="btn-scale w-full py-4 rounded-3xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-lg shadow-xl border border-violet-400 transition-all"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block">⭐</span>
                Đang tạo câu hỏi...
              </span>
            ) : (
              '✨ Tạo bài tập'
            )}
          </button>
        </div>
      )}

      {/* Distribute success banner */}
      {distributeResult && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center animate-bounce-in">
          <p className="text-2xl mb-1">🎉</p>
          <p className="font-extrabold text-green-700">Đã giao bài thành công!</p>
          <p className="text-green-600 text-sm font-semibold mt-1">
            {distributeResult.questionCount} câu hỏi → {distributeResult.studentCount} học sinh
          </p>
        </div>
      )}

      {/* Draft preview — Enhancement 1 */}
      {draftSessionId && (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-violet-100">
          <div className="px-5 py-3.5 bg-violet-50 border-b border-violet-100 flex items-center justify-between">
            <p className="font-extrabold text-violet-700 text-sm">
              📋 Xem Trước Bài Tập ({draftQuestions.length} câu)
            </p>
            <button
              onClick={() => { setDraftSessionId(null); setDraftQuestions([]); setError(''); }}
              className="text-gray-400 hover:text-gray-600 text-sm font-extrabold"
            >
              Huỷ
            </button>
          </div>

          <p className="px-5 pt-3 text-xs text-gray-400 font-semibold">
            Xoá câu hỏi không phù hợp, sau đó nhấn "Giao cho cả lớp".
          </p>

          <ul className="divide-y divide-gray-50 mt-2">
            {draftQuestions.map((q, i) => (
              <li key={q.id ?? i} className="flex items-start gap-3 px-5 py-3.5">
                <span className="shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-600 font-extrabold text-xs flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm leading-snug">{q.question}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ✓ {formatAnswer(q)}
                    {q.difficulty && <span className="ml-2 text-violet-400">{q.difficulty}</span>}
                  </p>
                </div>
                {q.id && (
                  <button
                    onClick={() => handleDeleteQuestion(q)}
                    disabled={deletingId === q.id}
                    title="Xóa câu hỏi"
                    className="btn-scale shrink-0 w-7 h-7 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-400 hover:text-rose-600 flex items-center justify-center text-sm font-black border border-rose-200 transition-all disabled:opacity-40"
                  >
                    {deletingId === q.id ? '…' : '🗑️'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {draftQuestions.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-sm font-semibold italic">
              Tất cả câu hỏi đã bị xóa
            </p>
          )}

          {error && (
            <div className="mx-5 mb-4 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-rose-600 font-bold text-sm text-center">
              ⚠️ {error}
            </div>
          )}

          <div className="p-5 pt-3">
            <button
              onClick={() => { void handleDistribute(); }}
              disabled={distributing || draftQuestions.length === 0}
              className="btn-scale w-full py-4 rounded-3xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-lg shadow-xl border border-green-400 transition-all"
            >
              {distributing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin inline-block">⭐</span>
                  Đang giao bài...
                </span>
              ) : (
                `✅ Giao cho cả lớp (${draftQuestions.length} câu)`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Session history — Enhancement 2 */}
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-violet-100">
        <div className="px-5 py-3.5 bg-violet-50 border-b border-violet-100">
          <p className="font-extrabold text-violet-700 text-sm">📚 Bài Tập Đã Giao</p>
        </div>
        {historyLoading ? (
          <div className="flex justify-center py-6"><span className="animate-spin text-2xl">⭐</span></div>
        ) : sessionBatches.length === 0 ? (
          <p className="text-center text-gray-400 py-8 font-semibold text-sm">Chưa giao bài tập nào</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sessionBatches.map((batch, i) => {
              const key = batch.batch_ts;
              const isOpen = expandedBatch === key;
              const qs = batchQuestions[key];
              const loading = batchQLoading === key;
              return (
                <li key={i}>
                  <button
                    onClick={() => { void toggleBatch(batch); }}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-violet-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                      <span className="text-violet-600 text-sm">📝</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">{batch.date}</p>
                      <p className="text-xs text-gray-400">
                        {batch.question_count} câu • {batch.student_count} học sinh
                      </p>
                    </div>
                    <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full shrink-0 ${
                      batch.completed_count === batch.student_count
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {batch.completed_count}/{batch.student_count} xong
                    </span>
                    <span className="text-violet-400 text-xs shrink-0">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div className="bg-violet-50/50 border-t border-violet-100 px-5 py-3">
                      {loading ? (
                        <p className="text-center text-violet-400 text-sm py-2 animate-pulse">Đang tải...</p>
                      ) : (
                      <>
                      {!qs || qs.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-2">Không có câu hỏi</p>
                      ) : (
                        <ol className="flex flex-col gap-2">
                          {qs.map((q, qi) => {
                            const dbQ = q as unknown as {
                              question_text: string; type: string; difficulty: string;
                              answer: number | null; answer_text: string | null;
                              answers_json: string | null; unit: string;
                            };
                            let answerStr = '?';
                            if (dbQ.answers_json && dbQ.type === 'multiple_choice') {
                              try {
                                const mc = JSON.parse(dbQ.answers_json) as { options: string[]; correct_index: number };
                                answerStr = `${['A','B','C','D'][mc.correct_index]}) ${mc.options[mc.correct_index]}`;
                              } catch { answerStr = dbQ.answers_json; }
                            } else if (dbQ.answers_json) {
                              try {
                                const parts = JSON.parse(dbQ.answers_json) as Array<{ label: string; answer?: number; answer_text?: string; unit?: string }>;
                                answerStr = parts.map((p) => `${p.label}: ${p.answer_text ?? p.answer ?? '?'}${p.unit ? ' ' + p.unit : ''}`).join(' | ');
                              } catch { answerStr = dbQ.answers_json; }
                            } else if (dbQ.answer_text) {
                              answerStr = dbQ.answer_text;
                            } else if (dbQ.answer !== null && dbQ.answer !== undefined) {
                              answerStr = String(dbQ.answer) + (dbQ.unit ? ' ' + dbQ.unit : '');
                            }
                            return (
                              <li key={qi} className="bg-white rounded-xl px-3 py-2 border border-violet-100 text-sm">
                                <p className="font-semibold text-gray-800">{qi + 1}. {dbQ.question_text}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  ✓ {answerStr}
                                  {dbQ.difficulty && <span className="ml-2 text-violet-400">{dbQ.difficulty}</span>}
                                </p>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                      </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Main TeacherView ───────────────────────────────────────────────────────────
const TABS: { key: Tab; label: string }[] = [
  { key: 'class',    label: '📊 Lớp' },
  { key: 'students', label: '👦 Học sinh' },
  { key: 'generate', label: '📐 Giao bài' },
  { key: 'iread',    label: '📚 iRead' },
];

interface TeacherViewProps {
  onLogout: () => void;
}

export default function TeacherView({ onLogout }: TeacherViewProps) {
  const [tab, setTab] = useState<Tab>('class');
  const user = authService.getCurrentUser();

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-600 via-purple-600 to-purple-700">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-violet-700/95 backdrop-blur-sm border-b border-violet-500/50 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <div>
              <p className="text-white font-extrabold text-base leading-none">
                {user?.display_name ?? 'Giáo viên'}
              </p>
              <p className="text-violet-300 text-xs">Lớp học của tôi</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="btn-scale bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-xl text-xs border border-white/20"
          >
            Đăng xuất
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex px-4 pb-3 gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`btn-scale flex-1 py-2 rounded-2xl font-extrabold text-xs transition-all ${
                tab === t.key
                  ? 'bg-white text-violet-700 shadow-lg'
                  : 'bg-white/15 text-white/80 hover:bg-white/25'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-5 max-w-2xl mx-auto animate-fade-in">
        {tab === 'class'    && <ClassTab />}
        {tab === 'students' && <StudentsTab />}
        {tab === 'generate' && <GenerateTab />}
        {tab === 'iread'    && <TeacherIRead />}
      </div>
    </div>
  );
}
