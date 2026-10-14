'use strict';
// Engagement repository: all SQL for notifications, devices,
// notification_prefs, saved_events, saved_communities, analytics reads.
// Owns query text; no business rules here.
module.exports = (db) => ({
  async notifications(userId, unreadOnly, limit, off) {
    const where = unreadOnly ? 'WHERE user_id = ? AND read_at IS NULL' : 'WHERE user_id = ?';
    const [count] = await db.query(`SELECT COUNT(*) AS total FROM notifications ${where}`, [userId]);
    const [rows] = await db.query(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, off]);
    return { total: count[0].total, rows };
  },
  async markRead(notificationId, userId) {
    const [r] = await db.query(
      'UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [notificationId, userId]);
    return r.affectedRows;
  },
  async markAllRead(userId) {
    const [r] = await db.query(
      'UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL',
      [userId]);
    return r.affectedRows;
  },
  async insertNotification({ id, userId, type, title, body, refType, refId }) {
    await db.query(
      'INSERT INTO notifications (id, user_id, type, title, body, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [id, userId, type, title, body, refType || null, refId || null]);
  },
  async tokensForUsers(userIds) {
    if (!userIds.length) return [];
    const [rows] = await db.query(
      `SELECT user_id, push_token FROM devices WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
      userIds);
    return rows;
  },
  async prefsForUsers(userIds) {
    if (!userIds.length) return [];
    const [rows] = await db.query(
      `SELECT * FROM notification_prefs WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
      userIds);
    return rows;
  },
  async deleteDeviceByToken(pushToken) {
    await db.query('DELETE FROM devices WHERE push_token = ?', [pushToken]);
  },
  async logEmail({ id, recipient, subject, provider, status, error }) {
    await db.query(
      'INSERT INTO email_logs (id, recipient, subject, provider, status, error) VALUES (?, ?, ?, ?, ?, ?)',
      [id, recipient, subject, provider, status, error || null]);
  },
  async findDevice(pushToken) {
    const [rows] = await db.query('SELECT id FROM devices WHERE push_token = ?', [pushToken]);
    return rows[0] || null;
  },
  async insertDevice({ id, userId, platform, pushToken }) {
    await db.query(
      'INSERT INTO devices (id, user_id, platform, push_token, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
      [id, userId, platform, pushToken]);
  },
  async deleteDevice(deviceId, userId) {
    await db.query('DELETE FROM devices WHERE id = ? AND user_id = ?', [deviceId, userId]);
  },
  async prefs(userId) {
    const [rows] = await db.query('SELECT * FROM notification_prefs WHERE user_id = ?', [userId]);
    return rows[0] || null;
  },
  async upsertPrefs(userId, sets, vals) {
    await db.query('INSERT IGNORE INTO notification_prefs (user_id) VALUES (?)', [userId]);
    vals.push(userId);
    await db.query(`UPDATE notification_prefs SET ${sets.join(', ')} WHERE user_id = ?`, vals);
  },
  async savedEvents(userId, extra, limit, off) {
    const [count] = await db.query(
      `SELECT COUNT(*) AS total FROM saved_events s JOIN events e ON e.id = s.event_id WHERE s.user_id = ?${extra}`,
      [userId]);
    const [rows] = await db.query(
      `SELECT e.*, s.saved_at AS saved_at FROM saved_events s JOIN events e ON e.id = s.event_id WHERE s.user_id = ?${extra} ORDER BY s.saved_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, off]);
    return { total: count[0].total, rows };
  },
  async saveEvent(userId, eventId) {
    await db.query('INSERT IGNORE INTO saved_events (user_id, event_id, saved_at) VALUES (?, ?, UTC_TIMESTAMP())',
      [userId, eventId]);
  },
  async unsaveEvent(userId, eventId) {
    await db.query('DELETE FROM saved_events WHERE user_id = ? AND event_id = ?', [userId, eventId]);
  },
  async savedCommunities(userId, limit, off) {
    const [count] = await db.query('SELECT COUNT(*) AS total FROM saved_communities WHERE user_id = ?', [userId]);
    const [rows] = await db.query(
      'SELECT c.*, s.saved_at AS saved_at FROM saved_communities s JOIN communities c ON c.id = s.community_id WHERE s.user_id = ? ORDER BY s.saved_at DESC LIMIT ? OFFSET ?',
      [userId, limit, off]);
    return { total: count[0].total, rows };
  },
  async saveCommunity(userId, communityId) {
    await db.query('INSERT IGNORE INTO saved_communities (user_id, community_id, saved_at) VALUES (?, ?, UTC_TIMESTAMP())',
      [userId, communityId]);
  },
  async unsaveCommunity(userId, communityId) {
    await db.query('DELETE FROM saved_communities WHERE user_id = ? AND community_id = ?',
      [userId, communityId]);
  },
  async topEvents(hostId, limit, off) {
    const [rows] = await db.query(
      'SELECT e.id AS eventId, e.title, COUNT(t.ticket_code) AS attendees FROM events e LEFT JOIN tickets t ON t.event_id = e.id WHERE e.host_id = ? GROUP BY e.id ORDER BY attendees DESC LIMIT ? OFFSET ?',
      [hostId, limit, off]);
    return rows;
  },
  async eventOwner(eventId) {
    const [rows] = await db.query('SELECT id, host_id FROM events WHERE id = ?', [eventId]);
    return rows[0] || null;
  }
});
