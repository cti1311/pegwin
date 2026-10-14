'use strict';
// Payouts domain model: pure constants, validation, paging, account shaping.
// No database access here; see repository.js (queries) and service.js (flows).
const ULID = /^[0-9A-Z]{26}$/;
const TXN_TYPES = ['sale', 'refund', 'fee', 'payout'];
const PAYOUT_STATUSES = ['processing', 'paid', 'failed'];
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCT = /^\d{9,18}$/;

function pg(q) {
  q = q || {};
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return [page, limit, (page - 1) * limit];
}
const now = () => new Date().toISOString();
function last4(n) {
  return String(n).slice(-4);
}
function verifiedAccountCard(a) {
  return a
    ? { status: a.status, bankName: a.bank_name, last4: a.last4, holder: a.holder }
    : { status: 'unverified' };
}

module.exports = { ULID, TXN_TYPES, PAYOUT_STATUSES, IFSC, ACCT, pg, now, last4, verifiedAccountCard };
