'use strict';
// Payments service: intents, instruments, billing, status, webhooks, refunds.
// Throws domain errors { status, code, message } (mapped by errorHandler);
// returns { status, body } on success. No HTTP here.
const { gwPick, now, webhookStatus } = require('../models/paymentsModel');
const D = require('../dtos/paymentsDto');

function fail(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}
function isDomain(e) {
  return e && Number.isInteger(e.status);
}

module.exports = (repo, ctx) => {
  const uid = ctx.uid;
  const http = ctx.http;
  const cfg = ctx.config || {};
  const notify = ctx.notify || null;
  const seen = new Set();

  return {
    async createIntent(userId, b) {
      const { orderId, method, gateway } = D.parseIntent(b);
      try {
        const held = await repo.activeForOrder(orderId);
        if (held.length) fail(409, 'PAYMENT_ALREADY_EXISTS', 'Order already has an active payment');
        const gw = gwPick(gateway);
        const paymentId = uid();
        let payload = {};
        try {
          const r = await http.post(gw === 'cashfree' ? cfg.cashfreeUrl : cfg.razorpayUrl, { orderId, method, paymentId });
          payload = (r && r.data) || {};
        } catch (e) {
          fail(502, 'GATEWAY_ERROR', 'Gateway unreachable; retry safe, webhooks reconcile');
        }
        const gOrderId = payload.gatewayOrderId || payload.id || (gw + '_' + paymentId);
        await repo.insertIntent({
          paymentId, orderId, userId, amount: 0, method, gateway: gw,
          gatewayOrderId: gOrderId, createdAt: now()
        });
        return { status: 201, body: { paymentId, gateway: gw, gatewayOrderId: gOrderId, checkoutPayload: payload } };
      } catch (e) {
        if (isDomain(e)) throw e;
        fail(500, 'INTERNAL_ERROR', 'Could not create intent');
      }
    },
    async history(userId, q) {
      const pq = q || {};
      const page = Math.max(1, parseInt(pq.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(pq.limit, 10) || 20));
      const off = (page - 1) * limit;
      const rows = await repo.history(userId, limit, off);
      const total = await repo.countHistory(userId);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    async methods(userId) {
      return { status: 200, body: { data: await repo.methods(userId) } };
    },
    async addMethod(userId, rawType) {
      const type = D.parseMethodType(rawType);
      const id = uid();
      await repo.insertMethod({ id, userId, type, createdAt: now() });
      return { status: 201, body: { id, type, tokenizeWith: 'gateway', createdAt: now() } };
    },
    async removeMethod(userId, methodId) {
      const affected = await repo.deleteMethod(methodId, userId);
      if (!affected) fail(404, 'NOT_FOUND', 'Method not found');
      return { status: 204 };
    },
    async setDefaultMethod(userId, methodId) {
      await repo.clearDefault(userId);
      const affected = await repo.setDefault(methodId, userId);
      if (!affected) fail(404, 'NOT_FOUND', 'Method not found');
      return { status: 200, body: { id: methodId, isDefault: true } };
    },
    async billing(userId) {
      return { status: 200, body: (await repo.billing(userId)) || {} };
    },
    async updateBilling(userId, b) {
      const input = D.parseBilling(b);
      await repo.upsertBilling({ userId, ...input });
      return { status: 200, body: { updated: true } };
    },
    async paymentStatus(paymentId) {
      const row = await repo.findPayment(paymentId);
      if (!row) fail(404, 'NOT_FOUND', 'Payment not found');
      return { status: 200, body: row };
    },
    async webhook(gw, body, headers, rawBody) {
      const secret = gw === 'cashfree' ? cfg.cashfreeWebhookSecret : cfg.razorpayWebhookSecret;
      const { verifySignature } = require('../models/paymentsModel');
      const raw = rawBody || JSON.stringify(body || {});
      const sig = (headers || {})['x-cf-signature'] || (headers || {})['x-razorpay-signature'];
      if (!verifySignature(secret, raw, sig)) fail(401, 'UNAUTHENTICATED', 'Bad webhook signature');
      const eventId = body.eventId || body.event_id || (headers || {})['x-event-id'];
      if (eventId && seen.has(gw + ':' + eventId)) return { status: 200, body: { received: true, deduped: true } };
      const status = webhookStatus(body || {});
      if (body.paymentId || body.payment_id) {
        await repo.confirmFromWebhook(body.paymentId || body.payment_id, status, now(), eventId || null);
      }
      if (eventId) seen.add(gw + ':' + eventId);
      return { status: 200, body: { received: true } };
    },
    async createRefund(paymentId, b) {
      const { amount, reason } = D.parseRefund(b);
      try {
        const row = await repo.findPaymentAmount(paymentId);
        if (!row) fail(404, 'NOT_FOUND', 'Payment not found');
        const refundId = uid();
        await repo.insertRefund({
          refundId, paymentId, amount: amount == null ? row.amount : amount, reason, createdAt: now()
        });
        await repo.markRefunded(paymentId, amount == null);
        if (notify && row.userId) {
          await notify.dispatch({
            recipients: [{ userId: row.userId }],
            type: 'refund',
            title: 'Refund initiated',
            body: `Refund of ₹${(Number(amount == null ? row.amount : amount) / 100).toFixed(2)} for payment ${paymentId} is on its way.`,
            refType: 'refund', refId: refundId
          });
        }
        return { status: 201, body: { refundId, status: 'pending' } };
      } catch (e) {
        if (isDomain(e)) throw e;
        fail(502, 'REFUND_FAILED', 'Refund failed; safe to retry');
      }
    },
    async refunds(paymentId) {
      return { status: 200, body: { data: await repo.refundsFor(paymentId) } };
    }
  };
};
