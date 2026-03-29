import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import type { AuthRequest } from './authMiddleware';

const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'access.log');

// Ensure logs directory exists at startup
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Logs every request after the response is sent, so that JWT-authenticated
 * user info (set by authMiddleware) is available in the log entry.
 *
 * Format: [2026-03-11 14:52] GET /api/scores userId=2 role=student 200
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const authReq = req as Partial<AuthRequest>;
    const userId = authReq.user?.userId ?? '-';
    const role = authReq.user?.role ?? '-';
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const entry = `[${ts}] ${req.method} ${req.path} userId=${userId} role=${role} ${res.statusCode}\n`;

    fs.appendFile(LOG_FILE, entry, () => {});

    if (process.env.NODE_ENV !== 'production') {
      process.stdout.write(entry);
    }
  });
  next();
}
