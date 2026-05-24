import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

// ── Context ────────────────────────────────────────────────
const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const DURATIONS = {
  success: 3500,
  error: 6000,
  warning: 4500,
  info: 3500,
};

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const addToast = useCallback((type, message, opts = {}) => {
    const id = ++idCounter;
    const duration = opts.duration ?? DURATIONS[type] ?? 4000;

    setToasts((prev) => [...prev, { id, type, message, duration }]);

    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        delete timersRef.current[id];
      }, duration);
    }

    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const toast = useCallback({
    success: (msg, opts) => addToast("success", msg, opts),
    error: (msg, opts) => addToast("error", msg, opts),
    warning: (msg, opts) => addToast("warning", msg, opts),
    info: (msg, opts) => addToast("info", msg, opts),
  }, [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast--${t.type}`}>
              <Icon size={16} className="toast__icon" />
              <span className="toast__message">{t.message}</span>
              <button
                className="toast__dismiss"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}