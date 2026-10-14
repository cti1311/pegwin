'use strict';
// Firebase Admin SDK wrapper: phone-auth token verification + FCM push send.
// The client (React Native Firebase SDK) yields FCM registration tokens on
// BOTH Android and iOS; iOS delivery is Firebase relaying to APNs via the
// APNs Auth Key uploaded in the Firebase console, so the backend has one
// send path. firebase-admin is required lazily so the app boots and the
// stubbed suites run without credentials or the package installed.
const config = require('../config');

let app = null;

function creds() {
  const fb = (config.firebase || {});
  return {
    projectId: fb.projectId || '',
    clientEmail: fb.clientEmail || '',
    privateKey: fb.privateKey || ''
  };
}

function configured() {
  const c = creds();
  return !!(c.projectId && c.clientEmail && c.privateKey);
}

function admin() {
  if (app) return app;
  if (!configured()) {
    const e = new Error('Firebase Admin not configured (FIREBASE_* env missing)');
    e.code = 'FIREBASE_NOT_CONFIGURED';
    throw e;
  }
  let adminSdk;
  try {
    adminSdk = require('firebase-admin');
  } catch (_) {
    const e = new Error('firebase-admin package not installed');
    e.code = 'FIREBASE_SDK_MISSING';
    throw e;
  }
  const c = creds();
  app = adminSdk.initializeApp({
    credential: adminSdk.credential.cert({
      projectId: c.projectId,
      clientEmail: c.clientEmail,
      privateKey: c.privateKey
    })
  });
  return app;
}

// Verify a Firebase ID token from the client phone-auth flow. Resolves to
// the decoded claims ({ phone_number?, email?, uid, ... }). Throws with
// code INVALID_FIREBASE_TOKEN when the token is bad/expired.
async function verifyIdToken(idToken) {
  try {
    return await admin().auth().verifyIdToken(idToken);
  } catch (err) {
    if (err && (err.code === 'FIREBASE_NOT_CONFIGURED' || err.code === 'FIREBASE_SDK_MISSING')) throw err;
    const e = new Error('Invalid or expired Firebase token');
    e.code = 'INVALID_FIREBASE_TOKEN';
    e.cause = err;
    throw e;
  }
}

// Send one push payload to up to 500 FCM registration tokens.
// Resolves to { sent, failed, deadTokens[] } where deadTokens are tokens
// FCM reports as permanently invalid (caller should deregister them).
async function sendPush(tokens, { title, body, data }) {
  const list = (tokens || []).filter(Boolean);
  if (!list.length) return { sent: 0, failed: 0, deadTokens: [] };
  const res = await admin().messaging().sendEachMulticast({
    tokens: list.slice(0, 500),
    notification: { title: title || '', body: body || '' },
    data: data || {}
  });
  const deadTokens = [];
  let sent = 0;
  (res.responses || []).forEach((r, i) => {
    if (r.success) { sent += 1; return; }
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token') {
      deadTokens.push(list[i]);
    }
  });
  return { sent, failed: list.length - sent, deadTokens };
}

module.exports = { configured, verifyIdToken, sendPush };
