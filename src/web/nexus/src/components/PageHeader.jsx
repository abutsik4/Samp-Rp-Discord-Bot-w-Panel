import { cn } from '../lib/utils.js'

export function PageHeader({ icon: Icon, title, subtitle, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-5', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <span className="w-10 h-10 rounded-lg bg-accent-purple/10 text-accent-purple border border-accent-purple/20 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
