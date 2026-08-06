// lib/example-sheets-handler.mjs
//
// SUPERSEDED by lib/sheets-client.mjs, which is now imported directly by
// lib/employees.mjs, lib/org.mjs, lib/salary-history.mjs, and
// lib/promotion-history.mjs. Kept only as a minimal reference for the raw
// JWT pattern (identical to Ops Dash's) in case a handler ever needs to go
// off-script from the shared client. For any new HR feature, import from
// sheets-client.mjs instead of copying this file.
//
// Env vars required: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY
// (same service account as Ops Dash can be reused if HR data lives in the
// same Google Workspace — or point this at a new dedicated sheet/account.)
//
// Reminder from the handoff doc: NEVER blind clear()+rewrite a sheet.
// Append-only or targeted-cell-update only.

import crypto from 'crypto';

let _token = null,
  _tokenExp = 0;

async function getSheetToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const hdr = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64(
    JSON.stringify({
      iss: process.env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets', // or .readonly
      aud: 'https://oauth2.googleapis.com/token',
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
  if (!data.access_token) throw new Error('Google auth failed');
  _token = data.access_token;
  _tokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

// Example: read a range from a sheet.
async function readRange(sheetId, range) {
  const token = await getSheetToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    range
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.values || [];
}

// Example: append a row (safe — never overwrites existing data).
async function appendRow(sheetId, range, row) {
  const token = await getSheetToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });
  return res.json();
}

// Example route handler — GET returns rows, POST appends one.
export async function handleExample(req, res) {
  const sheetId = process.env.EXAMPLE_SHEET_ID;
  if (!sheetId) {
    res.status(500).json({ error: 'EXAMPLE_SHEET_ID not configured' });
    return;
  }
  if (req.method === 'GET') {
    const rows = await readRange(sheetId, 'Sheet1!A:Z');
    res.status(200).json({ rows });
    return;
  }
  if (req.method === 'POST') {
    const { row } = req.body || {};
    if (!Array.isArray(row)) {
      res.status(400).json({ error: 'Expected { row: [...] }' });
      return;
    }
    const result = await appendRow(sheetId, 'Sheet1!A:Z', row);
    res.status(200).json(result);
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}
