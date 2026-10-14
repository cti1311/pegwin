'use strict';
// Smoke (no framework): stub deps, drive route chains, assert prefs + admin guards.
// Run: node backend/tests/engagement-admin.test.js
const assert = require('assert');
const Module = require('module');
const routes = [];
Module.prototype.require = function (id) {
  if (id === 'express') return { Router: () => ({
    get: (p, ...h) => routes.push(['GET', p, h]), post: (p, ...h) => routes.push(['POST', p, h]),
    patch: (p, ...h) => routes.push(['PATCH', p, h]), delete: (p, ...h) => routes.push(['DELETE', p, h]) }) };
  return Module._load(id, this);
};
let role = 'user';
const db = { query: async (sql) => {
  if (sql.startsWith('SELECT * FROM notification_prefs')) return [[{ push: 0, email: 1 }]];
  if (sql.startsWith('SELECT COUNT')) return [[{ total: 1 }]];
  if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
  return [[{ id: 'E1', status: 'review' }]];
} };
const deps = { db, uid: () => '0'.repeat(26), http: {},
  auth: (...a) => (req, res, next) => {
    if (!a.includes(role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'x' } });
    req.user = { id: 'U1', role, hostId: 'H1' }; next();
  },
  errors: { send: (res, s, code, message) => res.status(s).json({ error: { code, message } }) } };
require('../src/routes/engagementRoutes.js')(deps);
require('../src/routes/adminRoutes.js')(deps);
function run(method, path, body) {
  const r = routes.find(([m, p]) => m === method && p === path);
  assert(r, `${method} ${path} registered`);
  return new Promise((resolve, reject) => {
    const req = { body: body || {}, query: {}, params: {} };
    const res = { _s: 200, status(s) { this._s = s; return this; },
      json(o) { resolve({ status: this._s, body: o }); }, end() { resolve({ status: this._s }); } };
    let i = 0; const next = (e) => { if (e) return reject(e);
      const h = r[2][i++]; if (!h) return resolve({ status: res._s });
      Promise.resolve(h(req, res, next)).catch(reject); };
    next();
  });
}
(async () => {
  role = 'user';
  let r = await run('PATCH', '/users/me/notification-preferences', { push: false });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.push, false); assert.strictEqual(r.body.email, true);
  r = await run('PATCH', '/users/me/notification-preferences', {});
  assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error.code, 'VALIDATION_ERROR');
  r = await run('GET', '/admin/events/review-queue');
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.error.code, 'FORBIDDEN');
  role = 'super_admin';
  r = await run('GET', '/admin/events/review-queue');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.total, 1);
  console.log('engagement-admin smoke: all assertions passed');
})().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
