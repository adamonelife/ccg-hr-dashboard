import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Mirrors lib/permissions.mjs's STAFF_MANAGEMENT_ROLES/
// UNRESTRICTED_VISIBILITY_ROLES/RESTRICTED_TARGET_ROLES — kept as plain
// arrays here rather than importing from a shared lib, since this is
// UI-only visibility (see note below) — the source of truth for anything
// that's actually enforced lives server-side in lib/permissions.mjs and
// lib/employees.mjs.
const CAN_SEE_CARD_AND_SENSITIVE_COLUMNS = ['Administrator', 'Director', 'HR', 'Finance'];
// Of the roles above, these two have the Director/Administrator exclusion
// — used per-row below to hide the "View card" button/row-click for
// exactly the rows the backend would 403 on anyway (canView), rather than
// showing a dead-end control.
const RESTRICTED_VIEWER_ROLES = ['HR', 'Finance'];
const RESTRICTED_TARGET_ROLES = ['Director', 'Administrator'];
const CAN_ADD_EMPLOYEE = ['Administrator', 'Director', 'HR', 'Finance'];

export default function Directory({ role, onOpen, onOpenCard, onAdd }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const showSensitive = CAN_SEE_CARD_AND_SENSITIVE_COLUMNS.includes(role);
  const showAdd = CAN_ADD_EMPLOYEE.includes(role);
  const viewerIsRestricted = RESTRICTED_VIEWER_ROLES.includes(role);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError('');
    api
      .listEmployees()
      .then((data) => setEmployees(data.employees || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  const filtered = employees.filter((e) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return [e.full_name, e.nickname, e.employee_id, e.department, e.team, e.job_title]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const columnCount = 6 + (showSensitive ? 3 : 0); // Name, Nickname, Job title, Department, Team, Status [+ Employee ID, Start date, card button]

  return (
    <div>
      <div style={styles.toolbar}>
        <input
          placeholder="Search name, ID, department, team, title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.search}
        />
        {showAdd && (
          <button onClick={onAdd} style={styles.addButton}>
            + Add employee
          </button>
        )}
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Nickname</th>
              {showSensitive && <th style={styles.th}>Employee ID</th>}
              <th style={styles.th}>Job title</th>
              <th style={styles.th}>Department</th>
              <th style={styles.th}>Team</th>
              <th style={styles.th}>Status</th>
              {showSensitive && <th style={styles.th}>Start date</th>}
              {showSensitive && <th style={styles.th}></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              // HR/Finance: this specific row is off-limits (canView would
              // 403 server-side anyway) — still show the name/title/dept
              // like any other row (that's just "who works here"), just
              // don't offer a drill-down that would only dead-end.
              const rowRestricted = viewerIsRestricted && RESTRICTED_TARGET_ROLES.includes(e.permission_role);
              return (
                <tr
                  key={e.employee_id}
                  onClick={rowRestricted ? undefined : () => onOpen(e.employee_id)}
                  style={rowRestricted ? styles.rowDisabled : styles.row}
                >
                  <td style={styles.td}>{e.full_name}</td>
                  <td style={styles.td}>{e.nickname}</td>
                  {showSensitive && <td style={styles.td}>{e.employee_id}</td>}
                  <td style={styles.td}>{e.job_title}</td>
                  <td style={styles.td}>{e.department}</td>
                  <td style={styles.td}>{e.team}</td>
                  <td style={styles.td}>{e.employment_status}</td>
                  {showSensitive && <td style={styles.td}>{e.start_date}</td>}
                  {showSensitive && (
                    <td style={styles.td}>
                      {!rowRestricted && (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpenCard(e.employee_id);
                          }}
                          style={styles.cardButton}
                        >
                          View card
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td style={styles.td} colSpan={columnCount}>
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles = {
  toolbar: { display: 'flex', gap: 12, marginBottom: 16 },
  search: { flex: 1, padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 },
  addButton: {
    padding: '8px 16px',
    fontSize: 14,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', color: '#555' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee' },
  row: { cursor: 'pointer' },
  rowDisabled: { cursor: 'default' },
  error: { color: '#c00' },
  cardButton: {
    padding: '4px 10px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
};
