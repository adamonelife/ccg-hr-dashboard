import Logo from "../Logo.jsx";
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
import {
  DesignDisciplinePanel,
  AddSkillForm,
  SkillRow,
  CATEGORIES,
} from "./EmployeeCard.jsx";
import { LanguageToggle, useT } from "../lib/i18n.jsx";

// Forced first-login onboarding gate. Shown instead of the whole app
// (no nav, no logout-and-skip) whenever /api/auth/me comes back with a
// real employee_id but profile_setup_completed_at is still null — see
// App.jsx. Personal-detail fields here are exactly
// lib/employees.mjs's SELF_SERVICE_FIELDS, in the same order; skills/
// Design Discipline reuse the identical widgets from EmployeeCard.jsx so
// nothing about how an entry looks or saves differs between "filling this
// in for the first time" and "editing it later."
//
// Field labels are looked up via `employeeForm.field.${key}` — the same
// dictionary keys EmployeeForm.jsx uses, since this is the exact same
// field set (SELF_SERVICE_FIELDS) under a different heading.
//
// Every save made from this screen lands directly (no change-request
// detour) — lib/employees.mjs's PATCH handler and lib/skills.mjs's
// POST/PATCH/DELETE handlers both check profile_setup_completed_at
// themselves and skip the approval step until it's set, so there's
// nothing extra to coordinate here. "Finish setup" is just the PATCH that
// flips that flag (complete_setup: true), sent together with whatever's
// currently in the details form.
const FIELDS = [
  {
    key: "nickname",
    type: "text",
  },
  {
    key: "photo_url",
    type: "text",
  },
  {
    key: "phone",
    type: "text",
  },
  {
    key: "address",
    type: "text",
  },
  {
    key: "gender",
    type: "select",
    options: ["Female", "Male"],
  },
  {
    key: "emergency_contact_name",
    type: "text",
  },
  {
    key: "emergency_contact_phone",
    type: "text",
  },
  {
    key: "emergency_contact_relationship",
    type: "text",
  },
  {
    key: "nationality",
    type: "text",
  },
  {
    key: "date_of_birth",
    type: "date",
  },
  {
    key: "religion",
    type: "text",
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
    key: "office_location",
    type: "text",
  },
];
export default function Setup({ employeeId, onFinished }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [employee, setEmployee] = useState(null);
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  useEffect(() => {
    load();
  }, [employeeId]);
  function load() {
    setError("");
    Promise.all([api.getEmployee(employeeId), api.skills(employeeId)])
      .then(([empData, skillData]) => {
        setEmployee(empData.employee);
        setSkills(skillData.skills || []);
        setForm(
          Object.fromEntries(
            FIELDS.map((f) => [f.key, empData.employee?.[f.key] || ""]),
          ),
        );
      })
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  async function handleSaveDetails(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSavedNote("");
    try {
      const data = await api.updateEmployee({
        employee_id: employeeId,
        ...form,
      });
      setActionResult(data?.submitted ? u("submitted") : u("saved"));
      notify(data?.submitted ? u("submitted") : u("saved"));
      setEmployee(data.employee);
      setSavedNote(t("setup.saved"));
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  async function handleFinish() {
    setFinishing(true);
    setError("");
    try {
      const data = await api.updateEmployee({
        employee_id: employeeId,
        ...form,
        complete_setup: true,
      });
      setActionResult(data?.submitted ? u("submitted") : u("saved"));
      notify(data?.submitted ? u("submitted") : u("saved"));
      setEmployee(data.employee);
      onFinished();
    } catch (err) {
      setError(t.err(err.message));
      setFinishing(false);
    }
  }
  if (loading)
    return (
      <>
        <Loading />
        <Feedback>{actionResult}</Feedback>
      </>
    );
  if (!employee)
    return error ? (
      <p className="np-feedback np-feedback-error" role="alert">
        {error}
      </p>
    ) : null;
  const byCategory = {};
  for (const s of skills) {
    (byCategory[s.category] ||= []).push(s);
  }
  return (
    <>
      <div className="np-setup-page">
        <div className="np-setup-content">
          <div className="np-auth-logo">
            <Logo height={58} />
          </div>
          <div className="np-language-row">
            <LanguageToggle />
          </div>
          <h1 className="np-title">
            {t("setup.welcome", {
              name: employee.nickname || employee.full_name,
            })}
          </h1>
          <p className="np-intro">{t("setup.intro")}</p>

          {error && (
            <p className="np-feedback np-feedback-error" role="alert">
              {error}
            </p>
          )}

          <form onSubmit={handleSaveDetails} className="np-section">
            <h3 className="np-section-title">{t("setup.yourDetails")}</h3>
            <p className="np-muted">{t("setup.confirmNote")}</p>
            <div className="np-form-grid">
              {FIELDS.filter((f) => !f.showIf || f.showIf(form)).map((f) => (
                <label key={f.key} className="np-field">
                  {t(`employeeForm.field.${f.key}`)}
                  {f.type === "select" ? (
                    <Select
                      value={form[f.key] || ""}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          [f.key]: e.target.value,
                        }))
                      }
                      className="np-input"
                    >
                      <option value="">—</option>
                      {f.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={f.type}
                      value={form[f.key] || ""}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          [f.key]: e.target.value,
                        }))
                      }
                      className="np-input"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="np-actions">
              <Button
                type="submit"
                disabled={saving}
                className="np-button-primary"
              >
                {saving ? t("common.saving") : t("setup.saveDetails")}
              </Button>
              {savedNote && (
                <span className="np-feedback np-feedback-success" role="status">
                  {savedNote}
                </span>
              )}
            </div>
          </form>

          <DesignDisciplinePanel
            employeeId={employeeId}
            skills={skills}
            onChanged={load}
          />

          <div className="np-skill-categories">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="np-section">
                <h3 className="np-section-title">
                  {t(`employeeCard.category.${cat}`)}
                </h3>
                {byCategory[cat]?.length > 0 ? (
                  <ul className="np-skill-list">
                    {byCategory[cat].map((s) => (
                      <SkillRow key={s.id} entry={s} onChanged={load} />
                    ))}
                  </ul>
                ) : (
                  <p className="np-empty-text">{t("employeeCard.none")}</p>
                )}
              </div>
            ))}
          </div>
          <AddSkillForm employeeId={employeeId} onAdded={load} />

          <div className="np-finish-row">
            <Button
              onClick={handleFinish}
              disabled={finishing}
              className="np-button-primary"
            >
              {finishing ? t("setup.finishing") : t("setup.finish")}
            </Button>
          </div>
        </div>
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
