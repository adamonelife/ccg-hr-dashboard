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

export const CATEGORIES = [
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

export async function handleSkills(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    const rows = employeeId
      ? await sql`SELECT * FROM skills WHERE employee_id = ${employeeId} ORDER BY added_at`
      : await sql`SELECT * FROM skills ORDER BY added_at`;
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
