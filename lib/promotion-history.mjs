// lib/promotion-history.mjs — append-only promotion log (Phase 1: Employment).
//
// Backed by the `promotion_history` table. Adding an entry also updates
// job_title on the matching employees row.
//
// Note: the SQL column is `promotion_date`, not `date` — `date` is a
// Postgres type name and awkward as a bare column name. The API's JSON
// shape stays `date` (matching what the frontend already sends/expects) —
// this file is where that translation happens; nowhere else needs to know
// about it.

import { getSql, formatDate, formatTimestamp } from './db.mjs';
import { updateEmployeeFields } from './employees.mjs';

function formatEntry(row) {
  return {
    employee_id: row.employee_id,
    date: formatDate(row.promotion_date),
    previous_title: row.previous_title,
    new_title: row.new_title,
    notes: row.notes,
    entered_by: row.entered_by,
    entered_at: formatTimestamp(row.entered_at),
  };
}

export async function handlePromotionHistory(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    const rows = employeeId
      ? await sql`SELECT * FROM promotion_history WHERE employee_id = ${employeeId} ORDER BY promotion_date`
      : await sql`SELECT * FROM promotion_history ORDER BY promotion_date`;
    res.status(200).json({ history: rows.map(formatEntry) });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.date || !body.new_title) {
      res.status(400).json({ error: 'employee_id, date and new_title are required' });
      return;
    }
    let row;
    try {
      [row] = await sql`
        INSERT INTO promotion_history (employee_id, promotion_date, previous_title, new_title, notes, entered_by)
        VALUES (
          ${body.employee_id},
          ${body.date},
          ${body.previous_title || null},
          ${body.new_title},
          ${body.notes || null},
          ${req.session?.user || 'unknown'}
        )
        RETURNING *
      `;
    } catch (err) {
      res.status(400).json({ error: `Insert failed: ${err.message}` });
      return;
    }
    const entry = formatEntry(row);

    const updated = await updateEmployeeFields(body.employee_id, { job_title: body.new_title });
    if (!updated) {
      res.status(201).json({ entry, warning: `No employee found for ${body.employee_id}` });
      return;
    }
    res.status(201).json({ entry });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
