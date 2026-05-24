export function SectionCard({ title, icon: Icon, description, children, actions, className = "" }) {
  return (
    <div className={`card section-card ${className}`}>
      <div className="section-card__header">
        <div className="section-card__title-row">
          {Icon && <Icon size={14} className="text-accent" />}
          <span className="section-card__title">{title}</span>
        </div>
        {actions && <div className="row-actions">{actions}</div>}
      </div>
      {description && <p className="section-card__description">{description}</p>}
      <div>{children}</div>
    </div>
  );
}
