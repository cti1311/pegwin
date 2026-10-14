'use strict';
// Payouts repository: all SQL for payouts, payout_accounts, tax_info.
// Owns query text; no business rules here.
module.exports = (db) => {
  async function page(sql, args, limit, off) {
    const [rows] = await db.execute(sql + ' LIMIT ? OFFSET ?', args.concat([limit, off]));
    const [crows] = await db.execute('SELECT COUNT(*) total FROM (' + sql + ') t', args);
    return { rows, total: (crows[0] && crows[0].total != null) ? crows[0].total : rows.length };
  }
  return {
    page,
    async insertRequest({ id, hostId, amount, createdAt }) {
      await db.execute('INSERT INTO payouts(id,host_id,net_amount,status,created_at) VALUES(?,?,?,"pending",?)',
        [id, hostId, amount, createdAt]);
    },
    async insertAdmin({ id, eventId, hostId, amount, createdAt }) {
      await db.execute('INSERT INTO payouts(id,event_id,host_id,net_amount,status,created_at) VALUES(?,?,?,?,?,?)',
        [id, eventId, hostId, amount, 'pending', createdAt]);
    },
    async updateStatus(payoutId, status, reference) {
      const [r] = await db.execute('UPDATE payouts SET status=?, reference=? WHERE id=?',
        [status, reference, payoutId]);
      return r.affectedRows;
    },
    async verifiedAccount(hostId) {
      const [rows] = await db.execute(
        'SELECT * FROM payout_accounts WHERE host_id=? AND status="verified" LIMIT 1', [hostId]);
      return rows[0] || null;
    },
    async insertAccount({ id, hostId, bankName, last4, ifsc, holder, createdAt }) {
      await db.execute(
        'INSERT INTO payout_accounts(id,host_id,bank_name,last4,ifsc,holder,method,status,created_at) VALUES(?,?,?,?,?,?,"Bank Account","pending",?)',
        [id, hostId, bankName, last4, ifsc, holder, createdAt]
      );
    },
    async updateAccount({ accountId, hostId, bankName, last4, ifsc, holder }) {
      const [r] = await db.execute(
        'UPDATE payout_accounts SET bank_name=COALESCE(?,bank_name),last4=COALESCE(?,last4),ifsc=COALESCE(?,ifsc),holder=COALESCE(?,holder) WHERE id=? AND host_id=?',
        [bankName, last4, ifsc, holder, accountId, hostId]
      );
      return r.affectedRows;
    },
    async disconnectAccount(accountId, hostId) {
      const [r] = await db.execute('UPDATE payout_accounts SET status="disconnected" WHERE id=? AND host_id=?',
        [accountId, hostId]);
      return r.affectedRows;
    },
    async taxProfile(hostId) {
      const [rows] = await db.execute('SELECT profile FROM tax_info WHERE host_id=?', [hostId]);
      return rows[0] || null;
    },
    async findInvoice(invoiceId, hostId) {
      const [rows] = await db.execute('SELECT * FROM payouts WHERE id=? AND host_id=?', [invoiceId, hostId]);
      return rows[0] || null;
    },
    async upsertTaxProfile(hostId, profile, updatedAt) {
      await db.execute(
        'INSERT INTO tax_info(host_id,profile,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE profile=VALUES(profile),updated_at=VALUES(updated_at)',
        [hostId, profile, updatedAt]
      );
    }
  };
};
