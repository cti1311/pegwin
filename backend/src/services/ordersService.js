'use strict';
// Orders service: checkout from hold, detail, tickets, cancel, receipt.
// Request parsing/shaping lives in dtos/ordersDto.js.
// Throws domain errors; returns { status, body }. No HTTP here.
const D = require('../dtos/ordersDto');
const { fail } = require('../helpers/domainError');

module.exports = (repo, ctx) => {
  const uid = ctx.uid;
  const notify = ctx.notify || null;
  const inr = (paise) => '₹' + (Number(paise || 0) / 100).toFixed(2);

  async function quoteFor(holdId, couponCode) {
    const hold = await repo.findHold(holdId);
    const items = await repo.holdItems(holdId);
    let coupon = null;
    if (couponCode) coupon = await repo.findCoupon(couponCode);
    let hostPrice = 0, fee = 0;
    for (const r of items) { hostPrice += r.price * r.qty; fee += Math.round(r.price * r.qty * 0.10); }
    const display = hostPrice + fee;
    let discount = 0, bearer = 'pegwin';
    if (coupon) {
      bearer = coupon.discount_bearer || 'pegwin';
      discount = coupon.discount_type === 'flat'
        ? Math.min(coupon.value, display)
        : Math.min(Math.round((display * coupon.value) / 100), display);
    }
    const taxable = display - discount;
    const gst = Math.round(taxable * 0.18);
    return {
      hold, items,
      amounts: { hostPrice, platformFee: fee, displayPrice: display, discount, discountBearer: bearer, taxableAmount: taxable, gst, finalPayable: taxable + gst },
      coupon
    };
  }
  async function loadOrder(orderId) {
    const o = await repo.findOrder(orderId);
    if (!o) return null;
    return D.presentOrder(o, await repo.orderItems(orderId));
  }

  return {
    async create(body, key, userId) {
      const input = D.parseCreate(body);
      if (key && userId) {
        const dup = await repo.findIdempotentOrder(key, userId);
        if (dup) {
          return {
            status: 200,
            body: { orderId: dup.id, status: dup.status, payment: { paymentId: dup.payment_id, status: dup.payment_status } }
          };
        }
      }
      const q = await quoteFor(input.holdId, input.couponCode);
      if (!q.hold) fail(404, 'NOT_FOUND', 'hold not found');
      if (q.hold.status !== 'active' || new Date(q.hold.expires_at) <= new Date()) {
        fail(410, 'HOLD_EXPIRED', 'hold expired or already used');
      }
      if (input.couponCode && !q.coupon) fail(422, 'COUPON_INVALID', 'coupon invalid');
      const ticketCount = q.items.reduce((s, r) => s + r.qty, 0);
      const attendees = D.parseAttendees(input.attendees, ticketCount);
      const orderId = uid();
      const paymentId = uid();
      const a = q.amounts;
      await repo.insertOrder({
        id: orderId, userId, eventId: q.hold.event_id, holdId: input.holdId, couponId: q.coupon ? q.coupon.id : null,
        status: 'pending', hostPrice: a.hostPrice, platformFee: a.platformFee, displayPrice: a.displayPrice,
        discount: a.discount, taxableAmount: a.taxableAmount, gst: a.gst, finalPayable: a.finalPayable,
        paymentId, paymentStatus: a.finalPayable === 0 ? 'confirmed' : 'pending', idempotencyKey: key || null
      });
      let ai = 0;
      for (const r of q.items) {
        await repo.insertOrderItem({ id: uid(), orderId, tierId: r.tier_id, tierName: r.tier_name, qty: r.qty, unitPrice: r.price });
        for (let k = 0; k < r.qty; k++) {
          const att = attendees[ai++];
          await repo.insertTicket({
            code: D.ticketCode(uid), orderId, tierId: r.tier_id, eventId: q.hold.event_id,
            name: att.name, phone: att.phone || null, email: att.email || null,
            qr: D.qrPayload(orderId, r.tier_id)
          });
        }
        await repo.incrementTierSold(r.tier_id, r.qty);
      }
      if (q.coupon) await repo.bumpCouponUse(q.coupon.id);
      await repo.consumeHold(input.holdId);
      if (notify && userId) {
        const emails = [...new Set(attendees.map((x) => x.email).filter(Boolean))];
        await notify.dispatch({
          recipients: [{ userId }, ...emails.map((email) => ({ email }))],
          type: 'ticket_purchase',
          title: 'Booking confirmed',
          body: `${ticketCount} ticket(s) confirmed for order ${orderId} (${inr(a.finalPayable)}).`,
          refType: 'order', refId: orderId,
          email: {
            subject: 'Your Pegwin booking is confirmed',
            text: `Order ${orderId}: ${ticketCount} ticket(s) confirmed for ${inr(a.finalPayable)}. Find your tickets and QR codes in the app under My Tickets.`
          }
        });
      }
      return {
        status: 201,
        body: { orderId, status: 'pending', payment: { paymentId, status: a.finalPayable === 0 ? 'confirmed' : 'pending' } }
      };
    },
    async detail(orderId) {
      const o = await loadOrder(orderId);
      if (!o) fail(404, 'NOT_FOUND', 'order not found');
      return { status: 200, body: o };
    },
    async tickets(orderId) {
      const o = await loadOrder(orderId);
      if (!o) fail(404, 'NOT_FOUND', 'order not found');
      const rows = await repo.orderTickets(orderId);
      return {
        status: 200,
        body: {
          data: rows.map((t) => D.presentTicket(t, t.tier_name, o.payment.status === 'confirmed'))
        }
      };
    },
    async cancel(orderId) {
      const o = await repo.findOrder(orderId);
      if (!o) fail(404, 'NOT_FOUND', 'order not found');
      if (o.status === 'cancelled' || o.status === 'refunded') {
        fail(409, 'EVENT_NOT_EDITABLE', 'order already cancelled');
      }
      const refundAmount = o.final_payable;
      const refundId = uid();
      await repo.cancelOrder(o.id);
      await repo.cancelOrderTickets(o.id);
      const items = await repo.orderItems(o.id);
      for (const i of items) await repo.decrementTierSold(i.tier_id, i.qty);
      if (notify && o.user_id) {
        const tickets = await repo.orderTickets(o.id);
        const emails = [...new Set(tickets.map((t) => t.attendee_email).filter(Boolean))];
        await notify.dispatch({
          recipients: [{ userId: o.user_id }, ...emails.map((email) => ({ email }))],
          type: 'ticket_cancel',
          title: 'Booking cancelled',
          body: `Order ${o.id} is cancelled. Refund of ${inr(refundAmount)} initiated to the original payment method.`,
          refType: 'order', refId: o.id,
          email: {
            subject: 'Your Pegwin booking is cancelled',
            text: `Order ${o.id} is cancelled. A refund of ${inr(refundAmount)} (ref ${refundId}) is initiated to your original payment method.`
          }
        });
      }
      return { status: 200, body: { status: 'cancelled', refundAmount, refundId } };
    },
    async receipt(orderId) {
      const o = await repo.findOrder(orderId);
      if (!o) fail(404, 'NOT_FOUND', 'order not found');
      return {
        status: 200,
        body: { receiptUrl: D.receiptUrl(o.id), transactionId: o.payment_id, amount: o.final_payable, paymentMethod: 'upi' }
      };
    },
    async ticketByCode(ticketCodeValue) {
      const t = await repo.findTicketByCode(ticketCodeValue);
      if (!t) fail(404, 'NOT_FOUND', 'ticket not found');
      const out = D.presentTicket(t, t.tier_name, t.status !== 'pending');
      if (t.status === 'checked_in' && t.checked_in_at) out.checkedInAt = t.checked_in_at;
      return { status: 200, body: out };
    }
  };
};
