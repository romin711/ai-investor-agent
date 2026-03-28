const fs = require('fs');
const path = require('path');

const STORE_FILE_PATH = path.join(__dirname, '..', 'storage', 'market_chat_sessions.json');
const MAX_SESSIONS = 150;
const MAX_TURNS_PER_SESSION = 40;

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
  upsertTurn,
};
