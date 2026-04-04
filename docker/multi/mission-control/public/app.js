'use strict';

// ── Constants ──────────────────────────────────────────────────────────────

const INSTANCE_META = {
  1: { label: 'Research', color: '#4f9cf9', port: 18789 },
  2: { label: 'Coding',   color: '#a78bfa', port: 18790 },
  3: { label: 'Comms',    color: '#34d399', port: 18791 },
  4: { label: 'Ops',      color: '#fb923c', port: 18792 },
};

const COLUMNS = ['backlog', 'inprogress', 'review', 'done'];

// ── State ──────────────────────────────────────────────────────────────────

let ws = null;
let wsReconnectTimer = null;
let healthData   = {};
let costData     = {};
let kanbanData   = { items: [] };
let pairings     = [];
let subscribedLogs = new Set([1, 2, 3, 4]); // always stream all; filter is display-only
let dragItemId   = null;
let selectedCount = 2;
let startingInstances = new Set();
let budget       = parseFloat(localStorage.getItem('budget') || '0') || 0;

// ── Toast ──────────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── WebSocket ──────────────────────────────────────────────────────────────

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener('open', () => {
    document.getElementById('ws-dot').className = 'ws-dot connected';
    // Subscribe to all log streams (filtering is display-only on the client)
    subscribedLogs.forEach(id => ws.send(JSON.stringify({ type: 'subscribe_logs', instanceId: id })));
    clearTimeout(wsReconnectTimer);
  });

  ws.addEventListener('close', () => {
    document.getElementById('ws-dot').className = 'ws-dot disconnected';
    wsReconnectTimer = setTimeout(connectWS, 3000);
  });

  ws.addEventListener('error', () => ws.close());

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type) {
      case 'health':        onHealth(msg.payload);       break;
      case 'cost_update':   onCost(msg.payload);         break;
      case 'kanban_update': onKanban(msg.payload);       break;
      case 'log':           onLogLine(msg);              break;
      case 'pairings':      onPairings(msg.payload);     break;
      case 'pairing_code':  onNewPairing(msg);           break;
    }
  });
}

// ── Tabs ───────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
  });
});

// ── Fleet health ───────────────────────────────────────────────────────────

function onHealth(data) {
  healthData = data;
  // Clear starting state for instances that are now running
  Object.entries(data).forEach(([id, h]) => {
    if (h.status === 'healthy' || h.status === 'degraded') startingInstances.delete(id);
  });
  renderFleet();
  document.getElementById('fleet-updated').textContent =
    `Updated ${new Date().toLocaleTimeString()}`;
}

function statusClass(status) {
  return `status-${status || 'unknown'}`;
}

function renderFleet() {
  const grid = document.getElementById('fleet-grid');
  grid.innerHTML = '';

  Object.entries(INSTANCE_META).forEach(([id, meta]) => {
    const h = healthData[id] || {};
    const status = h.status || 'unknown';
    const lastCheck = h.lastCheck ? new Date(h.lastCheck).toLocaleTimeString() : '—';
    const model = (h.data && h.data.model) || (costData[id] && costData[id].model) || '—';
    const today = new Date().toISOString().slice(0, 10);
    const dailyCost = costData[id] ? (costData[id].daily && costData[id].daily[today]) || 0 : 0;
    const running = status === 'healthy' || status === 'degraded';

    const card = document.createElement('div');
    card.className = 'agent-card';
    card.style.setProperty('--card-color', meta.color);
    card.innerHTML = `
      <div class="agent-card-header">
        <div>
          <div class="agent-name">openclaw-${id}</div>
          <div class="agent-label">${meta.label}</div>
        </div>
        <span class="status-pill ${statusClass(status)}">${status}</span>
      </div>
      <div class="agent-meta">
        <div class="meta-item">
          <div class="meta-label">Port</div>
          <div class="meta-value">:${meta.port}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Last check</div>
          <div class="meta-value">${lastCheck}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Model</div>
          <div class="meta-value" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${model}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Today's cost</div>
          <div class="meta-value" style="color:${dailyCost > 1 ? 'var(--degraded)' : 'inherit'}">
            $${dailyCost.toFixed(4)}
          </div>
        </div>
      </div>
      <div class="agent-actions">
        <button class="btn btn-success btn-sm btn-start-instance" data-id="${id}" ${running || startingInstances.has(id) ? 'disabled' : ''}>▶ Start</button>
        <button class="btn btn-danger  btn-sm btn-stop-instance"  data-id="${id}" ${!running ? 'disabled' : ''}>■ Stop</button>
        <button class="btn btn-ghost   btn-sm btn-ping-instance"  data-id="${id}" title="Ping now">↻</button>
      </div>
    `;
    grid.appendChild(card);
  });

  // Wire per-instance buttons
  const out = document.getElementById('fleet-compose-output');
  grid.querySelectorAll('.btn-start-instance').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      startingInstances.add(id);
      btn.disabled = true;
      try {
        await streamingPost(`/api/compose/up/${id}`, {}, out);
        toast(`Instance ${id} starting…`, 'success');
      } catch (err) {
        startingInstances.delete(id);
        toast('Start failed: ' + err.message, 'error');
      }
      renderFleet();
    });
  });

  grid.querySelectorAll('.btn-stop-instance').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await streamingPost(`/api/compose/stop/${btn.dataset.id}`, {}, out);
        toast(`Instance ${btn.dataset.id} stopped`, 'info');
      } catch (err) {
        toast('Stop failed: ' + err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  grid.querySelectorAll('.btn-ping-instance').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await api('POST', `/api/health/poll/${btn.dataset.id}`);
        // health update arrives via WebSocket → renderFleet() restores the button
      } catch (err) {
        toast('Ping failed: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '↻';
      }
    });
  });
}

// ── Kanban ─────────────────────────────────────────────────────────────────

function onKanban(data) {
  kanbanData = data;
  renderKanban();
}

function renderKanban() {
  COLUMNS.forEach(col => {
    const container = document.getElementById(`col-${col}`);
    const items = kanbanData.items.filter(i => i.column === col);
    document.getElementById(`cnt-${col}`).textContent = items.length;
    container.innerHTML = '';

    items.forEach(item => {
      const meta = INSTANCE_META[item.assignee];
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.draggable = true;
      card.dataset.id = item.id;

      // Action button depends on column
      let actionHtml = '';
      if (col === 'backlog' && item.assignee) {
        actionHtml = `<button class="btn btn-success btn-sm card-dispatch" data-id="${item.id}">▶ Dispatch</button>`;
      } else if (col === 'inprogress') {
        actionHtml = `<span class="card-status-badge" style="font-size:11px;color:var(--muted)">⏳ Working…</span>`;
        if (item.dispatchError) {
          actionHtml = `<span class="card-status-badge" style="font-size:11px;color:var(--dead)">⚠ ${escHtml(item.dispatchError)}</span>`;
        }
      } else if (col === 'review') {
        actionHtml = `<button class="btn btn-success btn-sm card-done" data-id="${item.id}">✓ Mark Done</button>`;
      }

      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
          <div class="card-title">${escHtml(item.title)}</div>
          <button class="card-delete" data-id="${item.id}" title="Delete">×</button>
        </div>
        ${item.prompt ? `<div class="card-prompt" style="font-size:11px;color:var(--muted);margin:4px 0;white-space:pre-wrap;max-height:60px;overflow:auto">${escHtml(item.prompt)}</div>` : ''}
        <div class="card-footer">
          <span class="card-assignee" style="${meta ? `background:${meta.color}22;color:${meta.color}` : ''}">
            ${meta ? meta.label : 'Unassigned'}
          </span>
          <span class="card-priority ${item.priority}">${item.priority}</span>
        </div>
        ${actionHtml ? `<div class="card-actions" style="margin-top:6px">${actionHtml}</div>` : ''}
      `;
      card.addEventListener('dragstart', onDragStart);
      card.querySelector('.card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(item.id);
      });
      const dispatchBtn = card.querySelector('.card-dispatch');
      if (dispatchBtn) {
        dispatchBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          dispatchBtn.disabled = true;
          dispatchBtn.textContent = '…';
          try {
            await api('POST', `/api/kanban/items/${item.id}/dispatch`);
            toast('Task dispatched', 'success');
          } catch (err) { toast('Dispatch failed: ' + err.message, 'error'); }
        });
      }
      const doneBtn = card.querySelector('.card-done');
      if (doneBtn) {
        doneBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          doneBtn.disabled = true;
          try {
            await api('POST', `/api/kanban/items/${item.id}/done`);
            toast('Task marked done', 'success');
          } catch (err) { toast('Mark done failed: ' + err.message, 'error'); }
        });
      }
      container.appendChild(card);
    });
  });
}

function onDragStart(e) {
  dragItemId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

document.querySelectorAll('.kanban-col').forEach(col => {
  col.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drag-over');
  });
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
  col.addEventListener('drop', async (e) => {
    e.preventDefault();
    col.classList.remove('drag-over');
    if (!dragItemId) return;
    const targetCol = col.dataset.col;
    await api('PATCH', `/api/kanban/items/${dragItemId}`, { column: targetCol });
    dragItemId = null;
  });
});

document.getElementById('btn-add-task').addEventListener('click', () => {
  document.getElementById('add-task-form').classList.toggle('open');
});

document.getElementById('btn-cancel-task').addEventListener('click', () => {
  document.getElementById('add-task-form').classList.remove('open');
});

document.getElementById('btn-save-task').addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { toast('Enter a task title', 'error'); return; }

  await api('POST', '/api/kanban/items', {
    title,
    prompt: document.getElementById('task-prompt').value.trim(),
    assignee: document.getElementById('task-assignee').value || null,
    column:   document.getElementById('task-column').value,
    priority: document.getElementById('task-priority').value,
  });

  document.getElementById('task-title').value = '';
  document.getElementById('task-prompt').value = '';
  document.getElementById('add-task-form').classList.remove('open');
  toast('Task added', 'success');
});

async function deleteItem(id) {
  await api('DELETE', `/api/kanban/items/${id}`);
}

// ── Live Logs ──────────────────────────────────────────────────────────────

function onLogLine({ instanceId, line, ts }) {
  const box  = document.getElementById('log-box');
  const meta = INSTANCE_META[instanceId];
  if (!meta) return;
  const time = new Date(ts).toLocaleTimeString();

  const isError = /error|fail|exception/i.test(line);
  const isWarn  = /warn|warning/i.test(line);

  const el = document.createElement('span');
  el.className = `log-line${isError ? ' error' : isWarn ? ' warn' : ''}`;
  el.dataset.instance = instanceId;
  el.innerHTML = `<span class="ts">${time}</span><span class="id" style="color:${meta.color}">[${meta.label}]</span>${escHtml(line)}`;

  box.appendChild(el);

  // Trim to 2000 lines
  while (box.children.length > 2000) box.removeChild(box.firstChild);

  if (document.getElementById('auto-scroll').checked) {
    box.scrollTop = box.scrollHeight;
  }
}

// Log filter buttons (All / Research / Coding / Comms / Ops)
// All log lines are always cached in the DOM; filtering is purely via CSS.
document.querySelectorAll('.log-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter;
    const box = document.getElementById('log-box');

    if (filter === 'all') {
      delete box.dataset.filter;
    } else {
      box.dataset.filter = filter;
    }

    document.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (document.getElementById('auto-scroll').checked) {
      box.scrollTop = box.scrollHeight;
    }
  });
});

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  document.getElementById('log-box').innerHTML = '';
});

// ── Cost ───────────────────────────────────────────────────────────────────

function onCost(data) {
  costData = data;
  renderCost();
}

function renderCost() {
  const grid = document.getElementById('cost-grid');
  grid.innerHTML = '';
  const today = new Date().toISOString().slice(0, 10);

  // Fleet total card
  const totalAll = Object.values(costData).reduce((s, d) => s + (d.total || 0), 0);
  const todayAll = Object.values(costData).reduce((s, d) => s + ((d.daily && d.daily[today]) || 0), 0);
  const fleetCard = document.createElement('div');
  fleetCard.className = 'cost-card';
  fleetCard.innerHTML = `
    <h4>Fleet Total</h4>
    <div class="cost-total">$${totalAll.toFixed(4)}</div>
    <div class="cost-daily">Today: $${todayAll.toFixed(4)}</div>
  `;
  grid.appendChild(fleetCard);

  Object.entries(INSTANCE_META).forEach(([id, meta]) => {
    const d = costData[id] || { total: 0, daily: {}, model: '—' };
    const todayCost = (d.daily && d.daily[today]) || 0;
    const overBudget = budget > 0 && todayCost > budget;

    const card = document.createElement('div');
    card.className = 'cost-card';
    card.style.borderColor = overBudget ? 'var(--dead)' : '';
    card.innerHTML = `
      <h4 style="color:${meta.color}">${meta.label} (${id})</h4>
      <div class="cost-total">$${(d.total || 0).toFixed(4)}</div>
      <div class="cost-daily">Today: $${todayCost.toFixed(4)}${overBudget ? ' ⚠ over budget' : ''}</div>
      <div class="cost-model">${d.model || '—'}</div>
    `;
    grid.appendChild(card);
  });

  // Budget status
  const statusEl = document.getElementById('budget-status');
  if (budget > 0) {
    statusEl.textContent = `Alert at $${budget.toFixed(2)}/day. Today fleet total: $${todayAll.toFixed(4)}`;
    if (todayAll > budget) toast(`⚠ Daily budget exceeded: $${todayAll.toFixed(4)} > $${budget.toFixed(2)}`, 'error');
  } else {
    statusEl.textContent = 'No budget set.';
  }
}

document.getElementById('btn-save-budget').addEventListener('click', () => {
  budget = parseFloat(document.getElementById('budget-input').value) || 0;
  localStorage.setItem('budget', budget);
  renderCost();
  toast(`Budget set to $${budget.toFixed(2)}/day`, 'success');
});

// Pre-fill budget input
document.getElementById('budget-input').value = budget || '';

// ── Pairings ───────────────────────────────────────────────────────────────

function onPairings(list) {
  pairings = list;
  renderPairings();
}

function onNewPairing({ instanceId, code, ts }) {
  // Switch to pairings tab and show toast
  const tab = document.querySelector('[data-panel="pairings"]');
  toast(`Pairing code from ${INSTANCE_META[instanceId]?.label}: ${code}`, 'info');
  updatePairingBadge();
}

function renderPairings() {
  const list = document.getElementById('pairing-list');
  updatePairingBadge();

  if (!pairings.length) {
    list.innerHTML = '<div class="empty-state">No pending pairing codes detected</div>';
    return;
  }

  list.innerHTML = '';
  pairings.forEach(p => {
    const meta = INSTANCE_META[p.instanceId] || {};
    const card = document.createElement('div');
    card.className = 'pairing-card';
    card.innerHTML = `
      <div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Instance</div>
        <div style="font-weight:600;color:${meta.color || 'var(--text)'}">${meta.label || 'Unknown'} (openclaw-${p.instanceId})</div>
      </div>
      <div class="pairing-code">${escHtml(p.code)}</div>
      <div class="pairing-meta">
        Detected at <strong>${new Date(p.ts).toLocaleTimeString()}</strong><br>
        User should enter this code when prompted in their messaging app.
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="font-size:11px;color:var(--muted)">To approve manually:</div>
        <code style="font-size:11px;font-family:var(--font-mono);background:var(--surface2);padding:4px 8px;border-radius:4px;white-space:nowrap">
          docker compose run --rm openclaw-${p.instanceId}-cli channels login
        </code>
        <button class="btn btn-ghost btn-sm" data-code="${p.code}">Dismiss</button>
      </div>
    `;
    card.querySelector('button').addEventListener('click', async () => {
      await api('DELETE', `/api/pairings/${p.code}`);
    });
    list.appendChild(card);
  });
}

function updatePairingBadge() {
  const badge = document.getElementById('pairing-badge');
  if (pairings.length > 0) {
    badge.textContent = pairings.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Ping All button (Fleet tab)
document.getElementById('btn-ping-all').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = '↻ Pinging…';
  try {
    await api('POST', '/api/health/poll');
    // health update arrives via WebSocket → onHealth() → renderFleet()
  } catch (err) {
    toast('Ping failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Ping All';
  }
});

// ── Config & Launch ────────────────────────────────────────────────────────

// Count selector
document.querySelectorAll('.count-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCount = parseInt(btn.dataset.count);
  });
});

async function streamingPost(url, body, outputEl) {
  outputEl.textContent = '';
  outputEl.classList.add('show');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    outputEl.textContent += decoder.decode(value);
    outputEl.scrollTop = outputEl.scrollHeight;
  }
}

document.getElementById('btn-launch').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const out = document.getElementById('compose-output');
  try {
    await streamingPost('/api/compose/up', { count: selectedCount }, out);
    toast(`Launched ${selectedCount} containers`, 'success');
  } catch (err) {
    toast('Launch failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-stop').addEventListener('click', async (e) => {
  if (!confirm('Stop all OpenClaw containers?')) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  const out = document.getElementById('compose-output');
  try {
    await streamingPost('/api/compose/down', {}, out);
    toast('All containers stopped', 'info');
  } catch (err) {
    toast('Stop failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-pull').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const out = document.getElementById('compose-output');
  try {
    await streamingPost('/api/compose/pull', {}, out);
    toast('Image pull complete', 'success');
  } catch (err) {
    toast('Pull failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// API Keys
document.getElementById('btn-save-keys').addEventListener('click', async () => {
  const anthropicKey     = document.getElementById('key-anthropic').value.trim();
  const gatewayToken     = document.getElementById('key-gateway').value.trim();
  const openaiKey        = document.getElementById('key-openai').value.trim();
  const openrouterKey    = document.getElementById('key-openrouter').value.trim();
  const openrouterModel  = document.getElementById('key-openrouter-model').value.trim();

  if (!anthropicKey && !gatewayToken && !openaiKey && !openrouterKey && !openrouterModel) {
    toast('Enter at least one key', 'error');
    return;
  }

  const instances = Array.from(
    document.querySelectorAll('#key-instances input:checked')
  ).map(el => parseInt(el.value));

  if (!instances.length) {
    toast('Select at least one instance', 'error');
    return;
  }

  try {
    await api('POST', '/api/config/keys', { anthropicKey, gatewayToken, openaiKey, openrouterKey, openrouterModel, instances });
    toast(`Keys saved to ${instances.length} instance(s)`, 'success');
    // Clear fields after save
    document.getElementById('key-anthropic').value = '';
    document.getElementById('key-gateway').value = '';
    document.getElementById('key-openai').value = '';
    document.getElementById('key-openrouter').value = '';
    document.getElementById('key-openrouter-model').value = '';
    loadKeyPreview();
  } catch (err) {
    toast('Save failed: ' + err.message, 'error');
  }
});

document.getElementById('btn-refresh-keys').addEventListener('click', loadKeyPreview);

// Telegram tokens (per-instance)
document.getElementById('btn-save-tg').addEventListener('click', async () => {
  const tokens = {};
  [1, 2, 3, 4].forEach(id => {
    const val = document.getElementById(`tg-${id}`).value.trim();
    if (val) tokens[id] = val;
  });

  if (!Object.keys(tokens).length) {
    toast('Enter at least one Telegram bot token', 'error');
    return;
  }

  try {
    await api('POST', '/api/config/keys', { telegramTokens: tokens });
    const count = Object.keys(tokens).length;
    toast(`Telegram token${count > 1 ? 's' : ''} saved to ${count} instance${count > 1 ? 's' : ''}`, 'success');
    [1, 2, 3, 4].forEach(id => { document.getElementById(`tg-${id}`).value = ''; });
    loadKeyPreview();
  } catch (err) {
    toast('Save failed: ' + err.message, 'error');
  }
});

async function loadKeyPreview() {
  const el = document.getElementById('keys-preview');
  try {
    const data = await api('GET', '/api/config/keys');
    el.innerHTML = data.map(inst => {
      const meta = INSTANCE_META[inst.instanceId];
      const lines = Object.entries(inst.vars)
        .map(([k, v]) => `  ${k}=${escHtml(v)}`)
        .join('\n');
      return `<div style="margin-bottom:10px"><span style="color:${meta.color};font-weight:600">${meta.label} (${inst.instanceId})</span>\n${lines || '  (empty)'}</div>`;
    }).join('');
  } catch {
    el.textContent = 'Failed to load';
  }
}

// ── API helper ─────────────────────────────────────────────────────────────

async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Utility ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  connectWS();

  // Load initial data
  try {
    const [instancesRes, kanban, cost, pairingsRes] = await Promise.all([
      api('GET', '/api/instances'),
      api('GET', '/api/kanban'),
      api('GET', '/api/cost'),
      api('GET', '/api/pairings'),
    ]);

    // Build healthData from instances response
    instancesRes.forEach(inst => { healthData[inst.id] = inst.health; });
    renderFleet();

    onKanban(kanban);
    onCost(cost);
    onPairings(pairingsRes);
  } catch (e) {
    toast('Failed to load initial data: ' + e.message, 'error');
  }

  loadKeyPreview();

  // Budget input pre-fill
  if (budget > 0) document.getElementById('budget-input').value = budget;
}

init();
