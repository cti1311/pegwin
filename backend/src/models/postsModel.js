'use strict';
// Posts domain model: pure constants, validation, paging, team rule.
// No database access here; see repository.js (queries) and service.js (flows).
const MAX_MEDIA_URLS = 4;

function lim(query) {
  return Math.min(100, Math.max(1, parseInt((query || {}).limit, 10) || 20));
}
function page(query) {
  return Math.max(1, parseInt((query || {}).page, 10) || 1);
}
function isTeam(u) {
  return !!u && (u.role === 'host' || u.role === 'super_admin' || u.teamRole === 'admin' || u.teamRole === 'moderator');
}
const now = () => new Date().toISOString();

module.exports = { MAX_MEDIA_URLS, lim, page, isTeam, now };
