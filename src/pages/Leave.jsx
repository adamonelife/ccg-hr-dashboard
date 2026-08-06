import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency'];
const BALANCE_MANAGE_ROLES = ['Administrator', 'Director', 'HR'];

export default function Leave({ session }) {
  const canManageBalances = BALANCE_MANAGE_ROLES.includes(session?.role);

  return (
    <div>
      <h2>Leave</h2>

      {session?.employee_id ? (
        <MyLeave employeeId={session.employee_id} />
      ) : (
        <p style={styles.hint}>
          This login isn't linked to an employee record, so there's no personal leave to show — approvals and
          balance management below still work.
        </p>
      )}

      <Approvals />

      {canManageBalances && <ManageBalances />}
    </div>
  );
}

function MyLeave({ employeeId }) {
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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [employeeId]);

  return (
    <div style={styles.section}>
      <h3>My leave</h3>
      {loading && <p>Loading…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Cycle</th>
                <th style={styles.th}>Allocated</th>
                <th style={styles.th}>Used</th>
                <th style={styles.th}>Remaining</th>
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

          <h4 style={{ marginTop: 20 }}>My requests</h4>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Start</th>
                <th style={styles.th}>End</th>
                <th style={styles.th}>Half day</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.leave_type}</td>
                  <td style={styles.td}>{r.start_date}</td>
                  <td style={styles.td}>{r.end_date}</td>
                  <td style={styles.td}>{r.half_day ? 'Yes' : ''}</td>
                  <td style={styles.td}>{r.status}</td>
                  <td style={styles.td}>{r.reason}</td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={6}>
                    No requests yet.
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
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...styles.inlineForm, marginTop: 16 }}>
      <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} style={styles.input}>
        {LEAVE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} />
      {!halfDay && (
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} />
      )}
      <label style={styles.checkboxLabel}>
        <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
        Half day
      </label>
      <input
        placeholder="Reason"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...styles.input, flex: 2 }}
      />
      <button type="submit" disabled={saving} style={styles.addButton}>
        {saving ? 'Submitting…' : 'Request leave'}
      </button>
      {error && <p style={styles.error}>{error}</p>}
    </form>
  );
}

function Approvals() {
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
      .catch((e) => setError(e.message))
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
      setError(err.message);
    } finally {
      setActingId(null);
    }
  }

  if (loading) return null;

  return (
    <div style={styles.section}>
      <h3>Approvals</h3>
      {error && <p style={styles.error}>{error}</p>}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Employee</th>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Start</th>
            <th style={styles.th}>End</th>
            <th style={styles.th}>Reason</th>
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
                  Approve
                </button>{' '}
                <button
                  onClick={() => handleDecide(r.id, 'Rejected')}
                  disabled={actingId === r.id}
                  style={styles.rowButton}
                >
                  Reject
                </button>
              </td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={6}>
                No pending approvals.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManageBalances() {
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
      .catch((e) => setError(e.message));
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
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.section}>
      <h3>Manage leave allocations</h3>
      <p style={styles.hint}>
        Sets how many days someone has for the current cycle (Annual runs on their own start-date anniversary; Sick
        and Emergency run on the calendar year). Requests are blocked outright once someone's used their allocation
        — nothing to allocate yet means nobody can request that type until it's set here.
      </p>
      <div style={styles.inlineForm}>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={styles.input}>
          <option value="">— select employee —</option>
          {employees.map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>
              {emp.nickname || emp.full_name} ({emp.employee_id})
            </option>
          ))}
        </select>
        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} style={styles.input}>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.5"
          placeholder="Allocated days"
          value={allocated}
          onChange={(e) => setAllocated(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleSave} disabled={saving} style={styles.addButton}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p style={styles.error}>{error}</p>}

      {employeeId && (
        <table style={{ ...styles.table, marginTop: 12 }}>
          <thead>
            <tr>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Cycle</th>
              <th style={styles.th}>Allocated</th>
              <th style={styles.th}>Used</th>
              <th style={styles.th}>Remaining</th>
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
