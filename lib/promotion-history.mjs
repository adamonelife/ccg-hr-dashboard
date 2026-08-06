// lib/promotion-history.mjs — append-only promotion log (Phase 1: Employment).
//
// Backed by the `PromotionHistory` tab. Adding an entry also updates
// job_title on the matching Employees row.

import { readRange, appendRow, rowsToObjects, objectToRow } from './sheets-client.mjs';
import { updateEmployeeFields } from './employees.mjs';

const TAB = 'PromotionHistory';
const HEADERS = ['employee_id', 'date', 'previous_title', 'new_title', 'notes', 'entered_by', 'entered_at'];

export async function handlePromotionHistory(req, res) {
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
    if (!body.employee_id || !body.date || !body.new_title) {
      res.status(400).json({ error: 'employee_id, date and new_title are required' });
      return;
    }
    const record = {
      employee_id: body.employee_id,
      date: body.date,
      previous_title: body.previous_title || '',
      new_title: body.new_title,
      notes: body.notes || '',
      entered_by: req.session?.user || 'unknown',
      entered_at: new Date().toISOString(),
    };
    await appendRow(sheetId, `${TAB}!A:G`, objectToRow(HEADERS, record));

    const updated = await updateEmployeeFields(sheetId, body.employee_id, {
      job_title: record.new_title,
    });
    if (!updated) {
      res.status(201).json({ entry: record, warning: `No employee found for ${body.employee_id}` });
      return;
    }
    res.status(201).json({ entry: record });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
