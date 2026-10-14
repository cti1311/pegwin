'use strict';
// Post routes: thin HTTP mapping over posts/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
// The wrapper preserves this slice's contract: anything unexpected becomes
// 500 GATEWAY_ERROR (as before).
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/postsRepository');
const makeService = require('../services/postsService');
const makeNotify = require('../services/notificationsService');
const makeEngagementRepo = require('../repositories/engagementRepository');

module.exports = (deps) => {
  const { auth, errors } = deps;
  const r = express.Router(), any = auth();
  // Notify only with full app config, so stub-dep suites run the slice alone.
  const notify = deps.config
    ? makeNotify(makeEngagementRepo(deps.db), { uid: deps.uid, config: deps.config })
    : null;
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid, http: deps.http, notify });
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr, { code: 'GATEWAY_ERROR', message: 'failed' });
  const send = (res, out) => (out.status === 204 ? res.status(204).end() : res.status(out.status).json(out.body));

  r.get('/communities/:communityId/posts', any, A(async (req, res) => {
    send(res, await svc.feed(req.params.communityId, req.query));
  }));
  r.post('/communities/:communityId/posts', any, A(async (req, res) => {
    send(res, await svc.create(req.params.communityId, req.user, req.body || {}));
  }));
  r.post('/posts/:postId/likes', any, A(async (req, res) => {
    send(res, await svc.like(req.params.postId, req.user.id));
  }));
  r.delete('/posts/:postId/likes', any, A(async (req, res) => {
    send(res, await svc.unlike(req.params.postId, req.user.id));
  }));
  r.get('/posts/:postId/comments', any, A(async (req, res) => {
    send(res, await svc.comments(req.params.postId, req.query));
  }));
  r.post('/posts/:postId/comments', any, A(async (req, res) => {
    send(res, await svc.comment(req.params.postId, req.user.id, req.body || {}));
  }));
  r.get('/communities/:communityId/events', any, A(async (req, res) => {
    send(res, await svc.communityEvents(req.params.communityId, req.query));
  }));
  r.post('/communities/:communityId/mute', any, A(async (req, res) => {
    send(res, await svc.mute(req.params.communityId, req.user.id));
  }));
  r.delete('/communities/:communityId/mute', any, A(async (req, res) => {
    send(res, await svc.unmute(req.params.communityId, req.user.id));
  }));
  r.get('/users/me/blocked-communities', any, A(async (req, res) => {
    send(res, await svc.blockedCommunities(req.user.id));
  }));
  r.post('/users/me/blocked-communities', any, A(async (req, res) => {
    send(res, await svc.blockCommunity(req.user.id, req.body || {}));
  }));
  r.delete('/users/me/blocked-communities/:communityId', any, A(async (req, res) => {
    send(res, await svc.unblockCommunity(req.user.id, req.params.communityId));
  }));
  return r;
};
