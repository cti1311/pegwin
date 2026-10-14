'use strict';
// Multi-provider transactional email with failover. Providers are plain SMTP
// configs so one implementation covers SES, Brevo, and any future SMTP host;
// API-only vendors plug in as { name, send } entries in the chain.
// nodemailer is required lazily so the app boots and stubbed suites run
// without the package installed. Nothing here touches the DB; the caller
// logs each send outcome via the engagement repository (email_logs).
const config = require('../config');

const transporters = {};

function transporterFor(provider) {
  if (transporters[provider.name]) return transporters[provider.name];
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_) {
    const e = new Error('nodemailer package not installed');
    e.code = 'EMAIL_SDK_MISSING';
    throw e;
  }
  const t = nodemailer.createTransport({
    host: provider.host,
    port: provider.port,
    secure: provider.port === 465,
    auth: { user: provider.user, pass: provider.pass }
  });
  transporters[provider.name] = t;
  return t;
}

function smtpProvider(name, c) {
  if (!c || !c.host || !c.user || !c.pass) return null;
  return {
    name,
    async send({ from, to, subject, text, html }) {
      const info = await transporterFor({ name, host: c.host, port: c.port, user: c.user, pass: c.pass })
        .sendMail({ from, to, subject, text, html });
      return { messageId: info && info.messageId };
    }
  };
}

// Ordered provider chain from config: [primary, failover], skipping empty
// or unconfigured slots. SES primary + Brevo failover is the default.
function chainFrom(emailCfg) {
  const cfg = emailCfg || {};
  const out = [];
  for (const slot of [cfg.primary, cfg.failover]) {
    if (!slot || (out.some((p) => p.name === slot))) continue;
    if (slot === 'ses') { const p = smtpProvider('ses', cfg.ses); if (p) out.push(p); }
    else if (slot === 'brevo') { const p = smtpProvider('brevo', cfg.brevo); if (p) out.push(p); }
  }
  return out;
}

function makeEmailer(emailCfg) {
  const cfg = emailCfg || {};
  return {
    canSend() {
      return cfg.enabled !== false && chainFrom(cfg).length > 0;
    },
    // Resolves to { provider, messageId }. Throws with code EMAIL_FAILED
    // (plus .attempts) when every configured provider fails, or
    // EMAIL_NOT_CONFIGURED when the chain is empty.
    async send({ to, subject, text, html }) {
      const chain = chainFrom(cfg);
      if (!chain.length) {
        const e = new Error('No email provider configured');
        e.code = 'EMAIL_NOT_CONFIGURED';
        throw e;
      }
      const attempts = [];
      for (const p of chain) {
        try {
          const r = await p.send({ from: cfg.from, to, subject, text, html });
          return { provider: p.name, messageId: r && r.messageId };
        } catch (err) {
          attempts.push({ provider: p.name, error: (err && err.message) || String(err) });
        }
      }
      const e = new Error('All email providers failed');
      e.code = 'EMAIL_FAILED';
      e.attempts = attempts;
      throw e;
    }
  };
}

module.exports = { makeEmailer, chainFrom };
