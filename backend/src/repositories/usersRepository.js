'use strict';
// Users repository: all SQL touching the users table (also used by auth flows).
// Owns query text and row-shape normalization; no business rules here.
async function rowsOf(db, sql, params) {
  const r = await db.query(sql, params || []);
  if (Array.isArray(r)) return Array.isArray(r[0]) ? r[0] : r;
  if (r && Array.isArray(r.rows)) return r.rows;
  return r || [];
}

module.exports = (db) => ({
  async findById(id) {
    return rowsOf(db, 'SELECT * FROM users WHERE id=? LIMIT 1', [id]);
  },
  async findByContact(phone, email) {
    return rowsOf(db, 'SELECT * FROM users WHERE phone=? OR email=? LIMIT 1', [phone, email]);
  },
  async findIdByUsername(username) {
    return rowsOf(db, 'SELECT id FROM users WHERE username=? LIMIT 1', [username]);
  },
  async findPublicById(id) {
    return rowsOf(db, 'SELECT id, name, username, avatar_url FROM users WHERE id=? LIMIT 1', [id]);
  },
  async insert({ id, name, phone, email, passwordHash, role, visibility, createdAt }) {
    await db.query(
      'INSERT INTO users (id, name, phone, email, password_hash, role, visibility, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, name, phone, email, passwordHash, role, visibility, createdAt]
    );
  },
  // patch: { colName: value } with snake_case columns already mapped by the service.
  async updateFields(id, patch) {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const set = keys.map((k) => k + '=?').join(', ');
    const vals = keys.map((k) => patch[k]);
    await db.query('UPDATE users SET ' + set + ' WHERE id=?', [...vals, id]);
  },
  async updateVisibility(id, visibilityJson) {
    await db.query('UPDATE users SET visibility=? WHERE id=?', [visibilityJson, id]);
  },
  async updatePassword(phone, email, passwordHash) {
    await db.query('UPDATE users SET password_hash=? WHERE phone=? OR email=?', [passwordHash, phone, email]);
  },
  async anonymize(id) {
    await db.query(
      "UPDATE users SET name='Deleted User', username=NULL, phone=NULL, email=NULL, avatar_url=NULL, bio=NULL, city=NULL, country=NULL, social_links='{}', status='deleted' WHERE id=?",
      [id]
    );
  }
});
