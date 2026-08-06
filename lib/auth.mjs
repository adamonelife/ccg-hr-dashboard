// lib/auth.mjs
//
// Adam-only session auth. Not meant to scale to multi-user out of the box —
// when Yasmin/Gloria need their own logins, replace the single ADMIN_PASSWORD
// check with a per-user table (e.g. a "Users" tab in a Google Sheet, or a
// small KV store) and stamp the session payload with a user id/role.
//
// Session token format: base64url(JSON payload) + "." + HMAC-SHA256(payload, SESSION_SECRET)
// Stored as an httpOnly, Secure, SameSite=Strict cookie so it never touches
// client-side JS (mitigates XSS token theft).

import crypto from 'crypto';

const COOKIE_NAME = 'hr_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function b64urlEncode(str) {
  return Buffer.from(str).toString('base64url');
}
function b64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function sign(payloadB64) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var not set');
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createSessionToken(payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const payloadB64 = b64urlEncode(JSON.stringify(body));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  const expectedSig = sign(payloadB64);
  // timing-safe compare
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  return verifySessionToken(token);
}

// Wrap a handler so it 401s if there's no valid session.
export function requireAuth(handler) {
  return async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    req.session = session;
    return handler(req, res);
  };
}

// Permissions groundwork (Phase 1). Only Adam logs in today, always as
// 'administrator', so this doesn't gate anything in practice yet — but the
// permission_role field exists on every Employee record (see
// lib/employees.mjs) and this wrapper is ready to use the moment a second
// login exists. Note: permission_role (the Employee sheet field) and
// session.role (this cookie's payload) are separate today — nothing maps
// one to the other yet, since Adam's session role is hard-coded at login
// rather than looked up from his own Employee row. That mapping is part of
// the work when multi-user login actually gets built.
//
// Usage: routes['salary-history'] = requireRole('administrator', 'hr', 'finance')(handleSalaryHistory);
export function requireRole(...allowedRoles) {
  return (handler) => async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (allowedRoles.length && !allowedRoles.includes(session.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    req.session = session;
    return handler(req, res);
  };
}

// ---- route handlers ----

export async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
    return;
  }
  if (typeof password !== 'string' || password !== expected) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  const token = createSessionToken({ user: 'adam', role: 'administrator' });
  setSessionCookie(res, token);
  res.status(200).json({ ok: true });
}

export async function handleLogout(req, res) {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

export async function handleMe(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.status(200).json({ authenticated: true, user: session.user, role: session.role });
}
