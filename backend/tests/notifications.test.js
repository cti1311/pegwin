'use strict';
// Notifications dispatch tests: inbox/push/email fan-out with pref gating.
// Plain node, no external packages. Run: node backend/tests/notifications.test.js
const assert = require('assert');
const makeNotify = require('../src/services/notificationsService');

function stubs() {
  const calls = { inbox: [], push: [], dead: [], email: [], emailLog: [] };
  const repo = {
    async prefsForUsers(ids) {
      return ids.map((id) => {
        if (id === 'U2') return { user_id: 'U2', push: 0 };
        if (id === 'U3') return { user_id: 'U3', email: 0 };
        return { user_id: id, push: 1, email: 1 };
      });
    },
    async insertNotification(row) { calls.inbox.push(row); },
    async tokensForUsers(ids) {
      return ids.map((id) => ({ user_id: id, push_token: 'tok-' + id }));
    },
    async deleteDeviceByToken(t) { calls.dead.push(t); },
    async logEmail(row) { calls.emailLog.push(row); }
  };
  const firebase = {
    async sendPush(tokens, payload) {
      calls.push.push({ tokens, payload });
      return { sent: tokens.length, failed: 0, deadTokens: ['tok-U3'] };
    }
  };
  const emailer = {
    canSend: () => true,
    async send(msg) { calls.email.push(msg); return { provider: 'ses', messageId: 'm1' }; }
  };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  return { calls, repo, firebase, emailer, logger };
}

async function testFanout() {
  const s = stubs();
  let n = 0;
  const notify = makeNotify(s.repo, { uid: () => 'N' + (++n), config: {}, logger: s.logger, firebase: s.firebase, emailer: s.emailer });
  const out = await notify.dispatch({
    recipients: [{ userId: 'U1', email: 'u1@x.in' }, { userId: 'U2', email: 'u2@x.in' }, { userId: 'U3', email: 'u3@x.in' }, { email: 'guest@x.in' }],
    type: 'ticket_purchase',
    title: 'Booking confirmed',
    body: 'done',
    refType: 'order',
    refId: 'O1',
    email: { subject: 'Confirmed', text: 'hi' }
  });
  assert.strictEqual(out.delivered, 4);
  // Inbox: account holders only.
  assert.deepStrictEqual(s.calls.inbox.map((r) => r.userId).sort(), ['U1', 'U2', 'U3']);
  assert.ok(s.calls.inbox.every((r) => r.type === 'ticket_purchase' && r.refId === 'O1'));
  // Push: U2 opted out of push.
  assert.strictEqual(s.calls.push.length, 1);
  assert.deepStrictEqual(s.calls.push[0].tokens.sort(), ['tok-U1', 'tok-U3']);
  assert.deepStrictEqual(s.calls.push[0].payload.data, { type: 'ticket_purchase', refType: 'order', refId: 'O1' });
  // Dead token deregistered.
  assert.deepStrictEqual(s.calls.dead, ['tok-U3']);
  // Email: U3 opted out; guest (no account) still gets transactional mail.
  assert.deepStrictEqual(s.calls.email.map((m) => m.to).sort(), ['guest@x.in', 'u1@x.in', 'u2@x.in']);
  assert.ok(s.calls.emailLog.every((r) => r.status === 'sent' && r.provider === 'ses'));
  console.log('ok - fanout with pref gating');
}

async function testNeverThrows() {
  const boom = () => { throw new Error('db down'); };
  const repo = { prefsForUsers: boom, insertNotification: boom, tokensForUsers: boom, deleteDeviceByToken: boom, logEmail: boom };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const firebase = { async sendPush() { throw new Error('fcm down'); } };
  const emailer = { canSend: () => true, async send() { throw new Error('smtp down'); } };
  const notify = makeNotify(repo, { uid: () => 'N', config: {}, logger, firebase, emailer });
  const out = await notify.dispatch({
    recipientsFn: async () => { throw new Error('fanout down'); },
    type: 'refund', title: 't', body: 'b'
  });
  assert.deepStrictEqual(out, { delivered: 0 });
  console.log('ok - dispatch never throws');
}

async function testEmailSkippedWhenNoProvider() {
  const s = stubs();
  s.emailer.canSend = () => false;
  const notify = makeNotify(s.repo, { uid: () => 'N', config: {}, logger: s.logger, firebase: s.firebase, emailer: s.emailer });
  await notify.dispatch({
    recipients: [{ userId: 'U1', email: 'u1@x.in' }],
    type: 'refund', title: 't', body: 'b',
    email: { subject: 's', text: 't' }
  });
  assert.strictEqual(s.calls.email.length, 0);
  assert.strictEqual(s.calls.emailLog.length, 0);
  assert.strictEqual(s.calls.inbox.length, 1);
  console.log('ok - email skipped without provider');
}

(async () => {
  await testFanout();
  await testNeverThrows();
  await testEmailSkippedWhenNoProvider();
  console.log('notifications slice OK');
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
