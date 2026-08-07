import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Matches lib/documents.mjs exactly — kept as plain arrays here (UI-only
// convenience, same pattern as Leave.jsx's LEAVE_TYPES); the actual
// enforcement is server-side.
const DOCUMENT_TYPES = [
  'Employment Contract', 'NDA', 'Passport', 'KITAS', 'Tax Document',
  'Qualification', 'Certificate', 'Signed Policy', 'Performance Review', 'Other',
];
// Personal documents: who sees everyone's, not just their own. Deliberately
// includes Finance here, unlike the org-chart-scoped modules elsewhere.
const DOC_FULL_VISIBILITY_ROLES = ['Administrator', 'HR', 'Finance', 'Director'];
// Company documents: who can upload/delete (not Finance, not leads).
const COMPANY_UPLOAD_ROLES = ['Administrator', 'HR', 'Director'];
// Low to high — a company document's access_role is the minimum tier that
// can see it; picking "Team Lead" means Team Lead and everyone above see
// it, Employees don't.
const ROLE_RANK = ['Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'];

export default function Documents({ session }) {
  const canSeeEveryonesPersonal = DOC_FULL_VISIBILITY_ROLES.includes(session?.role);
  const canUploadCompany = COMPANY_UPLOAD_ROLES.includes(session?.role);

  return (
    <div>
      <h2>Documents</h2>

      {session?.employee_id ? (
        <MyDocuments employeeId={session.employee_id} />
      ) : (
        <p style={styles.hint}>
          This login isn't linked to an employee record, so there's no personal document list to show here — company
          documents below still work.
        </p>
      )}

      {canSeeEveryonesPersonal && <EmployeeDocuments />}

      <CompanyDocuments canUpload={canUploadCompany} />
    </div>
  );
}

// ─── Personal documents ────────────────────────────────────────────────

function MyDocuments({ employeeId }) {
  return (
    <div style={styles.section}>
      <h3>My documents</h3>
      <DocumentsPanel employeeId={employeeId} />
    </div>
  );
}

function EmployeeDocuments() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');

  useEffect(() => {
    api
      .listEmployees()
      .then((data) => setEmployees(data.employees || []))
      .catch(() => {});
  }, []);

  return (
    <div style={styles.section}>
      <h3>Employee documents</h3>
      <p style={styles.hint}>Pick anyone to view or add to their personal documents.</p>
      <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={styles.input}>
        <option value="">— select employee —</option>
        {employees.map((emp) => (
          <option key={emp.employee_id} value={emp.employee_id}>
            {emp.nickname || emp.full_name} ({emp.employee_id})
          </option>
        ))}
      </select>
      <DocumentsPanel employeeId={employeeId} />
    </div>
  );
}

// Shared by MyDocuments and EmployeeDocuments — same table + add form,
// just pointed at a different employee_id. Renders nothing until an
// employee is actually chosen (EmployeeDocuments starts with none picked).
function DocumentsPanel({ employeeId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    if (!employeeId) return;
    setLoading(true);
    setError('');
    api
      .documents(employeeId)
      .then((data) => setDocuments(data.documents || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [employeeId]);

  async function handleDelete(id) {
    if (
      !window.confirm(
        'Delete this document record? This only removes it from the dashboard — the file itself, if it lives in Drive, is untouched.'
      )
    )
      return;
    try {
      await api.deleteDocument(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!employeeId) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {loading && <p>Loading…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Link</th>
              <th style={styles.th}>Expiry</th>
              <th style={styles.th}>Notes</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id}>
                <td style={styles.td}>{d.document_type}</td>
                <td style={styles.td}>
                  {d.drive_link ? (
                    <a href={d.drive_link} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={styles.td}>{d.expiry_date || ''}</td>
                <td style={styles.td}>{d.notes}</td>
                <td style={styles.td}>
                  <button onClick={() => handleDelete(d.id)} style={styles.rowButton}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td style={styles.td} colSpan={5}>
                  No documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <AddDocumentForm employeeId={employeeId} onAdded={load} />
    </div>
  );
}

function AddDocumentForm({ employeeId, onAdded }) {
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [file, setFile] = useState(null);
  const [driveLink, setDriveLink] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (file) {
        const formData = new FormData();
        formData.append('employee_id', employeeId);
        formData.append('document_type', documentType);
        if (expiryDate) formData.append('expiry_date', expiryDate);
        if (notes) formData.append('notes', notes);
        formData.append('file', file, file.name);
        await api.addDocumentWithFile(formData);
      } else {
        await api.addDocument({
          employee_id: employeeId,
          document_type: documentType,
          drive_link: driveLink,
          expiry_date: expiryDate || undefined,
          notes,
        });
      }
      setFile(null);
      setDriveLink('');
      setExpiryDate('');
      setNotes('');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...styles.inlineForm, marginTop: 10 }}>
      <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} style={styles.input}>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} style={styles.input} />
      <span style={styles.orHint}>or</span>
      <input
        placeholder="Paste a Google Drive link instead"
        value={driveLink}
        onChange={(e) => setDriveLink(e.target.value)}
        disabled={!!file}
        style={{ ...styles.input, flex: 2 }}
      />
      <input
        type="date"
        value={expiryDate}
        onChange={(e) => setExpiryDate(e.target.value)}
        title="Expiry date (optional)"
        style={styles.input}
      />
      <input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ ...styles.input, flex: 1 }}
      />
      <button type="submit" disabled={saving} style={styles.addButton}>
        {saving ? 'Adding…' : 'Add document'}
      </button>
      {error && <p style={styles.error}>{error}</p>}
    </form>
  );
}

// ─── Company documents ─────────────────────────────────────────────────

function CompanyDocuments({ canUpload }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    api
      .companyDocuments()
      .then((data) => setDocuments(data.documents || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id) {
    if (!window.confirm('Delete this company document?')) return;
    try {
      await api.deleteCompanyDocument(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const byFolder = {};
  for (const d of documents) {
    (byFolder[d.folder] ||= []).push(d);
  }
  const folders = Object.keys(byFolder).sort();

  return (
    <div style={styles.section}>
      <h3>Company documents</h3>
      {loading && <p>Loading…</p>}
      {error && <p style={styles.error}>{error}</p>}
      {!loading && folders.length === 0 && (
        <p style={styles.hint}>Nothing here yet{canUpload ? ' — add the first one below.' : '.'}</p>
      )}

      {!loading &&
        folders.map((folder) => (
          <div key={folder} style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 4 }}>{folder}</h4>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Minimum access</th>
                  <th style={styles.th}>Link</th>
                  <th style={styles.th}>Notes</th>
                  {canUpload && <th style={styles.th}></th>}
                </tr>
              </thead>
              <tbody>
                {byFolder[folder].map((d) => (
                  <tr key={d.id}>
                    <td style={styles.td}>{d.title}</td>
                    <td style={styles.td}>{d.access_role}</td>
                    <td style={styles.td}>
                      {d.drive_link ? (
                        <a href={d.drive_link} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={styles.td}>{d.notes}</td>
                    {canUpload && (
                      <td style={styles.td}>
                        <button onClick={() => handleDelete(d.id)} style={styles.rowButton}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {canUpload && <AddCompanyDocumentForm onAdded={load} />}
    </div>
  );
}

function AddCompanyDocumentForm({ onAdded }) {
  const [accessRole, setAccessRole] = useState('Employee');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [driveLink, setDriveLink] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (file) {
        const formData = new FormData();
        formData.append('access_role', accessRole);
        formData.append('title', title);
        if (notes) formData.append('notes', notes);
        formData.append('file', file, file.name);
        await api.addCompanyDocumentWithFile(formData);
      } else {
        await api.addCompanyDocument({ access_role: accessRole, title, drive_link: driveLink, notes });
      }
      setTitle('');
      setFile(null);
      setDriveLink('');
      setNotes('');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p style={styles.hint}>
        Documents are grouped by access tier — picking "Team Lead" both controls who can see it (Team Lead and
        everyone above: Main Lead, HR, Finance, Director, Administrator — plain Employees won't) and which folder it
        lands in. Uploading a file puts it in that tier's auto-created Drive folder (Company/{accessRole}); pasting a
        link instead leaves it wherever it already lives.
      </p>
      <form onSubmit={handleSubmit} style={styles.inlineForm}>
        <select value={accessRole} onChange={(e) => setAccessRole(e.target.value)} style={styles.input}>
          {ROLE_RANK.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ ...styles.input, flex: 1 }}
        />
        <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} style={styles.input} />
        <span style={styles.orHint}>or</span>
        <input
          placeholder="Paste a Google Drive link instead"
          value={driveLink}
          onChange={(e) => setDriveLink(e.target.value)}
          disabled={!!file}
          style={{ ...styles.input, flex: 2 }}
        />
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...styles.input, flex: 1 }}
        />
        <button type="submit" disabled={saving} style={styles.addButton}>
          {saving ? 'Adding…' : 'Add document'}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  section: { marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 },
  hint: { color: '#666', fontSize: 13 },
  orHint: { fontSize: 12, color: '#999' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', color: '#555' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee' },
  error: { color: '#c00' },
  inlineForm: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 8, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 },
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
