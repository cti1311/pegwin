'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const S = [];
const B = Module._load;
Module._load = function (r, ...a) {
  if (r === 'express') return { Router: () => {
    const t = {};
    for (const m of 'get/post/patch/delete'.split('/')) t[m] = (p, ...h) => S.push({ m, p, h });
    return t;
  } };
  return B.call(this, r, ...a);
};
const errors = { send: (r, st, code, message) => { r.statusCode = st; r.body = { error: { code, message } }; } };
const C = [];
const F = { g: { id: 'G', community_id: 'C', join_policy: 'approval' }, rq: [{ id: 'R1', group_id: 'G', user_id: 'U1' }] };
const db = { execute: async (sql) => {
  C.push(sql);
  if (sql.startsWith('SELECT * FROM `groups`')) return [[F.g]];
  if (sql.startsWith('SELECT require_post_approval')) return [[{ require_post_approval: 0 }]];
  if (sql.startsWith('SELECT * FROM join_requests WHERE id')) return [[F.rq[0]]];
  return sql.startsWith('SELECT') ? [[]] : [{}];
} };
const deps = { db, auth: () => (q, s, n) => n(), errors, uid: () => 'X'.repeat(26), http: { get: async () => { throw 0; } } };
require('../src/routes/communitiesRoutes.js')(deps);
require('../src/routes/groupsRoutes.js')(deps);
require('../src/routes/postsRoutes.js')(deps);
const res = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; }, end() {} });
const run = async (m, p, o = {}) => {
  const h = S.find((c) => c.m === m && c.p === p);
  assert.ok(h);
  const r = res();
  await h.h[h.h.length - 1]({ user: { id: 'U1', role: 'user' }, body: {}, params: {}, query: {}, ...o }, r);
  return r;
};
test('media403', async () => {
  const r = await run('post', '/groups/:groupId/messages', { body: { type: 'image', text: 'hi', mediaUrl: 'x' }, params: { groupId: 'G' } });
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error.code, 'MEDIA_NOT_ALLOWED_FOR_MEMBERS');
});
test('text201', async () => {
  assert.equal((await run('post', '/groups/:groupId/messages', { body: { type: 'text', text: 'hi' }, params: { groupId: 'G' } })).statusCode, 201);
});
test('postmedia403', async () => {
  const r = await run('post', '/communities/:communityId/posts', { body: { text: 't', mediaUrls: ['u'] }, params: { communityId: 'C' } });
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error.code, 'MEDIA_NOT_ALLOWED_FOR_MEMBERS');
});
test('upload403', async () => {
  const b = await run('post', '/uploads', { body: { contentType: 'image/png', byteSize: 10, purpose: 'message_media' } });
  assert.equal(b.statusCode, 403);
  assert.equal((await run('post', '/uploads', { body: { contentType: 'image/png', byteSize: 10, purpose: 'avatar' } })).statusCode, 201);
});
test('joinflow', async () => {
  const d = await run('post', '/groups/:groupId/join', { params: { groupId: 'G' } });
  assert.equal(d.statusCode, 403);
  assert.equal(d.body.error.code, 'JOIN_REQUIRES_APPROVAL');
  assert.ok(C.some((s) => s.includes('INSERT INTO join_requests')));
  const a = await run('post', '/communities/:communityId/join-requests/:requestId/approve', { params: { communityId: 'C', requestId: 'R1' } });
  assert.equal(a.statusCode, 200);
  assert.ok(a.body.memberId);
  assert.ok(C.some((s) => s.includes('INSERT INTO memberships')));
});
