// lib/drive-client.mjs — real Google Drive integration for Documents
// (lib/documents.mjs), separate from lib/sheets-client.mjs's JWT logic on
// purpose (different OAuth scope, and sheets-client.mjs's own header notes
// this file should be a sibling rather than a reuse-as-is).
//
// Setup required on Adam's side before this works (see SETUP.md):
//   1. Enable the Google Drive API in the same Google Cloud project the
//      existing service account (GOOGLE_CLIENT_EMAIL) already lives in.
//   2. Create a Shared Drive in Google Workspace (e.g. "CCG HR Documents").
//      Shared Drives on purpose, not a folder in someone's personal My
//      Drive — storage belongs to the org rather than one person's
//      account, and avoids Google service accounts' own (effectively
//      zero) personal storage quota.
//   3. Add the service account's email (GOOGLE_CLIENT_EMAIL) to that
//      Shared Drive as a member with "Content Manager" access (needed to
//      create folders/upload files).
//   4. Set GOOGLE_DRIVE_ID in Vercel to that Shared Drive's ID (the string
//      in its URL: drive.google.com/drive/folders/<this part>).
//
// Folder structure this file manages automatically inside that Shared
// Drive — nothing here needs to be created by hand beyond the Shared
// Drive itself:
//   <Shared Drive root>
//     Employees/
//       <employee_id> - <nickname or full name>/   (auto-created per upload)
//     Company/
//       Employee/ Team Lead/ Main Lead/ HR/ Finance/ Director/ Administrator/
//       (one per permission_role tier, matching company_documents.access_role)
//
// All Drive API calls are raw REST via fetch (no googleapis SDK) — matches
// how every other external service in this codebase is called directly.

import crypto from 'crypto';

let _token = null;
let _tokenExp = 0;

async function getDriveToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const hdr = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64(
    JSON.stringify({
      iss: process.env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/drive',
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
  if (!data.access_token) throw new Error('Google Drive auth failed: ' + JSON.stringify(data));
  _token = data.access_token;
  _tokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

function requireSharedDriveId() {
  const id = process.env.GOOGLE_DRIVE_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_ID not configured — see SETUP.md for the Shared Drive setup steps');
  return id;
}

// Drive API `q` filters use single-quoted string literals — escape any
// literal backslash/quote in a folder name before interpolating it in.
function escapeForQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// Find a folder by exact name directly under parentId, or create it if it
// doesn't exist yet. Safe to call repeatedly — this is what lets employee/
// company folders "auto-create the first time they're needed" rather than
// requiring anything to be pre-made by hand.
export async function ensureFolder(name, parentId) {
  const token = await getDriveToken();
  const driveId = requireSharedDriveId();
  const q = `name='${escapeForQuery(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listUrl = `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${driveId}`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  const listData = await listRes.json();
  if (listData.error) throw new Error(`Drive folder search failed: ${listData.error.message}`);
  if (listData.files?.length > 0) return listData.files[0].id;

  const createRes = await fetch(`${FILES_URL}?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const createData = await createRes.json();
  if (createData.error) throw new Error(`Drive folder create failed: ${createData.error.message}`);
  return createData.id;
}

// Uploads file bytes into parentId, returns the new file's id + a link a
// browser can open (webViewLink — Drive's own viewer, respects whatever
// sharing is set on the Shared Drive/folder).
export async function uploadFileToDrive(buffer, filename, mimeType, parentId) {
  const token = await getDriveToken();
  const boundary = `ccg_hr_${crypto.randomBytes(16).toString('hex')}`;
  const metadata = JSON.stringify({ name: filename, parents: [parentId] });
  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(preamble, 'utf8'), buffer, Buffer.from(closing, 'utf8')]);

  const res = await fetch(`${UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  if (data.error) throw new Error(`Drive upload failed: ${data.error.message}`);
  return { id: data.id, webViewLink: data.webViewLink };
}

// "<employee_id> - <displayName>" under Employees/, auto-created on first
// use per employee. displayName should be nickname-or-full_name — caller's
// responsibility (lib/documents.mjs looks it up from Postgres, this file
// has no employee knowledge of its own).
export async function getEmployeeFolderId(employeeId, displayName) {
  const root = requireSharedDriveId();
  const employeesRoot = await ensureFolder('Employees', root);
  return ensureFolder(`${employeeId} - ${displayName}`, employeesRoot);
}

// One folder per permission_role tier under Company/, matching
// company_documents.access_role exactly (lib/documents.mjs's ROLE_RANK).
export async function getCompanyFolderId(accessRole) {
  const root = requireSharedDriveId();
  const companyRoot = await ensureFolder('Company', root);
  return ensureFolder(accessRole, companyRoot);
}
