'use strict';
// Orders domain model: ticket codes, attendee validation, row mapping.
// Pure functions only; no database access (see repository.js/service.js).
function ticketCode(uid) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const raw = String(uid());
  let out = '';
  for (let i = 0; i < raw.length && out.length < 12; i++) {
    const c = raw[i].toUpperCase();
    if (alphabet.indexOf(c) !== -1) out += c;
  }
  while (out.length < 12) out += alphabet[Math.floor(Math.random() * 36)];
  return out;
}
function qrPayload(orderId, tierId) {
  return 'PEGWIN:' + orderId + ':' + tierId;
}
function validAttendee(a) {
  return a && a.name && a.name.length >= 1 && a.name.length <= 100;
}
function toOrder(o, items) {
  return {
    id: o.id, eventId: o.event_id, status: o.status,
    items: items.map((i) => ({ tierId: i.tier_id, tierName: i.tier_name, qty: i.qty, unitPrice: i.unit_price })),
    amounts: {
      hostPrice: o.host_price, platformFee: o.platform_fee, displayPrice: o.display_price,
      discount: o.discount, taxableAmount: o.taxable_amount, gst: o.gst, finalPayable: o.final_payable
    },
    payment: { paymentId: o.payment_id, status: o.payment_status },
    createdAt: o.created_at
  };
}
function toTicket(t, tierName, verified) {
  return {
    ticketCode: t.ticket_code, qrPayload: t.qr_payload,
    attendee: { name: t.attendee_name, phone: t.attendee_phone, email: t.attendee_email },
    tierName, verified, status: t.status
  };
}
function receiptUrl(orderId) {
  return 'https://api.pegwin.in/api/v1/orders/' + orderId + '/receipt.pdf';
}

module.exports = { ticketCode, qrPayload, validAttendee, toOrder, toTicket, receiptUrl };
