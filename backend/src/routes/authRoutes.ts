import crypto from 'crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../database/db';
import {
  hashPassword,
  comparePassword,
  generateToken,
} from '../services/authService';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import type { AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const user = db
    .prepare(
      'SELECT id, username, password_hash, role, display_name, is_active FROM users WHERE username = ?'
    )
    .get(username) as {
    id: number;
    username: string;
    password_hash: string;
    role: string;
    display_name: string;
    is_active: number;
  } | undefined;

  if (!user) {
    res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'Tài khoản đã bị vô hiệu hoá' });
    return;
  }

  // Support transparent upgrade from legacy SHA-256 hashes to bcrypt
  let passwordMatch = false;
  if (user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$')) {
    passwordMatch = await comparePassword(password, user.password_hash);
  } else {
    // Legacy SHA-256 hash (seeded before bcrypt was introduced)
    const sha256 = crypto.createHash('sha256').update(password).digest('hex');
    passwordMatch = sha256 === user.password_hash;
    if (passwordMatch) {
      // Upgrade hash in place
      const newHash = await hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        newHash,
        user.id
      );
    }
  }

  if (!passwordMatch) {
    res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    return;
  }

  const token = generateToken(user.id, user.role);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name,
    },
  });
});

// ── POST /auth/register (teacher only) ───────────────────────────────────────
router.post(
  '/register',
  authMiddleware,
  requireRole('teacher'),
  async (req: Request, res: Response) => {
    const { username, password, role, display_name, parentUsername } =
      req.body as {
        username?: string;
        password?: string;
        role?: string;
        display_name?: string;
        parentUsername?: string;
      };

    if (!username || !password || !role || !display_name) {
      res
        .status(400)
        .json({ error: 'username, password, role, display_name are required' });
      return;
    }

    if (!['teacher', 'parent', 'student'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    try {
      const hash = await hashPassword(password);
      const result = db
        .prepare(
          'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
        )
        .run(username, hash, role, display_name);

      const newUserId = Number(result.lastInsertRowid);

      if (role === 'student' && parentUsername) {
        const parent = db
          .prepare("SELECT id FROM users WHERE username = ? AND role = 'parent'")
          .get(parentUsername) as { id: number } | undefined;
        if (parent) {
          db.prepare(
            'INSERT OR IGNORE INTO family_links (parent_id, student_id) VALUES (?, ?)'
          ).run(parent.id, newUserId);
        }
      }

      res.status(201).json({
        user: { id: newUserId, username, role, display_name },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
      } else {
        res.status(500).json({ error: 'Failed to create user' });
      }
    }
  }
);

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const user = db
    .prepare(
      'SELECT id, username, role, display_name FROM users WHERE id = ?'
    )
    .get(userId) as {
    id: number;
    username: string;
    role: string;
    display_name: string;
  } | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', (_req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
