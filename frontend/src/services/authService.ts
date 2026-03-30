const TOKEN_KEY = 'imath_token';
const USER_KEY = 'imath_user';

const getBaseUrl = () => {
  const { protocol, hostname, port } = window.location;
  // Production (standard ports): use same host, no port
  if (!port || port === '443' || port === '80') {
    return `${protocol}//${hostname}`;
  }
  // Local dev: backend always runs on 3001 regardless of frontend port
  return `${protocol}//${hostname}:3001`;
};
const AUTH_BASE = `${getBaseUrl()}/auth`;

export interface AuthUser {
  id: number;
  username: string;
  role: 'teacher' | 'parent' | 'student';
  display_name: string;
}

export const authService = {
  login: async (username: string, password: string): Promise<AuthUser> => {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Đăng nhập thất bại');
    }
    const data = await res.json() as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  },

  logout: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),

  getCurrentUser: (): AuthUser | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  isLoggedIn: (): boolean => !!localStorage.getItem(TOKEN_KEY),
};

// Dispatch this to notify App.tsx of an expired session
export function dispatchUnauthorized(): void {
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

export function onUnauthorized(callback: () => void): () => void {
  window.addEventListener('auth:unauthorized', callback);
  return () => window.removeEventListener('auth:unauthorized', callback);
}

/**
 * Drop-in fetch wrapper that injects the Authorization header and
 * auto-logs out on 401 responses.
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = authService.getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    authService.logout();
    dispatchUnauthorized();
  }
  return res;
}
