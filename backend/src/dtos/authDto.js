'use strict';
// Auth DTOs: request parsing/validation and response shaping for §2.
// Every parse* throws a domain error on invalid input and returns a clean
// object otherwise. Services consume these; no DB or HTTP here.
//
// Phone verification is owned by Firebase Phone Auth: the client SDK sends
// and verifies the SMS code, then hands the backend a Firebase ID token.
// The /otp/* endpoints and otp_codes table are retired.
const { fail } = require('../helpers/domainError');
const M = require('../models/authModel');

function contact(b, message) {
  const { phone, email } = M.contactOf(b || {});
  if (!M.needContact(phone, email)) fail(400, 'VALIDATION_ERROR', message);
  return { phone, email, target: M.targetOf(phone, email) };
}
function idToken(b, key) {
  const t = b && b[key];
  if (!M.isStr(t, 1, 8000)) fail(400, 'VALIDATION_ERROR', `${key} required`);
  return t;
}

function parseRegister(b) {
  const body = b || {};
  if (!M.isStr(body.name, 1, 100) || !M.isStr(body.password, 8, 72)) {
    fail(400, 'VALIDATION_ERROR', 'name (1-100) and password (8-72) required');
  }
  const c = contact(body, 'One of phone (E.164) or email required');
  return { name: body.name, password: body.password, ...c, firebaseIdToken: idToken(body, 'firebaseIdToken') };
}
function parseFirebaseVerify(b) {
  const body = b || {};
  const out = { idToken: idToken(body, 'idToken') };
  if (body.name != null) {
    if (!M.isStr(body.name, 1, 100)) fail(400, 'VALIDATION_ERROR', 'name (1-100) required');
    out.name = body.name;
  }
  return out;
}
function parseLogin(b) {
  const body = b || {};
  const c = contact(body, 'One of phone or email required');
  if (!M.isStr(body.password, 1, 72)) fail(400, 'VALIDATION_ERROR', 'password required');
  return { ...c, password: body.password };
}
function parseRefresh(body, cookies) {
  const token = (body && body.refreshToken) || (cookies && cookies.refreshToken);
  if (!token) fail(400, 'VALIDATION_ERROR', 'refreshToken required');
  return { token };
}
function parseReset(b) {
  const body = b || {};
  if (!M.isStr(body.newPassword, 8, 72)) {
    fail(400, 'VALIDATION_ERROR', 'newPassword (8-72) required');
  }
  return { firebaseIdToken: idToken(body, 'firebaseIdToken'), newPassword: body.newPassword };
}
// Public user shape (never leaks password_hash).
function presentUser(u) {
  return {
    id: u.id, name: u.name, username: u.username || null, avatarUrl: u.avatar_url || null,
    role: u.role || 'user', phone: u.phone || null, email: u.email || null
  };
}

module.exports = {
  parseRegister, parseFirebaseVerify,
  parseLogin, parseRefresh, parseReset, presentUser
};
