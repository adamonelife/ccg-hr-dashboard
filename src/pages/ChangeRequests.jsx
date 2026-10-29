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

// HR review queue for self-service change requests — see
// lib/change-requests.mjs. Administrator/HR/Director only (App.jsx hides
// the nav tab for everyone else; handleChangeRequests's GET ?scope=queue
// is the real enforcement). Approve/Reject are the only actions — there's
// no "edit before approving" here on purpose, same as Leave's approvals:
// if what was requested isn't right, reject it with a note and have them
// resubmit, rather than silently changing what they asked for.
//
// TYPE_KEYS maps request_type -> the `changeRequests.type.*` dictionary
// key; DIFF_KEY_NS looks up profile field names via the same
// `employeeForm.field.*` keys EmployeeForm.jsx uses, since request payload
// keys are the raw DB column names.
const TYPE_KEYS = {
  profile: "changeRequests.type.profile",
  skill_add: "changeRequests.type.skill_add",
  skill_update: "changeRequests.type.skill_update",
  skill_delete: "changeRequests.type.skill_delete",
};
export default function ChangeRequests() {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    load();
  }, []);
  function load() {
    setError("");
    api
      .changeRequestQueue()
      .then((data) => setRequests(data.requests || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  return (
    <>
      <div>
        <PageHeading title={t("changeRequests.title")} />
        <p className="np-intro">{t("changeRequests.intro")}</p>

        {loading && <Loading />}
        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && requests.length === 0 && (
          <EmptyState title={u("noChanges")} />
        )}

        {!loading &&
          requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onDecided={(message) => {
                setActionResult(message);
                load();
              }}
            />
          ))}
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}
function RequestCard({ request, onDecided }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const t = useT();
  const [notes, setNotes] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState("");
  async function decide(status) {
    setDeciding(true);
    setError("");
    try {
      await api.decideChangeRequest(request.id, status, notes);
      setActionResult(status === "Approved" ? u("approved") : u("rejected"));
      notify(status === "Approved" ? u("approved") : u("rejected"));
      onDecided(status === "Approved" ? u("approved") : u("rejected"));
    } catch (err) {
      setError(t.err(err.message));
      setDeciding(false);
    }
  }
  return (
    <>
      <div className="np-card">
        <div className="np-card-heading">
          <div>
            <strong>{request.nickname || request.full_name}</strong>
            <span className="np-muted"> · {request.employee_id}</span>
          </div>
          <span className="np-badge np-badge-neutral">
            {TYPE_KEYS[request.request_type]
              ? t(TYPE_KEYS[request.request_type])
              : request.request_type}
          </span>
        </div>
        <div className="np-muted">
          {t("changeRequests.requestedAt", {
            date: request.requested_at,
          })}
        </div>

        <Diff request={request} t={t} />

        {error && (
          <p className="np-feedback np-feedback-error" role="alert">
            {error}
          </p>
        )}

        <div className="np-actions">
          <Input
            placeholder={t("changeRequests.notePlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="np-input"
            label={t("changeRequests.notePlaceholder")}
          />
          <Button
            onClick={() => decide("Approved")}
            disabled={deciding}
            className="np-button-primary"
          >
            {deciding
              ? t("changeRequests.working")
              : t("changeRequests.approve")}
          </Button>
          <Button
            onClick={() => decide("Rejected")}
            disabled={deciding}
            className="np-button-danger-soft"
          >
            {t("changeRequests.reject")}
          </Button>
        </div>
      </div>
      <Feedback>{actionResult}</Feedback>
    </>
  );
}

// Profile requests carry {old, new} maps of field -> value (only the
// fields that actually changed). skill_add carries the new entry outright
// (nothing to diff against). skill_update carries {old, new} full entry
// snapshots. skill_delete carries {old} only.
function Diff({ request, t }) {
  const u = useUI();
  const { notify, confirm } = useFeedback();
  const [actionResult, setActionResult] = useState("");
  const { payload, request_type } = request;
  if (request_type === "profile" || request_type === "skill_update") {
    const oldVals = payload.old || {};
    const newVals = payload.new || {};
    const keys = Object.keys(newVals);
    return (
      <>
        <Table className="np-diff-table">
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <td className="np-muted">
                  {request_type === "profile"
                    ? t(`employeeForm.field.${k}`)
                    : k}
                </td>
                <td className="np-diff-old">{formatVal(oldVals[k], t)}</td>
                <td className="np-muted">→</td>
                <td className="np-diff-new">{formatVal(newVals[k], t)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Feedback>{actionResult}</Feedback>
      </>
    );
  }
  if (request_type === "skill_add") {
    return (
      <>
        <div className="np-diff-simple">
          <strong>{payload.category}</strong>: {payload.item}
          {payload.level &&
            t("changeRequests.levelSuffix", {
              level: payload.level,
            })}
          {payload.notes && (
            <span className="np-muted"> ({payload.notes})</span>
          )}
        </div>
        <Feedback>{actionResult}</Feedback>
      </>
    );
  }
  if (request_type === "skill_delete") {
    const old = payload.old || {};
    return (
      <>
        <div className="np-diff-simple">
          {t("changeRequests.remove", {
            category: old.category,
            item: `${old.item}${
              old.level
                ? t("changeRequests.levelSuffix", {
                    level: old.level,
                  })
                : ""
            }`,
          })}
        </div>
        <Feedback>{actionResult}</Feedback>
      </>
    );
  }
  return null;
}
function formatVal(v, t) {
  if (v === null || v === undefined || v === "")
    return <span>{t("changeRequests.blank")}</span>;
  return String(v);
}
