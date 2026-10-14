'use strict';
// Auth middleware factory. Accepts variadic roles or a single array:
//   auth('user'), auth('host', 'super_admin'), auth(['user','host']), auth()
// No-arg form authenticates any valid bearer (or anonymous when no token,
// leaving req.user empty for public-tolerant routes).
// TODO: replace stub JWT verification with real accessJwt verification.
const errors = require('./errors');

function normalizeRoles(args) {
  if (args.length === 0) return null;
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

module.exports = function auth() {
  const allowed = normalizeRoles(Array.prototype.slice.call(arguments));
  return (req, res, next) => {
    const header = (req.headers && req.headers.authorization) || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    // Stub decode: unauthenticated requests get an empty user so public
    // routes (support help/content/meta) still work; guarded routes reject.
    if (!token) {
      req.user = {};
      if (allowed) return errors.send(res, 401, 'UNAUTHENTICATED', 'Missing bearer token');
      return next();
    }
    // Stub user: real implementation must verify JWT and set { id, role, hostId }.
    req.user = req.user && req.user.id ? req.user : { id: 'stub-user', role: 'user', hostId: null };
    if (allowed && allowed.indexOf(req.user.role) === -1) {
      return errors.send(res, 403, 'FORBIDDEN', 'Insufficient role');
    }
    return next();
  };
};
