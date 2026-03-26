const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { analyzeSingleSymbol, analyzePortfolio, normalizePortfolioRows } = require('./engine/pipeline');

function loadEnvFile(fileName) {
  const envPath = path.join(__dirname, fileName);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFile('.env');
loadEnvFile('.env.example');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function withCorsHeaders(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, withCorsHeaders({ 'Content-Type': 'application/json' }));
  res.end(JSON.stringify(payload));
}

function normalizeSymbol(rawSymbol) {
  return decodeURIComponent(String(rawSymbol || '')).trim().toUpperCase();
}

function parseRawRowsText(input) {
  return String(input || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\s]+/).filter(Boolean);
      return {
        symbol: String(parts[0] || '').toUpperCase(),
        weight: Number(parts[1]),
      };
    });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawText = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    throw {
      statusCode: 400,
      message: 'Invalid JSON body.',
    };
  }
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && payload.portfolio) {
    if (Array.isArray(payload.portfolio)) {
      return payload.portfolio;
    }
    if (typeof payload.portfolio === 'object') {
      return Object.entries(payload.portfolio).map(([symbol, weight]) => ({ symbol, weight }));
    }
  }

  if (payload && typeof payload.rawInput === 'string') {
    return parseRawRowsText(payload.rawInput);
  }

  if (payload && typeof payload === 'object') {
    const looksLikeMap = Object.values(payload).every((value) => Number.isFinite(Number(value)));
    if (looksLikeMap) {
      return Object.entries(payload).map(([symbol, weight]) => ({ symbol, weight }));
    }
  }

  if (typeof payload === 'string') {
    return parseRawRowsText(payload);
  }

  throw {
    statusCode: 400,
    message: 'Portfolio payload must be array rows or rawInput text.',
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, withCorsHeaders());
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname || '/';

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'indian-investor-decision-engine' });
      return;
    }

    const stockRouteMatch = pathname.match(/^\/api\/stock\/([^/]+)$/);
    if (req.method === 'GET' && stockRouteMatch) {
      const symbol = normalizeSymbol(stockRouteMatch[1]);
      if (!symbol) {
        sendJson(res, 400, { error: 'Symbol is required.' });
        return;
      }

      const result = await analyzeSingleSymbol(symbol, {
        geminiApiKey: GEMINI_API_KEY,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/portfolio/analyze') {
      const payload = await readJsonBody(req);
      const rows = normalizePortfolioRows(rowsFromPayload(payload));
      const result = await analyzePortfolio(rows, {
        geminiApiKey: GEMINI_API_KEY,
      });
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'Route not found.' });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = error?.message || 'Unexpected backend error.';
    sendJson(res, statusCode, { error: message });
  }
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `Port ${PORT} is already in use on ${HOST}. Stop the existing process or set PORT to another value, for example PORT=3002.`
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Investor decision backend listening on http://${HOST}:${PORT}`);
});
