import { cn } from '../lib/utils.js'

export function SectionCard({ title, icon: Icon, actions, description, children, className }) {
  return (
    <section className={cn('card p-4 sm:p-5 animate-fade-in', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span className="w-7 h-7 rounded-md bg-accent-purple/10 text-accent-purple border border-accent-purple/20 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="font-semibold text-sm sm:text-base truncate">{title}</h3>}
              {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  )
}
