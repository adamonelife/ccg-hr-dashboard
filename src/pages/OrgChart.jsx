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

// 'Company' deliberately not offered here — CC/CC Landscape/Pelago etc. are
// separate companies externally but just teams under Operations
// internally, per Adam's org-chart cleanup request. Matches lib/org.mjs's
// UNIT_TYPES.
const UNIT_TYPES = ["Group", "Department", "Team"];

// Matches lib/org.mjs's MUTATE_ROLES — create/assign-lead/delete are all
// gated the same way. Kept as a plain array here (UI-only convenience);
// the actual enforcement is server-side.
const CAN_MANAGE_ORG_UNITS = ["Administrator", "Director"];
export default function OrgChart({ role }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const canManage = CAN_MANAGE_ORG_UNITS.includes(role);
  const [tree, setTree] = useState([]);
  const [reportingLines, setReportingLines] = useState([]);
  const [units, setUnits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = useT();
  useEffect(() => {
    load();
  }, []);
  function load() {
    setError("");
    // Active employees only — makes more sense as the pool of possible
    // leads than including people who've left.
    Promise.all([api.orgChart(), api.orgUnits(), api.listEmployees()])
      .then(([chartData, unitData, empData]) => {
        setTree(chartData.tree || []);
        setReportingLines(chartData.reportingLines || []);
        setUnits(unitData.units || []);
        setEmployees(empData.employees || []);
      })
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
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
        <p className="np-feedback np-feedback-error" role="alert">
          {error}
        </p>
        <Feedback>{actionResult}</Feedback>
      </>
    );
  return (
    <>
      <div>
        <PageHeading title={t("orgChart.title")} />
        {tree.length === 0 && (
          <p className="np-muted">{t("orgChart.noUnits")}</p>
        )}
        {tree.map((node) => (
          <TreeNode
            key={node.name}
            node={node}
            depth={0}
            employees={employees}
            units={units}
            canManage={canManage}
            onChanged={load}
            t={t}
          />
        ))}

        {canManage && (
          <AddUnitForm
            units={units}
            employees={employees}
            onAdded={load}
            t={t}
          />
        )}

        <h2
          style={{
            marginTop: "var(--space-32)",
          }}
        >
          {t("orgChart.reportingLines")}
        </h2>
        <Table className="np-table">
          <thead>
            <tr>
              <th className="np-th">{t("orgChart.employee")}</th>
              <th className="np-th">{t("orgChart.title_")}</th>
              <th className="np-th">{t("orgChart.reportsTo")}</th>
            </tr>
          </thead>
          <tbody>
            {reportingLines.map((r) => (
              <tr key={r.employee_id}>
                <td className="np-td">{r.nickname || r.full_name}</td>
                <td className="np-td">{r.job_title}</td>
                <td className="np-td">
                  {r.manager_nickname || r.manager_name || r.manager_id}
                </td>
              </tr>
            ))}
            {reportingLines.length === 0 && (
              <tr>
                <td colSpan={3} className="np-td">
                  {t("orgChart.noReportingLines")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function TreeNode({ node, depth, employees, units, canManage, onChanged, t }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [leadId, setLeadId] = useState(node.lead_employee_id || "");
  const [moving, setMoving] = useState(false);
  const [newParent, setNewParent] = useState("");
  const [reordering, setReordering] = useState(false);
  const [sortOrder, setSortOrder] = useState(node.sort_order ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function handleSaveLead(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.assignOrgUnitLead(node.name, leadId || null);
      setActionResult(u("saved"));
      notify(u("saved"));
      setAssigning(false);
      onChanged();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  async function handleMove(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.moveOrgUnit(node.name, newParent || null);
      setActionResult(u("saved"));
      notify(u("saved"));
      setMoving(false);
      onChanged();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  async function handleSaveOrder(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.setOrgUnitOrder(node.name, sortOrder);
      setActionResult(u("saved"));
      notify(u("saved"));
      setReordering(false);
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
        title: t("orgChart.deleteConfirm", {
          name: node.name,
        }),
      }))
    )
      return;
    setSaving(true);
    setError("");
    try {
      await api.deleteOrgUnit(node.name);
      setActionResult(u("deleted"));
      notify(u("deleted"));
      onChanged();
    } catch (err) {
      setError(t.err(err.message));
      setSaving(false);
    }
  }

  // Everything else in org_units except this node itself and anything
  // this node is already an ancestor of — the server re-checks this too
  // (can't move a unit under its own sub-unit), but filtering it out here
  // keeps the dropdown from offering an obviously-invalid choice.
  const moveOptions = (units || []).filter((u) => u.unit_name !== node.name);
  return (
    <>
      <div
        style={{
          marginLeft: depth * 24,
          marginBottom: "var(--space-8)",
        }}
      >
        <div className="np-tree-row">
          <div className="np-tree-label">
            <span className="np-eyebrow">{node.type}</span> {node.name}
            {node.lead_name && (
              <span className="np-lead-tag">
                {" "}
                · {t("orgChart.lead")}: {node.lead_name}
              </span>
            )}
          </div>
          {canManage && (
            <span className="np-actions">
              <Button
                onClick={() => setAssigning((v) => !v)}
                className="np-button-secondary np-button-small"
              >
                {node.lead_name
                  ? t("orgChart.changeLead")
                  : t("orgChart.assignLead")}
              </Button>
              <Button
                onClick={() => setMoving((v) => !v)}
                className="np-button-secondary np-button-small"
              >
                {t("orgChart.move")}
              </Button>
              <Button
                onClick={() => setReordering((v) => !v)}
                className="np-button-secondary np-button-small"
              >
                {t("orgChart.reorder")}
              </Button>
              <Button
                onClick={handleDelete}
                disabled={saving}
                className="np-button-secondary np-button-small"
              >
                {t("orgChart.delete")}
              </Button>
            </span>
          )}
        </div>

        {canManage && assigning && (
          <form onSubmit={handleSaveLead} className="np-inline-form">
            <Select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="np-select"
              label={t.lang === "id" ? "Pimpinan" : "Lead"}
            >
              <option value="">{t("orgChart.noneOption")}</option>
              {employees.map((emp) => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.nickname || emp.full_name}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              disabled={saving}
              className="np-button-primary"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              type="button"
              onClick={() => setAssigning(false)}
              className="np-button-secondary"
            >
              {t("common.cancel")}
            </Button>
          </form>
        )}

        {canManage && moving && (
          <form onSubmit={handleMove} className="np-inline-form">
            <Select
              value={newParent}
              onChange={(e) => setNewParent(e.target.value)}
              className="np-select"
              label={t.lang === "id" ? "Unit induk" : "Parent unit"}
            >
              <option value="">{t("orgChart.topLevelOption")}</option>
              {moveOptions.map((u) => (
                <option key={u.unit_name} value={u.unit_name}>
                  {u.unit_name}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              disabled={saving}
              className="np-button-primary"
            >
              {saving ? t("orgChart.moving") : t("orgChart.moveHere")}
            </Button>
            <Button
              type="button"
              onClick={() => setMoving(false)}
              className="np-button-secondary"
            >
              {t("common.cancel")}
            </Button>
          </form>
        )}

        {canManage && reordering && (
          <form onSubmit={handleSaveOrder} className="np-inline-form">
            <Input
              type="number"
              placeholder={t("orgChart.orderPlaceholder")}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{
                width: 160,
              }}
              className="np-select"
              label={t("orgChart.orderPlaceholder")}
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
              onClick={() => setReordering(false)}
              className="np-button-secondary"
            >
              {t("common.cancel")}
            </Button>
          </form>
        )}
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}

        {node.members?.length > 0 && (
          <ul className="np-tree-members">
            {node.members.map((m) => (
              <li key={m.employee_id}>
                {m.nickname || m.full_name} — {m.job_title}
              </li>
            ))}
          </ul>
        )}
        {node.children?.map((child) => (
          <TreeNode
            key={child.name}
            node={child}
            depth={depth + 1}
            employees={employees}
            units={units}
            canManage={canManage}
            onChanged={onChanged}
            t={t}
          />
        ))}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function AddUnitForm({ units, employees, onAdded, t }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitType, setUnitType] = useState("Team");
  const [parentUnitName, setParentUnitName] = useState("");
  const [leadId, setLeadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!unitName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.createOrgUnit({
        unit_name: unitName,
        unit_type: unitType,
        parent_unit_name: parentUnitName || null,
        lead_employee_id: leadId || null,
      });
      setActionResult(u("saved"));
      notify(u("saved"));
      setUnitName("");
      setParentUnitName("");
      setLeadId("");
      onAdded();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="np-panel">
        <h3 className="np-section-title">{t("orgChart.addUnit")}</h3>
        <form onSubmit={handleSubmit} className="np-inline-form">
          <Input
            placeholder={t("orgChart.unitNamePlaceholder")}
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            style={{
              flex: 2,
            }}
            className="np-select"
            label={t("orgChart.unitNamePlaceholder")}
          />
          <Select
            value={unitType}
            onChange={(e) => setUnitType(e.target.value)}
            className="np-select"
            label={t.lang === "id" ? "Jenis unit" : "Unit type"}
          >
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Select
            value={parentUnitName}
            onChange={(e) => setParentUnitName(e.target.value)}
            className="np-select"
            label={t.lang === "id" ? "Unit induk" : "Parent unit"}
          >
            <option value="">{t("orgChart.topLevelOption")}</option>
            {units.map((u) => (
              <option key={u.unit_name} value={u.unit_name}>
                {u.unit_name}
              </option>
            ))}
          </Select>
          <Select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="np-select"
            label={t.lang === "id" ? "Pimpinan" : "Lead"}
          >
            <option value="">{t("orgChart.noLeadYetOption")}</option>
            {employees.map((emp) => (
              <option key={emp.employee_id} value={emp.employee_id}>
                {emp.nickname || emp.full_name}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={saving} className="np-button-primary">
            {saving ? t("common.adding") : t("common.add")}
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
