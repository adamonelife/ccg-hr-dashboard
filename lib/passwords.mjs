// lib/passwords.mjs — password hashing for real per-person accounts.
//
// Uses Node's built-in crypto.scrypt rather than adding bcrypt/argon2 as a
// dependency — same philosophy as lib/auth.mjs's HMAC session signing,
// raw crypto with no extra package. scrypt is a legitimate, standard
// password-hashing choice (memory-hard, purpose-built for this), not a
// corner cut.
//
// Stored format: "<salt-hex>:<hash-hex>" in user_accounts.password_hash.

import crypto from 'crypto';

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const hashBuffer = Buffer.from(hashHex, 'hex');
  const candidateBuffer = crypto.scryptSync(password, salt, KEY_LENGTH);
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

// One-time setup/reset token — random, unguessable, time-limited. Reused
// column names from schema.sql (magic_link_token/magic_link_expires_at)
// even though there's no actual email involved right now (Adam shares the
// link manually) — same purpose, and renaming later if real email gets
// added is a one-line change, not a schema migration.
export function generateSetupToken() {
  return crypto.randomBytes(24).toString('base64url');
}
