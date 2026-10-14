'use strict';
// Ticketing DTOs: request parsing/validation and response shaping for §6-6a.
const { fail } = require('../helpers/domainError');

function parseTierFields(b, forCreate) {
  const body = b || {};
  const name = body.name, price = body.price, capacity = body.capacity;
  if (forCreate) {
    if (!name || name.length > 80) fail(400, 'VALIDATION_ERROR', 'name 1-80 required');
    if (!Number.isInteger(price) || price < 0) fail(400, 'VALIDATION_ERROR', 'price int paise >= 0');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000000) {
      fail(400, 'VALIDATION_ERROR', 'capacity 1..1000000');
    }
  }
  return { name, price, capacity };
}
function parseItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 10) return null;
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 10) return null;
  }
  return items;
}
function parseCouponCreate(b) {
  const body = b || {};
  if (!body.code || !/^[A-Z0-9_-]{1,50}$/.test(String(body.code).toUpperCase())) {
    fail(400, 'VALIDATION_ERROR', 'code [A-Z0-9_-]{1,50}');
  }
  if (body.discountType !== 'flat' && body.discountType !== 'pct') {
    fail(400, 'VALIDATION_ERROR', 'discountType flat|pct');
  }
  if (!Number.isInteger(body.value) || body.value < 1 || (body.discountType === 'pct' && body.value > 100)) {
    fail(400, 'VALIDATION_ERROR', 'value paise if flat, 1..100 if pct');
  }
  if (['host', 'pegwin', 'split'].indexOf(body.discountBearer) === -1) {
    fail(400, 'VALIDATION_ERROR', 'discountBearer host|pegwin|split');
  }
  return {
    code: String(body.code).toUpperCase(), discountType: body.discountType, value: body.value,
    eventId: body.eventId || null, tierId: body.tierId || null, maxUses: body.maxUses || null,
    validFrom: body.validFrom || null, validTo: body.validTo || null,
    discountBearer: body.discountBearer, enabled: body.enabled !== false ? 1 : 0
  };
}
function parseCouponValidate(b) {
  const body = b || {};
  if (!body.code || body.code.length > 50 || !body.tierId ||
      !Number.isInteger(body.qty) || body.qty < 1 || body.qty > 10) {
    fail(400, 'VALIDATION_ERROR', 'code, tierId, qty(1..10) required');
  }
  return { code: body.code, tierId: body.tierId, qty: body.qty };
}
function presentTier(t) {
  return {
    id: t.id, eventId: t.event_id, name: t.name, price: t.price, capacity: t.capacity,
    soldCount: t.sold_count, availableCount: t.capacity - t.sold_count
  };
}

module.exports = { parseTierFields, parseItems, parseCouponCreate, parseCouponValidate, presentTier };
