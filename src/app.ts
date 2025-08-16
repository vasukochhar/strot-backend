import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import authRouter from './routes/auth';
import adminRoutes from './routes/adminRoutes';
import profileRoutes from './routes/profile';
import candidateRoutes from './routes/candidates';
import employerRoutes from './routes/employers';
import { authMiddleware } from './middleware/authMiddleware';

dotenv.config();

/* ------------------------- Env validation (URL or discrete) ------------------------- */
const hasDbUrl = !!process.env.DATABASE_URL;
const hasDiscrete =
  !!process.env.PGUSER &&
  !!process.env.PGPASSWORD &&
  !!process.env.PGHOST &&
  !!process.env.PGDATABASE;

if (!hasDbUrl && !hasDiscrete) {
  console.error('❌ No DB config. Provide DATABASE_URL or PGUSER/PGPASSWORD/PGHOST/PGDATABASE in .env');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined in .env');
  process.exit(1);
}

/* -------------------------------- App setup -------------------------------- */
const app = express();
const PORT = Number(process.env.PORT || 3000);

// Optional single canonical origin (handy for other parts of code)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// Build CORS allowlist from env; fallback to FRONTEND_ORIGIN for dev
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [FRONTEND_ORIGIN]
);

// If behind a proxy / load balancer, keep this on
app.set('trust proxy', 1);

/* -------------------------------- CORS ------------------------------------ */
app.use((_, res, next) => {
  res.setHeader('Vary', 'Origin'); // important when echoing A-C-A-O
  next();
});

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin, curl, mobile webviews
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

/* --------------------------- Security headers ----------------------------- */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

/* --------------------------- Parsers / static ----------------------------- */
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

/* -------------------------------- Health ---------------------------------- */
app.get('/api/health', (_req, res) => {
  res.send({ status: 'ok', message: 'Strot backend is live' });
});

/* -------------------------------- Routes ---------------------------------- */
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/employers', employerRoutes);

// Example protected route
app.get('/api/protected', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ message: 'Protected route access granted', user });
});

/* ----------------------------- 404 & Errors ------------------------------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  const payload = {
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  };
  res.status(status).json(payload);
});

/* --------------------------------- Start ---------------------------------- */
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`✅ CORS allowlist: ${allowedOrigins.join(', ')}`);
  if (FRONTEND_ORIGIN) console.log(`ℹ️ FRONTEND_ORIGIN: ${FRONTEND_ORIGIN}`);
});

export default app;
