'use strict';
// Leveled logger with console + rotated file transports. No dependencies.
// Rotation: one file per day (app-YYYY-MM-DD.log); when a file exceeds
// LOG_MAX_BYTES it rolls to app-YYYY-MM-DD.<n>.log. Files older than
// LOG_RETENTION_DAYS are pruned on startup and on rotation.
// Controlled by src/config (all LOG_* keys, env-overridable). File output is
// ON by default; console output is ON by default. Logging never throws.
const fs = require('fs');
const path = require('path');

const RANKS = { debug: 0, info: 1, warn: 2, error: 3 };

function asBool(v, dflt) {
  if (v === undefined || v === null) return dflt;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return dflt;
}
function settings() {
  let cfg = {};
  try { cfg = require('../config'); } catch (_) { cfg = {}; }
  const level = String(process.env.LOG_LEVEL || cfg.logLevel || 'info').toLowerCase();
  const rawDir = process.env.LOG_DIR || cfg.logDir || 'logs';
  const dir = path.isAbsolute(rawDir) ? rawDir : path.join(__dirname, '..', '..', rawDir);
  return {
    level: RANKS[level] === undefined ? 'info' : level,
    dir,
    toFile: asBool(process.env.LOG_TO_FILE, asBool(cfg.logToFile, true)),
    toConsole: asBool(process.env.LOG_TO_CONSOLE, asBool(cfg.logToConsole, true)),
    retentionDays: Number(process.env.LOG_RETENTION_DAYS || cfg.logRetentionDays || 14),
    maxBytes: Number(process.env.LOG_MAX_BYTES || cfg.logMaxBytes || 10 * 1024 * 1024)
  };
}

let stream = null;
let streamDay = '';
let streamPart = 0;
let streamSize = 0;
let prunedOnce = false;

function dayOf(d) {
  return d.toISOString().slice(0, 10);
}
function fileFor(dir, day, part) {
  return path.join(dir, part === 0 ? `app-${day}.log` : `app-${day}.${part}.log`);
}
function prune(dir, retentionDays) {
  let files = [];
  try { files = fs.readdirSync(dir); } catch (_) { return; }
  const cutoff = Date.now() - retentionDays * 86400 * 1000;
  for (const f of files) {
    const m = /^app-(\d{4}-\d{2}-\d{2})(?:\.\d+)?\.log$/.exec(f);
    if (!m) continue;
    try {
      const mtime = fs.statSync(path.join(dir, f)).mtimeMs;
      const dayTime = Date.parse(m[1] + 'T00:00:00Z');
      if (Math.min(mtime, dayTime) < cutoff) fs.unlinkSync(path.join(dir, f));
    } catch (_) { /* best effort */ }
  }
}
function ensureStream(s) {
  if (!s.toFile) return null;
  const today = dayOf(new Date());
  if (stream && streamDay === today && (streamSize < s.maxBytes)) return stream;
  try {
    fs.mkdirSync(s.dir, { recursive: true });
    if (!prunedOnce || streamDay !== today) {
      prune(s.dir, s.retentionDays);
      prunedOnce = true;
    }
    if (stream) { try { stream.end(); } catch (_) {} stream = null; }
    streamDay = today;
    streamPart = 0;
    let file = fileFor(s.dir, today, 0);
    try {
      let size = fs.statSync(file).size;
      while (size >= s.maxBytes) {
        streamPart += 1;
        file = fileFor(s.dir, today, streamPart);
        try { size = fs.statSync(file).size; } catch (_) { size = 0; }
      }
      streamSize = size;
    } catch (_) { streamSize = 0; }
    stream = fs.createWriteStream(file, { flags: 'a' });
    stream.on('error', () => { stream = null; });
    return stream;
  } catch (_) {
    return null;
  }
}

function log(level, msg, meta) {
  const s = settings();
  if (RANKS[level] < RANKS[s.level]) return;
  let line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}`;
  if (meta !== undefined) {
    try { line += ' ' + JSON.stringify(meta); } catch (_) { line += ' [unserializable meta]'; }
  }
  line += '\n';
  if (s.toConsole) {
    try {
      if (level === 'error') console.error(line.trimEnd());
      else if (level === 'warn') console.warn(line.trimEnd());
      else if (level === 'debug' && console.debug) console.debug(line.trimEnd());
      else console.log(line.trimEnd());
    } catch (_) { /* never throw */ }
  }
  const out = ensureStream(s);
  if (out) {
    try {
      streamSize += Buffer.byteLength(line);
      out.write(line);
    } catch (_) { /* never throw */ }
  }
}

// Express middleware: one info line per request (method, path, status, ms,
// user id when authenticated). Noisy per-request detail belongs at debug.
function requestLogger() {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const meta = { status: res.statusCode, ms: Date.now() - start };
      if (req.user && (req.user.id || req.user.sub)) meta.userId = req.user.id || req.user.sub;
      log('info', `${req.method} ${req.originalUrl || req.url}`, meta);
    });
    next();
  };
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  requestLogger
};
