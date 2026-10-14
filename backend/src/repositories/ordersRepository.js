'use strict';
// Orders repository: all SQL for holds, orders, order_items, tickets
// (plus the coupon/tier reads checkout needs). Same query text as before.
module.exports = (db) => ({
  async findHold(holdId) {
    const [rows] = await db.execute('SELECT * FROM holds WHERE id=?', [holdId]);
    return rows[0] || null;
  },
  async holdItems(holdId) {
    const [rows] = await db.execute(
      'SELECT hi.*, t.name AS tier_name, t.price FROM hold_items hi JOIN tiers t ON t.id=hi.tier_id WHERE hi.hold_id=?',
      [holdId]
    );
    return rows;
  },
  async findCoupon(code) {
    const [rows] = await db.execute('SELECT * FROM coupons WHERE code=? AND enabled=1', [String(code).toUpperCase()]);
    return rows[0] || null;
  },
  async findIdempotentOrder(key, userId) {
    const [rows] = await db.execute('SELECT * FROM orders WHERE idempotency_key=? AND user_id=?', [key, userId]);
    return rows[0] || null;
  },
  async insertOrder(o) {
    await db.execute(
      'INSERT INTO orders (id, user_id, event_id, hold_id, coupon_id, status, host_price, platform_fee, display_price, discount, taxable_amount, gst, final_payable, payment_id, payment_status, idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [o.id, o.userId, o.eventId, o.holdId, o.couponId, o.status,
        o.hostPrice, o.platformFee, o.displayPrice, o.discount, o.taxableAmount, o.gst, o.finalPayable,
        o.paymentId, o.paymentStatus, o.idempotencyKey]
    );
  },
  async insertOrderItem({ id, orderId, tierId, tierName, qty, unitPrice }) {
    await db.execute('INSERT INTO order_items (id, order_id, tier_id, tier_name, qty, unit_price) VALUES (?,?,?,?,?,?)',
      [id, orderId, tierId, tierName, qty, unitPrice]);
  },
  async insertTicket({ code, orderId, tierId, eventId, name, phone, email, qr }) {
    await db.execute(
      "INSERT INTO tickets (ticket_code, order_id, tier_id, event_id, attendee_name, attendee_phone, attendee_email, qr_payload, holder_name, avatar_url, status) VALUES (?,?,?,?,?,?,?,?,?,NULL,'confirmed')",
      [code, orderId, tierId, eventId, name, phone, email, qr, name]
    );
  },
  async incrementTierSold(tierId, qty) {
    await db.execute('UPDATE tiers SET sold_count=sold_count+? WHERE id=?', [qty, tierId]);
  },
  async decrementTierSold(tierId, qty) {
    await db.execute('UPDATE tiers SET sold_count=GREATEST(0,sold_count-?) WHERE id=?', [qty, tierId]);
  },
  async bumpCouponUse(couponId) {
    await db.execute('UPDATE coupons SET used_count=used_count+1 WHERE id=?', [couponId]);
  },
  async consumeHold(holdId) {
    await db.execute("UPDATE holds SET status='consumed' WHERE id=?", [holdId]);
  },
  async findOrder(orderId) {
    const [rows] = await db.execute('SELECT * FROM orders WHERE id=?', [orderId]);
    return rows[0] || null;
  },
  async orderItems(orderId) {
    const [rows] = await db.execute('SELECT * FROM order_items WHERE order_id=?', [orderId]);
    return rows;
  },
  async orderTickets(orderId) {
    const [rows] = await db.execute(
      'SELECT tk.*, t.name AS tier_name FROM tickets tk JOIN tiers t ON t.id=tk.tier_id WHERE tk.order_id=?',
      [orderId]
    );
    return rows;
  },
  async cancelOrder(orderId) {
    await db.execute("UPDATE orders SET status='cancelled' WHERE id=?", [orderId]);
  },
  async cancelOrderTickets(orderId) {
    await db.execute("UPDATE tickets SET status='cancelled' WHERE order_id=?", [orderId]);
  },
  async findTicketByCode(ticketCode) {
    const [rows] = await db.execute(
      'SELECT tk.*, t.name AS tier_name FROM tickets tk JOIN tiers t ON t.id=tk.tier_id WHERE tk.ticket_code=?',
      [ticketCode]
    );
    return rows[0] || null;
  }
});
