'use strict';
// Engagement routes: thin HTTP mapping over engagement/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/engagementRepository');
const makeService = require('../services/engagementService');

module.exports = (deps) => {
  const { auth, errors } = deps;
  const router = express.Router();
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid });
  const me = auth('user', 'host', 'event_staff', 'super_admin');
  const hostOnly = auth('host', 'super_admin');
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr);
  const send = (res, out) => (out.status === 204 ? res.status(204).end() : res.status(out.status).json(out.body));

  router.get('/users/me/notifications', me, A(async (req, res) => {
    send(res, await svc.inbox(req.user.id, req.query));
  }));
  router.patch('/users/me/notifications/:notificationId/read', me, A(async (req, res) => {
    send(res, await svc.markRead(req.user.id, req.params.notificationId));
  }));
  router.post('/users/me/notifications/read-all', me, A(async (req, res) => {
    send(res, await svc.markAllRead(req.user.id));
  }));
  router.post('/devices', me, A(async (req, res) => {
    send(res, await svc.registerDevice(req.user.id, req.body || {}));
  }));
  router.delete('/devices/:deviceId', me, A(async (req, res) => {
    send(res, await svc.deregisterDevice(req.user.id, req.params.deviceId));
  }));
  router.get('/users/me/notification-preferences', me, A(async (req, res) => {
    send(res, await svc.prefs(req.user.id));
  }));
  router.patch('/users/me/notification-preferences', me, A(async (req, res) => {
    send(res, await svc.updatePrefs(req.user.id, req.body || {}));
  }));
  router.get('/users/me/saved-events', me, A(async (req, res) => {
    send(res, await svc.savedEvents(req.user.id, req.query));
  }));
  router.post('/users/me/saved-events', me, A(async (req, res) => {
    send(res, await svc.saveEvent(req.user.id, (req.body || {}).eventId));
  }));
  router.delete('/users/me/saved-events/:eventId', me, A(async (req, res) => {
    send(res, await svc.unsaveEvent(req.user.id, req.params.eventId));
  }));
  router.get('/users/me/saved-communities', me, A(async (req, res) => {
    send(res, await svc.savedCommunities(req.user.id, req.query));
  }));
  router.post('/users/me/saved-communities', me, A(async (req, res) => {
    send(res, await svc.saveCommunity(req.user.id, (req.body || {}).communityId));
  }));
  router.delete('/users/me/saved-communities/:communityId', me, A(async (req, res) => {
    send(res, await svc.unsaveCommunity(req.user.id, req.params.communityId));
  }));
  router.get('/hosts/me/analytics/overview', hostOnly, A(async (req, res) => {
    send(res, svc.overview(req.query));
  }));
  router.get('/hosts/me/analytics/top-events', hostOnly, A(async (req, res) => {
    send(res, await svc.topEvents(req.user.hostId || req.user.id, req.query));
  }));
  router.get('/events/:eventId/analytics', hostOnly, A(async (req, res) => {
    send(res, await svc.eventAnalytics(req.user, req.params.eventId));
  }));
  return router;
};
