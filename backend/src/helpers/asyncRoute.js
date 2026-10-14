'use strict';
// Shared route helpers: async-error mapping and role-guard resolution.
// Every routes file uses withDomainErrors so domain throws { status, code,
// message } always become the JSON envelope, even in bare test apps without
// error middleware. Unexpected errors fall through to next() — except in
// slices created with a fallback (communities/groups/posts), which preserve
// their legacy 500 GATEWAY_ERROR contract.
function withDomainErrors(sendErr, fallback) {
  return (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
    if (e && Number.isInteger(e.status)) {
      return sendErr(res, e.status, e.code || (fallback && fallback.code) || 'INTERNAL_ERROR',
        e.message || (fallback && fallback.message) || 'Unexpected error.');
    }
    if (fallback) return sendErr(res, 500, fallback.code, fallback.message);
    return next(e);
  });
}
// Role guard that tolerates both middleware shapes: a callable auth(role)
// factory (current) or an object with .require(role).
function needRole(auth, role) {
  if (typeof auth === 'function') return auth(role);
  if (auth && typeof auth.require === 'function') return auth.require(role);
  return (_req, _res, next) => next();
}

module.exports = { withDomainErrors, needRole };
