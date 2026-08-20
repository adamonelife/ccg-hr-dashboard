// lib/accounts.mjs — admin management of who has a login (Phase 3).
//
// Generates a one-time setup token, then tries to email the setup link
// straight to the address just entered (lib/gmail-client.mjs, sent via
// Gmail using the same service account as Sheets/Drive, domain-wide
// delegated — see SETUP.md step 6). The link itself is still always
// returned in the response and shown in the UI too (EmployeeForm.jsx's
// AccountPanel) — if the email fails to send (delegation not set up yet,
// bad address, whatever), Adam still has the link to copy and share
// manually, same as the original flow before email sending existed.
//
// The full setup URL is built here rather than baked into an env var,
// from `base_url` in the request body (the browser's own
// window.location.origin — see src/lib/api.js's createAccount) — one
// source of truth for the app's public domain instead of keeping a
// server-side copy in sync with it.
//
// Re-running the create action for someone who already has an account
// regenerates their setup link (and re-sends the email) — same flow
// doubles as "reset password" (a fresh token lets them set a new one,
// overwriting whatever was there).

import { getSql } from './db.mjs';
import { generateSetupToken } from './passwords.mjs';
import { sendEmail } from './gmail-client.mjs';

const SETUP_TOKEN_TTL_DAYS = 7;

// Bilingual (English then Indonesian) rather than picked per-recipient —
// there's no language preference stored anywhere at this point (the
// account doesn't even have a password yet, let alone a saved UI language
// choice from src/lib/i18n.jsx, which only persists in the browser once
// someone's actually logged in). Simplest reliable option: say it both
// ways in one email.
function setupEmailText({ name, setupUrl }) {
  const who = name || 'there';
  const english =
    `Hi ${who},\n\n` +
    `You've been set up with a login for the CCG HR Dashboard. Use the link below to create your ` +
    `password — it's a one-time link, so please don't forward it on:\n\n` +
    `${setupUrl}\n\n` +
    `This link expires in ${SETUP_TOKEN_TTL_DAYS} days. If it's expired by the time you get to it, just ask ` +
    `HR/Admin for a new one.\n\n` +
    `Once you're logged in for the first time, you'll be asked to fill in your details and skills before ` +
    `you can use the rest of the app.`;
  const indonesian =
    `Halo ${who},\n\n` +
    `Anda telah diberi akun login untuk CCG HR Dashboard. Gunakan tautan di bawah untuk membuat kata sandi ` +
    `Anda — ini adalah tautan sekali pakai, jadi mohon jangan diteruskan ke orang lain:\n\n` +
    `${setupUrl}\n\n` +
    `Tautan ini kedaluwarsa dalam ${SETUP_TOKEN_TTL_DAYS} hari. Jika sudah kedaluwarsa saat Anda ` +
    `membukanya, silakan minta tautan baru ke HR/Admin.\n\n` +
    `Setelah login pertama kali, Anda akan diminta mengisi data diri dan keahlian sebelum bisa ` +
    `menggunakan bagian lain dari aplikasi ini.`;
  return `${english}\n\n---\n\n${indonesian}`;
}

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
    let row;
    try {
      [row] = await sql`
        INSERT INTO user_accounts (employee_id, email, magic_link_token, magic_link_expires_at)
        VALUES (${body.employee_id}, ${body.email}, ${token}, ${expiresAt})
        ON CONFLICT (employee_id) DO UPDATE SET
          email = EXCLUDED.email,
          magic_link_token = EXCLUDED.magic_link_token,
          magic_link_expires_at = EXCLUDED.magic_link_expires_at
        RETURNING employee_id
      `;
    } catch (err) {
      res.status(400).json({ error: `Create failed: ${err.message}` });
      return;
    }

    const baseUrl = typeof body.base_url === 'string' ? body.base_url.replace(/\/$/, '') : '';
    const setupUrl = baseUrl ? `${baseUrl}/?setup=${token}` : null;

    let emailSent = false;
    let emailError = null;
    if (setupUrl) {
      try {
        const [employee] = await sql`
          SELECT full_name, nickname FROM employees WHERE employee_id = ${body.employee_id}
        `;
        await sendEmail({
          to: body.email,
          subject: 'Set up your CCG HR Dashboard login / Atur login CCG HR Dashboard Anda',
          text: setupEmailText({ name: employee?.nickname || employee?.full_name, setupUrl }),
        });
        emailSent = true;
      } catch (err) {
        // Not fatal — the account/token still exist either way, and the
        // link is always returned below so Adam can send it by hand
        // instead (Slack, WhatsApp, whatever) if email sending isn't set
        // up or fails for this address.
        emailError = err.message;
      }
    }

    res.status(201).json({
      employee_id: row.employee_id,
      setup_token: token,
      setup_url: setupUrl,
      expires_at: expiresAt.toISOString(),
      email_sent: emailSent,
      email_error: emailError,
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
