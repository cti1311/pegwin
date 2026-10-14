'use strict';
// Section-14 error envelope: { error: { code, message, details? } }.
function send(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}
module.exports = {
  send,
  notFound(req, res) {
    return send(res, 404, 'NOT_FOUND', 'Route not found.');
  },
  // eslint-disable-next-line no-unused-vars
  errorHandler(err, req, res, next) {
    // Only domain errors (explicit numeric status) keep their code/message;
    // anything else (driver codes like ECONNREFUSED, TypeErrors) maps to the
    // generic envelope so internals never leak to clients.
    const domain = err && Number.isInteger(err.status);
    const status = domain ? err.status : 500;
    const code = (domain && typeof err.code === 'string' && err.code) || 'INTERNAL_ERROR';
    const message = (domain && typeof err.message === 'string' && err.message) || 'Unexpected error.';
    return send(res, status, code, message);
  }
};
