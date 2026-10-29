import { useEffect, useState } from "react";
import Login from "./Login.jsx";
import SetPassword from "./SetPassword.jsx";
import Logo from "./Logo.jsx";
import Directory from "./pages/Directory.jsx";
import EmployeeForm from "./pages/EmployeeForm.jsx";
import EmployeeCard from "./pages/EmployeeCard.jsx";
import OrgChart from "./pages/OrgChart.jsx";
import Leave from "./pages/Leave.jsx";
import Documents from "./pages/Documents.jsx";
import Setup from "./pages/Setup.jsx";
import ChangeRequests from "./pages/ChangeRequests.jsx";
import { LanguageProvider, LanguageToggle, useT } from "./lib/i18n.jsx";
import { useUI } from "./lib/presentation.jsx";
import {
  Button,
  Loading,
  PresentationProvider,
  useFeedback,
  Feedback,
} from "./components/ui.jsx";

// Mirrors lib/permissions.mjs's STAFF_MANAGEMENT_ROLES (not
// FULL_VISIBILITY_ROLES — that one's specifically about self-edit
// exemption, see EmployeeForm.jsx/EmployeeCard.jsx's copies of it; this
// one is about who can review OTHER people's change requests, which
// includes Finance). Gates the "Change requests" nav tab; the route
// itself is the real enforcement.
const STAFF_MANAGEMENT_ROLES = ["Administrator", "Director", "HR", "Finance"];

// LanguageProvider wraps literally everything, including the pre-auth
// screens (Login/SetPassword/the initial "checking session" loader) —
// someone shouldn't have to log in before they can read the login screen
// in their own language. See src/lib/i18n.jsx.
export default function App() {
  return (
    <LanguageProvider>
      <PresentationProvider>
        <AppInner />
      </PresentationProvider>
    </LanguageProvider>
  );
}

function AppInner() {
  const [status, setStatus] = useState("checking"); // checking | authed | anon
  // { user, role, employee_id, full_name } once authed — role-based UI
  // (Directory columns/buttons) reads this, not just "are they logged in."
  const [session, setSession] = useState(null);
  // Reached via a one-time setup link (see EmployeeForm.jsx's "Login
  // account" section) — works regardless of login state, since the whole
  // point is there's no account/session yet.
  const [setupToken] = useState(() =>
    new URLSearchParams(window.location.search).get("setup"),
  );

  function loadSession() {
    return fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setSession(data);
          setStatus("authed");
        } else {
          setSession(null);
          setStatus("anon");
        }
      })
      .catch(() => {
        setSession(null);
        setStatus("anon");
      });
  }

  useEffect(() => {
    if (setupToken) return;
    loadSession();
  }, [setupToken]);

  if (setupToken) {
    return (
      <SetPassword
        token={setupToken}
        onDone={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  if (status === "checking")
    return (
      <div className="np-auth-wrap">
        <Logo height={64} />
        <Loading />
      </div>
    );
  if (status === "anon") return <Login onLoggedIn={loadSession} />;

  // Forced first-login setup — real per-person logins only (the master
  // admin bootstrap has no employee_id, so it never hits this). Blocks
  // every other view until profile_setup_completed_at is set; see
  // src/pages/Setup.jsx and lib/employees.mjs's PATCH handler.
  if (session?.employee_id && !session.profile_setup_completed_at) {
    return <Setup employeeId={session.employee_id} onFinished={loadSession} />;
  }

  return (
    <Dashboard
      session={session}
      onLoggedOut={() => {
        setSession(null);
        setStatus("anon");
      }}
    />
  );
}

// view is one of: { name: 'directory' } | { name: 'orgchart' } |
// { name: 'employee', employeeId: string|null } (null = add new) |
// { name: 'card', employeeId: string }
function Dashboard({ session, onLoggedOut }) {
  const [view, setView] = useState({ name: "directory" });
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [dirty, setDirty] = useState(false),
    [logoutPending, setLogoutPending] = useState(false),
    [logoutError, setLogoutError] = useState("");
  const t = useT(),
    u = useUI();
  const { confirm } = useFeedback();
  const section = ["employee", "card"].includes(view.name)
    ? "directory"
    : view.name;
  const nav = [
    ["directory", "people", "people"],
    ["orgchart", "organisation", "organisation"],
    ["leave", "leave", "leave"],
    ["documents", "documents", "documents"],
    ...(STAFF_MANAGEMENT_ROLES.includes(session?.role)
      ? [["change-requests", "changes", "changes"]]
      : []),
  ];
  async function navigate(next) {
    if (
      dirty &&
      !(await confirm({
        title: u("unsaved"),
        description: u("unsavedNote"),
        destructive: false,
      }))
    )
      return;
    setDirty(false);
    setView(next);
  }
  useEffect(() => {
    document.title = `${u(nav.find(([key]) => key === section)?.[1] || "people")} · Nallin People`;
  }, [section, t.lang]);
  async function handleLogout() {
    if (
      dirty &&
      !(await confirm({
        title: u("unsaved"),
        description: u("unsavedNote"),
        destructive: false,
      }))
    )
      return;
    setLogoutPending(true);
    setLogoutError("");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error();
      onLoggedOut();
    } catch {
      setLogoutError(u("logoutError"));
    } finally {
      setLogoutPending(false);
    }
  }
  const displayName = session.full_name || u("bootstrap");
  return (
    <div className="np-shell">
      <a className="np-skip" href="#people-content">
        {u("skip")}
      </a>
      <aside className="np-sidebar">
        <div className="np-sidebar-brand">
          <Logo height={54} />
        </div>
        <div className="np-sidebar-nav">
          <p className="np-eyebrow">{u("workspace")}</p>
          <nav aria-label="People">
            {nav.map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                className={`np-nav-item ${section === key ? "active" : ""}`}
                aria-current={section === key ? "page" : undefined}
                onClick={() => navigate({ name: key })}
              >
                <NavIcon name={icon} />
                <span>{u(label)}</span>
                {section === key && <i />}
              </button>
            ))}
          </nav>
        </div>
        <div className="np-sidebar-footer">
          <div className="np-module-deferred">
            <span aria-hidden="true">▦</span>
            <div>
              <strong>{u("switch")}</strong>
              <small>{u("deferred")}</small>
            </div>
            <span aria-hidden="true">⌄</span>
          </div>
          <div className="np-user">
            <span className="np-avatar small">
              {displayName
                .split(/\s+/)
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{displayName}</strong>
              <small>
                {session.role === "Administrator"
                  ? u("bootstrap")
                  : session.role}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="np-workspace">
        <header className="np-topbar">
          <div className="np-breadcrumb">
            <span>Nallin</span>
            <span>/</span>
            <strong>People</strong>
            {section !== "directory" && (
              <>
                <span>/</span>
                <span>
                  {u(nav.find(([key]) => key === section)?.[1] || "people")}
                </span>
              </>
            )}
          </div>
          <div className="np-account-actions">
            <LanguageToggle />
            <Button
              variant="ghost"
              disabled={logoutPending}
              onClick={handleLogout}
            >
              {logoutPending ? t("common.loading") : t("app.logOut")}
            </Button>
          </div>
        </header>
        <main id="people-content" className="np-content">
          <Feedback tone="error">{logoutError}</Feedback>
          <Feedback>{view.saved ? u("saved") : ""}</Feedback>
          <div hidden={view.name !== "directory"}>
            <Directory
              refreshKey={directoryRevision}
              role={session.role}
              onOpen={(id) => navigate({ name: "card", employeeId: id })}
              onOpenCard={(id) => navigate({ name: "card", employeeId: id })}
              onAdd={() => navigate({ name: "employee", employeeId: null })}
            />
          </div>
          {view.name === "card" && (
            <EmployeeCard
              key={view.employeeId}
              employeeId={view.employeeId}
              session={session}
              onDeleted={() => {
                setDirectoryRevision((v) => v + 1);
                navigate({ name: "directory" });
              }}
              onBack={() => navigate({ name: "directory" })}
              onEdit={(id) => navigate({ name: "employee", employeeId: id })}
            />
          )}
          {view.name === "employee" && (
            <EmployeeForm
              key={view.employeeId || "new"}
              employeeId={view.employeeId}
              session={session}
              onDirtyChange={setDirty}
              onSaved={(id) => {
                setDirectoryRevision((v) => v + 1);
                setDirty(false);
                setView({
                  name: "card",
                  employeeId: id || view.employeeId,
                  saved: true,
                });
              }}
              onDeleted={() => {
                setDirectoryRevision((v) => v + 1);
                setDirty(false);
                setView({ name: "directory" });
              }}
              onCancel={() =>
                navigate(
                  view.employeeId
                    ? { name: "card", employeeId: view.employeeId }
                    : { name: "directory" },
                )
              }
            />
          )}
          {view.name === "orgchart" && <OrgChart role={session.role} />}
          {view.name === "leave" && <Leave session={session} />}
          {view.name === "documents" && <Documents session={session} />}
          {view.name === "change-requests" &&
            STAFF_MANAGEMENT_ROLES.includes(session.role) && <ChangeRequests />}
        </main>
        <footer className="np-workspace-footer">
          <span>NALLIN PEOPLE</span>
          <span>{u("subtitle")}</span>
        </footer>
      </div>
    </div>
  );
}
function NavIcon({ name }) {
  const paths = {
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",
    organisation:
      "M12 8v4 M5 16v-4h14v4 M8 3h8v5H8z M2 16h6v5H2z M16 16h6v5h-6z",
    leave:
      "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M8 15h3",
    documents: "M14 2H6a2 2 0 0 0-2 2v16h16V8z M14 2v6h6 M8 13h8 M8 17h6",
    changes: "M9 5h11 M9 12h11 M9 19h11 M3 5h1 M3 12h1 M3 19h1",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
      {name === "people" && <circle cx="9" cy="7" r="4" />}
    </svg>
  );
}
