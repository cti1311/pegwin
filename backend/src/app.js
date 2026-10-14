'use strict';
// Pegwin backend entrypoint. All API routes come from the single
// routes/index.js entry, mounted under /api/v1.
const express = require('express');
const config = require('./config');
const db = require('./db');
const auth = require('./middleware/auth');
const errors = require('./middleware/errors');
const http = require('./utils/httpClient');
const { uid } = require('./utils/ids');
const logger = require('./utils/logger');

const deps = { db, auth, errors, uid, http, config };

const app = express();
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); }
}));
app.use(logger.requestLogger());
app.get('/health', (req, res) => res.json({ ok: true }));

const api = require('./routes')(deps);
app.use('/api/v1', api);

// Express 4 does not forward async-handler rejections to error middleware,
// which would surface as unhandled rejections (process crash on DB outage).
// Wrap every async route handler once, centrally (recursing into mounted
// slice routers), so rejections land in errorHandler instead.
function wrapAsync(stack) {
  stack.forEach((layer) => {
    if (layer.route) {
      layer.route.stack.forEach((s) => {
        const fn = s.handle;
        if (typeof fn === 'function' && fn.constructor.name === 'AsyncFunction' && fn.length < 4) {
          s.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
        }
      });
    } else if (layer.handle && Array.isArray(layer.handle.stack)) {
      wrapAsync(layer.handle.stack);
    }
  });
}
wrapAsync(api.stack);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err && Number.isInteger(err.status) ? err.status : 500;
  logger.error(`${req.method} ${req.originalUrl || req.url} -> ${status}`, {
    status,
    code: (err && err.code) || undefined,
    message: (err && err.message) || undefined,
    stack: status >= 500 && err && err.stack ? err.stack : undefined
  });
  errors.errorHandler(err, req, res, next);
});

if (require.main === module) {
  app.listen(config.port, () => logger.info('pegwin backend on :' + config.port));
}
module.exports = app;
