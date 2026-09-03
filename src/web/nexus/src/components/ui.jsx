import { forwardRef } from 'react'
import { cn } from '../lib/utils.js'

const VARIANTS = {
  primary: 'bg-accent-purple text-white hover:bg-accent-purple/90 border border-accent-purple',
  ghost: 'bg-bg-elevated text-text-primary hover:bg-bg-hover border border-border',
  danger: 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 border border-accent-rose/30',
  icon: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-transparent p-1.5 rounded-md',
  iconDanger: 'bg-transparent text-accent-rose hover:bg-accent-rose/10 border border-transparent p-1.5 rounded-md',
}

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3 py-2 gap-2',
}

export const Button = forwardRef(function Button(
  { variant = 'ghost', size = 'sm', className, children, ...props },
  ref,
) {
  const isIcon = variant === 'icon' || variant === 'iconDanger'
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant] || VARIANTS.ghost,
        !isIcon && (SIZES[size] || SIZES.sm),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary',
        'placeholder:text-text-muted focus:outline-none focus:border-accent-purple/60 focus:bg-bg-card',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'w-full bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary',
        'focus:outline-none focus:border-accent-purple/60 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Field({ label, children, className }) {
  return (
    <label className={cn('flex flex-col gap-1 text-xs text-text-secondary', className)}>
      {label && <span>{label}</span>}
      {children}
    </label>
  )
}

export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm cursor-pointer select-none', className)}>
      <input
        type="checkbox"
        className="w-4 h-4 rounded border-border bg-bg-elevated accent-accent-purple"
        {...props}
      />
      {label && <span>{label}</span>}
    </label>
  )
}
