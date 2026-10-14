'use strict';
// Posts service: feed, create, likes, comments, community events link,
// mute, block controls. Throws domain errors { status, code, message }
// (mapped by the route wrapper, which keeps the slice's 500 GATEWAY_ERROR
// fallback for anything unexpected). Returns { status, body } on success.
const { lim, page, now } = require('../models/postsModel');
const Dto = require('../dtos/postsDto');

module.exports = (repo, ctx) => {
  const uid = ctx.uid;
  const http = ctx.http;
  const notify = ctx.notify || null;

  return {
    async feed(communityId, query) {
      const q = query || {};
      const rows = await repo.feed(communityId, q.type, q.before, lim(q));
      return { status: 200, body: { data: rows, nextCursor: rows.length ? rows[rows.length - 1].id : null } };
    },
    async create(communityId, user, body) {
      const b = Dto.parsePost(body, user);
      const c = await repo.approvalFlag(communityId);
      const id = uid();
      const status = (c[0] || {}).require_post_approval ? 'held' : 'published';
      await repo.insertPost({
        id, communityId, authorId: user.id, type: b.type || 'post', text: b.text,
        mediaUrls: b.mediaUrls ? JSON.stringify(b.mediaUrls) : null,
        status,
        createdAt: now()
      });
      if (notify && (b.type || 'post') === 'announcement' && status === 'published') {
        await notify.dispatch({
          recipientsFn: async () => (await repo.communityMemberIds(communityId, user.id))
            .map((m) => ({ userId: m.userId })),
          type: 'community_announcement',
          title: 'New community announcement',
          body: String(b.text || '').slice(0, 200),
          refType: 'post', refId: id
        });
      }
      return { status: 201, body: { id, createdAt: now() } };
    },
    async like(postId, userId) {
      await repo.like({ id: uid(), postId, userId, createdAt: now() });
      return { status: 201, body: { postId, liked: true } };
    },
    async unlike(postId, userId) {
      await repo.unlike(postId, userId);
      return { status: 204 };
    },
    async comments(postId, query) {
      const rows = await repo.comments(postId, lim(query));
      return { status: 200, body: { data: rows, nextCursor: rows.length ? rows[rows.length - 1].id : null } };
    },
    async comment(postId, userId, body) {
      const text = Dto.parseComment(body);
      const id = uid();
      await repo.insertComment({ id, postId, authorId: userId, text, createdAt: now() });
      return { status: 201, body: { id, createdAt: now() } };
    },
    async communityEvents(communityId, query) {
      const l = lim(query), p = page(query);
      try {
        const out = await http.get('/communities/' + communityId + '/events', { params: { page: p, limit: l } });
        return { status: 200, body: out };
      } catch (_) {
        const rows = await repo.communityEvents(communityId, l, (p - 1) * l);
        return { status: 200, body: { data: rows, page: p, limit: l, total: rows.length } };
      }
    },
    async mute(communityId, userId) {
      await repo.mute({ id: uid(), communityId, userId, createdAt: now() });
      return { status: 200, body: { communityId, muted: true } };
    },
    async unmute(communityId, userId) {
      await repo.unmute(communityId, userId);
      return { status: 204 };
    },
    async blockedCommunities(userId) {
      return { status: 200, body: { data: await repo.blockedCommunities(userId) } };
    },
    async blockCommunity(userId, body) {
      const communityId = Dto.parseBlockCommunity(body);
      await repo.blockCommunity({ id: uid(), userId, communityId, createdAt: now() });
      return { status: 201, body: { communityId, blockedAt: now() } };
    },
    async unblockCommunity(userId, communityId) {
      await repo.unblockCommunity(userId, communityId);
      return { status: 204 };
    }
  };
};
