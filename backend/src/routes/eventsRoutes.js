'use strict';
// Events routes (spec 4, 4a, 5, 5a): thin HTTP mapping over events/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const { Router } = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/eventsRepository');
const makeService = require('../services/eventsService');
const makeNotify = require('../services/notificationsService');
const makeEngagementRepo = require('../repositories/engagementRepository');

module.exports = (deps) => {
  const R = Router();
  // Notify only with full app config, so stub-dep suites run the slice alone.
  const notify = deps.config
    ? makeNotify(makeEngagementRepo(deps.db), { uid: deps.uid, config: deps.config })
    : null;
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid, notify });
  const auth = deps.auth;
  const sendErr = deps.errors.send;
  const A = withDomainErrors(sendErr);
  const E = (req) => req.params.eventId;
  const send = (res, out) => (out.status === 204 ? res.status(204).end() : res.status(out.status).json(out.body));

  R.get('/events', auth(), A(async (req, res) => send(res, await svc.search(req.query || {}))));
  R.get('/events/:eventId', auth(), A(async (req, res) => send(res, await svc.detail(E(req), req.user))));
  R.post('/events/:eventId/views', auth(), A(async (req, res) => send(res, await svc.recordView(E(req), req.user, req.ip))));
  R.get('/events/:eventId/attendees', auth(), A(async (req, res) => send(res, await svc.attendees(E(req)))));
  R.post('/events/:eventId/ratings', auth('user'), A(async (req, res) => {
    send(res, await svc.rate(E(req), req.user, req.body && req.body.score));
  }));
  R.get('/events/:eventId/agenda', auth(), A(async (req, res) => send(res, await svc.getAgenda(E(req)))));
  R.put('/events/:eventId/agenda', auth('host'), A(async (req, res) => {
    send(res, await svc.putAgenda(E(req), req.user, req.body && req.body.slots));
  }));
  R.post('/events', auth('host'), A(async (req, res) => send(res, await svc.create(req.user, req.body || {}))));
  R.post('/events/:eventId/rehost', auth('host'), A(async (req, res) => send(res, await svc.rehost(E(req), req.user))));
  R.patch('/events/:eventId', auth('host'), A(async (req, res) => {
    send(res, await svc.patch(E(req), req.user, req.body || {}));
  }));
  R.post('/events/:eventId/submit-review', auth('host'), A(async (req, res) => {
    send(res, await svc.submitReview(E(req), req.user));
  }));
  R.post('/events/:eventId/cancel', auth('host'), A(async (req, res) => {
    send(res, await svc.cancel(E(req), req.user, req.body && req.body.reason));
  }));
  R.post('/events/:eventId/reschedule', auth('host'), A(async (req, res) => {
    const { newStartAt: a, newEndAt: b } = req.body || {};
    send(res, await svc.reschedule(E(req), req.user, a, b));
  }));
  R.post('/events/:eventId/team', auth('host'), A(async (req, res) => {
    send(res, await svc.addTeamMember(E(req), req.user, req.body || {}));
  }));
  R.get('/events/:eventId/team', auth(), A(async (req, res) => send(res, await svc.teamList(E(req), req.user))));
  R.patch('/events/:eventId/team/:memberId', auth('host'), A(async (req, res) => {
    send(res, await svc.updateTeamMember(E(req), req.user, req.params.memberId, req.body && req.body.permissions));
  }));
  R.delete('/events/:eventId/team/:memberId', auth('host'), A(async (req, res) => {
    send(res, await svc.removeTeamMember(E(req), req.user, req.params.memberId));
  }));
  R.get('/events/:eventId/checkins', auth(), A(async (req, res) => {
    send(res, await svc.checkinMonitor(E(req), req.user, req.query || {}));
  }));
  return R;
};
