// lib/employees.mjs — Employee Directory + Employment (Phase 1).
//
// Backed by the `employees` table in Postgres (see db/schema.sql). Column
// names match the API's JSON field names exactly, in the same order the
// Sheets-era EMPLOYEE_HEADERS used — no renaming/mapping needed here,
// unlike promotion-history.mjs (see that file for why `date` != `promotion_date`).
//
// The external API contract (field names, 'TRUE'/'FALSE' booleans,
// 'YYYY-MM-DD' dates) is unchanged from the Sheets version on purpose —
// see lib/db.mjs — so no frontend files needed to change for this migration.

import { getSql, formatDate, formatTimestamp, formatBool, parseBool, nullifyEmpty } from './db.mjs';
import { canView, FULL_VISIBILITY_ROLES } from './permissions.mjs';
import { createChangeRequest } from './change-requests.mjs';

const DATE_COLUMNS = [
  'date_of_birth',
  'start_date',
  'end_date',
  'contract_start',
  'contract_end',
  'probation_end_date',
  'kitas_expiry',
  'passport_expiry',
  'work_permit_expiry',
];

// Every insertable/updatable column except employee_id (the PK, set once
// on create) and created_at/updated_at (DB-managed — updated_at is bumped
// automatically by the trigger in schema.sql).
const COLUMNS = [
  'employee_id',
  'full_name',
  'nickname',
  'photo_url',
  'email',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'date_of_birth',
  'nationality',
  'religion',
  'gender',
  'marital_status',
  'number_of_children',
  'ktp_number',
  'bni_account_number',
  'employment_status',
  'start_date',
  'end_date',
  'company',
  'department',
  'job_title',
  'team',
  'manager_id',
  'office_location',
  'employment_type',
  'contract_type',
  'contract_start',
  'contract_end',
  'probation_end_date',
  'current_salary',
  'salary_currency',
  'bonus_eligible',
  'kitas_expiry',
  'passport_expiry',
  'work_permit_expiry',
  'permission_role',
];

// No separate active/inactive flag — employment_status is the single
// source of truth. Terminated/Resigned employees are excluded from the
// default directory view; everything else counts as active.
const INACTIVE_STATUSES = new Set(['Terminated', 'Resigned']);

export function isActive(emp) {
  return !INACTIVE_STATUSES.has(emp.employment_status);
}

// Fields a self-service login (someone editing their own record, not one
// of FULL_VISIBILITY_ROLES) can ever touch — contact/personal info only,
// never anything employment- or compensation-related (salary, KITAS/
// passport/contract dates, employment_status, permission_role, manager,
// department/team, job title all stay HR/Admin-only, full stop). Enforced
// server-side below, not just hidden in the UI — see EmployeeForm.jsx for
// the client-side mirror of this same list.
// gender/marital_status/number_of_children added here (Personal-section
// fields, per Adam's spec) — ktp_number/bni_account_number deliberately
// left OUT, since Adam placed those under the Employment status section
// instead, alongside employment_status/start_date/end_date, which have
// always been HR/Admin-only.
export const SELF_SERVICE_FIELDS = [
  'nickname',
  'photo_url',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'nationality',
  'date_of_birth',
  'religion',
  'gender',
  'marital_status',
  'number_of_children',
  'office_location',
];

// address, profile_setup_completed_at (NULL until someone finishes
// first-login setup, see the PATCH handler below), and — added in this
// pass — gender/marital_status/number_of_children/ktp_number/
// bni_account_number, all self-healed the same way lib/documents.mjs and
// lib/skills.mjs do it, rather than requiring a separate migration visit.
let _selfServiceColumnsEnsured = false;
async function ensureSelfServiceColumns(sql) {
  if (_selfServiceColumnsEnsured) return;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address TEXT`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_setup_completed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender TEXT`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status TEXT`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS number_of_children INTEGER`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ktp_number TEXT`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bni_account_number TEXT`;
  _selfServiceColumnsEnsured = true;
}

export async function isProfileSetupComplete(sql, employeeId) {
  const [row] = await sql`SELECT profile_setup_completed_at FROM employees WHERE employee_id = ${employeeId}`;
  return Boolean(row?.profile_setup_completed_at);
}

// Idempotent — a second call is a no-op rather than bumping the
// timestamp, so "when did they actually finish onboarding" stays accurate.
async function markProfileSetupComplete(sql, employeeId) {
  const [row] = await sql`
    UPDATE employees SET profile_setup_completed_at = now()
    WHERE employee_id = ${employeeId} AND profile_setup_completed_at IS NULL
    RETURNING *
  `;
  if (row) return formatEmployee(row);
  const [existing] = await sql`SELECT * FROM employees WHERE employee_id = ${employeeId}`;
  return existing ? formatEmployee(existing) : null;
}

function formatEmployee(row) {
  if (!row) return row;
  const out = { ...row };
  for (const col of DATE_COLUMNS) out[col] = formatDate(out[col]);
  out.created_at = formatTimestamp(out.created_at);
  out.updated_at = formatTimestamp(out.updated_at);
  out.bonus_eligible = formatBool(out.bonus_eligible);
  return out;
}

export async function loadAllEmployees() {
  const sql = getSql();
  const rows = await sql`SELECT * FROM employees ORDER BY full_name`;
  return rows.map(formatEmployee);
}

// Targeted single-row update by employee_id — a real UPDATE ... WHERE, so
// (unlike the old Sheets read-modify-write) this is atomic on its own with
// no risk of a lost update from a concurrent write. Kept the same name/
// shape as the Sheets version so salary-history.mjs and
// promotion-history.mjs didn't need to change at all.
export async function updateEmployeeFields(employeeId, fields) {
  const sql = getSql();
  const setFields = {};
  for (const col of COLUMNS) {
    if (col === 'employee_id') continue;
    if (fields[col] === undefined) continue;
    setFields[col] = col === 'bonus_eligible' ? parseBool(fields[col]) : nullifyEmpty(fields[col]);
  }
  if (Object.keys(setFields).length === 0) {
    const [row] = await sql`SELECT * FROM employees WHERE employee_id = ${employeeId}`;
    return row ? formatEmployee(row) : null;
  }
  const [row] = await sql`
    UPDATE employees SET ${sql(setFields)}
    WHERE employee_id = ${employeeId}
    RETURNING *
  `;
  return row ? formatEmployee(row) : null;
}

const ID_PREFIX = 'CCG-';
const ID_PAD_LENGTH = 3;

// Who can add a new employee — matches the Directory's "Add employee"
// button visibility (Directory.jsx).
const CREATE_ROLES = new Set(['Administrator', 'Director', 'HR', 'Finance']);

// Next employee_id = highest existing numeric suffix + 1 — not "first
// free gap." That's deliberate: if a test employee (e.g. CCG-014, the
// current highest) gets deleted, 014 becomes suggested again next time,
// which is exactly what you want while testing. Once real employees exist
// throughout the range, deleting one from the middle (which shouldn't
// normally happen — see the DELETE handler's comment about using
// employment_status instead) does NOT backfill that gap; new IDs keep
// climbing from the actual highest one still on record. No separate
// "testing mode" needed — this one rule produces both behaviours.
async function getNextEmployeeId(sql) {
  const rows = await sql`SELECT employee_id FROM employees WHERE employee_id LIKE ${ID_PREFIX + '%'}`;
  let max = 0;
  for (const row of rows) {
    const num = parseInt(row.employee_id.slice(ID_PREFIX.length), 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return `${ID_PREFIX}${String(max + 1).padStart(ID_PAD_LENGTH, '0')}`;
}

export async function handleEmployees(req, res) {
  const sql = getSql();
  await ensureSelfServiceColumns(sql);

  if (req.method === 'GET') {
    const { id, includeInactive, nextId } = req.query;
    if (nextId === 'true') {
      res.status(200).json({ next_id: await getNextEmployeeId(sql) });
      return;
    }
    if (id) {
      if (!(await canView(req.session, id))) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      const [row] = await sql`SELECT * FROM employees WHERE employee_id = ${id}`;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json({ employee: formatEmployee(row) });
      return;
    }
    const all = await loadAllEmployees();
    const list = includeInactive === 'true' ? all : all.filter(isActive);
    res.status(200).json({ employees: list });
    return;
  }

  if (req.method === 'POST') {
    // The Directory's "Add employee" button is hidden for anyone outside
    // this set (see Directory.jsx), but a hidden button alone doesn't stop
    // a direct API call — this is the actual enforcement.
    if (!CREATE_ROLES.has(req.session?.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const body = req.body || {};
    if (!body.employee_id || !body.full_name) {
      res.status(400).json({ error: 'employee_id and full_name are required' });
      return;
    }
    const [existing] = await sql`SELECT 1 FROM employees WHERE employee_id = ${body.employee_id}`;
    if (existing) {
      res.status(409).json({ error: `employee_id ${body.employee_id} already exists` });
      return;
    }
    const record = {};
    for (const col of COLUMNS) {
      if (body[col] === undefined) continue;
      record[col] = col === 'bonus_eligible' ? parseBool(body[col]) : nullifyEmpty(body[col]);
    }
    try {
      const [row] = await sql`INSERT INTO employees ${sql(record)} RETURNING *`;
      res.status(201).json({ employee: formatEmployee(row) });
    } catch (err) {
      res.status(400).json({ error: `Insert failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    if (!body.employee_id) {
      res.status(400).json({ error: 'employee_id is required' });
      return;
    }
    // complete_setup is a signal from the frontend's first-login setup
    // screen ("I'm done filling this in"), not an employees column itself
    // — pulled out separately so it never gets treated as a field to save.
    const { employee_id, complete_setup, ...fields } = body;
    if (!(await canView(req.session, employee_id))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const isSelfEdit = req.session?.employee_id === employee_id;
    const isTrusted = FULL_VISIBILITY_ROLES.has(req.session?.role);

    // Self-service path: Employee/Team Lead/Main Lead/Finance editing
    // their own record. Administrator/HR/Director editing their own record
    // falls through to the normal direct-write path below instead —
    // they're the ones who'd be approving a request anyway.
    if (isSelfEdit && !isTrusted) {
      const disallowed = Object.keys(fields).filter((k) => !SELF_SERVICE_FIELDS.includes(k));
      if (disallowed.length > 0) {
        res.status(403).json({ error: `Not allowed to self-edit: ${disallowed.join(', ')}` });
        return;
      }

      const [current] = await sql`SELECT * FROM employees WHERE employee_id = ${employee_id}`;
      if (!current) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      if (!current.profile_setup_completed_at) {
        // Still onboarding — the first fill-in applies directly, no
        // sign-off needed (there's nothing to compare it against yet;
        // this *is* the baseline the request flow will diff against from
        // here on).
        try {
          let merged = await updateEmployeeFields(employee_id, fields);
          if (complete_setup) {
            merged = await markProfileSetupComplete(sql, employee_id);
          }
          res.status(200).json({ employee: merged });
        } catch (err) {
          res.status(400).json({ error: `Update failed: ${err.message}` });
        }
        return;
      }

      // Setup's already done — every further change needs HR sign-off
      // instead of applying immediately.
      const changed = {};
      for (const [key, value] of Object.entries(fields)) {
        const normalized = value === '' ? null : value;
        if ((current[key] ?? null) !== normalized) changed[key] = value;
      }
      if (Object.keys(changed).length === 0) {
        res.status(200).json({ employee: formatEmployee(current), no_changes: true });
        return;
      }
      try {
        const request = await createChangeRequest(sql, {
          employeeId: employee_id,
          requestType: 'profile',
          payload: {
            old: Object.fromEntries(Object.keys(changed).map((k) => [k, current[k]])),
            new: changed,
          },
        });
        res.status(202).json({ submitted: true, request });
      } catch (err) {
        res.status(400).json({ error: `Request failed: ${err.message}` });
      }
      return;
    }

    // Editing someone else, or a trusted role editing their own record —
    // direct-write behaviour. Still has to honour complete_setup here too:
    // a trusted role (Administrator/Director/HR) going through their OWN
    // first-login setup hits exactly this branch, since isSelfEdit &&
    // isTrusted skips the self-service branch above entirely. Missing
    // this used to leave profile_setup_completed_at permanently NULL for
    // any trusted-role account's first login — the "Finish setup" button
    // would save fine but never actually clear the onboarding gate,
    // trapping them on the Setup screen with no way out.
    try {
      let merged = await updateEmployeeFields(employee_id, fields);
      if (!merged) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (complete_setup) {
        merged = await markProfileSetupComplete(sql, employee_id);
      }
      res.status(200).json({ employee: merged });
    } catch (err) {
      res.status(400).json({ error: `Update failed: ${err.message}` });
    }
    return;
  }

  // Genuinely destructive — cascades to salary_history/promotion_history/
  // skills/documents/disciplinary_records (all ON DELETE CASCADE onto
  // employees, see db/schema.sql), with no undo. For anyone who's actually
  // left, set employment_status to Terminated/Resigned instead (PATCH) —
  // that already drops them out of the default Directory/Org Chart views
  // while keeping their history. Reserve DELETE for records that should
  // never have existed (test data, duplicates). Administrator only.
  if (req.method === 'DELETE') {
    if (req.session?.role !== 'Administrator') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const [row] = await sql`DELETE FROM employees WHERE employee_id = ${id} RETURNING employee_id`;
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
