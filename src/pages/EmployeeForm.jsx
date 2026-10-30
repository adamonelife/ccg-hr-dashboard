import { useUI } from "../lib/presentation.jsx";
import {
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
import {
  SELF_SERVICE_FIELDS,
  editableEmployeeFields,
  SALARY_ROLES,
  PROMOTION_ROLES,
} from "../../shared/employee-policy.mjs";

// Mirrors lib/permissions.mjs's FULL_VISIBILITY_ROLES and
// lib/employees.mjs's SELF_SERVICE_FIELDS — UI-only copies (the real
// enforcement is server-side); used here just to disable the fields a
// self-editing, non-trusted employee can't touch, and to switch the save
// button's behaviour/copy between "saves immediately" and "submits for
// HR approval." Keep in sync with those two if either list ever changes.
const FULL_VISIBILITY_ROLES = ["Administrator", "Director", "HR", "Finance"];

// `titleKey`/field `labelKey`s look up translations at render time (see
// `t(`employeeForm.section.${titleKey}`)` / `t(`employeeForm.field.${f.key}`)`
// below) — this array stays module-scope (used by EMPTY below, outside any
// component) so it can't call hooks directly; only the field `key` and
// `religion`'s option *values* stay untranslated (they're DB values, not
// display text — same reasoning as DESIGN_DISCIPLINE_CATEGORY in
// EmployeeCard.jsx).
const SECTIONS = [
  {
    titleKey: "identity",
    fields: [
      {
        key: "employee_id",
        required: true,
        lockOnEdit: true,
      },
      {
        key: "full_name",
        required: true,
      },
      {
        key: "nickname",
      },
      {
        key: "photo_url",
      },
      {
        key: "email",
      },
      {
        key: "phone",
      },
    ],
  },
  {
    titleKey: "personal",
    fields: [
      {
        key: "date_of_birth",
        type: "date",
      },
      {
        key: "gender",
        type: "select",
        options: ["Female", "Male"],
      },
      {
        key: "address",
      },
      {
        key: "nationality",
      },
      {
        key: "religion",
        type: "select",
        options: [
          "Islam",
          "Kristen",
          "Katholik",
          "Hindu",
          "Buddha",
          "Konghucu",
          "NA",
        ],
      },
      {
        key: "marital_status",
        type: "select",
        options: ["Single", "Married"],
      },
      // Deliberately not conditional on marital_status — someone can have
      // children without being married.
      {
        key: "number_of_children",
        type: "number",
      },
      {
        key: "emergency_contact_name",
      },
      {
        key: "emergency_contact_phone",
      },
      {
        key: "emergency_contact_relationship",
      },
    ],
  },
  {
    titleKey: "employmentStatus",
    fields: [
      {
        key: "employment_status",
        type: "select",
        options: [
          "Active",
          "On Leave",
          "Notice Period",
          "Terminated",
          "Resigned",
        ],
      },
      {
        key: "start_date",
        type: "date",
      },
      {
        key: "end_date",
        type: "date",
      },
      {
        key: "ktp_number",
      },
      {
        key: "bni_account_number",
      },
    ],
  },
  {
    titleKey: "organisation",
    fields: [
      {
        key: "company",
      },
      {
        key: "department",
        type: "select",
        dynamic: "departments",
      },
      {
        key: "job_title",
      },
      {
        key: "team",
        type: "select",
        dynamic: "teams",
      },
      {
        key: "manager_id",
      },
      {
        key: "office_location",
      },
      {
        key: "permission_role",
        type: "select",
        options: [
          "Employee",
          "Team Lead",
          "Main Lead",
          "HR",
          "Finance",
          "Director",
          "Administrator",
        ],
      },
    ],
  },
  {
    titleKey: "employmentDetails",
    fields: [
      {
        key: "employment_type",
        type: "select",
        options: [
          "Full-time",
          "Part-time",
          "Contractor",
          "Freelance",
          "Intern",
        ],
      },
      {
        key: "contract_type",
        type: "select",
        options: ["PKWT", "PKWTT"],
      },
      {
        key: "contract_start",
        type: "date",
      },
      {
        key: "contract_end",
        type: "date",
      },
      {
        key: "probation_end_date",
        type: "date",
      },
    ],
  },
  {
    titleKey: "compensation",
    fields: [
      {
        key: "current_salary",
        type: "number",
      },
      {
        key: "salary_currency",
        type: "select",
        options: ["IDR", "USD"],
      },
      {
        key: "bonus_eligible",
        type: "checkbox",
      },
    ],
  },
  {
    titleKey: "compliance",
    fields: [
      {
        key: "kitas_expiry",
        type: "date",
      },
      {
        key: "passport_expiry",
        type: "date",
      },
      {
        key: "work_permit_expiry",
        type: "date",
      },
    ],
  },
];
const EMPTY = SECTIONS.flatMap((s) => s.fields).reduce(
  (acc, f) => ({
    ...acc,
    [f.key]: f.type === "checkbox" ? "FALSE" : "",
  }),
  {},
);
export default function EmployeeForm({
  employeeId,
  session,
  onSaved,
  onDirtyChange,
  onCancel,
  onDeleted,
}) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const isEdit = Boolean(employeeId);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener?.("beforeunload", warn);
    return () => window.removeEventListener?.("beforeunload", warn);
  }, [dirty]);
  const t = useT();
  // Self-editing your own record without being one of the trusted roles
  // means every field outside SELF_SERVICE_FIELDS is read-only, and saving
  // submits a change request instead of writing immediately — see
  // lib/employees.mjs's PATCH handler, which enforces the same thing
  // server-side regardless of what this does client-side.
  const isSelfEdit = isEdit && session?.employee_id === employeeId;
  const isTrusted = FULL_VISIBILITY_ROLES.includes(session?.role);
  const selfServiceOnly = isSelfEdit && !isTrusted;
  const [form, setForm] = useState({
    ...EMPTY,
    permission_role: "Employee",
    employment_status: "Active",
  });
  const [editableFields, setEditableFields] = useState(
    isEdit ? [] : editableEmployeeFields(session, null),
  );
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [submittedMsg, setSubmittedMsg] = useState("");
  const [pendingRequests, setPendingRequests] = useState([]);
  // Live department/team names from the OrgUnits sheet — powers those two
  // dropdowns so they can't drift out of sync with the real org structure.
  const [orgOptions, setOrgOptions] = useState({
    departments: [],
    teams: [],
  });
  useEffect(() => {
    if (!isEdit) {
      // New employee — suggest the next ID (highest existing CCG-### + 1)
      // rather than making them figure it out. Still editable, just a
      // default, in case the convention ever needs a one-off override.
      api
        .getNextEmployeeId()
        .then((data) =>
          setForm((f) => ({
            ...f,
            employee_id: data.next_id,
          })),
        )
        .catch(() => {
          // Non-fatal — they can just type an ID themselves.
        });
      return;
    }
    api
      .getEmployee(employeeId)
      .then((data) => {
        setForm({
          ...EMPTY,
          ...data.employee,
        });
        setEditableFields(data.permissions?.editable_fields || []);
      })
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }, [employeeId]);
  useEffect(() => {
    api
      .orgUnits()
      .then((data) =>
        setOrgOptions({
          departments: data.departments || [],
          teams: data.teams || [],
        }),
      )
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
      .then((data) =>
        setPendingRequests(
          (data.requests || []).filter((r) => r.status === "Pending"),
        ),
      )
      .catch(() => {
        // Non-fatal — the form still works without the pending-requests banner.
      });
  }
  function set(key, value) {
    setDirty(true);
    setForm((f) => ({
      ...f,
      [key]: value,
    }));
  }
  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSubmittedMsg("");
    try {
      if (isEdit) {
        // Self-service, non-trusted: only the allowed fields are editable
        // anyway (see the disabled inputs below), but send just those —
        // no reason to round-trip the rest, and it keeps the diff HR sees
        // on the change request limited to what actually changed here.
        const payload = Object.fromEntries(
          Object.entries(form).filter(
            ([key]) => key === "employee_id" || editableFields.includes(key),
          ),
        );
        const data = await api.updateEmployee(payload);
        setActionResult(data?.submitted ? u("submitted") : u("saved"));
        notify(data?.submitted ? u("submitted") : u("saved"));
        if (data.submitted) {
          setDirty(false);
          setSubmittedMsg(t("employeeForm.submittedMsg"));
          loadPendingRequests();
          setSaving(false);
          return;
        }
      } else {
        await api.createEmployee(
          session?.role === "Administrator"
            ? form
            : {
                ...form,
                permission_role: "Employee",
              },
        );
        setActionResult(u("saved"));
        notify(u("saved"));
      }
      setDirty(false);
      onDirtyChange?.(false);
      onSaved(form.employee_id);
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete() {
    if (
      !(await confirm({
        title: t("employeeForm.deleteConfirm", {
          name: form.full_name || employeeId,
        }),
        requiredText: employeeId,
        description: u("irreversible"),
      }))
    ) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await api.deleteEmployee(employeeId);
      setActionResult(u("deleted"));
      notify(u("deleted"));
      setDirty(false);
      onDirtyChange?.(false);
      (onDeleted || onCancel)();
    } catch (err) {
      setError(t.err(err.message));
      setDeleting(false);
    }
  }
  if (loading)
    return (
      <>
        <Loading />
        <Feedback>{actionResult}</Feedback>
      </>
    );
  return (
    <>
      <div>
        <Button onClick={onCancel} className="np-button-ghost np-back">
          {isEdit ? u("backProfile") : u("back")}
        </Button>
        <h2>
          {isEdit
            ? form.full_name || t("employeeForm.editEmployee")
            : t("employeeForm.addEmployee")}
        </h2>
        {isEdit && session?.role === "Administrator" && (
          <details className="np-more">
            <summary>{u("more")} ⋯</summary>
            <div>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="np-button-danger-soft"
              >
                {deleting
                  ? t("employeeForm.deleting")
                  : t("employeeForm.deleteEmployee")}
              </Button>
            </div>
          </details>
        )}

        {selfServiceOnly && (
          <p className="np-muted">{t("employeeForm.selfServiceNote")}</p>
        )}

        {selfServiceOnly && pendingRequests.length > 0 && (
          <div className="np-feedback np-feedback-warning" role="status">
            {t("employeeForm.pendingBanner", {
              count: pendingRequests.length,
            })}
          </div>
        )}

        {submittedMsg && (
          <p className="np-feedback np-feedback-success" role="status">
            {submittedMsg}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {SECTIONS.map((section) => (
            <fieldset key={section.titleKey} className="np-fieldset">
              <legend className="np-legend">
                {t(`employeeForm.section.${section.titleKey}`)}
              </legend>
              <div className="np-form-grid">
                {section.fields
                  .filter((f) => !f.showIf || f.showIf(form))
                  .map((f) => {
                    // Static options (f.options) or live ones pulled from
                    // OrgUnits (f.dynamic). Either way, if the employee's
                    // current value isn't in the list — e.g. legacy data, or
                    // OrgUnits hasn't been updated yet — prepend it rather than
                    // silently blank it out on save.
                    const baseOptions =
                      f.options ||
                      (f.dynamic ? orgOptions[f.dynamic] : []) ||
                      [];
                    const currentValue = form[f.key];
                    const selectOptions =
                      currentValue && !baseOptions.includes(currentValue)
                        ? [currentValue, ...baseOptions]
                        : baseOptions;
                    const locked =
                      (isEdit &&
                        (f.lockOnEdit || !editableFields.includes(f.key))) ||
                      (!isEdit &&
                        f.key === "permission_role" &&
                        session?.role !== "Administrator");
                    const label = t(`employeeForm.field.${f.key}`);
                    return (
                      <label key={f.key} className="np-field">
                        {label}
                        {f.required && " *"}
                        {f.type === "select" ? (
                          <Select
                            value={form[f.key] ?? ""}
                            onChange={(e) => set(f.key, e.target.value)}
                            disabled={locked}
                            required={f.required}
                            className="np-input"
                          >
                            <option value="">—</option>
                            {selectOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </Select>
                        ) : f.type === "checkbox" ? (
                          <Input
                            type="checkbox"
                            checked={form[f.key] === "TRUE"}
                            onChange={(e) =>
                              set(f.key, e.target.checked ? "TRUE" : "FALSE")
                            }
                            disabled={locked}
                            style={{
                              alignSelf: "flex-start",
                            }}
                          />
                        ) : (
                          <Input
                            type={f.type || "text"}
                            value={form[f.key] ?? ""}
                            onChange={(e) => set(f.key, e.target.value)}
                            disabled={locked}
                            required={f.required}
                            className="np-input"
                          />
                        )}
                      </label>
                    );
                  })}
              </div>
            </fieldset>
          ))}

          {error && (
            <p className="np-feedback np-feedback-error" role="alert">
              {error}
            </p>
          )}

          {(!isEdit || editableFields.length > 0) && (
            <Button
              type="submit"
              disabled={saving}
              className="np-button-primary"
            >
              {saving
                ? t("common.saving")
                : isEdit
                  ? selfServiceOnly
                    ? t("employeeForm.requestChange")
                    : t("employeeForm.saveChanges")
                  : t("employeeForm.createEmployee")}
            </Button>
          )}
        </form>

        {isEdit && !selfServiceOnly && (
          <>
            {session?.role === "Administrator" && (
              <AccountPanel
                employeeId={employeeId}
                defaultEmail={form.email}
                t={t}
              />
            )}
            {SALARY_ROLES.includes(session?.role) && (
              <HistoryPanel
                title={t("employeeForm.salaryHistory")}
                employeeId={employeeId}
                fetcher={api.salaryHistory}
                adder={api.addSalaryEntry}
                t={t}
                columns={[
                  {
                    key: "effective_date",
                    label: t("employeeForm.effectiveDate"),
                    type: "date",
                  },
                  {
                    key: "amount",
                    label: t("employeeForm.amount"),
                    type: "number",
                  },
                  {
                    key: "currency",
                    label: t("employeeForm.currency"),
                  },
                  {
                    key: "reason",
                    label: t("employeeForm.reason"),
                  },
                ]}
              />
            )}
            {PROMOTION_ROLES.includes(session?.role) && (
              <HistoryPanel
                title={t("employeeForm.promotionHistory")}
                employeeId={employeeId}
                fetcher={api.promotionHistory}
                adder={api.addPromotionEntry}
                t={t}
                columns={[
                  {
                    key: "date",
                    label: t("employeeForm.date"),
                    type: "date",
                  },
                  {
                    key: "previous_title",
                    label: t("employeeForm.previousTitle"),
                  },
                  {
                    key: "new_title",
                    label: t("employeeForm.newTitle"),
                  },
                  {
                    key: "notes",
                    label: t("common.notes"),
                  },
                ]}
              />
            )}
          </>
        )}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
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
export function AccountPanel({ employeeId, defaultEmail, t }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const [account, setAccount] = useState(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [emailStatus, setEmailStatus] = useState(null); // { sent, error, to } | null
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    load();
  }, [employeeId]);
  function load() {
    api
      .getAccountStatus(employeeId)
      .then((data) => {
        setAccount(data.account);
        setEmail(data.account?.email || defaultEmail || "");
      })
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  async function handleCreate(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError("");
    setLink("");
    setEmailStatus(null);
    try {
      const data = await api.createAccount(employeeId, email);
      setActionResult(data?.submitted ? u("submitted") : u("saved"));
      notify(data?.submitted ? u("submitted") : u("saved"));
      setLink(
        data.setup_url ||
          `${window.location.origin}/?setup=${data.setup_token}`,
      );
      setEmailStatus({
        sent: data.email_sent,
        error: data.email_error,
        to: email,
      });
      load();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <Loading />;
  return (
    <>
      <div className="np-panel">
        <h3>{t("employeeForm.loginAccount")}</h3>
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}

        {account && (
          <p>
            {account.email} —{" "}
            {account.has_password
              ? `${t("employeeForm.accountActive")}${
                  account.last_login_at
                    ? t("employeeForm.accountLastLogin", {
                        date: new Date(
                          account.last_login_at,
                        ).toLocaleDateString(),
                      })
                    : t("employeeForm.accountNeverLoggedIn")
                }`
              : account.setup_pending
                ? t("employeeForm.accountSetupPending")
                : t("employeeForm.accountNoPassword")}
          </p>
        )}

        <form onSubmit={handleCreate} className="np-inline-form">
          <Input
            type="email"
            placeholder={t("employeeForm.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="np-input"
            label={t("employeeForm.emailPlaceholder")}
          />
          <Button type="submit" disabled={saving} className="np-button-primary">
            {saving
              ? t("employeeForm.sendingLogin")
              : account
                ? t("employeeForm.resendLogin")
                : t("employeeForm.createLogin")}
          </Button>
        </form>

        {emailStatus && (
          <p
            className={
              emailStatus.sent
                ? "np-feedback np-feedback-success"
                : "np-feedback np-feedback-warning"
            }
          >
            {emailStatus.sent
              ? t("employeeForm.emailSent", {
                  email: emailStatus.to,
                })
              : t("employeeForm.emailFailed", {
                  detail: "",
                })}
          </p>
        )}

        {link && (
          <div
            style={{
              marginTop: "var(--space-8)",
            }}
          >
            <p
              style={{
                margin: "0 0 4px 0",
              }}
            >
              {t("employeeForm.linkFallbackNote")}
            </p>
            <Input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1,
                width: "100%",
              }}
              className="np-input"
            />
          </div>
        )}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
export function HistoryPanel({
  embedded = false,
  title,
  employeeId,
  fetcher,
  adder,
  columns,
  t,
}) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState({});
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    load();
  }, [employeeId]);
  function load() {
    fetcher(employeeId)
      .then((data) => setRows(data.history || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await adder({
        employee_id: employeeId,
        ...entry,
      });
      setActionResult(u("saved"));
      notify(u("saved"));
      setEntry({});
      load();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setAdding(false);
    }
  }
  return (
    <>
      <div className={embedded ? "np-subsection" : "np-panel"}>
        <h3>{title}</h3>
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <Loading />
        ) : (
          <Table className="np-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="np-th">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className="np-td">
                      {r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="np-td">
                    {t("employeeForm.noEntriesYet")}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        )}

        <form onSubmit={handleAdd} className="np-inline-form">
          {columns.map((c) => (
            <Input
              key={c.key}
              type={c.type || "text"}
              placeholder={c.label}
              value={entry[c.key] ?? ""}
              onChange={(e) =>
                setEntry((v) => ({
                  ...v,
                  [c.key]: e.target.value,
                }))
              }
              className="np-input"
              label={c.label}
            />
          ))}
          <Button type="submit" disabled={adding} className="np-button-primary">
            {adding ? t("common.adding") : t("common.add")}
          </Button>
        </form>
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
