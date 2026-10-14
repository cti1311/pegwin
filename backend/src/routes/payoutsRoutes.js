'use strict';
// Payouts routes: thin HTTP mapping over payouts/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
// Draft-gated: when config.paymentsDraft === false every route 404s.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/payoutsRepository');
const makeService = require('../services/payoutsService');

module.exports = (deps) => {
  const router = express.Router();
  const { auth, errors } = deps;
  if ((deps.config || {}).paymentsDraft === false) {
    router.use((req, res) => errors.send(res, 404, 'NOT_FOUND', 'Payouts API disabled'));
    return router;
  }
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid });
  const H = auth('host'), A = auth('super_admin');
  const sendErr = errors.send;
  const W = withDomainErrors(sendErr);
  const send = (res, out) => res.status(out.status).json(out.body);

  router.get('/hosts/me/payouts', H, W(async (req, res) => {
    send(res, await svc.myPayouts(req.user.id, req.query));
  }));
  router.post('/hosts/me/payout-requests', H, W(async (req, res) => {
    send(res, await svc.requestPayout(req.user.id, (req.body || {}).amount));
  }));
  router.get('/hosts/me/payout-schedule', H, (req, res) => {
    const out = svc.schedule();
    send(res, out);
  });
  router.get('/hosts/me/transactions', H, W(async (req, res) => {
    send(res, await svc.transactions(req.user.id, req.query || {}));
  }));
  router.get('/admin/payouts', A, W(async (req, res) => {
    send(res, await svc.adminList(req.query || {}));
  }));
  router.post('/admin/payouts', A, W(async (req, res) => {
    const { eventId, hostId, amount } = req.body || {};
    send(res, await svc.adminCreate({ eventId, hostId, amount }));
  }));
  router.patch('/admin/payouts/:payoutId', A, W(async (req, res) => {
    const { status, reference } = req.body || {};
    send(res, await svc.adminUpdate(req.params.payoutId, { status, reference }));
  }));
  router.get('/hosts/me/verification', H, W(async (req, res) => {
    send(res, await svc.verification(req.user.id));
  }));
  router.get('/hosts/me/payout-accounts', H, W(async (req, res) => {
    send(res, await svc.accounts(req.user.id));
  }));
  router.post('/hosts/me/payout-accounts', H, W(async (req, res) => {
    send(res, await svc.connectAccount(req.user.id, req.body || {}));
  }));
  router.patch('/hosts/me/payout-accounts/:accountId', H, W(async (req, res) => {
    send(res, await svc.updateAccount(req.user.id, req.params.accountId, req.body || {}));
  }));
  router.post('/hosts/me/payout-accounts/:accountId/disconnect', H, W(async (req, res) => {
    send(res, await svc.disconnectAccount(req.user.id, req.params.accountId));
  }));
  router.get('/hosts/me/tax-info', H, W(async (req, res) => {
    send(res, await svc.taxInfo(req.user.id));
  }));
  router.patch('/hosts/me/tax-info', H, W(async (req, res) => {
    send(res, await svc.updateTaxInfo(req.user.id, req.body || {}));
  }));
  router.get('/hosts/me/invoices', H, W(async (req, res) => {
    send(res, await svc.invoices(req.user.id, req.query));
  }));
  router.get('/hosts/me/invoices/:invoiceId', H, W(async (req, res) => {
    send(res, await svc.invoice(req.user.id, req.params.invoiceId));
  }));
  return router;
};
