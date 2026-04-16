import { useState, useEffect } from 'react';
import { api } from '../../services/apiService';
import { authService } from '../../services/authService';

interface ClassInfo {
  totalStudents: number;
  activeToday: number;
  inactiveCount: number;
  needAttentionCount: number;
}

interface LeaderboardEntry {
  rank: number;
  studentId: number;
  name: string;
  points: number;
  maxPoints: number;
}

interface Notification {
  type: string;
  message: string;
  detail: string;
  level: 'good' | 'alert' | 'info';
  studentIds?: number[];
}

interface TeacherDashboard {
  classInfo: ClassInfo;
  leaderboard: LeaderboardEntry[];
  notifications: Notification[];
}

interface Props {
  onNavigate: (tab: 'home' | 'imath' | 'iread' | 'points') => void;
}

const LEVEL_STYLE: Record<Notification['level'], { border: string; badge: string; badgeText: string; icon: string }> = {
  good:  { border: '#059669', badge: '#d1fae5', badgeText: '#065f46', icon: '✅' },
  alert: { border: '#F59E0B', badge: '#fef3c7', badgeText: '#92400e', icon: '⚠️' },
  info:  { border: '#3B82F6', badge: '#dbeafe', badgeText: '#1e40af', icon: 'ℹ️' },
};

export default function TeacherHome({ onNavigate }: Props) {
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const user = authService.getCurrentUser();

  useEffect(() => {
    api.get<TeacherDashboard>('/api/dashboard/teacher')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ci = data?.classInfo;

  return (
    <div className="min-h-screen animate-fade-in" style={{ background: '#eff6ff', paddingBottom: '80px' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #2563eb 60%, #3b82f6 100%)' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <span className="text-white font-extrabold text-xl tracking-wide" style={{ fontFamily: "'Baloo 2', sans-serif" }}>
              iLearn
            </span>
            <p className="text-blue-200 text-xs font-semibold mt-0.5">Lớp học của tôi</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">{user?.display_name ?? ''}</span>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-base font-extrabold"
              style={{ background: 'rgba(255,255,255,0.25)', color: '#fff' }}
            >
              {(user?.display_name ?? 'T')[0].toUpperCase()}
            </div>
          </div>
        </div>

        {/* 3 stat cards */}
        <div className="flex gap-3 px-4 pb-5">
          {loading ? (
            <div className="flex-1 flex justify-center py-3">
              <span className="text-2xl animate-spin text-white">⭐</span>
            </div>
          ) : (
            <>
              <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
                <p className="text-white font-extrabold text-2xl leading-none">{ci?.activeToday ?? 0}</p>
                <p className="text-blue-200 text-xs font-semibold mt-1">Hoạt động</p>
                <p className="text-white/60 text-xs">hôm nay</p>
              </div>
              <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
                <p className="text-white font-extrabold text-2xl leading-none">{ci?.inactiveCount ?? 0}</p>
                <p className="text-blue-200 text-xs font-semibold mt-1">Chưa làm</p>
                <p className="text-white/60 text-xs">{ci?.inactiveCount === 1 ? 'bé' : 'bé'}</p>
              </div>
              <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
                <p
                  className="font-extrabold text-2xl leading-none"
                  style={{ color: (ci?.needAttentionCount ?? 0) > 0 ? '#fbbf24' : '#fff' }}
                >
                  {ci?.needAttentionCount ?? 0}
                </p>
                <p className="text-blue-200 text-xs font-semibold mt-1">Cần chú ý</p>
                <p className="text-white/60 text-xs">học sinh</p>
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
              { icon: '📐', title: 'Giao bài toán', sub: 'Cho cả lớp', tab: 'imath' as const, color: '#7C3AED', bg: '#f5f3ff' },
              { icon: '📚', title: 'Thêm sách', sub: 'Upload & OCR', tab: 'iread' as const, color: '#059669', bg: '#f0fdf4' },
              { icon: '📊', title: 'Báo cáo lớp', sub: 'Tuần này', tab: 'points' as const, color: '#1D4ED8', bg: '#eff6ff' },
              { icon: '👥', title: 'Danh sách lớp', sub: `${ci?.totalStudents ?? 0} học sinh`, tab: 'points' as const, color: '#0F766E', bg: '#f0fdfa' },
            ].map((item, i) => (
              <button
                key={i}
                onClick={() => onNavigate(item.tab)}
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

        {/* ── Leaderboard ──────────────────────────────────────────────────────── */}
        <div>
          <p className="font-extrabold text-gray-700 text-sm mb-3">🏆 BXH lớp — Tuần này</p>
          {loading ? (
            <div className="bg-white rounded-3xl shadow p-6 flex justify-center">
              <span className="text-2xl animate-spin">⭐</span>
            </div>
          ) : !data || data.leaderboard.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-lg p-6 text-center border border-blue-100">
              <p className="text-4xl mb-2">📊</p>
              <p className="text-gray-400 text-sm">Chưa có điểm tuần này</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-lg overflow-hidden border border-blue-100">
              {data.leaderboard.map((entry) => {
                const isFirst = entry.rank === 1;
                const barPct = entry.maxPoints > 0 ? Math.round((entry.points / entry.maxPoints) * 100) : 0;
                return (
                  <div
                    key={entry.studentId}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                    style={{ background: isFirst ? '#fffbeb' : undefined }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0"
                      style={{
                        background: isFirst ? '#F59E0B' : '#e5e7eb',
                        color: isFirst ? '#fff' : '#6b7280',
                      }}
                    >
                      {isFirst ? '🥇' : entry.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{entry.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${barPct}%`,
                              background: isFirst ? '#F59E0B' : '#3b82f6',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-xs font-extrabold"
                      style={{ color: isFirst ? '#D97706' : '#374151' }}
                    >
                      {entry.points}⭐
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Notifications ──────────────────────────────────────────────────── */}
        <div>
          <p className="font-extrabold text-gray-700 text-sm mb-3">🔔 Cần chú ý</p>
          {loading ? (
            <div className="bg-white rounded-3xl shadow p-6 flex justify-center">
              <span className="text-2xl animate-spin">⭐</span>
            </div>
          ) : !data || data.notifications.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-lg p-6 text-center border border-blue-100">
              <div className="text-4xl mb-2">🎉</div>
              <p className="font-extrabold text-blue-600 text-sm">Lớp học đang ổn định!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.notifications.map((n, i) => {
                const style = LEVEL_STYLE[n.level];
                return (
                  <div
                    key={i}
                    className="bg-white rounded-2xl shadow-md overflow-hidden"
                    style={{ borderLeft: `4px solid ${style.border}` }}
                  >
                    <div className="flex items-start gap-3 pl-3 pr-3 py-3.5">
                      <span className="text-base shrink-0 mt-0.5">{style.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{n.detail}</p>
                      </div>
                      <span
                        className="shrink-0 text-xs font-extrabold px-2 py-1 rounded-full"
                        style={{ background: style.badge, color: style.badgeText }}
                      >
                        {n.level === 'good' ? 'Tốt' : n.level === 'alert' ? 'Alert' : 'Info'}
                      </span>
                    </div>
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
