export function LoadingSkeleton({ type = "card", rows = 5 }) {
  if (type === "panel") {
    return (
      <div className="fullscreen-center">
        <span className="text-muted">Loading…</span>
      </div>
    );
  }

  if (type === "grid") {
    return (
      <div className="skeleton-grid">
        {Array.from({ length: rows || 8 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
    );
  }

  if (type === "table") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    );
  }

  // default: card
  return <div className="skeleton skeleton-card" />;
}
