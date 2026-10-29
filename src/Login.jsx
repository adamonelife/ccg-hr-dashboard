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
import Logo from "./Logo.jsx";
import { LanguageToggle, useT } from "./lib/i18n.jsx";
export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const t = useT();
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email || undefined,
          password,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? t.err(data.error) : t("login.failed"));
        return;
      }
      onLoggedIn();
    } catch {
      setError(t("login.networkError"));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="np-auth-wrap">
      <form onSubmit={handleSubmit} className="np-auth-card">
        <div className="np-auth-logo">
          <Logo height={54} />
        </div>
        <div className="np-language-row">
          <LanguageToggle />
        </div>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("login.emailPlaceholder")}
          autoFocus
          className="np-input"
          label={t("login.emailPlaceholder")}
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("login.passwordPlaceholder")}
          className="np-input"
          label={t("login.passwordPlaceholder")}
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
          {submitting ? t("login.signingIn") : t("login.signIn")}
        </Button>
      </form>
    </div>
  );
}
