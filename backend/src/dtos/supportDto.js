'use strict';
// Support DTOs: request parsing/validation for §13a + meta.
const { fail } = require('../helpers/domainError');

function parseTopic(topic) {
  if (!topic || topic.length > 100) fail(400, 'VALIDATION_ERROR', 'topic (1-100 chars) is required.');
  return topic;
}
function parseThreadText(text) {
  if (!text || text.length > 2000) fail(400, 'VALIDATION_ERROR', 'text (1-2000 chars) is required.');
  return text;
}

module.exports = { parseTopic, parseThreadText };
