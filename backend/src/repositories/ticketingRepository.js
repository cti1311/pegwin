'use strict';
// Ticketing repository: all SQL for tiers, holds, hold_items, coupons.
// Owns query text; no business rules here.
module.exports = (db) => ({
  async insertTier({ id, eventId, name, price, capacity }) {
    await db.execute(
      'INSERT INTO tiers (id, event_id, name, price, capacity, sold_count) VALUES (?,?,?,?,?,0)',
      [id, eventId, name, price, capacity]
    );
  },
  async listTiers(eventId, limit, offset) {
    const [rows] = await db.execute('SELECT * FROM tiers WHERE event_id=? LIMIT ? OFFSET ?', [eventId, limit, offset]);
    return rows;
  },
  async countTiers(eventId) {
    const [n] = await db.execute('SELECT COUNT(*) AS total FROM tiers WHERE event_id=?', [eventId]);
    return n;
  },
  async findTier(tierId) {
    const [rows] = await db.execute('SELECT * FROM tiers WHERE id=?', [tierId]);
    return rows[0];
  },
  async updateTier(id, name, price, capacity) {
    await db.execute('UPDATE tiers SET name=?, price=?, capacity=? WHERE id=?', [name, price, capacity, id]);
  },
  async deleteTier(tierId) {
    await db.execute('DELETE FROM tiers WHERE id=?', [tierId]);
  },
  async heldQty(tierId) {
    const [r] = await db.execute(
      "SELECT COALESCE(SUM(hi.qty),0) AS held FROM hold_items hi JOIN holds h ON h.id=hi.hold_id WHERE hi.tier_id=? AND h.status='active' AND h.expires_at > UTC_TIMESTAMP()",
      [tierId]
    );
    return r[0] ? r[0].held : 0;
  },
  async insertHold({ holdId, eventId, userId, expiresAt }) {
    await db.execute("INSERT INTO holds (id, event_id, user_id, status, expires_at) VALUES (?,?,?,'active',?)",
      [holdId, eventId, userId, expiresAt]);
  },
  async insertHoldItem({ id, holdId, tierId, qty, unitPrice }) {
    await db.execute('INSERT INTO hold_items (id, hold_id, tier_id, qty, unit_price) VALUES (?,?,?,?,?)',
      [id, holdId, tierId, qty, unitPrice]);
  },
  async findHold(holdId) {
    const [rows] = await db.execute('SELECT * FROM holds WHERE id=?', [holdId]);
    return rows[0];
  },
  async releaseHold(holdId) {
    await db.execute("UPDATE holds SET status='released' WHERE id=?", [holdId]);
  },
  async findCouponByCode(code) {
    const [rows] = await db.execute('SELECT * FROM coupons WHERE code=? AND enabled=1', [String(code).toUpperCase()]);
    return rows[0];
  },
  async insertCoupon({ id, code, discountType, value, eventId, tierId, maxUses, validFrom, validTo, discountBearer, enabled }) {
    await db.execute(
      'INSERT INTO coupons (id, code, discount_type, value, event_id, tier_id, max_uses, used_count, valid_from, valid_to, discount_bearer, enabled) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)',
      [id, code, discountType, value, eventId, tierId, maxUses, validFrom, validTo, discountBearer, enabled]
    );
  },
  async listCoupons(limit, offset) {
    const [rows] = await db.execute('SELECT * FROM coupons LIMIT ? OFFSET ?', [limit, offset]);
    return rows;
  },
  async findCouponById(couponId) {
    const [rows] = await db.execute('SELECT * FROM coupons WHERE id=?', [couponId]);
    return rows[0];
  },
  async updateCoupon(couponId, fields) {
    await db.execute(
      'UPDATE coupons SET discount_type=?, value=?, max_uses=?, valid_from=?, valid_to=?, discount_bearer=?, enabled=? WHERE id=?',
      [...fields, couponId]
    );
  }
});
