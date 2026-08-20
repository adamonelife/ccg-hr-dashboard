// lib/permissions.mjs — visibility scoping (Phase 3).
//
// Three tiers, low to high:
//   1. Everyone else (Employee/Team Lead/Main Lead) — org-chart/lead-based,
//      not the manager_id reporting chain: a Team's lead sees that team; a
//      Department's lead sees everyone in every unit nested under that
//      department (all its teams, and any sub-departments); scales up the
//      same way to Company/Group. This matches org_units.lead_employee_id
//      (see db/schema.sql and the "Assign lead" control on the Org Chart
//      page) rather than requiring a second, separate hierarchy to
//      maintain.
//   2. STAFF_MANAGEMENT_ROLES (HR, Finance) — everyone in tier 1 plus
//      broad, org-chart-independent visibility for day-to-day HR/finance
//      work, minus RESTRICTED_TARGET_ROLES (Director/Administrator —
//      "Operations + Executive" in Adam's words). Leadership's own HR data
//      stays between leadership.
//   3. UNRESTRICTED_VISIBILITY_ROLES (Administrator, Director) — no
//      restriction at all, literally everyone including each other.
//
// Scope of what this actually gates today: the single-employee GET
// (lib/employees.mjs), skills (lib/skills.mjs), and leave requests/balances
// (lib/leave.mjs). lib/documents.mjs has its own, deliberately non-org-
// chart-scoped visibility function for the same reason tier 1 doesn't
// apply there (a Team Lead doesn't get their team's personal documents
// just for being a lead) — but reuses RESTRICTED_TARGET_ROLES below so the
// Director/Administrator exclusion stays identical everywhere. The
// Directory list and Org Chart tree structure itself are NOT scoped by
// this — everyone authenticated still sees the full list/tree (names,
// titles, departments — not sensitive detail), just not full record/card/
// leave/document/change-request access outside their tier.

import { getSql } from './db.mjs';

// Two-tier model (the second tier added per Adam's explicit spec: "HR and
// Finance should see all staff/leave/documents/change-requests, but not
// anyone above them in the org chart — Operations + Executive," which
// translates to "not anyone with permission_role Director or
// Administrator"):
//
//   - UNRESTRICTED_VISIBILITY_ROLES: zero restriction, see/manage
//     literally everyone including each other. Same two roles that can
//     edit org structure (lib/org.mjs's MUTATE_ROLES) — whoever can
//     rearrange the org chart can also see everyone in it.
//   - STAFF_MANAGEMENT_ROLES: broad, org-chart-independent access to
//     staff data for day-to-day HR/finance work (Employee Card/Skills,
//     Leave, Documents, Change requests) — a superset of
//     UNRESTRICTED_VISIBILITY_ROLES, but HR/Finance specifically never
//     see a Director's or Administrator's own record (enforced inside
//     getVisibleEmployeeIds below, not by excluding them from this set —
//     they still get everyone else).
export const UNRESTRICTED_VISIBILITY_ROLES = new Set(['Administrator', 'Director']);
export const STAFF_MANAGEMENT_ROLES = new Set(['Administrator', 'Director', 'HR', 'Finance']);

// Roles a STAFF_MANAGEMENT_ROLES viewer never gets visibility into,
// regardless of the check above — leadership's own HR data stays between
// leadership, not visible to the HR/Finance staff who administratively
// support them. Exported so lib/documents.mjs (which has its own,
// deliberately non-org-chart-scoped visibility function) can apply the
// exact same exclusion rather than redefining it.
export const RESTRICTED_TARGET_ROLES = new Set(['Director', 'Administrator']);

// Separate from STAFF_MANAGEMENT_ROLES on purpose — this answers a
// different question: "does editing MY OWN profile/skills apply directly,
// or does it need HR sign-off" (lib/employees.mjs, lib/skills.mjs's
// isTrusted checks; also change-requests.mjs's "who's exempt from ever
// submitting a request for their own record"). Finance stays out of this
// one deliberately — Finance's own edits still go through approval, same
// as before this change; being trusted to *review* others' requests
// (STAFF_MANAGEMENT_ROLES, see lib/change-requests.mjs) doesn't
// automatically make someone exempt from the process for their own record.
export const FULL_VISIBILITY_ROLES = new Set(['Administrator', 'Director', 'HR']);

// True if `session` has unscoped visibility into the flat/no-employeeId
// views (e.g. lib/skills.mjs's all-skills listing).
export function canViewAll(session) {
  return Boolean(session && STAFF_MANAGEMENT_ROLES.has(session.role));
}

// Every employee_id `session` can see, or null meaning "all of them, no
// exceptions" (UNRESTRICTED_VISIBILITY_ROLES only — HR/Finance always get
// a real array back, even though it's usually nearly everyone, precisely
// because there IS an exception for them). Empty array (not null) means
// "nobody but themselves" — always include their own id separately where
// relevant, since this only computes the org-chart-lead portion of
// visibility for everyone outside the two special-cased tiers above.
export async function getVisibleEmployeeIds(session) {
  if (!session) return [];
  if (UNRESTRICTED_VISIBILITY_ROLES.has(session.role)) return null;

  const sql = getSql();

  // HR/Finance: broad and flat (not org-chart scoped, unlike the lead-based
  // query below) — everyone except Director/Administrator records.
  if (STAFF_MANAGEMENT_ROLES.has(session.role)) {
    const rows = await sql`
      SELECT employee_id FROM employees
      WHERE permission_role NOT IN ('Director', 'Administrator')
    `;
    return rows.map((r) => r.employee_id);
  }

  if (!session.employee_id) return [];

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
