import 'dotenv/config';
import path from 'path';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import contactsRouter from './routes/contacts';
import sendTelegramRouter from './routes/sendTelegram';
import siteSettingsRouter from './routes/siteSettings';
import publicRouter from './routes/public';
import adminRouter from './routes/admin';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Honour X-Forwarded-* headers (needed for correct client IPs behind a proxy).
app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Minimal security headers (no extra dependency). The frontend sets a full CSP.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  if (isProduction) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }
  next();
});

// Bound request bodies to mitigate abuse.
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Static serving for uploaded files (long-lived cache, read-only).
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'public', 'uploads'), {
    maxAge: '7d',
    index: false,
    dotfiles: 'ignore',
  })
);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// API routes
app.use('/api/contacts', contactsRouter);
app.use('/api/send-telegram', sendTelegramRouter);
app.use('/api/site-settings', siteSettingsRouter);
app.use('/api', publicRouter); // public: GET /api/cranes, POST /api/track
app.use('/api/admin', adminRouter);

// 404 fallback for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler — never leak stack traces to clients.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Backend API listening on http://localhost:${PORT}`);
});

// Graceful shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => process.exit(0));
  });
}
