// db/migrate-from-sheets.mjs
//
// One-time migration: copies whatever's currently in the HR Google Sheet
// into Postgres. Safe to run against an empty/partially-filled sheet —
// tabs with no data rows just migrate nothing, no error.
//
// NOT part of the deployed app — run manually, once, from your own
// machine, after schema.sql has been applied and DATABASE_URL is set:
//
//   DATABASE_URL=... HR_SHEET_ID=... GOOGLE_CLIENT_EMAIL=... GOOGLE_PRIVATE_KEY='...' \
//     node db/migrate-from-sheets.mjs
//
// (export those into your shell first, or prefix the command with them as
// shown — whatever's easiest. All four are required.)
//
// Order matters: org_units before employees (employees.department/team are
// FKs into org_units), employees before salary_history/promotion_history/
// skills (all FK into employees). Within org_units and employees, rows are
// inserted first with their self-referential FK (parent_unit_name /
// manager_id) left NULL, then updated in a second pass — avoids having to
// figure out topological insert order by hand or rely on row order in the
// sheet.
//
// Re-runnable: org_units and employees upsert on their primary key, so
// running this twice (e.g. after fixing a typo in the sheet) won't create
// duplicates. salary_history/promotion_history/skills are append-only logs
// with no natural unique key to upsert on, so re-running WILL duplicate
// those three if they already had rows in Postgres from a prior run —
// fine for a first migration onto an empty database, just don't run it
// twice against a database that's already got real history rows in it.

import { readRange, rowsToObjects } from '../lib/sheets-client.mjs';
import { getSql, nullifyEmpty } from '../lib/db.mjs';

const sheetId = process.env.HR_SHEET_ID;
if (!sheetId) {
  console.error('HR_SHEET_ID not set');
  process.exit(1);
}

const sql = getSql();

function parseBool(v) {
  return v === true || v === 'TRUE';
}

async function migrateOrgUnits() {
  const rows = await readRange(sheetId, 'OrgUnits!A2:C');
  const units = rowsToObjects(['unit_type', 'unit_name', 'parent_unit_name'], rows).filter((u) => u.unit_name);
  console.log(`OrgUnits: ${units.length} rows found`);

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
  console.log('OrgUnits migrated.');
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

async function migrateEmployees() {
  const rows = await readRange(sheetId, 'Employees!A2:AI'); // 35 headers -> column AI
  const employees = rowsToObjects(EMPLOYEE_HEADERS, rows).filter((e) => e.employee_id);
  console.log(`Employees: ${employees.length} rows found`);

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
  console.log('Employees migrated.');
}

async function migrateSalaryHistory() {
  const rows = await readRange(sheetId, 'SalaryHistory!A2:G');
  const entries = rowsToObjects(
    ['employee_id', 'effective_date', 'amount', 'currency', 'reason', 'entered_by', 'entered_at'],
    rows
  ).filter((r) => r.employee_id);
  console.log(`SalaryHistory: ${entries.length} rows found`);
  for (const r of entries) {
    await sql`
      INSERT INTO salary_history (employee_id, effective_date, amount, currency, reason, entered_by)
      VALUES (
        ${r.employee_id}, ${r.effective_date}, ${r.amount}, ${r.currency || 'IDR'},
        ${nullifyEmpty(r.reason)}, ${nullifyEmpty(r.entered_by)}
      )
    `;
  }
  console.log('SalaryHistory migrated.');
}

async function migratePromotionHistory() {
  const rows = await readRange(sheetId, 'PromotionHistory!A2:G');
  const entries = rowsToObjects(
    ['employee_id', 'date', 'previous_title', 'new_title', 'notes', 'entered_by', 'entered_at'],
    rows
  ).filter((r) => r.employee_id);
  console.log(`PromotionHistory: ${entries.length} rows found`);
  for (const r of entries) {
    await sql`
      INSERT INTO promotion_history (employee_id, promotion_date, previous_title, new_title, notes, entered_by)
      VALUES (
        ${r.employee_id}, ${r.date}, ${nullifyEmpty(r.previous_title)}, ${r.new_title},
        ${nullifyEmpty(r.notes)}, ${nullifyEmpty(r.entered_by)}
      )
    `;
  }
  console.log('PromotionHistory migrated.');
}

async function migrateSkills() {
  const rows = await readRange(sheetId, 'Skills!A2:F');
  const entries = rowsToObjects(['employee_id', 'category', 'item', 'level', 'notes', 'added_at'], rows).filter(
    (r) => r.employee_id
  );
  console.log(`Skills: ${entries.length} rows found`);
  for (const r of entries) {
    await sql`
      INSERT INTO skills (employee_id, category, item, level, notes)
      VALUES (${r.employee_id}, ${r.category}, ${r.item}, ${nullifyEmpty(r.level)}, ${nullifyEmpty(r.notes)})
    `;
  }
  console.log('Skills migrated.');
}

async function main() {
  await migrateOrgUnits();
  await migrateEmployees();
  await migrateSalaryHistory();
  await migratePromotionHistory();
  await migrateSkills();
  await sql.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
