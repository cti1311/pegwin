'use strict';
const crypto = require('crypto');
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid() {
  const now = Date.now();
  let time = now;
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = CROCKFORD[time % 32] + out;
    time = Math.floor(time / 32);
  }
  const rand = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    out += CROCKFORD[rand[i] % 32];
  }
  return out;
}

module.exports = { uid: ulid, ulid };
