import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Keep in sync with CATEGORIES in lib/skills.mjs.
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

export default function EmployeeCard({ employeeId, onBack, onEdit }) {
  const [employee, setEmployee] = useState(null);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

        {CATEGORIES.map((cat) => (
          <div key={cat} style={styles.section}>
            <h3 style={styles.sectionTitle}>{cat}</h3>
            {byCategory[cat]?.length > 0 ? (
              <ul style={styles.list}>
                {byCategory[cat].map((s, i) => (
                  <li key={i}>
                    <strong>{s.item}</strong>
                    {s.level && ` — ${s.level}`}
                    {s.notes && <span style={styles.notes}> ({s.notes})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={styles.empty}>None recorded</p>
            )}
          </div>
        ))}

        <AddSkillForm employeeId={employeeId} onAdded={load} />
      </div>
    </div>
  );
}

function AddSkillForm({ employeeId, onAdded }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [item, setItem] = useState('');
  const [level, setLevel] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!item.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.addSkillEntry({ employee_id: employeeId, category, item, level, notes });
      setItem('');
      setLevel('');
      setNotes('');
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
        <input
          placeholder="Level (optional)"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={styles.input}
        />
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
  list: { margin: 0, paddingLeft: 20, fontSize: 14 },
  notes: { color: '#777' },
  empty: { fontSize: 13, color: '#aaa', margin: 0 },
  addForm: { borderTop: '1px solid #eee', paddingTop: 12, marginTop: 8 },
  addFormRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
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
  error: { color: '#c00' },
};
