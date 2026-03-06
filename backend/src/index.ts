import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dataRoutes from './routes/dataRoutes';
import uploadRoutes from './routes/uploadRoutes';

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', dataRoutes);
app.use('/api', uploadRoutes);

const server = app.listen(PORT, () => {
  console.log(`iMath backend running on http://localhost:${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process and try again.`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
