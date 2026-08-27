const fs = require('fs');
const https = require('https');
const path = require('path');
// resolved relative to this file, not process.cwd() — PM2 launches this with this folder as cwd,
// but the default dotenv lookup would silently miss server/.env if that ever changes.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { generateInsights, answerQuestion } = require('./openaiClient');
const { getBudget, getBudgetHistory, getTransactions } = require('./riseupClient');
const { streamChatAnswer } = require('./chatClient');

const app = express();

// Restricted to known origins — a bare cors() would let any site on the internet relay OpenAI/
// RiseUp/Anthropic calls through here using whichever caller's own credentials it can grab.
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://shilmanlior2608.ddns.net:35000,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      // no Origin header (curl, server-to-server, same-origin) — allow.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed`));
    },
  }),
);
app.use(express.json({ limit: '2mb' }));

// Confirms the process is up — doesn't need any key/PAT at all, so a connection-status check
// (polled from FinanceVisual's own panels) doesn't burn a real upstream request.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// --- AI insights (OpenAI) ---
// Every caller brings their own OpenAI key — this server never holds one of its own; there's no
// "default account" concept for AI insights the way RiseUp has its own single-account fallback
// below. No header means no key, full stop.
function extractBearer(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match ? match[1] : null;
}

app.post('/api/insights', async (req, res) => {
  const apiKey = extractBearer(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing OpenAI API key — pass Authorization: Bearer <key>' });
  }
  const { summary } = req.body || {};
  if (!summary || typeof summary !== 'object') {
    return res.status(400).json({ error: 'summary object is required' });
  }
  try {
    const insights = await generateInsights(apiKey, summary);
    res.json({ insights });
  } catch (err) {
    console.error('POST /api/insights failed:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/ask', async (req, res) => {
  const apiKey = extractBearer(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing OpenAI API key — pass Authorization: Bearer <key>' });
  }
  const { summary, question } = req.body || {};
  if (!summary || typeof summary !== 'object') {
    console.error('POST /api/ask rejected — bad summary. req.body was:', req.body);
    return res.status(400).json({ error: 'summary object is required' });
  }
  if (typeof question !== 'string' || !question.trim()) {
    console.error('POST /api/ask rejected — bad question. req.body was:', req.body);
    return res.status(400).json({ error: 'question is required' });
  }
  try {
    const answer = await answerQuestion(apiKey, summary, question.trim());
    res.json({ answer });
  } catch (err) {
    console.error('POST /api/ask failed:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- RiseUp proxy (migrated from the old, standalone RiseUp/server project) ---
// Multi-tenant: the PAT is per-caller, not baked into this server. FinanceVisual sends each
// account's own token as a bearer header; RiseUp/client (this project's own local dashboard)
// never sends one, so it transparently falls back to this server's own RISEUP_PAT — the
// single-account setup that project shipped with originally, unchanged.
function extractPat(req) {
  return extractBearer(req) || process.env.RISEUP_PAT || null;
}

function requirePat(req, res) {
  const pat = extractPat(req);
  if (!pat) {
    res.status(401).json({ error: 'Missing RiseUp PAT — pass Authorization: Bearer <token>, or set RISEUP_PAT' });
    return null;
  }
  return pat;
}

app.get('/api/budget/:date?', async (req, res) => {
  const pat = requirePat(req, res);
  if (!pat) return;
  try {
    const data = await getBudget(pat, req.params.date);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/budget/:date/:months', async (req, res) => {
  const pat = requirePat(req, res);
  if (!pat) return;
  const { date, months } = req.params;
  const numMonthsBack = Number(months);
  if (!/^\d{4}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM format for history queries' });
  }
  if (!Number.isInteger(numMonthsBack) || numMonthsBack < 0 || numMonthsBack > 12) {
    return res.status(400).json({ error: 'months must be an integer between 0 and 12' });
  }
  try {
    const data = await getBudgetHistory(pat, date, numMonthsBack);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  const pat = requirePat(req, res);
  if (!pat) return;
  const { cashflowMonth, transactionDate, businessName } = req.query;
  if (!cashflowMonth && !transactionDate) {
    return res.status(400).json({ error: 'cashflowMonth or transactionDate is required' });
  }
  try {
    const data = await getTransactions(pat, { cashflowMonth, transactionDate, businessName });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- RiseUp/client's own chat feature (migrated unchanged, Anthropic-backed) ---
app.post('/api/chat', async (req, res) => {
  const { month, context, messages } = req.body || {};
  if (!month || !context || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'month, context, and a non-empty messages array are required' });
  }

  try {
    const stream = await streamChatAnswer({ month, context, messages });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(event.delta.text);
      }
    }
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.end();
    } else {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
});

const port = process.env.PORT || 36600;
const certPath = path.join(__dirname, '..', 'certs', 'cert.pem');
const keyPath = path.join(__dirname, '..', 'certs', 'key.pem');

// HTTPS whenever a cert is present — FinanceVisual's production site is served over HTTPS, and a
// browser refuses to fetch() an http:// API from an https:// page (mixed content). The same
// domain's existing certificate (see the old RiseUp/server/certs) works here too.
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const options = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  https.createServer(options, app).listen(port, () => console.log(`FinanceVisual server listening on https://localhost:${port}`));
} else {
  console.warn('No cert/key found in server/certs — falling back to plain HTTP (local dev only).');
  app.listen(port, () => console.log(`FinanceVisual server listening on http://localhost:${port}`));
}
