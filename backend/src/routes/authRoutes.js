'use strict';
// Auth routes (§2): thin HTTP mapping over auth/service.js.
// Same paths, statuses, and envelopes as before; no SQL or rules here.
const express = require('express');
const { withDomainErrors } = require('../helpers/asyncRoute');
const makeRepository = require('../repositories/authRepository');
const makeUserRepository = require('../repositories/usersRepository');
const makeService = require('../services/authService');

module.exports = (deps) => {
  const router = express.Router();
  const svc = makeService(
    makeRepository(deps.db),
    makeUserRepository(deps.db),
    { uid: deps.uid, firebase: deps.firebase }
  );
  const sendErr = deps.errors.send;
  const ah = withDomainErrors(sendErr);

  router.post('/register', ah(async (req, res) => {
    const out = await svc.register(req.body || {});
    return res.status(out.status).json(out.body);
  }));
  router.post('/firebase/verify', ah(async (req, res) => {
    const out = await svc.firebaseVerify(req.body || {});
    return res.status(out.status).json(out.body);
  }));
  router.post('/login', ah(async (req, res) => {
    const out = await svc.login(req.body || {});
    return res.status(out.status).json(out.body);
  }));
  router.post('/refresh', ah(async (req, res) => {
    const out = await svc.refresh(req.body || {}, req.cookies);
    return res.status(out.status).json(out.body);
  }));
  router.post('/logout', deps.auth('user', 'host', 'event_staff', 'super_admin'), ah(async (req, res) => {
    const out = await svc.logout(req.user, req.body || {}, req.headers);
    return res.status(out.status).end();
  }));
  router.post('/password/reset', ah(async (req, res) => {
    const out = await svc.resetPassword(req.body || {});
    return res.status(out.status).json(out.body);
  }));

  return router;
};
