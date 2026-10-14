'use strict';
// Users domain model: pure shapes, validation, and public mapping.
// No database access here; see repository.js (queries) and service.js (flows).
const isStr = (v, a, b) => typeof v === 'string' && v.length >= a && v.length <= b;
const USERNAME = /^[a-z0-9_.]{3,30}$/;
// camelCase body key -> snake_case column for PATCH /me.
const PATCH_COLS = { avatarUrl: 'avatar_url', socialLinks: 'social_links' };
const EVENT_FILTERS = ['hosted', 'attended', 'booked', 'past'];
const TICKET_STATUSES = ['active', 'used', 'expired'];

// Public profile shape (never leaks password_hash).
function toUser(u) {
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
function list(page, limit, items, total) {
  return { data: items, page, limit, total };
}
function pageLimit(q) {
  return {
    page: Math.max(1, parseInt(q.page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20))
  };
}

module.exports = { isStr, USERNAME, PATCH_COLS, EVENT_FILTERS, TICKET_STATUSES, toUser, list, pageLimit };
