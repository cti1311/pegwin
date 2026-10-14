'use strict';
// Payments domain model: pure constants, gateway pick, webhook verify, paging.
// No database access here; see repository.js (queries) and service.js (flows).
const crypto = require('crypto');

const ULID = /^[0-9A-Z]{26}$/;
const METHODS = ['upi', 'card'];
const GATEWAYS = ['auto', 'cashfree', 'razorpay'];
const PINCODE = /^\d{6}$/;

function pg(q) {
  q = q || {};
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return [page, limit, (page - 1) * limit];
}
const now = () => new Date().toISOString();
const gwPick = (g) => (g && g !== 'auto' ? g : (Math.random() < 0.5 ? 'cashfree' : 'razorpay'));

// Gateway webhook signature check. No secret configured => accept (dev/test).
function verifySignature(secret, raw, sig) {
  if (!secret) return true;
  if (!sig) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(crypto.createHmac('sha256', secret).update(raw || '').digest('hex')),
      Buffer.from(sig)
    );
  } catch (e) { return false; }
}
function webhookStatus(body) {
  return /success|paid|captured/i.test(body.status || body.event || '') ? 'success' : 'failed';
}

module.exports = { ULID, METHODS, GATEWAYS, PINCODE, pg, now, gwPick, verifySignature, webhookStatus };
