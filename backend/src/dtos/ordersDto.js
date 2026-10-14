'use strict';
// Orders DTOs: request parsing/validation and response shaping for §7-7a.
const { fail } = require('../helpers/domainError');
const M = require('../models/ordersModel');

function parseCreate(b) {
  const body = b || {};
  if (!body.holdId) fail(400, 'VALIDATION_ERROR', 'holdId required');
  if (!Array.isArray(body.attendees) || body.attendees.length < 1) {
    fail(400, 'VALIDATION_ERROR', 'attendees required');
  }
  return { holdId: body.holdId, attendees: body.attendees, couponCode: body.couponCode };
}
function parseAttendees(attendees, ticketCount) {
  if (attendees.length !== ticketCount) fail(400, 'VALIDATION_ERROR', 'one attendee per ticket required');
  for (const a of attendees) {
    if (!M.validAttendee(a)) fail(400, 'VALIDATION_ERROR', 'attendee name 1-100 required');
  }
  return attendees;
}

module.exports = {
  parseCreate,
  parseAttendees,
  presentOrder: M.toOrder,
  presentTicket: M.toTicket,
  ticketCode: M.ticketCode,
  qrPayload: M.qrPayload,
  receiptUrl: M.receiptUrl
};
