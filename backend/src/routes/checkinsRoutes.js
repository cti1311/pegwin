'use strict';
// Check-in routes: thin HTTP mapping over checkins/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/checkinsRepository');
const makeService = require('../services/checkinsService');

module.exports = (deps) => {
  const router = express.Router();
  const { auth, errors } = deps;
  const svc = makeService(makeRepository(deps.db));
  const scanAuth = auth(['host', 'event_staff']);
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr);
  const send = (res, out) => res.status(out.status).json(out.body);

  router.get('/events/:eventId/validation-data', scanAuth, A(async (req, res) => {
    send(res, await svc.validationData(req.params.eventId, (req.query || {}).since));
  }));
  router.post('/checkins', scanAuth, A(async (req, res) => {
    const { ticketCode, scannedAt } = req.body || {};
    send(res, await svc.scan(ticketCode, scannedAt));
  }));
  router.post('/checkins/sync', scanAuth, A(async (req, res) => {
    send(res, await svc.sync((req.body || {}).scans));
  }));
  router.get('/events/:eventId/checkins', scanAuth, A(async (req, res) => {
    send(res, await svc.monitor(req.params.eventId, req.query || {}));
  }));
  return router;
};
