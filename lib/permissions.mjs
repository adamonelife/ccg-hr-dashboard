// lib/permissions.mjs — org-chart/lead-based visibility scoping (Phase 3).
//
// "Who can see whose card/profile/leave data" follows the org chart, not
// the manager_id reporting chain: a Team's lead sees that team; a
// Department's lead sees everyone in every unit nested under that
// department (all its teams, and any sub-departments); scales up the same
// way to Company/Group. This matches org_units.lead_employee_id (see
// db/schema.sql and the "Assign lead" control on the Org Chart page)
// rather than requiring a second, separate hierarchy to maintain.
//
// Scope of what this actually gates today: the single-employee GET
// (lib/employees.mjs), skills (lib/skills.mjs), and leave requests/balances
// (lib/leave.mjs). The Directory list and Org Chart tree are NOT scoped by
// this — everyone authenticated still sees the full list/tree, just not
// full record/card/leave detail except within their scope (or for the
// full-visibility roles below).

import { getSql } from './db.mjs';

// Roles that can see anyone's card/profile/leave data, no scoping needed.
// Finance is deliberately left out — payroll access already has its own
// gate (salary-history's requireRole), and finance staff don't need
// general visibility into skills/personal/leave data on top of that.
// Exported (added when change-requests.mjs needed it too) — also doubles
// as "who can approve a self-service change request, and who's exempt
// from needing to submit one for their own record" there.
export const FULL_VISIBILITY_ROLES = new Set(['Administrator', 'Director', 'HR']);

// True if `session` has unscoped visibility.
export function canViewAll(session) {
  return Boolean(session && FULL_VISIBILITY_ROLES.has(session.role));
}

// Every employee_id `session` can see, or null meaning "all of them"
// (full-visibility roles). Empty array (not null) means "nobody but
// themselves" — always include their own id separately where relevant,
// since this only computes the org-chart-lead portion of visibility.
export async function getVisibleEmployeeIds(session) {
  if (!session) return [];
  if (FULL_VISIBILITY_ROLES.has(session.role)) return null;
  if (!session.employee_id) return [];

  const sql = getSql();
  const rows = await sql`
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
    SELECT e.employee_id
    FROM employees e
    WHERE e.team IN (SELECT unit_name FROM descendants)
       OR e.department IN (SELECT unit_name FROM descendants)
  `;
  return rows.map((r) => r.employee_id);
}

// True if `session` (req.session, from requireAuth) is allowed to view
// `targetEmployeeId`'s card/profile/leave data.
export async function canView(session, targetEmployeeId) {
  if (!session) return false;
  if (session.employee_id && session.employee_id === targetEmployeeId) return true;
  const visible = await getVisibleEmployeeIds(session);
  if (visible === null) return true;
  return visible.includes(targetEmployeeId);
}
