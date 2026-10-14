'use strict';
// Groups DTOs: request parsing/validation for §11e-11l.
const { fail } = require('../helpers/domainError');
const M = require('../models/groupsModel');

const vfail = (m) => fail(400, 'VALIDATION_ERROR', m);

function parseGroupPatch(body) {
  const f = ['name', 'description'].filter((c) => body && body[c] !== undefined);
  if (!f.length) vfail('No fields');
  const fields = {};
  f.forEach((c) => { fields[c] = body[c]; });
  return fields;
}
function parseMessage(body, user) {
  const b = body || {};
  if (!b.type || !b.text || b.text.length > 2000) vfail('type+text 1-2000 required');
  if (b.type !== 'text' && !M.isTeam(user)) fail(403, 'MEDIA_NOT_ALLOWED_FOR_MEMBERS', 'Members text only');
  return b;
}
function parseReport(body) {
  const b = body || {};
  if (!M.REPORT_TARGETS.includes(b.targetType) || !b.targetId || !b.reason || b.reason.length > 500) {
    vfail('targetType|targetId|reason required');
  }
  return b;
}
function parseUploadSlot(body, user) {
  const b = body || {};
  if (!M.MIME.includes(b.contentType) || !(b.byteSize >= 1 && b.byteSize <= M.MAX_MEDIA_BYTES)) {
    vfail('type+size invalid');
  }
  if (!M.PURPOSES.includes(b.purpose)) vfail('bad purpose');
  if (b.purpose !== 'avatar' && !M.isTeam(user)) fail(403, 'MEDIA_NOT_ALLOWED_FOR_MEMBERS', 'Members text only');
  return b;
}

module.exports = { parseGroupPatch, parseMessage, parseReport, parseUploadSlot };
