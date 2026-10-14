'use strict';
// Communities service: community CRUD, settings, team, join requests,
// reports, blocks, ownership, data, exports, community groups.
// Throws domain errors { status, code, message } (mapped by the route
// wrapper, which keeps the slice's 500 GATEWAY_ERROR fallback for anything
// unexpected). Returns { status, body } on success. No HTTP here.
const { EDITABLE, J, now } = require('../models/communitiesModel');
const { fail } = require('../helpers/domainError');
const Dto = require('../dtos/communitiesDto');

const vfail = (m) => fail(400, 'VALIDATION_ERROR', m);
const nfail = (m) => fail(404, 'NOT_FOUND', m);

module.exports = (repo, ctx) => {
  const uid = ctx.uid;

  return {
    async create(userId, b) {
      Dto.parseCreate(b);
      const id = uid();
      const createdAt = now();
      await repo.insertCommunity({
        id, ownerId: userId, name: b.name, description: b.description || null,
        category: b.category || null, avatarUrl: b.avatarUrl || null, baseType: b.baseType || null,
        city: b.city || null, state: b.state || null, country: b.country || null,
        latitude: b.latitude ?? null, longitude: b.longitude ?? null,
        discoveryRadiusKm: b.discoveryRadiusKm ?? null,
        interests: b.interests ? JSON.stringify(b.interests) : null,
        eventId: b.eventId || null, createdAt
      });
      return { status: 201, body: { id, createdAt: now() } };
    },
    async discover(userId, query) {
      const page = Math.max(1, parseInt((query || {}).page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt((query || {}).limit, 10) || 20));
      const rows = await repo.discover(userId, query || {}, limit, (page - 1) * limit);
      return { status: 200, body: { data: rows, page, limit, total: rows.length } };
    },
    async detail(communityId, userId) {
      const row = await repo.findById(communityId);
      if (!row) nfail('Community not found');
      const m = (await repo.membership(communityId, userId)) || {};
      return { status: 200, body: { ...row, membershipState: m.status || 'none', myRole: m.role } };
    },
    async patch(communityId, ownerId, body) {
      const f = Dto.parsePatch(body);
      await repo.updateFields(communityId,
        f.map((c) => EDITABLE[c] + '=?').join(','),
        f.map((c) => J(body[c])), ownerId);
      return { status: 200, body: { id: communityId, updatedAt: now() } };
    },
    async settings(communityId, key, body) {
      const f = Dto.parseSettings(key, body);
      await repo.updateFields(communityId,
        f.map((c) => c + '=?').join(','), f.map((c) => J(body[c])));
      return { status: 200, body: { id: communityId, updatedAt: now() } };
    },
    async team(communityId) {
      const rows = await repo.team(communityId);
      const t = { owner: [], admin: [], moderator: [] };
      for (const m of rows) (t[m.role] = t[m.role] || []).push(m);
      t.counts = { owner: t.owner.length, admin: t.admin.length, moderator: t.moderator.length };
      return { status: 200, body: t };
    },
    async addTeamMember(communityId, body) {
      const { userId, role } = Dto.parseTeamMember(body);
      const id = uid();
      await repo.addTeamMember({ id, communityId, userId, role, createdAt: now() });
      return { status: 201, body: { memberId: id, userId, role } };
    },
    async removeTeamMember(communityId, memberId) {
      await repo.demoteTeamMember(memberId, communityId);
      return { status: 204 };
    },
    async joinRequests(communityId, status) {
      const rows = await repo.joinRequests(communityId, status || 'pending');
      return { status: 200, body: { data: rows } };
    },
    async approveJoinRequest(communityId, requestId) {
      const row = await repo.findJoinRequest(requestId, communityId);
      if (!row) nfail('Request not found');
      const memberId = uid();
      await repo.approveJoinRequest({
        memberId, communityId, groupId: row.group_id, userId: row.user_id, createdAt: now(), requestId
      });
      return { status: 200, body: { memberId, status: 'approved' } };
    },
    async denyJoinRequest(communityId, requestId, note) {
      await repo.denyJoinRequest(requestId, communityId, note || null);
      return { status: 200, body: { status: 'denied' } };
    },
    async reports(communityId, status) {
      const rows = await repo.reports(communityId, status || 'open');
      return { status: 200, body: { data: rows } };
    },
    async reportDetail(communityId, reportId) {
      const row = await repo.findReport(reportId, communityId);
      if (!row) nfail('Report not found');
      return { status: 200, body: row };
    },
    async reportAction(communityId, reportId, action) {
      Dto.parseReportAction(action);
      if (action === 'block') {
        const row = await repo.findReportById(reportId);
        if (row && row.target_id) {
          await repo.blockUser({ id: uid(), communityId, userId: row.target_id, createdAt: now() });
        }
      }
      await repo.setReportStatus(reportId, action === 'dismiss' ? 'dismissed' : 'actioned');
      return { status: 200, body: { reportId, action } };
    },
    async blocked(communityId) {
      return { status: 200, body: { data: await repo.blocked(communityId) } };
    },
    async block(communityId, body) {
      Dto.requireBlockTarget(body);
      await repo.blockUser({ id: uid(), communityId, userId: body.userId, createdAt: now() });
      return { status: 201, body: { userId: body.userId, blockedAt: now() } };
    },
    async unblock(communityId, userId) {
      await repo.removeBlock(communityId, userId);
      return { status: 204 };
    },
    async members(communityId, query) {
      const q = query || {};
      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
      const rows = await repo.members(communityId, q.role, limit, (page - 1) * limit);
      return { status: 200, body: { data: rows, page, limit, total: rows.length } };
    },
    async transferOwnership(communityId, userId, newOwnerId) {
      Dto.parseTransfer(newOwnerId);
      const adm = await repo.adminMembership(communityId, newOwnerId);
      if (!adm.length) vfail('Must be admin');
      await repo.transferOwnership(communityId, userId, newOwnerId);
      return { status: 200, body: { communityId, ownerId: newOwnerId } };
    },
    async remove(communityId, userId, confirm) {
      Dto.parseConfirmDelete(confirm);
      await repo.deleteCommunity(communityId, userId);
      return { status: 204 };
    },
    async dataSummary(communityId) {
      const members = await repo.count('memberships', communityId);
      const posts = await repo.count('posts', communityId);
      return { status: 200, body: { members, posts, events: 0, lastUpdatedAt: now() } };
    },
    async requestExport(communityId, type) {
      Dto.parseExportType(type);
      const exportId = uid();
      await repo.insertExport({ exportId, communityId, type, createdAt: now() });
      return { status: 202, body: { exportId, status: 'queued' } };
    },
    async exports(communityId) {
      return { status: 200, body: { data: await repo.exports(communityId) } };
    },
    async createGroup(communityId, body) {
      const { name, description } = Dto.parseGroupCreate(body);
      const id = uid();
      await repo.insertGroup({ id, communityId, name, description: description || null, createdAt: now() });
      return { status: 201, body: { id, createdAt: now() } };
    },
    async groups(communityId, query) {
      const q = query || {};
      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
      const rows = await repo.groups(communityId, limit, (page - 1) * limit);
      return { status: 200, body: { data: rows, page, limit, total: rows.length } };
    }
  };
};
