import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils.js'

const STYLES = {
  info: { icon: Info, cls: 'border-accent-cyan/30 bg-accent-cyan/5 text-text-primary', iconCls: 'text-accent-cyan' },
  success: { icon: CheckCircle2, cls: 'border-green-500/30 bg-green-500/5 text-text-primary', iconCls: 'text-green-400' },
  warning: { icon: AlertTriangle, cls: 'border-accent-amber/30 bg-accent-amber/5 text-text-primary', iconCls: 'text-accent-amber' },
  error: { icon: AlertCircle, cls: 'border-accent-rose/30 bg-accent-rose/5 text-text-primary', iconCls: 'text-accent-rose' },
}

export function Alert({ type = 'info', children, className }) {
  const s = STYLES[type] || STYLES.info
  const Icon = s.icon
  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', s.cls, className)}>
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', s.iconCls)} />
      <div className="flex-1">{children}</div>
    </div>
  )
}
