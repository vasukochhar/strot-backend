import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import authRouter from './routes/auth';
import adminRoutes from './routes/adminRoutes';
import profileRoutes from './routes/profile';

dotenv.config();

// Validate environment variables
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in .env');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.get('/api/health', (_req, res) => {
  res.send({ status: 'ok', message: 'Strot backend is live' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
console.log('Mounted /api/profile routes'); // ✅ added

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
