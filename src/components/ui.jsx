import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useUI } from "../lib/presentation.jsx";
export function Button({ variant, className = "", type = "button", ...props }) {
  // Resolve the legacy presentation class at this boundary so a control
  // has one variant, including hover/disabled states, rather than two skins.
  const variantPattern =
    /(?:^|\s)np-button-(primary|secondary|ghost|danger-soft|danger)(?=\s|$)/g;
  const legacy = [...className.matchAll(variantPattern)].at(-1)?.[1];
  const resolved =
    variant || (legacy === "danger-soft" ? "danger" : legacy) || "primary";
  const extraClasses = className.replace(variantPattern, " ").trim();
  return (
    <button
      type={type}
      className={`np-button np-button-${resolved} ${extraClasses}`}
      {...props}
    />
  );
}
export function Input({ className = "", type = "text", label, ...props }) {
  const u = useUI();
  const control = (
    <input
      type={type}
      className={`${type === "checkbox" ? "np-checkbox" : "np-input"} ${className}`}
      {...props}
    />
  );
  return label || type === "file" ? (
    <label className="np-field">
      <span>{label || u("fileLabel")}</span>
      {control}
    </label>
  ) : (
    control
  );
}
export function Select({ className = "", label, ...props }) {
  const control = <select className={`np-select ${className}`} {...props} />;
  return label ? (
    <label className="np-field">
      <span>{label}</span>
      {control}
    </label>
  ) : (
    control
  );
}
export function Table({ className = "", ...props }) {
  return (
    <div className="np-table-scroll" tabIndex="0">
      <table className={`np-table ${className}`} {...props} />
    </div>
  );
}
export function Badge({ value }) {
  const key = String(value || "").toLowerCase();
  const tone = ["active", "approved"].includes(key)
    ? "success"
    : ["pending", "on leave", "notice period"].includes(key)
      ? "warning"
      : ["rejected"].includes(key)
        ? "danger"
        : "neutral";
  return <span className={`np-badge np-badge-${tone}`}>{value || "—"}</span>;
}
export function Loading() {
  const u = useUI();
  return (
    <div className="np-loading" role="status" aria-live="polite">
      <span className="np-spinner" aria-hidden="true" />
      {u("loading")}
      <div className="np-skeleton" />
      <div className="np-skeleton short" />
    </div>
  );
}
export function EmptyState({ title, children }) {
  const u = useUI();
  return (
    <div className="np-empty">
      <span className="np-empty-symbol" aria-hidden="true">
        ◇
      </span>
      <h3>{title || u("empty")}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Feedback({ children, tone = "success" }) {
  return children ? (
    <p
      className={`np-feedback np-feedback-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  ) : null;
}
const FeedbackContext = createContext({
  notify: () => {},
  confirm: async () => false,
});
export function useFeedback() {
  return useContext(FeedbackContext);
}
export function PresentationProvider({ children }) {
  const [toasts, setToasts] = useState([]),
    [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const u = useUI();
  const notify = useCallback(
    (message) =>
      setToasts((items) => [
        ...items.slice(-2),
        { id: Date.now() + Math.random(), message },
      ]),
    [],
  );
  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        if (resolver.current) resolver.current(false);
        resolver.current = resolve;
        setDialog(options);
      }),
    [],
  );
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((items) => items.slice(1)), 6500);
    return () => clearTimeout(timer);
  }, [toasts]);
  function close(value) {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  }
  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      <div inert={dialog ? "" : undefined}>{children}</div>
      <div className="np-toasts" aria-live="polite">
        {toasts.map((item) => (
          <div role="status" className="np-toast" key={item.id}>
            <span aria-hidden="true">✓</span>
            {item.message}
            <button
              type="button"
              aria-label={u("cancel")}
              onClick={() =>
                setToasts((items) => items.filter((x) => x.id !== item.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {dialog && <Confirmation {...dialog} onClose={close} />}
    </FeedbackContext.Provider>
  );
}
function Confirmation({
  title,
  description,
  destructive = true,
  requiredText,
  onClose,
}) {
  const u = useUI(),
    [value, setValue] = useState(""),
    id = useId(),
    ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    return () => previous?.focus?.();
  }, []);
  function keydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose(false);
    }
    if (e.key === "Tab") {
      const nodes = [
        ...ref.current.querySelectorAll("button:not(:disabled),input"),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  return (
    <div className="np-modal-backdrop">
      <section
        ref={ref}
        className="np-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={keydown}
      >
        <span className="np-eyebrow">NALLIN PEOPLE</span>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
        {requiredText && (
          <label className="np-field">
            {u("typeToConfirm")}
            <strong>{requiredText}</strong>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        <div className="np-modal-actions">
          <Button variant="secondary" onClick={() => onClose(false)}>
            {u("cancel")}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            disabled={Boolean(requiredText && value !== requiredText)}
            onClick={() => onClose(true)}
          >
            {destructive ? u("remove") : u("continue")}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function PageHeading({ title, children }) {
  return (
    <div className="np-page-heading">
      <div>
        <p className="np-eyebrow">NALLIN PEOPLE</p>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}
