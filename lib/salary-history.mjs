// lib/salary-history.mjs — append-only salary log (Phase 1: Employment).
//
// Backed by the `salary_history` table. Adding an entry also updates
// current_salary/salary_currency on the matching employees row, so the
// directory always reflects the latest figure without a separate step.

import { getSql, formatDate, formatTimestamp } from './db.mjs';
import { updateEmployeeFields } from './employees.mjs';
import { canView, getVisibleEmployeeIds } from './permissions.mjs';
import { SALARY_ROLES } from '../shared/employee-policy.mjs';

function formatEntry(row) {
  return {
    ...row,
    effective_date: formatDate(row.effective_date),
    entered_at: formatTimestamp(row.entered_at),
  };
}

export async function handleSalaryHistory(req, res) {
  const sql = getSql();
  if (!SALARY_ROLES.includes(req.session?.role)) {
    res.status(403).json({ error: 'Insufficient permissions' }); return;
  }

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    if (employeeId && !(await canView(req.session, employeeId))) {
      res.status(403).json({ error: 'Insufficient permissions' }); return;
    }
    const visible = await getVisibleEmployeeIds(req.session);
    const rows = await sql`SELECT * FROM salary_history
      WHERE ${employeeId ? sql`employee_id = ${employeeId}` : sql`TRUE`}
        AND ${visible === null ? sql`TRUE` : sql`employee_id = ANY(${visible})`}
      ORDER BY effective_date`;
    res.status(200).json({ history: rows.map(formatEntry) });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.effective_date || body.amount === undefined || body.amount === '') {
      res.status(400).json({ error: 'employee_id, effective_date and amount are required' });
      return;
    }
    try {
      const row = await sql.begin(async tx => {
        const [target] = await tx`SELECT employee_id FROM employees WHERE employee_id = ${body.employee_id} FOR UPDATE`;
        if (!target) throw Object.assign(new Error('Not found'), { status: 404 });
        if (!(await canView(req.session, body.employee_id, tx))) throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
        const [entry] = await tx`INSERT INTO salary_history (employee_id, effective_date, amount, currency, reason, entered_by)
          VALUES (${body.employee_id}, ${body.effective_date}, ${body.amount}, ${body.currency || 'IDR'}, ${body.reason || null}, ${req.session.user || 'unknown'}) RETURNING *`;
        await updateEmployeeFields(body.employee_id, { current_salary: body.amount, salary_currency: body.currency || 'IDR' }, tx);
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
