import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Keep in sync with the CHECK constraint on skills.level in db/schema.sql.
const LEVELS = ['', '0', '1', '2', '3', '4', '5'];

// Keep in sync with CATEGORIES in lib/skills.mjs — minus 'Design
// Discipline', which lib/skills.mjs accepts but this list deliberately
// excludes: that category has its own dedicated widget
// (DesignDisciplinePanel, below) rather than going through the generic
// "Add skill" form, so it never ends up with stray free-text entries.
const CATEGORIES = [
  'Software Skill',
  'Technical Skill',
  'Soft Skill',
  'Language',
  'Certification',
  'Training Completed',
  'Training Required',
  'Career Path',
];

const DESIGN_DISCIPLINE_CATEGORY = 'Design Discipline';
const DISCIPLINE_ITEMS = ['Architecture', 'Landscape', 'Interior'];

// Mirrors lib/permissions.mjs's FULL_VISIBILITY_ROLES — see
// EmployeeForm.jsx's copy of the same list for why this stays a plain UI-
// only array instead of a shared import (server-side is the real gate).
const FULL_VISIBILITY_ROLES = ['Administrator', 'Director', 'HR'];

// Re-exported so src/pages/Setup.jsx (first-login onboarding gate) can
// reuse the exact same skills widgets instead of forking them — the
// onboarding screen and the card's own skills section should always look
// and behave identically.
export { LEVELS, CATEGORIES };

export default function EmployeeCard({ employeeId, session, onBack, onEdit }) {
  const [employee, setEmployee] = useState(null);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);

  // Once first-login setup is done, a self-editing, non-trusted employee's
  // skill/Design Discipline changes go through HR approval instead of
  // applying immediately — lib/skills.mjs enforces this server-side; this
  // just decides whether to show the "pending approval" messaging/banner.
  const isSelfEdit = session?.employee_id === employeeId;
  const isTrusted = FULL_VISIBILITY_ROLES.includes(session?.role);
  const selfServiceOnly = isSelfEdit && !isTrusted;

  useEffect(() => {
    load();
  }, [employeeId]);

  function load() {
    setLoading(true);
    setError('');
    Promise.all([api.getEmployee(employeeId), api.skills(employeeId)])
      .then(([empData, skillData]) => {
        setEmployee(empData.employee);
        setSkills(skillData.skills || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    if (selfServiceOnly) loadPendingRequests();
  }

  function loadPendingRequests() {
    api
      .myChangeRequests(employeeId)
      .then((data) => setPendingRequests((data.requests || []).filter((r) => r.status === 'Pending')))
      .catch(() => {
        // Non-fatal — the card still works without the pending-requests banner.
      });
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={styles.error}>{error}</p>;
  if (!employee) return null;

  const byCategory = {};
  for (const s of skills) {
    (byCategory[s.category] ||= []).push(s);
  }

  return (
    <div>
      <button onClick={onBack} style={styles.back}>
        ← Back to directory
      </button>

      <div style={styles.card}>
        <div style={styles.header}>
          {employee.photo_url ? (
            <img src={employee.photo_url} alt="" style={styles.photo} />
          ) : (
            <div style={styles.photoPlaceholder}>
              {(employee.nickname || employee.full_name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 style={styles.name}>{employee.nickname || employee.full_name}</h2>
            {employee.nickname && <div style={styles.fullName}>{employee.full_name}</div>}
            <div style={styles.meta}>{employee.job_title}</div>
            <div style={styles.meta}>
              {[employee.department, employee.team].filter(Boolean).join(' · ')}
            </div>
            <div style={styles.meta}>{employee.employment_status}</div>
          </div>
          <button onClick={() => onEdit(employeeId)} style={styles.editButton}>
            Edit full profile
          </button>
        </div>

        {selfServiceOnly && pendingRequests.length > 0 && (
          <div style={styles.pendingBanner}>
            You have {pendingRequests.length} change request{pendingRequests.length > 1 ? 's' : ''} awaiting HR
            approval.
          </div>
        )}

        <DesignDisciplinePanel
          employeeId={employeeId}
          skills={skills}
          onChanged={load}
          selfServiceOnly={selfServiceOnly}
        />

        {CATEGORIES.map((cat) => (
          <div key={cat} style={styles.section}>
            <h3 style={styles.sectionTitle}>{cat}</h3>
            {byCategory[cat]?.length > 0 ? (
              <ul style={styles.list}>
                {byCategory[cat].map((s) => (
                  <SkillRow key={s.id} entry={s} onChanged={load} selfServiceOnly={selfServiceOnly} />
                ))}
              </ul>
            ) : (
              <p style={styles.empty}>None recorded</p>
            )}
          </div>
        ))}

        <AddSkillForm employeeId={employeeId} onAdded={load} selfServiceOnly={selfServiceOnly} />
      </div>
    </div>
  );
}

// Fixed three-checkbox widget, deliberately not the generic add/edit/
// delete-per-row flow used everywhere else on this card — Architecture/
// Landscape/Interior are a closed set, so this reconciles the three
// checkbox+level states against whatever skills rows already exist
// (create/update/delete as needed) in one "Save", via the same
// add/update/delete endpoints the rest of the card uses.
export function DesignDisciplinePanel({ employeeId, skills, onChanged, selfServiceOnly }) {
  const entries = skills.filter((s) => s.category === DESIGN_DISCIPLINE_CATEGORY);
  const byItem = Object.fromEntries(entries.map((e) => [e.item, e]));

  const [checked, setChecked] = useState(() =>
    Object.fromEntries(DISCIPLINE_ITEMS.map((item) => [item, Boolean(byItem[item])]))
  );
  const [levels, setLevels] = useState(() =>
    Object.fromEntries(DISCIPLINE_ITEMS.map((item) => [item, byItem[item]?.level || '']))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submittedMsg, setSubmittedMsg] = useState('');

  // Re-sync whenever the underlying skills list changes (after a save
  // reloads it, or when switching to a different employee's card).
  useEffect(() => {
    const current = skills.filter((s) => s.category === DESIGN_DISCIPLINE_CATEGORY);
    const currentByItem = Object.fromEntries(current.map((e) => [e.item, e]));
    setChecked(Object.fromEntries(DISCIPLINE_ITEMS.map((item) => [item, Boolean(currentByItem[item])])));
    setLevels(Object.fromEntries(DISCIPLINE_ITEMS.map((item) => [item, currentByItem[item]?.level || ''])));
  }, [skills]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSubmittedMsg('');
    try {
      const results = await Promise.all(
        DISCIPLINE_ITEMS.map(async (item) => {
          const existing = byItem[item];
          const isChecked = checked[item];
          const level = levels[item];
          if (isChecked && !existing) {
            return api.addSkillEntry({ employee_id: employeeId, category: DESIGN_DISCIPLINE_CATEGORY, item, level });
          } else if (isChecked && existing) {
            if ((existing.level || '') !== level) {
              return api.updateSkillEntry({ id: existing.id, category: DESIGN_DISCIPLINE_CATEGORY, item, level });
            }
          } else if (!isChecked && existing) {
            return api.deleteSkillEntry(existing.id);
          }
          return null;
        })
      );
      if (results.some((r) => r?.submitted)) {
        setSubmittedMsg('Submitted — pending HR approval.');
      }
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Design Discipline</h3>
      {selfServiceOnly && <p style={styles.note}>Changes here need HR approval once saved.</p>}
      <div style={styles.disciplineRow}>
        {DISCIPLINE_ITEMS.map((item) => (
          <label key={item} style={styles.disciplineLabel}>
            <input
              type="checkbox"
              checked={checked[item]}
              onChange={(e) => setChecked((c) => ({ ...c, [item]: e.target.checked }))}
            />
            {item}
            {checked[item] && (
              <select
                value={levels[item]}
                onChange={(e) => setLevels((l) => ({ ...l, [item]: e.target.value }))}
                style={styles.disciplineLevel}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l === '' ? 'Level (n/a)' : l}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
        <button onClick={handleSave} disabled={saving} style={styles.addButton}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {submittedMsg && <p style={styles.submittedMsg}>{submittedMsg}</p>}
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

export function AddSkillForm({ employeeId, onAdded, selfServiceOnly }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [item, setItem] = useState('');
  const [level, setLevel] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submittedMsg, setSubmittedMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!item.trim()) return;
    setSaving(true);
    setError('');
    setSubmittedMsg('');
    try {
      const result = await api.addSkillEntry({ employee_id: employeeId, category, item, level, notes });
      setItem('');
      setLevel('');
      setNotes('');
      if (result?.submitted) {
        setSubmittedMsg('Submitted — pending HR approval.');
      }
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.addForm}>
      <h3 style={styles.sectionTitle}>Add entry</h3>
      {selfServiceOnly && <p style={styles.note}>New entries need HR approval once submitted.</p>}
      {submittedMsg && <p style={styles.submittedMsg}>{submittedMsg}</p>}
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.addFormRow}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={styles.input}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          placeholder="Item (e.g. Blender, Bahasa Indonesia, AWS Certified...)"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          style={{ ...styles.input, flex: 2 }}
        />
        <select value={level} onChange={(e) => setLevel(e.target.value)} style={styles.input}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l === '' ? 'Level (n/a)' : l}
            </option>
          ))}
        </select>
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...styles.input, flex: 2 }}
        />
        <button type="submit" disabled={saving} style={styles.addButton}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  );
}

export function SkillRow({ entry, onChanged, selfServiceOnly }) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(entry.category);
  const [item, setItem] = useState(entry.item);
  const [level, setLevel] = useState(entry.level || '');
  const [notes, setNotes] = useState(entry.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submittedMsg, setSubmittedMsg] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (!item.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.updateSkillEntry({ id: entry.id, category, item, level, notes });
      if (result?.submitted) {
        setSubmittedMsg('Submitted — pending HR approval.');
      }
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Remove "${entry.item}"?`)) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.deleteSkillEntry(entry.id);
      if (result?.submitted) {
        setSubmittedMsg('Removal submitted — pending HR approval.');
      }
      onChanged();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li style={styles.editRow}>
        <form onSubmit={handleSave} style={styles.addFormRow}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={styles.input}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input value={item} onChange={(e) => setItem(e.target.value)} style={{ ...styles.input, flex: 2 }} />
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={styles.input}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === '' ? 'Level (n/a)' : l}
              </option>
            ))}
          </select>
          <input
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...styles.input, flex: 2 }}
          />
          <button type="submit" disabled={saving} style={styles.addButton}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} style={styles.cancelButton}>
            Cancel
          </button>
        </form>
        {submittedMsg && <p style={styles.submittedMsg}>{submittedMsg}</p>}
        {error && <p style={styles.error}>{error}</p>}
      </li>
    );
  }

  return (
    <li style={styles.skillRow}>
      <span>
        <strong>{entry.item}</strong>
        {entry.level && ` — ${entry.level}`}
        {entry.notes && <span style={styles.notes}> ({entry.notes})</span>}
      </span>
      <span style={styles.rowActions}>
        <button onClick={() => setEditing(true)} style={styles.rowButton}>
          Edit
        </button>
        <button onClick={handleDelete} disabled={saving} style={styles.rowButton}>
          Delete
        </button>
      </span>
      {submittedMsg && <p style={styles.submittedMsg}>{submittedMsg}</p>}
      {error && <p style={styles.error}>{error}</p>}
    </li>
  );
}

const styles = {
  back: {
    background: 'none',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    padding: 0,
    marginBottom: 8,
    fontSize: 14,
  },
  card: {
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: 24,
    maxWidth: 640,
  },
  header: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 },
  photo: { width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: '#111',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 600,
  },
  name: { margin: 0, fontSize: 20 },
  fullName: { fontSize: 13, color: '#888' },
  meta: { fontSize: 13, color: '#555', marginTop: 2 },
  editButton: {
    marginLeft: 'auto',
    padding: '6px 12px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  section: { marginBottom: 16, borderTop: '1px solid #eee', paddingTop: 12 },
  sectionTitle: { fontSize: 14, margin: '0 0 6px 0' },
  disciplineRow: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' },
  disciplineLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 },
  disciplineLevel: { padding: 4, fontSize: 12, border: '1px solid #ccc', borderRadius: 4 },
  list: { margin: 0, paddingLeft: 0, fontSize: 14, listStyle: 'none' },
  notes: { color: '#777' },
  empty: { fontSize: 13, color: '#aaa', margin: 0 },
  addForm: { borderTop: '1px solid #eee', paddingTop: 12, marginTop: 8 },
  addFormRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 8, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, flex: 1 },
  addButton: {
    padding: '8px 16px',
    fontSize: 13,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  skillRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '4px 0',
  },
  rowActions: { display: 'flex', gap: 6, flexShrink: 0 },
  rowButton: {
    padding: '3px 8px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
  editRow: { padding: '4px 0' },
  cancelButton: {
    padding: '8px 16px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
  note: { fontSize: 12, color: '#888', margin: '0 0 8px 0' },
  submittedMsg: { fontSize: 13, color: '#2a7', margin: '4px 0 0 0' },
  pendingBanner: {
    fontSize: 13,
    background: '#fff8e1',
    border: '1px solid #f0d878',
    borderRadius: 4,
    padding: '8px 12px',
    marginBottom: 16,
  },
  error: { color: '#c00' },
};
