// lib/skills.mjs — powers the Employee Card ("baseball card") view.
//
// Backed by the `skills` table: one row per skill/certification/language/
// training/career-path entry, same append-only pattern as salary_history
// and promotion_history. `category` is what distinguishes what kind of
// entry a row is — see CATEGORIES below.
//
// This table only ever existed as Sheets code in zips that were never
// pushed to GitHub — there's no live Sheets data to migrate for it, so
// db/migrate-from-sheets.mjs handles it defensively (migrates whatever's
// there, migrates nothing if the tab's empty/never existed).

import { getSql, formatTimestamp } from './db.mjs';
import { canView, canViewAll } from './permissions.mjs';

// Skills rows are only ever addressed by numeric id from PATCH/DELETE — look
// up which employee a given row belongs to so canView() has something to
// check against.
async function employeeIdForSkill(sql, id) {
  const [row] = await sql`SELECT employee_id FROM skills WHERE id = ${id}`;
  return row?.employee_id || null;
}

// 'Design Discipline' added for the three-checkbox Architecture/Landscape/
// Interior widget on the Employee Card (src/pages/EmployeeCard.jsx) — it's
// a real category here so POST/PATCH validation accepts it, but the
// frontend deliberately doesn't offer it in the generic "Add skill" form;
// only the dedicated widget creates/edits rows in this category, so it
// stays exactly Architecture/Landscape/Interior with no stray free-text
// entries under it.
export const CATEGORIES = [
  'Design Discipline',
  'Software Skill',
  'Technical Skill',
  'Soft Skill',
  'Language',
  'Certification',
  'Training Completed',
  'Training Required',
  'Career Path',
];

function formatSkill(row) {
  return { ...row, added_at: formatTimestamp(row.added_at) };
}

// Widens the category CHECK constraint to include 'Design Discipline'.
// Idempotent (drop-if-exists then re-add), run defensively on every
// request rather than requiring a separate migration visit — same
// self-healing pattern as lib/documents.mjs's CREATE TABLE IF NOT EXISTS,
// adopted after the org_units.sort_order incident (code shipped ahead of
// a schema change nobody had triggered yet). `skills_category_check` is
// Postgres's default auto-generated name for an inline, unnamed CHECK on
// that column — same convention already relied on for
// `employees_religion_check` earlier in this project.
// Module-level flag so this only actually runs once per warm serverless
// instance, not on every single request — cheap insurance either way, but
// no reason to pay two extra round trips per call once it's already done.
let _designDisciplineEnsured = false;
async function ensureDesignDisciplineCategory(sql) {
  if (_designDisciplineEnsured) return;
  await sql`ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_category_check`;
  await sql`
    ALTER TABLE skills ADD CONSTRAINT skills_category_check CHECK (category IN (
      'Design Discipline', 'Software Skill', 'Technical Skill', 'Soft Skill', 'Language',
      'Certification', 'Training Completed', 'Training Required', 'Career Path'
    ))
  `;
  _designDisciplineEnsured = true;
}

export async function handleSkills(req, res) {
  const sql = getSql();
  await ensureDesignDisciplineCategory(sql);

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    if (employeeId) {
      if (!(await canView(req.session, employeeId))) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      const rows = await sql`SELECT * FROM skills WHERE employee_id = ${employeeId} ORDER BY added_at`;
      res.status(200).json({ skills: rows.map(formatSkill) });
      return;
    }
    if (!canViewAll(req.session)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const rows = await sql`SELECT * FROM skills ORDER BY added_at`;
    res.status(200).json({ skills: rows.map(formatSkill) });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.category || !body.item) {
      res.status(400).json({ error: 'employee_id, category and item are required' });
      return;
    }
    if (!CATEGORIES.includes(body.category)) {
      res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
      return;
    }
    if (!(await canView(req.session, body.employee_id))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    try {
      const [row] = await sql`
        INSERT INTO skills (employee_id, category, item, level, notes)
        VALUES (${body.employee_id}, ${body.category}, ${body.item}, ${body.level || null}, ${body.notes || null})
        RETURNING *
      `;
      res.status(201).json({ entry: formatSkill(row) });
    } catch (err) {
      res.status(400).json({ error: `Insert failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    if (!body.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    if (body.category && !CATEGORIES.includes(body.category)) {
      res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
      return;
    }
    const fields = {};
    for (const col of ['category', 'item', 'level', 'notes']) {
      if (body[col] !== undefined) fields[col] = body[col] || null;
    }
    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    const owner = await employeeIdForSkill(sql, body.id);
    if (!owner) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!(await canView(req.session, owner))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    try {
      const [row] = await sql`UPDATE skills SET ${sql(fields)} WHERE id = ${body.id} RETURNING *`;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json({ entry: formatSkill(row) });
    } catch (err) {
      res.status(400).json({ error: `Update failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const owner = await employeeIdForSkill(sql, id);
    if (!owner) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!(await canView(req.session, owner))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const [row] = await sql`DELETE FROM skills WHERE id = ${id} RETURNING id`;
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
