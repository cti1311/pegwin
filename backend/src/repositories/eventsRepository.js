'use strict';
// Events repository: all SQL for events, agenda_slots, event_team,
// event_views, ratings (plus ticket-monitor reads). Same query text as before;
// no business rules here.
const { PUB } = require('../models/eventsModel');

module.exports = (db) => {
  const Q = async (s, p) => (await db.execute(s, p))[0];
  const one = async (s, p) => (await Q(s, p))[0];

  return {
    async findById(id) {
      return one('SELECT * FROM events WHERE id=?', [id]);
    },
    async findId(id) {
      return one('SELECT id FROM events WHERE id=?', [id]);
    },
    async findIdAndGoing(id) {
      return one('SELECT id,going_count FROM events WHERE id=?', [id]);
    },
    async search(q, page, limit, off) {
      const w = ['status IN (?, ?)'], p = [...PUB];
      if (q.search) { w.push('(title LIKE ? OR description LIKE ?)'); p.push(`%${q.search}%`, `%${q.search}%`); }
      for (const k of ['city', 'category', 'mode']) if (q[k]) { w.push(`${k} = ?`); p.push(q[k]); }
      if (q.eventType) { w.push('event_type = ?'); p.push(q.eventType); }
      if (q.pricingModel) { w.push('pricing_model = ?'); p.push(q.pricingModel); }
      if (q.dateFrom) { w.push('start_at >= ?'); p.push(q.dateFrom); }
      if (q.dateTo) { w.push('start_at <= ?'); p.push(q.dateTo); }
      if (q.priceMin != null && q.priceMin !== '') { w.push('min_price >= ?'); p.push(Number(q.priceMin)); }
      if (q.priceMax != null && q.priceMax !== '') { w.push('min_price <= ?'); p.push(Number(q.priceMax)); }
      if (q.lat != null && q.lng != null && q.radiusKm != null) {
        const hv = '(6371*ACOS(COS(RADIANS(?))*COS(RADIANS(latitude))*COS(RADIANS(longitude)-RADIANS(?))+SIN(RADIANS(?))*SIN(RADIANS(latitude))))';
        w.push(`${hv} <= ?`); p.push(+q.lat, +q.lng, +q.lat, +q.radiusKm);
      }
      const W = `WHERE ${w.join(' AND ')}`;
      const total = (await one(`SELECT COUNT(*)n FROM events ${W}`, p)).n;
      const rows = await Q(`SELECT * FROM events ${W} ORDER BY start_at LIMIT ? OFFSET ?`, [...p, limit, off]);
      return { total, rows };
    },
    async agenda(eventId) {
      return Q('SELECT slot_time `time`,title FROM agenda_slots WHERE event_id=? ORDER BY position', [eventId]);
    },
    async recordView(eventId, userId, anonKey) {
      await db.execute(
        'INSERT IGNORE INTO event_views (event_id,user_id,anon_key,viewed_on) VALUES (?,?,?,CURDATE())',
        [eventId, userId, anonKey]
      );
    },
    async attendeePreview(eventId) {
      return Q('SELECT ticket_code id,holder_name name,avatar_url avatarUrl FROM tickets WHERE event_id=? LIMIT 100', [eventId]);
    },
    async holdersForEvent(eventId) {
      return Q(
        "SELECT DISTINCT o.user_id AS userId, t.attendee_email AS email FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.event_id=? AND t.status NOT IN ('cancelled','refunded','expired')",
        [eventId]);
    },
    async saveRating({ id, eventId, userId, score }) {
      await db.execute(
        'INSERT INTO ratings (id,event_id,user_id,score) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score)',
        [id, eventId, userId, score]
      );
      await db.execute(
        'UPDATE events SET rating_count=(SELECT COUNT(*) FROM ratings WHERE event_id=?),avg_rating=(SELECT AVG(score) FROM ratings WHERE event_id=?) WHERE id=?',
        [eventId, eventId, eventId]
      );
    },
    async replaceAgenda(eventId, slots, uid) {
      await db.execute('DELETE FROM agenda_slots WHERE event_id=?', [eventId]);
      for (const [i, x] of slots.entries()) {
        await db.execute('INSERT INTO agenda_slots (id,event_id,slot_time,title,position) VALUES (?,?,?,?,?)',
          [uid(), eventId, x.time, x.title, i]);
      }
    },
    async insertEvent(row) {
      const k = Object.keys(row);
      await db.execute(`INSERT INTO events (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, Object.values(row));
    },
    async rehost({ id, hostId, title, description, startAt, endAt }) {
      await db.execute(
        "INSERT INTO events (id,host_id,title,description,status,start_at,end_at) VALUES (?,?,?,?,'draft',?,?)",
        [id, hostId, title, description, startAt, endAt]
      );
    },
    async updateFields(eventId, setClause, values) {
      await db.execute(`UPDATE events SET ${setClause} WHERE id=?`, [...values, eventId]);
    },
    async setStatus(eventId, status, extra) {
      if (extra) {
        await db.execute(`UPDATE events SET ${extra.set} WHERE id=?`, [...extra.values, eventId]);
      } else {
        await db.execute(`UPDATE events SET status='${status}' WHERE id=?`, [eventId]);
      }
    },
    async teamMembership(eventId, userId) {
      if (!userId) return null;
      return one('SELECT * FROM event_team WHERE event_id=? AND user_id=?', [eventId, userId]);
    },
    async addTeamMember({ id, eventId, userId, permissions }) {
      await db.execute('INSERT INTO event_team (id,event_id,user_id,permissions) VALUES (?,?,?,?)',
        [id, eventId, userId, JSON.stringify(permissions)]);
    },
    async teamList(eventId) {
      return Q('SELECT id,user_id userId,permissions FROM event_team WHERE event_id=?', [eventId]);
    },
    async updateTeamPermissions(memberId, eventId, permissions) {
      return db.execute('UPDATE event_team SET permissions=? WHERE id=? AND event_id=?',
        [JSON.stringify(permissions), memberId, eventId]);
    },
    async removeTeamMember(memberId, eventId) {
      await db.execute('DELETE FROM event_team WHERE id=? AND event_id=?', [memberId, eventId]);
    },
    async checkinMonitor(eventId, status, limit, off) {
      const wv = status ? [eventId, status] : [eventId];
      const total = (await one(
        `SELECT COUNT(*)n FROM tickets WHERE event_id=?${status ? ' AND status=?' : ''}`, wv)).n;
      const data = await Q(
        `SELECT ticket_code id,ticket_code ticketCode,holder_name attendee,status,checked_in_at checkedInAt FROM tickets WHERE event_id=?${status ? ' AND status=?' : ''} LIMIT ? OFFSET ?`,
        [...wv, limit, off]);
      return { total, data };
    }
  };
};
