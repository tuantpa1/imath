import { useState, useEffect } from 'react';
import { api, ApiError } from '../services/apiService';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TeacherRow {
  id: number;
  username: string;
  display_name: string;
  is_active: number;
  student_count: number;
  students: Array<{ id: number; display_name: string }>;
}

interface StudentRow {
  id: number;
  username: string;
  display_name: string;
  is_active: number;
  teacher_name: string | null;
  parents: string | null;
}

interface ParentRow {
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

interface UsageRow {
  id: number;
  username: string;
  role: string;
  generate_exercises_used: number;
  generate_exercises_limit: number;
  skip_question_used: number;
}

interface Assignment {
  id: number;
  teacher_id: number;
  teacher_name: string;
  student_id: number;
  student_name: string;
  assigned_at: string;
}

interface TeacherStudentsData {
  assignments: Assignment[];
  unassigned_students: Array<{ id: number; display_name: string }>;
}

interface WrongAnswer {
  question_text: string;
  correct_answer: string;
  student_answer: string;
  type: string;
  parts_json: string | null;
  date: string;
}

type Tab = 'overview' | 'teachers' | 'students' | 'parents' | 'usage' | 'add' | 'assign';

const ADMIN = '/api/admin';

// ── Helpers ────────────────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <span className="text-4xl animate-spin">⭐</span>
      <p className="text-white/80 font-bold animate-pulse">Đang tải...</p>
    </div>
  );
}

const inputClass = 'input-glow w-full border-2 border-indigo-200 rounded-2xl py-2.5 px-4 font-bold text-sm focus:border-indigo-500 transition-all bg-white';

// ── Overview tab ───────────────────────────────────────────────────────────────
function OverviewTab() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<LeaderboardEntry[]>(`${ADMIN}/leaderboard`),
      api.get<{ teachers: TeacherRow[] }>(`${ADMIN}/teachers`),
      api.get<ParentRow[]>(`${ADMIN}/parents`),
      api.get<StudentRow[]>(`${ADMIN}/students`),
    ])
      .then(([lb, t, p, s]) => {
        setLeaderboard(lb);
        setTeachers(t.teachers);
        setParents(p);
        setStudents(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const medals = ['🥇', '🥈', '🥉'];
  const totalPoints = leaderboard.reduce((s, e) => s + e.points, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-4 text-white shadow-xl">
          <p className="text-indigo-200 font-bold text-xs mb-1">GIÁO VIÊN</p>
          <p className="text-4xl font-extrabold">{teachers.length}</p>
        </div>
        <div className="bg-gradient-to-br from-sky-500 to-cyan-600 rounded-3xl p-4 text-white shadow-xl">
          <p className="text-sky-200 font-bold text-xs mb-1">HỌC SINH</p>
          <p className="text-4xl font-extrabold">{students.length}</p>
        </div>
        <div className="bg-gradient-to-br from-teal-400 to-emerald-500 rounded-3xl p-4 text-white shadow-xl">
          <p className="text-teal-100 font-bold text-xs mb-1">PHỤ HUYNH</p>
          <p className="text-4xl font-extrabold">{parents.length}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-4 text-white shadow-xl">
          <p className="text-amber-100 font-bold text-xs mb-1">TỔNG ĐIỂM</p>
          <p className="text-4xl font-extrabold">{totalPoints}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
        <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100">
          <p className="font-extrabold text-indigo-700 text-sm">🏆 Bảng Xếp Hạng Toàn Trường</p>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-center text-gray-400 py-8 font-semibold">Chưa có học sinh nào</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {leaderboard.slice(0, 10).map((entry, i) => (
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

// ── Teachers tab ───────────────────────────────────────────────────────────────
function TeachersTab() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteErr, setDeleteErr] = useState<Record<number, string>>({});

  const load = () => {
    setLoading(true);
    api.get<{ teachers: TeacherRow[] }>(`${ADMIN}/teachers`)
      .then((d) => { setTeachers(d.teachers); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (t: TeacherRow) => {
    setToggling(t.id);
    try {
      if (t.is_active) {
        await api.delete(`${ADMIN}/users/${t.id}`);
      } else {
        await api.patch(`${ADMIN}/users/${t.id}/reactivate`);
      }
      setTeachers((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: t.is_active ? 0 : 1 } : x));
    } catch { /* ignore */ }
    setToggling(null);
  };

  const handleDelete = async (t: TeacherRow) => {
    if (!window.confirm(`Xóa vĩnh viễn tài khoản "${t.display_name}"?\nToàn bộ dữ liệu sẽ bị xóa!`)) return;
    setDeleting(t.id);
    setDeleteErr((prev) => ({ ...prev, [t.id]: '' }));
    try {
      await api.delete(`${ADMIN}/users/${t.id}/permanent`);
      setTeachers((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      setDeleteErr((prev) => ({ ...prev, [t.id]: err instanceof ApiError ? err.message : 'Xóa thất bại' }));
    }
    setDeleting(null);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
        <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100">
          <p className="font-extrabold text-indigo-700 text-sm">👨‍🏫 Danh Sách Giáo Viên ({teachers.length})</p>
        </div>
        {teachers.length === 0 ? (
          <p className="text-center text-gray-400 py-8 font-semibold">Chưa có giáo viên nào</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {teachers.map((t) => (
              <li key={t.id} className={t.is_active === 0 ? 'opacity-50' : ''}>
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-indigo-50 transition-colors"
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0 ${
                    t.is_active ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-gray-300'
                  }`}>
                    {t.display_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{t.display_name}</p>
                    <p className="text-xs text-gray-400 truncate">@{t.username} • {t.student_count} học sinh</p>
                  </div>
                  {t.is_active === 0 && (
                    <span className="text-xs bg-rose-100 text-rose-400 px-2 py-0.5 rounded-full shrink-0">Vô hiệu</span>
                  )}
                  <span className="text-indigo-300 text-sm shrink-0">{expanded === t.id ? '▲' : '▼'}</span>
                </div>

                {expanded === t.id && (
                  <div className="px-5 pb-4 flex flex-col gap-3 border-t border-indigo-50 bg-indigo-50/40">
                    {t.students.length > 0 ? (
                      <div className="pt-3">
                        <p className="text-xs font-bold text-gray-500 mb-2">Học sinh trong lớp:</p>
                        <div className="flex flex-wrap gap-2">
                          {t.students.map((s) => (
                            <span key={s.id} className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-bold">
                              {s.display_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 pt-3 italic">Chưa có học sinh nào được phân vào lớp</p>
                    )}
                    {deleteErr[t.id] && (
                      <p className="text-rose-600 font-bold text-xs">⚠️ {deleteErr[t.id]}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggle(t)}
                        disabled={toggling === t.id}
                        className={`btn-scale flex-1 py-2 rounded-2xl font-extrabold text-xs shadow transition-all disabled:opacity-50 ${
                          t.is_active
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                            : 'bg-green-50 hover:bg-green-100 text-green-600 border border-green-200'
                        }`}
                      >
                        {toggling === t.id ? '...' : t.is_active ? '🔒 Khoá' : '✅ Mở khoá'}
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={deleting === t.id}
                        className="btn-scale flex-1 py-2 rounded-2xl font-extrabold text-xs shadow transition-all disabled:opacity-50 bg-red-600 hover:bg-red-700 text-white border border-red-700"
                      >
                        {deleting === t.id ? '...' : '🗑️ Xóa vĩnh viễn'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Student detail panel ───────────────────────────────────────────────────────
function StudentDetailPanel({
  student,
  onClose,
  onStatusChange,
  onDeleted,
}: {
  student: StudentRow;
  onClose: () => void;
  onStatusChange: (id: number, active: boolean) => void;
  onDeleted: (id: number) => void;
}) {
  const [scores, setScores] = useState<{ totalPoints: number } | null>(null);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ totalPoints: number }>(`${ADMIN}/students/${student.id}/scores`),
      api.get<WrongAnswer[]>(`${ADMIN}/students/${student.id}/wrong-answers`),
    ])
      .then(([s, w]) => { setScores(s); setWrongAnswers(w ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [student.id]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (student.is_active) {
        await api.delete(`${ADMIN}/users/${student.id}`);
        onStatusChange(student.id, false);
      } else {
        await api.patch(`${ADMIN}/users/${student.id}/reactivate`);
        onStatusChange(student.id, true);
      }
      onClose();
    } catch { /* ignore */ }
    setToggling(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Xóa vĩnh viễn tài khoản "${student.display_name}"?\nToàn bộ dữ liệu sẽ bị xóa!`)) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`${ADMIN}/users/${student.id}/permanent`);
      onDeleted(student.id);
      onClose();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Xóa thất bại');
    }
    setDeleting(false);
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden">
      <div className="bg-indigo-50 px-5 py-4 flex items-center justify-between border-b border-indigo-100">
        <div>
          <p className="font-extrabold text-indigo-700">{student.display_name}</p>
          <p className="text-indigo-400 text-xs truncate">
            @{student.username}
            {student.teacher_name ? ` • GV: ${student.teacher_name}` : ' • Chưa phân lớp'}
            {student.parents ? ` • PH: ${student.parents}` : ''}
            {student.is_active === 0 && <span className="ml-2 text-red-400 font-bold">• Vô hiệu</span>}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-extrabold text-lg">✕</button>
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
              <p className="text-gray-400 text-sm text-center py-4">Không có câu sai 🎉</p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-40 overflow-y-auto border border-gray-100 rounded-2xl">
                {wrongAnswers.slice(0, 10).map((w, i) => (
                  <li key={i} className="px-4 py-2.5">
                    <p className="text-gray-700 text-sm font-bold leading-snug">{w.question_text}</p>
                    {w.parts_json ? (
                      <p className="text-xs text-gray-400 mt-0.5">Nhiều đáp án</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">✓ {w.correct_answer} &nbsp;✗ {w.student_answer}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`btn-scale w-full py-2.5 rounded-2xl font-extrabold text-sm shadow transition-all disabled:opacity-50 ${
              student.is_active
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                : 'bg-green-50 hover:bg-green-100 text-green-600 border border-green-200'
            }`}
          >
            {toggling ? '...' : student.is_active ? '🔒 Vô hiệu hoá' : '✅ Kích hoạt lại'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-scale w-full py-2.5 rounded-2xl font-extrabold text-sm shadow transition-all disabled:opacity-50 bg-red-600 hover:bg-red-700 text-white border border-red-700"
          >
            {deleting ? '...' : '🗑️ Xóa vĩnh viễn'}
          </button>
          {deleteError && <p className="text-rose-600 font-bold text-xs text-center">{deleteError}</p>}
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

  useEffect(() => {
    api.get<StudentRow[]>(`${ADMIN}/students`)
      .then((d) => { setStudents(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleStatusChange = (id: number, active: boolean) => {
    setStudents((prev) => prev.map((s) => s.id === id ? { ...s, is_active: active ? 1 : 0 } : s));
  };

  const handleDeleted = (id: number) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setSelected(null);
  };

  if (loading) return <LoadingSpinner />;

  const filtered = students.filter((s) =>
    s.display_name.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      {selected && (
        <StudentDetailPanel
          student={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onDeleted={handleDeleted}
        />
      )}

      <input
        type="text"
        placeholder="🔍 Tìm học sinh..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-glow w-full border-2 border-indigo-200 rounded-2xl py-2.5 px-4 font-bold text-sm focus:border-indigo-500 transition-all bg-white"
      />

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
                    @{s.username}
                    {s.teacher_name ? ` • GV: ${s.teacher_name}` : ''}
                    {s.parents ? ` • PH: ${s.parents}` : ''}
                  </p>
                </div>
                {!s.teacher_name && (
                  <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full shrink-0">Chưa phân lớp</span>
                )}
                {s.is_active === 0 && (
                  <span className="text-xs bg-rose-100 text-rose-400 px-2 py-0.5 rounded-full shrink-0">Vô hiệu</span>
                )}
                <span className="text-indigo-300 text-sm shrink-0">{selected?.id === s.id ? '▲' : '▼'}</span>
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
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    api.get<ParentRow[]>(`${ADMIN}/parents`)
      .then((d) => { setParents(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = async (p: ParentRow) => {
    setToggling(p.id);
    try {
      if (p.is_active) {
        await api.delete(`${ADMIN}/users/${p.id}`);
      } else {
        await api.patch(`${ADMIN}/users/${p.id}/reactivate`);
      }
      setParents((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: p.is_active ? 0 : 1 } : x));
    } catch { /* ignore */ }
    setToggling(null);
  };

  const handleDelete = async (p: ParentRow) => {
    if (!window.confirm(`Xóa vĩnh viễn "${p.display_name}"?\nKhông thể khôi phục!`)) return;
    setDeleting(p.id);
    try {
      await api.delete(`${ADMIN}/users/${p.id}/permanent`);
      setParents((prev) => prev.filter((x) => x.id !== p.id));
    } catch { /* ignore */ }
    setDeleting(null);
  };

  if (loading) return <LoadingSpinner />;

  const filtered = parents.filter((p) =>
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
                  onClick={() => handleToggle(p)}
                  disabled={toggling === p.id}
                  className={`btn-scale shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all disabled:opacity-50 ${
                    p.is_active
                      ? 'bg-rose-50 text-rose-500 border-rose-200 hover:bg-rose-100'
                      : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                  }`}
                >
                  {toggling === p.id ? '...' : p.is_active ? '🔒' : '✅'}
                </button>
                {!p.children && (
                  <button
                    onClick={() => handleDelete(p)}
                    disabled={deleting === p.id}
                    className="btn-scale shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all disabled:opacity-50 bg-red-600 text-white border-red-700 hover:bg-red-700"
                  >
                    {deleting === p.id ? '...' : '🗑️'}
                  </button>
                )}
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
  const [limitInputs, setLimitInputs] = useState<Record<number, string>>({});
  const [savingLimit, setSavingLimit] = useState<number | null>(null);

  const loadUsage = () => {
    setLoading(true);
    api.get<UsageRow[]>(`${ADMIN}/usage`)
      .then((d) => { setRows(d); setLoading(false); setLastRefresh(new Date()); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadUsage(); }, []);

  const handleSaveLimit = async (userId: number) => {
    const val = parseInt(limitInputs[userId] ?? '', 10);
    if (isNaN(val) || val < 0) return;
    setSavingLimit(userId);
    try {
      await api.patch(`${ADMIN}/users/${userId}/limit`, { generateLimit: val });
      setRows((prev) => prev.map((r) => r.id === userId ? { ...r, generate_exercises_limit: val } : r));
      setLimitInputs((prev) => ({ ...prev, [userId]: '' }));
    } catch { /* ignore */ }
    setSavingLimit(null);
  };

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

  if (loading) return <LoadingSpinner />;

  const roleLabel: Record<string, string> = { admin: '🛡️', teacher: '👩‍🏫', parent: '👨‍👩‍👧', student: '👦' };
  const teachers = rows.filter((r) => r.role === 'teacher');
  const parents = rows.filter((r) => r.role === 'parent');
  const students = rows.filter((r) => r.role === 'student');
  const groups = [
    { label: '👩‍🏫 Giáo viên', items: teachers, canEdit: true },
    { label: '👨‍👩‍👧 Phụ huynh', items: parents, canEdit: true },
    { label: '👦 Học sinh', items: students, canEdit: false },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-white/70 text-xs font-semibold">Cập nhật: {lastRefresh.toLocaleTimeString('vi-VN')}</p>
        <button
          onClick={loadUsage}
          className="btn-scale bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-1.5 rounded-xl text-xs border border-white/30 backdrop-blur-sm"
        >
          🔄 Làm mới
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
          <p className="text-white/70 text-xs font-bold mb-1">TẠO BÀI TẬP HÔM NAY</p>
          <p className="text-white font-extrabold text-2xl">{rows.reduce((s, r) => s + r.generate_exercises_used, 0)}</p>
          <p className="text-white/50 text-xs mt-0.5">lần gọi API</p>
        </div>
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
          <p className="text-white/70 text-xs font-bold mb-1">ĐỔI CÂU HỎI HÔM NAY</p>
          <p className="text-white font-extrabold text-2xl">{rows.reduce((s, r) => s + r.skip_question_used, 0)}</p>
          <p className="text-white/50 text-xs mt-0.5">lần gọi API</p>
        </div>
      </div>

      {groups.map(({ label, items, canEdit }) =>
        items.length === 0 ? null : (
          <div key={label} className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
            <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
              <p className="font-extrabold text-indigo-700 text-sm">{label}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map((r) => (
                <div key={r.id} className="px-5 py-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0">{roleLabel[r.role]}</span>
                    <span className="font-bold text-gray-800 text-sm flex-1 truncate">{r.username}</span>
                    {r.skip_question_used > 0 && (
                      <span className="text-xs text-gray-400 shrink-0">đổi câu: {r.skip_question_used}/20</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 shrink-0 w-16">Tạo bài:</span>
                    <UsageBar used={r.generate_exercises_used} limit={r.generate_exercises_limit} />
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0 w-16">Giới hạn:</span>
                      <input
                        type="number"
                        min={0}
                        placeholder={String(r.generate_exercises_limit)}
                        value={limitInputs[r.id] ?? ''}
                        onChange={(e) => setLimitInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className="flex-1 min-w-0 border border-indigo-200 rounded-xl py-1 px-2 text-xs font-bold text-center focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        onClick={() => handleSaveLimit(r.id)}
                        disabled={savingLimit === r.id || !limitInputs[r.id]}
                        className="btn-scale shrink-0 text-xs font-bold px-3 py-1 rounded-xl bg-indigo-500 text-white disabled:opacity-40"
                      >
                        {savingLimit === r.id ? '...' : 'Lưu'}
                      </button>
                    </div>
                  )}
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
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [form, setForm] = useState({
    username: '', password: '', displayName: '', role: 'student',
    linkToParentId: '', assignToTeacherId: '',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadLists = () => {
    api.get<{ teachers: TeacherRow[] }>(`${ADMIN}/teachers`).then((d) => setTeachers(d.teachers)).catch(() => {});
    api.get<ParentRow[]>(`${ADMIN}/parents`).then((d) => setParents(d)).catch(() => {});
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
    if (form.role === 'student') {
      if (form.linkToParentId) body.linkToParentId = Number(form.linkToParentId);
      if (form.assignToTeacherId) body.assignToTeacherId = Number(form.assignToTeacherId);
    }

    try {
      await api.post(`${ADMIN}/users`, body);
      setMsg(`✅ Đã tạo tài khoản "${form.displayName}" thành công!`);
      setForm({ username: '', password: '', displayName: '', role: 'student', linkToParentId: '', assignToTeacherId: '' });
      loadLists();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Không thể tạo tài khoản');
    }
    setSubmitting(false);
  };

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
            <option value="teacher">👩‍🏫 Giáo viên</option>
            <option value="admin">🛡️ Admin</option>
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
            autoComplete="off"
            className={inputClass}
          />
          <input
            type="password"
            placeholder="Mật khẩu *"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            className={inputClass}
          />
          {form.role === 'student' && (
            <>
              {teachers.length > 0 && (
                <select
                  value={form.assignToTeacherId}
                  onChange={(e) => setForm({ ...form, assignToTeacherId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Phân vào lớp (tuỳ chọn)</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.display_name} (@{t.username})</option>
                  ))}
                </select>
              )}
              {parents.length > 0 && (
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
            </>
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
    </div>
  );
}

// ── Class assignment tab ───────────────────────────────────────────────────────
function AssignTab() {
  const [data, setData] = useState<TeacherStudentsData | null>(null);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [unassigning, setUnassigning] = useState<number | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Record<number, string>>({});

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<TeacherStudentsData>(`${ADMIN}/teacher-students`),
      api.get<{ teachers: TeacherRow[] }>(`${ADMIN}/teachers`),
    ])
      .then(([d, t]) => { setData(d); setTeachers(t.teachers); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async (studentId: number) => {
    const teacherId = Number(selectedTeacher[studentId]);
    if (!teacherId) return;
    setAssigning(studentId);
    try {
      await api.post(`${ADMIN}/teacher-students`, { teacherId, studentId });
      load();
      setSelectedTeacher((prev) => ({ ...prev, [studentId]: '' }));
    } catch { /* ignore */ }
    setAssigning(null);
  };

  const handleUnassign = async (studentId: number) => {
    setUnassigning(studentId);
    try {
      await api.delete(`${ADMIN}/teacher-students/${studentId}`);
      load();
    } catch { /* ignore */ }
    setUnassigning(null);
  };

  if (loading) return <LoadingSpinner />;
  if (!data) return null;

  // Group assignments by teacher
  const byTeacher = new Map<number, { teacher_name: string; students: Assignment[] }>();
  for (const a of data.assignments) {
    if (!byTeacher.has(a.teacher_id)) {
      byTeacher.set(a.teacher_id, { teacher_name: a.teacher_name, students: [] });
    }
    byTeacher.get(a.teacher_id)!.students.push(a);
  }

  // Include teachers with no students yet
  for (const t of teachers) {
    if (!byTeacher.has(t.id)) {
      byTeacher.set(t.id, { teacher_name: t.display_name, students: [] });
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Unassigned students */}
      {data.unassigned_students.length > 0 && (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-amber-200">
          <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-100">
            <p className="font-extrabold text-amber-700 text-sm">
              ⚠️ Học Sinh Chưa Phân Lớp ({data.unassigned_students.length})
            </p>
          </div>
          <ul className="divide-y divide-gray-50">
            {data.unassigned_students.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-extrabold text-xs shrink-0">
                  {s.display_name[0]?.toUpperCase()}
                </div>
                <span className="flex-1 font-bold text-gray-800 text-sm min-w-0 truncate">{s.display_name}</span>
                {teachers.length > 0 ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={selectedTeacher[s.id] ?? ''}
                      onChange={(e) => setSelectedTeacher((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="border border-indigo-200 rounded-xl py-1 px-2 text-xs font-bold focus:border-indigo-500 focus:outline-none bg-white"
                    >
                      <option value="">Chọn GV...</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.display_name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssign(s.id)}
                      disabled={assigning === s.id || !selectedTeacher[s.id]}
                      className="btn-scale text-xs font-extrabold px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 transition-all"
                    >
                      {assigning === s.id ? '...' : 'Phân lớp'}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">Chưa có giáo viên</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.unassigned_students.length === 0 && data.assignments.length === 0 && (
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-indigo-100">
          <p className="text-gray-400 font-semibold">Chưa có học sinh nào trong hệ thống</p>
        </div>
      )}

      {/* Teacher class cards */}
      {Array.from(byTeacher.entries()).map(([teacherId, { teacher_name, students }]) => (
        <div key={teacherId} className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-100">
          <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <p className="font-extrabold text-indigo-700 text-sm">
              👨‍🏫 {teacher_name}
            </p>
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2.5 py-0.5 rounded-full font-bold">
              {students.length} học sinh
            </span>
          </div>
          {students.length === 0 ? (
            <p className="text-center text-gray-400 py-5 text-sm font-semibold italic">Chưa có học sinh</p>
          ) : (
            <div className="p-4 flex flex-wrap gap-2">
              {students.map((a) => (
                <div
                  key={a.student_id}
                  className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-full pl-3 pr-1 py-1"
                >
                  <span className="text-sm font-bold text-indigo-700">{a.student_name}</span>
                  <button
                    onClick={() => handleUnassign(a.student_id)}
                    disabled={unassigning === a.student_id}
                    title="Bỏ phân lớp"
                    className="w-5 h-5 rounded-full bg-indigo-200 hover:bg-rose-300 text-indigo-600 hover:text-rose-700 flex items-center justify-center text-xs font-extrabold transition-all disabled:opacity-40"
                  >
                    {unassigning === a.student_id ? '…' : '✕'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main AdminDashboard ────────────────────────────────────────────────────────
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',  label: '📊 Tổng quan' },
  { key: 'teachers',  label: '👨‍🏫 Giáo viên' },
  { key: 'students',  label: '👦 Học sinh' },
  { key: 'parents',   label: '👨‍👩‍👧 Phụ huynh' },
  { key: 'usage',     label: '📈 Dùng API' },
  { key: 'add',       label: '➕ Thêm TK' },
  { key: 'assign',    label: '🔗 Phân lớp' },
];

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 via-violet-600 to-purple-700">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-indigo-700/95 backdrop-blur-sm border-b border-indigo-500/50 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <div>
              <p className="text-white font-extrabold text-base leading-none">iMath Admin</p>
              <p className="text-indigo-300 text-xs">Quản trị hệ thống</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="btn-scale bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-xl text-xs border border-white/20 backdrop-blur-sm"
          >
            Đăng xuất
          </button>
        </div>

        {/* Tab bar */}
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex px-4 pb-3 gap-1.5 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`btn-scale px-3.5 py-2 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all ${
                  tab === t.key
                    ? 'bg-white text-indigo-700 shadow-lg'
                    : 'bg-white/15 text-white/80 hover:bg-white/25'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-5 max-w-2xl mx-auto animate-fade-in">
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'teachers'  && <TeachersTab />}
        {tab === 'students'  && <StudentsTab />}
        {tab === 'parents'   && <ParentsTab />}
        {tab === 'usage'     && <UsageTab />}
        {tab === 'add'       && <AddAccountTab />}
        {tab === 'assign'    && <AssignTab />}
      </div>
    </div>
  );
}
