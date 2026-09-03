import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * useConfirmDialog — hook that provides { confirm, ConfirmDialogUI }.
 *
 * Usage:
 *   const { confirm, ConfirmDialogUI } = useConfirmDialog();
 *
 *   const handleDelete = async () => {
 *     const ok = await confirm({ title: "Delete item?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true });
 *     if (!ok) return;
 *     // ... do the delete
 *   };
 *
 *   return (
 *     <>
 *       <ConfirmDialogUI />
 *       ...page content...
 *     </>
 *   );
 */

let confirmResolve = null;

export function useConfirmDialog() {
  const [state, setState] = useState(null); // { title, message, confirmLabel, danger, resolve }

  const confirm = (opts = {}) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || "Confirm",
        message: opts.message || "Are you sure?",
        confirmLabel: opts.confirmLabel || "Confirm",
        cancelLabel: opts.cancelLabel || "Cancel",
        danger: opts.danger ?? false,
        resolve,
      });
    });
  };

  const handleConfirm = () => {
    state?.resolve?.(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve?.(false);
    setState(null);
  };

  const ConfirmDialogUI = state
    ? () => (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <AlertTriangle size={18} className={state.danger ? "text-danger" : "text-accent"} />
                {state.title}
              </div>
              <button className="btn--icon" onClick={handleCancel} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-base)" }}>
              {state.message}
            </p>
            <div className="form-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="btn btn--ghost" onClick={handleCancel}>
                {state.cancelLabel}
              </button>
              <button
                className={state.danger ? "btn btn--danger" : "btn"}
                onClick={handleConfirm}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )
    : () => null;

  // We return the actual rendered component, not a factory
  const DialogComponent = state
    ? (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <AlertTriangle size={18} className={state.danger ? "text-danger" : "text-accent"} />
                {state.title}
              </div>
              <button className="btn--icon" onClick={handleCancel} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-base)" }}>
              {state.message}
            </p>
            <div className="form-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="btn btn--ghost" onClick={handleCancel}>
                {state.cancelLabel}
              </button>
              <button
                className={state.danger ? "btn btn--danger" : "btn"}
                onClick={handleConfirm}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )
    : null;

  return { confirm, ConfirmDialog: DialogComponent };
}