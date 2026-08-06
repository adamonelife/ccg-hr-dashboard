// lib/leave.mjs — Leave Management (Phase 3, second half).
//
// Backed by `leave_balances` and `leave_requests` — both already existed
// as placeholder tables in db/schema.sql from the Postgres migration, no
// new migration needed for this.
//
// Rules, as decided:
//   - Day counting is business days only (Sat/Sun excluded).
//   - Requesting more than the remaining balance is a hard block, not a
//     warning — the request is rejected outright at submit time.
//   - Only the employee themselves, or an Administrator/Director/HR, can
//     submit a request for a given employee (not a lead — leads can
//     approve/reject requests in their scope, but not file one on behalf
//     of someone else).
//   - Annual leave resets on the employee's own start_date anniversary,
//     not the calendar year (someone who started 15 March has their leave
//     year run 15 March -> 14 March). Sick/Emergency stay on a plain
//     calendar year — flag it if that should change too.
//
// Visibility: same org-chart/lead scoping as everything else in Phase 3
// (see lib/permissions.mjs) — a lead sees and can approve/reject requests
// for anyone in their scope; Administrator/Director/HR see everyone;
// everyone sees their own regardless.

import { getSql, formatDate, formatTimestamp } from './db.mjs';
import { canView, getVisibleEmployeeIds } from './permissions.mjs';

const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency'];
const BALANCE_MANAGE_ROLES = new Set(['Administrator', 'Director', 'HR']);
const SUBMIT_ON_BEHALF_ROLES = new Set(['Administrator', 'Director', 'HR']);

function countBusinessDays(startDateStr, endDateStr) {
  let count = 0;
  const d = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  while (d <= end) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

// The calendar year a given leave_type/reference date's "leave cycle"
// falls into — for Annual, that's the employee's own anniversary cycle;
// for Sick/Emergency, just the plain calendar year of referenceDateStr.
// This is what gets stored in leave_balances.year — not necessarily the
// literal calendar year for Annual.
function leaveCycleYear(leaveType, employeeStartDateStr, referenceDateStr) {
  const ref = new Date(`${referenceDateStr}T00:00:00Z`);
  if (leaveType !== 'Annual' || !employeeStartDateStr) {
    return ref.getUTCFullYear();
  }
  const start = new Date(`${employeeStartDateStr}T00:00:00Z`);
  let cycleStartYear = ref.getUTCFullYear();
  const anniversaryThisYear = new Date(Date.UTC(cycleStartYear, start.getUTCMonth(), start.getUTCDate()));
  if (anniversaryThisYear > ref) cycleStartYear -= 1;
  return cycleStartYear;
}

function formatRequest(row) {
  return {
    ...row,
    start_date: formatDate(row.start_date),
    end_date: formatDate(row.end_date),
    requested_at: formatTimestamp(row.requested_at),
    approved_at: formatTimestamp(row.approved_at),
  };
}

export async function handleLeaveBalances(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { employeeId } = req.query;
    if (!employeeId) {
      res.status(400).json({ error: 'employeeId is required' });
      return;
    }
    if (!(await canView(req.session, employeeId))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const [emp] = await sql`SELECT start_date FROM employees WHERE employee_id = ${employeeId}`;
    if (!emp) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const empStartDate = formatDate(emp.start_date);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await sql`SELECT * FROM leave_balances WHERE employee_id = ${employeeId}`;
    const byKey = {};
    for (const r of rows) byKey[`${r.leave_type}:${r.year}`] = r;

    const balances = LEAVE_TYPES.map((type) => {
      const year = leaveCycleYear(type, empStartDate, today);
      const row = byKey[`${type}:${year}`];
      const allocated = row ? Number(row.allocated_days) : 0;
      const used = row ? Number(row.used_days) : 0;
      return { leave_type: type, year, allocated_days: allocated, used_days: used, remaining_days: allocated - used };
    });
    res.status(200).json({ balances });
    return;
  }

  if (req.method === 'POST') {
    if (!BALANCE_MANAGE_ROLES.has(req.session?.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const body = req.body || {};
    if (!body.employee_id || !body.leave_type || body.allocated_days === undefined || body.allocated_days === '') {
      res.status(400).json({ error: 'employee_id, leave_type and allocated_days are required' });
      return;
    }
    if (!LEAVE_TYPES.includes(body.leave_type)) {
      res.status(400).json({ error: `leave_type must be one of: ${LEAVE_TYPES.join(', ')}` });
      return;
    }
    const [emp] = await sql`SELECT start_date FROM employees WHERE employee_id = ${body.employee_id}`;
    if (!emp) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const year =
      body.year !== undefined && body.year !== ''
        ? Number(body.year)
        : leaveCycleYear(body.leave_type, formatDate(emp.start_date), today);
    try {
      const [row] = await sql`
        INSERT INTO leave_balances (employee_id, leave_type, year, allocated_days)
        VALUES (${body.employee_id}, ${body.leave_type}, ${year}, ${body.allocated_days})
        ON CONFLICT (employee_id, leave_type, year) DO UPDATE SET allocated_days = EXCLUDED.allocated_days
        RETURNING *
      `;
      res.status(200).json({ balance: row });
    } catch (err) {
      res.status(400).json({ error: `Save failed: ${err.message}` });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export async function handleLeaveRequests(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { employeeId, scope } = req.query;

    // "Approvals" queue: every Pending request within the caller's scope,
    // excluding their own (nobody approves their own leave — enforced
    // again at PATCH time regardless).
    if (scope === 'approvals') {
      const visible = await getVisibleEmployeeIds(req.session);
      let rows;
      if (visible === null) {
        rows = await sql`
          SELECT * FROM leave_requests
          WHERE status = 'Pending' AND employee_id != ${req.session?.employee_id || ''}
          ORDER BY requested_at
        `;
      } else if (visible.length === 0) {
        rows = [];
      } else {
        rows = await sql`
          SELECT * FROM leave_requests
          WHERE status = 'Pending' AND employee_id = ANY(${visible})
          ORDER BY requested_at
        `;
      }
      res.status(200).json({ requests: rows.map(formatRequest) });
      return;
    }

    if (!employeeId) {
      res.status(400).json({ error: 'employeeId is required' });
      return;
    }
    if (!(await canView(req.session, employeeId))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const rows = await sql`SELECT * FROM leave_requests WHERE employee_id = ${employeeId} ORDER BY start_date DESC`;
    res.status(200).json({ requests: rows.map(formatRequest) });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.employee_id || !body.leave_type || !body.start_date || !body.end_date) {
      res.status(400).json({ error: 'employee_id, leave_type, start_date and end_date are required' });
      return;
    }
    if (!LEAVE_TYPES.includes(body.leave_type)) {
      res.status(400).json({ error: `leave_type must be one of: ${LEAVE_TYPES.join(', ')}` });
      return;
    }
    const isSelf = req.session?.employee_id && req.session.employee_id === body.employee_id;
    if (!isSelf && !SUBMIT_ON_BEHALF_ROLES.has(req.session?.role)) {
      res.status(403).json({
        error: 'Only the employee themselves, HR, Director or Administrator can submit a request for this person',
      });
      return;
    }
    if (body.end_date < body.start_date) {
      res.status(400).json({ error: 'end_date must be on or after start_date' });
      return;
    }
    const halfDay = body.half_day === true || body.half_day === 'TRUE';
    if (halfDay && body.start_date !== body.end_date) {
      res.status(400).json({ error: 'half_day is only valid for a single-day request (start_date must equal end_date)' });
      return;
    }

    const [emp] = await sql`SELECT start_date FROM employees WHERE employee_id = ${body.employee_id}`;
    if (!emp) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    let days = countBusinessDays(body.start_date, body.end_date);
    if (halfDay) days -= 0.5;
    if (days <= 0) {
      res.status(400).json({ error: 'This date range has no business days in it' });
      return;
    }

    const year = leaveCycleYear(body.leave_type, formatDate(emp.start_date), body.start_date);
    const [balanceRow] = await sql`
      SELECT allocated_days, used_days FROM leave_balances
      WHERE employee_id = ${body.employee_id} AND leave_type = ${body.leave_type} AND year = ${year}
    `;
    const allocated = balanceRow ? Number(balanceRow.allocated_days) : 0;
    const used = balanceRow ? Number(balanceRow.used_days) : 0;
    const remaining = allocated - used;
    if (days > remaining) {
      res.status(400).json({
        error:
          `This request needs ${days} day(s) but only ${remaining} day(s) remain for ${body.leave_type} leave ` +
          `(${year} cycle). An admin/HR can adjust the allocation if this doesn't look right.`,
      });
      return;
    }

    try {
      const [row] = await sql`
        INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, half_day, reason)
        VALUES (${body.employee_id}, ${body.leave_type}, ${body.start_date}, ${body.end_date}, ${halfDay}, ${body.reason || null})
        RETURNING *
      `;
      res.status(201).json({ request: formatRequest(row), days_used: days });
    } catch (err) {
      res.status(400).json({ error: `Insert failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    if (!body.id || !body.status) {
      res.status(400).json({ error: 'id and status are required' });
      return;
    }
    if (!['Approved', 'Rejected'].includes(body.status)) {
      res.status(400).json({ error: 'status must be Approved or Rejected' });
      return;
    }
    const [existing] = await sql`SELECT * FROM leave_requests WHERE id = ${body.id}`;
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (existing.status !== 'Pending') {
      res.status(400).json({ error: `Already ${existing.status}` });
      return;
    }
    if (req.session?.employee_id && req.session.employee_id === existing.employee_id) {
      res.status(403).json({ error: "You can't approve or reject your own request" });
      return;
    }
    if (!(await canView(req.session, existing.employee_id))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    try {
      const [row] = await sql`
        UPDATE leave_requests
        SET status = ${body.status}, approved_by = ${req.session.employee_id || null}, approved_at = now()
        WHERE id = ${body.id}
        RETURNING *
      `;

      if (body.status === 'Approved') {
        const startDate = formatDate(existing.start_date);
        const endDate = formatDate(existing.end_date);
        let days = countBusinessDays(startDate, endDate);
        if (existing.half_day) days -= 0.5;
        const [emp] = await sql`SELECT start_date FROM employees WHERE employee_id = ${existing.employee_id}`;
        const year = leaveCycleYear(existing.leave_type, emp ? formatDate(emp.start_date) : null, startDate);
        await sql`
          INSERT INTO leave_balances (employee_id, leave_type, year, used_days)
          VALUES (${existing.employee_id}, ${existing.leave_type}, ${year}, ${days})
          ON CONFLICT (employee_id, leave_type, year)
          DO UPDATE SET used_days = leave_balances.used_days + ${days}
        `;
      }

      res.status(200).json({ request: formatRequest(row) });
    } catch (err) {
      res.status(400).json({ error: `Update failed: ${err.message}` });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
