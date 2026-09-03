import { cn } from '../lib/utils.js'

export function LoadingSkeleton({ rows = 3, className }) {
  return (
    <div className={cn('space-y-2 animate-pulse', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded-md bg-bg-elevated/60" />
      ))}
    </div>
  )
}
