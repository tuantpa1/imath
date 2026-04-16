import { useState, useEffect } from 'react';
import { api } from '../../services/apiService';

interface WrongQuestionPart {
  label: string;
  correctAnswer: number | string;
  studentAnswer: number | string;
  unit: string;
}

interface WrongQuestion {
  question: string;
  type?: string;
  date: string;
  correctAnswer?: string;
  studentAnswer?: string;
  parts?: WrongQuestionPart[];
}

interface Scores {
  totalPoints: number;
  history: { date: string; earned: number; activity: string }[];
  redeemed: { date: string; points: number; amount?: number }[];
  wrongQuestions: WrongQuestion[];
}

export default function PointsScreen() {
  const [scores, setScores] = useState<Scores | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'overview' | 'history' | 'wrong'>('overview');

  useEffect(() => {
    api.get<Scores>('/api/scores')
      .then(setScores)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="min-h-screen animate-fade-in"
      style={{ background: '#f5f3ff', paddingBottom: '80px' }}
    >
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #5B3FD4 0%, #7C3AED 100%)' }} className="px-5 pt-5 pb-6">
        <p className="text-white/70 text-sm font-semibold mb-1">Tổng điểm của bé</p>
        {loading ? (
          <span className="text-3xl animate-spin inline-block text-white">⭐</span>
        ) : (
          <>
            <p className="text-white font-extrabold leading-none mb-3" style={{ fontSize: '3rem' }}>
              {(scores?.totalPoints ?? 0).toLocaleString()} <span className="text-4xl">⭐</span>
            </p>
            <div className="flex gap-2">
              <span className="text-xs font-bold text-white/80 bg-white/20 px-3 py-1 rounded-full">
                🎯 {scores?.history?.filter((h) => h.earned > 0).length ?? 0} lần trả lời đúng
              </span>
              {(scores?.redeemed?.length ?? 0) > 0 && (
                <span className="text-xs font-bold text-white/80 bg-white/20 px-3 py-1 rounded-full">
                  🎁 {scores!.redeemed.length} lần đổi quà
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-0 mx-4 mt-4 bg-white rounded-2xl shadow p-1">
        {(['overview', 'history', 'wrong'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: activeSection === s ? '#7C3AED' : 'transparent',
              color: activeSection === s ? '#fff' : '#9ca3af',
            }}
          >
            {s === 'overview' ? '⭐ Tổng quan' : s === 'history' ? '📋 Lịch sử' : '❌ Câu sai'}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="text-4xl animate-spin">⭐</span>
          </div>
        ) : !scores ? (
          <div className="bg-white rounded-3xl shadow p-8 text-center">
            <p className="text-gray-400 text-sm">Không tải được dữ liệu</p>
          </div>
        ) : activeSection === 'overview' ? (
          <div className="flex flex-col gap-3">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-3xl shadow-md p-4 text-center border border-violet-100">
                <p className="text-3xl font-extrabold text-violet-600">{scores.totalPoints}</p>
                <p className="text-xs text-gray-400 font-semibold mt-1">Tổng điểm</p>
              </div>
              <div className="bg-white rounded-3xl shadow-md p-4 text-center border border-emerald-100">
                <p className="text-3xl font-extrabold text-emerald-600">
                  {scores.history.filter((h) => h.earned > 0).length}
                </p>
                <p className="text-xs text-gray-400 font-semibold mt-1">Câu trả lời đúng</p>
              </div>
              <div className="bg-white rounded-3xl shadow-md p-4 text-center border border-rose-100">
                <p className="text-3xl font-extrabold text-rose-500">{scores.wrongQuestions.length}</p>
                <p className="text-xs text-gray-400 font-semibold mt-1">Câu trả lời sai</p>
              </div>
              <div className="bg-white rounded-3xl shadow-md p-4 text-center border border-amber-100">
                <p className="text-3xl font-extrabold text-amber-500">{scores.redeemed.length}</p>
                <p className="text-xs text-gray-400 font-semibold mt-1">Lần đổi quà</p>
              </div>
            </div>

            {/* Accuracy bar */}
            {scores.history.length > 0 && (() => {
              const correct = scores.history.filter((h) => h.earned > 0).length;
              const total = scores.history.length;
              const acc = Math.round((correct / total) * 100);
              return (
                <div className="bg-white rounded-3xl shadow-md p-4 border border-violet-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-gray-700 text-sm">Độ chính xác</p>
                    <p className="font-extrabold text-violet-600 text-sm">{acc}%</p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{ width: `${acc}%`, background: acc >= 80 ? '#059669' : acc >= 60 ? '#f59e0b' : '#ef4444' }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">{correct} đúng / {total} lần trả lời</p>
                </div>
              );
            })()}

            {/* Recent redemptions */}
            {scores.redeemed.length > 0 && (
              <div className="bg-white rounded-3xl shadow-md p-4 border border-amber-100">
                <p className="font-bold text-gray-700 text-sm mb-3">🎁 Đổi quà gần đây</p>
                <div className="flex flex-col gap-2">
                  {scores.redeemed.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 text-xs">{r.date.slice(0, 10)}</span>
                      <span className="font-bold text-amber-600">-{r.points} ⭐</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeSection === 'history' ? (
          scores.history.length === 0 ? (
            <div className="bg-white rounded-3xl shadow p-8 text-center">
              <p className="text-4xl mb-2">📋</p>
              <p className="text-gray-400 text-sm">Chưa có lịch sử điểm</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {[...scores.history].reverse().slice(0, 50).map((h, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center justify-between border border-gray-50">
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{h.activity || 'Bài tập'}</p>
                    <p className="text-xs text-gray-400">{h.date}</p>
                  </div>
                  <span
                    className="font-extrabold text-sm"
                    style={{ color: h.earned > 0 ? '#059669' : '#ef4444' }}
                  >
                    {h.earned > 0 ? '+' : ''}{h.earned} ⭐
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (
          scores.wrongQuestions.length === 0 ? (
            <div className="bg-white rounded-3xl shadow p-8 text-center border border-emerald-100">
              <p className="text-4xl mb-2">🎉</p>
              <p className="font-extrabold text-emerald-600 text-sm">Chưa có câu nào làm sai!</p>
              <p className="text-gray-400 text-xs mt-1">Tiếp tục cố gắng nhé! 💪</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {[...scores.wrongQuestions].reverse().slice(0, 30).map((w, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm p-3 border border-rose-50">
                  <p className="font-bold text-gray-800 text-sm mb-2">{w.question}</p>
                  {w.parts ? (
                    <div className="flex flex-col gap-1">
                      {w.parts.map((p, pi) => (
                        <div key={pi} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 font-semibold w-16 shrink-0">{p.label}:</span>
                          <span className="text-rose-500 font-bold line-through">{String(p.studentAnswer)}{p.unit}</span>
                          <span className="text-emerald-600 font-bold">→ {String(p.correctAnswer)}{p.unit}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-rose-500 font-bold">✗ {w.studentAnswer}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-emerald-600 font-bold">✓ {w.correctAnswer}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-300 mt-1.5">{w.date?.slice(0, 10)}</p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
