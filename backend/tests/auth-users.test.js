'use strict';
// Supertest suite with stub deps (no MySQL/network). Run: npx jest tests/auth-users.test.js
const express = require('express');
const request = require('supertest');

function stubDb() {
  const t = { users: [], rt: [] };
  return {
    tables: t,
    async query(sql, p) {
      const q = sql.replace(/\s+/g, ' ').trim();
      const ok = [{ affectedRows: 1 }];
      let m;
      if (q.startsWith('INSERT INTO users')) { const [id, name, phone, email, password_hash, role, visibility, created_at] = p; t.users.push({ id, name, phone, email, password_hash, role, visibility, created_at }); return ok; }
      if (q.startsWith('INSERT INTO refresh_tokens')) { const [id, user_id, token, expires_at, created_at] = p; t.rt.push({ id, user_id, token, expires_at, created_at, revoked: 0 }); return ok; }
      if (q.startsWith('SELECT * FROM users WHERE phone')) return [t.users.filter((u) => u.phone === p[0] || u.email === p[1]).slice(0, 1)];
      if (q.startsWith('SELECT * FROM users WHERE id')) return [t.users.filter((u) => u.id === p[0]).slice(0, 1)];
      if (q.startsWith('SELECT id FROM users WHERE username')) return [t.users.filter((u) => u.username === p[0]).map((u) => ({ id: u.id }))];
      if (q.startsWith('SELECT id, name, username')) { const u = t.users.find((x) => x.id === p[0]); return [u ? [{ id: u.id, name: u.name, username: u.username, avatar_url: u.avatar_url }] : []]; }
      if (q.startsWith('SELECT * FROM refresh_tokens')) return [t.rt.filter((x) => x.token === p[0]).slice(0, 1)];
      if (q.startsWith('UPDATE refresh_tokens')) {
        t.rt.forEach((x) => { if ((m = /WHERE (id|token|user_id)=\?/.exec(q)) && String(x[m[1]]) === String(p[0])) x.revoked = 1; });
        return ok;
      }
      if (q.startsWith('UPDATE users SET password_hash')) { t.users.forEach((u) => { if (u.phone === p[1] || u.email === p[2]) u.password_hash = p[0]; }); return ok; }
      if (q.startsWith('UPDATE users SET visibility')) { t.users.forEach((u) => { if (u.id === p[1]) u.visibility = p[0]; }); return ok; }
      if (q.includes("'Deleted User'")) { t.users.forEach((u) => { if (u.id === p[0]) Object.assign(u, { name: 'Deleted User', phone: null, email: null, status: 'deleted' }); }); return ok; }
      if (q.startsWith('UPDATE users SET')) {
        const u = t.users.find((x) => x.id === p[p.length - 1]);
        if (u) q.slice(16, q.indexOf(' WHERE')).split(',').forEach((c, i) => { u[c.trim().split('=')[0]] = p[i]; });
        return ok;
      }
      throw new Error('stub: unhandled SQL: ' + q);
    }
  };
}

// Stub Firebase Admin: token -> verified claims. Unknown tokens are invalid.
function stubFirebase() {
  const claims = {
    'tok-asha': { phone_number: '+919876543210', email: null },
    'tok-other': { phone_number: '+911111111111', email: null },
    'tok-me': { phone_number: '+911234567890', email: null }
  };
  return {
    async verifyIdToken(t) {
      if (!claims[t]) { const e = new Error('Invalid or expired Firebase token'); e.code = 'INVALID_FIREBASE_TOKEN'; throw e; }
      return claims[t];
    }
  };
}

function testApp() {
  const app = express();
  app.use(express.json());
  const db = stubDb();
  let n = 0;
  const errors = require('../src/middleware/errors');
  const deps = { db, auth: () => [(req, res, next) => { req.user = { sub: 'me-1', role: 'user' }; next(); }], errors, uid: () => '0'.repeat(25) + String(++n % 10), http: { post: async () => ({}) }, firebase: stubFirebase() };
  db.tables.users.push({ id: 'me-1', name: 'Me', phone: '+911234567890', email: null, password_hash: 'pw', role: 'user', visibility: JSON.stringify({ profileVisible: true }), created_at: new Date().toISOString() });
  app.use('/api/v1/auth', require('../src/routes/authRoutes')(deps));
  app.use('/api/v1/users', require('../src/routes/usersRoutes')(deps));
  app.use(errors.notFound);
  app.use(errors.errorHandler);
  return app;
}
const post = (app, url, body) => request(app).post(url).send(body);

describe('auth + users slice', () => {
  test('register with Firebase token -> 201 tokens+user', async () => {
    const r = await post(testApp(), '/api/v1/auth/register', { name: 'Asha', phone: '+919876543210', password: 'secret123', firebaseIdToken: 'tok-asha' });
    expect(r.status).toBe(201);
    expect(typeof r.body.userId).toBe('string');
    expect(typeof r.body.accessToken).toBe('string');
    expect(typeof r.body.refreshToken).toBe('string');
    expect(r.body.user.phone).toBe('+919876543210');
  });
  test('register validation -> 400 VALIDATION_ERROR envelope', async () => {
    const r = await post(testApp(), '/api/v1/auth/register', { name: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });
  test('register phone mismatch -> 403 PHONE_MISMATCH', async () => {
    const r = await post(testApp(), '/api/v1/auth/register', { name: 'Asha', phone: '+919876543210', password: 'secret123', firebaseIdToken: 'tok-other' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PHONE_MISMATCH');
  });
  test('firebase verify existing user -> 200 tokens+user', async () => {
    const r = await post(testApp(), '/api/v1/auth/firebase/verify', { idToken: 'tok-me' });
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe('me-1');
    expect(typeof r.body.accessToken).toBe('string');
  });
  test('firebase verify new phone -> 200 and creates user', async () => {
    const r = await post(testApp(), '/api/v1/auth/firebase/verify', { idToken: 'tok-asha', name: 'Asha' });
    expect(r.status).toBe(200);
    expect(r.body.user.phone).toBe('+919876543210');
    expect(r.body.user.name).toBe('Asha');
  });
  test('firebase verify bad token -> 401 INVALID_FIREBASE_TOKEN', async () => {
    const r = await post(testApp(), '/api/v1/auth/firebase/verify', { idToken: 'nope' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_FIREBASE_TOKEN');
  });
  test('login with password -> 200; missing password -> 400', async () => {
    const ok = await post(testApp(), '/api/v1/auth/login', { phone: '+911234567890', password: 'pw' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe('me-1');
    const bad = await post(testApp(), '/api/v1/auth/login', { phone: '+911234567890' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
  test('password reset via Firebase token -> 200 then login works', async () => {
    const app = testApp();
    const M = require('../src/models/authModel');
    const me = (await post(app, '/api/v1/auth/login', { phone: '+911234567890', password: 'pw' }));
    expect(me.status).toBe(200);
    const r = await post(app, '/api/v1/auth/password/reset', { firebaseIdToken: 'tok-me', newPassword: 'brand-new-pw' });
    expect(r.status).toBe(200);
    expect(M.checkPw('brand-new-pw', 'plainly-not-the-hash')).toBe(false);
    const again = await post(app, '/api/v1/auth/login', { phone: '+911234567890', password: 'brand-new-pw' });
    expect(again.status).toBe(200);
  });
  test('GET /users/me -> profile envelope', async () => {
    const r = await request(testApp()).get('/api/v1/users/me');
    expect(r.status).toBe(200);
    expect(r.body.id).toBe('me-1');
    expect(r.body.visibility).toEqual({ profileVisible: true });
  });
  test('PATCH visibility + DELETE confirm guard', async () => {
    const app = testApp();
    const v = await request(app).patch('/api/v1/users/me/visibility').send({ profileVisible: false });
    expect(v.status).toBe(200);
    expect(v.body.profileVisible).toBe(false);
    expect((await request(app).delete('/api/v1/users/me')).status).toBe(400);
    const d = await request(app).delete('/api/v1/users/me?confirm=true');
    expect(d.status).toBe(202);
    expect(d.body.status).toBe('scheduled');
  });
  test('events filter validation + list envelope defaults', async () => {
    const app = testApp();
    expect((await request(app).get('/api/v1/users/me/events')).status).toBe(400);
    const ok = await request(app).get('/api/v1/users/me/events?filter=hosted');
    expect(ok.body).toEqual({ data: [], page: 1, limit: 20, total: 0 });
  });
  test('unknown route -> 404 NOT_FOUND envelope', async () => {
    const r = await request(testApp()).get('/api/v1/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});
