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
const LEAVE_TYPES = ["Annual", "Sick", "Emergency"];
// Mirrors lib/leave.mjs's BALANCE_MANAGE_ROLES — was missing Finance here
// until this pass (backend widened to include Finance during the
// HR/Finance staff-management-tier work; this UI-only copy had been
// missed, so Finance could allocate balances server-side but never saw
// the "Manage leave allocations" section to do it from).
const BALANCE_MANAGE_ROLES = ["Administrator", "Director", "HR", "Finance"];
export default function Leave({ session }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const canManageBalances = BALANCE_MANAGE_ROLES.includes(session?.role);
  return (
    <>
      <div>
        <PageHeading title={t("leave.title")} />

        {session?.employee_id ? (
          <MyLeave employeeId={session.employee_id} />
        ) : (
          <p className="np-muted">{t("leave.noRecordHint")}</p>
        )}

        <Approvals />

        {canManageBalances && <ManageBalances />}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function MyLeave({ employeeId }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  function load() {
    setError("");
    Promise.all([api.leaveBalances(employeeId), api.leaveRequests(employeeId)])
      .then(([balData, reqData]) => {
        setBalances(balData.balances || []);
        setRequests(reqData.requests || []);
      })
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, [employeeId]);
  return (
    <>
      <div className="np-section">
        <h3>{t("leave.myLeave")}</h3>
        {loading && <Loading />}
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            <Table className="np-table">
              <thead>
                <tr>
                  <th className="np-th">{t("leave.type")}</th>
                  <th className="np-th">{t("leave.cycle")}</th>
                  <th className="np-th">{t("leave.allocated")}</th>
                  <th className="np-th">{t("leave.used")}</th>
                  <th className="np-th">{t("leave.remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.leave_type}>
                    <td className="np-td">{b.leave_type}</td>
                    <td className="np-td">{b.year}</td>
                    <td className="np-td">{b.allocated_days}</td>
                    <td className="np-td">{b.used_days}</td>
                    <td className="np-td">{b.remaining_days}</td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <RequestForm employeeId={employeeId} onSubmitted={load} />

            <h4
              style={{
                marginTop: 20,
              }}
            >
              {t("leave.myRequests")}
            </h4>
            <Table className="np-table">
              <thead>
                <tr>
                  <th className="np-th">{t("leave.type")}</th>
                  <th className="np-th">{t("leave.start")}</th>
                  <th className="np-th">{t("leave.end")}</th>
                  <th className="np-th">{t("leave.halfDay")}</th>
                  <th className="np-th">{t("leave.status")}</th>
                  <th className="np-th">{t("leave.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="np-td">{r.leave_type}</td>
                    <td className="np-td">{r.start_date}</td>
                    <td className="np-td">{r.end_date}</td>
                    <td className="np-td">
                      {r.half_day ? t("common.yes") : ""}
                    </td>
                    <td className="np-td">
                      <Badge value={r.status} />
                    </td>
                    <td className="np-td">{r.reason}</td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="np-td">
                      {t("leave.noRequestsYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </>
        )}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function RequestForm({ employeeId, onSubmitted }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [leaveType, setLeaveType] = useState("Annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!startDate || (!halfDay && !endDate) || !reason.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.submitLeaveRequest({
        employee_id: employeeId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: halfDay ? startDate : endDate,
        half_day: halfDay,
        reason,
      });
      setActionResult(u("saved"));
      notify(u("saved"));
      setStartDate("");
      setEndDate("");
      setHalfDay(false);
      setReason("");
      onSubmitted();
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
          marginTop: 16,
        }}
        className="np-inline-form"
      >
        <Select
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          className="np-input"
          label={t.lang === "id" ? "Jenis cuti" : "Leave type"}
        >
          {LEAVE_TYPES.map((lt) => (
            <option key={lt} value={lt}>
              {lt}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="np-input"
          label={t.lang === "id" ? "Tanggal mulai" : "Start date"}
        />
        {!halfDay && (
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="np-input"
            label={t.lang === "id" ? "Tanggal akhir" : "End date"}
          />
        )}
        <label className="np-checkbox-field">
          <Input
            type="checkbox"
            checked={halfDay}
            onChange={(e) => setHalfDay(e.target.checked)}
          />
          {t("leave.halfDay")}
        </label>
        <Input
          placeholder={t("leave.reasonPlaceholder")}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{
            flex: 2,
          }}
          className="np-input"
          label={t("leave.reasonPlaceholder")}
        />
        <Button type="submit" disabled={saving} className="np-button-primary">
          {saving ? t("leave.submitting") : t("leave.requestLeave")}
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
function Approvals() {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);
  function load() {
    setError("");
    api
      .leaveApprovals()
      .then((data) => setRequests(data.requests || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);
  async function handleDecide(id, status) {
    setActingId(id);
    setError("");
    try {
      await api.decideLeaveRequest(id, status);
      setActionResult(status === "Approved" ? u("approved") : u("rejected"));
      notify(status === "Approved" ? u("approved") : u("rejected"));
      load();
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setActingId(null);
    }
  }
  if (loading) return <Loading />;
  return (
    <>
      <div className="np-section">
        <h3>{t("leave.approvals")}</h3>
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}
        <Table className="np-table">
          <thead>
            <tr>
              <th className="np-th">{t("orgChart.employee")}</th>
              <th className="np-th">{t("leave.type")}</th>
              <th className="np-th">{t("leave.start")}</th>
              <th className="np-th">{t("leave.end")}</th>
              <th className="np-th">{t("leave.reason")}</th>
              <th className="np-th"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="np-td">
                  {r.nickname || r.full_name}
                  {r.nickname && (
                    <span className="np-muted"> ({r.full_name})</span>
                  )}
                </td>
                <td className="np-td">{r.leave_type}</td>
                <td className="np-td">{r.start_date}</td>
                <td className="np-td">{r.end_date}</td>
                <td className="np-td">{r.reason}</td>
                <td className="np-td">
                  <Button
                    onClick={() => handleDecide(r.id, "Approved")}
                    disabled={actingId === r.id}
                    className="np-button-secondary np-button-small"
                  >
                    {actingId === r.id
                      ? t("common.saving")
                      : t("leave.approve")}
                  </Button>{" "}
                  <Button
                    onClick={() => handleDecide(r.id, "Rejected")}
                    disabled={actingId === r.id}
                    className="np-button-secondary np-button-small"
                  >
                    {t("leave.reject")}
                  </Button>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="np-td">
                  {u("noApprovals")}
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
function ManageBalances() {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [balances, setBalances] = useState([]);
  const [leaveType, setLeaveType] = useState("Annual");
  const [allocated, setAllocated] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .listEmployees()
      .then((data) =>
        setEmployees(
          (data.employees || []).filter((emp) => emp.can_view_detail),
        ),
      )
      .catch(() => {});
  }, []);
  function loadBalances(id) {
    if (!id) {
      setBalances([]);
      return;
    }
    api
      .leaveBalances(id)
      .then((data) => setBalances(data.balances || []))
      .catch((e) => setError(t.err(e.message)));
  }
  useEffect(() => {
    loadBalances(employeeId);
  }, [employeeId]);
  async function handleSave(e) {
    e.preventDefault();
    if (!employeeId || allocated === "") return;
    setSaving(true);
    setError("");
    try {
      await api.setLeaveBalance({
        employee_id: employeeId,
        leave_type: leaveType,
        allocated_days: allocated,
      });
      setActionResult(u("saved"));
      notify(u("saved"));
      setAllocated("");
      loadBalances(employeeId);
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="np-section">
        <h3>{t("leave.manageAllocations")}</h3>
        <p className="np-muted">{t("leave.manageHint")}</p>
        <div className="np-inline-form">
          <Select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="np-input"
            label={t.lang === "id" ? "Karyawan" : "Employee"}
          >
            <option value="">{t("leave.selectEmployee")}</option>
            {employees.map((emp) => (
              <option key={emp.employee_id} value={emp.employee_id}>
                {emp.nickname || emp.full_name} ({emp.employee_id})
              </option>
            ))}
          </Select>
          <Select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="np-input"
            label={t.lang === "id" ? "Jenis cuti" : "Leave type"}
          >
            {LEAVE_TYPES.map((lt) => (
              <option key={lt} value={lt}>
                {lt}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            step="0.5"
            placeholder={t("leave.allocatedDaysPlaceholder")}
            value={allocated}
            onChange={(e) => setAllocated(e.target.value)}
            className="np-input"
            label={t("leave.allocatedDaysPlaceholder")}
          />
          <Button
            onClick={handleSave}
            disabled={saving}
            className="np-button-primary"
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}

        {employeeId && (
          <Table
            style={{
              marginTop: 12,
            }}
            className="np-table"
          >
            <thead>
              <tr>
                <th className="np-th">{t("leave.type")}</th>
                <th className="np-th">{t("leave.cycle")}</th>
                <th className="np-th">{t("leave.allocated")}</th>
                <th className="np-th">{t("leave.used")}</th>
                <th className="np-th">{t("leave.remaining")}</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.leave_type}>
                  <td className="np-td">{b.leave_type}</td>
                  <td className="np-td">{b.year}</td>
                  <td className="np-td">{b.allocated_days}</td>
                  <td className="np-td">{b.used_days}</td>
                  <td className="np-td">{b.remaining_days}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
