'use strict';
// Groups repository: all SQL for groups, memberships, join_requests,
// messages, reports, uploads. Same query text as before; no rules here.
module.exports = (db) => ({
  async findGroup(groupId) {
    const [rows] = await db.execute('SELECT * FROM `groups` WHERE id=?', [groupId]);
    return rows[0] || null;
  },
  async updateGroup(groupId, fields) {
    const keys = Object.keys(fields);
    await db.execute('UPDATE `groups` SET ' + keys.map((c) => c + '=?').join(',') + ' WHERE id=?',
      [...keys.map((c) => fields[c]), groupId]);
  },
  async deleteGroup(groupId) {
    await db.execute('DELETE FROM `groups` WHERE id=?', [groupId]);
  },
  async approvedJoinRequest(groupId, userId) {
    const [rows] = await db.execute(
      'SELECT * FROM join_requests WHERE group_id=? AND user_id=? AND status="approved"', [groupId, userId]);
    return rows;
  },
  async requestJoin({ id, communityId, groupId, userId, createdAt }) {
    await db.execute('INSERT INTO join_requests (id,community_id,group_id,user_id,status,created_at) VALUES (?,?,?,?,?,?)',
      [id, communityId, groupId, userId, 'pending', createdAt]);
  },
  async addMembership({ id, communityId, groupId, userId, createdAt }) {
    await db.execute('INSERT INTO memberships (id,community_id,group_id,user_id,role,status,created_at) VALUES (?,?,?,?,?,?,?)',
      [id, communityId, groupId, userId, 'member', 'member', createdAt]);
  },
  async leaveGroup(groupId, userId) {
    await db.execute('DELETE FROM memberships WHERE group_id=? AND user_id=?', [groupId, userId]);
  },
  async members(groupId, limit, off) {
    const [rows] = await db.execute('SELECT * FROM memberships WHERE group_id=? LIMIT ? OFFSET ?', [groupId, limit, off]);
    return rows;
  },
  async groupMemberIds(groupId, excludeUserId) {
    const [rows] = await db.execute(
      'SELECT DISTINCT m.user_id AS userId FROM memberships m JOIN `groups` g ON g.id=m.group_id ' +
      'LEFT JOIN mutes mu ON mu.community_id=g.community_id AND mu.user_id=m.user_id ' +
      'LEFT JOIN user_blocked_communities b ON b.community_id=g.community_id AND b.user_id=m.user_id ' +
      'WHERE m.group_id=? AND m.user_id<>? AND mu.id IS NULL AND b.id IS NULL',
      [groupId, excludeUserId]);
    return rows;
  },
  async removeMember(memberId, groupId) {
    await db.execute('DELETE FROM memberships WHERE id=? AND group_id=?', [memberId, groupId]);
  },
  async messages(groupId, before, limit) {
    const w = ['group_id=?'], v = [groupId];
    if (before) { w.push('id<?'); v.push(before); }
    const [rows] = await db.execute(`SELECT * FROM messages WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ?`,
      [...v, limit]);
    return rows;
  },
  async insertMessage({ id, groupId, authorId, type, text, mediaUrl, title, createdAt }) {
    await db.execute('INSERT INTO messages (id,group_id,author_id,type,text,media_url,title,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, groupId, authorId, type, text, mediaUrl, title, createdAt]);
  },
  async deleteMessage(messageId, groupId) {
    await db.execute('DELETE FROM messages WHERE id=? AND group_id=?', [messageId, groupId]);
  },
  async insertReport({ id, targetType, targetId, reason, reporterId, createdAt }) {
    await db.execute('INSERT INTO reports (id,target_type,target_id,reason,reporter_id,status,created_at) VALUES (?,?,?,?,?,?,?)',
      [id, targetType, targetId, reason, reporterId, 'open', createdAt]);
  },
  async insertUpload({ id, userId, purpose, contentType, mediaUrl, createdAt }) {
    await db.execute('INSERT INTO uploads (id,user_id,purpose,content_type,media_url,created_at) VALUES (?,?,?,?,?,?)',
      [id, userId, purpose, contentType, mediaUrl, createdAt]);
  }
});
