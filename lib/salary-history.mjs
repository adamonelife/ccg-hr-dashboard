// lib/salary-history.mjs — append-only salary log (Phase 1: Employment).
//
// Backed by the `salary_history` table. Adding an entry also updates
// current_salary/salary_currency on the matching employees row, so the
// directory always reflects the latest figure without a separate step.

import { getSql, formatDate, formatTimestamp } from './db.mjs';
import { updateEmployeeFields } from './employees.mjs';

function formatEntry(row) {
  return {
    ...row,
    effective_date: formatDate(row.effective_date),
    entered_at: formatTimestamp(row.entered_at),
  };
}

export async function handleSalaryHistory(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    const rows = employeeId
      ? await sql`SELECT * FROM salary_history WHERE employee_id = ${employeeId} ORDER BY effective_date`
      : await sql`SELECT * FROM salary_history ORDER BY effective_date`;
    res.status(200).json({ history: rows.map(formatEntry) });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.effective_date || body.amount === undefined || body.amount === '') {
      res.status(400).json({ error: 'employee_id, effective_date and amount are required' });
      return;
    }
    const currency = body.currency || 'IDR';
    let row;
    try {
      [row] = await sql`
        INSERT INTO salary_history (employee_id, effective_date, amount, currency, reason, entered_by)
        VALUES (
          ${body.employee_id},
          ${body.effective_date},
          ${body.amount},
          ${currency},
          ${body.reason || null},
          ${req.session?.user || 'unknown'}
        )
        RETURNING *
      `;
    } catch (err) {
      res.status(400).json({ error: `Insert failed: ${err.message}` });
      return;
    }
    const entry = formatEntry(row);

    const updated = await updateEmployeeFields(body.employee_id, {
      current_salary: body.amount,
      salary_currency: currency,
    });
    if (!updated) {
      // History entry is already saved; flag that the employee_id didn't
      // match anything so the caller knows current_salary wasn't synced.
      res.status(201).json({ entry, warning: `No employee found for ${body.employee_id}` });
      return;
    }
    res.status(201).json({ entry });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
