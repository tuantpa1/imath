import { db } from '../database/db';

export class RateLimitError extends Error {
  constructor(
    public readonly action: string,
    public readonly limit: number,
    public readonly used: number
  ) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

export function getCurrentDate(): string {
  // UTC+7 offset
  const utc7 = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return utc7.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/** Atomic check-then-increment inside a transaction. Throws RateLimitError if over limit. */
export const checkAndIncrement = db.transaction((userId: number, action: string, maxCount: number): number => {
  const date = getCurrentDate();
  db.prepare(
    'INSERT OR IGNORE INTO api_usage (user_id, action, date, count) VALUES (?, ?, ?, 0)'
  ).run(userId, action, date);

  const row = db.prepare(
    'SELECT count FROM api_usage WHERE user_id = ? AND action = ? AND date = ?'
  ).get(userId, action, date) as { count: number };

  if (row.count >= maxCount) {
    throw new RateLimitError(action, maxCount, row.count);
  }

  db.prepare(
    'UPDATE api_usage SET count = count + 1 WHERE user_id = ? AND action = ? AND date = ?'
  ).run(userId, action, date);

  return maxCount - row.count - 1; // remaining after this increment
});

export function getUsage(userId: number, action: string): number {
  const date = getCurrentDate();
  const row = db.prepare(
    'SELECT count FROM api_usage WHERE user_id = ? AND action = ? AND date = ?'
  ).get(userId, action, date) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function getAllUsageToday(): Array<{ user_id: number; action: string; count: number }> {
  const date = getCurrentDate();
  return db.prepare(
    'SELECT user_id, action, count FROM api_usage WHERE date = ?'
  ).all(date) as Array<{ user_id: number; action: string; count: number }>;
}

const DEFAULT_LIMITS: Record<string, number> = { admin: 0, teacher: 20, parent: 10, student: 0 };

export function getUserGenerateLimit(userId: number, role: string): number {
  const row = db.prepare(
    'SELECT daily_generate_limit FROM user_limits WHERE user_id = ?'
  ).get(userId) as { daily_generate_limit: number } | undefined;
  return row?.daily_generate_limit ?? DEFAULT_LIMITS[role] ?? 10;
}

export const setUserGenerateLimit = db.transaction((userId: number, limit: number): void => {
  db.prepare(
    'INSERT INTO user_limits (user_id, daily_generate_limit) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET daily_generate_limit = excluded.daily_generate_limit'
  ).run(userId, limit);
});
