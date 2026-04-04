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

  // Periodically try to connect pending log subscribers to newly started containers
  setInterval(async () => {
    for (const [instanceId, subs] of pendingLogSubs) {
      // Prune disconnected clients
      for (const ws of subs) { if (ws.readyState !== 1) subs.delete(ws); }
      if (subs.size === 0) { pendingLogSubs.delete(instanceId); continue; }
      if (logStreams.has(instanceId)) {
        // Stream exists now — move pending subs over
        const stream = logStreams.get(instanceId);
        subs.forEach(ws => stream.clients.add(ws));
        pendingLogSubs.delete(instanceId);
      } else {
        await ensureLogStream(instanceId);
        const stream = logStreams.get(instanceId);
        if (stream) {
          subs.forEach(ws => stream.clients.add(ws));
          pendingLogSubs.delete(instanceId);
        }
      }
    }
  }, 10000);
}

// ── Cost tracking via OpenRouter credits API ───────────────────────────────

const costState = {};

function getOpenRouterKey(instanceId) {
  const content = readEnvFile(path.join(DATA_DIR, `instance-${instanceId}`, '.env'));
  const m = content.match(/^OPENROUTER_API_KEY=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function pollCredits(inst) {
  const key = getOpenRouterKey(inst.id);
  if (!key) { costState[inst.id] = { error: 'no API key' }; return; }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.data) {
      const d = data.data;
      costState[inst.id] = {
        label: d.label || null,
        usage: d.usage || 0,
        usageDaily: d.usage_daily || 0,
        usageWeekly: d.usage_weekly || 0,
        usageMonthly: d.usage_monthly || 0,
        limit: d.limit || null,
        limitRemaining: d.limit_remaining || null,
        lastCheck: new Date().toISOString(),
      };
    }
  } catch (e) {
    costState[inst.id] = { ...costState[inst.id], error: e.message, lastCheck: new Date().toISOString() };
  }
}

function startCostPolling() {
  INSTANCES.forEach(inst => {
    pollCredits(inst);
    setInterval(() => pollCredits(inst), 60000);
  });
  setInterval(() => broadcast({ type: 'cost_update', payload: costState }), 15000);
}

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
        if (stream) {
          stream.clients.add(ws);
        } else {
          // Container not running yet — remember this subscriber
          if (!pendingLogSubs.has(msg.instanceId)) pendingLogSubs.set(msg.instanceId, new Set());
          pendingLogSubs.get(msg.instanceId).add(ws);
        }
      }
      if (msg.type === 'unsubscribe_logs') {
        const stream = logStreams.get(msg.instanceId);
        if (stream) stream.clients.delete(ws);
      }
      if (msg.type === 'subscribe_internal_logs') {
        ensureInternalLogStream(msg.instanceId);
        const stream = internalLogStreams.get(msg.instanceId);
        if (stream) stream.clients.add(ws);
      }
      if (msg.type === 'unsubscribe_internal_logs') {
        const stream = internalLogStreams.get(msg.instanceId);
        if (stream) stream.clients.delete(ws);
      }
    } catch {}
  });

  ws.on('close', () => {
    clients.delete(ws);
    logStreams.forEach(s => s.clients.delete(ws));
    internalLogStreams.forEach(s => s.clients.delete(ws));
    pendingLogSubs.forEach(s => s.delete(ws));
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(data); });
}

// ── Log streaming ──────────────────────────────────────────────────────────

const logStreams = new Map();
const pendingLogSubs = new Map(); // instanceId → Set<ws> — subscribers waiting for container to start

// Patterns for extracting pairing codes from OpenClaw logs
const PAIRING_RE = /pairing code[:\s]+([A-Z0-9]{6,10})/i;

async function ensureLogStream(instanceId) {
  if (logStreams.has(instanceId)) return;
  const inst = INSTANCES.find(i => i.id === instanceId);
  if (!inst) return;

  // Don't spawn docker logs for containers that aren't running
  const status = await getContainerStatus(inst.name);
  if (status !== 'running') return;

  // Re-check after async gap
  if (logStreams.has(instanceId)) return;

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
        savePairings();
        broadcast({ type: 'pairings', payload: pendingPairings });
      }
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
  proc.on('exit', () => {
    const subscribers = entry.clients;
    logStreams.delete(instanceId);
    if (subscribers.size === 0) return;

    // Retry periodically until the container is running or all clients disconnect
    const retryInterval = setInterval(async () => {
      const alive = [...subscribers].filter(ws => ws.readyState === 1);
      if (alive.length === 0 || logStreams.has(instanceId)) {
        clearInterval(retryInterval);
        return;
      }
      await ensureLogStream(instanceId);
      const stream = logStreams.get(instanceId);
      if (stream) {
        alive.forEach(ws => stream.clients.add(ws));
        clearInterval(retryInterval);
      }
    }, 10000);
  });
}

// ── Internal log file streaming ────────────────────────────────────────────

const internalLogStreams = new Map();

async function ensureInternalLogStream(instanceId) {
  if (internalLogStreams.has(instanceId)) return;
  const inst = INSTANCES.find(i => i.id === instanceId);
  if (!inst) return;

  const status = await getContainerStatus(inst.name);
  if (status !== 'running') return;
  if (internalLogStreams.has(instanceId)) return;

  const today = new Date().toISOString().slice(0, 10);
  const logPath = `/tmp/openclaw/openclaw-${today}.log`;

  const proc = spawn('docker', ['exec', inst.name, 'tail', '-n', '200', '-f', logPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const entry = { proc, clients: new Set() };
  internalLogStreams.set(instanceId, entry);

  const onLine = (line) => {
    // Parse structured JSON log lines
    let parsed = null;
    let displayLine = line;
    try {
      const obj = JSON.parse(line);
      const msg = obj['2'] || '';
      const meta = obj['1'];
      const file = obj._meta?.path?.fileName || '';
      const time = obj.time || '';
      displayLine = `${time} [${file}] ${msg}${meta && typeof meta === 'object' ? ' ' + JSON.stringify(meta) : ''}`;
      parsed = obj;
    } catch {}

    const ts = new Date().toISOString();
    const msgStr = JSON.stringify({ type: 'internal_log', instanceId, line: displayLine, ts });
    entry.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msgStr); });

    // Pairing request detection from internal logs
    if (parsed && typeof parsed['2'] === 'string' && PAIRING_REQUEST_RE.test(parsed['2'])) {
      const meta = parsed['1'] || {};
      const key = `${instanceId}-${meta.chatId || meta.username || ts}`;
      if (!pendingPairings.find(p => p.code === key)) {
        pendingPairings.push({
          code: key,
          instanceId,
          ts,
          username: meta.username || null,
          firstName: meta.firstName || null,
          chatId: meta.chatId || null,
        });
        savePairings();
        broadcast({ type: 'pairings', payload: pendingPairings });
      }
    }
  };

  let buf = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      onLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });

  proc.on('exit', () => {
    const subscribers = entry.clients;
    internalLogStreams.delete(instanceId);
    if (subscribers.size === 0) return;
    const retryInterval = setInterval(async () => {
      const alive = [...subscribers].filter(ws => ws.readyState === 1);
      if (alive.length === 0 || internalLogStreams.has(instanceId)) {
        clearInterval(retryInterval);
        return;
      }
      await ensureInternalLogStream(instanceId);
      const stream = internalLogStreams.get(instanceId);
      if (stream) {
        alive.forEach(ws => stream.clients.add(ws));
        clearInterval(retryInterval);
      }
    }, 10000);
  });
}

// Regex for pairing request detection in internal logs
const PAIRING_REQUEST_RE = /telegram pairing request/i;

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

const PAIRINGS_FILE = path.join(MC_DATA, 'pairings.json');

function loadPairings() {
  try { return JSON.parse(fs.readFileSync(PAIRINGS_FILE, 'utf8')); } catch { return []; }
}

function savePairings() {
  fs.writeFileSync(PAIRINGS_FILE, JSON.stringify(pendingPairings, null, 2));
}

// Hydrate from disk
pendingPairings.push(...loadPairings());

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

// Patch openclaw.json so the gateway binds to all interfaces (not just loopback),
// which is required for mission-control to reach instances over the Docker network.
function ensureGatewayBinding(instanceId) {
  const configPath = path.join(DATA_DIR, `instance-${instanceId}`, 'openclaw.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return; }
  if (!config.gateway) config.gateway = {};
  const hadTypo = 'binding' in config.gateway;
  if (hadTypo) delete config.gateway.binding;
  if (config.gateway.bind === 'lan' && !hadTypo) return;
  config.gateway.bind = 'lan';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`[config] instance-${instanceId}: set gateway.bind = "lan"${hadTypo ? ' (removed stale "binding" key)' : ''}`);
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
  INSTANCES.slice(0, count).forEach(inst => ensureGatewayBinding(inst.id));
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

  ensureGatewayBinding(inst.id);
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
  const { anthropicKey, gatewayToken, openaiKey, openrouterKey, openrouterModel, telegramTokens, instances } = req.body;
  const targets = (instances && instances.length) ? instances : [1, 2, 3, 4];

  targets.forEach(id => {
    const envPath = path.join(DATA_DIR, `instance-${id}`, '.env');
    const vars = {};
    if (anthropicKey)    vars.ANTHROPIC_API_KEY       = anthropicKey;
    if (gatewayToken)    vars.OPENCLAW_GATEWAY_TOKEN  = gatewayToken;
    if (openaiKey)       vars.OPENAI_API_KEY          = openaiKey;
    if (openrouterKey)   vars.OPENROUTER_API_KEY      = openrouterKey;
    if (openrouterModel) vars.OPENROUTER_MODEL        = openrouterModel;
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
        vars[m[1]] = m[1] === 'OPENROUTER_MODEL' ? v : (v.length > 8 ? `${v.slice(0, 4)}****${v.slice(-4)}` : '****');
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
    prompt: req.body.prompt || '',
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

// Read the gateway token from an instance's openclaw.json or .env file
function getGatewayToken(instanceId) {
  const base = path.join(DATA_DIR, `instance-${instanceId}`);
  // Primary: openclaw.json gateway.auth.token
  try {
    const config = JSON.parse(fs.readFileSync(path.join(base, 'openclaw.json'), 'utf8'));
    if (config.gateway?.auth?.token) return config.gateway.auth.token;
  } catch {}
  // Fallback: .env OPENCLAW_GATEWAY_TOKEN
  const content = readEnvFile(path.join(base, '.env'));
  const m = content.match(/^OPENCLAW_GATEWAY_TOKEN=(.+)$/m);
  return m ? m[1].trim() : null;
}

// Dispatch a kanban task to the assigned agent
app.post('/api/kanban/items/:id/dispatch', async (req, res) => {
  const board = loadKanban();
  const item = board.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (!item.assignee) return res.status(400).json({ error: 'no assignee' });

  const inst = INSTANCES.find(i => i.id === parseInt(item.assignee));
  if (!inst) return res.status(400).json({ error: 'unknown instance' });

  const token = getGatewayToken(inst.id);
  if (!token) return res.status(400).json({ error: 'no gateway token configured for instance ' + inst.id });

  // Move to inprogress immediately
  item.column = 'inprogress';
  item.dispatchedAt = new Date().toISOString();
  saveKanban(board);
  broadcast({ type: 'kanban_update', payload: board });
  res.json({ ok: true, item });

  // Fire-and-forget: send message to agent, move to review when done
  const url = `http://${inst.name}:${inst.internalPort}/api/v1/message`;
  try {
    const agentRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: 'api',
        message: item.prompt || item.title,
        wait_for_response: true,
        timeout_ms: 120000,
      }),
      signal: AbortSignal.timeout(130000),
    });
    const data = await agentRes.json().catch(() => ({}));

    // Reload board (may have changed while we waited)
    const fresh = loadKanban();
    const freshItem = fresh.items.find(i => i.id === item.id);
    if (freshItem && freshItem.column === 'inprogress') {
      freshItem.column = 'review';
      freshItem.agentResponse = data.content || data.message || JSON.stringify(data);
      freshItem.completedAt = new Date().toISOString();
      saveKanban(fresh);
      broadcast({ type: 'kanban_update', payload: fresh });
    }
  } catch (e) {
    // On failure, add error info but leave in inprogress for manual triage
    const fresh = loadKanban();
    const freshItem = fresh.items.find(i => i.id === item.id);
    if (freshItem && freshItem.column === 'inprogress') {
      freshItem.dispatchError = e.message;
      saveKanban(fresh);
      broadcast({ type: 'kanban_update', payload: fresh });
    }
  }
});

// Mark a review task as done
app.post('/api/kanban/items/:id/done', (req, res) => {
  const board = loadKanban();
  const item = board.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  item.column = 'done';
  item.doneAt = new Date().toISOString();
  saveKanban(board);
  broadcast({ type: 'kanban_update', payload: board });
  res.json({ ok: true, item });
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
  savePairings();
  broadcast({ type: 'pairings', payload: pendingPairings });
  res.json({ ok: true });
});

// Manual pairing approve — runs: openclaw pairing approve telegram <code>
app.post('/api/pairing/approve', (req, res) => {
  const { instanceId, pairingCode } = req.body;
  if (!instanceId || !pairingCode) return res.status(400).json({ error: 'instanceId and pairingCode required' });

  const inst = INSTANCES.find(i => i.id === parseInt(instanceId));
  if (!inst) return res.status(404).json({ error: 'unknown instance' });

  const cliService = `openclaw-${inst.id}-cli`;
  const cliProfiles = { 1: 'cli', 2: 'cli', 3: 'cli-three', 4: 'cli-four' };
  const profileArgs = ['--profile', cliProfiles[inst.id] || 'cli'];

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const proc = spawn('docker', [
    'compose', '-f', COMPOSE_FILE, ...profileArgs,
    'run', '--rm', cliService, 'pairing', 'approve', 'telegram', pairingCode,
  ], { cwd: COMPOSE_PROJECT_DIR, env: { ...process.env } });

  proc.stdout.on('data', d => res.write(d));
  proc.stderr.on('data', d => res.write(d));
  proc.on('exit', code => { res.write(`\n[exit ${code}]\n`); res.end(); });
  proc.on('error', e => { res.write(`[error: ${e.message}]\n`); res.end(); });
});

// ── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw Mission Control → http://0.0.0.0:${PORT}`);
  console.log(`Compose file: ${COMPOSE_FILE}`);
  console.log(`Data dir:     ${DATA_DIR}`);
  INSTANCES.forEach(inst => ensureGatewayBinding(inst.id));
  startHealthPolling();
  startCostPolling();
});
