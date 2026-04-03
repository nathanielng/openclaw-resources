'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const COMPOSE_FILE = process.env.COMPOSE_FILE || '/workspace/docker-compose.yml';
const COMPOSE_PROJECT_DIR = path.dirname(COMPOSE_FILE);
const DATA_DIR = process.env.DATA_DIR || '/data';
const MC_DATA = path.join(DATA_DIR, '.mission-control');
const PORT = process.env.PORT || 4000;

fs.mkdirSync(MC_DATA, { recursive: true });

const INSTANCES = [
  { id: 1, name: 'openclaw-1', internalPort: 18789, hostPort: 18789, label: 'Research', color: '#4f9cf9' },
  { id: 2, name: 'openclaw-2', internalPort: 18789, hostPort: 18790, label: 'Coding',   color: '#a78bfa' },
  { id: 3, name: 'openclaw-3', internalPort: 18789, hostPort: 18791, label: 'Comms',    color: '#34d399', profile: 'three' },
  { id: 4, name: 'openclaw-4', internalPort: 18789, hostPort: 18792, label: 'Ops',      color: '#fb923c', profile: 'four' },
];

// ── Health state ───────────────────────────────────────────────────────────

const healthState = {};
INSTANCES.forEach(inst => {
  healthState[inst.id] = { status: 'unknown', lastCheck: null, data: {} };
});

async function pollHealth(inst) {
  try {
    const url = `http://${inst.name}:${inst.internalPort}/healthz`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json().catch(() => ({}));
    healthState[inst.id] = {
      status: res.ok ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      statusCode: res.status,
      data,
    };
  } catch (e) {
    healthState[inst.id] = {
      status: 'unreachable',
      lastCheck: new Date().toISOString(),
      error: e.message,
      data: {},
    };
  }
}

function startHealthPolling() {
  INSTANCES.forEach(inst => {
    pollHealth(inst);
    setInterval(() => pollHealth(inst), 10000);
  });
  setInterval(() => broadcast({ type: 'health', payload: healthState }), 5000);
}

// ── Cost / token tracking ──────────────────────────────────────────────────
// Scraped from docker logs; accumulates in memory and persisted to disk.

const COST_FILE = path.join(MC_DATA, 'cost.json');

function loadCost() {
  try { return JSON.parse(fs.readFileSync(COST_FILE, 'utf8')); } catch { return {}; }
}

function saveCost(data) {
  fs.writeFileSync(COST_FILE, JSON.stringify(data, null, 2));
}

const costState = loadCost();

// Rough per-token cost lookup ($ per 1k tokens, input+output blended estimate)
const MODEL_COSTS = {
  'claude-opus':   0.02,
  'claude-sonnet': 0.005,
  'claude-haiku':  0.0004,
  'gpt-4o':        0.006,
  'default':       0.005,
};

function estimateCost(model, tokens) {
  const key = Object.keys(MODEL_COSTS).find(k => (model || '').toLowerCase().includes(k)) || 'default';
  return (tokens / 1000) * MODEL_COSTS[key];
}

function recordTokens(instanceId, model, tokens) {
  const today = new Date().toISOString().slice(0, 10);
  if (!costState[instanceId]) costState[instanceId] = { total: 0, daily: {}, model: model || 'unknown' };
  if (!costState[instanceId].daily[today]) costState[instanceId].daily[today] = 0;
  const cost = estimateCost(model, tokens);
  costState[instanceId].total += cost;
  costState[instanceId].daily[today] += cost;
  costState[instanceId].model = model || costState[instanceId].model;
  saveCost(costState);
  broadcast({ type: 'cost_update', payload: costState });
}

// Token patterns in OpenClaw logs (best-effort)
const TOKEN_RE = /tokens?[:\s]+(\d+)/i;
const MODEL_RE = /model[:\s]+([a-z0-9/_-]+)/i;

// ── WebSocket ──────────────────────────────────────────────────────────────

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'health', payload: healthState }));
  ws.send(JSON.stringify({ type: 'cost_update', payload: costState }));
  ws.send(JSON.stringify({ type: 'pairings', payload: pendingPairings }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'subscribe_logs') {
        ensureLogStream(msg.instanceId);
        const stream = logStreams.get(msg.instanceId);
        if (stream) stream.clients.add(ws);
      }
      if (msg.type === 'unsubscribe_logs') {
        const stream = logStreams.get(msg.instanceId);
        if (stream) stream.clients.delete(ws);
      }
    } catch {}
  });

  ws.on('close', () => {
    clients.delete(ws);
    logStreams.forEach(s => s.clients.delete(ws));
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(data); });
}

// ── Log streaming ──────────────────────────────────────────────────────────

const logStreams = new Map();

// Patterns for extracting pairing codes from OpenClaw logs
const PAIRING_RE = /pairing code[:\s]+([A-Z0-9]{6,10})/i;

function ensureLogStream(instanceId) {
  if (logStreams.has(instanceId)) return;
  const inst = INSTANCES.find(i => i.id === instanceId);
  if (!inst) return;

  const proc = spawn('docker', ['logs', '--follow', '--tail', '200', inst.name], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const entry = { proc, clients: new Set() };
  logStreams.set(instanceId, entry);

  const onLine = (line) => {
    const ts = new Date().toISOString();
    const msgStr = JSON.stringify({ type: 'log', instanceId, line, ts });
    entry.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msgStr); });

    // Pairing code detection
    const pm = line.match(PAIRING_RE);
    if (pm) {
      const code = pm[1];
      if (!pendingPairings.find(p => p.code === code)) {
        pendingPairings.push({ code, instanceId, ts });
        broadcast({ type: 'pairings', payload: pendingPairings });
      }
    }

    // Token scraping
    const tm = line.match(TOKEN_RE);
    const mm = line.match(MODEL_RE);
    if (tm) {
      const model = mm ? mm[1] : null;
      recordTokens(instanceId, model, parseInt(tm[1], 10));
    }
  };

  const buf = { stdout: '', stderr: '' };
  const handleChunk = (key) => (chunk) => {
    buf[key] += chunk.toString();
    let nl;
    while ((nl = buf[key].indexOf('\n')) !== -1) {
      onLine(buf[key].slice(0, nl));
      buf[key] = buf[key].slice(nl + 1);
    }
  };
  proc.stdout.on('data', handleChunk('stdout'));
  proc.stderr.on('data', handleChunk('stderr'));
  proc.on('exit', () => logStreams.delete(instanceId));
}

// ── Kanban ─────────────────────────────────────────────────────────────────

const KANBAN_FILE = path.join(MC_DATA, 'kanban.json');

function loadKanban() {
  try { return JSON.parse(fs.readFileSync(KANBAN_FILE, 'utf8')); }
  catch { return { items: [] }; }
}

function saveKanban(data) {
  fs.writeFileSync(KANBAN_FILE, JSON.stringify(data, null, 2));
}

// ── Pairing codes ──────────────────────────────────────────────────────────

const pendingPairings = [];

// ── Config helpers ─────────────────────────────────────────────────────────

function readEnvFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function mergeEnvFile(filePath, vars) {
  const existing = readEnvFile(filePath);
  const map = new Map();
  const comments = [];

  existing.split('\n').forEach(line => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (m) {
      map.set(m[1], m[2]);
    } else {
      comments.push(line);
    }
  });

  Object.entries(vars).forEach(([k, v]) => {
    if (v !== undefined && v !== '') map.set(k, v);
  });

  const kvLines = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`);
  const content = [...comments.filter(l => l.trim()), ...kvLines].join('\n') + '\n';

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

// ── Docker Compose helpers ─────────────────────────────────────────────────

function getProfiles(count) {
  const profiles = [];
  if (count >= 3) profiles.push('three');
  if (count >= 4) profiles.push('four');
  return profiles;
}

// Returns the container's State.Status ('running', 'exited', …) or null if it doesn't exist.
function getContainerStatus(name) {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['inspect', '--format', '{{.State.Status}}', name]);
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('exit', code => resolve(code === 0 ? out.trim() : null));
    proc.on('error', () => resolve(null));
  });
}

function runCompose(args, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const proc = spawn('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    cwd: COMPOSE_PROJECT_DIR,
    env: { ...process.env },
  });

  proc.stdout.on('data', d => res.write(d));
  proc.stderr.on('data', d => res.write(d));
  proc.on('exit', code => { res.write(`\n[exit ${code}]\n`); res.end(); });
  proc.on('error', e => { res.write(`[error: ${e.message}]\n`); res.end(); });
}

// ── API Routes ─────────────────────────────────────────────────────────────

// Instances + health
app.get('/api/instances', (_req, res) => {
  res.json(INSTANCES.map(inst => ({ ...inst, health: healthState[inst.id] })));
});

// Compose up
app.post('/api/compose/up', (req, res) => {
  const count = Math.min(4, Math.max(2, parseInt(req.body.count) || 2));
  const profiles = getProfiles(count);
  const profileArgs = profiles.flatMap(p => ['--profile', p]);
  // --no-recreate: skip containers that are already running instead of conflicting on their names
  runCompose([...profileArgs, 'up', '-d', '--no-recreate'], res);
});

// Start a single instance
app.post('/api/compose/up/:id', async (req, res) => {
  const inst = INSTANCES.find(i => i.id === parseInt(req.params.id));
  if (!inst) return res.status(404).end('Unknown instance');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Check if the container is already running to avoid a name-conflict error.
  const status = await getContainerStatus(inst.name);
  if (status === 'running') {
    res.write(`Container ${inst.name} is already running — nothing to do.\n`);
    res.write('\n[exit 0]\n');
    return res.end();
  }

  // For profile-gated instances (3 & 4) the data directory must already exist on
  // the host.  When compose runs inside mission-control it resolves "./data/instance-N"
  // relative to the compose file as "/workspace/data/instance-N", and Docker mounts
  // that path from the HOST — so if the directory is absent you get a "mounts denied"
  // or "path not found" error.  Detect this early and surface a clear message.
  if (inst.profile) {
    const dataDir = path.join(DATA_DIR, `instance-${inst.id}`);
    if (!fs.existsSync(dataDir)) {
      res.write(`Error: data directory for instance-${inst.id} not found at ${dataDir}.\n`);
      res.write(`Please create ./data/instance-${inst.id}/ on the host (and add a .env file)\n`);
      res.write(`before starting this container.\n`);
      res.write('\n[exit 1]\n');
      return res.end();
    }
  }

  const profileArgs = inst.profile ? ['--profile', inst.profile] : [];
  // --no-recreate: if the container exists but is stopped, start it; never conflict on an existing name
  const proc = spawn('docker', ['compose', '-f', COMPOSE_FILE, ...profileArgs, 'up', '-d', '--no-recreate', inst.name], {
    cwd: COMPOSE_PROJECT_DIR,
    env: { ...process.env },
  });

  proc.stdout.on('data', d => res.write(d));
  proc.stderr.on('data', d => res.write(d));
  proc.on('exit', code => { res.write(`\n[exit ${code}]\n`); res.end(); });
  proc.on('error', e => { res.write(`[error: ${e.message}]\n`); res.end(); });
});

// Stop a single instance
app.post('/api/compose/stop/:id', (req, res) => {
  const inst = INSTANCES.find(i => i.id === parseInt(req.params.id));
  if (!inst) return res.status(404).end('Unknown instance');
  runCompose(['stop', inst.name], res);
});

// Compose down
app.post('/api/compose/down', (_req, res) => {
  runCompose(['--profile', 'three', '--profile', 'four', 'down'], res);
});

// Compose pull
app.post('/api/compose/pull', (_req, res) => {
  runCompose(['pull'], res);
});

// Save API keys
app.post('/api/config/keys', (req, res) => {
  const { anthropicKey, gatewayToken, openaiKey, telegramTokens, instances } = req.body;
  const targets = (instances && instances.length) ? instances : [1, 2, 3, 4];

  targets.forEach(id => {
    const envPath = path.join(DATA_DIR, `instance-${id}`, '.env');
    const vars = {};
    if (anthropicKey) vars.ANTHROPIC_API_KEY = anthropicKey;
    if (gatewayToken) vars.OPENCLAW_GATEWAY_TOKEN = gatewayToken;
    if (openaiKey)    vars.OPENAI_API_KEY = openaiKey;
    mergeEnvFile(envPath, vars);
  });

  // Telegram tokens are per-instance — each bot can only connect to one instance
  if (telegramTokens && typeof telegramTokens === 'object') {
    Object.entries(telegramTokens).forEach(([id, token]) => {
      if (!token) return;
      const envPath = path.join(DATA_DIR, `instance-${id}`, '.env');
      mergeEnvFile(envPath, { TELEGRAM_BOT_TOKEN: token });
    });
  }

  res.json({ ok: true, updated: targets });
});

// Read config (masked values)
app.get('/api/config/keys', (_req, res) => {
  const result = INSTANCES.map(inst => {
    const envPath = path.join(DATA_DIR, `instance-${inst.id}`, '.env');
    const content = readEnvFile(envPath);
    const vars = {};
    content.split('\n').forEach(line => {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
      if (m) {
        const v = m[2];
        vars[m[1]] = v.length > 8 ? `${v.slice(0, 4)}${'*'.repeat(Math.max(4, v.length - 8))}${v.slice(-4)}` : '****';
      }
    });
    return { instanceId: inst.id, vars };
  });
  res.json(result);
});

// Kanban CRUD
app.get('/api/kanban', (_req, res) => res.json(loadKanban()));

app.post('/api/kanban/items', (req, res) => {
  const board = loadKanban();
  const item = {
    id: crypto.randomUUID(),
    column: req.body.column || 'backlog',
    title: req.body.title || 'Untitled task',
    assignee: req.body.assignee || null,
    priority: req.body.priority || 'medium',
    createdAt: new Date().toISOString(),
  };
  board.items.push(item);
  saveKanban(board);
  broadcast({ type: 'kanban_update', payload: board });
  res.json(item);
});

app.patch('/api/kanban/items/:id', (req, res) => {
  const board = loadKanban();
  const item = board.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  Object.assign(item, req.body);
  saveKanban(board);
  broadcast({ type: 'kanban_update', payload: board });
  res.json(item);
});

app.delete('/api/kanban/items/:id', (req, res) => {
  const board = loadKanban();
  board.items = board.items.filter(i => i.id !== req.params.id);
  saveKanban(board);
  broadcast({ type: 'kanban_update', payload: board });
  res.json({ ok: true });
});

// Manual health poll — trigger an immediate check and broadcast the result
app.post('/api/health/poll', async (_req, res) => {
  await Promise.all(INSTANCES.map(inst => pollHealth(inst)));
  broadcast({ type: 'health', payload: healthState });
  res.json({ ok: true, health: healthState });
});

app.post('/api/health/poll/:id', async (req, res) => {
  const inst = INSTANCES.find(i => i.id === parseInt(req.params.id));
  if (!inst) return res.status(404).json({ error: 'Unknown instance' });
  await pollHealth(inst);
  broadcast({ type: 'health', payload: healthState });
  res.json({ ok: true, health: healthState[inst.id] });
});

// Cost state
app.get('/api/cost', (_req, res) => res.json(costState));

// Pairings
app.get('/api/pairings', (_req, res) => res.json(pendingPairings));

app.delete('/api/pairings/:code', (req, res) => {
  const idx = pendingPairings.findIndex(p => p.code === req.params.code);
  if (idx !== -1) pendingPairings.splice(idx, 1);
  broadcast({ type: 'pairings', payload: pendingPairings });
  res.json({ ok: true });
});

// ── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw Mission Control → http://0.0.0.0:${PORT}`);
  console.log(`Compose file: ${COMPOSE_FILE}`);
  console.log(`Data dir:     ${DATA_DIR}`);
  startHealthPolling();
});
