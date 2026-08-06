// lib/permissions.mjs — Employee Card / profile visibility scoping (Phase 3).
//
// "Who can see whose card" follows the org chart, not the manager_id
// reporting chain: a Team's lead sees that team; a Department's lead sees
// everyone in every unit nested under that department (all its teams, and
// any sub-departments); scales up the same way to Company/Group. This
// matches org_units.lead_employee_id (see db/schema.sql and the "Assign
// lead" control on the Org Chart page) rather than requiring a second,
// separate hierarchy to maintain.
//
// Scope of what this actually gates today: the single-employee GET
// (lib/employees.mjs) and skills (lib/skills.mjs) — i.e. the Employee Card
// and the "Edit full profile" page. The Directory list and Org Chart tree
// are NOT scoped by this — everyone authenticated still sees the full
// list/tree, just not full record and Employee Card except within
// their scope (or for the full-visibility roles below). Restricting the
// Directory/Org Chart themselves is a bigger, separate piece — see
// ROADMAP.md's permission model notes.

import { getSql } from './db.mjs';

// Roles that can see anyone's card/profile, no scoping needed. Finance is
// deliberately left out — payroll access already has its own gate
// (salary-history's requireRole), and finance staff don't need general
// visibility into skills/personal profile data on top of that.
const FULL_VISIBILITY_ROLES = new Set(['Administrator', 'Director', 'HR']);

// True if `session` has unscoped visibility (used to gate the rare
// "give me everyone's records/skills, no employeeId filter" calls).
export function canViewAll(session) {
  return Boolean(session && FULL_VISIBILITY_ROLES.has(session.role));
}

// True if `session` (req.session, from requireAuth) is allowed to view
// `targetEmployeeId`'s card/profile.
export async function canView(session, targetEmployeeId) {
  if (!session) return false;
  if (session.employee_id && session.employee_id === targetEmployeeId) return true;
  if (FULL_VISIBILITY_ROLES.has(session.role)) return true;
  if (!session.employee_id) return false; // master-admin bootstrap already covered above (role='Administrator')

  const sql = getSql();
  const [{ count }] = await sql`
    WITH RECURSIVE led_units AS (
      SELECT unit_name FROM org_units WHERE lead_employee_id = ${session.employee_id}
    ),
    descendants AS (
      SELECT unit_name FROM led_units
      UNION ALL
      SELECT ou.unit_name
      FROM org_units ou
      JOIN descendants d ON ou.parent_unit_name = d.unit_name
    )
    SELECT COUNT(*)::int AS count
    FROM employees e
    WHERE e.employee_id = ${targetEmployeeId}
      AND (
        e.team IN (SELECT unit_name FROM descendants)
        OR e.department IN (SELECT unit_name FROM descendants)
      )
  `;
  return count > 0;
}
