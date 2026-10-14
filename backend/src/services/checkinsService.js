'use strict';
// Check-ins service: offline bundle, atomic single scan, batch sync.
// Throws domain errors { status, code, message } (mapped by errorHandler);
// returns { status, body } on success. No HTTP here.
const { TICKET_RE, validScannedAt, nowIso } = require('../models/checkinsModel');
const D = require('../dtos/checkinsDto');

function fail(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}

module.exports = (repo) => {
  async function singleScan(ticketCode, scannedAt) {
    if (!TICKET_RE.test(ticketCode || '')) {
      return { err: [422, 'TICKET_INVALID_OR_EXPIRED', 'Unknown or expired ticket'] };
    }
    if (!validScannedAt(scannedAt)) {
      return { err: [400, 'VALIDATION_ERROR', 'scannedAt ISO-8601 required'] };
    }
    const row = await repo.findCheckin(ticketCode);
    if (!row) return { err: [422, 'TICKET_INVALID_OR_EXPIRED', 'Unknown or expired ticket'] };
    if (row.checked_in_at) return { err: [409, 'ALREADY_CHECKED_IN', 'Ticket already checked in'] };
    const checkedInAt = nowIso();
    const affected = await repo.claimCheckin(ticketCode, checkedInAt, scannedAt);
    if (!affected) return { err: [409, 'ALREADY_CHECKED_IN', 'Ticket already checked in'] };
    return { checkedInAt };
  }

  return {
    async validationData(eventId, rawSince) {
      const since = D.parseValidationSince(rawSince);
      const tickets = await repo.validationRows(eventId, since);
      return {
        status: 200,
        body: { eventId, generatedAt: nowIso(), tickets, eventWindow: null }
      };
    },
    async scan(ticketCode, scannedAt) {
      const out = await singleScan(ticketCode, scannedAt);
      if (out.err) fail(out.err[0], out.err[1], out.err[2]);
      return { status: 200, body: { status: 'checked_in', checkedInAt: out.checkedInAt } };
    },
    async sync(rawScans) {
      const scans = D.parseSync(rawScans);
      const seen = new Set();
      const results = [];
      for (const s of scans) {
        const code = s && s.ticketCode;
        if (seen.has(code)) { results.push({ ticketCode: code, result: 'duplicate' }); continue; }
        seen.add(code);
        const out = await singleScan(code, s.scannedAt);
        if (!out.err) results.push({ ticketCode: code, result: 'checked_in', checkedInAt: out.checkedInAt });
        else if (out.err[1] === 'ALREADY_CHECKED_IN') results.push({ ticketCode: code, result: 'duplicate' });
        else results.push({ ticketCode: code, result: 'invalid' });
      }
      return { status: 200, body: { results } };
    },
    async monitor(eventId, q) {
      const query = q || {};
      const page = Math.max(1, parseInt(query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
      const rows = await repo.monitorRows(eventId, limit, (page - 1) * limit);
      return { status: 200, body: { data: rows, page, limit } };
    },
    singleScan
  };
};
