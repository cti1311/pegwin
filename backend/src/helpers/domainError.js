'use strict';
// Domain error helper: services and DTOs throw these; route wrappers and
// the central errorHandler map them to the JSON error envelope.
function fail(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}
function isDomainError(e) {
  return !!e && Number.isInteger(e.status);
}

module.exports = { fail, isDomainError };
