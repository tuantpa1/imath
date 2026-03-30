import { Router, Request, Response } from 'express';
import {
  readScores, writeScores,
  readExercises, writeExercises,
  markSessionComplete, deleteAllSessions,
  deleteQuestion,
  readRewards, writeRewards,
  ForbiddenError,
} from '../services/storageServiceSQLite';
import type { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentId } from '../middleware/resolveStudent';
import { getUsage, getCurrentDate } from '../services/rateLimitService';

const router = Router();

// --- Scores ---
router.get('/scores', (req: Request, res: Response) => {
  const studentId = resolveStudentId(req as AuthRequest, res);
  if (studentId === null) return;
  try {
    res.json(readScores(studentId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read scores' });
  }
});

router.post('/scores', (req: Request, res: Response) => {
  const studentId = resolveStudentId(req as AuthRequest, res);
  if (studentId === null) return;
  try {
    writeScores(studentId, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to write scores' });
  }
});

// --- Exercises ---
router.get('/exercises', (req: Request, res: Response) => {
  const studentId = resolveStudentId(req as AuthRequest, res);
  if (studentId === null) return;
  try {
    res.json(readExercises(studentId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read exercises' });
  }
});

router.post('/exercises', (req: Request, res: Response) => {
  const studentId = resolveStudentId(req as AuthRequest, res);
  if (studentId === null) return;
  try {
    writeExercises(studentId, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to write exercises' });
  }
});

router.delete('/exercises/all', (req: Request, res: Response) => {
  const studentId = resolveStudentId(req as AuthRequest, res);
  if (studentId === null) return;
  try {
    deleteAllSessions(studentId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete sessions' });
  }
});

// --- Delete individual question ---
router.delete('/questions/:questionId', (req: Request, res: Response) => {
  const { userId, role } = (req as AuthRequest).user;
  if (role === 'student') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const remaining = deleteQuestion(String(req.params.questionId), userId, role);
    res.json({ success: true, remainingQuestions: remaining });
  } catch (err) {
    if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
    if (err instanceof Error && err.message === 'Question not found') { res.status(404).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// --- Session completion ---
router.patch('/sessions/:id/complete', (req: Request, res: Response) => {
  const studentId = resolveStudentId(req as AuthRequest, res);
  if (studentId === null) return;
  try {
    markSessionComplete(String(req.params.id), studentId);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// --- Rewards ---
router.get('/rewards', (_req: Request, res: Response) => {
  try {
    res.json(readRewards());
  } catch {
    res.status(500).json({ error: 'Failed to read rewards' });
  }
});

router.post('/rewards', (req: Request, res: Response) => {
  try {
    writeRewards(req.body);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to write rewards' });
  }
});

// --- Usage ---
router.get('/usage', (req: Request, res: Response) => {
  const { userId, role } = (req as AuthRequest).user;
  const genLimit = role === 'teacher' ? 20 : role === 'parent' ? 10 : 0;
  const skipLimit = role === 'student' ? 20 : 0;
  const genUsed = getUsage(userId, 'generate_exercises');
  const skipUsed = getUsage(userId, 'skip_question');
  const today = getCurrentDate();
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const resetsAt = `${tomorrow.toISOString().slice(0, 10)} 00:00 UTC+7`;
  res.json({
    generate_exercises: { used: genUsed, limit: genLimit, remaining: Math.max(0, genLimit - genUsed) },
    skip_question: { used: skipUsed, limit: skipLimit, remaining: Math.max(0, skipLimit - skipUsed) },
    resetsAt,
  });
});

export default router;
