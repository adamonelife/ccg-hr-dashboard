// lib/change-requests.mjs — self-service change approvals.
//
// Built alongside the first-login profile/skills setup gate. Once an
// employee has completed initial setup (employees.profile_setup_completed_at
// is set — see lib/employees.mjs), any further self-edit to their own
// contact/personal fields (lib/employees.mjs's SELF_SERVICE_FIELDS) or
// their own skills/Design Discipline entries (lib/skills.mjs) no longer
// applies immediately — it's recorded here as a Pending request instead,
// and only takes effect once approved.
//
// Two distinct roles sets are involved here — previously deliberately
// different, now the same set after Adam asked for HR/Finance parity:
//   - Who's exempt from ever needing to submit a request for their own
//     record: Administrator/HR/Director/Finance (FULL_VISIBILITY_ROLES in
//     permissions.mjs) — editing your own record when you're already one
//     of the roles that would approve it is a distinction without a
//     difference. (Finance used to be excluded here specifically — their
//     own edits went through approval even though they could review
//     others' — that asymmetry has been removed.)
//   - Who can review/approve OTHER people's requests (the queue below):
//     STAFF_MANAGEMENT_ROLES (Administrator/Director/HR/Finance), with
//     current target scope rechecked even if roles changed after submission.
//
// One table covers four request types rather than four separate tables —
// they're structurally different (a handful of profile fields vs. one
// skill row) but share every other concern (who requested it, review
// state, who reviewed it), so a discriminated `payload` JSON blob is a
// better fit than a table per type. `payload` is stored as TEXT
// (JSON.stringify/JSON.parse at the boundary) rather than a native JSONB
// column — this codebase doesn't use JSONB anywhere yet, and there's no
// need to take on an unfamiliar column type + driver interaction for
// something this simple.

import { getSql, formatTimestamp } from './db.mjs';
import { STAFF_MANAGEMENT_ROLES, canView } from './permissions.mjs';
import { SELF_SERVICE_FIELDS } from '../shared/employee-policy.mjs';

function formatRequest(row) {
  if (!row) return row;
  return {
    ...row,
    payload: JSON.parse(row.payload),
    requested_at: formatTimestamp(row.requested_at),
    reviewed_at: formatTimestamp(row.reviewed_at),
  };
}

// Shared by lib/employees.mjs (request_type: 'profile') and lib/skills.mjs
// (skill_add/skill_update/skill_delete). Schema is installed explicitly.
export async function createChangeRequest(sql, { employeeId, requestType, skillId = null, payload }) {
  const [row] = await sql`
    INSERT INTO change_requests (employee_id, request_type, skill_id, payload)
    VALUES (${employeeId}, ${requestType}, ${skillId}, ${JSON.stringify(payload)})
    RETURNING *
  `;
  return formatRequest(row);
}

export async function handleChangeRequests(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { employeeId, scope } = req.query;

    // The review queue — every Administrator/Director/HR/Finance sees the
    // same list (no org-chart scoping here, unlike Leave's approvals;
    // sign-off authority for self-service changes isn't split by team).
    if (scope === 'queue') {
      if (!STAFF_MANAGEMENT_ROLES.has(req.session?.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      const rows = await sql`
        SELECT cr.*, e.full_name, e.nickname
        FROM change_requests cr
        JOIN employees e ON e.employee_id = cr.employee_id
        WHERE cr.status = 'Pending'
          AND ${['HR', 'Finance'].includes(req.session.role) ? sql`e.permission_role NOT IN ('Director', 'Administrator')` : sql`TRUE`}
        ORDER BY cr.requested_at
      `;
      res.status(200).json({ requests: rows.map(formatRequest) });
      return;
    }

    if (!employeeId) {
      res.status(400).json({ error: 'employeeId is required (or scope=queue)' });
      return;
    }
    const isSelf = req.session?.employee_id === employeeId;
    if (!isSelf && !STAFF_MANAGEMENT_ROLES.has(req.session?.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    if (!(await canView(req.session, employeeId))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const rows = await sql`
      SELECT * FROM change_requests WHERE employee_id = ${employeeId} ORDER BY requested_at DESC
    `;
    res.status(200).json({ requests: rows.map(formatRequest) });
    return;
  }

  if (req.method === 'PATCH') {
    if (!STAFF_MANAGEMENT_ROLES.has(req.session?.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const { id, status, review_notes } = req.body || {};
    if (!id || !['Approved', 'Rejected'].includes(status)) {
      res.status(400).json({ error: 'id and status (Approved/Rejected) are required' });
      return;
    }
    try {
      const row = await sql.begin(async tx => {
        const [request] = await tx`SELECT * FROM change_requests WHERE id = ${id} FOR UPDATE`;
        if (!request) throw Object.assign(new Error('Not found'), { status: 404 });
        if (request.status !== 'Pending') throw Object.assign(new Error(`Already ${request.status}`), { status: 409 });
        if (!(await canView(req.session, request.employee_id, tx))) {
          throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
        }
        if (status === 'Approved') {
          const payload = JSON.parse(request.payload);
          if (request.request_type === 'profile') {
            // Requests must never smuggle protected fields through the reviewer.
            const entries = Object.entries(payload.new || {});
            if (entries.some(([key]) => !SELF_SERVICE_FIELDS.includes(key))) throw new Error('Invalid profile request fields');
            const values = Object.fromEntries(entries.map(([key, value]) => [key, value === '' ? null : value]));
            if (entries.length) await tx`UPDATE employees SET ${tx(values)} WHERE employee_id = ${request.employee_id}`;
          } else if (request.request_type === 'skill_add') {
            await tx`INSERT INTO skills (employee_id, category, item, level, notes)
              VALUES (${request.employee_id}, ${payload.category}, ${payload.item}, ${payload.level || null}, ${payload.notes || null})`;
          } else {
            const [skill] = await tx`SELECT id FROM skills WHERE id = ${request.skill_id}
              AND employee_id = ${request.employee_id} FOR UPDATE`;
            if (!skill) throw new Error('That skill entry no longer exists — nothing to update');
            if (request.request_type === 'skill_update') {
              await tx`UPDATE skills SET category = ${payload.new.category}, item = ${payload.new.item},
                level = ${payload.new.level || null}, notes = ${payload.new.notes || null} WHERE id = ${request.skill_id}`;
            } else if (request.request_type === 'skill_delete') {
              await tx`DELETE FROM skills WHERE id = ${request.skill_id}`;
            } else throw new Error('Invalid request type');
          }
        }
        const [decided] = await tx`UPDATE change_requests SET status = ${status},
          reviewed_by = ${req.session.employee_id || req.session.user || null}, reviewed_at = now(),
          review_notes = ${review_notes || null} WHERE id = ${id} RETURNING *`;
        return decided;
      });
      res.status(200).json({ request: formatRequest(row) });
    } catch (err) {
      res.status(err.status || 400).json({ error: `Could not apply change: ${err.message}` });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
