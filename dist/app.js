"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_1 = __importDefault(require("./routes/auth"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const profile_1 = __importDefault(require("./routes/profile"));
const candidates_1 = __importDefault(require("./routes/candidates"));
const employers_1 = __importDefault(require("./routes/employers"));
const authMiddleware_1 = require("./middleware/authMiddleware");
dotenv_1.default.config();
/* ------------------------- Env validation (URL or discrete) ------------------------- */
const hasDbUrl = !!process.env.DATABASE_URL;
const hasDiscrete = !!process.env.PGUSER &&
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
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 3000);
// Optional single canonical origin (handy for other parts of code)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
// Build CORS allowlist from env; fallback to FRONTEND_ORIGIN for dev
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [FRONTEND_ORIGIN]);
// If behind a proxy / load balancer (Nginx/IONOS), keep this on
app.set('trust proxy', 1);
/* -------------------------------- CORS ------------------------------------ */
app.use((_, res, next) => {
    // Important for caches when echoing Access-Control-Allow-Origin
    res.setHeader('Vary', 'Origin');
    next();
});
const corsOptions = {
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true); // same-origin, curl, mobile webviews
        if (allowedOrigins.includes(origin))
            return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    optionsSuccessStatus: 204,
};
app.use((0, cors_1.default)(corsOptions));
// NOTE: do NOT add app.options('*', ...) to avoid path-to-regexp quirks
/* --------------------------- Security headers ----------------------------- */
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
/* --------------------------- Parsers / static ----------------------------- */
app.use(express_1.default.json({ limit: '1mb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
/* -------------------------------- Health ---------------------------------- */
app.get('/api/health', (_req, res) => {
    res.send({ status: 'ok', message: 'Strot backend is live' });
});
/* -------------------------------- Routes ---------------------------------- */
app.use('/api/auth', auth_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/api/profile', profile_1.default);
app.use('/api/candidates', candidates_1.default);
app.use('/api/employers', employers_1.default);
// Example protected route
app.get('/api/protected', authMiddleware_1.authMiddleware, (req, res) => {
    const user = req.user;
    res.json({ message: 'Protected route access granted', user });
});
/* ----------------------------- 404 & Errors ------------------------------- */
// App-level 404 (no wildcard path—safe with path-to-regexp)
app.use((req, res, _next) => {
    res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});
app.use((err, _req, res, _next) => {
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
    if (FRONTEND_ORIGIN)
        console.log(`ℹ️ FRONTEND_ORIGIN: ${FRONTEND_ORIGIN}`);
});
exports.default = app;
