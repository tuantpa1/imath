import { useState, useEffect } from 'react';
import { api } from '../../services/apiService';
import { authService } from '../../services/authService';

interface DashboardPoints {
  total: number;
  imath: number;
  iread: number;
}

interface WeeklyModule {
  done: number;
  total: number;
}

interface Task {
  id: number;
  type: 'imath' | 'iread';
  title: string;
  status: 'not_started' | 'in_progress';
  detail: string;
  isUrgent: boolean;
  refId: number;
}

interface StudentDashboard {
  points: DashboardPoints;
  streak: number;
  weeklyProgress: { imath: WeeklyModule; iread: WeeklyModule };
  tasks: Task[];
}

interface Props {
  onNavigate: (tab: 'home' | 'imath' | 'iread' | 'points') => void;
  onTaskCount?: (count: number) => void;
}

function pct(done: number, total: number) {
  if (total === 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export default function StudentHome({ onNavigate, onTaskCount }: Props) {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const user = authService.getCurrentUser();

  useEffect(() => {
    api.get<StudentDashboard>('/api/dashboard/student')
      .then((d) => {
        setData(d);
        onTaskCount?.(d.tasks.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="min-h-screen animate-fade-in"
      style={{ background: '#f3f0ff', paddingBottom: '80px' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #5B3FD4 0%, #7C3AED 60%, #9333EA 100%)' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-white font-extrabold text-xl tracking-wide" style={{ fontFamily: "'Baloo 2', sans-serif" }}>
            iLearn
          </span>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">{user?.display_name ?? ''}</span>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-base font-extrabold"
              style={{ background: 'rgba(255,255,255,0.25)', color: '#fff' }}
            >
              {(user?.display_name ?? 'U')[0].toUpperCase()}
            </div>
          </div>
        </div>

        {/* Points + streak card */}
        <div className="mx-4 mb-4 mt-2 rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }}>
          {loading ? (
            <div className="flex justify-center py-3">
              <span className="text-3xl animate-spin inline-block">⭐</span>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-white/70 text-xs font-semibold mb-1">Tổng điểm tích lũy</p>
                <p className="text-white font-extrabold leading-none mb-2" style={{ fontSize: '2.5rem' }}>
                  {(data?.points.total ?? 0).toLocaleString()} ⭐
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                    📐 iMath {data?.points.imath ?? 0}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                    📚 iRead {data?.points.iread ?? 0}
                  </span>
                </div>
              </div>
              {/* Streak */}
              <div className="flex flex-col items-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '16px', padding: '10px 14px' }}>
                <span className="text-2xl leading-none">🔥</span>
                <span className="text-white font-extrabold text-2xl leading-none mt-1">{data?.streak ?? 0}</span>
                <span className="text-white/80 text-xs font-bold mt-0.5">ngày liên tục</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-5 flex flex-col gap-5">
        {/* ── Apps grid ──────────────────────────────────────────────────────── */}
        <div>
          <p className="font-extrabold text-gray-700 text-sm mb-3">📱 Ứng dụng</p>
          <div className="grid grid-cols-2 gap-3">
            {/* iMath */}
            <button
              onClick={() => onNavigate('imath')}
              className="btn-scale bg-white rounded-3xl shadow-lg p-4 text-left border border-violet-100 flex flex-col gap-2"
            >
              <div className="text-3xl">📐</div>
              <div>
                <p className="font-extrabold text-gray-800 text-sm">iMath</p>
                <p className="text-gray-400 text-xs">Toán học vui</p>
              </div>
              {!loading && (
                <>
                  <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${pct(data?.weeklyProgress.imath.done ?? 0, data?.weeklyProgress.imath.total ?? 0)}%`,
                        background: '#7C3AED',
                      }}
                    />
                  </div>
                  <p className="text-xs text-violet-600 font-bold">
                    {data?.weeklyProgress.imath.done ?? 0}/{data?.weeklyProgress.imath.total ?? 0} bài •{' '}
                    {pct(data?.weeklyProgress.imath.done ?? 0, data?.weeklyProgress.imath.total ?? 0)}%
                  </p>
                </>
              )}
            </button>

            {/* iRead */}
            <button
              onClick={() => onNavigate('iread')}
              className="btn-scale bg-white rounded-3xl shadow-lg p-4 text-left border border-emerald-100 flex flex-col gap-2"
            >
              <div className="text-3xl">📚</div>
              <div>
                <p className="font-extrabold text-gray-800 text-sm">iRead</p>
                <p className="text-gray-400 text-xs">Đọc hiểu truyện</p>
              </div>
              {!loading && (
                <>
                  <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${pct(data?.weeklyProgress.iread.done ?? 0, data?.weeklyProgress.iread.total ?? 0)}%`,
                        background: '#059669',
                      }}
                    />
                  </div>
                  <p className="text-xs text-emerald-600 font-bold">
                    {data?.weeklyProgress.iread.done ?? 0}/{data?.weeklyProgress.iread.total ?? 0} truyện •{' '}
                    {pct(data?.weeklyProgress.iread.done ?? 0, data?.weeklyProgress.iread.total ?? 0)}%
                  </p>
                </>
              )}
            </button>

            {/* Coming soon × 2 */}
            {['🎵 iSing', '🎨 iDraw'].map((label) => (
              <div
                key={label}
                className="bg-white rounded-3xl shadow-sm p-4 border border-gray-100 flex flex-col gap-2 opacity-40 cursor-not-allowed"
              >
                <div className="text-3xl">{label.split(' ')[0]}</div>
                <div>
                  <p className="font-extrabold text-gray-500 text-sm">{label.split(' ')[1]}</p>
                  <span className="text-xs bg-gray-100 text-gray-400 font-bold px-2 py-0.5 rounded-full">Sắp có</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tasks ──────────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="font-extrabold text-gray-700 text-sm">📋 Nhiệm vụ cần làm</p>
            {(data?.tasks.length ?? 0) > 0 && (
              <span className="text-xs font-extrabold bg-violet-500 text-white px-2 py-0.5 rounded-full">
                {data!.tasks.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="bg-white rounded-3xl shadow p-6 text-center">
              <span className="text-2xl animate-spin inline-block">⭐</span>
            </div>
          ) : !data || data.tasks.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-lg p-6 text-center border border-emerald-100">
              <div className="text-4xl mb-2">🎉</div>
              <p className="font-extrabold text-emerald-600 text-sm">Bạn đã hoàn thành tất cả nhiệm vụ hôm nay!</p>
              <p className="text-gray-400 text-xs mt-1">Tiếp tục cố gắng nhé! 💪</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.tasks.map((task) => {
                const isImath = task.type === 'imath';
                const accentColor = task.isUrgent ? '#EF4444' : isImath ? '#7C3AED' : '#059669';
                const btnColor = isImath ? '#7C3AED' : '#059669';
                const btnLabel =
                  isImath ? 'Làm →' : task.status === 'in_progress' ? 'Tiếp →' : 'Đọc →';

                return (
                  <div
                    key={`${task.type}-${task.id}`}
                    className="bg-white rounded-2xl shadow-md flex items-center gap-3 pr-3 overflow-hidden"
                    style={{ borderLeft: `4px solid ${accentColor}` }}
                  >
                    <div className="pl-3 py-3.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-base">{isImath ? '📐' : '📚'}</span>
                        <p className="font-bold text-gray-800 text-sm truncate">{task.title}</p>
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {isImath ? 'iMath' : 'iRead'} · {task.detail}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate(isImath ? 'imath' : 'iread')}
                      className="btn-scale shrink-0 text-xs font-extrabold text-white px-3 py-2 rounded-xl"
                      style={{ background: btnColor }}
                    >
                      {btnLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
