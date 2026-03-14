# Memory Troubleshooting Guide

## Symptom: JavaScript Heap Out of Memory

### Error Pattern

```
<--- Last few GCs --->
Mark-Compact 903.6 (939.6) -> 900.8 (944.9) MB, pooled: 4 MB, 1651.43 / 0.00 ms
(average mu = 0.140, current mu = 0.089) allocation failure; scavenge might not succeed
Mark-Compact 908.9 (944.9) -> 903.8 (947.2) MB, pooled: 2 MB, 1678.93 / 0.00 ms
(average mu = 0.108, current mu = 0.074) allocation failure; scavenge might not succeed

FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

### What This Means

This is a Node.js fatal crash caused by the V8 JavaScript engine running out of heap memory. Key signals in the error:

| Signal | Meaning |
|---|---|
| `Mark-Compact` GC cycles repeating | Node.js is desperately trying to free memory but reclaiming very little each cycle |
| Heap size ~900+ MB and not shrinking | Memory is being held (leak or large data) — GC cannot release it |
| `average mu = 0.140`, `current mu = 0.089` | Mutator utilization is very low; almost all CPU time is spent in GC, not useful work |
| `allocation failure; scavenge might not succeed` | Even the fast (young-generation) GC is failing |
| `Ineffective mark-compacts near heap limit` | V8's threshold: if full GC cycles aren't freeing enough memory, it gives up and crashes |

---

## Immediate Fixes

### 1. Increase the Node.js Heap Limit

By default Node.js caps the heap at ~512 MB–1.5 GB depending on the platform. Raise it with:

```bash
# Set heap to 4 GB (adjust to your available RAM)
NODE_OPTIONS="--max-old-space-size=4096" openclaw

# Or export it for the session
export NODE_OPTIONS="--max-old-space-size=4096"
openclaw
```

> **Note:** This is a workaround, not a root-cause fix. If the process keeps growing it will crash again at the new limit.

### 2. Restart the Process

If you are in a long-running session, simply restart OpenClaw. Accumulated in-memory context (conversation history, tool results, file buffers) is the most common cause of heap growth.

```bash
# Graceful restart (if using a process manager)
pm2 restart openclaw

# Or kill and relaunch manually
pkill -f openclaw && openclaw
```

---

## Root Cause Investigation

### Check Available System Memory

```bash
free -h          # Linux
vm_stat          # macOS
```

If the system itself is low on RAM, no heap increase will help — reduce other workloads or upgrade the instance.

### Profile the Heap

Run with the built-in inspector to capture a heap snapshot:

```bash
node --inspect --max-old-space-size=4096 $(which openclaw)
```

Then open `chrome://inspect` in Chrome, connect, and take a heap snapshot from the Memory tab. Look for:

- Large `Array`, `String`, or `Object` retainers
- Retained closures from old conversation turns
- Cached tool outputs that are never released

### Enable GC Logging

```bash
NODE_OPTIONS="--max-old-space-size=4096 --trace-gc" openclaw 2>&1 | tee gc.log
```

Watch for the heap size trend over time. A monotonically increasing heap that never drops is a memory leak.

---

## Common Causes in AI Agent Workloads

| Cause | Description | Fix |
|---|---|---|
| **Large conversation history** | Every message round-trip accumulates context in memory | Use `--context-limit` or periodically start a new session |
| **Unbounded tool output buffering** | Tool results (e.g. file reads, shell output) accumulate in memory across many calls | Limit tool output size; stream results rather than buffering |
| **Large file operations** | Reading multi-MB files into memory repeatedly | Use streaming reads; avoid loading entire files unless necessary |
| **Parallel agent explosion** | Many sub-agents running concurrently each hold their own heap | Limit agent concurrency |
| **Long-running sessions** | Sessions running for hours accumulate garbage that GC cannot fully collect | Schedule periodic restarts for long-running deployments |

---

## Prevention

### Set a Heap Limit in Your Deployment Config

Add to your process manager config or systemd unit:

```ini
# systemd example
Environment="NODE_OPTIONS=--max-old-space-size=4096"
```

```yaml
# pm2 ecosystem.config.js
env:
  NODE_OPTIONS: "--max-old-space-size=4096"
```

### Monitor Memory Usage

```bash
# Watch memory every 5 seconds
watch -n 5 'ps -o pid,rss,vsz,comm -p $(pgrep -f openclaw)'
```

Set up alerts if RSS exceeds 80% of your configured heap limit.

### Use `openclaw doctor`

```bash
openclaw doctor
```

This checks system health including available memory and will warn if the system is under memory pressure before you start a session.

---

## When to File a Bug Report

File a bug if:
- Heap grows continuously even in short idle sessions
- Memory is not released between conversation turns
- `openclaw doctor` passes but OOM still occurs quickly

Include in the report:
- Output of `openclaw --version`
- Output of `free -h` (or `vm_stat` on macOS)
- The GC log section from the crash (redact any sensitive file paths or content)
- Approximate session length and workload (number of tool calls, file sizes, etc.)

Report issues at: https://github.com/openclaw/openclaw/issues
