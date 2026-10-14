'use strict';
// Group routes: thin HTTP mapping over groups/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
// The wrapper preserves this slice's contract: anything unexpected becomes
// 500 GATEWAY_ERROR (as before).
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/groupsRepository');
const makeService = require('../services/groupsService');
const makeNotify = require('../services/notificationsService');
const makeEngagementRepo = require('../repositories/engagementRepository');

module.exports = (deps) => {
  const { auth, errors } = deps;
  const r = express.Router(), host = auth('host', 'super_admin'), any = auth();
  // Notify only with full app config, so stub-dep suites run the slice alone.
  const notify = deps.config
    ? makeNotify(makeEngagementRepo(deps.db), { uid: deps.uid, config: deps.config })
    : null;
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid, notify });
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr, { code: 'GATEWAY_ERROR', message: 'failed' });
  const send = (res, out) => (out.status === 204 ? res.status(204).end() : res.status(out.status).json(out.body));

  r.get('/groups/:groupId', any, A(async (req, res) => {
    send(res, await svc.detail(req.params.groupId));
  }));
  r.patch('/groups/:groupId', host, A(async (req, res) => {
    send(res, await svc.patch(req.params.groupId, req.body || {}));
  }));
  r.delete('/groups/:groupId', host, A(async (req, res) => {
    send(res, await svc.remove(req.params.groupId));
  }));
  r.post('/groups/:groupId/join', any, A(async (req, res) => {
    send(res, await svc.join(req.params.groupId, req.user.id));
  }));
  r.post('/groups/:groupId/leave', any, A(async (req, res) => {
    send(res, await svc.leave(req.params.groupId, req.user.id));
  }));
  r.get('/groups/:groupId/members', any, A(async (req, res) => {
    send(res, await svc.members(req.params.groupId, req.query));
  }));
  r.delete('/groups/:groupId/members/:memberId', host, A(async (req, res) => {
    send(res, await svc.removeMember(req.params.groupId, req.params.memberId));
  }));
  r.get('/groups/:groupId/messages', any, A(async (req, res) => {
    send(res, await svc.messages(req.params.groupId, req.query));
  }));
  r.post('/groups/:groupId/messages', any, A(async (req, res) => {
    send(res, await svc.sendMessage(req.params.groupId, req.user, req.body || {}));
  }));
  r.delete('/groups/:groupId/messages/:messageId', host, A(async (req, res) => {
    send(res, await svc.deleteMessage(req.params.groupId, req.params.messageId));
  }));
  r.post('/reports', any, A(async (req, res) => {
    send(res, await svc.report(req.user.id, req.body || {}));
  }));
  r.post('/uploads', any, A(async (req, res) => {
    send(res, await svc.uploadSlot(req.user, req.body || {}));
  }));
  return r;
};
