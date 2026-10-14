'use strict';
// Minimal mysql2 wrapper exposing both execute() and query().
// Slices built with db.execute; engagement/admin/support built with db.query.
const mysql = require('mysql2/promise');
const config = require('../config');

let pool = null;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10
    });
  }
  return pool;
}

module.exports = {
  execute: (sql, args) => getPool().execute(sql, args || []),
  query: (sql, args) => getPool().query(sql, args || [])
};
