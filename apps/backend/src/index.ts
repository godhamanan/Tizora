import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { toNodeHandler } from 'better-auth/node';
import { testConnection } from './db.js';
import { runMigrations } from './runMigrations.js';
import { auth } from './auth.js';
import { requireAuth } from './middleware/requireAuth.js';
import clothesRouter    from './routes/clothes.js';
import scanRouter       from './routes/scan.js';
import scanBatchRouter  from './routes/scanBatch.js';
import suggestRouter    from './routes/suggest.js';
import profileRouter    from './routes/profile.js';
import catalogRouter    from './routes/catalog.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 7777;

// ── CORS — credentials required for session cookies ────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));

// ── Auth handler (before body parser — Better Auth parses its own body) ────
app.all('/auth/*', toNodeHandler(auth));

// ── Body parser ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'tizora',
    google_api_key: process.env.GOOGLE_API_KEY ? '✅ set' : '❌ missing',
  });
});

// ── Protected API routes ───────────────────────────────────────────────────
app.use('/clothes',    requireAuth, clothesRouter);
app.use('/scan/batch', requireAuth, scanBatchRouter);  // more specific first
app.use('/scan',       requireAuth, scanRouter);
app.use('/suggest',    requireAuth, suggestRouter);
app.use('/profile',    requireAuth, profileRouter);
app.use('/catalog',    requireAuth, catalogRouter);

// ── Start ──────────────────────────────────────────────────────────────────
async function startServer() {
  const connected = await testConnection();
  if (!connected) {
    console.error('⚠️  Cannot reach database — skipping migrations');
  } else {
    await runMigrations();
  }
  app.listen(PORT, () => {
    console.log(`🚀 Tizora backend running on http://localhost:${PORT}`);
  });
}

startServer();
