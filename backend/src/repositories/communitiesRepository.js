'use strict';
// Communities repository: all SQL for communities, memberships, join_requests,
// reports, blocks, exports, groups (community-scoped). Same query text as
// before; no business rules here.
module.exports = (db) => ({
  async insertCommunity(row) {
    await db.execute(
      'INSERT INTO communities (id,owner_id,name,description,category,avatar_url,base_type,city,state,country,latitude,longitude,discovery_radius_km,interests,event_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [row.id, row.ownerId, row.name, row.description, row.category, row.avatarUrl, row.baseType,
        row.city, row.state, row.country, row.latitude, row.longitude, row.discoveryRadiusKm,
        row.interests, row.eventId, row.createdAt]
    );
  },
  async discover(userId, filters, limit, off) {
    const w = ['b.user_id IS NULL'], v = [userId];
    for (const [k, c] of [['category', 'c.category'], ['city', 'c.city'], ['eventId', 'c.event_id']]) {
      if (filters[k]) { w.push(c + '=?'); v.push(filters[k]); }
    }
    if (filters.search) { w.push('c.name LIKE ?'); v.push('%' + filters.search + '%'); }
    const [rows] = await db.execute(
      'SELECT c.* FROM communities c LEFT JOIN blocks b ON b.community_id=c.id AND b.user_id=? WHERE ' +
      w.join(' AND ') + ' LIMIT ? OFFSET ?', [...v, limit, off]);
    return rows;
  },
  async findById(communityId) {
    const [rows] = await db.execute('SELECT * FROM communities WHERE id=?', [communityId]);
    return rows[0] || null;
  },
  async membership(communityId, userId) {
    const [rows] = await db.execute('SELECT role,status FROM memberships WHERE community_id=? AND user_id=?',
      [communityId, userId]);
    return rows[0] || null;
  },
  async updateFields(communityId, setClause, values, ownerId) {
    const args = [...values, communityId];
    if (ownerId) {
      await db.execute(`UPDATE communities SET ${setClause} WHERE id=? AND owner_id=?`, [...args, ownerId]);
    } else {
      await db.execute(`UPDATE communities SET ${setClause} WHERE id=?`, args);
    }
  },
  async team(communityId) {
    const [rows] = await db.execute(
      'SELECT * FROM memberships WHERE community_id=? AND role IN ("owner","admin","moderator")', [communityId]);
    return rows;
  },
  async addTeamMember({ id, communityId, userId, role, createdAt }) {
    await db.execute('INSERT INTO memberships (id,community_id,user_id,role,status,created_at) VALUES (?,?,?,?,?,?)',
      [id, communityId, userId, role, 'member', createdAt]);
  },
  async demoteTeamMember(memberId, communityId) {
    await db.execute('UPDATE memberships SET role="member" WHERE id=? AND community_id=?', [memberId, communityId]);
  },
  async joinRequests(communityId, status) {
    const [rows] = await db.execute('SELECT * FROM join_requests WHERE community_id=? AND status=?',
      [communityId, status]);
    return rows;
  },
  async findJoinRequest(requestId, communityId) {
    const [rows] = await db.execute('SELECT * FROM join_requests WHERE id=? AND community_id=?',
      [requestId, communityId]);
    return rows[0] || null;
  },
  async approveJoinRequest({ memberId, communityId, groupId, userId, createdAt, requestId }) {
    await db.execute('INSERT INTO memberships (id,community_id,group_id,user_id,role,status,created_at) VALUES (?,?,?,?,?,?,?)',
      [memberId, communityId, groupId, userId, 'member', 'member', createdAt]);
    await db.execute('UPDATE join_requests SET status="approved" WHERE id=?', [requestId]);
  },
  async denyJoinRequest(requestId, communityId, note) {
    await db.execute('UPDATE join_requests SET status="denied",note=? WHERE id=? AND community_id=?',
      [note, requestId, communityId]);
  },
  async reports(communityId, status) {
    const [rows] = await db.execute('SELECT * FROM reports WHERE community_id=? AND status=?', [communityId, status]);
    return rows;
  },
  async findReport(reportId, communityId) {
    const [rows] = await db.execute('SELECT * FROM reports WHERE id=? AND community_id=?', [reportId, communityId]);
    return rows[0] || null;
  },
  async findReportById(reportId) {
    const [rows] = await db.execute('SELECT * FROM reports WHERE id=?', [reportId]);
    return rows[0] || null;
  },
  async blockUser({ id, communityId, userId, createdAt }) {
    await db.execute('INSERT INTO blocks (id,community_id,user_id,created_at) VALUES (?,?,?,?)',
      [id, communityId, userId, createdAt]);
    await db.execute('DELETE FROM memberships WHERE community_id=? AND user_id=?', [communityId, userId]);
  },
  async setReportStatus(reportId, status) {
    await db.execute('UPDATE reports SET status=? WHERE id=?', [status, reportId]);
  },
  async blocked(communityId) {
    const [rows] = await db.execute('SELECT * FROM blocks WHERE community_id=?', [communityId]);
    return rows;
  },
  async removeBlock(communityId, userId) {
    await db.execute('DELETE FROM blocks WHERE community_id=? AND user_id=?', [communityId, userId]);
  },
  async members(communityId, role, limit, off) {
    const w = ['community_id=?'], v = [communityId];
    if (role) { w.push('role=?'); v.push(role); }
    const [rows] = await db.execute(`SELECT * FROM memberships WHERE ${w.join(' AND ')} LIMIT ? OFFSET ?`,
      [...v, limit, off]);
    return rows;
  },
  async adminMembership(communityId, userId) {
    const [rows] = await db.execute(
      'SELECT * FROM memberships WHERE community_id=? AND user_id=? AND role="admin"', [communityId, userId]);
    return rows;
  },
  async transferOwnership(communityId, oldOwnerId, newOwnerId) {
    await db.execute('UPDATE memberships SET role="admin" WHERE community_id=? AND user_id=?',
      [communityId, oldOwnerId]);
    await db.execute('UPDATE communities SET owner_id=? WHERE id=?', [newOwnerId, communityId]);
    await db.execute('UPDATE memberships SET role="owner" WHERE community_id=? AND user_id=?',
      [communityId, newOwnerId]);
  },
  async deleteCommunity(communityId, ownerId) {
    await db.execute('DELETE FROM communities WHERE id=? AND owner_id=?', [communityId, ownerId]);
  },
  async count(table, communityId) {
    const [[row]] = await db.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE community_id=?`, [communityId]);
    return (row || {}).n || 0;
  },
  async insertExport({ exportId, communityId, type, createdAt }) {
    await db.execute('INSERT INTO exports (id,community_id,type,status,created_at) VALUES (?,?,?,?,?)',
      [exportId, communityId, type, 'queued', createdAt]);
  },
  async exports(communityId) {
    const [rows] = await db.execute('SELECT * FROM exports WHERE community_id=?', [communityId]);
    return rows;
  },
  async insertGroup({ id, communityId, name, description, createdAt }) {
    await db.execute('INSERT INTO `groups` (id,community_id,name,description,created_at) VALUES (?,?,?,?,?)',
      [id, communityId, name, description, createdAt]);
  },
  async groups(communityId, limit, off) {
    const [rows] = await db.execute('SELECT * FROM `groups` WHERE community_id=? LIMIT ? OFFSET ?',
      [communityId, limit, off]);
    return rows;
  }
});
