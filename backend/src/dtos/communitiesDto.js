'use strict';
// Communities DTOs: request parsing/validation for §11-11d.
const { fail } = require('../helpers/domainError');
const M = require('../models/communitiesModel');

const vfail = (m) => fail(400, 'VALIDATION_ERROR', m);

function parseCreate(b) {
  const body = b || {};
  if (!body.name || body.name.length > 100) vfail('name 1-100 required');
  if (body.interests && (!Array.isArray(body.interests) || body.interests.length > 5)) vfail('interests<=5');
  if (body.discoveryRadiusKm !== undefined && (body.discoveryRadiusKm < 5 || body.discoveryRadiusKm > 100)) {
    vfail('radius 5-100');
  }
  return body;
}
function parsePatch(body) {
  const f = Object.keys(M.EDITABLE).filter((c) => body && body[c] !== undefined);
  if (!f.length) vfail('No fields');
  return f;
}
function parseSettings(key, body) {
  const cols = M.SETTINGS[key];
  const f = cols.filter((c) => body && body[c] !== undefined);
  if (!f.length) vfail('No fields');
  return f;
}
function parseTeamMember(body) {
  const { userId, role } = body || {};
  if (!userId || !M.TEAM_ROLES.includes(role)) vfail('userId+role required');
  return { userId, role };
}
function parseReportAction(action) {
  if (!M.REPORT_ACTIONS.includes(action)) vfail('bad action');
  return action;
}
function parseTransfer(newOwnerId) {
  if (!newOwnerId) vfail('newOwnerId required');
  return newOwnerId;
}
function parseExportType(type) {
  if (!M.EXPORT_TYPES.includes(type)) vfail('bad type');
  return type;
}
function parseGroupCreate(body) {
  const { name, description } = body || {};
  if (!name || name.length > 100) vfail('name 1-100 required');
  if (description && description.length > 500) vfail('description<=500');
  return { name, description: description || null };
}
function parseConfirmDelete(confirm) {
  if (confirm !== 'true') vfail('?confirm=true required');
}
function requireBlockTarget(body) {
  if (!body || !body.userId) vfail('userId required');
  return body.userId;
}

module.exports = {
  parseCreate, parsePatch, parseSettings, parseTeamMember, parseReportAction,
  parseTransfer, parseExportType, parseGroupCreate, parseConfirmDelete, requireBlockTarget
};
