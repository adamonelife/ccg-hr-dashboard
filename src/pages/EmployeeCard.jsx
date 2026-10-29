import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useT } from "../lib/i18n.jsx";
import { useUI } from "../lib/presentation.jsx";
import {
  Button,
  Badge,
  Loading,
  Feedback,
  Input,
  Select,
  Table,
  EmptyState,
  useFeedback,
} from "../components/ui.jsx";
import {
  SALARY_ROLES,
  PROMOTION_ROLES,
} from "../../shared/employee-policy.mjs";
import { HistoryPanel, AccountPanel } from "./EmployeeForm.jsx";

// Keep in sync with the CHECK constraint on skills.level in db/schema.sql.
const LEVELS = ["", "0", "1", "2", "3", "4", "5"];

// Keep in sync with CATEGORIES in lib/skills.mjs — minus 'Design
// Discipline', which lib/skills.mjs accepts but this list deliberately
// excludes: that category has its own dedicated widget
// (DesignDisciplinePanel, below) rather than going through the generic
// "Add skill" form, so it never ends up with stray free-text entries.
// Values stay in English (DB category strings) — display labels are
// looked up via `employeeCard.category.${cat}` at render time.
const CATEGORIES = [
  "Software Skill",
  "Technical Skill",
  "Soft Skill",
  "Language",
  "Certification",
  "Training Completed",
  "Training Required",
  "Career Path",
];

// Category value stays 'Design Discipline' in the database (skills.category
// CHECK constraint, lib/skills.mjs) even though the widget now covers non-
// creative disciplines too (Marketing/Sales/HR/Finance, added once it came
// up that not everyone at CCG is design staff) — renaming the stored value
// would mean a migration for zero user-visible benefit, since nothing
// displays the raw category string anywhere. Only the on-screen heading
// changed, from "Design Discipline" to "Discipline" (see
// DesignDisciplinePanel's <h3> below).
const DESIGN_DISCIPLINE_CATEGORY = "Design Discipline";
const DISCIPLINE_ITEMS = [
  "Architecture",
  "Landscape",
  "Interior",
  "Marketing",
  "Sales",
  "HR",
  "Finance",
];

// Mirrors lib/permissions.mjs's FULL_VISIBILITY_ROLES — see
// EmployeeForm.jsx's copy of the same list for why this stays a plain UI-
// only array instead of a shared import (server-side is the real gate).
const FULL_VISIBILITY_ROLES = ["Administrator", "Director", "HR", "Finance"];

// Re-exported so src/pages/Setup.jsx (first-login onboarding gate) can
// reuse the exact same skills widgets instead of forking them — the
// onboarding screen and the card's own skills section should always look
// and behave identically.
export { LEVELS, CATEGORIES };
export default function EmployeeCard({
  employeeId,
  session,
  onBack,
  onDeleted,
  onEdit,
}) {
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const [deletingEmployee, setDeletingEmployee] = useState(false);
  const [employee, setEmployee] = useState(null),
    [permissions, setPermissions] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("overview"),
    [accountOpen, setAccountOpen] = useState(false);
  const t = useT(),
    u = useUI();
  useEffect(() => {
    let live = true;
    api
      .getEmployee(employeeId)
      .then((data) => {
        if (live) {
          setEmployee(data.employee);
          setPermissions(data.permissions);
        }
      })
      .catch((e) => {
        if (live) setError(t.err(e.message));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [employeeId]);
  useEffect(() => {
    if (employee) document.title = `${employee.full_name} · Nallin People`;
  }, [employee]);
  async function deleteEmployee() {
    if (
      !(await confirm({
        title: t("employeeForm.deleteConfirm", { name: employee.full_name }),
        requiredText: employeeId,
        description: u("irreversible"),
      }))
    )
      return;
    setDeletingEmployee(true);
    try {
      await api.deleteEmployee(employeeId);
      notify(u("deleted"));
      (onDeleted || onBack)();
    } catch (e) {
      setError(t.err(e.message));
    } finally {
      setDeletingEmployee(false);
    }
  }
  if (loading)
    return (
      <>
        <Loading />
        <Feedback>{actionResult}</Feedback>
      </>
    );
  if (error && !employee)
    return (
      <>
        <Feedback tone="error">{error}</Feedback>
        <Feedback>{actionResult}</Feedback>
      </>
    );
  if (!employee) return null;
  const tabs = [
    "overview",
    "personal",
    "employment",
    ...(permissions?.can_view_compensation ? ["compensation"] : []),
    "skills",
  ];
  const canEdit = Boolean(permissions?.editable_fields?.length);
  const groups = {
    overview: [
      "employee_id",
      "full_name",
      "nickname",
      "job_title",
      "department",
      "team",
      "company",
      "manager_id",
      "employment_status",
      "start_date",
      "office_location",
    ],
    personal: [
      "email",
      "phone",
      "date_of_birth",
      "gender",
      "address",
      "nationality",
      "religion",
      "marital_status",
      "number_of_children",
      "emergency_contact_name",
      "emergency_contact_phone",
      "emergency_contact_relationship",
    ],
    employment: [
      "employment_status",
      "start_date",
      "end_date",
      "employment_type",
      "contract_type",
      "contract_start",
      "contract_end",
      "probation_end_date",
      "passport_expiry",
      "kitas_expiry",
      "work_permit_expiry",
      "ktp_number",
      "permission_role",
    ],
    compensation: [
      "current_salary",
      "salary_currency",
      "bonus_eligible",
      "bni_account_number",
    ],
  };
  return (
    <>
      <section>
        <Feedback tone="error">{error}</Feedback>
        <Button variant="ghost" className="np-back" onClick={onBack}>
          ← {u("back")}
        </Button>
        <div className="np-profile-hero">
          <div className="np-profile-person">
            {employee.photo_url ? (
              <img
                className="np-avatar large"
                src={employee.photo_url}
                alt=""
              />
            ) : (
              <span className="np-avatar large">
                {employee.full_name
                  .split(/\s+/)
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
            )}
            <div>
              <p className="np-eyebrow">{employee.employee_id}</p>
              <h1>{employee.full_name}</h1>
              <p>{employee.job_title || employee.nickname || "—"}</p>
              <div className="np-profile-meta">
                <Badge value={employee.employment_status} />
                <span>
                  {[employee.department, employee.team]
                    .filter(Boolean)
                    .join(" / ")}
                </span>
              </div>
            </div>
          </div>
          <div className="np-actions">
            {canEdit && (
              <Button onClick={() => onEdit(employeeId)}>{u("edit")}</Button>
            )}
            {session.role === "Administrator" && (
              <details className="np-more">
                <summary>{u("more")} ⋯</summary>
                <div>
                  <Button
                    variant="ghost"
                    onClick={() => setAccountOpen((v) => !v)}
                  >
                    {u("account")}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={deletingEmployee}
                    onClick={deleteEmployee}
                  >
                    {deletingEmployee
                      ? t("employeeForm.deleting")
                      : t("employeeForm.deleteEmployee")}
                  </Button>
                </div>
              </details>
            )}
          </div>
        </div>
        <div className="np-tabs" role="tablist" aria-label={u("details")}>
          {tabs.map((key) => (
            <Button
              variant="ghost"
              type="button"
              key={key}
              id={`profile-tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              aria-controls={`profile-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
              onKeyDown={(e) => {
                if (
                  ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? tabs.length - 1
                        : (tabs.indexOf(tab) +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            tabs.length) %
                          tabs.length;
                  setTab(tabs[next]);
                  e.currentTarget.parentElement.children[next].focus();
                }
              }}
            >
              {u(key)}
            </Button>
          ))}
        </div>
        <div
          className="np-profile-panel"
          id={`profile-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`profile-tab-${tab}`}
        >
          {tab === "skills" ? (
            <SkillsPanel employeeId={employeeId} session={session} />
          ) : (
            <>
              <div className="np-section-heading">
                <div>
                  <span className="np-eyebrow">{u("details")}</span>
                  <h2>{u(tab)}</h2>
                </div>
                {!canEdit && <span className="np-muted">{u("readOnly")}</span>}
              </div>
              <dl className="np-detail-grid">
                {groups[tab]
                  ?.filter((key) => Object.hasOwn(employee, key))
                  .map((key) => (
                    <div key={key}>
                      <dt>{t(`employeeForm.field.${key}`)}</dt>
                      <dd>
                        {key === "employment_status" ? (
                          <Badge value={employee[key]} />
                        ) : key === "bonus_eligible" ? (
                          employee[key] === "TRUE" ? (
                            t("common.yes")
                          ) : (
                            t("common.no")
                          )
                        ) : employee[key] === null || employee[key] === "" ? (
                          u("notSet")
                        ) : (
                          String(employee[key])
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
              {tab === "compensation" && (
                <>
                  {SALARY_ROLES.includes(session.role) && (
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
                  {PROMOTION_ROLES.includes(session.role) && (
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
            </>
          )}
        </div>
        {accountOpen && session.role === "Administrator" && (
          <AccountPanel
            employeeId={employeeId}
            defaultEmail={employee.email}
            t={t}
          />
        )}
      </section>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
export function SkillsPanel({ employeeId, session }) {
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const [skills, setSkills] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [pendingRequests, setPendingRequests] = useState([]);
  const t = useT(),
    u = useUI();
  const selfServiceOnly =
    session?.employee_id === employeeId &&
    !FULL_VISIBILITY_ROLES.includes(session?.role);
  function load() {
    setError("");
    api
      .skills(employeeId)
      .then((data) => setSkills(data.skills || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
    if (selfServiceOnly)
      api
        .myChangeRequests(employeeId)
        .then((data) =>
          setPendingRequests(
            (data.requests || []).filter((r) => r.status === "Pending"),
          ),
        )
        .catch(() => {});
  }
  useEffect(load, [employeeId]);
  if (loading)
    return (
      <>
        <Loading />
        <Feedback>{actionResult}</Feedback>
      </>
    );
  if (error)
    return (
      <>
        <Feedback tone="error">{error}</Feedback>
        <Feedback>{actionResult}</Feedback>
      </>
    );
  const byCategory = {};
  for (const skill of skills) (byCategory[skill.category] ||= []).push(skill);
  return (
    <>
      <section className="np-skills">
        <div className="np-section-heading">
          <h2>{u("skills")}</h2>
        </div>
        {pendingRequests.length > 0 && (
          <Feedback tone="warning">
            {t("employeeCard.pendingBanner", {
              count: pendingRequests.length,
            })}
          </Feedback>
        )}
        <DesignDisciplinePanel
          employeeId={employeeId}
          skills={skills}
          onChanged={(message) => {
            setActionResult(message || u("saved"));
            load();
          }}
          selfServiceOnly={selfServiceOnly}
        />
        <div className="np-skill-categories">
          {CATEGORIES.map((cat) => (
            <section className="np-card" key={cat}>
              <h3>{t(`employeeCard.category.${cat}`)}</h3>
              {byCategory[cat]?.length ? (
                <ul className="np-skill-list">
                  {byCategory[cat].map((entry) => (
                    <SkillRow
                      key={entry.id}
                      entry={entry}
                      onChanged={(message) => {
                        setActionResult(message || u("saved"));
                        load();
                      }}
                      selfServiceOnly={selfServiceOnly}
                    />
                  ))}
                </ul>
              ) : (
                <p className="np-muted">{u("noSkills")}</p>
              )}
            </section>
          ))}
        </div>
        <AddSkillForm
          employeeId={employeeId}
          onAdded={load}
          selfServiceOnly={selfServiceOnly}
        />
      </section>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}

// Fixed three-checkbox widget, deliberately not the generic add/edit/
// delete-per-row flow used everywhere else on this card — Architecture/
// Landscape/Interior are a closed set, so this reconciles the three
// checkbox+level states against whatever skills rows already exist
// (create/update/delete as needed) in one "Save", via the same
// add/update/delete endpoints the rest of the card uses.
export function DesignDisciplinePanel({
  employeeId,
  skills,
  onChanged,
  selfServiceOnly,
}) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const entries = skills.filter(
    (s) => s.category === DESIGN_DISCIPLINE_CATEGORY,
  );
  const byItem = Object.fromEntries(entries.map((e) => [e.item, e]));
  const [checked, setChecked] = useState(() =>
    Object.fromEntries(
      DISCIPLINE_ITEMS.map((item) => [item, Boolean(byItem[item])]),
    ),
  );
  const [levels, setLevels] = useState(() =>
    Object.fromEntries(
      DISCIPLINE_ITEMS.map((item) => [item, byItem[item]?.level || ""]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submittedMsg, setSubmittedMsg] = useState("");

  // Re-sync whenever the underlying skills list changes (after a save
  // reloads it, or when switching to a different employee's card).
  useEffect(() => {
    const current = skills.filter(
      (s) => s.category === DESIGN_DISCIPLINE_CATEGORY,
    );
    const currentByItem = Object.fromEntries(current.map((e) => [e.item, e]));
    setChecked(
      Object.fromEntries(
        DISCIPLINE_ITEMS.map((item) => [item, Boolean(currentByItem[item])]),
      ),
    );
    setLevels(
      Object.fromEntries(
        DISCIPLINE_ITEMS.map((item) => [
          item,
          currentByItem[item]?.level || "",
        ]),
      ),
    );
  }, [skills]);
  async function handleSave() {
    setSaving(true);
    setError("");
    setSubmittedMsg("");
    try {
      const results = await Promise.all(
        DISCIPLINE_ITEMS.map(async (item) => {
          const existing = byItem[item];
          const isChecked = checked[item];
          const level = levels[item];
          if (isChecked && !existing) {
            return api.addSkillEntry({
              employee_id: employeeId,
              category: DESIGN_DISCIPLINE_CATEGORY,
              item,
              level,
            });
          } else if (isChecked && existing) {
            if ((existing.level || "") !== level) {
              return api.updateSkillEntry({
                id: existing.id,
                category: DESIGN_DISCIPLINE_CATEGORY,
                item,
                level,
              });
            }
          } else if (!isChecked && existing) {
            return api.deleteSkillEntry(existing.id);
          }
          return null;
        }),
      );
      if (results.some((r) => r?.submitted)) {
        setSubmittedMsg(t("employeeCard.submitted"));
      }
      onChanged();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="np-section">
        <h3 className="np-section-title">{t("employeeCard.discipline")}</h3>
        {selfServiceOnly && (
          <p className="np-muted">{t("employeeCard.disciplineNote")}</p>
        )}
        <div className="np-discipline-grid">
          {DISCIPLINE_ITEMS.map((item) => (
            <label key={item} className="np-checkbox-field">
              <Input
                type="checkbox"
                checked={checked[item]}
                onChange={(e) =>
                  setChecked((c) => ({
                    ...c,
                    [item]: e.target.checked,
                  }))
                }
              />
              {item}
              {checked[item] && (
                <Select
                  aria-label={`${item} ${u("level")}`}
                  value={levels[item]}
                  onChange={(e) =>
                    setLevels((l) => ({
                      ...l,
                      [item]: e.target.value,
                    }))
                  }
                  className="np-select np-level-select"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l === "" ? t("employeeCard.levelNa") : l}
                    </option>
                  ))}
                </Select>
              )}
            </label>
          ))}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="np-button-primary"
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
        {submittedMsg && (
          <p className="np-feedback np-feedback-success" role="status">
            {submittedMsg}
          </p>
        )}
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
export function AddSkillForm({ employeeId, onAdded, selfServiceOnly }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [item, setItem] = useState("");
  const [level, setLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submittedMsg, setSubmittedMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!item.trim()) return;
    setSaving(true);
    setError("");
    setSubmittedMsg("");
    try {
      const result = await api.addSkillEntry({
        employee_id: employeeId,
        category,
        item,
        level,
        notes,
      });
      setActionResult(result?.submitted ? u("submitted") : u("saved"));
      notify(result?.submitted ? u("submitted") : u("saved"));
      setItem("");
      setLevel("");
      setNotes("");
      if (result?.submitted) {
        setSubmittedMsg(t("employeeCard.submitted"));
      }
      onAdded();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <form onSubmit={handleSubmit} className="np-panel">
        <h3 className="np-section-title">{t("employeeCard.addEntry")}</h3>
        {selfServiceOnly && (
          <p className="np-muted">{t("employeeCard.newEntryNote")}</p>
        )}
        {submittedMsg && (
          <p className="np-feedback np-feedback-success" role="status">
            {submittedMsg}
          </p>
        )}
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}
        <div className="np-inline-form">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="np-input"
            label={t.lang === "id" ? "Kategori" : "Category"}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`employeeCard.category.${c}`)}
              </option>
            ))}
          </Select>
          <Input
            placeholder={t("employeeCard.itemPlaceholder")}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            style={{
              flex: 2,
            }}
            className="np-input"
            label={t("employeeCard.itemPlaceholder")}
          />
          <Select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="np-input"
            label={t.lang === "id" ? "Tingkat" : "Level"}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "" ? t("employeeCard.levelNa") : l}
              </option>
            ))}
          </Select>
          <Input
            placeholder={t("common.notesOptional")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              flex: 2,
            }}
            className="np-input"
            label={t("common.notesOptional")}
          />
          <Button type="submit" disabled={saving} className="np-button-primary">
            {saving ? t("common.adding") : t("common.add")}
          </Button>
        </div>
      </form>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
export function SkillRow({ entry, onChanged, selfServiceOnly }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(entry.category);
  const [item, setItem] = useState(entry.item);
  const [level, setLevel] = useState(entry.level || "");
  const [notes, setNotes] = useState(entry.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submittedMsg, setSubmittedMsg] = useState("");
  async function handleSave(e) {
    e.preventDefault();
    if (!item.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.updateSkillEntry({
        id: entry.id,
        category,
        item,
        level,
        notes,
      });
      setActionResult(result?.submitted ? u("submitted") : u("saved"));
      notify(result?.submitted ? u("submitted") : u("saved"));
      if (result?.submitted) {
        setSubmittedMsg(t("employeeCard.submitted"));
      }
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete() {
    if (
      !(await confirm({
        title: t("employeeCard.removeConfirm", {
          item: entry.item,
        }),
      }))
    )
      return;
    setSaving(true);
    setError("");
    try {
      const result = await api.deleteSkillEntry(entry.id);
      setActionResult(result?.submitted ? u("submitted") : u("deleted"));
      notify(result?.submitted ? u("submitted") : u("deleted"));
      if (result?.submitted) {
        setSubmittedMsg(t("employeeCard.removalSubmitted"));
      }
      onChanged(result?.submitted ? u("submitted") : u("deleted"));
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  if (editing) {
    return (
      <>
        <li className="np-skill-row">
          <form onSubmit={handleSave} className="np-inline-form">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="np-input"
              label={t.lang === "id" ? "Kategori" : "Category"}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`employeeCard.category.${c}`)}
                </option>
              ))}
            </Select>
            <Input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              style={{
                flex: 2,
              }}
              className="np-input"
            />
            <Select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="np-input"
              label={t.lang === "id" ? "Tingkat" : "Level"}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l === "" ? t("employeeCard.levelNa") : l}
                </option>
              ))}
            </Select>
            <Input
              placeholder={t("common.notes")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                flex: 2,
              }}
              className="np-input"
              label={t("common.notes")}
            />
            <Button
              type="submit"
              disabled={saving}
              className="np-button-primary"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              type="button"
              onClick={() => setEditing(false)}
              className="np-button-secondary"
            >
              {t("common.cancel")}
            </Button>
          </form>
          {submittedMsg && (
            <p className="np-feedback np-feedback-success" role="status">
              {submittedMsg}
            </p>
          )}
          {error && (
            <p className="np-feedback np-feedback-error" role="alert">
              {error}
            </p>
          )}
        </li>
        <Feedback>{actionResult}</Feedback>
      </>
    );
  }
  return (
    <>
      <li className="np-skill-row">
        <span>
          <strong>{entry.item}</strong>
          {entry.level && ` — ${entry.level}`}
          {entry.notes && <span className="np-muted"> ({entry.notes})</span>}
        </span>
        <span className="np-actions">
          <Button
            onClick={() => setEditing(true)}
            className="np-button-secondary np-button-small"
          >
            {t("common.edit")}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={saving}
            className="np-button-secondary np-button-small"
          >
            {t("common.delete")}
          </Button>
        </span>
        {submittedMsg && (
          <p className="np-feedback np-feedback-success" role="status">
            {submittedMsg}
          </p>
        )}
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}
      </li>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
