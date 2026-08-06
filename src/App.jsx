import { useEffect, useState } from 'react';
import Login from './Login.jsx';
import Directory from './pages/Directory.jsx';
import EmployeeForm from './pages/EmployeeForm.jsx';
import OrgChart from './pages/OrgChart.jsx';

export default function App() {
  const [status, setStatus] = useState('checking'); // checking | authed | anon

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setStatus(data.authenticated ? 'authed' : 'anon'))
      .catch(() => setStatus('anon'));
  }, []);

  if (status === 'checking') return null;
  if (status === 'anon') return <Login onLoggedIn={() => setStatus('authed')} />;

  return <Dashboard onLoggedOut={() => setStatus('anon')} />;
}

// view is one of: { name: 'directory' } | { name: 'orgchart' } |
// { name: 'employee', employeeId: string|null } (null = add new)
function Dashboard({ onLoggedOut }) {
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
          onOpen={(employeeId) => setView({ name: 'employee', employeeId })}
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

      {view.name === 'orgchart' && <OrgChart />}
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
