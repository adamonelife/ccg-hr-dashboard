import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'employee_id', label: 'Employee ID', required: true, lockOnEdit: true },
      { key: 'full_name', label: 'Full name', required: true },
      { key: 'nickname', label: 'Nickname (for disambiguation)' },
      { key: 'photo_url', label: 'Photo URL' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
    ],
  },
  {
    title: 'Personal',
    fields: [
      { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
      { key: 'nationality', label: 'Nationality' },
      {
        key: 'religion',
        label: 'Religion (for THR timing)',
        type: 'select',
        options: ['Islam', 'Kristen', 'Katholik', 'Hindu', 'Buddha', 'Konghucu', 'NA'],
      },
      { key: 'emergency_contact_name', label: 'Emergency contact name' },
      { key: 'emergency_contact_phone', label: 'Emergency contact phone' },
      { key: 'emergency_contact_relationship', label: 'Emergency contact relationship' },
    ],
  },
  {
    title: 'Employment status',
    fields: [
      {
        key: 'employment_status',
        label: 'Employment status',
        type: 'select',
        options: ['Active', 'On Leave', 'Notice Period', 'Terminated', 'Resigned'],
      },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'end_date', label: 'End date', type: 'date' },
    ],
  },
  {
    title: 'Organisation',
    fields: [
      { key: 'company', label: 'Company' },
      { key: 'department', label: 'Department', type: 'select', dynamic: 'departments' },
      { key: 'job_title', label: 'Job title' },
      { key: 'team', label: 'Team', type: 'select', dynamic: 'teams' },
      { key: 'manager_id', label: 'Manager (employee ID) — blank if none (e.g. Executive)' },
      { key: 'office_location', label: 'Office location' },
      {
        key: 'permission_role',
        label: 'Permission role (access control, not job title)',
        type: 'select',
        options: ['Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'],
      },
    ],
  },
  {
    title: 'Employment details',
    fields: [
      {
        key: 'employment_type',
        label: 'Employment type',
        type: 'select',
        options: ['Full-time', 'Part-time', 'Contractor', 'Freelance', 'Intern'],
      },
      {
        key: 'contract_type',
        label: 'Contract type',
        type: 'select',
        options: ['PKWT', 'PKWTT'],
      },
      { key: 'contract_start', label: 'Contract start', type: 'date' },
      { key: 'contract_end', label: 'Contract end', type: 'date' },
      { key: 'probation_end_date', label: 'Probation end date', type: 'date' },
    ],
  },
  {
    title: 'Compensation',
    fields: [
      { key: 'current_salary', label: 'Current salary', type: 'number' },
      { key: 'salary_currency', label: 'Currency', type: 'select', options: ['IDR', 'USD'] },
      { key: 'bonus_eligible', label: 'Bonus eligible', type: 'checkbox' },
    ],
  },
  {
    title: 'Compliance',
    fields: [
      { key: 'kitas_expiry', label: 'KITAS expiry', type: 'date' },
      { key: 'passport_expiry', label: 'Passport expiry', type: 'date' },
      { key: 'work_permit_expiry', label: 'Work permit expiry', type: 'date' },
    ],
  },
];

const EMPTY = SECTIONS.flatMap((s) => s.fields).reduce(
  (acc, f) => ({ ...acc, [f.key]: f.type === 'checkbox' ? 'FALSE' : '' }),
  {}
);

export default function EmployeeForm({ employeeId, onSaved, onCancel }) {
  const isEdit = Boolean(employeeId);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Live department/team names from the OrgUnits sheet — powers those two
  // dropdowns so they can't drift out of sync with the real org structure.
  const [orgOptions, setOrgOptions] = useState({ departments: [], teams: [] });

  useEffect(() => {
    if (!isEdit) return;
    api
      .getEmployee(employeeId)
      .then((data) => setForm({ ...EMPTY, ...data.employee }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [employeeId]);

  useEffect(() => {
    api
      .orgUnits()
      .then((data) => setOrgOptions({ departments: data.departments || [], teams: data.teams || [] }))
      .catch(() => {
        // Non-fatal — the form still works, department/team just show as
        // empty dropdowns until OrgUnits is populated or reachable.
      });
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.updateEmployee(form);
      } else {
        await api.createEmployee(form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <button onClick={onCancel} style={styles.back}>
        ← Back to directory
      </button>
      <h2>{isEdit ? form.full_name || 'Edit employee' : 'Add employee'}</h2>

      <form onSubmit={handleSubmit}>
        {SECTIONS.map((section) => (
          <fieldset key={section.title} style={styles.fieldset}>
            <legend style={styles.legend}>{section.title}</legend>
            <div style={styles.grid}>
              {section.fields.map((f) => {
                // Static options (f.options) or live ones pulled from
                // OrgUnits (f.dynamic). Either way, if the employee's
                // current value isn't in the list — e.g. legacy data, or
                // OrgUnits hasn't been updated yet — prepend it rather than
                // silently blank it out on save.
                const baseOptions = f.options || (f.dynamic ? orgOptions[f.dynamic] : []) || [];
                const currentValue = form[f.key];
                const selectOptions =
                  currentValue && !baseOptions.includes(currentValue)
                    ? [currentValue, ...baseOptions]
                    : baseOptions;

                return (
                <label key={f.key} style={styles.label}>
                  {f.label}
                  {f.required && ' *'}
                  {f.type === 'select' ? (
                    <select
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      disabled={isEdit && f.lockOnEdit}
                      required={f.required}
                      style={styles.input}
                    >
                      <option value="">—</option>
                      {selectOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={form[f.key] === 'TRUE'}
                      onChange={(e) => set(f.key, e.target.checked ? 'TRUE' : 'FALSE')}
                      disabled={isEdit && f.lockOnEdit}
                      style={{ alignSelf: 'flex-start' }}
                    />
                  ) : (
                    <input
                      type={f.type || 'text'}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      disabled={isEdit && f.lockOnEdit}
                      required={f.required}
                      style={styles.input}
                    />
                  )}
                </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={saving} style={styles.submit}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create employee'}
        </button>
      </form>

      {isEdit && (
        <>
          <HistoryPanel
            title="Salary history"
            employeeId={employeeId}
            fetcher={api.salaryHistory}
            adder={api.addSalaryEntry}
            columns={[
              { key: 'effective_date', label: 'Effective date', type: 'date' },
              { key: 'amount', label: 'Amount', type: 'number' },
              { key: 'currency', label: 'Currency' },
              { key: 'reason', label: 'Reason' },
            ]}
          />
          <HistoryPanel
            title="Promotion history"
            employeeId={employeeId}
            fetcher={api.promotionHistory}
            adder={api.addPromotionEntry}
            columns={[
              { key: 'date', label: 'Date', type: 'date' },
              { key: 'previous_title', label: 'Previous title' },
              { key: 'new_title', label: 'New title' },
              { key: 'notes', label: 'Notes' },
            ]}
          />
        </>
      )}
    </div>
  );
}

function HistoryPanel({ title, employeeId, fetcher, adder, columns }) {
  const [rows, setRows] = useState([]);
  const [entry, setEntry] = useState({});
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    load();
  }, [employeeId]);

  function load() {
    fetcher(employeeId)
      .then((data) => setRows(data.history || []))
      .catch((e) => setError(e.message));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError('');
    try {
      await adder({ employee_id: employeeId, ...entry });
      setEntry({});
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={styles.panel}>
      <h3>{title}</h3>
      {error && <p style={styles.error}>{error}</p>}
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={styles.th}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} style={styles.td}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={columns.length}>
                No entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form onSubmit={handleAdd} style={styles.inlineForm}>
        {columns.map((c) => (
          <input
            key={c.key}
            type={c.type || 'text'}
            placeholder={c.label}
            value={entry[c.key] ?? ''}
            onChange={(e) => setEntry((v) => ({ ...v, [c.key]: e.target.value }))}
            style={styles.inlineInput}
          />
        ))}
        <button type="submit" disabled={adding} style={styles.addButton}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>
    </div>
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
  fieldset: { border: '1px solid #ddd', borderRadius: 6, marginBottom: 16, padding: 16 },
  legend: { fontWeight: 600, padding: '0 6px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', fontSize: 13, color: '#444', gap: 4 },
  input: { padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 },
  submit: {
    padding: '10px 20px',
    fontSize: 14,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
    marginBottom: 32,
  },
  error: { color: '#c00' },
  panel: { marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #ddd', color: '#555' },
  td: { padding: '6px 8px', borderBottom: '1px solid #eee' },
  inlineForm: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  inlineInput: { padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, flex: '1 1 140px' },
  addButton: {
    padding: '6px 14px',
    fontSize: 13,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
};
