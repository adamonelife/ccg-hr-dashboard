import { useEffect, useState } from 'react';
import Login from './Login.jsx';

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

function Dashboard({ onLoggedOut }) {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    onLoggedOut();
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>CCG HR</h1>
        <button onClick={handleLogout}>Log out</button>
      </div>
      <p style={{ color: '#666' }}>
        Scaffold only — no HR features built yet. Add modules here as they're built,
        following the same router + lib pattern as Ops Dash.
      </p>
    </div>
  );
}
