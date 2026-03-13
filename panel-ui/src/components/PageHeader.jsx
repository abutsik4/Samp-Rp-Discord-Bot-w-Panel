export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-header__left">
        <div className="page-header__icon">
          <Icon size={20} />
        </div>
        <div>
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
