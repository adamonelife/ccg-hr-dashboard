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
import { canView, getVisibleEmployeeIds } from './permissions.mjs';
import { PROMOTION_ROLES } from '../shared/employee-policy.mjs';

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
  if (!PROMOTION_ROLES.includes(req.session?.role)) {
    res.status(403).json({ error: 'Insufficient permissions' }); return;
  }

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    if (employeeId && !(await canView(req.session, employeeId))) {
      res.status(403).json({ error: 'Insufficient permissions' }); return;
    }
    const visible = await getVisibleEmployeeIds(req.session);
    const rows = await sql`SELECT * FROM promotion_history
      WHERE ${employeeId ? sql`employee_id = ${employeeId}` : sql`TRUE`}
        AND ${visible === null ? sql`TRUE` : sql`employee_id = ANY(${visible})`}
      ORDER BY promotion_date`;
    res.status(200).json({ history: rows.map(formatEntry) });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.date || !body.new_title) {
      res.status(400).json({ error: 'employee_id, date and new_title are required' });
      return;
    }
    try {
      const row = await sql.begin(async tx => {
        const [target] = await tx`SELECT employee_id FROM employees WHERE employee_id = ${body.employee_id} FOR UPDATE`;
        if (!target) throw Object.assign(new Error('Not found'), { status: 404 });
        if (!(await canView(req.session, body.employee_id, tx))) throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
        const [entry] = await tx`INSERT INTO promotion_history (employee_id, promotion_date, previous_title, new_title, notes, entered_by)
          VALUES (${body.employee_id}, ${body.date}, ${body.previous_title || null}, ${body.new_title}, ${body.notes || null}, ${req.session.user || 'unknown'}) RETURNING *`;
        await updateEmployeeFields(body.employee_id, { job_title: body.new_title }, tx);
        return entry;
      });
      res.status(201).json({ entry: formatEntry(row) });
    } catch (err) {
      res.status(err.status || 400).json({ error: `Insert failed: ${err.message}` });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
