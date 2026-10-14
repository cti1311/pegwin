'use strict';
// Payments DTOs: request parsing/validation for §8-8a.
const { fail } = require('../helpers/domainError');
const M = require('../models/paymentsModel');

function parseIntent(b) {
  const body = b || {};
  const { orderId, method, gateway } = body;
  if (!orderId || !M.ULID.test(orderId) || !M.METHODS.includes(method)) {
    fail(400, 'VALIDATION_ERROR', 'orderId (ULID) and method (upi|card) required');
  }
  if (gateway && !M.GATEWAYS.includes(gateway)) {
    fail(400, 'VALIDATION_ERROR', 'gateway must be auto|cashfree|razorpay');
  }
  return { orderId, method, gateway };
}
function parseMethodType(type) {
  if (!['card', 'upi'].includes(type)) fail(400, 'VALIDATION_ERROR', 'type must be card|upi');
  return type;
}
function parseBilling(b) {
  const body = b || {};
  if (body.pincode && !M.PINCODE.test(body.pincode)) {
    fail(400, 'VALIDATION_ERROR', 'pincode must be 6 digits');
  }
  return {
    fullName: body.fullName || null, address: body.address || null, city: body.city || null,
    state: body.state || null, pincode: body.pincode || null
  };
}
function parseRefund(b) {
  const body = b || {};
  const { amount, reason } = body;
  if (!reason || reason.length > 500 || (amount !== undefined && (!Number.isInteger(amount) || amount <= 0))) {
    fail(400, 'VALIDATION_ERROR', 'reason (1-500) required; amount positive int paise');
  }
  return { amount, reason };
}

module.exports = { parseIntent, parseMethodType, parseBilling, parseRefund };
