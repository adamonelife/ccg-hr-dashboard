import { useUI } from "../lib/presentation.jsx";
import {
  PageHeading,
  Button,
  Input,
  Select,
  Table,
  Badge,
  Loading,
  EmptyState,
  Feedback,
  useFeedback,
} from "../components/ui.jsx";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useT } from "../lib/i18n.jsx";

// Matches lib/documents.mjs exactly — kept as plain arrays here (UI-only
// convenience, same pattern as Leave.jsx's LEAVE_TYPES); the actual
// enforcement is server-side.
const DOCUMENT_TYPES = [
  "Employment Contract",
  "NDA",
  "Passport",
  "KITAS",
  "Tax Document",
  "Qualification",
  "Certificate",
  "Signed Policy",
  "Performance Review",
  "Other",
];
// Personal documents: who sees everyone's, not just their own. Deliberately
// includes Finance here, unlike the org-chart-scoped modules elsewhere.
const DOC_FULL_VISIBILITY_ROLES = [
  "Administrator",
  "HR",
  "Finance",
  "Director",
];
// Of the roles above, HR/Finance have the Director/Administrator exclusion
// (mirrors lib/permissions.mjs's RESTRICTED_TARGET_ROLES) — used to filter
// the "pick anyone" dropdown below so it doesn't offer someone the backend
// would just 403 on.
const RESTRICTED_VIEWER_ROLES = ["HR", "Finance"];
const RESTRICTED_TARGET_ROLES = ["Director", "Administrator"];
// Company documents: who can upload/delete (not leads). Finance added per
// Adam's explicit ask for HR/Finance parity — mirrors lib/documents.mjs's
// COMPANY_UPLOAD_ROLES.
const COMPANY_UPLOAD_ROLES = ["Administrator", "HR", "Director", "Finance"];
// Low to high — a company document's access_role is the minimum tier that
// can see it; picking "Team Lead" means Team Lead and everyone above see
// it, Employees don't.
const ROLE_RANK = [
  "Employee",
  "Team Lead",
  "Main Lead",
  "HR",
  "Finance",
  "Director",
  "Administrator",
];
export default function Documents({ session }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const canSeeEveryonesPersonal = DOC_FULL_VISIBILITY_ROLES.includes(
    session?.role,
  );
  const canUploadCompany = COMPANY_UPLOAD_ROLES.includes(session?.role);
  return (
    <>
      <div>
        <PageHeading title={t("documents.title")} />

        {session?.employee_id ? (
          <MyDocuments employeeId={session.employee_id} />
        ) : (
          <p className="np-muted">{t("documents.noRecordHint")}</p>
        )}

        {canSeeEveryonesPersonal && <EmployeeDocuments role={session?.role} />}

        <CompanyDocuments canUpload={canUploadCompany} />
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}

// ─── Personal documents ────────────────────────────────────────────────

function MyDocuments({ employeeId }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  return (
    <>
      <div className="np-section">
        <h3>{t("documents.myDocuments")}</h3>
        <DocumentsPanel key={employeeId} employeeId={employeeId} />
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function EmployeeDocuments({ role }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  useEffect(() => {
    api
      .listEmployees()
      .then((data) => setEmployees(data.employees || []))
      .catch(() => {});
  }, []);

  // HR/Finance: drop Director/Administrator from the picker entirely —
  // the backend would 403 on them anyway (lib/documents.mjs's
  // canViewPersonalDocs), so there's nothing to usefully pick them for.
  const pickable = RESTRICTED_VIEWER_ROLES.includes(role)
    ? employees.filter((emp) => emp.can_view_detail)
    : employees;
  return (
    <>
      <div className="np-section">
        <h3>{t("documents.employeeDocuments")}</h3>
        <p className="np-muted">{t("documents.pickAnyoneHint")}</p>
        <Select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="np-input"
          label={t.lang === "id" ? "Karyawan" : "Employee"}
        >
          <option value="">{t("documents.selectEmployeeOption")}</option>
          {pickable.map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>
              {emp.nickname || emp.full_name} ({emp.employee_id})
            </option>
          ))}
        </Select>
        <DocumentsPanel key={employeeId} employeeId={employeeId} />
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}

// Shared by MyDocuments and EmployeeDocuments — same table + add form,
// just pointed at a different employee_id. Renders nothing until an
// employee is actually chosen (EmployeeDocuments starts with none picked).
function DocumentsPanel({ employeeId }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [documents, setDocuments] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  function load() {
    if (!employeeId) return;
    setLoading(true);
    setError("");
    api
      .documents(employeeId)
      .then((data) => setDocuments(data.documents || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, [employeeId]);
  async function handleDelete(id) {
    if (
      !(await confirm({
        title: t("documents.deleteConfirm"),
      }))
    )
      return;
    setDeletingId(id);
    try {
      await api.deleteDocument(id);
      setActionResult(u("deleted"));
      notify(u("deleted"));
      load();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setDeletingId(null);
    }
  }
  if (!employeeId) return null;
  return (
    <>
      <div
        style={{
          marginTop: "var(--space-8)",
        }}
      >
        {loading && <Loading />}
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}

        {!loading && (
          <Table className="np-table">
            <thead>
              <tr>
                <th className="np-th">{t("documents.type")}</th>
                <th className="np-th">{t("documents.link")}</th>
                <th className="np-th">{t("documents.expiry")}</th>
                <th className="np-th">{t("common.notes")}</th>
                <th className="np-th"></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td className="np-td">{d.document_type}</td>
                  <td className="np-td">
                    {d.drive_link ? (
                      <a href={d.drive_link} target="_blank" rel="noreferrer">
                        {t("documents.open")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="np-td">{d.expiry_date || ""}</td>
                  <td className="np-td">{d.notes}</td>
                  <td className="np-td">
                    <Button
                      disabled={deletingId === d.id}
                      onClick={() => handleDelete(d.id)}
                      className="np-button-secondary np-button-small"
                    >
                      {deletingId === d.id
                        ? t("employeeForm.deleting")
                        : t("common.delete")}
                    </Button>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="np-td">
                    {t("documents.noDocuments")}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        )}

        <AddDocumentForm employeeId={employeeId} onAdded={load} />
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function AddDocumentForm({ employeeId, onAdded }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [file, setFile] = useState(null);
  const [driveLink, setDriveLink] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (file) {
        const formData = new FormData();
        formData.append("employee_id", employeeId);
        formData.append("document_type", documentType);
        if (expiryDate) formData.append("expiry_date", expiryDate);
        if (notes) formData.append("notes", notes);
        formData.append("file", file, file.name);
        await api.addDocumentWithFile(formData);
        setActionResult(u("uploaded"));
        notify(u("uploaded"));
      } else {
        await api.addDocument({
          employee_id: employeeId,
          document_type: documentType,
          drive_link: driveLink,
          expiry_date: expiryDate || undefined,
          notes,
        });
        setActionResult(u("uploaded"));
        notify(u("uploaded"));
      }
      setFile(null);
      setDriveLink("");
      setExpiryDate("");
      setNotes("");
      onAdded();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <form
        onSubmit={handleSubmit}
        style={{
          marginTop: "var(--space-8)",
        }}
        className="np-inline-form"
      >
        <Select
          label={t("documents.type")}
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          className="np-input"
        >
          {DOCUMENT_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {dt}
            </option>
          ))}
        </Select>
        <Input
          type="file"
          onChange={(e) => setFile(e.target.files[0] || null)}
          className="np-input"
        />
        <span className="np-muted">{t("documents.orLinkHint")}</span>
        <Input
          placeholder={t("documents.pasteLinkPlaceholder")}
          value={driveLink}
          onChange={(e) => setDriveLink(e.target.value)}
          disabled={!!file}
          style={{
            flex: 2,
          }}
          className="np-input"
          label={t("documents.pasteLinkPlaceholder")}
        />
        <Input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          title={`${t("documents.expiry")} (${t("common.optional")})`}
          className="np-input"
          label={`${t("documents.expiry")} (${t("common.optional")})`}
        />
        <Input
          placeholder={t("common.notesOptional")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{
            flex: 1,
          }}
          className="np-input"
          label={t("common.notesOptional")}
        />
        <Button type="submit" disabled={saving} className="np-button-primary">
          {saving ? t("common.adding") : t("documents.addDocument")}
        </Button>
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}

// ─── Company documents ─────────────────────────────────────────────────

function CompanyDocuments({ canUpload }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [documents, setDocuments] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  function load() {
    setError("");
    api
      .companyDocuments()
      .then((data) => setDocuments(data.documents || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);
  async function handleDelete(id) {
    if (
      !(await confirm({
        title: t("documents.deleteCompanyConfirm"),
      }))
    )
      return;
    setDeletingId(id);
    try {
      await api.deleteCompanyDocument(id);
      setActionResult(u("deleted"));
      notify(u("deleted"));
      load();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setDeletingId(null);
    }
  }
  const byFolder = {};
  for (const d of documents) {
    (byFolder[d.folder] ||= []).push(d);
  }
  const folders = Object.keys(byFolder).sort();
  return (
    <>
      <div className="np-section">
        <h3>{t("documents.companyDocuments")}</h3>
        {loading && <Loading />}
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}
        {!loading && folders.length === 0 && (
          <p className="np-muted">
            {t("documents.nothingHereYet")}
            {canUpload ? t("documents.addFirstOneHint") : "."}
          </p>
        )}

        {!loading &&
          folders.map((folder) => (
            <div
              key={folder}
              style={{
                marginBottom: "var(--space-16)",
              }}
            >
              <h4
                style={{
                  marginBottom: "var(--space-4)",
                }}
              >
                {folder}
              </h4>
              <Table className="np-table">
                <thead>
                  <tr>
                    <th className="np-th">{t("documents.title_")}</th>
                    <th className="np-th">{t("documents.minimumAccess")}</th>
                    <th className="np-th">{t("documents.link")}</th>
                    <th className="np-th">{t("common.notes")}</th>
                    {canUpload && <th className="np-th"></th>}
                  </tr>
                </thead>
                <tbody>
                  {byFolder[folder].map((d) => (
                    <tr key={d.id}>
                      <td className="np-td">{d.title}</td>
                      <td className="np-td">{d.access_role}</td>
                      <td className="np-td">
                        {d.drive_link ? (
                          <a
                            href={d.drive_link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("documents.open")}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="np-td">{d.notes}</td>
                      {canUpload && (
                        <td className="np-td">
                          <Button
                            disabled={deletingId === d.id}
                            onClick={() => handleDelete(d.id)}
                            className="np-button-secondary np-button-small"
                          >
                            {deletingId === d.id
                              ? t("employeeForm.deleting")
                              : t("common.delete")}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}

        {canUpload && <AddCompanyDocumentForm onAdded={load} />}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function AddCompanyDocumentForm({ onAdded }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [accessRole, setAccessRole] = useState("Employee");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [driveLink, setDriveLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (file) {
        const formData = new FormData();
        formData.append("access_role", accessRole);
        formData.append("title", title);
        if (notes) formData.append("notes", notes);
        formData.append("file", file, file.name);
        await api.addCompanyDocumentWithFile(formData);
        setActionResult(u("uploaded"));
        notify(u("uploaded"));
      } else {
        await api.addCompanyDocument({
          access_role: accessRole,
          title,
          drive_link: driveLink,
          notes,
        });
        setActionResult(u("uploaded"));
        notify(u("uploaded"));
      }
      setTitle("");
      setFile(null);
      setDriveLink("");
      setNotes("");
      onAdded();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div
        style={{
          marginTop: "var(--space-12)",
        }}
      >
        <p className="np-muted">
          {t("documents.accessTierHint", {
            role: accessRole,
          })}
        </p>
        <form onSubmit={handleSubmit} className="np-inline-form">
          <Select
            value={accessRole}
            onChange={(e) => setAccessRole(e.target.value)}
            className="np-input"
            label={t.lang === "id" ? "Akses minimum" : "Minimum access"}
          >
            {ROLE_RANK.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input
            placeholder={t("documents.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              flex: 1,
            }}
            className="np-input"
            label={t("documents.titlePlaceholder")}
          />
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files[0] || null)}
            className="np-input"
          />
          <span className="np-muted">{t("documents.orLinkHint")}</span>
          <Input
            placeholder={t("documents.pasteLinkPlaceholder")}
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            disabled={!!file}
            style={{
              flex: 2,
            }}
            className="np-input"
            label={t("documents.pasteLinkPlaceholder")}
          />
          <Input
            placeholder={t("common.notesOptional")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              flex: 1,
            }}
            className="np-input"
            label={t("common.notesOptional")}
          />
          <Button type="submit" disabled={saving} className="np-button-primary">
            {saving ? t("common.adding") : t("documents.addDocument")}
          </Button>
        </form>
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
