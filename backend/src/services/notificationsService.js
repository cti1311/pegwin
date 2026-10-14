'use strict';
// Fan-out dispatch for server-side triggers (BRD §5.8/§5.9): ticket
// purchase/cancel, event cancel/reschedule, refunds, announcements.
// One dispatch writes the in-app inbox row, sends FCM push (both platforms),
// and sends transactional email — each channel gated by the recipient's
// notification preferences. dispatch() NEVER throws: a notification failure
// must not fail the order/payment/event flow that triggered it.
const M = require('../models/engagementModel');
const { makeEmailer } = require('../utils/emailer');

const PUSH_CHUNK = 500;

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

module.exports = (repo, ctx) => {
  const uid = ctx.uid;
  const cfg = ctx.config || {};
  const logger = ctx.logger || require('../utils/logger');
  const firebase = ctx.firebase || require('../utils/firebase');
  const emailer = ctx.emailer || makeEmailer(cfg.email);

  // recipients: [{ userId?, email? }] or recipientsFn (async thunk, so a
  // failing fan-out read is contained here and logged, never thrown).
  // userId-less entries are email-only (e.g. ticket attendees without
  // accounts): no inbox row, no push.
  // email: { subject, text, html? } — omit to skip the email channel.
  async function dispatch({ recipients, recipientsFn, type, title, body, refType, refId, email }) {
    try {
      const resolved = recipientsFn ? await recipientsFn() : recipients;
      const seen = new Set();
      const list = (resolved || []).filter((r) => {
        const key = (r.userId || '') + '|' + (r.email || '');
        if (!r.userId && !r.email) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!list.length) return { delivered: 0 };

      const userIds = [...new Set(list.map((r) => r.userId).filter(Boolean))];
      let prefRows = [];
      try {
        prefRows = await repo.prefsForUsers(userIds);
      } catch (err) {
        logger.warn('notify: prefs read failed, using defaults', { error: err.message });
      }
      const prefs = {};
      for (const row of prefRows) prefs[row.user_id] = M.toPrefs(row);
      const catKey = M.NOTIF_PREF[type];
      const wants = (userId, master) => {
        const p = prefs[userId] || M.toPrefs(null);
        return p[master] && (!catKey || p[catKey]);
      };

      // In-app inbox: the durable record, written for every account holder.
      for (const r of list) {
        if (!r.userId) continue;
        try {
          await repo.insertNotification({ id: uid(), userId: r.userId, type, title, body, refType, refId });
        } catch (err) {
          logger.warn('notify: inbox insert failed', { userId: r.userId, error: err.message });
        }
      }

      // Push via FCM (Android + iOS). Dead tokens are deregistered.
      if (cfg.pushEnabled !== false) {
        const pushIds = userIds.filter((id) => wants(id, 'push'));
        if (pushIds.length) {
          try {
            const rows = await repo.tokensForUsers(pushIds);
            const tokens = rows.map((t) => t.push_token).filter(Boolean);
            for (const slice of chunks(tokens, PUSH_CHUNK)) {
              try {
                const res = await firebase.sendPush(slice, {
                  title, body,
                  data: { type: String(type), refType: String(refType || ''), refId: String(refId || '') }
                });
                for (const dead of res.deadTokens || []) {
                  try { await repo.deleteDeviceByToken(dead); } catch (_) { /* best effort */ }
                }
              } catch (err) {
                if (err && (err.code === 'FIREBASE_NOT_CONFIGURED' || err.code === 'FIREBASE_SDK_MISSING')) {
                  logger.warn('notify: push skipped, Firebase Admin not configured');
                  break;
                }
                logger.warn('notify: push send failed', { error: err.message });
              }
            }
          } catch (err) {
            logger.warn('notify: push token read failed', { error: err.message });
          }
        }
      }

      // Transactional email with provider failover; every outcome is logged.
      if (email && emailer.canSend && emailer.canSend()) {
        const targets = list.filter((r) => r.email && (!r.userId || wants(r.userId, 'email')));
        for (const r of targets) {
          try {
            const sent = await emailer.send({ to: r.email, subject: email.subject, text: email.text, html: email.html });
            try {
              await repo.logEmail({ id: uid(), recipient: r.email, subject: email.subject, provider: sent.provider, status: 'sent' });
            } catch (_) { /* audit is best effort */ }
          } catch (err) {
            logger.warn('notify: email send failed', { recipient: r.email, error: err.message });
            try {
              await repo.logEmail({ id: uid(), recipient: r.email, subject: email.subject, provider: 'none', status: 'failed', error: String((err && err.message) || err).slice(0, 500) });
            } catch (_) { /* audit is best effort */ }
          }
        }
      }

      return { delivered: list.length };
    } catch (err) {
      logger.error('notify: dispatch failed', { type, error: err.message });
      return { delivered: 0 };
    }
  }

  return { dispatch };
};
