'use strict';
// Admin routes: thin HTTP mapping over admin/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/adminRepository');
const makeService = require('../services/adminService');

module.exports = (deps) => {
  const { auth, errors } = deps;
  const router = express.Router();
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid });
  const admin = auth('super_admin');
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr);
  const send = (res, out) => res.status(out.status).json(out.body);

  router.get('/admin/events/review-queue', admin, A(async (req, res) => {
    send(res, await svc.reviewQueue(req.query));
  }));
  router.post('/admin/events/:eventId/approve', admin, A(async (req, res) => {
    send(res, await svc.eventDecision(req.params.eventId, 'event.approve', 'published', req.body || {}, req.user.id, false));
  }));
  router.post('/admin/events/:eventId/reject', admin, A(async (req, res) => {
    send(res, await svc.eventDecision(req.params.eventId, 'event.reject', 'rejected', req.body || {}, req.user.id, true));
  }));
  router.post('/admin/events/:eventId/suspend', admin, A(async (req, res) => {
    send(res, await svc.eventDecision(req.params.eventId, 'event.suspend', 'suspended', req.body || {}, req.user.id, true));
  }));
  router.post('/admin/events/:eventId/remove', admin, A(async (req, res) => {
    send(res, await svc.eventDecision(req.params.eventId, 'event.remove', 'removed', req.body || {}, req.user.id, true));
  }));
  router.get('/admin/hosts/flagged', admin, A(async (req, res) => {
    send(res, await svc.flaggedHosts(req.query));
  }));
  router.post('/admin/hosts/:hostId/verification', admin, A(async (req, res) => {
    send(res, await svc.setHostVerification(req.params.hostId, req.body || {}, req.user.id));
  }));
  router.post('/admin/hosts/:hostId/warn', admin, A(async (req, res) => {
    send(res, await svc.hostDecision(req.params.hostId, 'host.warn', 'warned', req.body || {}, req.user.id));
  }));
  router.post('/admin/hosts/:hostId/suspend', admin, A(async (req, res) => {
    send(res, await svc.hostDecision(req.params.hostId, 'host.suspend', 'suspended', req.body || {}, req.user.id));
  }));
  router.post('/admin/hosts/:hostId/remove', admin, A(async (req, res) => {
    send(res, await svc.hostDecision(req.params.hostId, 'host.remove', 'removed', req.body || {}, req.user.id));
  }));
  router.get('/admin/reports', admin, A(async (req, res) => {
    send(res, await svc.reportQueue(req.query));
  }));
  router.patch('/admin/reports/:reportId', admin, A(async (req, res) => {
    send(res, await svc.resolveReport(req.params.reportId, req.body || {}, req.user.id));
  }));
  router.get('/admin/audit-logs', admin, A(async (req, res) => {
    send(res, await svc.auditLogs(req.query));
  }));
  return router;
};
