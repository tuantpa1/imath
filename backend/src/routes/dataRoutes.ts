import { Router, Request, Response } from 'express';
import {
  readScores, writeScores,
  readExercises, writeExercises,
  readRewards, writeRewards,
} from '../services/storageService';

const router = Router();

// --- Scores ---
router.get('/scores', (_req: Request, res: Response) => {
  try {
    res.json(readScores());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read scores' });
  }
});

router.post('/scores', (req: Request, res: Response) => {
  try {
    writeScores(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write scores' });
  }
});

// --- Exercises ---
router.get('/exercises', (_req: Request, res: Response) => {
  try {
    res.json(readExercises());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read exercises' });
  }
});

router.post('/exercises', (req: Request, res: Response) => {
  try {
    writeExercises(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write exercises' });
  }
});

// --- Session completion ---
router.patch('/sessions/:id/complete', (req: Request, res: Response) => {
  try {
    const exercises = readExercises();
    const session = exercises.sessions.find((s) => s.id === req.params.id);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    session.completed = true;
    writeExercises(exercises);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// --- Rewards ---
router.get('/rewards', (_req: Request, res: Response) => {
  try {
    res.json(readRewards());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read rewards' });
  }
});

router.post('/rewards', (req: Request, res: Response) => {
  try {
    writeRewards(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write rewards' });
  }
});

export default router;
