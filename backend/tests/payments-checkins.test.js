'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const routes = [];
const fakeRouter = () => {
  const r = {};
  for (const m of ['get', 'post', 'patch', 'delete', 'use'])
    r[m] = (path, ...handlers) => { routes.push({ method: m, path, handlers }); return r; };
  return r;
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'express') return { Router: fakeRouter };
  return origLoad.call(this, req, ...rest);
};
const paymentsFactory = require('../src/routes/paymentsRoutes.js');
const checkinsFactory = require('../src/routes/checkinsRoutes.js');
const errors = { send(res, status, code, message) { res.statusCode = status; res.body = { error: { code, message } }; return res; } };
let uidN = 0;
const uid = () => String(++uidN).padStart(26, '0');
const auth = () => (req, res, next) => next();
const http = { post: async () => ({ data: { gatewayOrderId: 'gw_123' } }) };
const mockRes = () => ({ status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } });
const load = (factory, deps) => { routes.length = 0; factory(deps); };
const handler = (method, path) => {
  const hit = routes.find((r) => r.method === method && r.path === path);
  assert.ok(hit, `route ${method} ${path} registered`);
  return hit.handlers[hit.handlers.length - 1];
};
const req = (o) => Object.assign({ params: {}, query: {}, body: {}, headers: {}, user: {} }, o);
test('cashfree webhook dedupe: second delivery is deduped, one DB transition', async () => {
  const log = [];
  const db = { execute: async (sql) => { log.push(sql); return sql.startsWith('SELECT') ? [[], []] : [{ affectedRows: 1 }, []]; } };
  const deps = { db, auth, errors, uid, http, config: { paymentsDraft: true } };
  load(paymentsFactory, deps);
  const h = handler('post', '/webhooks/cashfree');
  const body = { eventId: 'evt_1', paymentId: 'P1', status: 'success' };
  const first = mockRes();
  await h(req({ body, headers: {} }), first);
  assert.equal(first.body.received, true);
  assert.equal(first.body.deduped, undefined);
  const second = mockRes();
  await h(req({ body, headers: {} }), second);
  assert.equal(second.body.deduped, true);
  assert.equal(log.filter((s) => s.startsWith('UPDATE payments')).length, 1);
});
test('razorpay webhook rejects bad signature', async () => {
  const db = { execute: async () => [[], []] };
  const deps = { db, auth, errors, uid, http, config: { paymentsDraft: true, razorpayWebhookSecret: 's3cret' } };
  load(paymentsFactory, deps);
  const res = mockRes();
  await handler('post', '/webhooks/razorpay')(req({ body: { eventId: 'e9' }, headers: { 'x-razorpay-signature': 'wrong' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
});
test('checkins sync is first-wins within a batch', async () => {
  const store = { GOODTICKET01: null, USEDTICKET02: '2026-01-01T00:00:00Z' };
  const db = { execute: async (sql, args) => {
    if (sql.startsWith('SELECT')) return [store[args[0]] === undefined ? [] : [{ checked_in_at: store[args[0]] }], []];
    const t = store[args[2]];
    if (t === undefined || t) return [{ affectedRows: 0 }, []];
    store[args[2]] = args[0];
    return [{ affectedRows: 1 }, []];
  } };
  load(checkinsFactory, { db, auth, errors, uid });
  const res = mockRes();
  await handler('post', '/checkins/sync')(req({ body: { scans: [
    { ticketCode: 'GOODTICKET01', scannedAt: '2026-10-11T07:00:00Z', deviceId: 'd1' },
    { ticketCode: 'GOODTICKET01', scannedAt: '2026-10-11T07:00:05Z', deviceId: 'd2' },
    { ticketCode: 'USEDTICKET02', scannedAt: '2026-10-11T07:00:06Z', deviceId: 'd2' },
    { ticketCode: 'NOPE', scannedAt: '2026-10-11T07:00:07Z', deviceId: 'd1' } ] } }), res);
  assert.deepEqual(res.body.results.map((r) => r.result), ['checked_in', 'duplicate', 'duplicate', 'invalid']);
});
test('single scan rejects malformed and unknown tickets', async () => {
  const db = { execute: async (sql) => (sql.startsWith('SELECT') ? [[], []] : [{ affectedRows: 0 }, []]) };
  load(checkinsFactory, { db, auth, errors, uid });
  const h = handler('post', '/checkins');
  const bad = mockRes();
  await h(req({ body: { ticketCode: 'SHORT', scannedAt: '2026-10-11T07:00:00Z' } }), bad);
  assert.equal(bad.body.error.code, 'TICKET_INVALID_OR_EXPIRED');
  const miss = mockRes();
  await h(req({ body: { ticketCode: 'ABCDEFGHIJKL', scannedAt: '2026-10-11T07:00:00Z' } }), miss);
  assert.equal(miss.statusCode, 422);
});
test('payment intent validates input and blocks duplicate active payment', async () => {
  const db = { execute: async (sql) => (sql.startsWith('SELECT') ? [[{ id: 'X' }], []] : [[], []]) };
  const deps = { db, auth, errors, uid, http, config: { paymentsDraft: true } };
  load(paymentsFactory, deps);
  const h = handler('post', '/payments/intents');
  const bad = mockRes();
  await h(req({ body: { orderId: 'nope', method: 'wallet' }, user: { id: 'U1' } }), bad);
  assert.equal(bad.statusCode, 400);
  const dup = mockRes();
  await h(req({ body: { orderId: '01J00000000000000000000001', method: 'upi' }, user: { id: 'U1' } }), dup);
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.body.error.code, 'PAYMENT_ALREADY_EXISTS');
});
