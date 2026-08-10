import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// HR review queue for self-service change requests — see
// lib/change-requests.mjs. Administrator/HR/Director only (App.jsx hides
// the nav tab for everyone else; handleChangeRequests's GET ?scope=queue
// is the real enforcement). Approve/Reject are the only actions — there's
// no "edit before approving" here on purpose, same as Leave's approvals:
// if what was requested isn't right, reject it with a note and have them
// resubmit, rather than silently changing what they asked for.
const TYPE_LABELS = {
  profile: 'Profile update',
  skill_add: 'New skill/entry',
  skill_update: 'Skill/entry update',
  skill_delete: 'Skill/entry removal',
};

export default function ChangeRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError('');
    api
      .changeRequestQueue()
      .then((data) => setRequests(data.requests || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <h2 style={styles.title}>Change requests</h2>
      <p style={styles.intro}>
        Self-service edits to profile details and skills, submitted after each employee's own first-login setup —
        nothing here takes effect until approved.
      </p>

      {loading && <p>Loading…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && requests.length === 0 && <p style={styles.empty}>Nothing pending.</p>}

      {!loading &&
        requests.map((r) => <RequestCard key={r.id} request={r} onDecided={load} />)}
    </div>
  );
}

function RequestCard({ request, onDecided }) {
  const [notes, setNotes] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState('');

  async function decide(status) {
    setDeciding(true);
    setError('');
    try {
      await api.decideChangeRequest(request.id, status, notes);
      onDecided();
    } catch (err) {
      setError(err.message);
      setDeciding(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <strong>{request.nickname || request.full_name}</strong>
          <span style={styles.meta}> · {request.employee_id}</span>
        </div>
        <span style={styles.typeBadge}>{TYPE_LABELS[request.request_type] || request.request_type}</span>
      </div>
      <div style={styles.meta}>Requested {request.requested_at}</div>

      <Diff request={request} />

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.actions}>
        <input
          placeholder="Note (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={styles.notesInput}
        />
        <button onClick={() => decide('Approved')} disabled={deciding} style={styles.approveButton}>
          {deciding ? 'Working…' : 'Approve'}
        </button>
        <button onClick={() => decide('Rejected')} disabled={deciding} style={styles.rejectButton}>
          Reject
        </button>
      </div>
    </div>
  );
}

// Profile requests carry {old, new} maps of field -> value (only the
// fields that actually changed). skill_add carries the new entry outright
// (nothing to diff against). skill_update carries {old, new} full entry
// snapshots. skill_delete carries {old} only.
function Diff({ request }) {
  const { payload, request_type } = request;

  if (request_type === 'profile' || request_type === 'skill_update') {
    const oldVals = payload.old || {};
    const newVals = payload.new || {};
    const keys = Object.keys(newVals);
    return (
      <table style={styles.diffTable}>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td style={styles.diffKey}>{k}</td>
              <td style={styles.diffOld}>{formatVal(oldVals[k])}</td>
              <td style={styles.diffArrow}>→</td>
              <td style={styles.diffNew}>{formatVal(newVals[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (request_type === 'skill_add') {
    return (
      <div style={styles.diffSimple}>
        <strong>{payload.category}</strong>: {payload.item}
        {payload.level && ` — level ${payload.level}`}
        {payload.notes && <span style={styles.meta}> ({payload.notes})</span>}
      </div>
    );
  }

  if (request_type === 'skill_delete') {
    const old = payload.old || {};
    return (
      <div style={styles.diffSimple}>
        Remove <strong>{old.category}</strong>: {old.item}
        {old.level && ` — level ${old.level}`}
      </div>
    );
  }

  return null;
}

function formatVal(v) {
  if (v === null || v === undefined || v === '') return <span style={{ color: '#bbb' }}>(blank)</span>;
  return String(v);
}

const styles = {
  title: { margin: '0 0 4px 0', fontSize: 20 },
  intro: { color: '#555', fontSize: 13, marginBottom: 20, maxWidth: 640 },
  empty: { fontSize: 14, color: '#888' },
  error: { color: '#c00' },
  card: {
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    maxWidth: 640,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  meta: { fontSize: 12, color: '#888' },
  typeBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
    background: '#f2f2f2',
    borderRadius: 4,
    padding: '3px 8px',
  },
  diffTable: { fontSize: 13, margin: '10px 0', borderCollapse: 'collapse' },
  diffKey: { color: '#888', paddingRight: 12, verticalAlign: 'top' },
  diffOld: { color: '#c00', textDecoration: 'line-through', paddingRight: 8 },
  diffArrow: { color: '#888', paddingRight: 8 },
  diffNew: { color: '#2a7', fontWeight: 600 },
  diffSimple: { fontSize: 13, margin: '10px 0' },
  actions: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 },
  notesInput: { flex: 1, padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 },
  approveButton: {
    padding: '6px 14px',
    fontSize: 13,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  rejectButton: {
    padding: '6px 14px',
    fontSize: 13,
    border: '1px solid #c00',
    borderRadius: 4,
    background: '#fff',
    color: '#c00',
    cursor: 'pointer',
  },
};
