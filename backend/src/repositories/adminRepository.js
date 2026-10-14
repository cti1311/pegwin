'use strict';
// Admin repository: all SQL for events/hosts moderation, reports,
// audit_logs. Owns query text; no business rules here.
module.exports = (db) => ({
  async reviewQueue(limit, off) {
    const [count] = await db.query("SELECT COUNT(*) AS total FROM events WHERE status = 'review'");
    const [rows] = await db.query(
      'SELECT * FROM events WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', ['review', limit, off]);
    return { total: count[0].total, rows };
  },
  async eventExists(eventId) {
    const [rows] = await db.query('SELECT id FROM events WHERE id = ?', [eventId]);
    return rows.length > 0;
  },
  async setEventStatus(eventId, status) {
    await db.query('UPDATE events SET status = ? WHERE id = ?', [status, eventId]);
  },
  async flaggedHosts(limit, off) {
    const [rows] = await db.query(
      `SELECT h.*, COUNT(CASE WHEN e.status = 'cancelled' THEN 1 END) AS cancelled_events
       FROM hosts h LEFT JOIN events e ON e.host_id = h.id
       GROUP BY h.id HAVING cancelled_events >= 3 ORDER BY cancelled_events DESC LIMIT ? OFFSET ?`,
      [limit, off]);
    return rows;
  },
  async findHost(hostId) {
    const [rows] = await db.query('SELECT id FROM hosts WHERE id = ?', [hostId]);
    return rows.length > 0;
  },
  async setHostVerification(hostId, identity, payoutAccount) {
    await db.query('UPDATE hosts SET identity_status = ?, payout_status = ? WHERE id = ?',
      [identity, payoutAccount, hostId]);
  },
  async hostExistsById(idCol, table, id) {
    const [rows] = await db.query(`SELECT ${idCol} FROM ${table} WHERE ${idCol} = ?`, [id]);
    return rows.length > 0;
  },
  async setStatus(table, idCol, status, id) {
    await db.query(`UPDATE ${table} SET status = ? WHERE ${idCol} = ?`, [status, id]);
  },
  async audit(actorId, action, entityType, entityId, uid) {
    await db.query(
      'INSERT INTO audit_logs (id, action, actor_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [uid(), actorId, action, entityType, entityId]);
  },
  async reportQueue(status, limit, off) {
    const where = status ? 'WHERE status = ?' : '';
    const args = status ? [status] : [];
    const [count] = await db.query(`SELECT COUNT(*) AS total FROM reports ${where}`, args);
    const [rows] = await db.query(
      `SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...args, limit, off]);
    return { total: count[0].total, rows };
  },
  async resolveReport(reportId, status, actionNote) {
    const [r] = await db.query('UPDATE reports SET status = ?, action_note = ? WHERE id = ?',
      [status, actionNote, reportId]);
    return r.affectedRows;
  },
  async auditLogs(filters, limit, off) {
    const conds = [];
    const args = [];
    [['action', 'action'], ['actorId', 'actor_id'], ['entityType', 'entity_type'], ['entityId', 'entity_id']]
      .forEach(([q, c]) => {
        if (filters[q]) { conds.push(`${c} = ?`); args.push(filters[q]); }
      });
    if (filters.from) { conds.push('created_at >= ?'); args.push(filters.from); }
    if (filters.to) { conds.push('created_at <= ?'); args.push(filters.to); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [count] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs ${where}`, args);
    const [rows] = await db.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...args, limit, off]);
    return { total: count[0].total, rows };
  }
});
