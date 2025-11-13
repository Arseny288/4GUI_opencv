import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECRET = process.env.SECRET_KEY || 'CHANGE_ME';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const app = express();
const server = http.createServer(app);

// ---- Memory hubs ----
const videoLatest = new Map();
const videoViewers = new Map();
const robotSubs = new Map();
const logSubs = new Set();
const logBuffer = [];
const LOG_MAX = 500;

// ---- Logs ----
function pushLog(level, text) {
  const msg = { level, text, ts: Date.now() };
  logBuffer.push(msg);
  if (logBuffer.length > LOG_MAX)
    logBuffer.splice(0, logBuffer.length - LOG_MAX);

  for (const sub of logSubs) {
    if (allowLevel(sub.level, level)) {
      try { sub.ws.send(JSON.stringify(msg)); } catch {}
    }
  }
}

function allowLevel(min, have) {
  const order = { info: 0, warn: 1, error: 2 };
  return (order[have] ?? 0) >= (order[min] ?? 0);
}

// ---- Middleware ----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ---- Token check ----
function requireToken(req, res, next) {
  let token =
    req.query.token ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    req.cookies?.token;

  if (!token) return res.status(401).json({ error: 'no token' });
  if (token !== SECRET) return res.status(401).json({ error: 'bad token' });

  req.user = { sub: ADMIN_USER };
  next();
}

// ---- Auth ----
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'bad credentials' });
  }
  res.json({ access_token: SECRET });
});

// ---- Snapshot API ----
app.get('/api/snapshot/:stream', requireToken, (req, res) => {
  const id = req.params.stream;
  const buf = videoLatest.get(id);
  if (!buf) return res.status(404).json({ error: 'no frame' });
  res.set('Content-Type', 'image/jpeg');
  res.send(buf);
});

// ---- Health ----
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Static files ----
app.use('/public', express.static(path.join(__dirname, 'public')));

// ---- WebSockets ----
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role');
  const token = url.searchParams.get('token');

  if (token !== SECRET) {
    ws.close(1008, 'bad token');
    return;
  }

  // Ingest stream
  if (role === 'ingest') {
    const stream = url.searchParams.get('stream') || 'A';

    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      if (data.length > (2 << 20)) return;

      videoLatest.set(stream, Buffer.from(data));
      const subs = videoViewers.get(stream);
      if (subs) {
        for (const v of subs) {
          try { v.send(data, { binary: true }); } catch {}
        }
      }
    });

    pushLog('info', `ingest connected: stream=${stream}`);
    return;
  }

  // View stream
  if (role === 'view') {
    const stream = url.searchParams.get('stream') || 'A';

    if (!videoViewers.has(stream)) videoViewers.set(stream, new Set());
    videoViewers.get(stream).add(ws);

    const last = videoLatest.get(stream);
    if (last) {
      try { ws.send(last, { binary: true }); } catch {}
    }

    ws.on('close', () => {
      videoViewers.get(stream)?.delete(ws);
    });

    return;
  }

  // Logs
  if (role === 'logs') {
    const level = url.searchParams.get('level') || 'info';
    const sub = { ws, level };

    logSubs.add(sub);

    for (const m of logBuffer) {
      if (allowLevel(level, m.level)) {
        try { ws.send(JSON.stringify(m)); } catch {}
      }
    }

    ws.on('close', () => logSubs.delete(sub));
    return;
  }

  // Robot control channel
  if (role === 'robot') {
    const robotId = url.searchParams.get('robot_id') || 'r1';

    if (!robotSubs.has(robotId)) robotSubs.set(robotId, new Set());
    robotSubs.get(robotId).add(ws);

    ws.on('close', () => robotSubs.get(robotId)?.delete(ws));

    return;
  }

  ws.close(1008, 'unknown role');
});

// ---- REST robot control ----
app.post('/api/robot/:id/control', requireToken, (req, res) => {
  const id = req.params.id;
  let { action, speed } = req.body || {};

  speed = Math.max(0, Math.min(100, Number(speed || 0)));

  const msg = JSON.stringify({ robot_id: id, action, speed });
  const set = robotSubs.get(id);

  if (set && set.size > 0) {
    for (const c of set) {
      try { c.send(msg); } catch {}
    }
    pushLog('info', `cmd -> ${id}: ${action} @${speed}`);
    return res.json({ ok: true });
  }

  pushLog('warn', `no robot online: ${id}`);
  res.status(404).json({ error: 'no robot connected' });
});

// ---- Start ----
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on 0.0.0.0:${PORT}`);
});

