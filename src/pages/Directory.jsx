import { visibleNickname } from "../lib/employee-identity.js";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useT } from "../lib/i18n.jsx";
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
const MANAGEMENT = ["Administrator", "Director", "HR", "Finance"];
export default function Directory({
  role,
  refreshKey,
  onOpen,
  onOpenCard,
  onAdd,
}) {
  const [employees, setEmployees] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [department, setDepartment] = useState(""),
    [team, setTeam] = useState(""),
    [status, setStatus] = useState("active");
  const t = useT(),
    u = useUI(),
    management = MANAGEMENT.includes(role),
    includeInactive = management && status !== "active";
  function load() {
    setLoading(true);
    setError("");
    api
      .listEmployees(includeInactive)
      .then((data) => setEmployees(data.employees || []))
      .catch((e) => setError(t.err(e.message)))
      .finally(() => setLoading(false));
  }
  useEffect(load, [includeInactive, refreshKey]);
  const departments = [
      ...new Set(employees.map((e) => e.department).filter(Boolean)),
    ].sort(),
    teams = [...new Set(employees.map((e) => e.team).filter(Boolean))].sort();
  const filtered = useMemo(
    () =>
      employees.filter((e) => {
        const inactive = ["Resigned", "Terminated"].includes(
          e.employment_status,
        );
        return (
          (!query ||
            [
              e.full_name,
              e.nickname,
              e.employee_id,
              e.department,
              e.team,
              e.job_title,
            ]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (!department || e.department === department) &&
          (!team || e.team === team) &&
          (status === "all" || (status === "inactive" ? inactive : !inactive))
        );
      }),
    [employees, query, department, team, status],
  );
  const hasStart =
    management && employees.some((e) => Object.hasOwn(e, "start_date"));
  return (
    <section className="np-directory">
      <div className="np-page-heading">
        <div>
          <p className="np-eyebrow">NALLIN PEOPLE</p>
          <h1>{u("people")}</h1>
          <p>{u("directoryDescription")}</p>
        </div>
        {management && (
          <Button onClick={onAdd}>
            <span aria-hidden="true">＋</span>
            {u("add")}
          </Button>
        )}
      </div>
      <div className="np-register-card">
        <div className="np-register-heading">
          <div>
            <h2>{u("staff")}</h2>
            <span className="np-count">{loading ? "—" : filtered.length}</span>
          </div>
          <span className="np-muted">
            {!loading &&
              `${employees.filter((e) => !["Resigned", "Terminated"].includes(e.employment_status)).length} ${u("active").toLowerCase()} ${u("employees")}`}
          </span>
        </div>
        <div className="np-filters" aria-label={u("filters")}>
          <label className="np-search">
            <span aria-hidden="true">⌕</span>
            <Input
              aria-label={u("search")}
              placeholder={u("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="np-filter-label">
            {u("department")}
            <Select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">{u("all")}</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </label>
          <label className="np-filter-label">
            {u("team")}
            <Select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">{u("all")}</option>
              {teams.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </label>
          <label className="np-filter-label">
            {u("status")}
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{u("active")}</option>
              {management && (
                <>
                  <option value="inactive">{u("inactive")}</option>
                  <option value="all">{u("all")}</option>
                </>
              )}
            </Select>
          </label>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="np-state">
            <Feedback tone="error">{error}</Feedback>
            <Button variant="secondary" onClick={load}>
              {u("retry")}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title={u("noResults")}>
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setDepartment("");
                setTeam("");
                setStatus("active");
              }}
            >
              {u("reset")}
            </Button>
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">{u("employee")}</th>
                <th scope="col">{u("department")}</th>
                <th scope="col">{u("team")}</th>
                {hasStart && <th scope="col">{u("start")}</th>}
                <th scope="col">{u("status")}</th>
                <th scope="col">
                  <span className="np-sr-only">{u("open")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.employee_id}>
                  <td>
                    <div className="np-employee-cell">
                      <span className="np-avatar">
                        {e.full_name
                          .split(/\s+/)
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <strong>{e.full_name}</strong>
                        {(visibleNickname(e) || e.job_title) && (
                          <span className="np-identity-line">
                            {visibleNickname(e) && (
                              <b className="np-nickname">
                                {visibleNickname(e)}
                              </b>
                            )}
                            {visibleNickname(e) && e.job_title && " · "}
                            {e.job_title}
                          </span>
                        )}
                        <small>{e.employee_id}</small>
                      </div>
                    </div>
                  </td>
                  <td>{e.department || "—"}</td>
                  <td>
                    {e.team ? (
                      <span className="np-team-tag">{e.team}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {hasStart && (
                    <td className="np-nowrap">{e.start_date || "—"}</td>
                  )}
                  <td>
                    <Badge value={e.employment_status} />
                  </td>
                  <td>
                    {e.can_view_detail && (
                      <Button
                        variant="ghost"
                        className="np-open-button"
                        aria-label={`${u("open")}: ${e.full_name}`}
                        onClick={() => onOpen(e.employee_id)}
                      >
                        {u("open")}
                        <span aria-hidden="true">↗</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="np-register-footer">
          <span>{!loading && `${filtered.length} ${u("employees")}`}</span>
          <span>{u("sort")}</span>
        </div>
      </div>
    </section>
  );
}
