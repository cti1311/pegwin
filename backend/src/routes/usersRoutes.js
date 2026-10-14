'use strict';
// Users routes (§3): thin HTTP mapping over users/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const { list, pageLimit } = require('../models/usersModel');
const { presentUser } = require('../dtos/usersDto');
const makeRepository = require('../repositories/usersRepository');
const makeService = require('../services/usersService');

module.exports = (deps) => {
  const router = express.Router();
  const svc = makeService(makeRepository(deps.db));
  const need = deps.auth('user', 'host', 'event_staff', 'super_admin');
  const sendErr = deps.errors.send;
  const ah = withDomainErrors(sendErr);
  const me = (req) => req.user.sub || req.user.id;

  router.get('/me', need, ah(async (req, res) => {
    const out = await svc.getMe(me(req));
    return res.status(out.status).json(presentUser(out.user));
  }));

  router.patch('/me', need, ah(async (req, res) => {
    const out = await svc.updateMe(me(req), req.body || {});
    if (out.body) return res.status(out.status).json(out.body);
    return res.status(out.status).json(presentUser(out.merged));
  }));

  router.get('/username-available', need, ah(async (req, res) => {
    const out = await svc.usernameAvailable(req.query.username);
    return res.status(out.status).json(out.body);
  }));

  // Owned-list endpoints (MVP: later slices own orders/tickets/communities/events tables).
  router.get('/me/events', need, ah(async (req, res) => {
    const out = svc.eventsHistory(req.query.filter, req.query);
    const { page, limit } = pageLimit(req.query);
    return res.status(out.status).json(list(page, limit, [], 0));
  }));
  router.get('/me/orders', need, ah(async (req, res) => {
    const { page, limit } = pageLimit(req.query);
    return res.json(list(page, limit, [], 0));
  }));
  router.get('/me/tickets', need, ah(async (req, res) => {
    const out = svc.ticketsList(req.query.status);
    const { page, limit } = pageLimit(req.query);
    return res.status(out.status).json(list(page, limit, [], 0));
  }));
  router.get('/me/communities', need, ah(async (req, res) => {
    const { page, limit } = pageLimit(req.query);
    return res.json(list(page, limit, [], 0));
  }));

  router.patch('/me/visibility', need, ah(async (req, res) => {
    const out = await svc.updateVisibility(me(req), req.body || {});
    return res.status(out.status).json(out.body);
  }));

  router.delete('/me', need, ah(async (req, res) => {
    const out = await svc.deleteMe(me(req), req.query.confirm);
    return res.status(out.status).json(out.body);
  }));

  router.get('/:userId/public', need, ah(async (req, res) => {
    const out = await svc.publicProfile(req.params.userId);
    return res.status(out.status).json(out.body);
  }));

  return router;
};
