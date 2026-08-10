import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { DesignDisciplinePanel, AddSkillForm, SkillRow, CATEGORIES } from './EmployeeCard.jsx';

// Forced first-login onboarding gate. Shown instead of the whole app
// (no nav, no logout-and-skip) whenever /api/auth/me comes back with a
// real employee_id but profile_setup_completed_at is still null — see
// App.jsx. Personal-detail fields here are exactly
// lib/employees.mjs's SELF_SERVICE_FIELDS, in the same order; skills/
// Design Discipline reuse the identical widgets from EmployeeCard.jsx so
// nothing about how an entry looks or saves differs between "filling this
// in for the first time" and "editing it later."
//
// Every save made from this screen lands directly (no change-request
// detour) — lib/employees.mjs's PATCH handler and lib/skills.mjs's
// POST/PATCH/DELETE handlers both check profile_setup_completed_at
// themselves and skip the approval step until it's set, so there's
// nothing extra to coordinate here. "Finish setup" is just the PATCH that
// flips that flag (complete_setup: true), sent together with whatever's
// currently in the details form.
const FIELDS = [
  { key: 'nickname', label: 'Nickname', type: 'text' },
  { key: 'photo_url', label: 'Photo URL', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'emergency_contact_name', label: 'Emergency contact name', type: 'text' },
  { key: 'emergency_contact_phone', label: 'Emergency contact phone', type: 'text' },
  { key: 'emergency_contact_relationship', label: 'Emergency contact relationship', type: 'text' },
  { key: 'nationality', label: 'Nationality', type: 'text' },
  { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
  { key: 'religion', label: 'Religion', type: 'text' },
  { key: 'office_location', label: 'Office location', type: 'text' },
];

export default function Setup({ employeeId, onFinished }) {
  const [employee, setEmployee] = useState(null);
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');

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
        setForm(Object.fromEntries(FIELDS.map((f) => [f.key, empData.employee?.[f.key] || ''])));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  async function handleSaveDetails(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedNote('');
    try {
      const data = await api.updateEmployee({ employee_id: employeeId, ...form });
      setEmployee(data.employee);
      setSavedNote('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    setError('');
    try {
      const data = await api.updateEmployee({ employee_id: employeeId, ...form, complete_setup: true });
      setEmployee(data.employee);
      onFinished();
    } catch (err) {
      setError(err.message);
      setFinishing(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (!employee) return error ? <p style={styles.error}>{error}</p> : null;

  const byCategory = {};
  for (const s of skills) {
    (byCategory[s.category] ||= []).push(s);
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Welcome, {employee.nickname || employee.full_name}</h1>
        <p style={styles.intro}>
          Before you can use the rest of the app, take a minute to fill in your details and skills below.
          Once you click "Finish setup", any further changes to your card will need HR sign-off — this first
          pass doesn't.
        </p>

        {error && <p style={styles.error}>{error}</p>}

        <form onSubmit={handleSaveDetails} style={styles.section}>
          <h3 style={styles.sectionTitle}>Your details</h3>
          <p style={styles.confirmNote}>
            We've already filled in what we have on file — please check it's correct and fill in anything
            that's missing or out of date.
          </p>
          <div style={styles.grid}>
            {FIELDS.map((f) => (
              <label key={f.key} style={styles.fieldLabel}>
                {f.label}
                <input
                  type={f.type}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  style={styles.input}
                />
              </label>
            ))}
          </div>
          <div style={styles.detailsActions}>
            <button type="submit" disabled={saving} style={styles.saveButton}>
              {saving ? 'Saving…' : 'Save details'}
            </button>
            {savedNote && <span style={styles.savedNote}>{savedNote}</span>}
          </div>
        </form>

        <div style={styles.section}>
          <DesignDisciplinePanel employeeId={employeeId} skills={skills} onChanged={load} />
        </div>

        {CATEGORIES.map((cat) => (
          <div key={cat} style={styles.section}>
            <h3 style={styles.sectionTitle}>{cat}</h3>
            {byCategory[cat]?.length > 0 ? (
              <ul style={styles.list}>
                {byCategory[cat].map((s) => (
                  <SkillRow key={s.id} entry={s} onChanged={load} />
                ))}
              </ul>
            ) : (
              <p style={styles.empty}>None recorded</p>
            )}
          </div>
        ))}

        <AddSkillForm employeeId={employeeId} onAdded={load} />

        <div style={styles.finishRow}>
          <button onClick={handleFinish} disabled={finishing} style={styles.finishButton}>
            {finishing ? 'Finishing…' : 'Finish setup and enter the app'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f5f5f5', padding: 24, display: 'flex', justifyContent: 'center' },
  card: {
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: 32,
    maxWidth: 720,
    width: '100%',
    height: 'fit-content',
    fontFamily: 'system-ui, sans-serif',
  },
  title: { margin: '0 0 8px 0', fontSize: 22 },
  intro: { color: '#555', fontSize: 14, lineHeight: 1.5, marginBottom: 24 },
  section: { marginBottom: 16, borderTop: '1px solid #eee', paddingTop: 16 },
  sectionTitle: { fontSize: 14, margin: '0 0 10px 0' },
  confirmNote: {
    fontSize: 13,
    color: '#555',
    background: '#f5f5f5',
    border: '1px solid #e5e5e5',
    borderRadius: 4,
    padding: '8px 12px',
    margin: '0 0 14px 0',
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  fieldLabel: { display: 'flex', flexDirection: 'column', fontSize: 12, color: '#555', gap: 4 },
  input: { padding: 8, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 },
  detailsActions: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 },
  saveButton: {
    padding: '8px 16px',
    fontSize: 13,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  savedNote: { fontSize: 13, color: '#2a7' },
  list: { margin: 0, paddingLeft: 0, fontSize: 14, listStyle: 'none' },
  empty: { fontSize: 13, color: '#aaa', margin: 0 },
  finishRow: { borderTop: '1px solid #eee', paddingTop: 20, marginTop: 8, display: 'flex', justifyContent: 'flex-end' },
  finishButton: {
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  error: { color: '#c00' },
};
