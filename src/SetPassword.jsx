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
} from "./components/ui.jsx";
import { useState } from "react";
import { api } from "./lib/api.js";
import Logo from "./Logo.jsx";
import { LanguageToggle, useT } from "./lib/i18n.jsx";

// Reached via a one-time link an admin generates and shares manually (see
// EmployeeForm.jsx's "Login account" section) — /?setup=<token>. No
// session/login required to reach this page, since the whole point is
// setting up the account in the first place.
export default function SetPassword({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const t = useT();
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("setPassword.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("setPassword.mismatch"));
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
      <div className="np-auth-wrap">
        <div className="np-auth-card">
          <div className="np-auth-logo">
            <Logo height={54} />
          </div>
          <div className="np-language-row">
            <LanguageToggle />
          </div>
          <p>{t("setPassword.done")}</p>
          <Button onClick={onDone} className="np-button-primary">
            {t("setPassword.goToLogin")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="np-auth-wrap">
      <form onSubmit={handleSubmit} className="np-auth-card">
        <div className="np-language-row">
          <LanguageToggle />
        </div>
        <Logo height={58} />
        <h1 className="np-title">{t("setPassword.title")}</h1>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("setPassword.newPasswordPlaceholder")}
          autoFocus
          className="np-input"
          label={t("setPassword.newPasswordPlaceholder")}
        />
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("setPassword.confirmPlaceholder")}
          className="np-input"
          label={t("setPassword.confirmPlaceholder")}
        />
        {error && (
          <div className="np-feedback np-feedback-error" role="alert">
            {error}
          </div>
        )}
        <Button
          type="submit"
          disabled={submitting}
          className="np-button-primary"
        >
          {submitting ? t("setPassword.saving") : t("setPassword.setPassword")}
        </Button>
      </form>
    </div>
  );
}
