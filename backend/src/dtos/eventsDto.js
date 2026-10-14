'use strict';
// Events DTOs: request parsing/validation and response shaping for §4-5.
const { fail } = require('../helpers/domainError');
const M = require('../models/eventsModel');

function parseCreate(b) {
  const body = b || {};
  if (typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 150) {
    fail(400, M.VE, 'title (1-150) required.');
  }
  if (typeof body.description !== 'string' || body.description.length < 1 || body.description.length > 4000) {
    fail(400, M.VE, 'description (1-4000) required.');
  }
  if (!body.startAt || !body.endAt || Number.isNaN(Date.parse(body.startAt)) || Number.isNaN(Date.parse(body.endAt))) {
    fail(400, M.VE, 'startAt/endAt must be ISO-8601.');
  }
  if (Date.parse(body.endAt) <= Date.parse(body.startAt)) fail(400, M.VE, 'endAt must be after startAt.');
  if ((body.mode || 'offline') === 'offline' && (!body.address || !body.city)) {
    fail(400, M.VE, 'address+city required offline.');
  }
  if (body.mode === 'online' && !body.onlineUrl) fail(400, M.VE, 'onlineUrl required online.');
  return {
    communityId: body.communityId || null, title: body.title, description: body.description,
    language: body.language || 'en-IN', category: body.category || null,
    eventType: body.eventType || 'public', mode: body.mode || 'offline',
    pricingModel: body.pricingModel || 'paid', startAt: body.startAt, endAt: body.endAt,
    venue: body.venue || null, address: body.address || null, city: body.city || null,
    latitude: body.latitude ?? null, longitude: body.longitude ?? null, onlineUrl: body.onlineUrl || null,
    targetAudience: body.targetAudience || null, ageRestriction: body.ageRestriction || null,
    refundPolicy: body.refundPolicy || null, entryRules: body.entryRules || null,
    maxAttendees: body.maxAttendees ?? null, coverImage: body.coverImage || null
  };
}
function parseAgenda(slots) {
  if (!Array.isArray(slots) || slots.length > 50) fail(400, M.VE, 'slots array (max 50) required.');
  for (const s of slots) {
    if (!s || typeof s.time !== 'string' || s.time.length < 1 || s.time.length > 20 ||
        typeof s.title !== 'string' || s.title.length < 1 || s.title.length > 200) {
      fail(400, M.VE, 'slot needs time (1-20), title (1-200).');
    }
  }
  return slots;
}
function parseTeamMember(b) {
  const body = b || {};
  if (typeof body.userId !== 'string' || body.userId.length !== 26 || !M.validTeamPerms(body.permissions)) {
    fail(400, M.VE, 'userId ULID + valid permissions required.');
  }
  return { userId: body.userId, permissions: body.permissions };
}
function parseTeamPermissions(permissions) {
  if (!M.validTeamPerms(permissions)) fail(400, M.VE, 'permissions subset required.');
  return permissions;
}
function parsePatch(body) {
  const st = [], v = [];
  for (const f of Object.keys(body || {})) {
    if (!M.RO.has(f)) { st.push(`${M.sn(f)} = ?`); v.push(body[f]); }
  }
  if (!st.length) fail(400, M.VE, 'nothing to update.');
  return { setClause: st.join(','), values: v };
}
function parseCancelReason(reason) {
  if (typeof reason !== 'string' || reason.length < 1 || reason.length > 500) fail(400, M.VE, 'reason (1-500).');
  return reason;
}
function parseReschedule(a, b) {
  if (!a || !b || Number.isNaN(Date.parse(a)) || Number.isNaN(Date.parse(b))) {
    fail(400, M.VE, 'newStartAt/newEndAt must be ISO-8601.');
  }
  if (Date.parse(b) <= Date.parse(a)) fail(400, M.VE, 'newEndAt must be after newStartAt.');
  return { startAt: a, endAt: b };
}
function parseScore(scoreRaw) {
  const s = Number(scoreRaw);
  if (!Number.isInteger(s) || s < 1 || s > 5) fail(400, M.VE, 'score 1-5 required.');
  return s;
}
function presentCard(r) {
  return r && {
    id: r.id, title: r.title, coverImage: r.cover_image, category: r.category,
    city: r.city, venue: r.venue,
    startAt: r.start_at instanceof Date ? r.start_at.toISOString() : r.start_at,
    endAt: r.end_at instanceof Date ? r.end_at.toISOString() : r.end_at,
    status: r.status, minPrice: r.min_price, soldCount: r.sold_count, goingCount: r.going_count,
    avgRating: r.avg_rating == null ? 0 : Number(r.avg_rating), isSaved: !!r.is_saved
  };
}
function presentDetail(ev, agenda) {
  return {
    ...presentCard(ev), description: ev.description, agenda,
    address: ev.address, latitude: ev.latitude, longitude: ev.longitude,
    policies: { refundPolicy: ev.refund_policy, entryRules: ev.entry_rules, ageRestriction: ev.age_restriction },
    host: { id: ev.host_id }
  };
}

module.exports = {
  parseCreate, parseAgenda, parseTeamMember, parseTeamPermissions,
  parsePatch, parseCancelReason, parseReschedule, parseScore,
  presentCard, presentDetail
};
