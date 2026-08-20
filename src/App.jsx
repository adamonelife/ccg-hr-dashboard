import { useEffect, useState } from 'react';
import Login from './Login.jsx';
import SetPassword from './SetPassword.jsx';
import Logo from './Logo.jsx';
import Directory from './pages/Directory.jsx';
import EmployeeForm from './pages/EmployeeForm.jsx';
import EmployeeCard from './pages/EmployeeCard.jsx';
import OrgChart from './pages/OrgChart.jsx';
import Leave from './pages/Leave.jsx';
import Documents from './pages/Documents.jsx';
import Setup from './pages/Setup.jsx';
import ChangeRequests from './pages/ChangeRequests.jsx';
import { LanguageProvider, LanguageToggle, useT } from './lib/i18n.jsx';

// Mirrors lib/permissions.mjs's STAFF_MANAGEMENT_ROLES (not
// FULL_VISIBILITY_ROLES — that one's specifically about self-edit
// exemption, see EmployeeForm.jsx/EmployeeCard.jsx's copies of it; this
// one is about who can review OTHER people's change requests, which
// includes Finance). Gates the "Change requests" nav tab; the route
// itself is the real enforcement.
const STAFF_MANAGEMENT_ROLES = ['Administrator', 'Director', 'HR', 'Finance'];

// LanguageProvider wraps literally everything, including the pre-auth
// screens (Login/SetPassword/the initial "checking session" loader) —
// someone shouldn't have to log in before they can read the login screen
// in their own language. See src/lib/i18n.jsx.
export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

function AppInner() {
  const [status, setStatus] = useState('checking'); // checking | authed | anon
  // { user, role, employee_id, full_name } once authed — role-based UI
  // (Directory columns/buttons) reads this, not just "are they logged in."
  const [session, setSession] = useState(null);
  // Reached via a one-time setup link (see EmployeeForm.jsx's "Login
  // account" section) — works regardless of login state, since the whole
  // point is there's no account/session yet.
  const [setupToken] = useState(() => new URLSearchParams(window.location.search).get('setup'));

  function loadSession() {
    return fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setSession(data);
          setStatus('authed');
        } else {
          setSession(null);
          setStatus('anon');
        }
      })
      .catch(() => {
        setSession(null);
        setStatus('anon');
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
          window.location.href = '/';
        }}
      />
    );
  }

  if (status === 'checking') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          height: '100vh',
          background: '#f5f5f5',
        }}
      >
        <Logo height={60} />
        <LanguageToggle />
      </div>
    );
  }
  if (status === 'anon') return <Login onLoggedIn={loadSession} />;

  // Forced first-login setup — real per-person logins only (the master
  // admin bootstrap has no employee_id, so it never hits this). Blocks
  // every other view until profile_setup_completed_at is set; see
  // src/pages/Setup.jsx and lib/employees.mjs's PATCH handler.
  if (session?.employee_id && !session.profile_setup_completed_at) {
    return <Setup employeeId={session.employee_id} onFinished={loadSession} />;
  }

  return <Dashboard session={session} onLoggedOut={() => { setSession(null); setStatus('anon'); }} />;
}

// view is one of: { name: 'directory' } | { name: 'orgchart' } |
// { name: 'employee', employeeId: string|null } (null = add new) |
// { name: 'card', employeeId: string }
function Dashboard({ session, onLoggedOut }) {
  const [view, setView] = useState({ name: 'directory' });
  const t = useT();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    onLoggedOut();
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Logo height={42} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LanguageToggle />
          <button onClick={handleLogout}>{t('app.logOut')}</button>
        </div>
      </div>

      <nav style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
        <NavLink active={view.name === 'directory'} onClick={() => setView({ name: 'directory' })}>
          {t('app.navDirectory')}
        </NavLink>
        <NavLink active={view.name === 'orgchart'} onClick={() => setView({ name: 'orgchart' })}>
          {t('app.navOrgChart')}
        </NavLink>
        <NavLink active={view.name === 'leave'} onClick={() => setView({ name: 'leave' })}>
          {t('app.navLeave')}
        </NavLink>
        <NavLink active={view.name === 'documents'} onClick={() => setView({ name: 'documents' })}>
          {t('app.navDocuments')}
        </NavLink>
        {STAFF_MANAGEMENT_ROLES.includes(session?.role) && (
          <NavLink active={view.name === 'change-requests'} onClick={() => setView({ name: 'change-requests' })}>
            {t('app.navChangeRequests')}
          </NavLink>
        )}
      </nav>

      {view.name === 'directory' && (
        <Directory
          role={session?.role}
          onOpen={(employeeId) => setView({ name: 'employee', employeeId })}
          onOpenCard={(employeeId) => setView({ name: 'card', employeeId })}
          onAdd={() => setView({ name: 'employee', employeeId: null })}
        />
      )}

      {view.name === 'employee' && (
        <EmployeeForm
          employeeId={view.employeeId}
          session={session}
          onSaved={() => setView({ name: 'directory' })}
          onCancel={() => setView({ name: 'directory' })}
        />
      )}

      {view.name === 'card' && (
        <EmployeeCard
          employeeId={view.employeeId}
          session={session}
          onBack={() => setView({ name: 'directory' })}
          onEdit={(employeeId) => setView({ name: 'employee', employeeId })}
        />
      )}

      {view.name === 'orgchart' && <OrgChart role={session?.role} />}

      {view.name === 'leave' && <Leave session={session} />}

      {view.name === 'documents' && <Documents session={session} />}

      {view.name === 'change-requests' && STAFF_MANAGEMENT_ROLES.includes(session?.role) && <ChangeRequests />}
    </div>
  );
}

function NavLink({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 700 : 400,
        color: active ? '#111' : '#666',
      }}
    >
      {children}
    </button>
  );
}
