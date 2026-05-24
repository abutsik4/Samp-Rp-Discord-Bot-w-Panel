export function StatCard({ icon: Icon, label, value, accentColor, iconBg }) {
  const iconStyle = {
    background: iconBg || "var(--color-accent-subtle)",
    color: accentColor || "var(--color-accent)",
  };

  return (
    <div className="card stat-card">
      <div className="stat-card__header">
        <div className="stat-card__icon" style={iconStyle}>
          {Icon && <Icon size={16} />}
        </div>
      </div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}
