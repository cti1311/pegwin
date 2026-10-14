'use strict';
// Applies backend/migrations/*.sql in filename order, tracking progress in
// schema_migrations. Forward-only: there are no down migrations by design
// (roll forward with a new migration file instead of editing a deployed one).
// Usage: npm run migrate  (env: DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true
  });
  await conn.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL)'
  );
  const [done] = await conn.query('SELECT name FROM schema_migrations');
  const applied = new Set(done.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) {
      console.log('skip  ' + file);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await conn.query(sql);
    await conn.query('INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP())', [file]);
    console.log('applied ' + file);
  }
  await conn.end();
  console.log('migrations up to date');
}

main().catch((err) => {
  console.error('migration failed:', err.message);
  process.exit(1);
});
