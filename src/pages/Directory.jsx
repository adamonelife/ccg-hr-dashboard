import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';

// Mirrors lib/permissions.mjs's STAFF_MANAGEMENT_ROLES/
// UNRESTRICTED_VISIBILITY_ROLES/RESTRICTED_TARGET_ROLES — kept as plain
// arrays here rather than importing from a shared lib, since this is
// UI-only visibility (see note below) — the source of truth for anything
// that's actually enforced lives server-side in lib/permissions.mjs and
// lib/employees.mjs.
const CAN_SEE_CARD_AND_SENSITIVE_COLUMNS = ['Administrator', 'Director', 'HR', 'Finance'];
const CAN_ADD_EMPLOYEE = ['Administrator', 'Director', 'HR', 'Finance'];

export default function Directory({ role, onOpen, onOpenCard, onAdd }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const t = useT();

  const showSensitive = CAN_SEE_CARD_AND_SENSITIVE_COLUMNS.includes(role);
  const showAdd = CAN_ADD_EMPLOYEE.includes(role);
  const showCards = employees.some(e => e.can_view_detail);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError('');
    api
      .listEmployees()
      .then((data) => setEmployees(data.employees || []))
      .catch((e) => setError(t.err(e.message)))
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

  const columnCount = 6 + (showSensitive ? 2 : 0) + (showCards ? 1 : 0); // Name, Nickname, Job title, Department, Team, Status [+ Employee ID, Start date, card button]

  return (
    <div>
      <div style={styles.toolbar}>
        <input
          placeholder={t('directory.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.search}
        />
        {showAdd && (
          <button onClick={onAdd} style={styles.addButton}>
            {t('directory.addEmployee')}
          </button>
        )}
      </div>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>{t('directory.name')}</th>
              <th style={styles.th}>{t('directory.nickname')}</th>
              {showSensitive && <th style={styles.th}>{t('directory.employeeId')}</th>}
              <th style={styles.th}>{t('directory.jobTitle')}</th>
              <th style={styles.th}>{t('directory.department')}</th>
              <th style={styles.th}>{t('directory.team')}</th>
              <th style={styles.th}>{t('directory.status')}</th>
              {showSensitive && <th style={styles.th}>{t('directory.startDate')}</th>}
              {showCards && <th style={styles.th}></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              // HR/Finance: this specific row is off-limits (canView would
              // 403 server-side anyway) — still show the name/title/dept
              // like any other row (that's just "who works here"), just
              // don't offer a drill-down that would only dead-end.
              const rowRestricted = !e.can_view_detail;
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
                  {showCards && (
                    <td style={styles.td}>
                      {!rowRestricted && (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpenCard(e.employee_id);
                          }}
                          style={styles.cardButton}
                        >
                          {t('directory.viewCard')}
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
                  {t('directory.noEmployees')}
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
