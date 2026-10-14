'use strict';
// Users DTOs: request parsing/validation and response shaping for §3.
const { fail } = require('../helpers/domainError');
const M = require('../models/usersModel');

function parseUpdate(b) {
  const body = b || {};
  const patch = {};
  if (body.name !== undefined) {
    if (!M.isStr(body.name, 1, 100)) fail(400, 'VALIDATION_ERROR', 'name must be 1-100 chars');
    patch.name = body.name;
  }
  if (body.username !== undefined) {
    if (!M.USERNAME.test(body.username)) fail(400, 'VALIDATION_ERROR', 'username must match [a-z0-9_.]{3,30}');
    patch.username = body.username;
  }
  ['avatarUrl', 'bio', 'city', 'country', 'locale'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
  if (body.bio !== undefined && body.bio !== null && !M.isStr(body.bio, 0, 500)) {
    fail(400, 'VALIDATION_ERROR', 'bio max 500 chars');
  }
  if (body.interests !== undefined) {
    if (!Array.isArray(body.interests) || body.interests.length > 10) {
      fail(400, 'VALIDATION_ERROR', 'interests max 10 items');
    }
    patch.interests = JSON.stringify(body.interests);
  }
  if (body.socialLinks !== undefined) patch.social_links = JSON.stringify(body.socialLinks);
  const cols = {};
  Object.keys(patch).forEach((k) => { cols[M.PATCH_COLS[k] || k] = patch[k]; });
  return { patch, cols, wantsContactChange: body.phone !== undefined || body.email !== undefined };
}
function parseUsername(username) {
  const name = String(username || '');
  if (!M.USERNAME.test(name)) fail(400, 'VALIDATION_ERROR', 'username must match [a-z0-9_.]{3,30}');
  return name;
}
function parseEventFilter(filter) {
  if (!M.EVENT_FILTERS.includes(filter)) fail(400, 'VALIDATION_ERROR', 'filter must be hosted|attended|booked|past');
  return filter;
}
function parseTicketStatus(status) {
  if (status && !M.TICKET_STATUSES.includes(status)) {
    fail(400, 'VALIDATION_ERROR', 'status must be active|used|expired');
  }
  return status;
}
function parseDeleteConfirm(confirm) {
  if (confirm !== 'true') fail(400, 'VALIDATION_ERROR', '?confirm=true required');
}
// Public profile shape (never leaks password_hash).
function presentUser(u) {
  let vis = { profileVisible: true };
  try { if (u.visibility) vis = typeof u.visibility === 'string' ? JSON.parse(u.visibility) : u.visibility; } catch (_) {}
  let interests = [];
  try { if (u.interests) interests = typeof u.interests === 'string' ? JSON.parse(u.interests) : u.interests; } catch (_) {}
  let social = {};
  try { if (u.social_links) social = typeof u.social_links === 'string' ? JSON.parse(u.social_links) : u.social_links; } catch (_) {}
  return {
    id: u.id, name: u.name, username: u.username || null, avatarUrl: u.avatar_url || null,
    bio: u.bio || null, phone: u.phone || null, email: u.email || null, role: u.role || 'user',
    interests, city: u.city || null, country: u.country || null, socialLinks: social,
    locale: u.locale || 'en-IN', visibility: vis, createdAt: u.created_at
  };
}
function presentPublic(u) {
  return { id: u.id, name: u.name, username: u.username || null, avatarUrl: u.avatar_url || null };
}

module.exports = { parseUpdate, parseUsername, parseEventFilter, parseTicketStatus, parseDeleteConfirm, presentUser, presentPublic };
