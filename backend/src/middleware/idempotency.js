'use strict';
// Optional Idempotency-Key support. Slice routers in this MVP accept the
// header and echo a replay marker; persistent key storage lives in
// migrations/001-core.sql (idempotency_keys) for later slices.
function idempotency() {
  return (req, res, next) => {
    req.idempotencyKey = req.headers['idempotency-key'] || null;
    return next();
  };
}
module.exports = { idempotency };
