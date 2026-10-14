'use strict';
// Groups service: group CRUD, join/leave, members, messages, reports, uploads.
// Throws domain errors { status, code, message } (mapped by the route
// wrapper, which keeps the slice's 500 GATEWAY_ERROR fallback for anything
// unexpected). Returns { status, body } on success. No HTTP here.
const { WARN, UPLOAD_TTL_MS, lim, page, mediaUrl, now } = require('../models/groupsModel');
const { fail } = require('../helpers/domainError');
const Dto = require('../dtos/groupsDto');

const nfail = (m) => fail(404, 'NOT_FOUND', m);

module.exports = (repo, ctx) => {
  const uid = ctx.uid;
  const notify = ctx.notify || null;

  return {
    async detail(groupId) {
      const row = await repo.findGroup(groupId);
      if (!row) nfail('Group not found');
      return { status: 200, body: row };
    },
    async patch(groupId, body) {
      const f = Dto.parseGroupPatch(body);
      const fields = {};
      f.forEach((c) => { fields[c] = body[c]; });
      await repo.updateGroup(groupId, fields);
      return { status: 200, body: { id: groupId, updatedAt: now() } };
    },
    async remove(groupId) {
      await repo.deleteGroup(groupId);
      return { status: 204 };
    },
    async join(groupId, userId) {
      const g = await repo.findGroup(groupId);
      if (!g) nfail('Group not found');
      if (g.join_policy !== 'open') {
        const ok = await repo.approvedJoinRequest(groupId, userId);
        if (!ok.length) {
          await repo.requestJoin({ id: uid(), communityId: g.community_id, groupId, userId, createdAt: now() });
          fail(403, 'JOIN_REQUIRES_APPROVAL', 'Approval required');
        }
      }
      const memberId = uid();
      await repo.addMembership({ id: memberId, communityId: g.community_id, groupId, userId, createdAt: now() });
      return { status: 200, body: { memberId, communityWarning: WARN } };
    },
    async leave(groupId, userId) {
      await repo.leaveGroup(groupId, userId);
      return { status: 204 };
    },
    async members(groupId, query) {
      const l = lim(query), p = page(query);
      const rows = await repo.members(groupId, l, (p - 1) * l);
      return { status: 200, body: { data: rows, page: p, limit: l, total: rows.length } };
    },
    async removeMember(groupId, memberId) {
      await repo.removeMember(memberId, groupId);
      return { status: 204 };
    },
    async messages(groupId, query) {
      const rows = await repo.messages(groupId, (query || {}).before, lim(query));
      return { status: 200, body: { data: rows, nextCursor: rows.length ? rows[rows.length - 1].id : null } };
    },
    async sendMessage(groupId, user, body) {
      const b = Dto.parseMessage(body, user);
      const id = uid();
      await repo.insertMessage({
        id, groupId, authorId: user.id, type: b.type, text: b.text,
        mediaUrl: b.mediaUrl || null, title: b.title || null, createdAt: now()
      });
      if (notify && b.type === 'announcement') {
        await notify.dispatch({
          recipientsFn: async () => (await repo.groupMemberIds(groupId, user.id))
            .map((m) => ({ userId: m.userId })),
          type: 'community_announcement',
          title: b.title || 'New group announcement',
          body: String(b.text || '').slice(0, 200),
          refType: 'message', refId: id
        });
      }
      return { status: 201, body: { id, createdAt: now() } };
    },
    async deleteMessage(groupId, messageId) {
      await repo.deleteMessage(messageId, groupId);
      return { status: 204 };
    },
    async report(userId, body) {
      const b = Dto.parseReport(body);
      const id = uid();
      await repo.insertReport({
        id, targetType: b.targetType, targetId: b.targetId, reason: b.reason,
        reporterId: userId, createdAt: now()
      });
      return { status: 201, body: { id, createdAt: now() } };
    },
    async uploadSlot(user, body) {
      const b = Dto.parseUploadSlot(body, user);
      const id = uid(), url = mediaUrl(b.purpose, id);
      await repo.insertUpload({ id, userId: user.id, purpose: b.purpose, contentType: b.contentType, mediaUrl: url, createdAt: now() });
      return {
        status: 201,
        body: { uploadUrl: url + '?upload=1', mediaUrl: url, expiresAt: new Date(Date.now() + UPLOAD_TTL_MS).toISOString() }
      };
    }
  };
};
