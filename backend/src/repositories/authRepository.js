'use strict';
// Auth repository: all SQL for refresh_tokens. (Phone OTP moved to Firebase
// Phone Auth; the legacy otp_codes table is retired and no longer written.)
// Owns query text and row-shape normalization; no business rules here.
async function rowsOf(db, sql, params) {
  const r = await db.query(sql, params || []);
  if (Array.isArray(r)) return Array.isArray(r[0]) ? r[0] : r;
  if (r && Array.isArray(r.rows)) return r.rows;
  return r || [];
}

module.exports = (db) => ({
  async saveRefreshToken({ id, userId, token, expiresAt, createdAt }) {
    await db.query(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES (?,?,?,?,?)',
      [id, userId, token, expiresAt, createdAt]
    );
  },
  async findRefreshToken(token) {
    return rowsOf(db, 'SELECT * FROM refresh_tokens WHERE token=? LIMIT 1', [token]);
  },
  async revokeRefreshTokenById(id) {
    await db.query('UPDATE refresh_tokens SET revoked=1 WHERE id=?', [id]);
  },
  async revokeRefreshTokenByToken(token) {
    await db.query('UPDATE refresh_tokens SET revoked=1 WHERE token=?', [token]);
  },
  async revokeRefreshTokensByUser(userId) {
    await db.query('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?', [userId]);
  }
});
