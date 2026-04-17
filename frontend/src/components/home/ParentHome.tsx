import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/apiService';
import { authService } from '../../services/authService';

interface DashboardChild {
  id: number;
  display_name: string;
  points: { total: number; imath: number; iread: number };
  weeklyProgress: {
    imath: { done: number; total: number };
    iread: { done: number; total: number };
  };
}

interface Notification {
  type: string;
  childName: string;
  childId: number;
  message: string;
  detail: string;
  level: 'good' | 'alert' | 'info';
  createdAt: string;
}

interface ParentDashboard {
  children: DashboardChild[];
  notifications: Notification[];
}

interface Props {
  onNavigate: (tab: 'home' | 'imath' | 'iread' | 'points') => void;
}

function pct(done: number, total: number) {
  if (total === 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

const LEVEL_STYLE: Record<Notification['level'], { border: string; badge: string; badgeText: string; badgeLabel: string }> = {
  good:  { border: '#059669', badge: '#d1fae5', badgeText: '#065f46', badgeLabel: 'Tốt!' },
  alert: { border: '#F59E0B', badge: '#fef3c7', badgeText: '#92400e', badgeLabel: 'Xem' },
  info:  { border: '#3B82F6', badge: '#dbeafe', badgeText: '#1e40af', badgeLabel: 'Info' },
};

export default function ParentHome({ onNavigate }: Props) {
  const [data, setData] = useState<ParentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const user = authService.getCurrentUser();

  useEffect(() => {
    api.get<ParentDashboard>('/api/dashboard/parent')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const child = data?.children[selectedIdx] ?? null;

  return (
    <div className="min-h-screen animate-fade-in" style={{ background: '#f0fdfa' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #0F766E 0%, #0d9488 60%, #14b8a6 100%)' }}>
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
              {(user?.display_name ?? 'P')[0].toUpperCase()}
            </div>
          </div>
        </div>

        {/* Child tabs (only if 2+ children) */}
        {!loading && (data?.children.length ?? 0) > 1 && (
          <div className="flex gap-2 px-5 pb-2 pt-1 overflow-x-auto">
            {data!.children.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setSelectedIdx(i)}
                className="btn-scale shrink-0 px-3.5 py-1.5 rounded-2xl text-sm font-bold transition-all"
                style={{
                  background: selectedIdx === i ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                  color: selectedIdx === i ? '#0F766E' : 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              >
                🧒 {c.display_name}
              </button>
            ))}
          </div>
        )}

        {/* Points card */}
        <div className="mx-4 mb-4 mt-2 rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }}>
          {loading ? (
            <div className="flex justify-center py-3">
              <span className="text-3xl animate-spin inline-block">⭐</span>
            </div>
          ) : !child ? (
            <p className="text-white text-center text-sm font-bold py-2">Chưa có con nào được liên kết</p>
          ) : (
            <>
              <p className="text-white/70 text-xs font-semibold mb-1">Điểm của {child.display_name}</p>
              <p className="text-white font-extrabold leading-none mb-2" style={{ fontSize: '2.5rem' }}>
                {child.points.total.toLocaleString()} ⭐
              </p>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                  📐 iMath {child.points.imath}
                </span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                  📚 iRead {child.points.iread}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-5 flex flex-col gap-5">
        {/* ── Quick actions ───────────────────────────────────────────────────── */}
        <div>
          <p className="font-extrabold text-gray-700 text-sm mb-3">⚡ Thao tác nhanh</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '📐', title: 'Giao bài toán', sub: 'Tạo cho con', tab: 'imath' as const, color: '#7C3AED', bg: '#f5f3ff' },
              { icon: '📚', title: 'Thêm sách', sub: 'Upload & OCR', tab: 'iread' as const, color: '#059669', bg: '#f0fdf4' },
              { icon: '🏆', title: 'Đổi thưởng', sub: child ? `${child.points.total} điểm` : '0 điểm', tab: 'points' as const, color: '#D97706', bg: '#fffbeb' },
              { icon: '📊', title: 'Xem tiến độ', sub: 'Tuần này', tab: null, color: '#0F766E', bg: '#f0fdfa', action: () => progressRef.current?.scrollIntoView({ behavior: 'smooth' }) },
            ].map((item) => (
              <button
                key={item.title}
                onClick={() => item.action ? item.action() : onNavigate(item.tab!)}
                className="btn-scale rounded-3xl shadow-md p-4 text-left flex flex-col gap-1.5"
                style={{ background: item.bg, border: `1px solid ${item.color}22` }}
              >
                <span className="text-2xl">{item.icon}</span>
                <p className="font-extrabold text-gray-800 text-sm leading-tight">{item.title}</p>
                <p className="text-xs font-semibold" style={{ color: item.color }}>{item.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Weekly progress ──────────────────────────────────────────────────── */}
        <div ref={progressRef}>
          <p className="font-extrabold text-gray-700 text-sm mb-3">
            📈 Tiến độ tuần này{child ? ` — ${child.display_name}` : ''}
          </p>
          {!loading && child ? (
            <div className="bg-white rounded-3xl shadow-lg p-5 border border-teal-100 flex flex-col gap-4">
              {/* iMath */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>📐</span>
                    <p className="font-bold text-gray-700 text-sm">iMath</p>
                  </div>
                  <p className="text-xs font-bold text-gray-500">
                    {child.weeklyProgress.imath.done}/{child.weeklyProgress.imath.total} bài
                  </p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{
                      width: `${pct(child.weeklyProgress.imath.done, child.weeklyProgress.imath.total)}%`,
                      background: '#7C3AED',
                    }}
                  />
                </div>
                <p className="text-xs text-violet-600 font-bold mt-1">
                  {pct(child.weeklyProgress.imath.done, child.weeklyProgress.imath.total)}%
                </p>
              </div>
              {/* iRead */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>📚</span>
                    <p className="font-bold text-gray-700 text-sm">iRead</p>
                  </div>
                  <p className="text-xs font-bold text-gray-500">
                    {child.weeklyProgress.iread.done}/{child.weeklyProgress.iread.total} sách
                  </p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{
                      width: `${pct(child.weeklyProgress.iread.done, child.weeklyProgress.iread.total)}%`,
                      background: '#059669',
                    }}
                  />
                </div>
                <p className="text-xs text-emerald-600 font-bold mt-1">
                  {pct(child.weeklyProgress.iread.done, child.weeklyProgress.iread.total)}%
                </p>
              </div>
            </div>
          ) : !loading ? (
            <div className="bg-white rounded-3xl shadow p-6 text-center">
              <p className="text-gray-400 text-sm">Chưa có dữ liệu</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow p-6 flex justify-center">
              <span className="text-2xl animate-spin">⭐</span>
            </div>
          )}
        </div>

        {/* ── Notifications ──────────────────────────────────────────────────── */}
        <div>
          <p className="font-extrabold text-gray-700 text-sm mb-3">🔔 Thông báo</p>
          {loading ? (
            <div className="bg-white rounded-3xl shadow p-6 flex justify-center">
              <span className="text-2xl animate-spin">⭐</span>
            </div>
          ) : !data || data.notifications.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-lg p-6 text-center border border-teal-100">
              <div className="text-4xl mb-2">🎉</div>
              <p className="font-extrabold text-teal-600 text-sm">Mọi thứ đều ổn!</p>
              <p className="text-gray-400 text-xs mt-1">Không có thông báo mới</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.notifications.map((n, i) => {
                const style = LEVEL_STYLE[n.level];
                return (
                  <div
                    key={i}
                    className="bg-white rounded-2xl shadow-md flex items-center gap-3 pr-3 overflow-hidden"
                    style={{ borderLeft: `4px solid ${style.border}` }}
                  >
                    <div className="pl-3 py-3.5 flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{n.message}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{n.detail}</p>
                    </div>
                    <span
                      className="shrink-0 text-xs font-extrabold px-2.5 py-1 rounded-full"
                      style={{ background: style.badge, color: style.badgeText }}
                    >
                      {style.badgeLabel}
                    </span>
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
