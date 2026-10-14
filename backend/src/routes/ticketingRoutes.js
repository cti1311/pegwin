'use strict';
// Ticketing routes (spec sections 6, 6a): thin HTTP mapping over ticketing/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors, needRole } = require('../helpers/asyncRoute');
const { pageParams, priceLines, applyCoupon, totals, HOLD_TTL_SEC } = require('../models/ticketingModel');
const makeRepository = require('../repositories/ticketingRepository');
const makeService = require('../services/ticketingService');


const factory = (deps) => {
  const { auth, errors } = deps;
  const router = express.Router();
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid });
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr);
  const send = (res, out) => (out.status === 204 ? res.status(204).end() : res.status(out.status).json(out.body));
  const needHost = needRole(auth, 'host'), needUser = needRole(auth, 'user'), needAdmin = needRole(auth, 'super_admin');

  router.post('/events/:eventId/tiers', needHost, A(async (req, res) => {
    send(res, await svc.createTier(req.params.eventId, req.body || {}));
  }));
  router.get('/events/:eventId/tiers', A(async (req, res) => {
    const { page, limit, offset } = pageParams(req.query);
    send(res, await svc.listTiers(req.params.eventId, page, limit, offset));
  }));
  router.patch('/tiers/:tierId', needHost, A(async (req, res) => {
    send(res, await svc.patchTier(req.params.tierId, req.body || {}));
  }));
  router.delete('/tiers/:tierId', needHost, A(async (req, res) => {
    send(res, await svc.deleteTier(req.params.tierId));
  }));
  router.post('/checkout/quote', needUser, A(async (req, res) => {
    send(res, await svc.quote(req.body && req.body.items, req.body && req.body.couponCode));
  }));
  router.post('/checkout/holds', needUser, A(async (req, res) => {
    send(res, await svc.createHold(req.body && req.body.items, req.user ? req.user.id : null));
  }));
  router.get('/checkout/holds/:holdId', needUser, A(async (req, res) => {
    send(res, await svc.getHold(req.params.holdId));
  }));
  router.delete('/checkout/holds/:holdId', needUser, A(async (req, res) => {
    send(res, await svc.releaseHold(req.params.holdId));
  }));
  router.post('/checkout/coupons/validate', needUser, A(async (req, res) => {
    const { code, tierId, qty } = req.body || {};
    send(res, await svc.validateCoupon(code, tierId, qty));
  }));
  router.post('/admin/coupons', needAdmin, A(async (req, res) => {
    send(res, await svc.createCoupon(req.body || {}));
  }));
  router.get('/admin/coupons', needAdmin, A(async (req, res) => {
    const { page, limit, offset } = pageParams(req.query);
    send(res, await svc.listCoupons(page, limit, offset));
  }));
  router.patch('/admin/coupons/:couponId', needAdmin, A(async (req, res) => {
    send(res, await svc.patchCoupon(req.params.couponId, req.body || {}));
  }));
  return router;
};

module.exports = factory;
// Re-exported for the pricing unit tests (unchanged math).
module.exports.priceLines = priceLines;
module.exports.applyCoupon = applyCoupon;
module.exports.totals = totals;
module.exports.HOLD_TTL_SEC = HOLD_TTL_SEC;
