import { db } from '../database/db';

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface QuotaInfo {
  total_tokens: number;
  used_tokens: number;
  remaining: number;
}

// Returns parent_id to charge, or null (teacher = no quota, student = their parent)
export function getGroupParentId(userId: number, role: string): number | null {
  if (role === 'teacher') return null;
  if (role === 'parent') return userId;
  // student — look up their linked parent
  const row = db.prepare(
    'SELECT parent_id FROM family_links WHERE student_id = ? LIMIT 1'
  ).get(userId) as { parent_id: number } | undefined;
  return row ? row.parent_id : null;
}

// Returns null if no quota row exists (= unlimited)
export function getQuota(parentId: number): QuotaInfo | null {
  const row = db.prepare(
    'SELECT total_tokens, used_tokens FROM token_quotas WHERE parent_id = ?'
  ).get(parentId) as { total_tokens: number; used_tokens: number } | undefined;
  if (!row) return null;
  return {
    total_tokens: row.total_tokens,
    used_tokens: row.used_tokens,
    remaining: Math.max(0, row.total_tokens - row.used_tokens),
  };
}

// Returns false only when quota exists AND remaining === 0
export function checkQuota(parentId: number | null): boolean {
  if (parentId === null) return true;
  const quota = getQuota(parentId);
  if (!quota) return true; // no quota row = unlimited
  return quota.remaining > 0;
}

// Logs the call + increments used_tokens; call AFTER Claude API returns
export const deductTokens = db.transaction(
  (userId: number, parentId: number | null, action: string, usage: TokenUsage) => {
    const total = usage.input_tokens + usage.output_tokens;
    db.prepare(
      `INSERT INTO token_usage_log (user_id, parent_id, action, input_tokens, output_tokens, total_tokens)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, parentId ?? null, action, usage.input_tokens, usage.output_tokens, total);

    if (parentId !== null) {
      db.prepare(
        `UPDATE token_quotas SET used_tokens = used_tokens + ?, updated_at = datetime('now')
         WHERE parent_id = ?`
      ).run(total, parentId);
    }
  }
);

// Teacher adds tokens (INSERT OR UPDATE pattern)
export const topUpTokens = db.transaction((parentId: number, tokensToAdd: number): QuotaInfo => {
  db.prepare(
    `INSERT INTO token_quotas (parent_id, total_tokens, used_tokens)
     VALUES (?, ?, 0)
     ON CONFLICT(parent_id) DO UPDATE SET
       total_tokens = total_tokens + excluded.total_tokens,
       updated_at = datetime('now')`
  ).run(parentId, tokensToAdd);

  const row = db.prepare(
    'SELECT total_tokens, used_tokens FROM token_quotas WHERE parent_id = ?'
  ).get(parentId) as { total_tokens: number; used_tokens: number };
  return {
    total_tokens: row.total_tokens,
    used_tokens: row.used_tokens,
    remaining: Math.max(0, row.total_tokens - row.used_tokens),
  };
});

// Teacher sets absolute quota + resets used_tokens to 0
export const setQuota = db.transaction((parentId: number, totalTokens: number): QuotaInfo => {
  db.prepare(
    `INSERT INTO token_quotas (parent_id, total_tokens, used_tokens)
     VALUES (?, ?, 0)
     ON CONFLICT(parent_id) DO UPDATE SET
       total_tokens = excluded.total_tokens,
       used_tokens = 0,
       updated_at = datetime('now')`
  ).run(parentId, totalTokens);

  return {
    total_tokens: totalTokens,
    used_tokens: 0,
    remaining: totalTokens,
  };
});

// Recent calls for a parent
export function getUsageHistory(parentId: number, limit = 50): Array<{
  id: number;
  user_id: number;
  action: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
}> {
  return db.prepare(
    `SELECT id, user_id, action, input_tokens, output_tokens, total_tokens, created_at
     FROM token_usage_log
     WHERE parent_id = ?
     ORDER BY id DESC
     LIMIT ?`
  ).all(parentId, limit) as ReturnType<typeof getUsageHistory>;
}

// All parents with their quota info (for teacher dashboard)
export function getAllQuotas(): Array<{
  parent_id: number;
  username: string;
  display_name: string;
  total_tokens: number;
  used_tokens: number;
  remaining: number;
}> {
  const parents = db.prepare(
    "SELECT id, username, display_name FROM users WHERE role = 'parent' AND is_active = 1 ORDER BY display_name"
  ).all() as Array<{ id: number; username: string; display_name: string }>;

  const quotaMap = new Map<number, { total_tokens: number; used_tokens: number }>();
  const quotaRows = db.prepare('SELECT parent_id, total_tokens, used_tokens FROM token_quotas').all() as Array<{
    parent_id: number; total_tokens: number; used_tokens: number;
  }>;
  for (const row of quotaRows) {
    quotaMap.set(row.parent_id, row);
  }

  return parents.map((p) => {
    const q = quotaMap.get(p.id);
    const total = q?.total_tokens ?? 0;
    const used = q?.used_tokens ?? 0;
    return {
      parent_id: p.id,
      username: p.username,
      display_name: p.display_name,
      total_tokens: total,
      used_tokens: used,
      remaining: Math.max(0, total - used),
    };
  });
}
