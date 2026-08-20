import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';

// Mirrors lib/permissions.mjs's FULL_VISIBILITY_ROLES and
// lib/employees.mjs's SELF_SERVICE_FIELDS — UI-only copies (the real
// enforcement is server-side); used here just to disable the fields a
// self-editing, non-trusted employee can't touch, and to switch the save
// button's behaviour/copy between "saves immediately" and "submits for
// HR approval." Keep in sync with those two if either list ever changes.
const FULL_VISIBILITY_ROLES = ['Administrator', 'Director', 'HR'];
const SELF_SERVICE_FIELDS = [
  'nickname',
  'photo_url',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'nationality',
  'date_of_birth',
  'religion',
  'office_location',
];

// `titleKey`/field `labelKey`s look up translations at render time (see
// `t(`employeeForm.section.${titleKey}`)` / `t(`employeeForm.field.${f.key}`)`
// below) — this array stays module-scope (used by EMPTY below, outside any
// component) so it can't call hooks directly; only the field `key` and
// `religion`'s option *values* stay untranslated (they're DB values, not
// display text — same reasoning as DESIGN_DISCIPLINE_CATEGORY in
// EmployeeCard.jsx).
const SECTIONS = [
  {
    titleKey: 'identity',
    fields: [
      { key: 'employee_id', required: true, lockOnEdit: true },
      { key: 'full_name', required: true },
      { key: 'nickname' },
      { key: 'photo_url' },
      { key: 'email' },
      { key: 'phone' },
    ],
  },
  {
    titleKey: 'personal',
    fields: [
      { key: 'date_of_birth', type: 'date' },
      { key: 'address' },
      { key: 'nationality' },
      {
        key: 'religion',
        type: 'select',
        options: ['Islam', 'Kristen', 'Katholik', 'Hindu', 'Buddha', 'Konghucu', 'NA'],
      },
      { key: 'emergency_contact_name' },
      { key: 'emergency_contact_phone' },
      { key: 'emergency_contact_relationship' },
    ],
  },
  {
    titleKey: 'employmentStatus',
    fields: [
      {
        key: 'employment_status',
        type: 'select',
        options: ['Active', 'On Leave', 'Notice Period', 'Terminated', 'Resigned'],
      },
      { key: 'start_date', type: 'date' },
      { key: 'end_date', type: 'date' },
    ],
  },
  {
    titleKey: 'organisation',
    fields: [
      { key: 'company' },
      { key: 'department', type: 'select', dynamic: 'departments' },
      { key: 'job_title' },
      { key: 'team', type: 'select', dynamic: 'teams' },
      { key: 'manager_id' },
      { key: 'office_location' },
      {
        key: 'permission_role',
        type: 'select',
        options: ['Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'],
      },
    ],
  },
  {
    titleKey: 'employmentDetails',
    fields: [
      {
        key: 'employment_type',
        type: 'select',
        options: ['Full-time', 'Part-time', 'Contractor', 'Freelance', 'Intern'],
      },
      {
        key: 'contract_type',
        type: 'select',
        options: ['PKWT', 'PKWTT'],
      },
      { key: 'contract_start', type: 'date' },
      { key: 'contract_end', type: 'date' },
      { key: 'probation_end_date', type: 'date' },
    ],
  },
  {
    titleKey: 'compensation',
    fields: [
      { key: 'current_salary', type: 'number' },
      { key: 'salary_currency', type: 'select', options: ['IDR', 'USD'] },
      { key: 'bonus_eligible', type: 'checkbox' },
    ],
  },
  {
    titleKey: 'compliance',
    fields: [
      { key: 'kitas_expiry', type: 'date' },
      { key: 'passport_expiry', type: 'date' },
      { key: 'work_permit_expiry', type: 'date' },
    ],
  },
];

const EMPTY = SECTIONS.flatMap((s) => s.fields).reduce(
  (acc, f) => ({ ...acc, [f.key]: f.type === 'checkbox' ? 'FALSE' : '' }),
  {}
);

export default function EmployeeForm({ employeeId, session, onSaved, onCancel }) {
  const isEdit = Boolean(employeeId);
  const t = useT();
  // Self-editing your own record without being one of the trusted roles
  // means every field outside SELF_SERVICE_FIELDS is read-only, and saving
  // submits a change request instead of writing immediately — see
  // lib/employees.mjs's PATCH handler, which enforces the same thing
  // server-side regardless of what this does client-side.
  const isSelfEdit = isEdit && session?.employee_id === employeeId;
  const isTrusted = FULL_VISIBILITY_ROLES.includes(session?.role);
  const selfServiceOnly = isSelfEdit && !isTrusted;

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [submittedMsg, setSubmittedMsg] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);
  // Live department/team names from the OrgUnits sheet — powers those two
  // dropdowns so they can't drift out of sync with the real org structure.
  const [orgOptions, setOrgOptions] = useState({ departments: [], teams: [] });

  useEffect(() => {
    if (!isEdit) {
      // New employee — suggest the next ID (highest existing CCG-### + 1)
      // rather than making them figure it out. Still editable, just a
      // default, in case the convention ever needs a one-off override.
      api
        .getNextEmployeeId()
        .then((data) => setForm((f) => ({ ...f, employee_id: data.next_id })))
        .catch(() => {
          // Non-fatal — they can just type an ID themselves.
        });
      return;
    }
    api
      .getEmployee(employeeId)
      .then((data) => setForm({ ...EMPTY, ...data.employee }))
      .catch((e) => setError(t.err(e.message)))
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

  useEffect(() => {
    if (!selfServiceOnly) return;
    loadPendingRequests();
  }, [employeeId, selfServiceOnly]);

  function loadPendingRequests() {
    api
      .myChangeRequests(employeeId)
      .then((data) => setPendingRequests((data.requests || []).filter((r) => r.status === 'Pending')))
      .catch(() => {
        // Non-fatal — the form still works without the pending-requests banner.
      });
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSubmittedMsg('');
    try {
      if (isEdit) {
        // Self-service, non-trusted: only the allowed fields are editable
        // anyway (see the disabled inputs below), but send just those —
        // no reason to round-trip the rest, and it keeps the diff HR sees
        // on the change request limited to what actually changed here.
        const payload = selfServiceOnly
          ? Object.fromEntries(
              Object.entries(form).filter(([k]) => k === 'employee_id' || SELF_SERVICE_FIELDS.includes(k))
            )
          : form;
        const data = await api.updateEmployee(payload);
        if (data.submitted) {
          setSubmittedMsg(t('employeeForm.submittedMsg'));
          loadPendingRequests();
          setSaving(false);
          return;
        }
      } else {
        await api.createEmployee(form);
      }
      onSaved();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('employeeForm.deleteConfirm', { name: form.full_name || employeeId }))) {
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await api.deleteEmployee(employeeId);
      onCancel();
    } catch (err) {
      setError(t.err(err.message));
      setDeleting(false);
    }
  }

  if (loading) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <button onClick={onCancel} style={styles.back}>
        {t('employeeForm.backToDirectory')}
      </button>
      <h2>{isEdit ? form.full_name || t('employeeForm.editEmployee') : t('employeeForm.addEmployee')}</h2>
      {isEdit && !selfServiceOnly && (
        <button onClick={handleDelete} disabled={deleting} style={styles.deleteButton}>
          {deleting ? t('employeeForm.deleting') : t('employeeForm.deleteEmployee')}
        </button>
      )}

      {selfServiceOnly && <p style={styles.note}>{t('employeeForm.selfServiceNote')}</p>}

      {selfServiceOnly && pendingRequests.length > 0 && (
        <div style={styles.pendingBanner}>
          {t('employeeForm.pendingBanner', { count: pendingRequests.length })}
        </div>
      )}

      {submittedMsg && <p style={styles.submittedMsg}>{submittedMsg}</p>}

      <form onSubmit={handleSubmit}>
        {SECTIONS.map((section) => (
          <fieldset key={section.titleKey} style={styles.fieldset}>
            <legend style={styles.legend}>{t(`employeeForm.section.${section.titleKey}`)}</legend>
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
                const locked = (isEdit && f.lockOnEdit) || (selfServiceOnly && !SELF_SERVICE_FIELDS.includes(f.key));
                const label = t(`employeeForm.field.${f.key}`);

                return (
                <label key={f.key} style={styles.label}>
                  {label}
                  {f.required && ' *'}
                  {f.type === 'select' ? (
                    <select
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      disabled={locked}
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
                      disabled={locked}
                      style={{ alignSelf: 'flex-start' }}
                    />
                  ) : (
                    <input
                      type={f.type || 'text'}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      disabled={locked}
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
          {saving
            ? t('common.saving')
            : isEdit
              ? selfServiceOnly
                ? t('employeeForm.requestChange')
                : t('employeeForm.saveChanges')
              : t('employeeForm.createEmployee')}
        </button>
      </form>

      {isEdit && !selfServiceOnly && (
        <>
          <AccountPanel employeeId={employeeId} defaultEmail={form.email} t={t} />
          <HistoryPanel
            title={t('employeeForm.salaryHistory')}
            employeeId={employeeId}
            fetcher={api.salaryHistory}
            adder={api.addSalaryEntry}
            t={t}
            columns={[
              { key: 'effective_date', label: t('employeeForm.effectiveDate'), type: 'date' },
              { key: 'amount', label: t('employeeForm.amount'), type: 'number' },
              { key: 'currency', label: t('employeeForm.currency') },
              { key: 'reason', label: t('employeeForm.reason') },
            ]}
          />
          <HistoryPanel
            title={t('employeeForm.promotionHistory')}
            employeeId={employeeId}
            fetcher={api.promotionHistory}
            adder={api.addPromotionEntry}
            t={t}
            columns={[
              { key: 'date', label: t('employeeForm.date'), type: 'date' },
              { key: 'previous_title', label: t('employeeForm.previousTitle') },
              { key: 'new_title', label: t('employeeForm.newTitle') },
              { key: 'notes', label: t('common.notes') },
            ]}
          />
        </>
      )}
    </div>
  );
}

// Login account management (Phase 3). Generates a one-time setup link and
// tries to email it straight to the address entered below via Gmail
// (lib/accounts.mjs/lib/gmail-client.mjs — requires GMAIL_SEND_AS +
// domain-wide delegation to be set up, see SETUP.md step 6). The link is
// always shown too regardless of whether the email sent, so there's still
// a manual fallback (Slack, WhatsApp, whatever) if delegation isn't set up
// yet or the send fails for some reason. Same action works to reset a
// forgotten password later (a fresh link/email just lets them set a new one).
function AccountPanel({ employeeId, defaultEmail, t }) {
  const [account, setAccount] = useState(null);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [emailStatus, setEmailStatus] = useState(null); // { sent, error, to } | null
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [employeeId]);

  function load() {
    setLoading(true);
    api
      .getAccountStatus(employeeId)
      .then((data) => {
        setAccount(data.account);
        setEmail(data.account?.email || defaultEmail || '');
      })
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError('');
    setLink('');
    setEmailStatus(null);
    try {
      const data = await api.createAccount(employeeId, email);
      setLink(data.setup_url || `${window.location.origin}/?setup=${data.setup_token}`);
      setEmailStatus({ sent: data.email_sent, error: data.email_error, to: email });
      load();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div style={styles.panel}>
      <h3>{t('employeeForm.loginAccount')}</h3>
      {error && <p style={styles.error}>{error}</p>}

      {account && (
        <p style={{ fontSize: 13, color: '#555' }}>
          {account.email} —{' '}
          {account.has_password
            ? `${t('employeeForm.accountActive')}${
                account.last_login_at
                  ? t('employeeForm.accountLastLogin', {
                      date: new Date(account.last_login_at).toLocaleDateString(),
                    })
                  : t('employeeForm.accountNeverLoggedIn')
              }`
            : account.setup_pending
              ? t('employeeForm.accountSetupPending')
              : t('employeeForm.accountNoPassword')}
        </p>
      )}

      <form onSubmit={handleCreate} style={styles.inlineForm}>
        <input
          type="email"
          placeholder={t('employeeForm.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.inlineInput}
        />
        <button type="submit" disabled={saving} style={styles.addButton}>
          {saving ? t('employeeForm.sendingLogin') : account ? t('employeeForm.resendLogin') : t('employeeForm.createLogin')}
        </button>
      </form>

      {emailStatus && (
        <p style={emailStatus.sent ? styles.emailSent : styles.emailFailed}>
          {emailStatus.sent
            ? t('employeeForm.emailSent', { email: emailStatus.to })
            : t('employeeForm.emailFailed', { detail: emailStatus.error ? ` (${emailStatus.error})` : '' })}
        </p>
      )}

      {link && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <p style={{ margin: '0 0 4px 0', color: '#555' }}>{t('employeeForm.linkFallbackNote')}</p>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            style={{ ...styles.inlineInput, flex: 1, width: '100%' }}
          />
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ title, employeeId, fetcher, adder, columns, t }) {
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
      .catch((e) => setError(t.err(e.message)));
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
      setError(t.err(err.message));
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
                {t('employeeForm.noEntriesYet')}
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
          {adding ? t('common.adding') : t('common.add')}
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
  deleteButton: {
    float: 'right',
    padding: '6px 14px',
    fontSize: 13,
    border: '1px solid #c00',
    borderRadius: 4,
    background: '#fff',
    color: '#c00',
    cursor: 'pointer',
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
  note: { fontSize: 13, color: '#555', margin: '0 0 12px 0' },
  pendingBanner: {
    fontSize: 13,
    background: '#fff8e1',
    border: '1px solid #f0d878',
    borderRadius: 4,
    padding: '8px 12px',
    marginBottom: 12,
  },
  submittedMsg: { fontSize: 13, color: '#2a7', marginBottom: 12 },
  emailSent: { fontSize: 13, color: '#2a7', margin: '8px 0 0 0' },
  emailFailed: { fontSize: 13, color: '#a60', margin: '8px 0 0 0' },
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
