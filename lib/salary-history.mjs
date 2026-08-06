// lib/salary-history.mjs — append-only salary log (Phase 1: Employment).
//
// Backed by the `SalaryHistory` tab. Adding an entry also updates
// current_salary/salary_currency on the matching Employees row, so the
// directory always reflects the latest figure without a separate step.

import { readRange, appendRow, rowsToObjects, objectToRow } from './sheets-client.mjs';
import { updateEmployeeFields } from './employees.mjs';

const TAB = 'SalaryHistory';
const HEADERS = ['employee_id', 'effective_date', 'amount', 'currency', 'reason', 'entered_by', 'entered_at'];

export async function handleSalaryHistory(req, res) {
  const sheetId = process.env.HR_SHEET_ID;
  if (!sheetId) {
    res.status(500).json({ error: 'HR_SHEET_ID not configured' });
    return;
  }

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    const rows = await readRange(sheetId, `${TAB}!A2:G`);
    let list = rowsToObjects(HEADERS, rows).filter((r) => r.employee_id);
    if (employeeId) list = list.filter((r) => r.employee_id === employeeId);
    res.status(200).json({ history: list });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.effective_date || body.amount === undefined || body.amount === '') {
      res.status(400).json({ error: 'employee_id, effective_date and amount are required' });
      return;
    }
    const record = {
      employee_id: body.employee_id,
      effective_date: body.effective_date,
      amount: body.amount,
      currency: body.currency || 'IDR',
      reason: body.reason || '',
      entered_by: req.session?.user || 'unknown',
      entered_at: new Date().toISOString(),
    };
    await appendRow(sheetId, `${TAB}!A:G`, objectToRow(HEADERS, record));

    const updated = await updateEmployeeFields(sheetId, body.employee_id, {
      current_salary: record.amount,
      salary_currency: record.currency,
    });
    if (!updated) {
      // History entry is already saved; flag that the employee_id didn't
      // match anything so the caller knows current_salary wasn't synced.
      res.status(201).json({ entry: record, warning: `No employee found for ${body.employee_id}` });
      return;
    }
    res.status(201).json({ entry: record });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
