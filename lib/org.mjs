// lib/org.mjs — Organisation Structure (Phase 1).
//
// Two views built from the same data: a Company -> Department -> Team tree
// (from the `OrgUnits` tab, so structure exists even for teams with no one
// staffed yet), and flat reporting lines (from each employee's manager_id).

import { readRange, rowsToObjects } from './sheets-client.mjs';
import { loadAllEmployees, isActive } from './employees.mjs';

const UNIT_HEADERS = ['unit_type', 'unit_name', 'parent_unit_name'];

// Shared by handleOrgChart and handleOrgUnits so both read the OrgUnits tab
// the same way.
export async function loadOrgUnits(sheetId) {
  const unitRows = await readRange(sheetId, 'OrgUnits!A2:C');
  return rowsToObjects(UNIT_HEADERS, unitRows).filter((u) => u.unit_name);
}

export async function handleOrgChart(req, res) {
  const sheetId = process.env.HR_SHEET_ID;
  if (!sheetId) {
    res.status(500).json({ error: 'HR_SHEET_ID not configured' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const [units, allEmployees] = await Promise.all([loadOrgUnits(sheetId), loadAllEmployees(sheetId)]);

  const active = allEmployees.filter(isActive);

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
    return {
      type: unit.unit_type,
      name: unit.unit_name,
      members: unit.unit_type === 'Team' ? byTeam[unit.unit_name] || [] : [],
      children: (byParent[unit.unit_name] || []).map(buildNode),
    };
  }

  const tree = (byParent['__root__'] || []).map(buildNode);

  const byId = Object.fromEntries(active.map((e) => [e.employee_id, e]));
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

// Flat department/team name lists, sourced live from OrgUnits — powers the
// department/team dropdowns on the Employee form so they can't drift out of
// sync with the actual org structure. Deliberately lighter than
// handleOrgChart (skips loading every employee) since this only needs to
// populate two <select> option lists.
export async function handleOrgUnits(req, res) {
  const sheetId = process.env.HR_SHEET_ID;
  if (!sheetId) {
    res.status(500).json({ error: 'HR_SHEET_ID not configured' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const units = await loadOrgUnits(sheetId);
  res.status(200).json({
    companies: units.filter((u) => u.unit_type === 'Company').map((u) => u.unit_name),
    departments: units.filter((u) => u.unit_type === 'Department').map((u) => u.unit_name),
    teams: units.filter((u) => u.unit_type === 'Team').map((u) => u.unit_name),
  });
}
