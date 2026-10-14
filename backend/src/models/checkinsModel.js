'use strict';
// Check-ins domain model: ticket format, single-scan outcome mapping.
// Pure functions only; no database access (see repository.js/service.js).
const TICKET_RE = /^[A-Z0-9]{12}$/;
const MAX_BATCH = 500;

function validScannedAt(scannedAt) {
  return scannedAt && !Number.isNaN(Date.parse(scannedAt));
}
const nowIso = () => new Date().toISOString();
function pageLimit(q) {
  return {
    page: Math.max(1, parseInt(q.page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20))
  };
}

module.exports = { TICKET_RE, MAX_BATCH, validScannedAt, nowIso, pageLimit };
