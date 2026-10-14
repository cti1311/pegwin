'use strict';
// Events domain model: pure constants, validation, and row mapping.
// No database access here; see repository.js (queries) and service.js (flows).
const PUB = ['on_sale', 'live'];
const EDIT = new Set(['draft', 'rescheduled']);
const PERMS = new Set(['manage_event', 'scan_tickets']);
const RO = new Set(['id', 'status', 'hostId', 'host_id', 'soldCount', 'goingCount', 'avgRating', 'ratingCount', 'createdAt', 'updatedAt']);

const VE = 'VALIDATION_ERROR', ENF = 'EVENT_NOT_FOUND', ENE = 'EVENT_NOT_EDITABLE';
const UA = 'UNAUTHENTICATED', FB = 'FORBIDDEN', NF404 = 'NOT_FOUND';

const sn = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
function pg(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, off: (page - 1) * limit };
}
const card = (r) => r && {
  id: r.id, title: r.title, coverImage: r.cover_image, category: r.category,
  city: r.city, venue: r.venue,
  startAt: r.start_at instanceof Date ? r.start_at.toISOString() : r.start_at,
  endAt: r.end_at instanceof Date ? r.end_at.toISOString() : r.end_at,
  status: r.status, minPrice: r.min_price, soldCount: r.sold_count, goingCount: r.going_count,
  avgRating: r.avg_rating == null ? 0 : Number(r.avg_rating), isSaved: !!r.is_saved
};
const isAdmin = (u) => u && u.role === 'super_admin';

// Create-event validation; returns a message string or null.
function validateCreate(b) {
  if (!b || typeof b.title !== 'string' || b.title.length < 1 || b.title.length > 150) {
    return 'title (1-150) required.';
  }
  if (typeof b.description !== 'string' || b.description.length < 1 || b.description.length > 4000) {
    return 'description (1-4000) required.';
  }
  if (!b.startAt || !b.endAt || Number.isNaN(Date.parse(b.startAt)) || Number.isNaN(Date.parse(b.endAt))) {
    return 'startAt/endAt must be ISO-8601.';
  }
  if (Date.parse(b.endAt) <= Date.parse(b.startAt)) return 'endAt must be after startAt.';
  if ((b.mode || 'offline') === 'offline' && (!b.address || !b.city)) return 'address+city required offline.';
  if (b.mode === 'online' && !b.onlineUrl) return 'onlineUrl required online.';
  return null;
}
function validateAgendaSlots(sl) {
  if (!Array.isArray(sl) || sl.length > 50) return 'slots array (max 50) required.';
  for (const s of sl) {
    if (!s || typeof s.time !== 'string' || s.time.length < 1 || s.time.length > 20 ||
        typeof s.title !== 'string' || s.title.length < 1 || s.title.length > 200) {
      return 'slot needs time (1-20), title (1-200).';
    }
  }
  return null;
}
const validTeamPerms = (ps) => Array.isArray(ps) && ps.length && ps.every((p) => PERMS.has(p));
const validTeamBody = (b) => typeof b.userId === 'string' && b.userId.length === 26 && validTeamPerms(b.permissions);

module.exports = {
  PUB, EDIT, PERMS, RO, VE, ENF, ENE, UA, FB, NF404,
  sn, pg, card, isAdmin, validateCreate, validateAgendaSlots, validTeamPerms, validTeamBody
};
