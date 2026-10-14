'use strict';
// Admin service: event/host moderation, reports, audit logs.
// Throws domain errors { status, code, message } (mapped by errorHandler);
// returns { status, body } on success. No HTTP here.
const { pg } = require('../models/adminModel');
const { fail } = require('../helpers/domainError');
const Dto = require('../dtos/adminDto');

module.exports = (repo, ctx) => {
  const uid = ctx.uid;

  async function moderate(table, idCol, id, action, toStatus, body, needReason, actorId) {
    const { reason, note } = Dto.parseModerationReason(body, needReason);
    if (!(await repo.hostExistsById(idCol, table, id))) fail(404, 'NOT_FOUND', `${table} record not found.`);
    await repo.setStatus(table, idCol, toStatus, id);
    await repo.audit(actorId, action, table, id, uid);
    return { status: 200, body: { id, status: toStatus, note: note || reason || undefined } };
  }

  return {
    async reviewQueue(query) {
      const { page, limit, offset } = pg(query);
      const { total, rows } = await repo.reviewQueue(limit, offset);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    eventDecision(eventId, action, toStatus, body, actorId, needReason) {
      return moderate('events', 'id', eventId, action, toStatus, body, needReason, actorId);
    },
    async flaggedHosts(query) {
      const { page, limit, offset } = pg(query);
      const rows = await repo.flaggedHosts(limit, offset);
      return { status: 200, body: { data: rows, page, limit, total: rows.length } };
    },
    async setHostVerification(hostId, body, actorId) {
      const { identity, payoutAccount } = Dto.parseHostVerification(body);
      if (!(await repo.findHost(hostId))) fail(404, 'NOT_FOUND', 'Host not found.');
      await repo.setHostVerification(hostId, identity, payoutAccount);
      await repo.audit(actorId, 'host.verification', 'hosts', hostId, uid);
      return { status: 200, body: { id: hostId, identity, payoutAccount } };
    },
    hostDecision(hostId, action, toStatus, body, actorId) {
      return moderate('hosts', 'id', hostId, action, toStatus, body, true, actorId);
    },
    async reportQueue(query) {
      const q = query || {};
      const { page, limit, offset } = pg(q);
      const { total, rows } = await repo.reportQueue(q.status, limit, offset);
      return { status: 200, body: { data: rows, page, limit, total } };
    },
    async resolveReport(reportId, body, actorId) {
      const { status, actionNote } = Dto.parseReportResolve(body);
      const affected = await repo.resolveReport(reportId, status, actionNote || null);
      if (!affected) fail(404, 'NOT_FOUND', 'Report not found.');
      await repo.audit(actorId, 'report.resolve', 'reports', reportId, uid);
      return { status: 200, body: { id: reportId, status } };
    },
    async auditLogs(query) {
      const { page, limit, offset } = pg(query);
      const { total, rows } = await repo.auditLogs(query || {}, limit, offset);
      return { status: 200, body: { data: rows, page, limit, total } };
    }
  };
};
