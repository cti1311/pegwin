'use strict';
// Payouts service: requests, ledger, admin control, accounts, tax, invoices.
// Throws domain errors { status, code, message } (mapped by errorHandler);
// returns { status, body } on success. No HTTP here.
const { TXN_TYPES, now, last4, verifiedAccountCard } = require('../models/payoutsModel');
const D = require('../dtos/payoutsDto');

function fail(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}

module.exports = (repo, ctx) => {
  const uid = ctx.uid;

  return {
    async myPayouts(hostId, q) {
      const pq = q || {};
      const page = Math.max(1, parseInt(pq.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(pq.limit, 10) || 20));
      const off = (page - 1) * limit;
      const { rows, total } = await repo.page(
        'SELECT * FROM payouts WHERE host_id=? ORDER BY created_at DESC', [hostId], limit, off);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    async requestPayout(hostId, rawAmount) {
      const amount = D.parseAmount(rawAmount);
      const id = uid();
      await repo.insertRequest({ id, hostId, amount: amount == null ? 0 : amount, createdAt: now() });
      return { status: 201, body: { payoutId: id, status: 'pending' } };
    },
    schedule() {
      return { status: 200, body: { policy: 'manual, ~5-7 days post-event', nextEta: null } };
    },
    async transactions(hostId, q) {
      const query = q || {};
      if (query.type && !TXN_TYPES.includes(query.type)) {
        fail(400, 'VALIDATION_ERROR', 'type must be sale|refund|fee|payout');
      }
      let sql = 'SELECT * FROM payouts WHERE host_id=?';
      const args = [hostId];
      if (query.eventId) { sql += ' AND event_id=?'; args.push(query.eventId); }
      const page = Math.max(1, parseInt(query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
      const off = (page - 1) * limit;
      const { rows, total } = await repo.page(sql + ' ORDER BY created_at DESC', args, limit, off);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    async adminList(q) {
      const query = q || {};
      let sql = 'SELECT * FROM payouts WHERE 1=1';
      const args = [];
      for (const [c, k] of [['status', 'status'], ['event_id', 'eventId'], ['host_id', 'hostId']]) {
        if (query[k]) { sql += ' AND ' + c + '=?'; args.push(query[k]); }
      }
      const page = Math.max(1, parseInt(query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
      const off = (page - 1) * limit;
      const { rows, total } = await repo.page(sql + ' ORDER BY created_at DESC', args, limit, off);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    async adminCreate(b) {
      const { eventId, hostId, amount } = D.parseAdminCreate(b);
      const id = uid();
      await repo.insertAdmin({ id, eventId, hostId, amount, createdAt: now() });
      return { status: 201, body: { id, status: 'pending' } };
    },
    async adminUpdate(payoutId, b) {
      const { status, reference } = D.parseAdminUpdate(b);
      const affected = await repo.updateStatus(payoutId, status, reference || null);
      if (!affected) fail(404, 'NOT_FOUND', 'Payout not found');
      return { status: 200, body: { id: payoutId, status } };
    },
    async verification(hostId) {
      const a = await repo.verifiedAccount(hostId);
      return {
        status: 200,
        body: {
          identity: { status: 'unverified' }, payoutAccount: verifiedAccountCard(a),
          hosting: { freeEvents: 'available', paidEvents: 'available', communityHosting: 'available' }
        }
      };
    },
    async accounts(hostId) {
      const page = 1, limit = 100, off = 0;
      const { rows, total } = await repo.page(
        'SELECT id,bank_name bankName,last4,holder,method,status FROM payout_accounts WHERE host_id=?',
        [hostId], limit, off);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    async connectAccount(hostId, b) {
      const { bankName, accountNumber, ifsc, holder } = D.parseAccount(b);
      const id = uid();
      await repo.insertAccount({
        id, hostId, bankName, last4: last4(accountNumber), ifsc, holder, createdAt: now()
      });
      return { status: 201, body: { id, status: 'pending' } };
    },
    async updateAccount(hostId, accountId, b) {
      const { bankName, accountNumber, ifsc, holder } = b;
      const affected = await repo.updateAccount({
        accountId, hostId, bankName: bankName || null,
        last4: accountNumber ? last4(accountNumber) : null,
        ifsc: ifsc || null, holder: holder || null
      });
      if (!affected) fail(404, 'NOT_FOUND', 'Account not found');
      return { status: 200, body: { id: accountId } };
    },
    async disconnectAccount(hostId, accountId) {
      const affected = await repo.disconnectAccount(accountId, hostId);
      if (!affected) fail(404, 'NOT_FOUND', 'Account not found');
      return { status: 200, body: { id: accountId, status: 'disconnected' } };
    },
    async taxInfo(hostId) {
      const row = await repo.taxProfile(hostId);
      return { status: 200, body: row ? JSON.parse(row.profile) : {} };
    },
    async updateTaxInfo(hostId, body) {
      await repo.upsertTaxProfile(hostId, JSON.stringify(body || {}), now());
      return { status: 200, body: { updated: true } };
    },
    async invoices(hostId, q) {
      const query = q || {};
      const page = Math.max(1, parseInt(query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
      const off = (page - 1) * limit;
      const { rows, total } = await repo.page(
        'SELECT * FROM payouts WHERE host_id=? AND status="paid"', [hostId], limit, off);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    async invoice(hostId, invoiceId) {
      const row = await repo.findInvoice(invoiceId, hostId);
      if (!row) fail(404, 'NOT_FOUND', 'Invoice not found');
      return { status: 200, body: row };
    }
  };
};
