import { useState, useEffect } from 'react';
import { api, ApiError } from '../services/apiService';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Student {
  id: number;
  username: string;
  display_name: string;
  is_active: number;
  parents: string | null;
}

interface Parent {
  id: number;
  username: string;
  display_name: string;
  is_active: number;
  children: string | null;
}

interface LeaderboardEntry {
  id: number;
  displayName: string;
  points: number;
}

interface WrongAnswer {
  question_text: string;
  correct_answer: string;
  student_answer: string;
  type: string;
  parts_json: string | null;
  date: string;
}

interface UsageRow {
  username: string;
  role: string;
  generate_exercises_used: number;
  skip_question_used: number;
}

interface QuotaRow {
  parent_id: number;
  username: string;
  display_name: string;
  total_tokens: number;
  used_tokens: number;
  remaining: number;
}

interface HistoryRow {
  id: number;
  user_id: number;
  action: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
}

type Tab = 'overview' | 'students' | 'parents' | 'usage' | 'add' | 'quota';

const TEACHER = '/teacher';

// ── Loading spinner ────────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <span className="text-4xl animate-spin">⭐</span>
      <p className="text-white/80 font-bold animate-pulse">Đang tải...</p>
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────────
function OverviewTab() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<LeaderboardEntry[]>(`${TEACHER}/leaderboard`)
      .then((data) => { setLeaderboard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-5 text-white shadow-xl">
          <p className="text-indigo-200 font-bold text-xs mb-1">HỌC SINH</p>
          <p className="text-4xl font-extrabold">{leaderboard.length}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-5 text-white shadow-xl">
          <p className="text-amber-100 font-bold text-xs mb-1">TỔNG ĐIỂM</p>
          <p className="text-4xl font-extrabold">{leaderboard.reduce((s, e) => s + e.points, 0)}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
        <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100">
          <p className="font-extrabold text-indigo-700 text-sm">🏆 Bảng Xếp Hạng</p>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-center text-gray-400 py-8 font-semibold">Chưa có học sinh nào</p>
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

// ── Student detail ─────────────────────────────────────────────────────────────
function StudentDetail({
  student,
  onClose,
  onStatusChange,
}: {
  student: Student;
  onClose: () => void;
  onStatusChange: (id: number, active: boolean) => void;
}) {
  const [scores, setScores] = useState<{ totalPoints: number } | null>(null);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ totalPoints: number }>(`${TEACHER}/students/${student.id}/scores`),
      api.get<WrongAnswer[]>(`${TEACHER}/students/${student.id}/wrong-answers`),
    ])
      .then(([s, w]) => {
        setScores(s);
        setWrongAnswers(w ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [student.id]);

  const handleToggleActive = async () => {
    setToggling(true);
    try {
      if (student.is_active) {
        await api.delete(`${TEACHER}/users/${student.id}`);
        onStatusChange(student.id, false);
      } else {
        await api.patch(`${TEACHER}/users/${student.id}/reactivate`);
        onStatusChange(student.id, true);
      }
      onClose();
    } catch {
      // ignore
    }
    setToggling(false);
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden">
      <div className="bg-indigo-50 px-5 py-4 flex items-center justify-between border-b border-indigo-100">
        <div>
          <p className="font-extrabold text-indigo-700">{student.display_name}</p>
          <p className="text-indigo-400 text-xs">
            @{student.username}{student.parents ? ` • PH: ${student.parents}` : ''}
            {student.is_active === 0 && <span className="ml-2 text-red-400 font-bold">• Vô hiệu</span>}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-extrabold text-lg transition-colors">✕</button>
      </div>
      {loading ? (
        <div className="py-8 flex justify-center"><LoadingSpinner /></div>
      ) : (
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <span className="text-2xl">⭐</span>
            <span className="text-3xl font-extrabold text-amber-500">{scores?.totalPoints ?? 0}</span>
            <span className="text-amber-700 font-bold">điểm</span>
          </div>

          <div>
            <p className="font-extrabold text-rose-700 text-sm mb-2">❌ Câu sai gần đây</p>
            {wrongAnswers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Không có câu sai nào 🎉</p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-48 overflow-y-auto border border-gray-100 rounded-2xl">
                {wrongAnswers.slice(0, 10).map((w, i) => (
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

          <button
            onClick={handleToggleActive}
            disabled={toggling}
            className={`btn-scale w-full py-2.5 rounded-2xl font-extrabold text-sm shadow transition-all disabled:opacity-50 ${
              student.is_active
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                : 'bg-green-50 hover:bg-green-100 text-green-600 border border-green-200'
            }`}
          >
            {toggling ? '...' : student.is_active ? '🔒 Vô hiệu hoá tài khoản' : '✅ Kích hoạt lại'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Students tab ───────────────────────────────────────────────────────────────
function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Student | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    api.get<Student[]>(`${TEACHER}/students`)
      .then((data) => { setStudents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleStatusChange = (id: number, active: boolean) => {
    setStudents((prev) => prev.map((s) => s.id === id ? { ...s, is_active: active ? 1 : 0 } : s));
    setSelected((prev) => prev?.id === id ? { ...prev, is_active: active ? 1 : 0 } : prev);
  };

  if (loading) return <LoadingSpinner />;

  const filtered = students.filter((s) => {
    const matchesSearch =
      s.display_name.toLowerCase().includes(search.toLowerCase()) ||
      s.username.toLowerCase().includes(search.toLowerCase());
    const matchesActive = showInactive ? true : s.is_active === 1;
    return matchesSearch && matchesActive;
  });

  return (
    <div className="flex flex-col gap-4">
      {selected && (
        <StudentDetail
          student={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="🔍 Tìm học sinh..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-glow flex-1 border-2 border-indigo-200 rounded-2xl py-2.5 px-4 font-bold text-sm focus:border-indigo-500 transition-all bg-white"
        />
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`btn-scale shrink-0 px-3 py-2 rounded-2xl font-bold text-xs border transition-all ${
            showInactive
              ? 'bg-white border-indigo-300 text-indigo-600'
              : 'bg-white/30 border-white/30 text-white'
          }`}
        >
          {showInactive ? '👁 Tất cả' : '👁 Ẩn VH'}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
        <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100">
          <p className="font-extrabold text-indigo-700 text-sm">👦 Danh Sách Học Sinh ({filtered.length})</p>
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
                  s.is_active === 0 ? 'opacity-50 hover:bg-rose-50' : 'hover:bg-indigo-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0 ${
                  s.is_active ? 'bg-gradient-to-br from-indigo-400 to-violet-500' : 'bg-gray-300'
                }`}>
                  {s.display_name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{s.display_name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    @{s.username}{s.parents ? ` • PH: ${s.parents}` : ''}
                  </p>
                </div>
                {s.is_active === 0 && (
                  <span className="text-xs bg-rose-100 text-rose-400 px-2 py-0.5 rounded-full">Vô hiệu</span>
                )}
                <span className="text-indigo-300 text-sm">{selected?.id === s.id ? '▲' : '▼'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Parents tab ────────────────────────────────────────────────────────────────
function ParentsTab() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState<number | null>(null);

  const loadParents = () => {
    api.get<Parent[]>(`${TEACHER}/parents`)
      .then((data) => { setParents(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadParents(); }, []);

  const handleToggleActive = async (p: Parent) => {
    setToggling(p.id);
    try {
      if (p.is_active) {
        await api.delete(`${TEACHER}/users/${p.id}`);
      } else {
        await api.patch(`${TEACHER}/users/${p.id}/reactivate`);
      }
      setParents((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: p.is_active ? 0 : 1 } : x));
    } catch {
      // ignore
    }
    setToggling(null);
  };

  if (loading) return <LoadingSpinner />;

  const filtered = parents.filter(
    (p) =>
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="🔍 Tìm phụ huynh..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-glow w-full border-2 border-indigo-200 rounded-2xl py-2.5 px-4 font-bold text-sm focus:border-indigo-500 transition-all bg-white"
      />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
        <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100">
          <p className="font-extrabold text-indigo-700 text-sm">👨‍👩‍👧 Danh Sách Phụ Huynh ({filtered.length})</p>
        </div>
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-8 font-semibold">Không tìm thấy</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((p) => (
              <li key={p.id} className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${p.is_active === 0 ? 'opacity-50' : ''}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0 ${
                  p.is_active ? 'bg-gradient-to-br from-teal-400 to-cyan-500' : 'bg-gray-300'
                }`}>
                  {p.display_name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{p.display_name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    @{p.username}{p.children ? ` • Con: ${p.children}` : ' • Chưa liên kết'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleActive(p)}
                  disabled={toggling === p.id}
                  className={`btn-scale shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all disabled:opacity-50 ${
                    p.is_active
                      ? 'bg-rose-50 text-rose-500 border-rose-200 hover:bg-rose-100'
                      : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                  }`}
                >
                  {toggling === p.id ? '...' : p.is_active ? '🔒' : '✅'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Usage tab ──────────────────────────────────────────────────────────────────
function UsageTab() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadUsage = () => {
    setLoading(true);
    api.get<UsageRow[]>(`${TEACHER}/usage`)
      .then((data) => { setRows(data); setLoading(false); setLastRefresh(new Date()); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadUsage(); }, []);

  const genLimit = (role: string) => role === 'teacher' ? 20 : role === 'parent' ? 10 : 0;
  const skipLimit = (role: string) => role === 'student' ? 20 : 0;

  const UsageBar = ({ used, limit }: { used: number; limit: number }) => {
    if (limit === 0) return <span className="text-gray-300 text-xs font-semibold">—</span>;
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const color = pct >= 100 ? 'bg-rose-400' : pct >= 70 ? 'bg-amber-400' : 'bg-green-400';
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs font-extrabold shrink-0 ${pct >= 100 ? 'text-rose-500' : 'text-gray-600'}`}>
          {used}/{limit}
        </span>
      </div>
    );
  };

  const roleLabel: Record<string, string> = { teacher: '👩‍🏫', parent: '👨‍👩‍👧', student: '👦' };

  if (loading) return <LoadingSpinner />;

  const teachers = rows.filter((r) => r.role === 'teacher');
  const parents = rows.filter((r) => r.role === 'parent');
  const students = rows.filter((r) => r.role === 'student');
  const groups = [
    { label: '👩‍🏫 Giáo viên', items: teachers },
    { label: '👨‍👩‍👧 Phụ huynh', items: parents },
    { label: '👦 Học sinh', items: students },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-white/70 text-xs font-semibold">
          Cập nhật: {lastRefresh.toLocaleTimeString('vi-VN')}
        </p>
        <button
          onClick={loadUsage}
          className="btn-scale bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-1.5 rounded-xl text-xs border border-white/30 backdrop-blur-sm"
        >
          🔄 Làm mới
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
          <p className="text-white/70 text-xs font-bold mb-1">TẠO BÀI TẬP HÔM NAY</p>
          <p className="text-white font-extrabold text-2xl">
            {rows.reduce((s, r) => s + r.generate_exercises_used, 0)}
          </p>
          <p className="text-white/50 text-xs mt-0.5">lần gọi API</p>
        </div>
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
          <p className="text-white/70 text-xs font-bold mb-1">ĐỔI CÂU HỎI HÔM NAY</p>
          <p className="text-white font-extrabold text-2xl">
            {rows.reduce((s, r) => s + r.skip_question_used, 0)}
          </p>
          <p className="text-white/50 text-xs mt-0.5">lần gọi API</p>
        </div>
      </div>

      {/* Per-role breakdowns */}
      {groups.map(({ label, items }) =>
        items.length === 0 ? null : (
          <div key={label} className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
            <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
              <p className="font-extrabold text-indigo-700 text-sm">{label}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-5 py-2 bg-gray-50">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Tài khoản</span>
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Tạo bài</span>
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Đổi câu</span>
              </div>
              {items.map((r) => (
                <div key={r.username} className="grid grid-cols-[1fr_1fr_1fr] gap-3 items-center px-5 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{roleLabel[r.role]}</span>
                    <span className="font-bold text-gray-800 text-sm truncate">{r.username}</span>
                  </div>
                  <UsageBar used={r.generate_exercises_used} limit={genLimit(r.role)} />
                  <UsageBar used={r.skip_question_used} limit={skipLimit(r.role)} />
                </div>
              ))}
            </div>
          </div>
        )
      )}

      <p className="text-center text-white/50 text-xs font-semibold pb-2">
        Giới hạn đặt lại lúc 00:00 UTC+7 mỗi ngày
      </p>
    </div>
  );
}

// ── Add account tab ────────────────────────────────────────────────────────────
function AddAccountTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'student', linkToParentId: '', linkToStudentId: '' });
  const [linkForm, setLinkForm] = useState({ parentId: '', studentId: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [linkMsg, setLinkMsg] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [linking, setLinking] = useState(false);

  const loadLists = () => {
    api.get<Student[]>(`${TEACHER}/students`).then((d) => setStudents(d)).catch(() => {});
    api.get<Parent[]>(`${TEACHER}/parents`).then((d) => setParents(d)).catch(() => {});
  };

  useEffect(() => { loadLists(); }, []);

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.displayName) {
      setErr('Vui lòng điền đầy đủ thông tin');
      return;
    }
    setSubmitting(true);
    setErr('');
    setMsg('');
    const body: Record<string, unknown> = {
      username: form.username,
      password: form.password,
      displayName: form.displayName,
      role: form.role,
    };
    if (form.role === 'student' && form.linkToParentId) body.linkToParentId = Number(form.linkToParentId);
    if (form.role === 'parent' && form.linkToStudentId) body.linkToStudentId = Number(form.linkToStudentId);

    try {
      await api.post(`${TEACHER}/students`, body);
      setMsg(`✅ Đã tạo tài khoản "${form.displayName}" thành công!`);
      setForm({ username: '', password: '', displayName: '', role: 'student', linkToParentId: '', linkToStudentId: '' });
      loadLists();
    } catch (err) {
      setErr(err instanceof ApiError ? err.message : 'Không thể tạo tài khoản');
    }
    setSubmitting(false);
  };

  const handleLink = async () => {
    if (!linkForm.parentId || !linkForm.studentId) {
      setLinkErr('Chọn phụ huynh và học sinh');
      return;
    }
    setLinking(true);
    setLinkErr('');
    setLinkMsg('');
    try {
      await api.post(`${TEACHER}/family-links`, {
        parentId: Number(linkForm.parentId),
        studentId: Number(linkForm.studentId),
      });
      setLinkMsg('✅ Đã liên kết thành công!');
      setLinkForm({ parentId: '', studentId: '' });
      loadLists();
    } catch {
      setLinkErr('Không thể liên kết');
    }
    setLinking(false);
  };

  const inputClass = 'input-glow w-full border-2 border-indigo-200 rounded-2xl py-2.5 px-4 font-bold text-sm focus:border-indigo-500 transition-all bg-white';

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-3xl shadow-xl p-5 border border-indigo-100">
        <h3 className="font-extrabold text-indigo-700 text-base mb-4">➕ Tạo Tài Khoản Mới</h3>
        <div className="flex flex-col gap-3">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className={inputClass}
          >
            <option value="student">👦 Học sinh</option>
            <option value="parent">👨‍👩‍👧 Phụ huynh</option>
          </select>
          <input
            placeholder="Tên hiển thị *"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Tên đăng nhập *"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className={inputClass}
          />
          <input
            type="password"
            placeholder="Mật khẩu *"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={inputClass}
          />
          {form.role === 'student' && parents.length > 0 && (
            <select
              value={form.linkToParentId}
              onChange={(e) => setForm({ ...form, linkToParentId: e.target.value })}
              className={inputClass}
            >
              <option value="">Liên kết phụ huynh (tuỳ chọn)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name} (@{p.username})</option>
              ))}
            </select>
          )}
          {form.role === 'parent' && students.length > 0 && (
            <select
              value={form.linkToStudentId}
              onChange={(e) => setForm({ ...form, linkToStudentId: e.target.value })}
              className={inputClass}
            >
              <option value="">Liên kết học sinh (tuỳ chọn)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.display_name} (@{s.username})</option>
              ))}
            </select>
          )}
          {err && <p className="text-rose-600 font-bold text-sm">⚠️ {err}</p>}
          {msg && <p className="text-green-600 font-bold text-sm animate-bounce-in">{msg}</p>}
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="btn-scale w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-extrabold shadow-md disabled:opacity-50"
          >
            {submitting ? 'Đang tạo...' : '✅ Tạo tài khoản'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl p-5 border border-indigo-100">
        <h3 className="font-extrabold text-indigo-700 text-base mb-4">🔗 Liên Kết PH – Học Sinh</h3>
        <div className="flex flex-col gap-3">
          <select
            value={linkForm.parentId}
            onChange={(e) => setLinkForm({ ...linkForm, parentId: e.target.value })}
            className={inputClass}
          >
            <option value="">Chọn phụ huynh</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name} (@{p.username})</option>
            ))}
          </select>
          <select
            value={linkForm.studentId}
            onChange={(e) => setLinkForm({ ...linkForm, studentId: e.target.value })}
            className={inputClass}
          >
            <option value="">Chọn học sinh</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name} (@{s.username})</option>
            ))}
          </select>
          {linkErr && <p className="text-rose-600 font-bold text-sm">⚠️ {linkErr}</p>}
          {linkMsg && <p className="text-green-600 font-bold text-sm animate-bounce-in">{linkMsg}</p>}
          <button
            onClick={handleLink}
            disabled={linking}
            className="btn-scale w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-extrabold shadow-md disabled:opacity-50"
          >
            {linking ? 'Đang liên kết...' : '🔗 Liên kết'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quota tab ──────────────────────────────────────────────────────────────────
function QuotaTab() {
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupInputs, setTopupInputs] = useState<Record<number, string>>({});
  const [quotaHistory, setQuotaHistory] = useState<HistoryRow[] | null>(null);
  const [historyParentName, setHistoryParentName] = useState('');
  const [working, setWorking] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const loadQuotas = () => {
    setLoading(true);
    api.get<QuotaRow[]>(`${TEACHER}/quotas`)
      .then((data) => { setQuotas(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadQuotas(); }, []);

  const handleTopup = async (parentId: number) => {
    const tokens = parseInt(topupInputs[parentId] ?? '', 10);
    if (!tokens || tokens <= 0) return;
    setWorking(parentId);
    setMsg('');
    try {
      await api.post(`${TEACHER}/quotas/${parentId}/topup`, { tokens });
      setMsg('✅ Đã nạp token!');
      setTopupInputs((prev) => ({ ...prev, [parentId]: '' }));
      loadQuotas();
    } catch {
      setMsg('❌ Lỗi khi nạp token');
    }
    setWorking(null);
  };

  const handleHistory = async (parentId: number, name: string) => {
    if (quotaHistory !== null && historyParentName === name) {
      setQuotaHistory(null);
      return;
    }
    setHistoryParentName(name);
    const data = await api.get<HistoryRow[]>(`${TEACHER}/quotas/${parentId}/history`).catch(() => []);
    setQuotaHistory(data);
  };

  const actionLabel: Record<string, string> = {
    generate_exercises: 'Tạo bài',
    generate_skip: 'Đổi câu',
    generate_extra: 'Bài thêm',
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-white/70 text-xs font-semibold">Hạn mức token theo phụ huynh</p>
        <button
          onClick={loadQuotas}
          className="btn-scale bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-1.5 rounded-xl text-xs border border-white/30 backdrop-blur-sm"
        >
          🔄 Làm mới
        </button>
      </div>

      {msg && (
        <p className="text-center text-sm font-bold text-white bg-white/20 rounded-2xl px-4 py-2 border border-white/30">
          {msg}
        </p>
      )}

      {quotas.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-amber-100">
          <p className="text-4xl mb-2">👨‍👩‍👧</p>
          <p className="text-gray-400 font-semibold">Chưa có phụ huynh nào</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-amber-100">
          <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-100">
            <p className="font-extrabold text-amber-700 text-sm">🪙 Hạn Mức Token</p>
          </div>
          <div className="divide-y divide-gray-50">
            {quotas.map((q) => {
              const pct = q.total_tokens > 0 ? Math.min(100, Math.round((q.used_tokens / q.total_tokens) * 100)) : 0;
              const barColor = pct >= 90 ? 'bg-rose-400' : pct >= 70 ? 'bg-amber-400' : 'bg-green-400';
              const unlimited = q.total_tokens === 0;

              return (
                <div key={q.parent_id} className="px-5 py-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{q.display_name}</p>
                      <p className="text-xs text-gray-400">@{q.username}</p>
                    </div>
                    <button
                      onClick={() => handleHistory(q.parent_id, q.display_name)}
                      className="btn-scale text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100"
                    >
                      📋 Lịch sử
                    </button>
                  </div>

                  {unlimited ? (
                    <p className="text-xs font-semibold text-gray-400">♾️ Không giới hạn (chưa cài quota)</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-extrabold text-gray-600 shrink-0">
                          {q.used_tokens.toLocaleString()} / {q.total_tokens.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-semibold">
                        Còn lại: <span className={`font-extrabold ${q.remaining === 0 ? 'text-rose-500' : 'text-green-600'}`}>{q.remaining.toLocaleString()} token</span>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="Số token nạp thêm..."
                      value={topupInputs[q.parent_id] ?? ''}
                      onChange={(e) => setTopupInputs((prev) => ({ ...prev, [q.parent_id]: e.target.value }))}
                      className="flex-1 min-w-0 border-2 border-amber-200 rounded-xl py-2 px-3 font-bold text-sm focus:border-amber-400 focus:outline-none bg-white"
                    />
                    <button
                      onClick={() => handleTopup(q.parent_id)}
                      disabled={working === q.parent_id || !topupInputs[q.parent_id]}
                      className="btn-scale shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-extrabold text-sm shadow disabled:opacity-50"
                    >
                      {working === q.parent_id ? '...' : 'Nạp thêm'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quotaHistory !== null && (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-amber-100">
          <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
            <p className="font-extrabold text-amber-700 text-sm">📋 Lịch sử: {historyParentName}</p>
            <button onClick={() => setQuotaHistory(null)} className="text-gray-400 hover:text-gray-600 font-extrabold text-lg">✕</button>
          </div>
          {quotaHistory.length === 0 ? (
            <p className="text-center text-gray-400 py-6 font-semibold">Chưa có lịch sử</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {quotaHistory.map((h) => (
                <li key={h.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{actionLabel[h.action] ?? h.action}</p>
                    <p className="text-xs text-gray-400">{h.created_at}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-amber-600 text-sm">−{h.total_tokens.toLocaleString()} token</p>
                    <p className="text-xs text-gray-400">{h.input_tokens}↑ {h.output_tokens}↓</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-center text-white/50 text-xs font-semibold pb-2">
        Quota không reset theo ngày — dùng đến hết
      </p>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
interface TeacherDashboardProps {
  onLogout: () => void;
}

export default function TeacherDashboard({ onLogout }: TeacherDashboardProps) {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Tổng quan', icon: '📊' },
    { id: 'students', label: 'Học sinh', icon: '👦' },
    { id: 'parents', label: 'PH', icon: '👨‍👩‍👧' },
    { id: 'usage', label: 'Dùng API', icon: '📈' },
    { id: 'add', label: 'Thêm TK', icon: '➕' },
    { id: 'quota', label: 'Quota', icon: '🪙' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 via-violet-500 to-purple-500 flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-3xl">📚</span>
          <div>
            <h1 className="text-xl font-extrabold text-white drop-shadow-md leading-tight">iMath</h1>
            <p className="text-indigo-200 text-[11px] font-semibold">Bảng Điều Khiển Giáo Viên</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="btn-scale flex items-center gap-1.5 bg-white/25 hover:bg-white/40 text-white font-bold px-3 py-1.5 rounded-2xl text-sm backdrop-blur-sm border border-white/30 shadow"
        >
          🚪 Đăng xuất
        </button>
      </header>

      <div className="px-4 shrink-0">
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-1 flex gap-1 border border-white/30">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`btn-scale flex-1 flex items-center justify-center gap-1 py-2 rounded-xl font-extrabold text-xs transition-all ${
                tab === t.id
                  ? 'bg-white text-indigo-700 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'students' && <StudentsTab />}
        {tab === 'parents' && <ParentsTab />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'add' && <AddAccountTab />}
        {tab === 'quota' && <QuotaTab />}
      </main>
    </div>
  );
}
