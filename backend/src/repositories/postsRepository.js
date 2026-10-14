'use strict';
// Posts repository: all SQL for posts, likes, comments, community_events,
// mutes, user_blocked_communities (plus the approval flag read). Same query
// text as before; no business rules here.
module.exports = (db) => ({
  async feed(communityId, type, before, limit) {
    const w = ['community_id=?'], v = [communityId];
    if (type) { w.push('type=?'); v.push(type); }
    if (before) { w.push('id<?'); v.push(before); }
    const [rows] = await db.execute(`SELECT * FROM posts WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ?`,
      [...v, limit]);
    return rows;
  },
  async approvalFlag(communityId) {
    const [rows] = await db.execute('SELECT require_post_approval FROM communities WHERE id=?', [communityId]);
    return rows;
  },
  async insertPost({ id, communityId, authorId, type, text, mediaUrls, status, createdAt }) {
    await db.execute('INSERT INTO posts (id,community_id,author_id,type,text,media_urls,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, communityId, authorId, type, text, mediaUrls, status, createdAt]);
  },
  async like({ id, postId, userId, createdAt }) {
    await db.execute('INSERT IGNORE INTO likes (id,post_id,user_id,created_at) VALUES (?,?,?,?)',
      [id, postId, userId, createdAt]);
  },
  async unlike(postId, userId) {
    await db.execute('DELETE FROM likes WHERE post_id=? AND user_id=?', [postId, userId]);
  },
  async comments(postId, limit) {
    const [rows] = await db.execute('SELECT * FROM comments WHERE post_id=? ORDER BY id DESC LIMIT ?', [postId, limit]);
    return rows;
  },
  async insertComment({ id, postId, authorId, text, createdAt }) {
    await db.execute('INSERT INTO comments (id,post_id,author_id,text,created_at) VALUES (?,?,?,?,?)',
      [id, postId, authorId, text, createdAt]);
  },
  async communityEvents(communityId, limit, off) {
    const [rows] = await db.execute('SELECT * FROM community_events WHERE community_id=? LIMIT ? OFFSET ?',
      [communityId, limit, off]);
    return rows;
  },
  async mute({ id, communityId, userId, createdAt }) {
    await db.execute('INSERT IGNORE INTO mutes (id,community_id,user_id,created_at) VALUES (?,?,?,?)',
      [id, communityId, userId, createdAt]);
  },
  async unmute(communityId, userId) {
    await db.execute('DELETE FROM memberships WHERE community_id=? AND user_id=?', [communityId, userId]);
  },
  async blockedCommunities(userId) {
    const [rows] = await db.execute('SELECT * FROM user_blocked_communities WHERE user_id=?', [userId]);
    return rows;
  },
  async blockCommunity({ id, userId, communityId, createdAt }) {
    await db.execute('INSERT IGNORE INTO user_blocked_communities (id,user_id,community_id,created_at) VALUES (?,?,?,?)',
      [id, userId, communityId, createdAt]);
  },
  async communityMemberIds(communityId, excludeUserId) {
    const [rows] = await db.execute(
      'SELECT DISTINCT m.user_id AS userId FROM memberships m ' +
      'LEFT JOIN mutes mu ON mu.community_id=m.community_id AND mu.user_id=m.user_id ' +
      'LEFT JOIN user_blocked_communities b ON b.community_id=m.community_id AND b.user_id=m.user_id ' +
      'WHERE m.community_id=? AND m.user_id<>? AND mu.id IS NULL AND b.id IS NULL',
      [communityId, excludeUserId]);
    return rows;
  },
  async unblockCommunity(userId, communityId) {
    await db.execute('DELETE FROM user_blocked_communities WHERE user_id=? AND community_id=?', [userId, communityId]);
  }
});
