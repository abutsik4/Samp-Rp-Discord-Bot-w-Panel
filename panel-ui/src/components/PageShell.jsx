import { AlertCircle } from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { PageHeader } from "./PageHeader";

/**
 * PageShell — consistent page layout wrapper.
 *
 * Provides:
 *  - PageHeader with icon, title, subtitle, actions
 *  - Loading skeleton while data loads
 *  - Error alert with retry button
 *  - Consistent padding and spacing
 *
 * Props:
 *  icon       — Lucide icon component
 *  title      — page heading
 *  subtitle   — muted text below title
 *  actions    — right-aligned node (buttons, filters)
 *  loading    — show skeleton
 *  error      — show error alert (string or Error object)
 *  onRetry    — callback for retry button (if omitted, page-reload)
 *  children   — page content (rendered only when !loading && !error)
 */

export function PageShell({
  icon: Icon,
  title,
  subtitle,
  actions,
  loading = false,
  error = null,
  onRetry,
  children,
}) {
  const errorMessage =
    error?.message || (typeof error === "string" ? error : error ? String(error) : null);

  return (
    <div className="page">
      <PageHeader
        icon={Icon}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />

      {errorMessage && (
        <div className="alert alert--error" style={{ marginBottom: "var(--space-4)" }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginLeft: "auto" }}
            onClick={onRetry || (() => window.location.reload())}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton type="grid" rows={4} />
      ) : !errorMessage ? (
        children
      ) : null}
    </div>
  );
}