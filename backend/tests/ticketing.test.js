'use strict';
// Ticketing slice tests: quote-math unit test (spec section 6 example) +
// hold/order flow with stub deps. Plain node, no external packages.
const assert = require('assert');
const ticketing = require('../src/routes/ticketingRoutes');
const orders = require('../src/routes/ordersRoutes');
const { priceLines, applyCoupon, totals } = ticketing;

// Spec section 6 example: 50000 -> 5000 -> 55000 -> -10000 -> 45000 -> 8100 -> 53100.
function testQuoteMath() {
  const q = priceLines([{ tierId: 'T', qty: 1, unitPrice: 50000 }]);
  assert.strictEqual(q.hostPrice, 50000);
  assert.strictEqual(q.platformFee, 5000);
  assert.strictEqual(q.displayPrice, 55000);
  const t = totals(q, { discountType: 'flat', value: 10000, discountBearer: 'pegwin' });
  assert.strictEqual(t.discount, 10000);
  assert.strictEqual(t.taxableAmount, 45000);
  assert.strictEqual(t.gst, 8100);
  assert.strictEqual(t.finalPayable, 53100);
  const free = totals(q, null);
  assert.strictEqual(free.discount, 0);
  assert.strictEqual(free.finalPayable, 55000 + Math.round(55000 * 0.18));
  assert.strictEqual(applyCoupon(55000, { discountType: 'pct', value: 10 }).discount, 5500);
  assert.strictEqual(applyCoupon(100, { discountType: 'flat', value: 999 }).discount, 100);
}

// Minimal in-memory stub of mysql2 pool execute().
function stubDb() {
  const tables = { tiers: [], holds: [], hold_items: [], coupons: [], orders: [], order_items: [], tickets: [] };
  const db = {
    tables,
    async execute(sql, params) {
      const p = params || [];
      const one = (a) => [a.filter(Boolean)];
      if (sql.startsWith('SELECT * FROM tiers WHERE id')) return one([tables.tiers.find((t) => t.id === p[0])]);
      if (sql.startsWith('UPDATE tiers SET sold_count=sold_count+')) { tables.tiers.find((x) => x.id === p[1]).sold_count += p[0]; return [{}]; }
      if (sql.startsWith('UPDATE tiers SET sold_count=GREATEST')) { const t = tables.tiers.find((x) => x.id === p[1]); t.sold_count = Math.max(0, t.sold_count - p[0]); return [{}]; }
      if (sql.startsWith('DELETE FROM tiers')) { tables.tiers = tables.tiers.filter((x) => x.id !== p[0]); return [{}]; }
      if (sql.startsWith('INSERT INTO tiers')) { tables.tiers.push({ id: p[0], event_id: p[1], name: p[2], price: p[3], capacity: p[4], sold_count: 0 }); return [{}]; }
      if (sql.startsWith('SELECT * FROM tiers WHERE event_id')) return [tables.tiers.filter((t) => t.event_id === p[0]).slice(p[2], p[2] + p[1])];
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: tables.tiers.filter((t) => t.event_id === p[0]).length }]];
      if (sql.startsWith('UPDATE tiers SET name')) { Object.assign(tables.tiers.find((x) => x.id === p[3]), { name: p[0], price: p[1], capacity: p[2] }); return [{}]; }
      if (sql.indexOf('SUM(hi.qty)') !== -1) return [[{ held: tables.hold_items.filter((i) => i.tier_id === p[0]).reduce((s, i) => s + i.qty, 0) }]];
      if (sql.startsWith('INSERT INTO holds')) { tables.holds.push({ id: p[0], event_id: p[1], user_id: p[2], status: 'active', expires_at: p[3] }); return [{}]; }
      if (sql.startsWith('INSERT INTO hold_items')) { tables.hold_items.push({ id: p[0], hold_id: p[1], tier_id: p[2], qty: p[3], unit_price: p[4] }); return [{}]; }
      if (sql.startsWith('SELECT * FROM holds')) return one([tables.holds.find((h) => h.id === p[0])]);
      if (sql.indexOf("holds SET status='released'") !== -1) { tables.holds.find((h) => h.id === p[0]).status = 'released'; return [{}]; }
      if (sql.indexOf("holds SET status='consumed'") !== -1) { tables.holds.find((h) => h.id === p[0]).status = 'consumed'; return [{}]; }
      if (sql.startsWith('SELECT hi.*, t.name')) {
        return [tables.hold_items.filter((i) => i.hold_id === p[0]).map((i) => ({ ...i, tier_name: tables.tiers.find((t) => t.id === i.tier_id).name, price: tables.tiers.find((t) => t.id === i.tier_id).price }))];
      }
      if (sql.startsWith('INSERT INTO coupons')) { tables.coupons.push({ id: p[0], code: p[1], discountType: p[2], value: p[3], eventId: p[4], tierId: p[5], maxUses: p[6], usedCount: 0, couponBearer: p[10], enabled: p[11] }); return [{}]; }
      if (sql.startsWith('SELECT * FROM coupons LIMIT')) return [tables.coupons.slice(p[1], p[1] + p[0])];
      if (sql.startsWith('SELECT * FROM coupons WHERE id')) return one([tables.coupons.find((c) => c.id === p[0])]);
      if (sql.startsWith('UPDATE coupons SET discount_type')) { Object.assign(tables.coupons.find((c) => c.id === p[7]), { discountType: p[0], value: p[1], maxUses: p[2], couponBearer: p[5], enabled: p[6] }); return [{}]; }
      if (sql.startsWith('UPDATE coupons SET used_count')) { tables.coupons.find((c) => c.id === p[0]).usedCount += 1; return [{}]; }
      if (sql.startsWith('SELECT * FROM coupons WHERE code')) {
        return one([tables.coupons.find((c) => c.code === p[0] && c.enabled === 1)].filter(Boolean).map((c) => ({ ...c, discount_type: c.discountType, discount_bearer: c.couponBearer, max_uses: c.maxUses, used_count: c.usedCount, valid_from: null, valid_to: null, tier_id: c.tierId })));
      }
      if (sql.startsWith('INSERT INTO orders')) {
        tables.orders.push({ id: p[0], user_id: p[1], event_id: p[2], hold_id: p[3], coupon_id: p[4], status: 'pending', host_price: p[6], platform_fee: p[7], display_price: p[8], discount: p[9], taxable_amount: p[10], gst: p[11], final_payable: p[12], payment_id: p[13], payment_status: p[14], idempotency_key: p[15], created_at: new Date().toISOString() });
        return [{}];
      }
      if (sql.startsWith('SELECT * FROM orders WHERE idempotency_key')) return one([tables.orders.find((o) => o.idempotency_key === p[0] && o.user_id === p[1])]);
      if (sql.startsWith('SELECT * FROM orders WHERE id')) return one([tables.orders.find((o) => o.id === p[0])]);
      if (sql.indexOf("orders SET status='cancelled'") !== -1) { tables.orders.find((o) => o.id === p[0]).status = 'cancelled'; return [{}]; }
      if (sql.startsWith('INSERT INTO order_items')) { tables.order_items.push({ id: p[0], order_id: p[1], tier_id: p[2], tier_name: p[3], qty: p[4], unit_price: p[5] }); return [{}]; }
      if (sql.startsWith('SELECT * FROM order_items')) return [tables.order_items.filter((i) => i.order_id === p[0])];
      if (sql.startsWith('INSERT INTO tickets')) { tables.tickets.push({ ticket_code: p[0], order_id: p[1], tier_id: p[2], event_id: p[3], attendee_name: p[4], attendee_phone: p[5], attendee_email: p[6], qr_payload: p[7], holder_name: p[8], status: 'confirmed' }); return [{}]; }
      if (sql.indexOf('tk.order_id=?') !== -1) return [tables.tickets.filter((t) => t.order_id === p[0]).map((t) => ({ ...t, tier_name: 'VIP' }))];
      if (sql.indexOf('tk.ticket_code=?') !== -1) return one([tables.tickets.find((t) => t.ticket_code === p[0])].map((t) => ({ ...t, tier_name: 'VIP' })));
      if (sql.indexOf("tickets SET status='cancelled'") !== -1) { tables.tickets.filter((t) => t.order_id === p[0]).forEach((t) => { t.status = 'cancelled'; }); return [{}]; }
      throw new Error('unstubbed SQL: ' + sql);
    },
  };
  return db;
}

function stubDeps(db) {
  let n = 0;
  const passthrough = (_req, _res, next) => next();
  return {
    db,
    auth: Object.assign((() => passthrough), { require: () => passthrough, optional: () => passthrough }),
    errors: { send(res, status, code, message) { res.statusCode = status; res.body = { error: { code, message } }; } },
    uid: () => 'UID' + String(++n).padStart(23, '0'),
    http: {},
  };
}

// Drive an express-style layer fn directly by route path.
async function callLayer(factory, deps, method, path, opts) {
  const router = factory(deps);
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, method + ' ' + path + ' route exists');
  const handlers = layer.route.stack.map((s) => s.handle);
  const req = { params: opts.params || {}, query: opts.query || {}, body: opts.body, user: { id: 'U1' }, headers: opts.headers || {}, get(h) { return this.headers[h]; } };
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  let idx = 0;
  const next = async (err) => { if (err) throw err; const h = handlers[++idx]; if (h) await h(req, res, next); };
  await handlers[0](req, res, next);
  return res;
}

async function testHoldFlow() {
  const db = stubDb();
  const deps = stubDeps(db);
  db.tables.tiers.push({ id: 'TIER1', event_id: 'EV1', name: 'VIP', price: 50000, capacity: 5, sold_count: 0 });
  const created = await callLayer(ticketing, deps, 'post', '/checkout/holds', { body: { items: [{ tierId: 'TIER1', qty: 2 }] } });
  assert.strictEqual(created.statusCode, 201);
  assert.ok(created.body.holdId);
  const over = await callLayer(ticketing, deps, 'post', '/checkout/holds', { body: { items: [{ tierId: 'TIER1', qty: 4 }] } });
  assert.strictEqual(over.statusCode, 409);
  assert.strictEqual(over.body.error.code, 'INSUFFICIENT_INVENTORY');
  const got = await callLayer(ticketing, deps, 'get', '/checkout/holds/:holdId', { params: { holdId: created.body.holdId } });
  assert.strictEqual(got.body.status, 'active');
  const del = await callLayer(ticketing, deps, 'delete', '/checkout/holds/:holdId', { params: { holdId: created.body.holdId } });
  assert.strictEqual(del.statusCode, 204);
  const quote = await callLayer(ticketing, deps, 'post', '/checkout/quote', { body: { items: [{ tierId: 'TIER1', qty: 1 }] } });
  assert.strictEqual(quote.body.finalPayable, 55000 + 9900);
  db.tables.coupons.push({ id: 'C1', code: 'SAVE10', discountType: 'flat', value: 10000, couponBearer: 'pegwin', tierId: null, enabled: 1, maxUses: null, usedCount: 0 });
  const vc = await callLayer(ticketing, deps, 'post', '/checkout/coupons/validate', { body: { code: 'save10', tierId: 'TIER1', qty: 1 } });
  assert.strictEqual(vc.body.valid, true);
  assert.strictEqual(vc.body.discount, 10000);
  const bad = await callLayer(ticketing, deps, 'post', '/checkout/coupons/validate', { body: { code: 'NOPE', tierId: 'TIER1', qty: 1 } });
  assert.strictEqual(bad.body.error.code, 'COUPON_INVALID');
}

async function testOrderFlow() {
  const db = stubDb();
  const deps = stubDeps(db);
  db.tables.tiers.push({ id: 'TIER1', event_id: 'EV1', name: 'VIP', price: 50000, capacity: 10, sold_count: 0 });
  const held = await callLayer(ticketing, deps, 'post', '/checkout/holds', { body: { items: [{ tierId: 'TIER1', qty: 1 }] } });
  const body = { holdId: held.body.holdId, attendees: [{ name: 'Asha' }] };
  const first = await callLayer(orders, deps, 'post', '/orders', { body, headers: { 'Idempotency-Key': 'K1' } });
  assert.strictEqual(first.statusCode, 201);
  assert.strictEqual(first.body.status, 'pending');
  const retry = await callLayer(orders, deps, 'post', '/orders', { body, headers: { 'Idempotency-Key': 'K1' } });
  assert.strictEqual(retry.body.orderId, first.body.orderId);
  const detail = await callLayer(orders, deps, 'get', '/orders/:orderId', { params: { orderId: first.body.orderId } });
  assert.strictEqual(detail.body.amounts.finalPayable, 55000 + 9900);
  const tickets = await callLayer(orders, deps, 'get', '/orders/:orderId/tickets', { params: { orderId: first.body.orderId } });
  assert.strictEqual(tickets.body.data.length, 1);
  assert.strictEqual(tickets.body.data[0].ticketCode.length, 12);
  const cancel = await callLayer(orders, deps, 'post', '/orders/:orderId/cancel', { params: { orderId: first.body.orderId }, body: {} });
  assert.strictEqual(cancel.body.status, 'cancelled');
  assert.strictEqual(cancel.body.refundAmount, 55000 + 9900);
  db.tables.holds.push({ id: 'OLD', event_id: 'EV1', user_id: 'U1', status: 'active', expires_at: new Date(Date.now() - 1000).toISOString() });
  const expired = await callLayer(orders, deps, 'post', '/orders', { body: { holdId: 'OLD', attendees: [{ name: 'Zed' }] } });
  assert.strictEqual(expired.statusCode, 410);
  assert.strictEqual(expired.body.error.code, 'HOLD_EXPIRED');
}

async function main() {
  testQuoteMath();
  console.log('ok - quote math (53100 example)');
  await testHoldFlow();
  console.log('ok - hold flow with stubs');
  await testOrderFlow();
  console.log('ok - order flow with stubs (idempotent create, detail, tickets, cancel, HOLD_EXPIRED)');
  const db = stubDb();
  const deps = stubDeps(db);
  db.tables.tiers.push({ id: 'T2', event_id: 'EV1', name: 'Gen', price: 1000, capacity: 10, sold_count: 8 });
  const conflict = await callLayer(ticketing, deps, 'patch', '/tiers/:tierId', { params: { tierId: 'T2' }, body: { capacity: 5 } });
  assert.strictEqual(conflict.body.error.code, 'TIER_CAPACITY_CONFLICT');
  const hasSales = await callLayer(ticketing, deps, 'delete', '/tiers/:tierId', { params: { tierId: 'T2' } });
  assert.strictEqual(hasSales.body.error.code, 'TIER_HAS_SALES');
  console.log('ok - TIER_CAPACITY_CONFLICT / TIER_HAS_SALES');
}

if (require.main === module) main().then(() => {}, (e) => { console.error('FAIL', e); process.exit(1); });
module.exports = { testQuoteMath };
