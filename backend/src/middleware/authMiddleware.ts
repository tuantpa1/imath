import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService';
import type { TokenPayload } from '../services/authService';

export interface AuthRequest extends Request {
  user: TokenPayload;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: token required' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    (req as AuthRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
  }
}
