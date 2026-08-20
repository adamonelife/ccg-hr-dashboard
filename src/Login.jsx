import { useState } from 'react';
import Logo from './Logo.jsx';
import { LanguageToggle, useT } from './lib/i18n.jsx';

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const t = useT();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? t.err(data.error) : t('login.failed'));
        return;
      }
      onLoggedIn();
    } catch {
      setError(t('login.networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.logoRow}>
          <Logo height={54} />
        </div>
        <div style={styles.toggleRow}>
          <LanguageToggle />
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('login.emailPlaceholder')}
          autoFocus
          style={styles.input}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('login.passwordPlaceholder')}
          style={styles.input}
        />
        {error && <div style={styles.error}>{error}</div>}
        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontFamily: 'system-ui, sans-serif',
    background: '#f5f5f5',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: 280,
    padding: 32,
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
  },
  logoRow: { display: 'flex', justifyContent: 'center', marginBottom: 8 },
  toggleRow: { display: 'flex', justifyContent: 'center', marginBottom: 4 },
  input: { padding: 10, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 },
  button: {
    padding: 10,
    fontSize: 14,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  error: { color: '#c00', fontSize: 13 },
};
