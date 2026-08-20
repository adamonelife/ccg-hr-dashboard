import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';

// HR review queue for self-service change requests — see
// lib/change-requests.mjs. Administrator/HR/Director only (App.jsx hides
// the nav tab for everyone else; handleChangeRequests's GET ?scope=queue
// is the real enforcement). Approve/Reject are the only actions — there's
// no "edit before approving" here on purpose, same as Leave's approvals:
// if what was requested isn't right, reject it with a note and have them
// resubmit, rather than silently changing what they asked for.
//
// TYPE_KEYS maps request_type -> the `changeRequests.type.*` dictionary
// key; DIFF_KEY_NS looks up profile field names via the same
// `employeeForm.field.*` keys EmployeeForm.jsx uses, since request payload
// keys are the raw DB column names.
const TYPE_KEYS = {
  profile: 'changeRequests.type.profile',
  skill_add: 'changeRequests.type.skill_add',
  skill_update: 'changeRequests.type.skill_update',
  skill_delete: 'changeRequests.type.skill_delete',
};

export default function ChangeRequests() {
  const t = useT();
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
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <h2 style={styles.title}>{t('changeRequests.title')}</h2>
      <p style={styles.intro}>{t('changeRequests.intro')}</p>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && requests.length === 0 && <p style={styles.empty}>{t('changeRequests.nothingPending')}</p>}

      {!loading &&
        requests.map((r) => <RequestCard key={r.id} request={r} onDecided={load} />)}
    </div>
  );
}

function RequestCard({ request, onDecided }) {
  const t = useT();
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
      setError(t.err(err.message));
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
        <span style={styles.typeBadge}>
          {TYPE_KEYS[request.request_type] ? t(TYPE_KEYS[request.request_type]) : request.request_type}
        </span>
      </div>
      <div style={styles.meta}>{t('changeRequests.requestedAt', { date: request.requested_at })}</div>

      <Diff request={request} t={t} />

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.actions}>
        <input
          placeholder={t('changeRequests.notePlaceholder')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={styles.notesInput}
        />
        <button onClick={() => decide('Approved')} disabled={deciding} style={styles.approveButton}>
          {deciding ? t('changeRequests.working') : t('changeRequests.approve')}
        </button>
        <button onClick={() => decide('Rejected')} disabled={deciding} style={styles.rejectButton}>
          {t('changeRequests.reject')}
        </button>
      </div>
    </div>
  );
}

// Profile requests carry {old, new} maps of field -> value (only the
// fields that actually changed). skill_add carries the new entry outright
// (nothing to diff against). skill_update carries {old, new} full entry
// snapshots. skill_delete carries {old} only.
function Diff({ request, t }) {
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
              <td style={styles.diffKey}>{request_type === 'profile' ? t(`employeeForm.field.${k}`) : k}</td>
              <td style={styles.diffOld}>{formatVal(oldVals[k], t)}</td>
              <td style={styles.diffArrow}>→</td>
              <td style={styles.diffNew}>{formatVal(newVals[k], t)}</td>
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
        {payload.level && t('changeRequests.levelSuffix', { level: payload.level })}
        {payload.notes && <span style={styles.meta}> ({payload.notes})</span>}
      </div>
    );
  }

  if (request_type === 'skill_delete') {
    const old = payload.old || {};
    return (
      <div style={styles.diffSimple}>
        {t('changeRequests.remove', {
          category: old.category,
          item: `${old.item}${old.level ? t('changeRequests.levelSuffix', { level: old.level }) : ''}`,
        })}
      </div>
    );
  }

  return null;
}

function formatVal(v, t) {
  if (v === null || v === undefined || v === '') return <span style={{ color: '#bbb' }}>{t('changeRequests.blank')}</span>;
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
