// lib/migrate.mjs — copies whatever's in the HR Google Sheet into Postgres.
//
// Two ways to run this:
//   1. GET /api/admin/migrate-from-sheets, while logged in as an
//      administrator — reads HR_SHEET_ID / GOOGLE_CLIENT_EMAIL /
//      GOOGLE_PRIVATE_KEY / DATABASE_URL straight from Vercel's own env
//      vars, same as every other route already does. No local Node/Terminal
//      needed — just visit the URL in a browser tab while logged in. This
//      is the recommended way; see SETUP.md.
//   2. db/migrate-from-sheets.mjs as a CLI script, for anyone who does have
//      Node locally and would rather run it from Terminal.
//
// Safety: refuses to run if the employees table already has rows in it.
// org_units/employees upsert safely on their primary key, so a re-run of
// those alone would be fine — but salary_history/promotion_history/skills
// are plain append-only logs with no natural unique key, so a second run
// would duplicate every row in those three tables. If you genuinely need
// to re-run this against a database that already has data (e.g. you fixed
// a typo in the Sheet after a first migration), clear the affected tables
// first or ask Claude for a targeted version rather than running this
// again as-is.
//
// Order matters: org_units before employees (employees.department/team are
// FKs into org_units), employees before salary_history/promotion_history/
// skills (all FK into employees). Within org_units and employees, rows are
// inserted first with their self-referential FK (parent_unit_name /
// manager_id) left NULL, then updated in a second pass — avoids having to
// figure out topological insert order by hand.

import { readRange, rowsToObjects } from './sheets-client.mjs';
import { getSql, nullifyEmpty } from './db.mjs';

function parseBool(v) {
  return v === true || v === 'TRUE';
}

const EMPLOYEE_HEADERS = [
  'employee_id', 'full_name', 'nickname', 'photo_url', 'email', 'phone',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
  'date_of_birth', 'nationality', 'religion', 'employment_status', 'start_date', 'end_date',
  'company', 'department', 'job_title', 'team', 'manager_id', 'office_location',
  'employment_type', 'contract_type', 'contract_start', 'contract_end', 'probation_end_date',
  'current_salary', 'salary_currency', 'bonus_eligible', 'kitas_expiry', 'passport_expiry',
  'work_permit_expiry', 'permission_role', 'created_at', 'updated_at',
];

async function migrateOrgUnits(sql, sheetId) {
  const rows = await readRange(sheetId, 'OrgUnits!A2:C');
  const units = rowsToObjects(['unit_type', 'unit_name', 'parent_unit_name'], rows).filter((u) => u.unit_name);

  for (const u of units) {
    await sql`
      INSERT INTO org_units (unit_name, unit_type)
      VALUES (${u.unit_name}, ${u.unit_type})
      ON CONFLICT (unit_name) DO UPDATE SET unit_type = EXCLUDED.unit_type
    `;
  }
  for (const u of units) {
    if (!u.parent_unit_name) continue;
    await sql`UPDATE org_units SET parent_unit_name = ${u.parent_unit_name} WHERE unit_name = ${u.unit_name}`;
  }
  return units.length;
}

async function migrateEmployees(sql, sheetId) {
  const rows = await readRange(sheetId, 'Employees!A2:AI');
  const employees = rowsToObjects(EMPLOYEE_HEADERS, rows).filter((e) => e.employee_id);

  for (const e of employees) {
    const record = {
      employee_id: e.employee_id,
      full_name: e.full_name,
      nickname: nullifyEmpty(e.nickname),
      photo_url: nullifyEmpty(e.photo_url),
      email: nullifyEmpty(e.email),
      phone: nullifyEmpty(e.phone),
      emergency_contact_name: nullifyEmpty(e.emergency_contact_name),
      emergency_contact_phone: nullifyEmpty(e.emergency_contact_phone),
      emergency_contact_relationship: nullifyEmpty(e.emergency_contact_relationship),
      date_of_birth: nullifyEmpty(e.date_of_birth),
      nationality: nullifyEmpty(e.nationality),
      religion: nullifyEmpty(e.religion),
      employment_status: e.employment_status || 'Active',
      start_date: nullifyEmpty(e.start_date),
      end_date: nullifyEmpty(e.end_date),
      company: nullifyEmpty(e.company),
      department: nullifyEmpty(e.department),
      job_title: nullifyEmpty(e.job_title),
      team: nullifyEmpty(e.team),
      office_location: nullifyEmpty(e.office_location),
      employment_type: nullifyEmpty(e.employment_type),
      contract_type: nullifyEmpty(e.contract_type),
      contract_start: nullifyEmpty(e.contract_start),
      contract_end: nullifyEmpty(e.contract_end),
      probation_end_date: nullifyEmpty(e.probation_end_date),
      current_salary: nullifyEmpty(e.current_salary),
      salary_currency: nullifyEmpty(e.salary_currency),
      bonus_eligible: parseBool(e.bonus_eligible),
      kitas_expiry: nullifyEmpty(e.kitas_expiry),
      passport_expiry: nullifyEmpty(e.passport_expiry),
      work_permit_expiry: nullifyEmpty(e.work_permit_expiry),
      permission_role: e.permission_role || 'Employee',
    };
    await sql`
      INSERT INTO employees ${sql(record)}
      ON CONFLICT (employee_id) DO UPDATE SET ${sql(record)}
    `;
  }
  for (const e of employees) {
    if (!e.manager_id) continue;
    await sql`UPDATE employees SET manager_id = ${e.manager_id} WHERE employee_id = ${e.employee_id}`;
  }
  return employees.length;
}

async function migrateSalaryHistory(sql, sheetId) {
  const rows = await readRange(sheetId, 'SalaryHistory!A2:G');
  const entries = rowsToObjects(
    ['employee_id', 'effective_date', 'amount', 'currency', 'reason', 'entered_by', 'entered_at'],
    rows
  ).filter((r) => r.employee_id);
  for (const r of entries) {
    await sql`
      INSERT INTO salary_history (employee_id, effective_date, amount, currency, reason, entered_by)
      VALUES (
        ${r.employee_id}, ${r.effective_date}, ${r.amount}, ${r.currency || 'IDR'},
        ${nullifyEmpty(r.reason)}, ${nullifyEmpty(r.entered_by)}
      )
    `;
  }
  return entries.length;
}

async function migratePromotionHistory(sql, sheetId) {
  const rows = await readRange(sheetId, 'PromotionHistory!A2:G');
  const entries = rowsToObjects(
    ['employee_id', 'date', 'previous_title', 'new_title', 'notes', 'entered_by', 'entered_at'],
    rows
  ).filter((r) => r.employee_id);
  for (const r of entries) {
    await sql`
      INSERT INTO promotion_history (employee_id, promotion_date, previous_title, new_title, notes, entered_by)
      VALUES (
        ${r.employee_id}, ${r.date}, ${nullifyEmpty(r.previous_title)}, ${r.new_title},
        ${nullifyEmpty(r.notes)}, ${nullifyEmpty(r.entered_by)}
      )
    `;
  }
  return entries.length;
}

async function migrateSkills(sql, sheetId) {
  const rows = await readRange(sheetId, 'Skills!A2:F');
  const entries = rowsToObjects(['employee_id', 'category', 'item', 'level', 'notes', 'added_at'], rows).filter(
    (r) => r.employee_id
  );
  for (const r of entries) {
    await sql`
      INSERT INTO skills (employee_id, category, item, level, notes)
      VALUES (${r.employee_id}, ${r.category}, ${r.item}, ${nullifyEmpty(r.level)}, ${nullifyEmpty(r.notes)})
    `;
  }
  return entries.length;
}

export async function runMigration() {
  const sheetId = process.env.HR_SHEET_ID;
  if (!sheetId) {
    throw new Error('HR_SHEET_ID not configured');
  }

  const sql = getSql();

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM employees`;
  if (count > 0) {
    throw new Error(
      `employees table already has ${count} row(s) — refusing to run again to avoid duplicating ` +
        'salary/promotion history and skills. Already migrated?'
    );
  }

  return {
    orgUnits: await migrateOrgUnits(sql, sheetId),
    employees: await migrateEmployees(sql, sheetId),
    salaryHistory: await migrateSalaryHistory(sql, sheetId),
    promotionHistory: await migratePromotionHistory(sql, sheetId),
    skills: await migrateSkills(sql, sheetId),
  };
}

// One-time admin endpoint — GET so it can just be visited as a URL in a
// browser tab while logged in, no Terminal/Node required. Gated by
// requireRole('administrator') in api/[[...path]].mjs.
export async function handleMigrateFromSheets(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const summary = await runMigration();
    res.status(200).json({ ok: true, summary });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}
