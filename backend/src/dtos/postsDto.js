'use strict';
// Posts DTOs: request parsing/validation for posts, likes, comments.
const { fail } = require('../helpers/domainError');
const M = require('../models/postsModel');

const vfail = (m) => fail(400, 'VALIDATION_ERROR', m);

function parsePost(body, user) {
  const b = body || {};
  if (!b.text || b.text.length > 5000) vfail('text 1-5000 required');
  if (b.type === 'announcement' && !M.isTeam(user)) fail(403, 'FORBIDDEN', 'Announcements host-only');
  if (b.mediaUrls && b.mediaUrls.length && !M.isTeam(user)) {
    fail(403, 'MEDIA_NOT_ALLOWED_FOR_MEMBERS', 'Members text only');
  }
  if (b.mediaUrls && b.mediaUrls.length > M.MAX_MEDIA_URLS) vfail('mediaUrls<=4');
  return b;
}
function parseComment(body) {
  if (!body || !body.text || body.text.length > 1000) vfail('text 1-1000 required');
  return body.text;
}
function parseBlockCommunity(body) {
  if (!body || !body.communityId) vfail('communityId required');
  return body.communityId;
}

module.exports = { parsePost, parseComment, parseBlockCommunity };
