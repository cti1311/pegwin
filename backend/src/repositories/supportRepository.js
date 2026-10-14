'use strict';
// Support repository: all SQL for support_threads, support_messages,
// help_articles, content_pages, meta_* tables. Same query text as before.
module.exports = (db) => ({
  async threads(userId) {
    const [rows] = await db.query('SELECT * FROM support_threads WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
    return rows;
  },
  async insertThread({ id, userId, topic }) {
    await db.query(
      "INSERT INTO support_threads (id, user_id, topic, status, created_at, updated_at) VALUES (?, ?, ?, 'open', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
      [id, userId, topic]);
  },
  async ownedThread(conversationId, userId) {
    const [rows] = await db.query('SELECT id FROM support_threads WHERE id = ? AND user_id = ?',
      [conversationId, userId]);
    return rows;
  },
  async messages(conversationId, before, limit) {
    const clause = before ? 'AND m.created_at < ?' : '';
    const args = before ? [conversationId, before, limit + 1] : [conversationId, limit + 1];
    const [rows] = await db.query(
      `SELECT m.* FROM support_messages m WHERE m.conversation_id = ? ${clause} ORDER BY m.created_at DESC LIMIT ?`,
      args);
    return rows;
  },
  async insertMessage({ id, conversationId, text }) {
    await db.query("INSERT INTO support_messages (id, conversation_id, sender, text, created_at) VALUES (?, ?, 'user', ?, UTC_TIMESTAMP())",
      [id, conversationId, text]);
    await db.query('UPDATE support_threads SET updated_at = UTC_TIMESTAMP() WHERE id = ?', [conversationId]);
  },
  async articles(search, category) {
    const conds = [];
    const args = [];
    if (search) { conds.push('(title LIKE ? OR body LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
    if (category) { conds.push('category = ?'); args.push(category); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await db.query(`SELECT * FROM help_articles ${where} ORDER BY updated_at DESC LIMIT 50`, args);
    return rows;
  },
  async article(articleId) {
    const [rows] = await db.query('SELECT * FROM help_articles WHERE id = ?', [articleId]);
    return rows[0] || null;
  },
  async contentPage(slug) {
    const [rows] = await db.query('SELECT * FROM content_pages WHERE slug = ?', [slug]);
    return rows[0] || null;
  },
  async metaList(table, state) {
    if (table === 'meta_cities') {
      const args = [];
      let where = '';
      if (state) { where = 'WHERE state = ?'; args.push(state); }
      const [rows] = await db.query(`SELECT name FROM meta_cities ${where} ORDER BY name`, args);
      return rows;
    }
    const [rows] = await db.query(`SELECT name FROM ${table} ORDER BY name`);
    return rows;
  }
});
