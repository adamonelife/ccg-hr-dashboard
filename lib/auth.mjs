// lib/auth.mjs
//
// Real multi-user auth (Phase 3), replacing the old Adam-only single
// password. Two ways to log in:
//   1. Master admin bootstrap — ADMIN_PASSWORD, no email. Always works
//      regardless of user_accounts state, independent of any specific
//      employee record, so Adam can never lock himself out while setting
//      up everyone else's accounts. Session role: 'Administrator'.
//   2. Real per-person login — email + password checked against
//      user_accounts (see lib/passwords.mjs for hashing). Session role
//      comes from that employee's employees.permission_role, so it stays
//      in sync if their role ever changes there.
//
// Getting an account in the first place: an admin generates a one-time
// setup link for an employee (lib/accounts.mjs), shares it manually (no
// email sending is wired up — see ROADMAP.md), and the employee visits it
// to set their own password via handleSetPassword below.
//
// Role casing: matches employees.permission_role exactly (`Administrator`,
// `Director`, `HR`, `Finance`, `Main Lead`, `Team Lead`, `Employee`) so a
// real per-person session's role lines up with requireRole(...) checks
// without a translation layer. The master-admin bootstrap session uses
// 'Administrator' for the same reason.
//
// Session token format: base64url(JSON payload) + "." + HMAC-SHA256(payload, SESSION_SECRET)
// Stored as an httpOnly, Secure, SameSite=Strict cookie so it never touches
// client-side JS (mitigates XSS token theft).

import crypto from 'crypto';
import { getSql, formatTimestamp } from './db.mjs';
import { hashPassword, verifyPassword } from './passwords.mjs';

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

// Usage: routes['salary-history'] = requireRole('Administrator', 'HR', 'Finance')(handleSalaryHistory);
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
  const { email, password } = req.body || {};
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  // Master admin bootstrap — leave email blank to use this path.
  if (!email) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
      return;
    }
    if (password !== expected) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    const token = createSessionToken({ user: 'adam', role: 'Administrator', employee_id: null });
    setSessionCookie(res, token);
    res.status(200).json({ ok: true });
    return;
  }

  // Real per-person login.
  const sql = getSql();
  const [account] = await sql`
    SELECT ua.id, ua.email, ua.password_hash, ua.employee_id, e.permission_role, e.full_name
    FROM user_accounts ua
    JOIN employees e ON e.employee_id = ua.employee_id
    WHERE ua.email = ${email}
  `;
  if (!account || !verifyPassword(password, account.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  await sql`UPDATE user_accounts SET last_login_at = now() WHERE id = ${account.id}`;
  const token = createSessionToken({
    user: account.email,
    role: account.permission_role,
    employee_id: account.employee_id,
    full_name: account.full_name,
  });
  setSessionCookie(res, token);
  res.status(200).json({ ok: true });
}

// Public — no session exists yet at this point. Token is single-use (it
// gets cleared once a password is set) and time-limited (see
// lib/accounts.mjs for the expiry window).
export async function handleSetPassword(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { token, password } = req.body || {};
  if (!token || !password) {
    res.status(400).json({ error: 'token and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const sql = getSql();
  const [account] = await sql`
    SELECT id, magic_link_expires_at FROM user_accounts WHERE magic_link_token = ${token}
  `;
  if (!account) {
    res.status(400).json({ error: 'Invalid or already-used link' });
    return;
  }
  if (!account.magic_link_expires_at || new Date(account.magic_link_expires_at) < new Date()) {
    res.status(400).json({ error: 'This link has expired — ask an admin to generate a new one' });
    return;
  }
  await sql`
    UPDATE user_accounts
    SET password_hash = ${hashPassword(password)}, magic_link_token = NULL, magic_link_expires_at = NULL
    WHERE id = ${account.id}
  `;
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
  // profile_setup_completed_at is looked up fresh every time rather than
  // trusting anything baked into the signed session token — the token is
  // only re-issued at login, but this can flip from NULL to set mid-
  // session the moment someone finishes first-login setup, and the
  // frontend's onboarding gate (App.jsx) needs that change to show up
  // without forcing a logout/login.
  let profileSetupCompletedAt = null;
  if (session.employee_id) {
    const sql = getSql();
    const [row] = await sql`
      SELECT profile_setup_completed_at FROM employees WHERE employee_id = ${session.employee_id}
    `;
    profileSetupCompletedAt = formatTimestamp(row?.profile_setup_completed_at) || null;
  }
  res.status(200).json({
    authenticated: true,
    user: session.user,
    role: session.role,
    employee_id: session.employee_id || null,
    full_name: session.full_name || null,
    profile_setup_completed_at: profileSetupCompletedAt,
  });
}
