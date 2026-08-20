import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';

const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency'];
// Mirrors lib/leave.mjs's BALANCE_MANAGE_ROLES — was missing Finance here
// until this pass (backend widened to include Finance during the
// HR/Finance staff-management-tier work; this UI-only copy had been
// missed, so Finance could allocate balances server-side but never saw
// the "Manage leave allocations" section to do it from).
const BALANCE_MANAGE_ROLES = ['Administrator', 'Director', 'HR', 'Finance'];

export default function Leave({ session }) {
  const t = useT();
  const canManageBalances = BALANCE_MANAGE_ROLES.includes(session?.role);

  return (
    <div>
      <h2>{t('leave.title')}</h2>

      {session?.employee_id ? (
        <MyLeave employeeId={session.employee_id} />
      ) : (
        <p style={styles.hint}>{t('leave.noRecordHint')}</p>
      )}

      <Approvals />

      {canManageBalances && <ManageBalances />}
    </div>
  );
}

function MyLeave({ employeeId }) {
  const t = useT();
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    Promise.all([api.leaveBalances(employeeId), api.leaveRequests(employeeId)])
      .then(([balData, reqData]) => {
        setBalances(balData.balances || []);
        setRequests(reqData.requests || []);
      })
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [employeeId]);

  return (
    <div style={styles.section}>
      <h3>{t('leave.myLeave')}</h3>
      {loading && <p>{t('common.loading')}</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>{t('leave.type')}</th>
                <th style={styles.th}>{t('leave.cycle')}</th>
                <th style={styles.th}>{t('leave.allocated')}</th>
                <th style={styles.th}>{t('leave.used')}</th>
                <th style={styles.th}>{t('leave.remaining')}</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.leave_type}>
                  <td style={styles.td}>{b.leave_type}</td>
                  <td style={styles.td}>{b.year}</td>
                  <td style={styles.td}>{b.allocated_days}</td>
                  <td style={styles.td}>{b.used_days}</td>
                  <td style={styles.td}>{b.remaining_days}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <RequestForm employeeId={employeeId} onSubmitted={load} />

          <h4 style={{ marginTop: 20 }}>{t('leave.myRequests')}</h4>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>{t('leave.type')}</th>
                <th style={styles.th}>{t('leave.start')}</th>
                <th style={styles.th}>{t('leave.end')}</th>
                <th style={styles.th}>{t('leave.halfDay')}</th>
                <th style={styles.th}>{t('leave.status')}</th>
                <th style={styles.th}>{t('leave.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.leave_type}</td>
                  <td style={styles.td}>{r.start_date}</td>
                  <td style={styles.td}>{r.end_date}</td>
                  <td style={styles.td}>{r.half_day ? t('common.yes') : ''}</td>
                  <td style={styles.td}>{r.status}</td>
                  <td style={styles.td}>{r.reason}</td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={6}>
                    {t('leave.noRequestsYet')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function RequestForm({ employeeId, onSubmitted }) {
  const t = useT();
  const [leaveType, setLeaveType] = useState('Annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.submitLeaveRequest({
        employee_id: employeeId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: halfDay ? startDate : endDate,
        half_day: halfDay,
        reason,
      });
      setStartDate('');
      setEndDate('');
      setHalfDay(false);
      setReason('');
      onSubmitted();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...styles.inlineForm, marginTop: 16 }}>
      <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} style={styles.input}>
        {LEAVE_TYPES.map((lt) => (
          <option key={lt} value={lt}>
            {lt}
          </option>
        ))}
      </select>
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} />
      {!halfDay && (
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} />
      )}
      <label style={styles.checkboxLabel}>
        <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
        {t('leave.halfDay')}
      </label>
      <input
        placeholder={t('leave.reasonPlaceholder')}
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...styles.input, flex: 2 }}
      />
      <button type="submit" disabled={saving} style={styles.addButton}>
        {saving ? t('leave.submitting') : t('leave.requestLeave')}
      </button>
      {error && <p style={styles.error}>{error}</p>}
    </form>
  );
}

function Approvals() {
  const t = useT();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);

  function load() {
    setLoading(true);
    setError('');
    api
      .leaveApprovals()
      .then((data) => setRequests(data.requests || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDecide(id, status) {
    setActingId(id);
    setError('');
    try {
      await api.decideLeaveRequest(id, status);
      load();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setActingId(null);
    }
  }

  if (loading) return null;

  return (
    <div style={styles.section}>
      <h3>{t('leave.approvals')}</h3>
      {error && <p style={styles.error}>{error}</p>}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>{t('orgChart.employee')}</th>
            <th style={styles.th}>{t('leave.type')}</th>
            <th style={styles.th}>{t('leave.start')}</th>
            <th style={styles.th}>{t('leave.end')}</th>
            <th style={styles.th}>{t('leave.reason')}</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td style={styles.td}>
                {r.nickname || r.full_name}
                {r.nickname && <span style={styles.fullNameHint}> ({r.full_name})</span>}
              </td>
              <td style={styles.td}>{r.leave_type}</td>
              <td style={styles.td}>{r.start_date}</td>
              <td style={styles.td}>{r.end_date}</td>
              <td style={styles.td}>{r.reason}</td>
              <td style={styles.td}>
                <button
                  onClick={() => handleDecide(r.id, 'Approved')}
                  disabled={actingId === r.id}
                  style={styles.rowButton}
                >
                  {t('leave.approve')}
                </button>{' '}
                <button
                  onClick={() => handleDecide(r.id, 'Rejected')}
                  disabled={actingId === r.id}
                  style={styles.rowButton}
                >
                  {t('leave.reject')}
                </button>
              </td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={6}>
                {t('leave.noPendingApprovals')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManageBalances() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [balances, setBalances] = useState([]);
  const [leaveType, setLeaveType] = useState('Annual');
  const [allocated, setAllocated] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listEmployees()
      .then((data) => setEmployees(data.employees || []))
      .catch(() => {});
  }, []);

  function loadBalances(id) {
    if (!id) {
      setBalances([]);
      return;
    }
    api
      .leaveBalances(id)
      .then((data) => setBalances(data.balances || []))
      .catch((e) => setError(t.err(e.message)));
  }

  useEffect(() => {
    loadBalances(employeeId);
  }, [employeeId]);

  async function handleSave(e) {
    e.preventDefault();
    if (!employeeId || allocated === '') return;
    setSaving(true);
    setError('');
    try {
      await api.setLeaveBalance({ employee_id: employeeId, leave_type: leaveType, allocated_days: allocated });
      setAllocated('');
      loadBalances(employeeId);
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.section}>
      <h3>{t('leave.manageAllocations')}</h3>
      <p style={styles.hint}>{t('leave.manageHint')}</p>
      <div style={styles.inlineForm}>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={styles.input}>
          <option value="">{t('leave.selectEmployee')}</option>
          {employees.map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>
              {emp.nickname || emp.full_name} ({emp.employee_id})
            </option>
          ))}
        </select>
        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} style={styles.input}>
          {LEAVE_TYPES.map((lt) => (
            <option key={lt} value={lt}>
              {lt}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.5"
          placeholder={t('leave.allocatedDaysPlaceholder')}
          value={allocated}
          onChange={(e) => setAllocated(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleSave} disabled={saving} style={styles.addButton}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
      {error && <p style={styles.error}>{error}</p>}

      {employeeId && (
        <table style={{ ...styles.table, marginTop: 12 }}>
          <thead>
            <tr>
              <th style={styles.th}>{t('leave.type')}</th>
              <th style={styles.th}>{t('leave.cycle')}</th>
              <th style={styles.th}>{t('leave.allocated')}</th>
              <th style={styles.th}>{t('leave.used')}</th>
              <th style={styles.th}>{t('leave.remaining')}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.leave_type}>
                <td style={styles.td}>{b.leave_type}</td>
                <td style={styles.td}>{b.year}</td>
                <td style={styles.td}>{b.allocated_days}</td>
                <td style={styles.td}>{b.used_days}</td>
                <td style={styles.td}>{b.remaining_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles = {
  section: { marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 },
  hint: { color: '#666', fontSize: 13 },
  fullNameHint: { color: '#888', fontSize: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', color: '#555' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee' },
  error: { color: '#c00' },
  inlineForm: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 8, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 },
  addButton: {
    padding: '8px 16px',
    fontSize: 13,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  rowButton: {
    padding: '3px 8px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
};
