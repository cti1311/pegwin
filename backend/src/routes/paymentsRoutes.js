'use strict';
// Payments routes: thin HTTP mapping over payments/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
// Draft-gated: when config.paymentsDraft === false every route 404s.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/paymentsRepository');
const makeService = require('../services/paymentsService');
const makeNotify = require('../services/notificationsService');
const makeEngagementRepo = require('../repositories/engagementRepository');

module.exports = (deps) => {
  const router = express.Router();
  const { auth, errors } = deps;
  const cfg = deps.config || {};
  if (cfg.paymentsDraft === false) {
    router.use((req, res) => errors.send(res, 404, 'NOT_FOUND', 'Payments API disabled'));
    return router;
  }
  // Notify only with full app config, so stub-dep suites run the slice alone.
  const notify = deps.config
    ? makeNotify(makeEngagementRepo(deps.db), { uid: deps.uid, config: deps.config })
    : null;
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid, http: deps.http, config: cfg, notify });
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr);
  const send = (res, out) => (out.status === 204 ? res.status(204).end() : res.status(out.status).json(out.body));

  router.post('/payments/intents', auth('user'), A(async (req, res) => {
    send(res, await svc.createIntent(req.user.id, req.body || {}));
  }));
  router.get('/users/me/payments', auth('user'), A(async (req, res) => {
    send(res, await svc.history(req.user.id, req.query));
  }));
  router.get('/users/me/payment-methods', auth('user'), A(async (req, res) => {
    send(res, await svc.methods(req.user.id));
  }));
  router.post('/users/me/payment-methods', auth('user'), A(async (req, res) => {
    send(res, await svc.addMethod(req.user.id, (req.body || {}).type));
  }));
  router.delete('/users/me/payment-methods/:methodId', auth('user'), A(async (req, res) => {
    send(res, await svc.removeMethod(req.user.id, req.params.methodId));
  }));
  router.patch('/users/me/payment-methods/:methodId/default', auth('user'), A(async (req, res) => {
    send(res, await svc.setDefaultMethod(req.user.id, req.params.methodId));
  }));
  router.get('/users/me/billing-info', auth('user'), A(async (req, res) => {
    send(res, await svc.billing(req.user.id));
  }));
  router.patch('/users/me/billing-info', auth('user'), A(async (req, res) => {
    send(res, await svc.updateBilling(req.user.id, req.body || {}));
  }));
  router.get('/payments/:paymentId', auth(['user', 'host', 'super_admin']), A(async (req, res) => {
    send(res, await svc.paymentStatus(req.params.paymentId));
  }));
  router.post('/webhooks/cashfree', A(async (req, res) => {
    send(res, await svc.webhook('cashfree', req.body || {}, req.headers || {}, req.rawBody));
  }));
  router.post('/webhooks/razorpay', A(async (req, res) => {
    send(res, await svc.webhook('razorpay', req.body || {}, req.headers || {}, req.rawBody));
  }));
  router.post('/payments/:paymentId/refunds', auth('super_admin'), A(async (req, res) => {
    send(res, await svc.createRefund(req.params.paymentId, req.body || {}));
  }));
  router.get('/payments/:paymentId/refunds', auth(['user', 'super_admin']), A(async (req, res) => {
    send(res, await svc.refunds(req.params.paymentId));
  }));
  return router;
};
