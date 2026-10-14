'use strict';
// Admin domain model: pure constants and paging. No DB here.
const REPORT_STATUSES = ['open', 'actioned', 'dismissed'];
const RESOLVE_STATUSES = ['actioned', 'dismissed'];
const VERIFY_STATES = ['unverified', 'pending', 'verified', 'rejected'];

function pg(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { REPORT_STATUSES, RESOLVE_STATUSES, VERIFY_STATES, pg };
