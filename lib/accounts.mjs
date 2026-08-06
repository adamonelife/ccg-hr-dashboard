// lib/accounts.mjs — admin management of who has a login (Phase 3).
//
// No email sending is wired up (deliberate choice — see ROADMAP.md): this
// generates a one-time setup token and hands it back to the admin as a
// link to copy and share manually (Slack, WhatsApp, however). The
// employee visits it and sets their own password via
// POST /api/auth/set-password (lib/auth.mjs).
//
// Re-running the create action for someone who already has an account
// regenerates their setup link — same flow doubles as "reset password"
// (a fresh token lets them set a new one, overwriting whatever was there).

import { getSql } from './db.mjs';
import { generateSetupToken } from './passwords.mjs';

const SETUP_TOKEN_TTL_DAYS = 7;

export async function handleAccounts(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    if (!employeeId) {
      res.status(400).json({ error: 'employeeId is required' });
      return;
    }
    const [account] = await sql`
      SELECT
        email,
        password_hash IS NOT NULL AS has_password,
        magic_link_token IS NOT NULL AS setup_pending,
        last_login_at
      FROM user_accounts
      WHERE employee_id = ${employeeId}
    `;
    res.status(200).json({ account: account || null });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.email) {
      res.status(400).json({ error: 'employee_id and email are required' });
      return;
    }
    const token = generateSetupToken();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    try {
      const [row] = await sql`
        INSERT INTO user_accounts (employee_id, email, magic_link_token, magic_link_expires_at)
        VALUES (${body.employee_id}, ${body.email}, ${token}, ${expiresAt})
        ON CONFLICT (employee_id) DO UPDATE SET
          email = EXCLUDED.email,
          magic_link_token = EXCLUDED.magic_link_token,
          magic_link_expires_at = EXCLUDED.magic_link_expires_at
        RETURNING employee_id
      `;
      res.status(201).json({
        employee_id: row.employee_id,
        setup_token: token,
        expires_at: expiresAt.toISOString(),
      });
    } catch (err) {
      res.status(400).json({ error: `Create failed: ${err.message}` });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
