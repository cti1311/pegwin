'use strict';
// Admin DTOs: request parsing/validation for §13-13c.
const { fail } = require('../helpers/domainError');
const M = require('../models/adminModel');

function parseHostVerification(body) {
  const { identity, payoutAccount, note } = body || {};
  if (!M.VERIFY_STATES.includes(identity) || !M.VERIFY_STATES.includes(payoutAccount)) {
    fail(400, 'VALIDATION_ERROR', 'identity and payoutAccount must each be unverified|pending|verified|rejected.');
  }
  if (note && note.length > 500) fail(400, 'VALIDATION_ERROR', 'note max 500 chars.');
  return { identity, payoutAccount, note };
}
function parseModerationReason(body, required) {
  const { reason, note } = body || {};
  if (required && (!reason || reason.length > 500)) {
    fail(400, 'VALIDATION_ERROR', 'reason (1-500 chars) is required.');
  }
  return { reason, note };
}
function parseReportResolve(body) {
  const { status, actionNote } = body || {};
  if (!M.RESOLVE_STATUSES.includes(status)) {
    fail(400, 'VALIDATION_ERROR', 'status must be actioned|dismissed.');
  }
  if (actionNote && actionNote.length > 500) fail(400, 'VALIDATION_ERROR', 'actionNote max 500 chars.');
  return { status, actionNote: actionNote || null };
}

module.exports = { parseHostVerification, parseModerationReason, parseReportResolve };
