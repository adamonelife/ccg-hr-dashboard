// lib/documents.mjs — Phase 2's Documents module, personal + company
// together in one pass (per Adam's request — they share enough logic that
// splitting them into separate future phases didn't make sense).
//
// Two kinds of document, two different visibility rules:
//
//   - Personal (`documents` table, already existed as a Phase 2 placeholder
//     in db/schema.sql) — always about one specific employee. Visible to
//     that employee themselves, plus Administrator/HR/Finance/Director see
//     everyone's. Deliberately NOT the same org-chart/lead visibility used
//     for Employee Cards/Leave — a Team Lead does NOT get their team's
//     personal documents just for being a lead, only the four full-access
//     roles do (Adam's explicit spec). Files themselves stay in Google
//     Drive — this table only stores a link + metadata, same pattern as
//     the rest of the app's Drive integration.
//
//   - Company (`company_documents`, new table this session) — not tied to
//     any one employee. Organised into folders, each folder gated by a
//     minimum permission_role "tier" (ROLE_RANK below) — a Director sees
//     every folder, a Team Lead sees Team Lead's folder and everything
//     below it (Employee), and so on. Upload restricted to
//     Administrator/HR/Director (not Finance, not leads).
//
// Both tables are created defensively with CREATE TABLE IF NOT EXISTS at
// the top of their handlers rather than assuming a migration already ran —
// `documents` should already exist from the original schema, but
// `company_documents` is brand new, and the org_units.sort_order incident
// (code shipped referencing a column that didn't exist yet until a
// separate migration URL was visited) is exactly the failure mode this
// avoids.

import { getSql, formatDate, formatTimestamp, nullifyEmpty } from './db.mjs';
import { parseMultipart } from './multipart.mjs';
import { getEmployeeFolderId, getCompanyFolderId, uploadFileToDrive } from './drive-client.mjs';

// POST bodies come in two shapes: JSON (the original "paste a Drive link"
// path — api/[[...path]].mjs already parses these into req.body) or
// multipart/form-data (a real file upload, left as a raw Buffer on
// req.rawBody since the router only auto-parses JSON). Both end up here as
// the same { fields, file } shape so the rest of each handler doesn't need
// to care which path was used — Adam's spec keeps both: real upload for
// people who want it, paste-a-link still works for anything that already
// lives in Drive.
async function getRequestData(req) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    if (!req.rawBody) return { fields: {}, file: null };
    return parseMultipart(req.rawBody, contentType);
  }
  return { fields: req.body || {}, file: null };
}

export const DOCUMENT_TYPES = [
  'Employment Contract', 'NDA', 'Passport', 'KITAS', 'Tax Document',
  'Qualification', 'Certificate', 'Signed Policy', 'Performance Review', 'Other',
];

// Same order as employees.permission_role's CHECK constraint — treated
// here as a rank, low to high. Used only for company document folder
// access; personal document visibility uses the flat set below instead.
export const ROLE_RANK = ['Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'];

function rankOf(role) {
  return ROLE_RANK.indexOf(role);
}

// Personal documents: who sees everyone's, regardless of whose record it
// is. Deliberately includes Finance (unlike lib/permissions.mjs's
// FULL_VISIBILITY_ROLES, which excludes Finance for the org-chart-scoped
// modules) — Adam's spec for this module explicitly lists Finance in.
const DOC_FULL_VISIBILITY_ROLES = new Set(['Administrator', 'HR', 'Finance', 'Director']);

function canViewPersonalDocs(session, employeeId) {
  if (!session) return false;
  if (session.employee_id === employeeId) return true;
  return DOC_FULL_VISIBILITY_ROLES.has(session.role);
}

// Same set can upload/delete on someone else's behalf; uploading your own
// is always allowed regardless of role.
function canManagePersonalDocs(session, employeeId) {
  return canViewPersonalDocs(session, employeeId);
}

const COMPANY_UPLOAD_ROLES = new Set(['Administrator', 'HR', 'Director']);

async function ensurePersonalDocumentsTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id              SERIAL PRIMARY KEY,
      employee_id     TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
      document_type   TEXT NOT NULL CHECK (document_type IN (
                        'Employment Contract', 'NDA', 'Passport', 'KITAS', 'Tax Document',
                        'Qualification', 'Certificate', 'Signed Policy', 'Performance Review', 'Other'
                      )),
      drive_file_id   TEXT,
      drive_link      TEXT,
      expiry_date     DATE,
      uploaded_by     TEXT,
      uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      notes           TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_employee ON documents(employee_id)`;
}

async function ensureCompanyDocumentsTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS company_documents (
      id             SERIAL PRIMARY KEY,
      folder         TEXT NOT NULL,
      access_role    TEXT NOT NULL CHECK (access_role IN (
                        'Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'
                      )),
      title          TEXT NOT NULL,
      drive_file_id  TEXT,
      drive_link     TEXT,
      notes          TEXT,
      -- Plain TEXT, not a FK to employees — matches documents.uploaded_by
      -- and deliberately so: the master-admin bootstrap login (blank-email
      -- "Adam" login) has no employee_id at all, just session.user = 'adam',
      -- which isn't a real employee_id. A FK here would reject every upload
      -- made through that login.
      uploaded_by    TEXT,
      uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_company_documents_access_role ON company_documents(access_role)`;
}

function formatPersonalDoc(row) {
  if (!row) return row;
  return { ...row, expiry_date: formatDate(row.expiry_date), uploaded_at: formatTimestamp(row.uploaded_at) };
}

function formatCompanyDoc(row) {
  if (!row) return row;
  return { ...row, uploaded_at: formatTimestamp(row.uploaded_at) };
}

// ─── Personal documents ────────────────────────────────────────────────

export async function handlePersonalDocuments(req, res) {
  const sql = getSql();
  await ensurePersonalDocumentsTable(sql);

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    if (!employeeId) {
      res.status(400).json({ error: 'employeeId is required' });
      return;
    }
    if (!canViewPersonalDocs(req.session, employeeId)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const rows = await sql`
      SELECT * FROM documents WHERE employee_id = ${employeeId} ORDER BY uploaded_at DESC
    `;
    res.status(200).json({ documents: rows.map(formatPersonalDoc) });
    return;
  }

  if (req.method === 'POST') {
    const { fields, file } = await getRequestData(req);
    if (!fields.employee_id || !fields.document_type) {
      res.status(400).json({ error: 'employee_id and document_type are required' });
      return;
    }
    if (!DOCUMENT_TYPES.includes(fields.document_type)) {
      res.status(400).json({ error: `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}` });
      return;
    }
    if (!canManagePersonalDocs(req.session, fields.employee_id)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // A real file wins over a pasted link if somehow both were sent —
    // upload it into that employee's auto-created Drive folder
    // ("<employee_id> - <nickname or full name>", created the first time
    // this employee ever uploads anything).
    let driveLink = nullifyEmpty(fields.drive_link);
    let driveFileId = nullifyEmpty(fields.drive_file_id);
    if (file) {
      const [emp] = await sql`SELECT nickname, full_name FROM employees WHERE employee_id = ${fields.employee_id}`;
      const displayName = emp?.nickname || emp?.full_name || fields.employee_id;
      try {
        const folderId = await getEmployeeFolderId(fields.employee_id, displayName);
        const uploaded = await uploadFileToDrive(file.buffer, file.filename, file.mimeType, folderId);
        driveFileId = uploaded.id;
        driveLink = uploaded.webViewLink;
      } catch (err) {
        res.status(502).json({ error: `Drive upload failed: ${err.message}` });
        return;
      }
    }

    try {
      const [row] = await sql`
        INSERT INTO documents (employee_id, document_type, drive_file_id, drive_link, expiry_date, uploaded_by, notes)
        VALUES (
          ${fields.employee_id},
          ${fields.document_type},
          ${driveFileId},
          ${driveLink},
          ${nullifyEmpty(fields.expiry_date)},
          ${req.session?.employee_id || req.session?.user || null},
          ${nullifyEmpty(fields.notes)}
        )
        RETURNING *
      `;
      res.status(201).json({ document: formatPersonalDoc(row) });
    } catch (err) {
      res.status(400).json({ error: `Create failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const [existing] = await sql`SELECT employee_id FROM documents WHERE id = ${id}`;
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!canManagePersonalDocs(req.session, existing.employee_id)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    await sql`DELETE FROM documents WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ─── Company documents ─────────────────────────────────────────────────

export async function handleCompanyDocuments(req, res) {
  const sql = getSql();
  await ensureCompanyDocumentsTable(sql);

  if (req.method === 'GET') {
    const myRank = rankOf(req.session?.role);
    // Anyone with a recognised role sees every folder at or below their
    // own tier. An unrecognised/missing role (shouldn't happen past
    // requireAuth, but just in case) sees nothing rather than erroring.
    const rows = myRank === -1
      ? []
      : await sql`SELECT * FROM company_documents ORDER BY folder, uploaded_at DESC`;
    const visible = rows.filter((r) => rankOf(r.access_role) <= myRank);
    res.status(200).json({ documents: visible.map(formatCompanyDoc) });
    return;
  }

  // Everything past GET mutates — check role here rather than gating the
  // whole route, since GET needs to stay reachable by everyone
  // authenticated (visibility is per-row, not per-route).
  if (!COMPANY_UPLOAD_ROLES.has(req.session?.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  if (req.method === 'POST') {
    const { fields, file } = await getRequestData(req);
    if (!fields.folder?.trim() || !fields.access_role || !fields.title?.trim()) {
      res.status(400).json({ error: 'folder, access_role, and title are required' });
      return;
    }
    if (!ROLE_RANK.includes(fields.access_role)) {
      res.status(400).json({ error: `access_role must be one of: ${ROLE_RANK.join(', ')}` });
      return;
    }

    // Real file wins over a pasted link — uploaded into the auto-created
    // Company/<access_role> folder, one per permission tier.
    let driveLink = nullifyEmpty(fields.drive_link);
    let driveFileId = null;
    if (file) {
      try {
        const folderId = await getCompanyFolderId(fields.access_role);
        const uploaded = await uploadFileToDrive(file.buffer, file.filename, file.mimeType, folderId);
        driveFileId = uploaded.id;
        driveLink = uploaded.webViewLink;
      } catch (err) {
        res.status(502).json({ error: `Drive upload failed: ${err.message}` });
        return;
      }
    }

    try {
      const [row] = await sql`
        INSERT INTO company_documents (folder, access_role, title, drive_file_id, drive_link, notes, uploaded_by)
        VALUES (
          ${fields.folder.trim()},
          ${fields.access_role},
          ${fields.title.trim()},
          ${driveFileId},
          ${driveLink},
          ${nullifyEmpty(fields.notes)},
          ${req.session?.employee_id || req.session?.user || null}
        )
        RETURNING *
      `;
      res.status(201).json({ document: formatCompanyDoc(row) });
    } catch (err) {
      res.status(400).json({ error: `Create failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const [row] = await sql`DELETE FROM company_documents WHERE id = ${id} RETURNING id`;
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
