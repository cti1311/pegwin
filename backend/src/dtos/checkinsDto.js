'use strict';
// Check-ins DTOs: request parsing/validation for §10-10a.
const { fail } = require('../helpers/domainError');
const M = require('../models/checkinsModel');

function parseValidationSince(since) {
  if (since && Number.isNaN(Date.parse(since))) {
    fail(400, 'VALIDATION_ERROR', 'since must be ISO-8601 datetime');
  }
  return since || null;
}
function parseSync(scans) {
  if (!Array.isArray(scans) || !scans.length || scans.length > M.MAX_BATCH) {
    fail(400, 'VALIDATION_ERROR', 'scans array (1-500) required');
  }
  return scans;
}

module.exports = { parseValidationSince, parseSync };
