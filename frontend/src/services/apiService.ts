import { authService, dispatchUnauthorized } from './authService';

const BASE = (() => {
  const { protocol, hostname, port } = window.location;
  // On standard HTTPS (443) or HTTP (80), omit the port (production/VPS)
  if (!port || port === '443' || port === '80') {
    return `${protocol}//${hostname}`;
  }
  // In local dev the backend runs on :3001 regardless of frontend port
  return `${protocol}//${hostname}:3001`;
})();

// ── Typed error class ──────────────────────────────────────────────────────────
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ── Core request ───────────────────────────────────────────────────────────────
async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = authService.getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Don't set Content-Type for FormData — browser sets it with boundary
  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData
      ? (body as FormData)
      : body !== undefined
      ? JSON.stringify(body)
      : undefined,
  });

  if (res.status === 401) {
    authService.logout();
    dispatchUnauthorized();
    throw new ApiError(401, 'Phiên đăng nhập hết hạn');
  }

  if (res.status === 403) {
    throw new ApiError(403, 'Không có quyền truy cập');
  }

  if (res.status === 429) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(429, err.error ?? 'Đã đạt giới hạn');
  }

  if (res.status >= 500) {
    throw new ApiError(res.status, 'Lỗi hệ thống, vui lòng thử lại');
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, err.error ?? 'Đã xảy ra lỗi');
  }

  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────────
export const api = {
  get:    <T = unknown>(path: string)                   => request<T>('GET',    path),
  post:   <T = unknown>(path: string, body?: unknown)   => request<T>('POST',   path, body),
  patch:  <T = unknown>(path: string, body?: unknown)   => request<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string)                   => request<T>('DELETE', path),
};
