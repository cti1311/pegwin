'use strict';
// Support routes: thin HTTP mapping over support/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/supportRepository');
const makeService = require('../services/supportService');

module.exports = (deps) => {
  const { auth, errors } = deps;
  const router = express.Router();
  const svc = makeService(makeRepository(deps.db), { uid: deps.uid });
  const me = auth('user', 'host', 'event_staff', 'super_admin');
  const opt = (req, res, next) => next(); // public: optional bearer, no user needed
  const sendErr = errors.send;
  const A = withDomainErrors(sendErr);
  const send = (res, out) => res.status(out.status).json(out.body);

  router.get('/support/topics', me, A(async (req, res) => {
    send(res, svc.topics());
  }));
  router.get('/support/conversations', me, A(async (req, res) => {
    send(res, await svc.threads(req.user.id));
  }));
  router.post('/support/conversations', me, A(async (req, res) => {
    send(res, await svc.openThread(req.user.id, (req.body || {}).topic));
  }));
  router.get('/support/conversations/:conversationId/messages', me, A(async (req, res) => {
    send(res, await svc.threadMessages(req.user.id, req.params.conversationId, req.query));
  }));
  router.post('/support/conversations/:conversationId/messages', me, A(async (req, res) => {
    send(res, await svc.sendThreadMessage(req.user.id, req.params.conversationId, (req.body || {}).text));
  }));
  router.get('/help/articles', opt, A(async (req, res) => {
    send(res, await svc.articles(req.query));
  }));
  router.get('/help/articles/:articleId', opt, A(async (req, res) => {
    send(res, await svc.article(req.params.articleId));
  }));
  router.get('/content/:slug', opt, A(async (req, res) => {
    send(res, await svc.contentPage(req.params.slug));
  }));
  router.get('/meta/categories', opt, A(async (req, res) => {
    send(res, await svc.meta('meta_categories'));
  }));
  router.get('/meta/interests', opt, A(async (req, res) => {
    send(res, await svc.meta('meta_interests'));
  }));
  router.get('/meta/languages', opt, A(async (req, res) => {
    send(res, await svc.meta('meta_languages'));
  }));
  router.get('/meta/cities', opt, A(async (req, res) => {
    send(res, await svc.metaCities((req.query || {}).state));
  }));
  return router;
};
