import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// "Operations and Executives" = Administrator + Director (see ROADMAP.md's
// permission model notes — Administrator is effectively the operations-lead
// access level today, Director covers execs). Kept as plain arrays here
// rather than importing from a shared lib, since this is UI-only visibility
// (see note below) — the source of truth for anything that's actually
// enforced lives server-side in lib/permissions.mjs and lib/employees.mjs.
const CAN_SEE_CARD_AND_SENSITIVE_COLUMNS = ['Administrator', 'Director'];
const CAN_ADD_EMPLOYEE = ['Administrator', 'Director', 'HR', 'Finance'];

export default function Directory({ role, onOpen, onOpenCard, onAdd }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const showSensitive = CAN_SEE_CARD_AND_SENSITIVE_COLUMNS.includes(role);
  const showAdd = CAN_ADD_EMPLOYEE.includes(role);

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
            {filtered.map((e) => (
              <tr key={e.employee_id} onClick={() => onOpen(e.employee_id)} style={styles.row}>
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
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpenCard(e.employee_id);
                      }}
                      style={styles.cardButton}
                    >
                      View card
                    </button>
                  </td>
                )}
              </tr>
            ))}
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
