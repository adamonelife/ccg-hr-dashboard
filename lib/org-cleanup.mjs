// lib/org-cleanup.mjs — one-time-ish data fix for the org chart, requested
// after the fact (not something the general org-units CRUD covers on its
// own). Two things, both idempotent (safe to visit more than once):
//
//   1. Adds org_units.sort_order (nullable INTEGER) if it doesn't exist yet.
//      NULLs sort last in lib/org.mjs's loadOrgUnits() ORDER BY, so every
//      unit that never gets an explicit order keeps its previous
//      alphabetical position — nothing else moves.
//   2. Converts any unit still typed 'Company' to 'Team' — CC, CC Landscape
//      and Pelago are separate companies externally, but organisationally
//      they're just teams under Operations, per Adam's ask. (The DB's
//      unit_type CHECK constraint still allows 'Company' — not tightened,
//      just no longer offered in the "Add unit" dropdown — so this isn't a
//      one-way door if that distinction is wanted again later.)
//   3. Sets sort_order for the units directly under Operations so the
//      support functions (Finance/HR/Marketing/Office/Sales) come first
//      and the three creative companies (CC/CC Landscape/Pelago) group
//      together at the end, instead of the previous alphabetical order.
//
// Reachable at GET /api/admin/org-cleanup while logged in as an
// Administrator — same "just visit the URL" pattern as
// /api/admin/migrate-from-sheets, no local Node/Terminal needed.

import { getSql } from './db.mjs';

const OPERATIONS_ORDER = [
  ['Finance', 10],
  ['HR', 20],
  ['Marketing', 30],
  ['Office', 40],
  ['Sales', 50],
  ['CC', 60],
  ['CC Landscape', 70],
  ['Pelago', 80],
];

export async function runOrgCleanup() {
  const sql = getSql();

  await sql`ALTER TABLE org_units ADD COLUMN IF NOT EXISTS sort_order INTEGER`;

  const retyped = await sql`
    UPDATE org_units SET unit_type = 'Team' WHERE unit_type = 'Company'
    RETURNING unit_name
  `;

  const reordered = [];
  for (const [unitName, order] of OPERATIONS_ORDER) {
    const [row] = await sql`
      UPDATE org_units SET sort_order = ${order}
      WHERE unit_name = ${unitName}
      RETURNING unit_name
    `;
    if (row) reordered.push(unitName);
  }

  return {
    retyped_to_team: retyped.map((r) => r.unit_name),
    reordered,
    // Anything in OPERATIONS_ORDER that didn't match an existing
    // unit_name — worth surfacing rather than silently doing nothing,
    // in case a name was typo'd or doesn't exist yet.
    not_found: OPERATIONS_ORDER.map(([name]) => name).filter((name) => !reordered.includes(name)),
  };
}

export async function handleOrgCleanup(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const summary = await runOrgCleanup();
    res.status(200).json({ ok: true, summary });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}
