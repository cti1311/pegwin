'use strict';
// Auth service: registration, Firebase phone verification, password login,
// token rotation, password reset.
// Request parsing/shaping lives in dtos/authDto.js; SQL in repositories.
// Throws domain errors; returns { status, body }. No HTTP here.
const M = require('../models/authModel');
const D = require('../dtos/authDto');
const { fail } = require('../helpers/domainError');

module.exports = (repo, userRepo, ctx) => {
  const uid = ctx.uid;
  const firebase = ctx.firebase || require('../utils/firebase');

  async function issuePair(user) {
    const accessToken = M.signJwt({ sub: user.id, role: user.role || 'user' }, M.ACCESS_TTL());
    const refreshToken = M.newRefreshToken();
    await repo.saveRefreshToken({
      id: uid(), userId: user.id, token: refreshToken,
      expiresAt: M.isoPlus(M.REFRESH_TTL()), createdAt: M.nowIso()
    });
    return { accessToken, refreshToken };
  }
  // Verify a client-supplied Firebase ID token. Returns { phone, email }.
  async function verifiedContact(idToken) {
    let decoded;
    try {
      decoded = await firebase.verifyIdToken(idToken);
    } catch (err) {
      if (err && (err.code === 'FIREBASE_NOT_CONFIGURED' || err.code === 'FIREBASE_SDK_MISSING')) {
        fail(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Phone verification is unavailable; try again later');
      }
      fail(401, 'INVALID_FIREBASE_TOKEN', 'Phone verification failed; request a new code');
    }
    const phone = decoded.phone_number || null;
    const email = (decoded.email || null) && String(decoded.email).toLowerCase();
    if (!phone && !email) fail(422, 'VALIDATION_ERROR', 'Verified token carries no phone or email');
    return { phone, email };
  }

  return {
    async register(b) {
      const input = D.parseRegister(b);
      const contact = await verifiedContact(input.firebaseIdToken);
      if (input.phone && contact.phone && input.phone !== contact.phone) {
        fail(403, 'PHONE_MISMATCH', 'Verified phone does not match the registered phone');
      }
      const id = uid();
      await userRepo.insert({
        id, name: input.name, phone: input.phone || contact.phone, email: input.email || contact.email,
        passwordHash: M.hashPw(input.password),
        role: 'user', visibility: JSON.stringify({ profileVisible: true }), createdAt: M.nowIso()
      });
      const users = await userRepo.findById(id);
      const pair = await issuePair(users[0] || { id, role: 'user' });
      return { status: 201, body: { userId: id, ...pair, user: D.presentUser(users[0] || { id, name: input.name, role: 'user', phone: input.phone, email: input.email }) } };
    },
    async firebaseVerify(b) {
      const input = D.parseFirebaseVerify(b);
      const contact = await verifiedContact(input.idToken);
      const users = await userRepo.findByContact(contact.phone, contact.email);
      let user = users[0];
      if (!user) {
        const id = uid();
        await userRepo.insert({
          id, name: input.name || '', phone: contact.phone, email: contact.email,
          passwordHash: null,
          role: 'user', visibility: JSON.stringify({ profileVisible: true }), createdAt: M.nowIso()
        });
        const found = await userRepo.findById(id);
        user = found[0] || { id, role: 'user', phone: contact.phone, email: contact.email };
      }
      const pair = await issuePair(user);
      return { status: 200, body: { ...pair, user: D.presentUser(user) } };
    },
    async login(b) {
      const input = D.parseLogin(b);
      const users = await userRepo.findByContact(input.phone, input.email);
      const user = users[0];
      if (!user) fail(401, 'UNAUTHENTICATED', 'Invalid credentials');
      if (!M.checkPw(input.password, user.password_hash)) fail(401, 'UNAUTHENTICATED', 'Invalid credentials');
      const pair = await issuePair(user);
      return { status: 200, body: { ...pair, user: D.presentUser(user) } };
    },
    async refresh(body, cookies) {
      const { token } = D.parseRefresh(body, cookies);
      const found = await repo.findRefreshToken(token);
      const row = found[0];
      if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) {
        fail(401, 'UNAUTHENTICATED', 'Invalid refresh token');
      }
      await repo.revokeRefreshTokenById(row.id);
      const users = await userRepo.findById(row.user_id);
      const user = users[0] || { id: row.user_id, role: 'user' };
      const pair = await issuePair(user);
      return { status: 200, body: pair };
    },
    async logout(user, body, headers) {
      const token = (body && body.refreshToken) || (headers && headers['x-refresh-token']);
      if (token) await repo.revokeRefreshTokenByToken(token);
      else await repo.revokeRefreshTokensByUser(user.sub || user.id);
      return { status: 204 };
    },
    async resetPassword(b) {
      const input = D.parseReset(b);
      const contact = await verifiedContact(input.firebaseIdToken);
      await userRepo.updatePassword(contact.phone, contact.email, M.hashPw(input.newPassword));
      return { status: 200, body: { ok: true } };
    }
  };
};
