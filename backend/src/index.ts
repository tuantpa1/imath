import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { authMiddleware } from './middleware/authMiddleware';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/authRoutes';
import dataRoutes from './routes/dataRoutes';
import uploadRoutes from './routes/uploadRoutes';
import teacherRoutes from './routes/teacherRoutes';
import parentRoutes from './routes/parentRoutes';
import adminRoutes from './routes/adminRoutes';
import ireadRoutes from './routes/ireadRoutes';

const app = express();
const PORT = 3001;

app.use(cors({ origin: true }));
app.use(express.json());
app.use(requestLogger);

// Serve uploaded iRead images
app.use('/uploads/iread', express.static(path.resolve(__dirname, '../../data/uploads/iread')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public auth routes — no token required
app.use('/auth', authRoutes);

// Protected API routes — valid JWT required
app.use('/api', authMiddleware, dataRoutes);
app.use('/api', authMiddleware, uploadRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/teacher', authMiddleware, teacherRoutes);
app.use('/api/parent', authMiddleware, parentRoutes);
app.use('/api/iread', authMiddleware, ireadRoutes);

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
