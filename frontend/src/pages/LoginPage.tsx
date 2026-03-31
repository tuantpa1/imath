import { useState } from 'react';
import { authService } from '../services/authService';
import type { AuthUser } from '../services/authService';

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const user = await authService.login(username.trim(), password.trim());
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 via-blue-300 to-purple-300 flex flex-col items-center justify-center px-5">
      <div className="animate-fade-in w-full max-w-sm flex flex-col items-center gap-6">

        {/* Logo */}
        <div className="text-center">
          <div className="text-7xl mb-2">🌟</div>
          <h1 className="text-4xl font-extrabold text-white drop-shadow-md">iMath</h1>
          <p className="text-blue-100 font-semibold mt-1">Học Toán Thật Vui!</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full border border-blue-100">
          <h2 className="text-xl font-extrabold text-indigo-700 mb-6 text-center">
            Đăng Nhập
          </h2>

          <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-gray-600">Tên đăng nhập</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập..."
                autoComplete="username"
                disabled={loading}
                className="input-glow w-full text-base font-bold border-2 border-indigo-200 rounded-2xl py-3 px-4 focus:border-indigo-500 disabled:opacity-50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-gray-600">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                autoComplete="current-password"
                disabled={loading}
                className="input-glow w-full text-base font-bold border-2 border-indigo-200 rounded-2xl py-3 px-4 focus:border-indigo-500 disabled:opacity-50 transition-all"
              />
            </div>

            {error && (
              <div className="animate-bounce-in bg-rose-50 border-2 border-rose-200 rounded-2xl px-4 py-3 text-rose-600 font-bold text-sm text-center">
                ❌ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!username.trim() || !password.trim() || loading}
              className="btn-scale mt-2 w-full py-4 rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-40 text-white font-extrabold text-lg shadow-xl border border-indigo-400 transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin inline-block">⭐</span>
                  Đang đăng nhập...
                </span>
              ) : (
                'Đăng nhập 🚀'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
