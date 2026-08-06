// lib/sheets-client.mjs
//
// Shared Google Sheets client for the HR module. Ops Dash duplicates this
// JWT boilerplate per-file by convention; here it's centralized instead,
// because HR has many more Sheets-backed tabs than Ops Dash had files, and
// duplicating the token-refresh logic across a dozen handlers is a bug
// magnet (miss a fix in one copy, auth breaks intermittently in another).
//
// Env vars required: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY.
//
// Safety rule (learned the hard way in Ops Dash): NEVER blind clear() +
// rewrite a sheet. updateRow() below always targets one specific row range
// — read the row first, merge changes, write back only that row.

import crypto from 'crypto';

let _token = null;
let _tokenExp = 0;

async function getSheetToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const hdr = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64(
    JSON.stringify({
      iss: process.env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
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
  if (!data.access_token) throw new Error('Google auth failed: ' + JSON.stringify(data));
  _token = data.access_token;
  _tokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function readRange(sheetId, range) {
  const token = await getSheetToken();
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Sheets read failed (${range}): ${data.error.message}`);
  return data.values || [];
}

// Append-only — safe by construction, never touches existing rows.
export async function appendRow(sheetId, range, row) {
  const token = await getSheetToken();
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Sheets append failed (${range}): ${data.error.message}`);
  return data;
}

// Targeted single-row update, e.g. range "Employees!A5:AJ5". Caller is
// responsible for read-modify-write (read the row, merge changes, pass the
// full merged row back) — this function itself only ever writes the exact
// range given, never a blind full-sheet rewrite.
export async function updateRow(sheetId, range, row) {
  const token = await getSheetToken();
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Sheets update failed (${range}): ${data.error.message}`);
  return data;
}

export function rowsToObjects(headers, rows) {
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });
}

export function objectToRow(headers, obj) {
  return headers.map((h) => (obj[h] === undefined || obj[h] === null ? '' : obj[h]));
}

// Converts a 1-based column count to its A1 letter (37 -> "AK").
export function colLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
