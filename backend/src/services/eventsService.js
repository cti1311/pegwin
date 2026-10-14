'use strict';
// Events service: discovery, lifecycle, agenda, team, and monitor flows.
// Request parsing/shaping lives in dtos/eventsDto.js.
// Throws domain errors; returns { status, body }. No HTTP here.
const M = require('../models/eventsModel');
const D = require('../dtos/eventsDto');
const { fail } = require('../helpers/domainError');

module.exports = (repo, ctx) => {
  const uid = ctx.uid;
  const notify = ctx.notify || null;

  async function evOf(eventId) {
    const ev = await repo.findById(eventId);
    if (!ev) fail(404, M.ENF, 'Event not found.');
    return ev;
  }
  function checkOwn(user, ev) {
    if (!user) fail(401, M.UA, 'Login required.');
    if (ev.host_id !== user.id && !M.isAdmin(user)) fail(403, M.FB, 'owner only.');
  }
  async function ownEv(user, eventId) {
    const ev = await evOf(eventId);
    checkOwn(user, ev);
    return ev;
  }

  return {
    async search(q) {
      const { page, limit, off } = M.pg(q || {});
      const { total, rows } = await repo.search(q || {}, page, limit, off);
      return { status: 200, body: { data: rows.map(D.presentCard), page, limit, total } };
    },
    async detail(eventId, user) {
      const ev = await evOf(eventId);
      const mine = user && (user.id === ev.host_id || M.isAdmin(user));
      if (!M.PUB.includes(ev.status) && !mine) fail(404, M.ENF, 'Event not found.');
      return { status: 200, body: D.presentDetail(ev, await repo.agenda(ev.id)) };
    },
    async recordView(eventId, user, ip) {
      const ev = await repo.findId(eventId);
      if (!ev) fail(404, M.ENF, 'Event not found.');
      await repo.recordView(ev.id, user ? user.id : '', user ? '' : (ip || 'anon'));
      return { status: 204 };
    },
    async attendees(eventId) {
      const ev = await repo.findIdAndGoing(eventId);
      if (!ev) fail(404, M.ENF, 'Event not found.');
      const list = await repo.attendeePreview(ev.id);
      return { status: 200, body: { attendees: list, goingCount: ev.going_count || list.length } };
    },
    async rate(eventId, user, scoreRaw) {
      const s = D.parseScore(scoreRaw);
      const ev = await repo.findId(eventId);
      if (!ev) fail(404, M.ENF, 'Event not found.');
      await repo.saveRating({ id: uid(), eventId: ev.id, userId: user.id, score: s });
      return { status: 201, body: { score: s, eventId: ev.id, userId: user.id } };
    },
    async getAgenda(eventId) {
      const ev = await repo.findId(eventId);
      if (!ev) fail(404, M.ENF, 'Event not found.');
      return { status: 200, body: { slots: await repo.agenda(ev.id) } };
    },
    async putAgenda(eventId, user, slots) {
      const clean = D.parseAgenda(slots);
      const ev = await ownEv(user, eventId);
      if (!M.EDIT.has(ev.status)) fail(409, M.ENE, 'agenda locked.');
      await repo.replaceAgenda(ev.id, clean, uid);
      return { status: 200, body: { slots: clean } };
    },
    async create(user, b) {
      const i = D.parseCreate(b);
      const id = uid();
      await repo.insertEvent({
        id, host_id: user.id, community_id: i.communityId, title: i.title,
        description: i.description, language: i.language, category: i.category,
        event_type: i.eventType, mode: i.mode, pricing_model: i.pricingModel,
        status: 'draft', start_at: i.startAt, end_at: i.endAt, venue: i.venue,
        address: i.address, city: i.city, latitude: i.latitude,
        longitude: i.longitude, online_url: i.onlineUrl,
        target_audience: i.targetAudience, age_restriction: i.ageRestriction,
        refund_policy: i.refundPolicy, entry_rules: i.entryRules,
        max_attendees: i.maxAttendees, cover_image: i.coverImage
      });
      return { status: 201, body: { id, status: 'draft', title: i.title } };
    },
    async rehost(eventId, user) {
      const ev = await ownEv(user, eventId);
      if (ev.status !== 'completed') fail(409, M.ENE, 'completed only.');
      const id = uid();
      await repo.rehost({ id, hostId: user.id, title: ev.title, description: ev.description, startAt: ev.start_at, endAt: ev.end_at });
      return { status: 201, body: { id, status: 'draft' } };
    },
    async patch(eventId, user, body) {
      const ev = await ownEv(user, eventId);
      if (!M.EDIT.has(ev.status)) fail(409, M.ENE, 'not editable.');
      const { setClause, values } = D.parsePatch(body);
      await repo.updateFields(ev.id, setClause, values);
      return { status: 200, body: { id: ev.id, status: ev.status } };
    },
    async submitReview(eventId, user) {
      const ev = await ownEv(user, eventId);
      if (ev.status !== 'draft') fail(409, M.ENE, 'drafts only.');
      await repo.setStatus(ev.id, 'review');
      return { status: 200, body: { status: 'review' } };
    },
    async cancel(eventId, user, reason) {
      D.parseCancelReason(reason);
      const ev = await ownEv(user, eventId);
      await repo.setStatus(ev.id, 'cancelled');
      if (notify) {
        await notify.dispatch({
          recipientsFn: async () => (await repo.holdersForEvent(ev.id))
            .map((h) => ({ userId: h.userId, email: h.email || undefined })),
          type: 'event_cancel',
          title: `Event cancelled: ${ev.title}`,
          body: `${ev.title} is cancelled${reason ? ` (${reason})` : ''}. Eligible refunds go to the original payment method.`,
          refType: 'event', refId: ev.id,
          email: {
            subject: `Event cancelled: ${ev.title}`,
            text: `${ev.title} scheduled for ${ev.start_at} is cancelled${reason ? ` (reason: ${reason})` : ''}. Eligible ticket refunds are processed to the original payment method.`
          }
        });
      }
      return { status: 200, body: { status: 'cancelled' } };
    },
    async reschedule(eventId, user, a, b) {
      const { startAt, endAt } = D.parseReschedule(a, b);
      const ev = await ownEv(user, eventId);
      await repo.updateFields(ev.id, "start_at=?,end_at=?,status='rescheduled'", [startAt, endAt]);
      if (notify) {
        await notify.dispatch({
          recipientsFn: async () => (await repo.holdersForEvent(ev.id))
            .map((h) => ({ userId: h.userId, email: h.email || undefined })),
          type: 'event_reschedule',
          title: `Event rescheduled: ${ev.title}`,
          body: `${ev.title} moves to ${startAt}. Your tickets stay valid; a refund option is available in the app.`,
          refType: 'event', refId: ev.id,
          email: {
            subject: `Event rescheduled: ${ev.title}`,
            text: `${ev.title} moves from ${ev.start_at} to ${startAt} (ends ${endAt}). Your tickets stay valid; if the new time does not work, request a refund from the app.`
          }
        });
      }
      return { status: 200, body: { status: 'rescheduled' } };
    },
    async addTeamMember(eventId, user, body) {
      const input = D.parseTeamMember(body);
      const ev = await ownEv(user, eventId);
      const id = uid();
      await repo.addTeamMember({ id, eventId: ev.id, userId: input.userId, permissions: input.permissions });
      return { status: 201, body: { id, eventId: ev.id, status: 'active' } };
    },
    async teamList(eventId, user) {
      const ev = await evOf(eventId);
      if (!user) fail(401, M.UA, 'Login required.');
      if (ev.host_id !== user.id && !M.isAdmin(user) && !(await repo.teamMembership(ev.id, user.id))) {
        fail(403, M.FB, 'team only.');
      }
      return { status: 200, body: { data: await repo.teamList(ev.id) } };
    },
    async updateTeamMember(eventId, user, memberId, permissions) {
      const clean = D.parseTeamPermissions(permissions);
      const ev = await ownEv(user, eventId);
      const r = await repo.updateTeamPermissions(memberId, ev.id, clean);
      if (r && r[0] && r[0].affectedRows === 0) fail(404, M.NF404, 'Team member not found.');
      return { status: 200, body: { id: memberId, permissions: clean } };
    },
    async removeTeamMember(eventId, user, memberId) {
      const ev = await ownEv(user, eventId);
      await repo.removeTeamMember(memberId, ev.id);
      return { status: 204 };
    },
    async checkinMonitor(eventId, user, q) {
      const { page, limit, off } = M.pg(q || {});
      const ev = await evOf(eventId);
      if (!user) fail(401, M.UA, 'Login required.');
      const mine = ev.host_id === user.id || M.isAdmin(user);
      const mem = mine ? null : await repo.teamMembership(ev.id, user.id);
      const ps = mem ? JSON.parse(mem.permissions || '[]') : [];
      if (!mine && !ps.includes('scan_tickets') && !ps.includes('manage_event')) {
        fail(403, M.FB, 'scan_tickets only.');
      }
      const st = (q || {}).status;
      const { total, data } = await repo.checkinMonitor(ev.id, st, limit, off);
      return { status: 200, body: { data, page, limit, total } };
    }
  };
};
