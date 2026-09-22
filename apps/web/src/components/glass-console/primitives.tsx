'use client'

import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export type GlassSurface = 'base' | 'elevated' | 'subtle'
export type GlassStatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'unsupported' | 'info'

const SURFACE_CLASS: Record<GlassSurface, string> = {
  base: 'bg-glass-base',
  elevated: 'bg-glass-elevated',
  subtle: 'bg-glass-subtle',
}

const GLOW_SHADOW_CLASS: Record<'none' | 'primary' | 'success' | 'warning' | 'danger', string> = {
  none: 'shadow-glass',
  primary: 'shadow-glow-primary',
  success: 'shadow-glow-success',
  warning: 'shadow-glow-warning',
  danger: 'shadow-glow-danger',
}

const METRIC_TONE_CLASS: Record<GlassStatusTone, string> = {
  success: 'text-glass-status-success',
  warning: 'text-glass-status-warning',
  danger: 'text-glass-status-danger',
  unsupported: 'text-glass-status-unsupported',
  neutral: 'text-glass-text-primary',
  info: 'text-glass-accent-primary',
}

export const GlassPanel = forwardRef<HTMLDivElement, {
  children: ReactNode
  surface?: GlassSurface
  glow?: 'none' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}>(function GlassPanel({ children, surface = 'base', glow = 'none', className = '' }, ref) {
  const glowClass = GLOW_SHADOW_CLASS[glow]
  return (
    <div
      ref={ref}
      className={`glass-panel rounded-xl border border-glass-border-default ${SURFACE_CLASS[surface]} ${glowClass} ${className}`}
    >
      {children}
    </div>
  )
})

export function GlassCard({
  title,
  description,
  actions,
  footer,
  surface = 'base',
  density = 'comfortable',
  children,
  className = '',
}: {
  title?: string
  description?: string
  actions?: ReactNode
  footer?: ReactNode
  surface?: GlassSurface
  density?: 'comfortable' | 'compact'
  children: ReactNode
  className?: string
}) {
  const headerPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3'
  const bodyPad = density === 'compact' ? 'px-3 py-3' : 'px-4 py-4'
  const footerPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3'
  return (
    <GlassPanel surface={surface} className={className}>
      {title || actions ? (
        <div className={`flex items-start justify-between gap-3 border-b border-glass-border-subtle ${headerPad}`}>
          <div>
            {title ? <h3 className="text-[13px] font-semibold text-glass-text-primary">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-[11px] text-glass-text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyPad}>{children}</div>
      {footer ? <div className={`border-t border-glass-border-subtle ${footerPad}`}>{footer}</div> : null}
    </GlassPanel>
  )
}

const PROGRESS_BAR_TONE_CLASS: Record<GlassStatusTone, string> = {
  success: 'bg-glass-status-success',
  warning: 'bg-glass-status-warning',
  danger: 'bg-glass-status-danger',
  unsupported: 'bg-glass-status-unsupported',
  neutral: 'bg-glass-accent-primary',
  info: 'bg-glass-accent-primary',
}

export function MetricWidget({
  label,
  value,
  unit,
  emptyLabel = '—',
  tone = 'neutral',
  progress,
  pill,
  caption,
}: {
  label: string
  value: string | number | null | undefined
  unit?: string
  emptyLabel?: string
  tone?: GlassStatusTone
  progress?: { numerator: number; denominator: number }
  pill?: ReactNode
  caption?: ReactNode
}) {
  const toneClass = METRIC_TONE_CLASS[tone]
  const ratio =
    progress && progress.denominator > 0 ? Math.max(0, Math.min(1, progress.numerator / progress.denominator)) : null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-glass-text-muted">{label}</div>
        {pill}
      </div>
      {value === null ? (
        <div className="h-5 w-16 animate-pulse rounded bg-glass-subtle" aria-hidden="true" />
      ) : (
        <>
          <div className={`font-mono text-lg font-semibold tabular-nums ${toneClass}`}>
            {value === undefined || value === '' ? emptyLabel : value}
            {value !== undefined && value !== '' && unit ? <span className="ml-1 text-[11px] font-normal text-glass-text-muted">{unit}</span> : null}
          </div>
          {ratio !== null ? (
            <div className="h-1 w-full overflow-hidden rounded-full bg-glass-subtle">
              <div
                className={`h-full rounded-full transition-all duration-300 ${PROGRESS_BAR_TONE_CLASS[tone]}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          ) : null}
          {caption ? <p className="text-[10.5px] leading-snug text-glass-text-muted">{caption}</p> : null}
        </>
      )}
    </div>
  )
}

const STATUS_TONE_CLASS: Record<GlassStatusTone, string> = {
  success: 'text-glass-status-success border-glass-status-success/50 bg-glass-status-success/15',
  warning: 'text-glass-status-warning border-glass-status-warning/50 bg-glass-status-warning/15',
  danger: 'text-glass-status-danger border-glass-status-danger/50 bg-glass-status-danger/15',
  unsupported: 'text-glass-status-unsupported border-glass-status-unsupported/50 bg-glass-status-unsupported/15',
  neutral: 'text-glass-status-neutral border-glass-status-neutral/40 bg-glass-subtle',
  info: 'text-glass-accent-primary border-glass-accent-primary/50 bg-glass-accent-primary/15',
}

const STATUS_GLOW_CLASS: Partial<Record<GlassStatusTone, string>> = {
  success: 'shadow-glow-success',
  warning: 'shadow-glow-warning',
  danger: 'shadow-glow-danger',
  unsupported: 'shadow-glow-danger',
}

export function HighTechStatusPill({
  label,
  tone,
  icon,
}: {
  label: string
  tone: GlassStatusTone
  icon: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${STATUS_TONE_CLASS[tone]} ${STATUS_GLOW_CLASS[tone] ?? ''}`}
    >
      <span aria-hidden="true" className="flex h-3 w-3 items-center justify-center">
        {icon}
      </span>
      {label}
    </span>
  )
}

export const GlowButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }>(
  function GlowButton({ children, loading = false, disabled, className = '', ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border border-glass-border-default bg-glass-accent-primary/15 px-3.5 text-[13px] font-semibold text-glass-accent-primary shadow-glow-primary transition-colors duration-150 ease-in-out hover:bg-glass-accent-primary/25 focus-visible:outline-none focus-visible:shadow-glass-focus disabled:cursor-not-allowed disabled:opacity-glass-disabled ${className}`}
        {...rest}
      >
        {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : null}
        {children}
      </button>
    )
  },
)

export const GlassOutlineButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'danger' }>(
  function GlassOutlineButton({ children, className = '', tone = 'default', ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={`inline-flex h-8 items-center justify-center rounded-md border border-glass-border-default bg-glass-subtle px-3 text-[12px] font-medium transition-colors duration-150 ease-in-out hover:bg-glass-elevated focus-visible:outline-none focus-visible:shadow-glass-focus disabled:cursor-not-allowed disabled:opacity-glass-disabled ${
          tone === 'danger' ? 'text-glass-status-danger' : 'text-glass-text-secondary hover:text-glass-text-primary'
        } ${className}`}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

export function GlassDataRow({ label, value, children }: { label: string; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-glass-text-muted">{label}</span>
      <div className="text-[13px] font-medium text-glass-text-primary">{value !== undefined ? value : children}</div>
    </div>
  )
}

const FIELD_BASE =
  'w-full rounded-md border border-glass-border-default bg-glass-subtle px-3 text-[13px] text-glass-text-primary outline-none transition-colors duration-150 ease-in-out placeholder:text-glass-text-muted focus-visible:border-glass-border-focus focus-visible:shadow-glass-focus disabled:cursor-not-allowed disabled:opacity-glass-disabled'

export const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: string; label?: string }>(
  function GlassInput({ error, label, id, className = '', ...rest }, ref) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    return (
      <div className="space-y-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wider text-glass-text-secondary">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`h-9 ${FIELD_BASE} ${error ? 'border-glass-status-danger' : ''} ${className}`}
          {...rest}
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-[11px] text-glass-status-danger">
            {error}
          </p>
        ) : null}
      </div>
    )
  },
)

export const GlassTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; label?: string }>(
  function GlassTextarea({ error, label, id, className = '', rows = 4, ...rest }, ref) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    return (
      <div className="space-y-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wider text-glass-text-secondary">
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`py-2 ${FIELD_BASE} ${error ? 'border-glass-status-danger' : ''} ${className}`}
          {...rest}
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-[11px] text-glass-status-danger">
            {error}
          </p>
        ) : null}
      </div>
    )
  },
)

export const GlassSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: string; label?: string }>(
  function GlassSelect({ error, label, id, className = '', children, ...rest }, ref) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    return (
      <div className="space-y-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wider text-glass-text-secondary">
            {label}
          </label>
        ) : null}
        <select
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`h-9 ${FIELD_BASE} ${error ? 'border-glass-status-danger' : ''} ${className}`}
          {...rest}
        >
          {children}
        </select>
        {error ? (
          <p id={`${inputId}-error`} className="text-[11px] text-glass-status-danger">
            {error}
          </p>
        ) : null}
      </div>
    )
  },
)

export function ConsoleCallout({
  tone = 'info',
  title,
  children,
}: {
  tone?: GlassStatusTone
  title: string
  children?: ReactNode
}) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border bg-glass-subtle px-3.5 py-3 ${STATUS_TONE_CLASS[tone]}`}>
      <div>
        <p className="text-[12px] font-semibold text-glass-text-primary">{title}</p>
        {children ? <div className="mt-0.5 text-[12px] text-glass-text-secondary">{children}</div> : null}
      </div>
    </div>
  )
}

export function AccordionSection({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id: string
  title: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `accordion-panel-${id}`
  const triggerId = `accordion-trigger-${id}`

  return (
    <div>
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.14em] text-glass-text-muted transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary focus-visible:outline-none focus-visible:shadow-glass-focus"
      >
        <span>{title}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ease-in-out ${open ? 'rotate-90' : ''}`}
        >
          <path d="M7 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={triggerId} className="space-y-0.5 py-0.5 pl-1.5">
          {children}
        </div>
      ) : null}
    </div>
  )
}
