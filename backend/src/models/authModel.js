'use strict';
// Auth domain model: pure entity shapes, validation, and crypto helpers.
// No database access here; see repository.js (queries) and service.js (flows).
const crypto = require('crypto');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';
const ACCESS_TTL = () => Number(process.env.ACCESS_TTL_SEC || 900);
const REFRESH_TTL = () => Number(process.env.REFRESH_TTL_SEC || 2592000);

// Phone OTP is owned by Firebase Phone Auth (client SDK sends/verifies the
// code; the backend only verifies the resulting Firebase ID token). The
// legacy otp_codes table is retired and no longer written.

const E164 = /^\+[0-9]{4,16}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signJwt(payload, ttlSec) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const sig = b64url(crypto.createHmac('sha256', SECRET()).update(h + '.' + p).digest());
  return h + '.' + p + '.' + sig;
}
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + h;
}
function checkPw(pw, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 3) return pw === stored; // legacy stub seed
  const h = crypto.scryptSync(pw, parts[1], 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(parts[2]));
}
function newRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

const nowIso = () => new Date().toISOString();
const isoPlus = (sec) => new Date(Date.now() + sec * 1000).toISOString().slice(0, 19).replace('T', ' ');
const isStr = (v, a, b) => typeof v === 'string' && v.length >= a && v.length <= b;

function contactOf(b) {
  const phone = b.phone != null ? String(b.phone) : null;
  const email = b.email != null ? String(b.email).toLowerCase() : null;
  return { phone, email };
}
function needContact(phone, email) {
  return (phone && E164.test(phone)) || (email && EMAIL.test(email));
}
function targetOf(phone, email) {
  return phone || email;
}
// Public user shape returned by auth endpoints (never leaks password_hash).
function pubUser(u) {
  return {
    id: u.id, name: u.name, username: u.username || null, avatarUrl: u.avatar_url || null,
    role: u.role || 'user', phone: u.phone || null, email: u.email || null
  };
}

module.exports = {
  ACCESS_TTL, REFRESH_TTL, E164, EMAIL,
  signJwt, hashPw, checkPw, newRefreshToken,
  nowIso, isoPlus, isStr, contactOf, needContact, targetOf, pubUser
};
