'use strict';
// Check-ins repository: all SQL for the checkins table.
// Owns query text; no business rules here.
module.exports = (db) => ({
  async validationRows(eventId, since) {
    let sql = 'SELECT ticket_code ticketCode, tier_id tierId, attendee, updated_at updatedAt FROM checkins WHERE event_id=?';
    const args = [eventId];
    if (since) {
      sql += ' AND updated_at>?';
      args.push(since);
    }
    const [rows] = await db.execute(sql, args);
    return rows;
  },
  async findCheckin(ticketCode) {
    const [rows] = await db.execute('SELECT id,checked_in_at FROM checkins WHERE ticket_code=?', [ticketCode]);
    return rows[0] || null;
  },
  // Atomic one-success: only an unchecked row flips; concurrent scans of one
  // code yield exactly one success.
  async claimCheckin(ticketCode, checkedInAt, scannedAt) {
    const [r] = await db.execute(
      'UPDATE checkins SET status="checked_in", checked_in_at=?, scanned_at=? WHERE ticket_code=? AND checked_in_at IS NULL',
      [checkedInAt, scannedAt, ticketCode]
    );
    return r.affectedRows;
  },
  async monitorRows(eventId, limit, off) {
    const [rows] = await db.execute('SELECT * FROM checkins WHERE event_id=? LIMIT ? OFFSET ?',
      [eventId, limit, off]);
    return rows;
  }
});
