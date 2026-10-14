'use strict';
// Engagement service: notifications, devices, preferences, saved items,
// host analytics. Throws domain errors { status, code, message } (mapped by
// errorHandler); returns { status, body } on success. No HTTP here.
// Request parsing/validation lives in dtos/engagementDto.js; constants and
// row mapping live in models/engagementModel.js.
const { fail } = require('../helpers/domainError');
const M = require('../models/engagementModel');
const Dto = require('../dtos/engagementDto');

module.exports = (repo, ctx) => {
  const uid = ctx.uid;

  return {
    async inbox(userId, query) {
      const q = query || {};
      const { page, limit, offset } = M.pg(q);
      const unread = q.unreadOnly === 'true' || q.unreadOnly === true;
      const { total, rows } = await repo.notifications(userId, unread, limit, offset);
      return { status: 200, body: { data: rows.map(M.nto), page, limit, total } };
    },
    async markRead(userId, notificationId) {
      const affected = await repo.markRead(notificationId, userId);
      if (!affected) fail(404, 'NOT_FOUND', 'Notification not found.');
      return { status: 200, body: { ok: true } };
    },
    async markAllRead(userId) {
      const marked = await repo.markAllRead(userId);
      return { status: 200, body: { marked } };
    },
    async registerDevice(userId, body) {
      const { platform, pushToken } = Dto.parseDevice(body);
      const ex = await repo.findDevice(pushToken);
      if (ex) return { status: 201, body: { id: ex.id } };
      const id = uid();
      await repo.insertDevice({ id, userId, platform, pushToken });
      return { status: 201, body: { id } };
    },
    async deregisterDevice(userId, deviceId) {
      await repo.deleteDevice(deviceId, userId);
      return { status: 204 };
    },
    async prefs(userId) {
      return { status: 200, body: M.toPrefs(await repo.prefs(userId)) };
    },
    async updatePrefs(userId, body) {
      const { sets, vals } = Dto.parsePrefs(body);
      await repo.upsertPrefs(userId, sets, vals);
      return { status: 200, body: M.toPrefs(await repo.prefs(userId)) };
    },
    async savedEvents(userId, query) {
      const q = query || {};
      const { page, limit, offset } = M.pg(q);
      const extra = Dto.parseSavedWhen(q.when || 'all');
      const { total, rows } = await repo.savedEvents(userId, extra, limit, offset);
      return {
        status: 200,
        body: { data: rows.map((e) => ({ ...e, savedAt: new Date(e.saved_at).toISOString() })), page, limit, total }
      };
    },
    async saveEvent(userId, eventId) {
      Dto.requireId(eventId, 'eventId');
      await repo.saveEvent(userId, eventId);
      return { status: 201, body: { eventId, saved: true } };
    },
    async unsaveEvent(userId, eventId) {
      await repo.unsaveEvent(userId, eventId);
      return { status: 204 };
    },
    async savedCommunities(userId, query) {
      const { page, limit, offset } = M.pg(query);
      const { total, rows } = await repo.savedCommunities(userId, limit, offset);
      return {
        status: 200,
        body: { data: rows.map((c) => ({ ...c, savedAt: new Date(c.saved_at).toISOString() })), page, limit, total }
      };
    },
    async saveCommunity(userId, communityId) {
      Dto.requireId(communityId, 'communityId');
      await repo.saveCommunity(userId, communityId);
      return { status: 201, body: { communityId, saved: true } };
    },
    async unsaveCommunity(userId, communityId) {
      await repo.unsaveCommunity(userId, communityId);
      return { status: 204 };
    },
    overview(query) {
      Dto.parseAnalyticsScope(query);
      return { status: 200, body: M.emptyOverview() };
    },
    async topEvents(hostId, query) {
      const { page, limit, offset } = M.pg(query);
      const rows = await repo.topEvents(hostId, limit, offset);
      return {
        status: 200,
        body: {
          data: rows.map((r) => ({ eventId: r.eventId, title: r.title,
            attendees: Number(r.attendees), capacityPct: 0, revenue: 0 })),
          page, limit, total: rows.length
        }
      };
    },
    async eventAnalytics(user, eventId) {
      const row = await repo.eventOwner(eventId);
      if (!row) fail(404, 'EVENT_NOT_FOUND', 'Event not found.');
      const owner = user.hostId || user.id;
      if (row.host_id !== owner && user.role !== 'super_admin') {
        fail(403, 'FORBIDDEN', 'Only the owning host can view event analytics.');
      }
      return { status: 200, body: M.emptyOverview() };
    }
  };
};
