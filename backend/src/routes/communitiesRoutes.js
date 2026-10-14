'use strict';
// Communities routes: thin HTTP mapping over communities/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
// The wrapper preserves this slice's contract: domain throws map to their
// envelope, anything unexpected becomes 500 GATEWAY_ERROR (as before).
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const { SETTINGS } = require('../models/communitiesModel');
const makeRepository = require('../repositories/communitiesRepository');
const makeService = require('../services/communitiesService');

module.exports = (deps) => {
  const { auth, errors } = deps;
  const r = express.Router(), host = auth('host', 'super_admin'), any = auth();
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid });
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr, { code: 'GATEWAY_ERROR', message: 'failed' });
  const send = (res, out) => (out.status === 204 ? res.status(204).end() : res.status(out.status).json(out.body));

  r.post('/communities', host, A(async (req, res) => {
    send(res, await svc.create(req.user.id, req.body || {}));
  }));
  r.get('/communities', any, A(async (req, res) => {
    send(res, await svc.discover(req.user.id, req.query));
  }));
  r.get('/communities/:communityId', any, A(async (req, res) => {
    send(res, await svc.detail(req.params.communityId, req.user.id));
  }));
  r.patch('/communities/:communityId', host, A(async (req, res) => {
    send(res, await svc.patch(req.params.communityId, req.user.id, req.body || {}));
  }));
  for (const key of Object.keys(SETTINGS)) {
    r.patch('/communities/:communityId/' + key, host, A(async (req, res) => {
      send(res, await svc.settings(req.params.communityId, key, req.body || {}));
    }));
  }
  r.get('/communities/:communityId/team', host, A(async (req, res) => {
    send(res, await svc.team(req.params.communityId));
  }));
  r.post('/communities/:communityId/team', host, A(async (req, res) => {
    send(res, await svc.addTeamMember(req.params.communityId, req.body || {}));
  }));
  r.delete('/communities/:communityId/team/:memberId', host, A(async (req, res) => {
    send(res, await svc.removeTeamMember(req.params.communityId, req.params.memberId));
  }));
  r.get('/communities/:communityId/join-requests', host, A(async (req, res) => {
    send(res, await svc.joinRequests(req.params.communityId, (req.query || {}).status));
  }));
  r.post('/communities/:communityId/join-requests/:requestId/approve', host, A(async (req, res) => {
    send(res, await svc.approveJoinRequest(req.params.communityId, req.params.requestId));
  }));
  r.post('/communities/:communityId/join-requests/:requestId/deny', host, A(async (req, res) => {
    send(res, await svc.denyJoinRequest(req.params.communityId, req.params.requestId, (req.body || {}).note));
  }));
  r.get('/communities/:communityId/reports', host, A(async (req, res) => {
    send(res, await svc.reports(req.params.communityId, (req.query || {}).status));
  }));
  r.get('/communities/:communityId/reports/:reportId', host, A(async (req, res) => {
    send(res, await svc.reportDetail(req.params.communityId, req.params.reportId));
  }));
  r.post('/communities/:communityId/reports/:reportId/actions', host, A(async (req, res) => {
    send(res, await svc.reportAction(req.params.communityId, req.params.reportId, (req.body || {}).action));
  }));
  r.get('/communities/:communityId/blocked', host, A(async (req, res) => {
    send(res, await svc.blocked(req.params.communityId));
  }));
  r.post('/communities/:communityId/blocked', host, A(async (req, res) => {
    send(res, await svc.block(req.params.communityId, req.body || {}));
  }));
  r.delete('/communities/:communityId/blocked/:userId', host, A(async (req, res) => {
    send(res, await svc.unblock(req.params.communityId, req.params.userId));
  }));
  r.get('/communities/:communityId/members', any, A(async (req, res) => {
    send(res, await svc.members(req.params.communityId, req.query));
  }));
  r.post('/communities/:communityId/transfer-ownership', host, A(async (req, res) => {
    send(res, await svc.transferOwnership(req.params.communityId, req.user.id, (req.body || {}).newOwnerId));
  }));
  r.delete('/communities/:communityId', host, A(async (req, res) => {
    send(res, await svc.remove(req.params.communityId, req.user.id, (req.query || {}).confirm));
  }));
  r.get('/communities/:communityId/data-summary', host, A(async (req, res) => {
    send(res, await svc.dataSummary(req.params.communityId));
  }));
  r.post('/communities/:communityId/exports', host, A(async (req, res) => {
    send(res, await svc.requestExport(req.params.communityId, (req.body || {}).type));
  }));
  r.get('/communities/:communityId/exports', host, A(async (req, res) => {
    send(res, await svc.exports(req.params.communityId));
  }));
  r.post('/communities/:communityId/groups', host, A(async (req, res) => {
    send(res, await svc.createGroup(req.params.communityId, req.body || {}));
  }));
  r.get('/communities/:communityId/groups', any, A(async (req, res) => {
    send(res, await svc.groups(req.params.communityId, req.query));
  }));
  return r;
};
