const fs = require('fs');
const path = require('path');

const STORE_FILE_PATH = path.join(__dirname, '..', 'storage', 'market_chat_sessions.json');
const MAX_SESSIONS = 150;
const MAX_TURNS_PER_SESSION = 40;
const MAX_CONTEXT_TURNS = 3;

const STOP_WORDS = new Set([
  'the', 'is', 'are', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'at', 'from',
  'tell', 'show', 'what', 'why', 'how', 'should', 'could', 'would', 'with', 'about', 'this',
  'that', 'today', 'week', 'now', 'my', 'me', 'it', 'be', 'as', 'by', 'i', 'you',
]);

function ensureStoreDir() {
  const dir = path.dirname(STORE_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore() {
  ensureStoreDir();

  if (!fs.existsSync(STORE_FILE_PATH)) {
    return { sessions: {} };
  }

  try {
    const raw = fs.readFileSync(STORE_FILE_PATH, 'utf8').trim();
    if (!raw) {
      return { sessions: {} };
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sessions !== 'object') {
      return { sessions: {} };
    }

    return parsed;
  } catch (_error) {
    return { sessions: {} };
  }
}

function writeStore(store) {
  ensureStoreDir();
  fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store, null, 2));
}

function generateSessionId() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `mc_${Date.now()}_${suffix}`;
}

function trimSessions(sessions) {
  const entries = Object.entries(sessions || {});
  if (entries.length <= MAX_SESSIONS) {
    return sessions;
  }

  const sortedByUpdated = entries
    .map(([id, session]) => ({ id, updatedAt: String(session?.updatedAt || '') }))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

  const toDelete = sortedByUpdated.slice(0, Math.max(0, entries.length - MAX_SESSIONS));
  const next = { ...sessions };
  toDelete.forEach((item) => {
    delete next[item.id];
  });

  return next;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textTokens(value) {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function relevanceScore(question, turn) {
  const questionTokens = new Set(textTokens(question));
  if (!questionTokens.size) {
    return 0;
  }

  const turnText = `${turn?.question || ''} ${Array.isArray(turn?.symbolsAnalyzed) ? turn.symbolsAnalyzed.join(' ') : ''}`;
  const turnTokens = new Set(textTokens(turnText));

  let overlap = 0;
  questionTokens.forEach((token) => {
    if (turnTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.max(1, questionTokens.size);
}

function summarizeOlderTurns(turns = []) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  if (!safeTurns.length) {
    return '';
  }

  const decisionCounts = { BUY: 0, HOLD: 0, SELL: 0 };
  const symbolSet = new Set();

  safeTurns.forEach((turn) => {
    const text = String(turn?.answer || '').toUpperCase();
    if (text.includes(' BUY')) decisionCounts.BUY += 1;
    else if (text.includes(' SELL')) decisionCounts.SELL += 1;
    else decisionCounts.HOLD += 1;

    (Array.isArray(turn?.symbolsAnalyzed) ? turn.symbolsAnalyzed : []).forEach((symbol) => {
      const normalized = String(symbol || '').toUpperCase().trim();
      if (normalized) {
        symbolSet.add(normalized);
      }
    });
  });

  const symbols = Array.from(symbolSet).slice(0, 5).join(', ') || 'none';
  return `Older context: decisions BUY ${decisionCounts.BUY}, HOLD ${decisionCounts.HOLD}, SELL ${decisionCounts.SELL}; symbols discussed: ${symbols}.`;
}

function buildSessionContext(session, currentQuestion = '') {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  if (!turns.length) {
    return {
      turns: [],
      summarizedHistory: '',
      pruned: false,
    };
  }

  const recentTurns = turns.slice(-2);
  const olderTurns = turns.slice(0, -2);
  const rankedOlder = olderTurns
    .map((turn, index) => ({ turn, index, score: relevanceScore(currentQuestion, turn) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 1)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.turn);

  const selected = [...rankedOlder, ...recentTurns]
    .slice(-MAX_CONTEXT_TURNS)
    .map((turn) => ({
      question: turn?.question || '',
      answer: turn?.answer || '',
      symbolsAnalyzed: Array.isArray(turn?.symbolsAnalyzed) ? turn.symbolsAnalyzed.slice(0, 4) : [],
      createdAt: turn?.createdAt || '',
    }));

  const selectedIds = new Set(selected.map((turn) => String(turn?.createdAt || '')));
  const summaryPool = turns.filter((turn) => !selectedIds.has(String(turn?.createdAt || '')));

  return {
    turns: selected,
    summarizedHistory: summarizeOlderTurns(summaryPool),
    pruned: turns.length > selected.length,
  };
}

function getSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) {
    return null;
  }

  const store = readStore();
  const session = store.sessions[id];
  if (!session) {
    return null;
  }

  return {
    id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    turns: Array.isArray(session.turns) ? session.turns : [],
  };
}

function getSessionContext(sessionId, currentQuestion = '') {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...buildSessionContext(session, currentQuestion),
  };
}

function upsertTurn(sessionId, turnPayload) {
  const now = new Date().toISOString();
  const id = String(sessionId || '').trim() || generateSessionId();
  const store = readStore();

  const existing = store.sessions[id] || {
    id,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };

  const turns = Array.isArray(existing.turns) ? existing.turns : [];
  const nextTurns = [...turns, { ...turnPayload, createdAt: now }].slice(-MAX_TURNS_PER_SESSION);

  const updated = {
    ...existing,
    id,
    updatedAt: now,
    turns: nextTurns,
  };

  const nextSessions = {
    ...store.sessions,
    [id]: updated,
  };

  store.sessions = trimSessions(nextSessions);
  writeStore(store);

  return {
    sessionId: id,
    session: updated,
  };
}

module.exports = {
  generateSessionId,
  getSession,
  getSessionContext,
  upsertTurn,
};
