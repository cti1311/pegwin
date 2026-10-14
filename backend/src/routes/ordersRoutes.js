'use strict';
// Orders routes: thin HTTP mapping over orders/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors, needRole } = require('../helpers/asyncRoute');
const { ticketCode } = require('../models/ordersModel');
const makeRepository = require('../repositories/ordersRepository');
const makeService = require('../services/ordersService');
const makeNotify = require('../services/notificationsService');
const makeEngagementRepo = require('../repositories/engagementRepository');


const factory = (deps) => {
  const { auth, errors } = deps;
  const router = express.Router();
  // Notify only with full app config, so stub-dep suites run the slice alone.
  const notify = deps.config
    ? makeNotify(makeEngagementRepo(deps.db), { uid: deps.uid, config: deps.config })
    : null;
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid, notify });
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr);
  const send = (res, out) => res.status(out.status).json(out.body);
  const needUser = needRole(auth, 'user');

  // POST /orders (idempotent via Idempotency-Key)
  router.post('/orders', needUser, A(async (req, res) => {
    const { holdId, attendees, couponCode, paymentMethodId } = req.body || {};
    const key = req.get ? req.get('Idempotency-Key') : req.headers && req.headers['idempotency-key'];
    const userId = req.user ? req.user.id : null;
    send(res, await svc.create({ holdId, attendees, couponCode, paymentMethodId }, key, userId));
  }));
  router.get('/orders/:orderId', needUser, A(async (req, res) => {
    send(res, await svc.detail(req.params.orderId));
  }));
  router.get('/orders/:orderId/tickets', needUser, A(async (req, res) => {
    send(res, await svc.tickets(req.params.orderId));
  }));
  router.post('/orders/:orderId/cancel', needUser, A(async (req, res) => {
    send(res, await svc.cancel(req.params.orderId));
  }));
  router.get('/orders/:orderId/receipt', needUser, A(async (req, res) => {
    send(res, await svc.receipt(req.params.orderId));
  }));
  router.get('/tickets/:ticketCode', needUser, A(async (req, res) => {
    send(res, await svc.ticketByCode(req.params.ticketCode));
  }));

  return router;
};

module.exports = factory;
module.exports.ticketCode = ticketCode;
