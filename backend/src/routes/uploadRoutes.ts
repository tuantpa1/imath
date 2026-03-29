import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { generateExercises, generateSkip, ValidMime } from '../services/claudeService';
import { createSession } from '../services/storageServiceSQLite';
import type { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentId } from '../middleware/resolveStudent';
import { checkAndIncrement, RateLimitError } from '../services/rateLimitService';
import { getGroupParentId, checkQuota, deductTokens } from '../services/tokenQuotaService';

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
  const authReq = req as AuthRequest;

  if (authReq.user.role === 'student') {
    res.status(403).json({ error: 'Forbidden: students cannot generate exercises' });
    return;
  }

  const parentId = getGroupParentId(authReq.user.userId, authReq.user.role);
  if (!checkQuota(parentId)) {
    res.status(402).json({ error: 'Hết hạn mức token. Liên hệ giáo viên để nạp thêm.' });
    return;
  }

  const limit = authReq.user.role === 'teacher' ? 20 : 10;
  try {
    checkAndIncrement(authReq.user.userId, 'generate_exercises', limit);
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({
        error: 'Đã đạt giới hạn tạo bài tập hôm nay',
        limit: err.limit,
        used: err.used,
        resetsAt: '00:00 ngày mai (UTC+7)',
      });
      return;
    }
    throw err;
  }

  const studentId = resolveStudentId(authReq, res);
  if (studentId === null) return;

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
    const { questions: rawQuestions, usage } = await generateExercises(images, count);
    deductTokens(authReq.user.userId, parentId, 'generate_exercises', usage);
    const session = createSession(studentId, authReq.user.userId, imagePaths, rawQuestions, false);
    res.json({ ok: true, questions: rawQuestions, session, imagePaths });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generateExercises error:', message);
    res.status(500).json({ error: 'Failed to generate exercises', detail: message });
  }
});

router.post('/generate-skip', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;

  const parentId = getGroupParentId(authReq.user.userId, authReq.user.role);
  if (!checkQuota(parentId)) {
    res.status(402).json({ error: 'Hết hạn mức token. Liên hệ giáo viên để nạp thêm.' });
    return;
  }

  if (authReq.user.role === 'student') {
    try {
      checkAndIncrement(authReq.user.userId, 'skip_question', 20);
    } catch (err) {
      if (err instanceof RateLimitError) {
        res.status(429).json({
          error: 'Đã đạt giới hạn đổi câu hỏi hôm nay',
          resetsAt: '00:00 ngày mai (UTC+7)',
        });
        return;
      }
      throw err;
    }
  }

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
    const { question, usage } = await generateSkip(
      originalQuestion,
      type,
      difficulty ?? 'easy',
      isMultiAnswer ?? false,
      orderMatters ?? true,
      answersCount ?? 2
    );
    deductTokens(authReq.user.userId, parentId, 'generate_skip', usage);
    res.json({ ok: true, question });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generateSkip error:', message);
    res.status(500).json({ error: 'Failed to generate skip question', detail: message });
  }
});

router.post('/generate-extra', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;

  const parentId = getGroupParentId(authReq.user.userId, authReq.user.role);
  if (!checkQuota(parentId)) {
    res.status(402).json({ error: 'Hết hạn mức token. Liên hệ giáo viên để nạp thêm.' });
    return;
  }

  const studentId = resolveStudentId(authReq, res);
  if (studentId === null) return;

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
        ext === '.png' ? 'image/png'
        : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
        : 'image/jpeg';
      return { base64, mimeType };
    });

    const numCount = parseInt(String(count ?? '10'), 10) || 10;
    const { questions: rawQuestions, usage } = await generateExercises(images, numCount, previousQuestions ?? []);
    deductTokens(authReq.user.userId, parentId, 'generate_extra', usage);
    const session = createSession(studentId, authReq.user.userId, imagePaths, rawQuestions, true);
    res.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generateExtra error:', message);
    res.status(500).json({ error: 'Failed to generate extra exercises', detail: message });
  }
});

export default router;
