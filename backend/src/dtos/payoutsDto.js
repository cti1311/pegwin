'use strict';
// Payouts DTOs: request parsing/validation for §9-9b.
const { fail } = require('../helpers/domainError');
const M = require('../models/payoutsModel');

function parseAmount(amount) {
  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
    fail(400, 'VALIDATION_ERROR', 'amount must be positive int paise');
  }
  return amount;
}
function parseAdminCreate(b) {
  const body = b || {};
  const { eventId, hostId, amount } = body;
  if (!eventId || !M.ULID.test(eventId) || !hostId || !Number.isInteger(amount) || amount <= 0) {
    fail(400, 'VALIDATION_ERROR', 'eventId, hostId, positive int amount required');
  }
  return { eventId, hostId, amount };
}
function parseAdminUpdate(b) {
  const body = b || {};
  const { status, reference } = body;
  if (!M.PAYOUT_STATUSES.includes(status)) fail(400, 'VALIDATION_ERROR', 'status must be processing|paid|failed');
  return { status, reference };
}
function parseAccount(b) {
  const body = b || {};
  const { bankName, accountNumber, ifsc, holder } = body;
  if (!bankName || bankName.length > 100 || !holder || holder.length > 100 ||
      !M.ACCT.test(accountNumber || '') || !M.IFSC.test(ifsc || '')) {
    fail(400, 'VALIDATION_ERROR', 'bankName, accountNumber (9-18 digits), ifsc, holder required');
  }
  return { bankName, accountNumber, ifsc, holder };
}
module.exports = { parseAmount, parseAdminCreate, parseAdminUpdate, parseAccount };
