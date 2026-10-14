'use strict';
// Users service: profile flows over the users repository.
// Request parsing/shaping lives in dtos/usersDto.js.
// Throws domain errors; returns { status, body }. No HTTP here.
const D = require('../dtos/usersDto');
const { fail } = require('../helpers/domainError');

module.exports = (repo) => {
  async function requireMe(userId) {
    const found = await repo.findById(userId);
    if (!found[0]) fail(403, 'ACCOUNT_DELETED_OR_SUSPENDED', 'Account deleted or suspended');
    return found[0];
  }

  return {
    async getMe(userId) {
      const u = await requireMe(userId);
      return { status: 200, user: u };
    },
    async updateMe(userId, b) {
      const u = await requireMe(userId);
      const { patch, cols, wantsContactChange } = D.parseUpdate(b);
      if (wantsContactChange) {
        return { status: 202, body: { verificationRequired: true } };
      }
      if (Object.keys(cols).length) await repo.updateFields(userId, cols);
      const updated = await repo.findById(userId);
      return { status: 200, merged: { ...u, ...(updated[0] || {}), ...patch } };
    },
    async usernameAvailable(username) {
      const name = D.parseUsername(username);
      const found = await repo.findIdByUsername(name);
      return { status: 200, body: { available: found.length === 0 } };
    },
    eventsHistory(filter) {
      D.parseEventFilter(filter);
      return { status: 200, filter };
    },
    ticketsList(status) {
      D.parseTicketStatus(status);
      return { status: 200 };
    },
    async updateVisibility(userId, patch) {
      const u = await requireMe(userId);
      let cur = { profileVisible: true };
      try { cur = u.visibility ? (typeof u.visibility === 'string' ? JSON.parse(u.visibility) : u.visibility) : cur; } catch (_) {}
      const next = { ...cur, ...(patch || {}) };
      await repo.updateVisibility(userId, JSON.stringify(next));
      return { status: 200, body: next };
    },
    async deleteMe(userId, confirm) {
      D.parseDeleteConfirm(confirm);
      await requireMe(userId);
      await repo.anonymize(userId);
      return { status: 202, body: { status: 'scheduled' } };
    },
    async publicProfile(userId) {
      const found = await repo.findPublicById(userId);
      if (!found[0]) fail(404, 'NOT_FOUND', 'User not found');
      return { status: 200, body: D.presentPublic(found[0]) };
    }
  };
};
