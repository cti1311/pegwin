'use strict';
// Payments repository: all SQL for payments, payment_methods, billing_info,
// refunds. Owns query text; no business rules here.
module.exports = (db) => ({
  async activeForOrder(orderId) {
    const [rows] = await db.execute(
      'SELECT id FROM payments WHERE order_id=? AND status IN ("pending","success") LIMIT 1', [orderId]);
    return rows;
  },
  async insertIntent({ paymentId, orderId, userId, amount, method, gateway, gatewayOrderId, createdAt }) {
    await db.execute(
      'INSERT INTO payments(id,order_id,user_id,amount,method,gateway,gateway_order_id,status,attempts,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)',
      [paymentId, orderId, userId, amount, method, gateway, gatewayOrderId, 'pending', createdAt]
    );
  },
  async history(userId, limit, off) {
    const [rows] = await db.execute(
      'SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?', [userId, limit, off]);
    return rows;
  },
  async countHistory(userId) {
    const [[{ total }]] = await db.execute('SELECT COUNT(*) total FROM payments WHERE user_id=?', [userId]);
    return total;
  },
  async methods(userId) {
    const [rows] = await db.execute(
      'SELECT id,type,brand,last4,upi_id upiId,is_default isDefault FROM payment_methods WHERE user_id=?', [userId]);
    return rows;
  },
  async insertMethod({ id, userId, type, createdAt }) {
    await db.execute('INSERT INTO payment_methods(id,user_id,type,created_at) VALUES(?,?,?,?)',
      [id, userId, type, createdAt]);
  },
  async deleteMethod(methodId, userId) {
    const [r] = await db.execute('DELETE FROM payment_methods WHERE id=? AND user_id=?', [methodId, userId]);
    return r.affectedRows;
  },
  async clearDefault(userId) {
    await db.execute('UPDATE payment_methods SET is_default=0 WHERE user_id=?', [userId]);
  },
  async setDefault(methodId, userId) {
    const [r] = await db.execute('UPDATE payment_methods SET is_default=1 WHERE id=? AND user_id=?', [methodId, userId]);
    return r.affectedRows;
  },
  async billing(userId) {
    const [rows] = await db.execute(
      'SELECT full_name fullName,address,city,state,pincode FROM billing_info WHERE user_id=?', [userId]);
    return rows[0] || null;
  },
  async upsertBilling({ userId, fullName, address, city, state, pincode }) {
    await db.execute(
      'INSERT INTO billing_info(user_id,full_name,address,city,state,pincode) VALUES(?,?,?,?,?,?) ' +
      'ON DUPLICATE KEY UPDATE full_name=VALUES(full_name),address=VALUES(address),city=VALUES(city),state=VALUES(state),pincode=VALUES(pincode)',
      [userId, fullName, address, city, state, pincode]
    );
  },
  async findPayment(paymentId) {
    const [rows] = await db.execute('SELECT * FROM payments WHERE id=?', [paymentId]);
    return rows[0] || null;
  },
  async findPaymentAmount(paymentId) {
    const [rows] = await db.execute('SELECT id,amount,user_id AS userId FROM payments WHERE id=?', [paymentId]);
    return rows[0] || null;
  },
  async confirmFromWebhook(paymentId, status, confirmedAt, eventId) {
    await db.execute('UPDATE payments SET status=?, confirmed_at=?, gateway_event_id=? WHERE id=? AND status="pending"',
      [status, confirmedAt, eventId, paymentId]);
  },
  async insertRefund({ refundId, paymentId, amount, reason, createdAt }) {
    await db.execute('INSERT INTO refunds(id,payment_id,amount,reason,status,created_at) VALUES(?,?,?,?,?,?)',
      [refundId, paymentId, amount, reason, 'pending', createdAt]);
  },
  async markRefunded(paymentId, full) {
    await db.execute('UPDATE payments SET status=? WHERE id=?',
      [full ? 'refunded' : 'partially_refunded', paymentId]);
  },
  async refundsFor(paymentId) {
    const [rows] = await db.execute('SELECT * FROM refunds WHERE payment_id=?', [paymentId]);
    return rows;
  }
});
