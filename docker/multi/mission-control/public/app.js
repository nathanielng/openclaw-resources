'use strict';

// ── Constants ──────────────────────────────────────────────────────────────

const INSTANCE_META = {
  1: { label: 'Research', color: '#4f9cf9', port: 18789 },
  2: { label: 'Coding',   color: '#a78bfa', port: 18790 },
  3: { label: 'Comms',    color: '#34d399', port: 18791 },
  4: { label: 'Ops',      color: '#fb923c', port: 18792 },
};

const AVATAR_EXT = { 1: 'jpg', 2: 'jpg', 3: 'jpg', 4: 'jpg' };

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
let openrouterModels = {};
let configuredModels = {};
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
      case 'internal_log':  onInternalLogLine(msg);      break;
      case 'pairings':      onPairings(msg.payload);     break;
      case 'pairing_code':  onNewPairing(msg);           break;
      case 'chat_event':    onChatEvent(msg);            break;
      case 'chat_send_result': onChatSendResult(msg);    break;
      case 'chat_history_result': onChatHistory(msg);    break;
      case 'chat_error':    onChatError(msg);            break;
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
    const modelFull = (h.data && h.data.model) || configuredModels[id] || openrouterModels[id] || '';
    const slashIdx = modelFull.indexOf('/');
    const modelProvider = slashIdx > -1 ? modelFull.slice(0, slashIdx) : '';
    const modelName = slashIdx > -1 ? modelFull.slice(slashIdx + 1) : modelFull;
    const usage = costData[id] ? (costData[id].usageDaily || 0) : 0;
    const running = status === 'healthy' || status === 'degraded';

    const card = document.createElement('div');
    card.className = 'agent-card';
    card.style.setProperty('--card-color', meta.color);
    card.innerHTML = `
      <div class="agent-card-header">
        <img class="agent-avatar" src="/images/openclaw-${id}.${AVATAR_EXT[id]}" alt="${meta.label}" />
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
        <div class="meta-item meta-item-model">
          <div class="meta-label">Model${modelProvider ? ` <span class="model-provider">(${modelProvider})</span>` : ''}</div>
          <div class="meta-value model-value" title="${escHtml(modelFull)}">${modelName ? escHtml(modelName) : '—'}<button class="model-copy" data-model="${escHtml(modelFull)}" title="Copy full model ID">⧉</button></div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Usage</div>
          <div class="meta-value" style="color:${usage > 1 ? 'var(--degraded)' : 'inherit'}">
            $${usage.toFixed(4)}
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

  grid.querySelectorAll('.model-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.model);
      toast('Model ID copied', 'info');
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

      const editBtn = col === 'backlog' ? `<button class="card-edit" data-id="${item.id}" title="Edit">✎</button>` : '';

      let responseHtml = '';
      if (item.agentResponse) {
        responseHtml = `<details class="card-response" style="margin-top:6px;font-size:11px">
          <summary style="cursor:pointer;color:var(--muted)">Agent response</summary>
          <div style="margin-top:4px;padding:6px;background:var(--surface2);border-radius:4px;white-space:pre-wrap;max-height:150px;overflow:auto;color:var(--text)">${escHtml(item.agentResponse)}</div>
        </details>`;
      }

      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
          <div class="card-title">${escHtml(item.title)}</div>
          <div style="display:flex;gap:2px">${editBtn}<button class="card-delete" data-id="${item.id}" title="Delete">×</button></div>
        </div>
        ${item.prompt ? `<div class="card-prompt" style="font-size:11px;color:var(--muted);margin:4px 0;white-space:pre-wrap;max-height:60px;overflow:auto">${escHtml(item.prompt)}</div>` : ''}
        <div class="card-footer">
          <select class="card-assignee-select" data-id="${item.id}" style="font-size:11px;padding:2px 4px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);color:var(--text);${meta ? `color:${meta.color}` : ''}">
            <option value=""${!item.assignee ? ' selected' : ''}>Unassigned</option>
            ${Object.entries(INSTANCE_META).map(([k, m]) => `<option value="${k}"${item.assignee == k ? ' selected' : ''} style="color:${m.color}">${m.label}</option>`).join('')}
          </select>
          <span class="card-priority ${item.priority}">${item.priority}</span>
        </div>
        ${actionHtml ? `<div class="card-actions" style="margin-top:6px">${actionHtml}</div>` : ''}
        ${responseHtml}
      `;
      card.addEventListener('dragstart', onDragStart);
      card.querySelector('.card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(item.id);
      });
      card.querySelector('.card-assignee-select').addEventListener('change', async (e) => {
        e.stopPropagation();
        await api('PATCH', `/api/kanban/items/${item.id}`, { assignee: e.target.value || null });
      });
      const editBtnEl = card.querySelector('.card-edit');
      if (editBtnEl) {
        editBtnEl.addEventListener('click', (e) => {
          e.stopPropagation();
          card.draggable = false;
          card.innerHTML = `
            <div class="form-group" style="margin-bottom:6px">
              <input class="edit-title" value="${escHtml(item.title)}" style="width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text)" />
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <textarea class="edit-prompt" rows="3" style="width:100%;padding:4px 6px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);resize:vertical" placeholder="Prompt for the agent…">${escHtml(item.prompt || '')}</textarea>
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <select class="edit-assignee" style="width:100%;padding:4px 6px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text)">
                <option value=""${!item.assignee ? ' selected' : ''}>Unassigned</option>
                ${Object.entries(INSTANCE_META).map(([k, m]) => `<option value="${k}"${item.assignee == k ? ' selected' : ''}>${m.label}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary btn-sm edit-save">Save</button>
              <button class="btn btn-ghost btn-sm edit-cancel">Cancel</button>
            </div>
          `;
          card.querySelector('.edit-save').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const title = card.querySelector('.edit-title').value.trim();
            if (!title) { toast('Title is required', 'error'); return; }
            await api('PATCH', `/api/kanban/items/${item.id}`, {
              title,
              prompt: card.querySelector('.edit-prompt').value.trim(),
              assignee: card.querySelector('.edit-assignee').value || null,
            });
          });
          card.querySelector('.edit-cancel').addEventListener('click', (ev) => {
            ev.stopPropagation();
            renderKanban();
          });
        });
      }
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
      // Unsubscribe from any active internal log streams
      activeInternalStreams.forEach(id => {
        ws.send(JSON.stringify({ type: 'unsubscribe_internal_logs', instanceId: id }));
      });
      activeInternalStreams.clear();
    } else {
      box.dataset.filter = filter;
    }

    document.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    updateInternalLogBar(filter);

    if (document.getElementById('auto-scroll').checked) {
      box.scrollTop = box.scrollHeight;
    }
  });
});

function updateInternalLogBar(filter) {
  const bar = document.getElementById('internal-log-bar');
  if (filter === 'all' || !INSTANCE_META[filter]) {
    bar.style.display = 'none';
    return;
  }
  const id = parseInt(filter);
  const meta = INSTANCE_META[id];
  const logPath = `/tmp/openclaw/openclaw-${new Date().toISOString().slice(0, 10)}.log`;
  const active = activeInternalStreams.has(id);
  bar.style.display = 'flex';
  bar.innerHTML = `
    <button class="btn btn-ghost btn-sm${active ? ' active' : ''}" id="btn-toggle-internal" style="${active ? 'border-color:var(--healthy);color:var(--healthy)' : ''}">
      ${active ? '● Internal logs ON' : '○ Internal logs OFF'}
    </button>
    <code style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">openclaw-${id}:${logPath}</code>
  `;
  document.getElementById('btn-toggle-internal').addEventListener('click', () => {
    if (activeInternalStreams.has(id)) {
      activeInternalStreams.delete(id);
      ws.send(JSON.stringify({ type: 'unsubscribe_internal_logs', instanceId: id }));
    } else {
      activeInternalStreams.add(id);
      ws.send(JSON.stringify({ type: 'subscribe_internal_logs', instanceId: id }));
    }
    updateInternalLogBar(String(id));
  });
}

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  document.getElementById('log-box').innerHTML = '';
});

// ── Internal log stream toggles ────────────────────────────────────────────

const activeInternalStreams = new Set();

function onInternalLogLine({ instanceId, line, ts }) {
  const box  = document.getElementById('log-box');
  const meta = INSTANCE_META[instanceId];
  if (!meta) return;
  const time = new Date(ts).toLocaleTimeString();

  const isError = /error|fail|exception/i.test(line);
  const isWarn  = /warn|warning/i.test(line);
  const isPairing = /pairing request/i.test(line);

  const el = document.createElement('span');
  el.className = `log-line internal${isError ? ' error' : isWarn ? ' warn' : isPairing ? ' pairing' : ''}`;
  el.dataset.instance = instanceId;
  el.innerHTML = `<span class="ts">${time}</span><span class="id" style="color:${meta.color}">[${meta.label}]</span><span class="internal-tag">internal</span>${escHtml(line)}`;

  box.appendChild(el);
  while (box.children.length > 2000) box.removeChild(box.firstChild);

  if (document.getElementById('auto-scroll').checked) {
    box.scrollTop = box.scrollHeight;
  }
}

// ── Cost ───────────────────────────────────────────────────────────────────

function onCost(data) {
  costData = data;
  renderCost();
}

function renderCost() {
  const grid = document.getElementById('cost-grid');
  grid.innerHTML = '';

  // Fleet total card
  const totalUsage = Object.values(costData).reduce((s, d) => s + (d.usage || 0), 0);
  const totalDaily = Object.values(costData).reduce((s, d) => s + (d.usageDaily || 0), 0);
  const fleetCard = document.createElement('div');
  fleetCard.className = 'cost-card';
  fleetCard.innerHTML = `
    <h4>Fleet Total</h4>
    <div class="cost-total">$${totalUsage.toFixed(4)} total</div>
    <div class="cost-daily">Today: $${totalDaily.toFixed(4)}</div>
  `;
  grid.appendChild(fleetCard);

  Object.entries(INSTANCE_META).forEach(([id, meta]) => {
    const d = costData[id] || {};
    const overBudget = budget > 0 && (d.usageDaily || 0) > budget;

    const card = document.createElement('div');
    card.className = 'cost-card';
    card.style.borderColor = overBudget ? 'var(--dead)' : '';
    card.innerHTML = `
      <h4 style="color:${meta.color}">${meta.label} (${id})</h4>
      ${d.error && !d.usage ? `<div class="cost-daily" style="color:var(--dead)">${escHtml(d.error)}</div>` : `
        <div class="cost-total">$${(d.usage || 0).toFixed(4)} total</div>
        <div class="cost-daily">Today: $${(d.usageDaily || 0).toFixed(4)}${overBudget ? ' ⚠ over budget' : ''}</div>
        <div class="cost-model" style="font-size:11px;color:var(--muted)">
          Week: $${(d.usageWeekly || 0).toFixed(4)} · Month: $${(d.usageMonthly || 0).toFixed(4)}
        </div>
        ${d.limit ? `<div style="font-size:11px;color:var(--muted)">Limit: $${d.limit} ($${(d.limitRemaining || 0).toFixed(2)} left)</div>` : ''}
      `}
      ${d.lastCheck ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">Updated ${new Date(d.lastCheck).toLocaleTimeString()}</div>` : ''}
    `;
    grid.appendChild(card);
  });

  // Budget status
  const statusEl = document.getElementById('budget-status');
  if (budget > 0) {
    statusEl.textContent = `Alert at $${budget.toFixed(2)}/day. Fleet daily total: $${totalDaily.toFixed(4)}`;
    if (totalDaily > budget) toast(`⚠ Daily budget exceeded: $${totalDaily.toFixed(4)} > $${budget.toFixed(2)}`, 'error');
  } else {
    statusEl.textContent = 'No budget set.';
  }

  // Bar chart
  renderCostChart();
}

let costChart = null;
let costPeriod = 'daily';

document.querySelectorAll('.cost-period').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cost-period').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    costPeriod = btn.dataset.period;
    renderCostChart();
  });
});

function renderCostChart() {
  const ctx = document.getElementById('cost-chart');
  const periodKey = { daily: 'usageDaily', weekly: 'usageWeekly', monthly: 'usageMonthly' }[costPeriod];
  const periodLabel = costPeriod.charAt(0).toUpperCase() + costPeriod.slice(1);

  const labels = [];
  const values = [];
  const colors = [];
  let fleetTotal = 0;

  Object.entries(INSTANCE_META).forEach(([id, meta]) => {
    const val = costData[id] ? (costData[id][periodKey] || 0) : 0;
    labels.push(meta.label);
    values.push(val);
    colors.push(meta.color);
    fleetTotal += val;
  });

  labels.push('Fleet Total');
  values.push(fleetTotal);
  colors.push('#8b949e');

  const avg = fleetTotal / 4;

  if (costChart) costChart.destroy();
  costChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `${periodLabel} Usage ($)`,
          data: values,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: `${periodLabel} Avg ($${avg.toFixed(4)})`,
          data: Array(labels.length).fill(avg),
          type: 'line',
          borderColor: '#8b949e',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { labels: { color: '#8b949e', font: { size: 11 } } },
        tooltip: {
          callbacks: { label: (c) => `${c.dataset.label}: $${c.raw.toFixed(4)}` },
        },
      },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d33' } },
        y: {
          ticks: { color: '#8b949e', callback: (v) => '$' + v.toFixed(2) },
          grid: { color: '#30363d66' },
          beginAtZero: true,
        },
      },
    },
  });
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

// Manual pairing approve
document.getElementById('btn-approve-pairing').addEventListener('click', async () => {
  const instanceId = document.getElementById('pairing-instance').value;
  const pairingCode = document.getElementById('pairing-code-input').value.trim();
  if (!pairingCode) { toast('Enter a pairing code', 'error'); return; }

  const btn = document.getElementById('btn-approve-pairing');
  const out = document.getElementById('pairing-output');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    await streamingPost('/api/pairing/approve', { instanceId: parseInt(instanceId), pairingCode }, out);
    document.getElementById('pairing-code-input').value = '';
    toast('Pairing approved', 'success');
  } catch (err) {
    toast('Pairing failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Approve';
  }
});

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

document.getElementById('btn-pull').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const out = document.getElementById('compose-output');
  try {
    await streamingPost('/api/compose/pull', {}, out);
    toast('Image pull complete', 'success');
    loadFleetImages();
  } catch (err) {
    toast('Pull failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function loadFleetImages() {
  const el = document.getElementById('fleet-images');
  try {
    const data = await api('GET', '/api/fleet/images');
    el.innerHTML = '';
    data.forEach(inst => {
      const meta = INSTANCE_META[inst.id];
      const row = document.createElement('div');
      row.className = 'env-row';
      row.innerHTML = `
        <span class="env-key" style="color:${meta.color};min-width:120px">${meta.label}</span>
        <span class="env-val" style="color:var(--text)">${inst.image || '—'}</span>
        <span class="env-val" style="flex:0;white-space:nowrap">${inst.version ? `v${inst.version}` : '—'}</span>
      `;
      el.appendChild(row);
    });
  } catch { el.innerHTML = '<span class="text-muted text-sm">Failed to load</span>'; }
}

// Per-instance env editor + openclaw.json viewer
let activeConfigId = null;

async function loadConfigInstances() {
  const sidebar = document.getElementById('config-sidebar');
  sidebar.innerHTML = '';

  Object.entries(INSTANCE_META).forEach(([id, meta]) => {
    const btn = document.createElement('button');
    btn.className = 'config-sidebar-btn';
    btn.dataset.id = id;
    btn.innerHTML = `<span class="cfg-dot" style="background:${meta.color}"></span>${meta.label}`;
    btn.addEventListener('click', () => selectConfigInstance(id));
    sidebar.appendChild(btn);
  });
}

async function selectConfigInstance(id) {
  activeConfigId = id;
  const meta = INSTANCE_META[id];
  document.querySelectorAll('.config-sidebar-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id));

  const main = document.getElementById('config-main');
  main.innerHTML = `
    <div class="config-card" style="border:none;border-radius:0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="color:${meta.color};margin:0">${meta.label} <span class="text-muted" style="font-weight:400">.env</span></h3>
        <button class="btn btn-ghost btn-sm" id="cfg-add-var">+ Add Variable</button>
      </div>
      <div class="env-table" id="env-table-active"><span class="text-muted text-sm">Loading…</span></div>
    </div>
    <div class="config-card" style="border:none;border-radius:0">
      <h3 style="margin:0 0 12px">openclaw.json</h3>
      <pre class="json-pre" id="json-pre-active">Loading…</pre>
    </div>
  `;

  // Load env
  try {
    const vars = await api('GET', `/api/config/env/${id}`);
    renderEnvTable('active', vars, id);
  } catch { document.getElementById('env-table-active').innerHTML = '<span class="text-muted text-sm">Failed to load</span>'; }

  // Load openclaw.json
  try {
    const data = await api('GET', `/api/config/openclaw/${id}`);
    document.getElementById('json-pre-active').innerHTML = highlightJson(JSON.stringify(data, null, 2));
  } catch { document.getElementById('json-pre-active').textContent = 'Failed to load'; }

  // Wire add variable
  document.getElementById('cfg-add-var').addEventListener('click', () => {
    const table = document.getElementById('env-table-active');
    const row = document.createElement('div');
    row.className = 'env-row env-row-new';
    row.innerHTML = `
      <input class="env-key-input" type="text" placeholder="VARIABLE_NAME" style="flex:1" />
      <input class="env-val-input" type="text" placeholder="value" style="flex:2" />
      <button class="btn btn-success btn-sm env-save-new">Save</button>
      <button class="btn btn-ghost btn-sm env-cancel-new">✕</button>
    `;
    table.prepend(row);
    row.querySelector('.env-key-input').focus();
    row.querySelector('.env-cancel-new').addEventListener('click', () => row.remove());
    row.querySelector('.env-save-new').addEventListener('click', async () => {
      const key = row.querySelector('.env-key-input').value.trim().toUpperCase();
      const value = row.querySelector('.env-val-input').value;
      if (!key) { toast('Variable name required', 'error'); return; }
      try {
        await api('PATCH', `/api/config/env/${id}`, { key, value });
        toast(`${key} saved`, 'success');
        const vars = await api('GET', `/api/config/env/${id}`);
        renderEnvTable('active', vars, id);
      } catch (err) { toast('Save failed: ' + err.message, 'error'); }
    });
  });
}

function renderEnvTable(suffix, vars, instanceId) {
  const table = document.getElementById(`env-table-${suffix}`);
  if (!vars.length) { table.innerHTML = '<span class="text-muted text-sm">No variables set</span>'; return; }
  table.innerHTML = '';
  vars.forEach(({ key, masked }) => {
    const row = document.createElement('div');
    row.className = 'env-row';
    row.innerHTML = `
      <span class="env-key">${escHtml(key)}</span>
      <span class="env-val">${escHtml(masked)}</span>
      <button class="btn btn-ghost btn-sm env-edit" title="Edit">✎</button>
    `;
    row.querySelector('.env-edit').addEventListener('click', () => {
      row.innerHTML = `
        <span class="env-key">${escHtml(key)}</span>
        <input class="env-val-input" type="text" placeholder="new value" style="flex:1" />
        <button class="btn btn-success btn-sm env-save">Save</button>
        <button class="btn btn-ghost btn-sm env-cancel">✕</button>
      `;
      row.querySelector('.env-val-input').focus();
      row.querySelector('.env-cancel').addEventListener('click', async () => {
        const vars = await api('GET', `/api/config/env/${instanceId}`);
        renderEnvTable(suffix, vars, instanceId);
      });
      row.querySelector('.env-save').addEventListener('click', async () => {
        const value = row.querySelector('.env-val-input').value;
        try {
          await api('PATCH', `/api/config/env/${instanceId}`, { key, value });
          toast(`${key} updated`, 'success');
          const vars = await api('GET', `/api/config/env/${instanceId}`);
          renderEnvTable(suffix, vars, instanceId);
        } catch (err) { toast('Save failed: ' + err.message, 'error'); }
      });
    });
    table.appendChild(row);
  });
}

// ── Files editor ───────────────────────────────────────────────────────────

const FILES_LIST = ['SOUL.md', 'IDENTITY.md', 'AGENTS.md', 'BOOTSTRAP.md', 'HEARTBEAT.md', 'MEMORY.md', 'TOOLS.md', 'USER.md'];
let filesInstanceId = null;
let filesFileName = null;

(function initFilesTab() {
  const instList = document.getElementById('files-instance-list');
  Object.entries(INSTANCE_META).forEach(([id, meta]) => {
    const btn = document.createElement('button');
    btn.className = 'files-inst-btn';
    btn.dataset.id = id;
    btn.innerHTML = `<span class="cfg-dot" style="background:${meta.color}"></span>${meta.label}`;
    btn.addEventListener('click', () => selectFilesInstance(id));
    instList.appendChild(btn);
  });
})();

function selectFilesInstance(id) {
  filesInstanceId = id;
  document.querySelectorAll('.files-inst-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id));
  const fileList = document.getElementById('files-file-list');
  fileList.innerHTML = '';
  FILES_LIST.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'files-file-btn';
    btn.dataset.name = name;
    btn.textContent = name;
    btn.addEventListener('click', () => loadFile(id, name));
    fileList.appendChild(btn);
  });
  // Auto-load first file
  loadFile(id, FILES_LIST[0]);
}

async function loadFile(instanceId, name) {
  filesFileName = name;
  document.querySelectorAll('.files-file-btn').forEach(b => b.classList.toggle('active', b.dataset.name === name));
  const main = document.getElementById('files-main');
  const meta = INSTANCE_META[instanceId];
  main.innerHTML = `
    <div class="files-header">
      <span style="color:${meta.color};font-weight:600">${meta.label}</span> / <span class="text-mono">${name}</span>
      <button class="btn btn-primary btn-sm" id="files-save">Save</button>
    </div>
    <textarea class="files-editor" id="files-editor" spellcheck="false">Loading…</textarea>
  `;
  try {
    const data = await api('GET', `/api/files/${instanceId}/${name}`);
    document.getElementById('files-editor').value = data.content;
  } catch { document.getElementById('files-editor').value = ''; }

  document.getElementById('files-save').addEventListener('click', async () => {
    const btn = document.getElementById('files-save');
    btn.disabled = true;
    btn.textContent = '…';
    try {
      await api('PUT', `/api/files/${instanceId}/${name}`, { content: document.getElementById('files-editor').value });
      toast(`${name} saved`, 'success');
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
    btn.disabled = false;
    btn.textContent = 'Save';
  });
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

function highlightJson(json) {
  return escHtml(json).replace(
    /("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:'
  ).replace(
    /:\s*("(?:\\.|[^"\\])*")/g, ': <span class="json-str">$1</span>'
  ).replace(
    /:\s*(\d+\.?\d*)/g, ': <span class="json-num">$1</span>'
  ).replace(
    /:\s*(true|false|null)/g, ': <span class="json-bool">$1</span>'
  );
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
    instancesRes.forEach(inst => {
      healthData[inst.id] = inst.health;
      if (inst.openrouterModel) openrouterModels[inst.id] = inst.openrouterModel;
      if (inst.configuredModel) configuredModels[inst.id] = inst.configuredModel;
    });
    renderFleet();

    onKanban(kanban);
    onCost(cost);
    onPairings(pairingsRes);
  } catch (e) {
    toast('Failed to load initial data: ' + e.message, 'error');
  }

  loadConfigInstances();
  loadFleetImages();

  // Budget input pre-fill
  if (budget > 0) document.getElementById('budget-input').value = budget;
}

init();

// ── Chat ───────────────────────────────────────────────────────────────────

let chatInstance = null;
let chatStreaming = null; // element currently being streamed into

function chatSelectInstance(id) {
  // Unsubscribe from previous
  if (chatInstance) ws.send(JSON.stringify({ type: 'chat_unsubscribe', instanceId: chatInstance }));

  chatInstance = id;
  document.querySelectorAll('.chat-inst-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.instance) === id));
  document.getElementById('chat-input').disabled = false;
  document.getElementById('btn-chat-send').disabled = false;
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('chat-status').textContent = `Connecting to ${INSTANCE_META[id]?.label || id}…`;

  // Subscribe and load history
  ws.send(JSON.stringify({ type: 'chat_subscribe', instanceId: id }));
  ws.send(JSON.stringify({ type: 'chat_history', instanceId: id }));
}

document.querySelectorAll('.chat-inst-btn').forEach(btn => {
  btn.addEventListener('click', () => chatSelectInstance(parseInt(btn.dataset.instance)));
});

// Configure marked
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
});

const renderer = new marked.Renderer();
const origHtml = renderer.html.bind(renderer);
renderer.html = (html) => '<pre><code>' + escHtml(typeof html === 'object' ? html.text || html.raw || '' : html) + '</code></pre>';
marked.use({ renderer });

function renderMd(text) {
  return marked.parse(text);
}

function appendChatMsg(role, text, cls) {
  const box = document.getElementById('chat-messages');
  // Remove typing indicator if present
  box.querySelector('.chat-typing')?.remove();
  const el = document.createElement('div');
  el.className = `chat-msg ${role} ${cls || ''}`;
  el.innerHTML = `<div class="chat-role">${role}</div><div class="chat-content">${role === 'user' ? escHtml(text) : renderMd(text)}</div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

function showTypingIndicator() {
  const box = document.getElementById('chat-messages');
  if (box.querySelector('.chat-typing')) return;
  const el = document.createElement('div');
  el.className = 'chat-msg assistant chat-typing';
  el.innerHTML = '<div class="chat-role">assistant</div><div class="typing-dots"><span></span><span></span><span></span></div>';
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !chatInstance) return;
  input.value = '';
  appendChatMsg('user', text);
  showTypingIndicator();
  ws.send(JSON.stringify({ type: 'chat_send', instanceId: chatInstance, message: text }));
}

document.getElementById('btn-chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

function onChatEvent(msg) {
  if (msg.instanceId !== chatInstance) return;
  const p = msg.payload;
  if (!p || !p.message) return;
  const text = (p.message.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const box = document.getElementById('chat-messages');
  if (p.state === 'delta') {
    if (!chatStreaming) {
      chatStreaming = appendChatMsg('assistant', '', 'streaming');
    }
    chatStreaming.querySelector('.chat-content').innerHTML = renderMd(text);
    box.scrollTop = box.scrollHeight;
  }
  if (p.state === 'final') {
    if (chatStreaming) {
      chatStreaming.querySelector('.chat-content').innerHTML = renderMd(text);
      chatStreaming.classList.remove('streaming');
      chatStreaming = null;
    } else {
      appendChatMsg('assistant', text);
    }
  }
}

function onChatSendResult(msg) {
  if (msg.payload?.ok === false) {
    appendChatMsg('assistant', `Error: ${msg.payload.error?.message || 'unknown error'}`);
  }
}

function onChatHistory(msg) {
  if (msg.instanceId !== chatInstance) return;
  const box = document.getElementById('chat-messages');
  box.innerHTML = '';
  const messages = msg.payload?.payload?.messages || msg.payload?.payload || [];
  if (Array.isArray(messages)) {
    messages.forEach(m => {
      const text = Array.isArray(m.content)
        ? m.content.filter(c => c.type === 'text').map(c => c.text).join('')
        : (typeof m.content === 'string' ? m.content : '');
      if (text) appendChatMsg(m.role || 'assistant', text);
    });
  }
  document.getElementById('chat-status').textContent = `Connected to ${INSTANCE_META[chatInstance]?.label || chatInstance}`;
}

function onChatError(msg) {
  document.getElementById('chat-status').textContent = `Error: ${msg.error}`;
  toast(`Chat error: ${msg.error}`, 'error');
}
