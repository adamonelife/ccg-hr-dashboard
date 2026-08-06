// lib/org.mjs — Organisation Structure (Phase 1).
//
// Two read views built from the same data: a Company -> Department -> Team
// tree (from the `org_units` table, so structure exists even for teams with
// no one staffed yet), and flat reporting lines (from each employee's
// manager_id). handleOrgUnits also supports create/assign-lead/delete now —
// there's no Sheet to edit by hand anymore, so this is how new
// companies/departments/teams get added and how a lead gets assigned to a
// unit.

import { getSql } from './db.mjs';
import { loadAllEmployees, isActive } from './employees.mjs';

export const UNIT_TYPES = ['Group', 'Company', 'Department', 'Team'];

// Shared by handleOrgChart and handleOrgUnits so both read org_units the
// same way.
export async function loadOrgUnits() {
  const sql = getSql();
  return sql`
    SELECT unit_type, unit_name, parent_unit_name, lead_employee_id
    FROM org_units
    ORDER BY unit_name
  `;
}

export async function handleOrgChart(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const [units, allEmployees] = await Promise.all([loadOrgUnits(), loadAllEmployees()]);

  const active = allEmployees.filter(isActive);
  const byId = Object.fromEntries(active.map((e) => [e.employee_id, e]));

  const byTeam = {};
  for (const e of active) {
    if (!e.team) continue;
    (byTeam[e.team] ||= []).push({
      employee_id: e.employee_id,
      full_name: e.full_name,
      nickname: e.nickname,
      job_title: e.job_title,
    });
  }

  const byParent = {};
  for (const u of units) {
    const key = u.parent_unit_name || '__root__';
    (byParent[key] ||= []).push(u);
  }

  function buildNode(unit) {
    const lead = unit.lead_employee_id ? byId[unit.lead_employee_id] : null;
    return {
      type: unit.unit_type,
      name: unit.unit_name,
      lead_employee_id: unit.lead_employee_id,
      lead_name: lead ? lead.nickname || lead.full_name : null,
      members: unit.unit_type === 'Team' ? byTeam[unit.unit_name] || [] : [],
      children: (byParent[unit.unit_name] || []).map(buildNode),
    };
  }

  const tree = (byParent['__root__'] || []).map(buildNode);

  const reportingLines = active
    .filter((e) => e.manager_id)
    .map((e) => ({
      employee_id: e.employee_id,
      full_name: e.full_name,
      nickname: e.nickname,
      job_title: e.job_title,
      manager_id: e.manager_id,
      manager_name: byId[e.manager_id]?.full_name || null,
      manager_nickname: byId[e.manager_id]?.nickname || null,
    }));

  res.status(200).json({ tree, reportingLines });
}

// Flat department/team name lists (powers the department/team dropdowns on
// the Employee form), plus the full unit list with type/parent/lead (powers
// the org-structure management UI on the Org Chart page) — and create/
// assign-lead/delete for that same UI, since there's no Sheet to hand-edit
// anymore.
// Create/assign-lead/delete all gated the same way — Administrator +
// Director only (matches Directory.jsx's "Operations and Executives" tier).
const MUTATE_ROLES = new Set(['Administrator', 'Director']);

export async function handleOrgUnits(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const units = await loadOrgUnits();
    res.status(200).json({
      companies: units.filter((u) => u.unit_type === 'Company').map((u) => u.unit_name),
      departments: units.filter((u) => u.unit_type === 'Department').map((u) => u.unit_name),
      teams: units.filter((u) => u.unit_type === 'Team').map((u) => u.unit_name),
      units,
    });
    return;
  }

  // Everything past this point mutates org structure — reachable by
  // anyone authenticated at the route level (see api/[[...path]].mjs), so
  // check role here instead. Not relevant with Adam as the only login
  // today, but keeps this safe once Phase 3 multi-user login lands.
  if (!MUTATE_ROLES.has(req.session?.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.unit_name || !body.unit_type) {
      res.status(400).json({ error: 'unit_name and unit_type are required' });
      return;
    }
    if (!UNIT_TYPES.includes(body.unit_type)) {
      res.status(400).json({ error: `unit_type must be one of: ${UNIT_TYPES.join(', ')}` });
      return;
    }
    try {
      const [row] = await sql`
        INSERT INTO org_units (unit_name, unit_type, parent_unit_name, lead_employee_id)
        VALUES (
          ${body.unit_name},
          ${body.unit_type},
          ${body.parent_unit_name || null},
          ${body.lead_employee_id || null}
        )
        RETURNING *
      `;
      res.status(201).json({ unit: row });
    } catch (err) {
      res.status(400).json({ error: `Create failed: ${err.message}` });
    }
    return;
  }

  // Assign/change/clear a unit's lead. Deliberately the only thing PATCH
  // touches — renaming a unit or reparenting it safely needs cascading the
  // change into every employee.department/team/team-string that points at
  // the old name, which isn't built yet. Delete + recreate for those.
  if (req.method === 'PATCH') {
    const body = req.body || {};
    if (!body.unit_name) {
      res.status(400).json({ error: 'unit_name is required' });
      return;
    }
    try {
      const [row] = await sql`
        UPDATE org_units SET lead_employee_id = ${body.lead_employee_id || null}
        WHERE unit_name = ${body.unit_name}
        RETURNING *
      `;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json({ unit: row });
    } catch (err) {
      res.status(400).json({ error: `Update failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { unit_name } = req.query;
    if (!unit_name) {
      res.status(400).json({ error: 'unit_name is required' });
      return;
    }
    try {
      const [row] = await sql`DELETE FROM org_units WHERE unit_name = ${unit_name} RETURNING unit_name`;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      // Most likely cause: this unit still has child units under it
      // (parent_unit_name is ON DELETE RESTRICT on purpose) — Postgres's
      // error message says as much, passed straight through.
      res.status(400).json({ error: `Delete failed: ${err.message}` });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
