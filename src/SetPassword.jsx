import { useState } from 'react';
import { api } from './lib/api.js';
import Logo from './Logo.jsx';
import { LanguageToggle, useT } from './lib/i18n.jsx';

// Reached via a one-time link an admin generates and shares manually (see
// EmployeeForm.jsx's "Login account" section) — /?setup=<token>. No
// session/login required to reach this page, since the whole point is
// setting up the account in the first place.
export default function SetPassword({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const t = useT();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t('setPassword.tooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('setPassword.mismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await api.setPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(t.err(err.message));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={styles.wrap}>
        <div style={styles.form}>
          <div style={styles.logoRow}>
            <Logo height={54} />
          </div>
          <div style={styles.toggleRow}>
            <LanguageToggle />
          </div>
          <p>{t('setPassword.done')}</p>
          <button onClick={onDone} style={styles.button}>
            {t('setPassword.goToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.toggleRow}>
          <LanguageToggle />
        </div>
        <h1 style={styles.title}>{t('setPassword.title')}</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('setPassword.newPasswordPlaceholder')}
          autoFocus
          style={styles.input}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t('setPassword.confirmPlaceholder')}
          style={styles.input}
        />
        {error && <div style={styles.error}>{error}</div>}
        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? t('setPassword.saving') : t('setPassword.setPassword')}
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
    width: 300,
    padding: 32,
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
  },
  title: { margin: 0, marginBottom: 8, fontSize: 18 },
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
