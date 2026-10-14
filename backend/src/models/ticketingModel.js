'use strict';
// Ticketing domain model: pricing math, TTL, validation, pagination.
// Pure functions only; no database access (see repository.js/service.js).
const HOLD_TTL_SEC = 600;

// Pricing (server-side): hostPrice +10% fee = display, -discount, +18% GST.
// All money in integer paise.
function priceLines(lines) {
  const items = lines.map((l) => {
    const hostPrice = l.unitPrice * l.qty, platformFee = Math.round(hostPrice * 0.10);
    return { tierId: l.tierId, qty: l.qty, hostPrice, platformFee, displayPrice: hostPrice + platformFee };
  });
  const hostPrice = items.reduce((s, i) => s + i.hostPrice, 0);
  const platformFee = items.reduce((s, i) => s + i.platformFee, 0);
  return { items, hostPrice, platformFee, displayPrice: hostPrice + platformFee };
}
function applyCoupon(displayPrice, coupon) {
  if (!coupon) return { discount: 0, discountBearer: 'pegwin' };
  const d = coupon.discountType === 'flat' ? Math.min(coupon.value, displayPrice)
    : Math.min(Math.round((displayPrice * coupon.value) / 100), displayPrice);
  return { discount: d, discountBearer: coupon.discountBearer || 'pegwin' };
}
function totals(quote, coupon) {
  const d = applyCoupon(quote.displayPrice, coupon);
  const taxableAmount = quote.displayPrice - d.discount, gst = Math.round(taxableAmount * 0.18);
  return { ...quote, discount: d.discount, discountBearer: d.discountBearer, taxableAmount, gst, finalPayable: taxableAmount + gst };
}
function pageParams(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
function holdExpiresAt() {
  return new Date(Date.now() + HOLD_TTL_SEC * 1000).toISOString();
}
function holdTtlSec(expiresAt) {
  return Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
}

module.exports = { HOLD_TTL_SEC, priceLines, applyCoupon, totals, pageParams, holdExpiresAt, holdTtlSec };
