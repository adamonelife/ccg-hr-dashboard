// lib/change-requests.mjs — self-service change approvals.
//
// Built alongside the first-login profile/skills setup gate. Once an
// employee has completed initial setup (employees.profile_setup_completed_at
// is set — see lib/employees.mjs), any further self-edit to their own
// contact/personal fields (lib/employees.mjs's SELF_SERVICE_FIELDS) or
// their own skills/Design Discipline entries (lib/skills.mjs) no longer
// applies immediately — it's recorded here as a Pending request instead,
// and only takes effect once an Administrator/HR/Director approves it.
// Those three roles are exempt from all of this (see FULL_VISIBILITY_ROLES
// in permissions.mjs) — editing your own record when you're already one of
// the roles that would approve it is a distinction without a difference.
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
import { FULL_VISIBILITY_ROLES } from './permissions.mjs';

let _tableEnsured = false;
export async function ensureChangeRequestsTable(sql) {
  if (_tableEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS change_requests (
      id             SERIAL PRIMARY KEY,
      employee_id    TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
      request_type   TEXT NOT NULL CHECK (request_type IN ('profile', 'skill_add', 'skill_update', 'skill_delete')),
      -- Set for skill_update/skill_delete, pointing at the skills row this
      -- request is about. Deliberately no FK — if the row it's about gets
      -- deleted directly by an admin while a request is still pending,
      -- approving that request should fail gracefully (see PATCH below),
      -- not cascade-delete history of what was requested.
      skill_id       INTEGER,
      payload        TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
      requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_by    TEXT,
      reviewed_at    TIMESTAMPTZ,
      review_notes   TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_change_requests_employee ON change_requests(employee_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status)`;
  _tableEnsured = true;
}

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
// (skill_add/skill_update/skill_delete) — the actual INSERT, plus making
// sure the table exists first so neither caller needs to remember to.
export async function createChangeRequest(sql, { employeeId, requestType, skillId = null, payload }) {
  await ensureChangeRequestsTable(sql);
  const [row] = await sql`
    INSERT INTO change_requests (employee_id, request_type, skill_id, payload)
    VALUES (${employeeId}, ${requestType}, ${skillId}, ${JSON.stringify(payload)})
    RETURNING *
  `;
  return formatRequest(row);
}

export async function handleChangeRequests(req, res) {
  const sql = getSql();
  await ensureChangeRequestsTable(sql);

  if (req.method === 'GET') {
    const { employeeId, scope } = req.query;

    // The review queue — every Administrator/HR/Director sees the same
    // list (no org-chart scoping here, unlike Leave's approvals; sign-off
    // authority for self-service changes isn't split by team).
    if (scope === 'queue') {
      if (!FULL_VISIBILITY_ROLES.has(req.session?.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      const rows = await sql`
        SELECT cr.*, e.full_name, e.nickname
        FROM change_requests cr
        JOIN employees e ON e.employee_id = cr.employee_id
        WHERE cr.status = 'Pending'
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
    if (!isSelf && !FULL_VISIBILITY_ROLES.has(req.session?.role)) {
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
    if (!FULL_VISIBILITY_ROLES.has(req.session?.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const { id, status, review_notes } = req.body || {};
    if (!id || !['Approved', 'Rejected'].includes(status)) {
      res.status(400).json({ error: 'id and status (Approved/Rejected) are required' });
      return;
    }
    const [reqRow] = await sql`SELECT * FROM change_requests WHERE id = ${id}`;
    if (!reqRow) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (reqRow.status !== 'Pending') {
      res.status(400).json({ error: `Already ${reqRow.status}` });
      return;
    }

    if (status === 'Approved') {
      const payload = JSON.parse(reqRow.payload);
      try {
        if (reqRow.request_type === 'profile') {
          const setFields = {};
          for (const [key, value] of Object.entries(payload.new)) {
            setFields[key] = value === '' ? null : value;
          }
          if (Object.keys(setFields).length > 0) {
            await sql`UPDATE employees SET ${sql(setFields)} WHERE employee_id = ${reqRow.employee_id}`;
          }
        } else if (reqRow.request_type === 'skill_add') {
          await sql`
            INSERT INTO skills (employee_id, category, item, level, notes)
            VALUES (
              ${reqRow.employee_id}, ${payload.category}, ${payload.item},
              ${payload.level || null}, ${payload.notes || null}
            )
          `;
        } else if (reqRow.request_type === 'skill_update') {
          const [existing] = await sql`SELECT id FROM skills WHERE id = ${reqRow.skill_id}`;
          if (!existing) throw new Error('That skill entry no longer exists — nothing to update');
          await sql`
            UPDATE skills SET
              category = ${payload.new.category},
              item = ${payload.new.item},
              level = ${payload.new.level || null},
              notes = ${payload.new.notes || null}
            WHERE id = ${reqRow.skill_id}
          `;
        } else if (reqRow.request_type === 'skill_delete') {
          await sql`DELETE FROM skills WHERE id = ${reqRow.skill_id}`;
        }
      } catch (err) {
        res.status(400).json({ error: `Could not apply change: ${err.message}` });
        return;
      }
    }

    const [row] = await sql`
      UPDATE change_requests
      SET status = ${status},
          reviewed_by = ${req.session?.employee_id || req.session?.user || null},
          reviewed_at = now(),
          review_notes = ${review_notes || null}
      WHERE id = ${id}
      RETURNING *
    `;
    res.status(200).json({ request: formatRequest(row) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
