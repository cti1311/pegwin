'use strict';
// Outbound HTTP client for server-to-provider calls (payment gateways,
// OTP/SMS sender, mail/push providers). Built on axios per project stack.
// Interface kept stable for slice factories: get(url, { params, timeout }),
// post(url, body, { timeout }). One retry with backoff on network/5xx errors.
const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 10000;

function client() {
  return axios.create({ timeout: DEFAULT_TIMEOUT_MS });
}

async function withRetry(fn, retries) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err && err.response && err.response.status;
      const retryable = !err.response || (status >= 500 && status < 600);
      if (!retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function get(url, opts) {
  const o = opts || {};
  const res = await withRetry(
    () => client().get(url, { params: o.params, timeout: o.timeout || DEFAULT_TIMEOUT_MS }),
    1
  );
  return { data: res.data, status: res.status };
}

async function post(url, body, opts) {
  const o = opts || {};
  const res = await withRetry(
    () => client().post(url, body, { timeout: o.timeout || DEFAULT_TIMEOUT_MS }),
    1
  );
  return { data: res.data, status: res.status };
}

module.exports = { get, post };
