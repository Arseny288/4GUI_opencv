import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECRET = process.env.SECRET_KEY || 'CHANGE_ME';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const app = express();
const server = http.createServer(app);

// ---- Memory hubs ----
const videoLatest = new Map(); // streamId -> Buffer
const videoViewers = new Map(); // streamId -> Set(ws)
const robotSubs = new Map(); // robotId -> Set(ws)
const logSubs = new Set(); // Set({ws, level})
const logBuffer = [];
const LOG_MAX = 500;

function pushLog(level, text) {
  const msg = { level, text, ts: Date.now() };
  logBuffer.push(msg);
  if (logBuffer.length > LOG_MAX) logBuffer.splice(0, logBuffer.length - LOG_MAX);
  for (const sub of logSubs) {
    if (allowLevel(sub.level, level)) {
      try { sub.ws.send(JSON.stringify(msg)); } catch {}
    }
  }
}
function allowLevel(min, have) {
  const order = { info:0, warn:1, error:2 };
  return (order[have] ?? 0) >= (order[min] ?? 0);
}

// ---- Middleware ----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

function requireJWT(req, res, next) {
  let token = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  if (!token) token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'bad token' });
  }
}

// ---- Auth ----
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'bad credentials' });
  }
  const token = jwt.sign({ sub: username }, SECRET, { expiresIn: '7d' });
  res.json({ access_token: token });
});

// Snapshot
app.get('/api/snapshot/:stream', requireJWT, (req, res) => {
  const id = req.params.stream;
  const buf = videoLatest.get(id);
  if (!buf) return res.status(404).json({ error: 'no frame' });
  res.set('Content-Type', 'image/jpeg');
  res.send(buf);
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));

// ---- WebSockets ----
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // query parsing
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role'); // ingest | view | logs | robot
  const token = url.searchParams.get('token') || '';
  try { jwt.verify(token, SECRET); }
  catch { ws.close(1008, 'bad token'); return; }

  if (role === 'ingest') {
    const stream = url.searchParams.get('stream') || 'A';
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      // Optional size limit ~2MB
      if (data.length > (2<<20)) return;
      videoLatest.set(stream, Buffer.from(data));
      const subs = videoViewers.get(stream);
      if (subs) {
        for (const v of subs) {
          try { v.send(data, { binary: true }); } catch {}
        }
      }
    });
    ws.on('close', () => {});
    pushLog('info', `ingest connected: stream=${stream}`);
    return;
  }

  if (role === 'view') {
    const stream = url.searchParams.get('stream') || 'A';
    if (!videoViewers.has(stream)) videoViewers.set(stream, new Set());
    videoViewers.get(stream).add(ws);
    // send last frame
    const last = videoLatest.get(stream);
    if (last) { try { ws.send(last, { binary: true }); } catch {} }
    ws.on('close', () => {
      const set = videoViewers.get(stream);
      if (set) set.delete(ws);
    });
    return;
  }

  if (role === 'logs') {
    const level = url.searchParams.get('level') || 'info';
    const sub = { ws, level };
    logSubs.add(sub);
    // history
    for (const m of logBuffer) {
      if (allowLevel(level, m.level)) {
        try { ws.send(JSON.stringify(m)); } catch {}
      }
    }
    ws.on('close', () => logSubs.delete(sub));
    return;
  }

  if (role === 'robot') {
    const robotId = url.searchParams.get('robot_id') || 'r1';
    if (!robotSubs.has(robotId)) robotSubs.set(robotId, new Set());
    robotSubs.get(robotId).add(ws);
    ws.on('close', () => {
      robotSubs.get(robotId)?.delete(ws);
    });
    return;
  }

  ws.close(1008, 'unknown role');
});

// REST control (from dashboard)
app.post('/api/robot/:id/control', requireJWT, (req, res) => {
  const id = req.params.id;
  let { action, speed } = req.body || {};
  speed = Math.max(0, Math.min(100, Number(speed || 0)));
  const msg = JSON.stringify({ robot_id: id, action, speed });
  const set = robotSubs.get(id);
  if (set && set.size) {
    for (const c of set) { try { c.send(msg); } catch {} }
    pushLog('info', `cmd -> ${id} : ${action} @${speed}`);
    res.json({ ok: true });
  } else {
    pushLog('warn', `no robot online: ${id}`);
    res.status(404).json({ error: 'no robot connected' });
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}/public/login.html`);
});
