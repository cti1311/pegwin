'use strict';
// Ticketing service: tiers, server-side quotes, 10-min holds, coupons.
// Request parsing/shaping lives in dtos/ticketingDto.js (math stays in
// models/ticketingModel.js). Throws domain errors; returns { status, body }.
const M = require('../models/ticketingModel');
const D = require('../dtos/ticketingDto');
const { fail } = require('../helpers/domainError');

module.exports = (repo, ctx) => {
  const uid = ctx.uid;

  async function loadTiers(items) {
    const clean = D.parseItems(items);
    if (!clean) return null;
    const out = [];
    for (const it of clean) {
      const row = await repo.findTier(it.tierId);
      if (!row) return null;
      out.push({ tierId: row.id, qty: it.qty, unitPrice: row.price, capacity: row.capacity, sold: row.sold_count });
    }
    return out;
  }
  async function findCoupon(code, tierId) {
    if (!code) return null;
    const c = await repo.findCouponByCode(code);
    if (!c) return null;
    const now = new Date();
    if ((c.valid_from && new Date(c.valid_from) > now) || (c.valid_to && new Date(c.valid_to) < now)) return null;
    if (c.max_uses != null && c.used_count >= c.max_uses) return null;
    if (c.tier_id && c.tier_id !== tierId) return null;
    return { discountType: c.discount_type, value: c.value, discountBearer: c.discount_bearer, id: c.id };
  }

  return {
    async createTier(eventId, b) {
      const input = D.parseTierFields(b, true);
      const id = uid();
      await repo.insertTier({ id, eventId, name: input.name, price: input.price, capacity: input.capacity });
      return {
        status: 201,
        body: { id, eventId, name: input.name, price: input.price, capacity: input.capacity, soldCount: 0, availableCount: input.capacity, createdAt: new Date().toISOString() }
      };
    },
    async listTiers(eventId, page, limit, offset) {
      const rows = await repo.listTiers(eventId, limit, offset);
      const n = await repo.countTiers(eventId);
      return { status: 200, body: { data: rows.map(D.presentTier), page, limit, total: n[0] ? n[0].total : rows.length } };
    },
    async patchTier(tierId, b) {
      const tier = await repo.findTier(tierId);
      if (!tier) fail(404, 'NOT_FOUND', 'tier not found');
      const input = D.parseTierFields(b, false);
      const next = {
        name: input.name !== undefined ? input.name : tier.name,
        price: input.price !== undefined ? input.price : tier.price,
        capacity: input.capacity !== undefined ? input.capacity : tier.capacity
      };
      if (next.name.length > 80 || !Number.isInteger(next.price) || next.price < 0 ||
          !Number.isInteger(next.capacity) || next.capacity < 1 || next.capacity > 1000000) {
        fail(400, 'VALIDATION_ERROR', 'bad name/price/capacity');
      }
      if (next.capacity < tier.sold_count) fail(409, 'TIER_CAPACITY_CONFLICT', 'capacity below sold count');
      await repo.updateTier(tier.id, next.name, next.price, next.capacity);
      return { status: 200, body: { id: tier.id, ...next } };
    },
    async deleteTier(tierId) {
      const tier = await repo.findTier(tierId);
      if (!tier) fail(404, 'NOT_FOUND', 'tier not found');
      if (tier.sold_count > 0) fail(409, 'TIER_HAS_SALES', 'tier has completed sales');
      await repo.deleteTier(tierId);
      return { status: 204 };
    },
    async quote(items, couponCode) {
      const lines = await loadTiers(items);
      if (!lines) fail(400, 'VALIDATION_ERROR', 'items: 1-10 lines, qty 1..10, valid tierId');
      const coupon = await findCoupon(couponCode, lines.length === 1 ? lines[0].tierId : null);
      if (couponCode && !coupon) fail(422, 'COUPON_INVALID', 'coupon invalid');
      return { status: 200, body: M.totals(M.priceLines(lines), coupon) };
    },
    async createHold(items, userId) {
      const lines = await loadTiers(items);
      if (!lines) fail(400, 'VALIDATION_ERROR', 'items: 1-10 lines, qty 1..10, valid tierId');
      for (const l of lines) {
        const held = await repo.heldQty(l.tierId);
        if (l.sold + held + l.qty > l.capacity) {
          fail(409, 'INSUFFICIENT_INVENTORY', 'insufficient inventory for tier ' + l.tierId);
        }
      }
      const holdId = uid(), expiresAt = M.holdExpiresAt();
      await repo.insertHold({ holdId, eventId: lines[0].tierId, userId: userId || null, expiresAt });
      for (const l of lines) {
        await repo.insertHoldItem({ id: uid(), holdId, tierId: l.tierId, qty: l.qty, unitPrice: l.unitPrice });
      }
      return { status: 201, body: { holdId, expiresAt } };
    },
    async getHold(holdId) {
      const hold = await repo.findHold(holdId);
      if (!hold) fail(404, 'NOT_FOUND', 'hold not found');
      const ttl = M.holdTtlSec(hold.expires_at);
      return {
        status: 200,
        body: { holdId: hold.id, status: ttl === 0 ? 'expired' : hold.status, expiresAt: hold.expires_at, remainingSec: ttl }
      };
    },
    async releaseHold(holdId) {
      const hold = await repo.findHold(holdId);
      if (!hold) fail(404, 'NOT_FOUND', 'hold not found');
      await repo.releaseHold(holdId);
      return { status: 204 };
    },
    async validateCoupon(code, tierId, qty) {
      const input = D.parseCouponValidate({ code, tierId, qty });
      const tier = await repo.findTier(input.tierId);
      if (!tier) fail(422, 'COUPON_INVALID', 'unknown tier');
      const coupon = await findCoupon(input.code, input.tierId);
      if (!coupon) fail(422, 'COUPON_INVALID', 'coupon invalid for this tier');
      const q = M.priceLines([{ tierId: input.tierId, qty: input.qty, unitPrice: tier.price }]);
      return { status: 200, body: { valid: true, discount: M.applyCoupon(q.displayPrice, coupon).discount } };
    },
    async createCoupon(b) {
      const input = D.parseCouponCreate(b);
      const id = uid();
      await repo.insertCoupon({ id, ...input });
      return { status: 201, body: { id, code: input.code } };
    },
    async listCoupons(page, limit, offset) {
      const rows = await repo.listCoupons(limit, offset);
      return { status: 200, body: { data: rows, page, limit, total: rows.length } };
    },
    async patchCoupon(couponId, b) {
      const c = await repo.findCouponById(couponId);
      if (!c) fail(404, 'NOT_FOUND', 'coupon not found');
      await repo.updateCoupon(couponId, [
        b.discountType || c.discount_type,
        b.value != null ? b.value : c.value,
        b.maxUses !== undefined ? b.maxUses : c.max_uses,
        b.validFrom !== undefined ? b.validFrom : c.valid_from,
        b.validTo !== undefined ? b.validTo : c.valid_to,
        b.discountBearer || c.discount_bearer,
        b.enabled !== undefined ? (b.enabled ? 1 : 0) : c.enabled
      ]);
      return { status: 200, body: { id: couponId } };
    },
    loadTiers,
    findCoupon
  };
};
