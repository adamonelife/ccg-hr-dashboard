// lib/gmail-client.mjs — sends setup-link emails on Adam's behalf via
// Gmail, so account creation (lib/accounts.mjs) doesn't require manually
// copying a link and pasting it into Slack/WhatsApp for every new hire.
//
// Reuses the same service account as Sheets/Drive (GOOGLE_CLIENT_EMAIL /
// GOOGLE_PRIVATE_KEY), but with one extra piece: a plain service-account
// JWT can't send mail as anyone — Gmail's API only lets you act on behalf
// of a real Workspace mailbox, via "domain-wide delegation." That means:
//   1. Google Workspace admin console → Security → API controls →
//      Domain-wide delegation → add a new API client using the service
//      account's Client ID (not its email — the numeric ID, found on the
//      service account's details page in Google Cloud Console), with scope
//      https://www.googleapis.com/auth/gmail.send. Only a Workspace super
//      admin can do this step.
//   2. Set GMAIL_SEND_AS in Vercel to the real Workspace mailbox address
//      emails should be sent from (e.g. hr@yourdomain.com or Adam's own
//      address) — this becomes both the JWT's impersonated identity (the
//      "sub" claim below) and the email's From address.
// See SETUP.md step 6 for the full walkthrough.
//
// Separate token cache from lib/sheets-client.mjs / lib/drive-client.mjs
// on purpose — different scope, and this one carries a "sub" claim those
// don't need.
//
// Raw REST via fetch, no googleapis SDK — same as every other Google
// integration in this codebase.

import crypto from 'crypto';

let _token = null;
let _tokenExp = 0;

function requireSendAsAddress() {
  const addr = process.env.GMAIL_SEND_AS;
  if (!addr) {
    throw new Error('GMAIL_SEND_AS not configured — see SETUP.md for the domain-wide delegation setup steps');
  }
  return addr;
}

async function getGmailToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const hdr = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64(
    JSON.stringify({
      iss: process.env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      aud: 'https://oauth2.googleapis.com/token',
      // Domain-wide delegation: impersonate this real mailbox rather than
      // the service account itself — Gmail has no concept of a service
      // account's own inbox to send from.
      sub: requireSendAsAddress(),
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${hdr}.${pay}`;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(
      'Gmail auth failed (check GMAIL_SEND_AS is a real mailbox with domain-wide delegation granted for ' +
        'the gmail.send scope): ' + JSON.stringify(data)
    );
  }
  _token = data.access_token;
  _tokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

// Encodes a header value as an RFC 2047 encoded-word if it contains
// non-ASCII characters (e.g. an accented name) — plain ASCII passes
// through untouched. Keeps this safe for any employee/subject text
// without needing every caller to think about it.
function encodeHeaderValue(value) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildRawMessage({ from, to, subject, text }) {
  const lines = [
    `From: ${encodeHeaderValue(from)}`,
    `To: ${encodeHeaderValue(to)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

const SEND_URL = 'https://gmail.googleapis.com/gmail/v3/users/me/messages/send';

export async function sendEmail({ to, subject, text }) {
  const token = await getGmailToken();
  const from = requireSendAsAddress();
  const raw = buildRawMessage({ from, to, subject, text });
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Gmail send failed: ${data.error.message}`);
  return data;
}
