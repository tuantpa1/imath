import { db } from '../database/db';
import type { AuthRequest } from './authMiddleware';
import type { Response } from 'express';

/**
 * Resolves the target studentId from the request based on the caller's role.
 * - student  → always own userId (query/body params ignored)
 * - parent   → studentId from query/body, verified via family_links
 * - teacher  → studentId from query/body, any student allowed
 *
 * Returns null and writes the appropriate error response when resolution fails.
 */
export function resolveStudentId(req: AuthRequest, res: Response): number | null {
  const { userId, role } = req.user;

  if (role === 'student') {
    return userId;
  }

  const raw = req.query.studentId ?? req.body?.studentId;
  const studentId = raw !== undefined ? Number(raw) : NaN;

  if (isNaN(studentId) || studentId <= 0) {
    res.status(400).json({ error: 'studentId required' });
    return null;
  }

  if (role === 'parent') {
    const link = db
      .prepare('SELECT 1 FROM family_links WHERE parent_id = ? AND student_id = ?')
      .get(userId, studentId);
    if (!link) {
      res.status(403).json({ error: 'Forbidden: not your child' });
      return null;
    }
  }

  return studentId;
}
