'use strict';
function validate(schema, pick) {
  return (req, res, next) => {
    const src = pick === 'query' ? req.query : (pick === 'params' ? req.params : req.body);
    const parsed = schema.safeParse(src);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() } });
    }
    if (pick === 'query') req.query = parsed.data;
    else if (pick === 'params') req.params = parsed.data;
    else req.body = parsed.data;
    return next();
  };
}
function pageLimit(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit };
}
module.exports = { validate, pageLimit };
