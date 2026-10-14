'use strict';
// Single route entry: wires every slice router onto one /api/v1 router.
// app.js imports only this file; slices stay thin (HTTP mapping only).
const express = require('express');

const SLICES = [
  { path: '/auth', file: './authRoutes' },
  { path: '/users', file: './usersRoutes' },
  { path: null, file: './eventsRoutes' },
  { path: null, file: './ticketingRoutes' },
  { path: null, file: './ordersRoutes' },
  { path: null, file: './paymentsRoutes' },
  { path: null, file: './payoutsRoutes' },
  { path: null, file: './checkinsRoutes' },
  { path: null, file: './communitiesRoutes' },
  { path: null, file: './groupsRoutes' },
  { path: null, file: './postsRoutes' },
  { path: null, file: './engagementRoutes' },
  { path: null, file: './adminRoutes' },
  { path: null, file: './supportRoutes' }
];

module.exports = (deps) => {
  const api = express.Router();
  for (const s of SLICES) {
    const router = require(s.file)(deps);
    if (s.path) api.use(s.path, router);
    else api.use(router);
  }
  api.use(deps.errors.notFound);
  return api;
};
