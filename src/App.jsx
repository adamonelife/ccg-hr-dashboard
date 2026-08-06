import { useEffect, useState } from 'react';
import Login from './Login.jsx';
import SetPassword from './SetPassword.jsx';
import Directory from './pages/Directory.jsx';
import EmployeeForm from './pages/EmployeeForm.jsx';
import EmployeeCard from './pages/EmployeeCard.jsx';
import OrgChart from './pages/OrgChart.jsx';

export default function App() {
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

  if (status === 'checking') return null;
  if (status === 'anon') return <Login onLoggedIn={loadSession} />;

  return <Dashboard session={session} onLoggedOut={() => { setSession(null); setStatus('anon'); }} />;
}

// view is one of: { name: 'directory' } | { name: 'orgchart' } |
// { name: 'employee', employeeId: string|null } (null = add new) |
// { name: 'card', employeeId: string }
function Dashboard({ session, onLoggedOut }) {
  const [view, setView] = useState({ name: 'directory' });

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    onLoggedOut();
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>CCG HR</h1>
        <button onClick={handleLogout}>Log out</button>
      </div>

      <nav style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
        <NavLink active={view.name === 'directory'} onClick={() => setView({ name: 'directory' })}>
          Directory
        </NavLink>
        <NavLink active={view.name === 'orgchart'} onClick={() => setView({ name: 'orgchart' })}>
          Org chart
        </NavLink>
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
          onSaved={() => setView({ name: 'directory' })}
          onCancel={() => setView({ name: 'directory' })}
        />
      )}

      {view.name === 'card' && (
        <EmployeeCard
          employeeId={view.employeeId}
          onBack={() => setView({ name: 'directory' })}
          onEdit={(employeeId) => setView({ name: 'employee', employeeId })}
        />
      )}

      {view.name === 'orgchart' && <OrgChart role={session?.role} />}
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
