import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { generateExercises, generateSkip, ValidMime } from '../services/claudeService';
import { readExercises, writeExercises, Question } from '../services/storageService';

const router = Router();

const IMAGES_DIR = path.resolve(__dirname, '../../../data/images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  },
});

function fileToImageEntry(file: Express.Multer.File): { base64: string; mimeType: ValidMime } {
  const base64 = fs.readFileSync(file.path).toString('base64');
  return { base64, mimeType: file.mimetype as ValidMime };
}

const PROJECT_ROOT = path.resolve(__dirname, '../../../');

router.post('/generate-exercises', upload.array('images', 10), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No image files uploaded' });
    return;
  }

  const count = parseInt(String(req.body.count ?? '10'), 10) || 10;
  const images = files.map(fileToImageEntry);
  const imagePaths = files.map((f) =>
    path.relative(PROJECT_ROOT, f.path).replace(/\\/g, '/')
  );

  try {
    const questions = await generateExercises(images, count);

    const exercises = readExercises();
    const sessionIndex = exercises.sessions.length + 1;
    const sessionId = `session_${String(sessionIndex).padStart(3, '0')}`;
    const today = new Date().toISOString().split('T')[0];

    const newSession = {
      id: sessionId,
      createdAt: today,
      imagePaths,
      questions: questions.map((q, i): Question => {
        const common = {
          id: `${sessionId}_q${i + 1}`,
          question: q.question,
          difficulty: q.difficulty,
          unit: q.unit ?? '',
        };
        if (q.answers) {
          return { ...common, type: 'multi_answer', order_matters: q.order_matters ?? true, answers: q.answers };
        }
        return { ...common, type: q.type, answer: q.answer ?? 0 };
      }),
    };

    exercises.sessions.push(newSession);
    writeExercises(exercises);

    res.json({ ok: true, questions, session: newSession, imagePaths });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generateExercises error:', message);
    res.status(500).json({ error: 'Failed to generate exercises', detail: message });
  }
});

router.post('/generate-skip', async (req: Request, res: Response) => {
  const { originalQuestion, type, difficulty, isMultiAnswer, orderMatters, answersCount } =
    req.body as {
      originalQuestion?: string;
      type?: string;
      difficulty?: string;
      isMultiAnswer?: boolean;
      orderMatters?: boolean;
      answersCount?: number;
    };
  if (!originalQuestion || !type) {
    res.status(400).json({ error: 'originalQuestion and type are required' });
    return;
  }
  try {
    const question = await generateSkip(
      originalQuestion,
      type,
      difficulty ?? 'easy',
      isMultiAnswer ?? false,
      orderMatters ?? true,
      answersCount ?? 2
    );
    res.json({ ok: true, question });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generateSkip error:', message);
    res.status(500).json({ error: 'Failed to generate skip question', detail: message });
  }
});

router.post('/generate-extra', async (req: Request, res: Response) => {
  const { imagePaths, previousQuestions, count } = req.body as {
    imagePaths?: string[];
    previousQuestions?: string[];
    count?: number;
  };
  if (!imagePaths || imagePaths.length === 0) {
    res.status(400).json({ error: 'imagePaths required' });
    return;
  }
  try {
    const images = imagePaths.map((p) => {
      const fullPath = path.join(PROJECT_ROOT, p);
      const base64 = fs.readFileSync(fullPath).toString('base64');
      const ext = path.extname(p).toLowerCase();
      const mimeType: ValidMime =
        ext === '.png'
          ? 'image/png'
          : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
      return { base64, mimeType };
    });

    const numCount = parseInt(String(count ?? '10'), 10) || 10;
    const questions = await generateExercises(images, numCount, previousQuestions ?? []);

    const exercises = readExercises();
    const sessionIndex = exercises.sessions.length + 1;
    const sessionId = `session_${String(sessionIndex).padStart(3, '0')}`;
    const today = new Date().toISOString().split('T')[0];

    const newSession = {
      id: sessionId,
      createdAt: today,
      imagePaths,
      isExtra: true,
      questions: questions.map((q, i): Question => {
        const common = {
          id: `${sessionId}_q${i + 1}`,
          question: q.question,
          difficulty: q.difficulty,
          unit: q.unit ?? '',
        };
        if (q.answers) {
          return { ...common, type: 'multi_answer', order_matters: q.order_matters ?? true, answers: q.answers };
        }
        return { ...common, type: q.type, answer: q.answer ?? 0 };
      }),
    };

    exercises.sessions.push(newSession);
    writeExercises(exercises);

    res.json({ ok: true, session: newSession });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generateExtra error:', message);
    res.status(500).json({ error: 'Failed to generate extra exercises', detail: message });
  }
});

export default router;
