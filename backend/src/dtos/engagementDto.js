'use strict';
// Engagement DTOs: request parsing/validation + response shaping for §12-12c.
const { fail } = require('../helpers/domainError');
const M = require('../models/engagementModel');

function parseDevice(body) {
  const { platform, pushToken } = body || {};
  if (!['ios', 'android'].includes(platform) || !pushToken || pushToken.length > 500) {
    fail(400, 'VALIDATION_ERROR', 'platform must be ios|android and pushToken (1-500 chars) is required.');
  }
  return { platform, pushToken };
}
function parsePrefs(body) {
  const sets = [];
  const vals = [];
  M.PREF_KEYS.forEach((k) => {
    if (body && typeof body[k] === 'boolean') { sets.push(`${M.PREF_COLS[k]} = ?`); vals.push(body[k] ? 1 : 0); }
  });
  if (!sets.length) fail(400, 'VALIDATION_ERROR', 'Provide at least one boolean preference toggle.');
  return { sets, vals };
}
function parseSavedWhen(when) {
  const w = when || 'all';
  if (!M.SAVED_WHEN.includes(w)) fail(400, 'VALIDATION_ERROR', 'when must be all|upcoming|this_week|this_month.');
  let extra = '';
  if (w !== 'all') extra = ' AND e.starts_at >= UTC_TIMESTAMP()';
  if (w === 'this_week') extra += ' AND e.starts_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)';
  if (w === 'this_month') extra += ' AND e.starts_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY)';
  return extra;
}
function parseAnalyticsScope(query) {
  const { scope, scopeId, range = '30_days' } = query || {};
  if (!M.ANALYTICS_SCOPES.includes(scope) || !scopeId) {
    fail(400, 'VALIDATION_ERROR', 'scope (community|event) and scopeId are required.');
  }
  if (!M.ANALYTICS_RANGES.includes(range)) {
    fail(400, 'VALIDATION_ERROR', 'range must be 7_days|30_days|3_months|12_months.');
  }
  return { scope, scopeId, range };
}
function requireId(value, name) {
  if (!value) fail(400, 'VALIDATION_ERROR', `${name} is required.`);
  return value;
}

module.exports = {
  parseDevice, parsePrefs, parseSavedWhen, parseAnalyticsScope, requireId,
  presentNotification: M.nto,
  presentPrefs: M.toPrefs,
  emptyOverview: M.emptyOverview
};
