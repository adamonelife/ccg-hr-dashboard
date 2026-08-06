// lib/employees.mjs — Employee Directory + Employment (Phase 1).
//
// Backed by the `Employees` tab of the sheet at HR_SHEET_ID. Schema is
// documented in SETUP.md — keep EMPLOYEE_HEADERS in sync with the sheet's
// header row exactly (order and spelling matter, it's positional).

import { readRange, appendRow, updateRow, rowsToObjects, objectToRow, colLetter } from './sheets-client.mjs';

const TAB = 'Employees';

export const EMPLOYEE_HEADERS = [
  'employee_id',
  'full_name',
  'photo_url',
  'email',
  'phone',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'date_of_birth',
  'nationality',
  'religion',
  'employment_status',
  'start_date',
  'end_date',
  'company',
  'department',
  'job_title',
  'team',
  'team_lead_id',
  'main_lead_id',
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
  'role',
  'active',
  'created_at',
  'updated_at',
];

const LAST_COL = colLetter(EMPLOYEE_HEADERS.length);

function isActive(emp) {
  return emp.active !== 'FALSE' && emp.active !== false;
}

// Loads every employee row, tagging each with its actual sheet row number
// (_row) so callers can issue a targeted update later. _row is stripped
// before anything is sent back over the API.
export async function loadAllEmployees(sheetId) {
  const rows = await readRange(sheetId, `${TAB}!A2:${LAST_COL}`);
  return rowsToObjects(EMPLOYEE_HEADERS, rows)
    .map((obj, i) => ({ ...obj, _row: i + 2 }))
    .filter((obj) => obj.employee_id); // skip fully blank trailing rows
}

// Read-modify-write a single employee row by employee_id. Never touches
// any other row. Returns the merged record (without _row), or null if the
// employee_id doesn't exist.
export async function updateEmployeeFields(sheetId, employeeId, fields) {
  const all = await loadAllEmployees(sheetId);
  const existing = all.find((e) => e.employee_id === employeeId);
  if (!existing) return null;
  const merged = { ...existing, ...fields, updated_at: new Date().toISOString() };
  const row = merged._row;
  delete merged._row;
  await updateRow(sheetId, `${TAB}!A${row}:${LAST_COL}${row}`, objectToRow(EMPLOYEE_HEADERS, merged));
  return merged;
}

export async function handleEmployees(req, res) {
  const sheetId = process.env.HR_SHEET_ID;
  if (!sheetId) {
    res.status(500).json({ error: 'HR_SHEET_ID not configured' });
    return;
  }

  if (req.method === 'GET') {
    const all = await loadAllEmployees(sheetId);
    const { id } = req.query;
    if (id) {
      const emp = all.find((e) => e.employee_id === id);
      if (!emp) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const { _row, ...clean } = emp;
      res.status(200).json({ employee: clean });
      return;
    }
    const includeInactive = req.query.includeInactive === 'true';
    const list = (includeInactive ? all : all.filter(isActive)).map(({ _row, ...clean }) => clean);
    res.status(200).json({ employees: list });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.full_name) {
      res.status(400).json({ error: 'employee_id and full_name are required' });
      return;
    }
    const all = await loadAllEmployees(sheetId);
    if (all.some((e) => e.employee_id === body.employee_id)) {
      res.status(409).json({ error: `employee_id ${body.employee_id} already exists` });
      return;
    }
    const now = new Date().toISOString();
    const record = { active: 'TRUE', ...body, created_at: now, updated_at: now };
    await appendRow(sheetId, `${TAB}!A:${LAST_COL}`, objectToRow(EMPLOYEE_HEADERS, record));
    res.status(201).json({ employee: record });
    return;
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    if (!body.employee_id) {
      res.status(400).json({ error: 'employee_id is required' });
      return;
    }
    const { employee_id, ...fields } = body;
    const merged = await updateEmployeeFields(sheetId, employee_id, fields);
    if (!merged) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ employee: merged });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
