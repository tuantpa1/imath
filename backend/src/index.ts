import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/authMiddleware';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/authRoutes';
import dataRoutes from './routes/dataRoutes';
import uploadRoutes from './routes/uploadRoutes';
import teacherRoutes from './routes/teacherRoutes';
import parentRoutes from './routes/parentRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();
const PORT = 3001;

app.use(cors({ origin: true }));
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public auth routes — no token required
app.use('/auth', authRoutes);

// Protected API routes — valid JWT required
app.use('/api', authMiddleware, dataRoutes);
app.use('/api', authMiddleware, uploadRoutes);
app.use('/admin', authMiddleware, adminRoutes);
app.use('/teacher', authMiddleware, teacherRoutes);
app.use('/parent', authMiddleware, parentRoutes);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`iMath backend running on http://0.0.0.0:${PORT}`);
  console.log(`[AI] Active model: ${process.env.AI_MODEL || 'claude'}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process and try again.`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
