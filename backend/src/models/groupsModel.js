'use strict';
// Groups domain model: pure constants, validation, paging, team rule.
// No database access here; see repository.js (queries) and service.js (flows).
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'];
const PURPOSES = ['avatar', 'event_cover', 'community_media', 'message_media'];
const REPORT_TARGETS = ['message', 'member', 'event', 'community'];
const MAX_MEDIA_BYTES = 52428800;
const UPLOAD_TTL_MS = 9e5;
const WARN = 'Please do not use abusive, offensive, or inappropriate language. Respect all community members.';

function lim(query) {
  return Math.min(100, Math.max(1, parseInt((query || {}).limit, 10) || 20));
}
function page(query) {
  return Math.max(1, parseInt((query || {}).page, 10) || 1);
}
// Host-team (full media rights); members are text-only.
function isTeam(u) {
  return !!u && (u.role === 'host' || u.role === 'super_admin' || u.teamRole === 'admin' || u.teamRole === 'moderator');
}
function mediaUrl(purpose, id) {
  return 'https://media.pegwin.in/' + purpose + '/' + id;
}
const now = () => new Date().toISOString();

module.exports = { MIME, PURPOSES, REPORT_TARGETS, MAX_MEDIA_BYTES, UPLOAD_TTL_MS, WARN, lim, page, isTeam, mediaUrl, now };
