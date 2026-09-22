'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  density = 'comfortable',
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  density?: 'comfortable' | 'compact'
}) {
  return (
    <header className={`flex flex-col md:flex-row md:items-end md:justify-between ${density === 'compact' ? 'gap-2.5' : 'gap-4'}`}>
      <div className={density === 'compact' ? 'space-y-1' : 'space-y-2'}>
        {eyebrow ? (
          <p className={`${density === 'compact' ? 'text-[10px] tracking-[0.18em]' : 'text-[11px] tracking-[0.24em]'} font-semibold uppercase text-ink-subtle`}>
            {eyebrow}
          </p>
        ) : null}
        <div className={density === 'compact' ? 'space-y-0.5' : 'space-y-1'}>
          <h1 className={`${density === 'compact' ? 'text-xl' : 'text-2xl'} font-semibold tracking-tight text-ink`}>{title}</h1>
          <p className={`max-w-3xl ${density === 'compact' ? 'text-[13px] leading-5' : 'text-sm'} text-ink-muted`}>{description}</p>
        </div>
      </div>
      {actions ? <div className={`flex items-center ${density === 'compact' ? 'gap-2' : 'gap-3'}`}>{actions}</div> : null}
    </header>
  )
}

export function StatCard({
  label,
  value,
  tone = 'default',
  density = 'comfortable',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'accent'
  density?: 'comfortable' | 'compact'
}) {
  return (
    <div
      className={`${density === 'compact' ? 'app-card-dense px-3 py-2.5' : 'app-card px-4 py-4'} flex flex-col gap-1 ${
        tone === 'accent' ? 'border-brand/30 bg-brand/5' : ''
      }`}
    >
      <span className={`${density === 'compact' ? 'text-lg' : 'text-2xl'} font-semibold tracking-tight text-ink`}>{value}</span>
      <span className={`${density === 'compact' ? 'text-[10px] tracking-[0.14em]' : 'text-xs tracking-[0.18em]'} font-medium uppercase text-ink-subtle`}>
        {label}
      </span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="app-card px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
    </div>
  )
}

export function StatusBadge({ status, density = 'comfortable' }: { status: string; density?: 'comfortable' | 'compact' }) {
  const labelMap: Record<string, string> = {
    ACTIVE: 'Aktif',
    INACTIVE: 'Pasif',
    LOCKED: 'Kilitli',
    SUSPENDED: 'Askıda',
    ARCHIVED: 'Arşiv',
    ROOT: 'Platform',
    STANDARD: 'Standart',
    PLATFORM_ROOT: 'Sistem',
  }

  const toneMap: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800',
    INACTIVE: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700',
    LOCKED: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800',
    SUSPENDED: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
    ARCHIVED: 'bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800/60 dark:text-stone-300 dark:ring-stone-700',
    ROOT: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800',
    PLATFORM_ROOT: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800',
    STANDARD: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full ${density === 'compact' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} font-bold uppercase tracking-wider ring-1 ring-inset ${
        toneMap[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700'
      }`}
    >
      {labelMap[status] ?? status}
    </span>
  )
}

export function Badge({ 
  children, 
  tone = 'default',
  density = 'comfortable',
}: { 
  children: ReactNode, 
  tone?: 'default' | 'info' | 'brand' | 'warning' | 'danger'
  density?: 'comfortable' | 'compact'
}) {
  const tones = {
    default: 'bg-surface-subtle text-ink-muted ring-surface-border',
    info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800',
    brand: 'bg-brand/10 text-brand ring-brand/30',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800',
  }
  return (
    <span className={`inline-flex items-center rounded-full ${density === 'compact' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} font-bold uppercase tracking-wider ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function SectionHeader({ title, description, density = 'comfortable' }: { title: string; description?: string; density?: 'comfortable' | 'compact' }) {
  return (
    <div className={`${density === 'compact' ? 'mb-2.5 space-y-0.5' : 'mb-4 space-y-1'}`}>
      <h4 className={`${density === 'compact' ? 'text-[9px] tracking-[0.14em]' : 'text-[10px] tracking-widest'} font-bold uppercase text-ink-subtle`}>
        {title}
      </h4>
      {description ? (
        <p className={`${density === 'compact' ? 'text-[11px] leading-4' : 'text-xs leading-relaxed'} text-ink-muted`}>{description}</p>
      ) : null}
    </div>
  )
}

export interface UsageMeasurement {
  mbUsed: number | null
  status: 'REAL' | 'APPROXIMATE' | 'UNSUPPORTED'
  message?: string
}

function measurementTone(status: UsageMeasurement['status']): 'info' | 'warning' | 'default' {
  if (status === 'REAL') return 'info'
  if (status === 'APPROXIMATE') return 'warning'
  return 'default'
}

function measurementLabel(status: UsageMeasurement['status']) {
  if (status === 'REAL') return 'Gerçek'
  if (status === 'APPROXIMATE') return 'Yaklaşık'
  return 'Desteklenmiyor'
}

function formatUsageValue(value: number | null, unit: string) {
  if (value === null) return `Ölçülemiyor / ${unit}`
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${unit}`
}

export function UsageSummary({
  current,
  limit,
  unit,
}: {
  current: number | null
  limit: number
  unit: string
}) {
  const currentLabel =
    current === null ? 'Ölçülemiyor' : current.toLocaleString('tr-TR', { maximumFractionDigits: 2 })

  return `${currentLabel} / ${limit.toLocaleString('tr-TR')} ${unit}`
}

export function UsageMeterCard({
  label,
  measurement,
  limit,
  unit = 'MB',
}: {
  label: string
  measurement: UsageMeasurement
  limit: number
  unit?: string
}) {
  const current = measurement.mbUsed
  const ratio = current !== null && limit > 0 ? Math.min((current / limit) * 100, 100) : null
  const barTone =
    ratio !== null && ratio >= 95 ? 'bg-rose-500' : ratio !== null && ratio >= 80 ? 'bg-amber-500' : 'bg-brand'

  return (
    <div className="app-card space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink">{label}</h3>
          <p className="text-xs text-ink-muted">{formatUsageValue(current, unit)}</p>
        </div>
        <Badge tone={measurementTone(measurement.status)}>{measurementLabel(measurement.status)}</Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight text-ink">
            {current === null ? '—' : current.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-sm text-ink-muted">/ {limit.toLocaleString('tr-TR')} {unit}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div className={`h-full transition-all duration-300 ${barTone}`} style={{ width: `${ratio ?? 0}%` }} />
        </div>
      </div>

      <p className="min-h-10 text-xs leading-relaxed text-ink-muted">
        {measurement.message ??
          (measurement.status === 'UNSUPPORTED'
            ? 'Bu kaynak için ölçüm desteği yok.'
            : 'Ölçüm sonucu güncel kota izlemede kullanılıyor.')}
      </p>
    </div>
  )
}

export function SortButton({
  label,
  active,
  direction,
  align = 'left',
  onClick,
}: {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  align?: 'left' | 'right'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
        align === 'right' ? 'w-full justify-end text-right' : 'justify-start text-left'
      } ${active ? 'text-ink' : 'text-ink-subtle hover:text-ink'}`}
    >
      <span>{label}</span>
      <span className="flex h-3 w-3 items-center justify-center rounded bg-surface-subtle text-[8px] font-black text-ink-subtle">
        {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  )
}

export function DetailPanel({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  density = 'comfortable',
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  density?: 'comfortable' | 'compact'
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ease-in-out">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className={`glass-panel relative flex h-full w-full flex-col border-l border-glass-border-default bg-glass-elevated shadow-glass animate-in slide-in-from-right duration-300 ${density === 'compact' ? 'md:max-w-[34rem]' : 'md:max-w-xl'}`}>
        <header className={`flex items-center justify-between border-b border-glass-border-subtle ${density === 'compact' ? 'px-4 py-3' : 'px-6 py-4'}`}>
          <div className={density === 'compact' ? 'space-y-0.5' : 'space-y-1'}>
            <h3 className={`${density === 'compact' ? 'text-base' : 'text-lg'} font-semibold text-glass-text-primary`}>{title}</h3>
            {subtitle ? <p className={`${density === 'compact' ? 'text-[11px]' : 'text-xs'} text-glass-text-muted`}>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex items-center justify-center rounded-md text-glass-text-muted hover:bg-glass-subtle hover:text-glass-text-primary ${density === 'compact' ? 'h-7 w-7' : 'h-8 w-8'}`}
          >
            ✕
          </button>
        </header>
        <div className={`flex-1 overflow-y-auto ${density === 'compact' ? 'px-4 py-4' : 'px-6 py-6'}`}>
          {children}
        </div>
        {footer ? (
          <footer className={`border-t border-glass-border-subtle bg-glass-subtle/40 ${density === 'compact' ? 'px-4 py-3' : 'px-6 py-4'}`}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  density = 'comfortable',
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  density?: 'comfortable' | 'compact'
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
      <div className="fixed inset-0" onClick={onClose} />
      <div className={`glass-panel relative w-full overflow-hidden border border-glass-border-default bg-glass-elevated shadow-glass animate-in fade-in zoom-in-95 duration-200 ${density === 'compact' ? 'max-w-md rounded-xl' : 'max-w-lg rounded-2xl'}`}>
        <header className={`border-b border-glass-border-subtle ${density === 'compact' ? 'px-4 py-3' : 'px-6 py-4'}`}>
          <h3 className={`${density === 'compact' ? 'text-base' : 'text-lg'} font-semibold text-glass-text-primary`}>{title}</h3>
          {description ? <p className={`mt-1 ${density === 'compact' ? 'text-[12px]' : 'text-sm'} text-glass-text-muted`}>{description}</p> : null}
        </header>
        <div className={density === 'compact' ? 'px-4 py-4' : 'px-6 py-6'}>
          {children}
        </div>
        {footer ? (
          <footer className={`flex justify-end gap-2 border-t border-glass-border-subtle bg-glass-subtle/40 ${density === 'compact' ? 'px-4 py-3' : 'px-6 py-4'}`}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Onayla',
  confirmTone = 'primary',
  isLoading = false,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  confirmTone?: 'primary' | 'danger' | 'warning'
  isLoading?: boolean
}) {
  const toneClasses = {
    primary: 'app-button-primary',
    danger: 'app-button-primary bg-rose-600 hover:bg-rose-700 border-rose-700',
    warning: 'app-button-primary bg-amber-600 hover:bg-amber-700 border-amber-700',
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" onClick={onClose} className="app-button-outline px-4" disabled={isLoading}>
            Vazgeç
          </button>
          <button 
            type="button" 
            onClick={onConfirm} 
            className={`${toneClasses[confirmTone]} px-6`}
            disabled={isLoading}
          >
            {isLoading ? 'İşleniyor...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="py-2 text-sm text-ink-muted">
        Bu işlem geri alınamayabilir. Devam etmek istediğinizden emin misiniz?
      </div>
    </Modal>
  )
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  density = 'comfortable',
}: {
  tabs: { id: string; label: string }[]
  activeTab: string
  onTabChange: (id: string) => void
  density?: 'comfortable' | 'compact'
}) {
  return (
    <div className={`flex border-b border-surface-border ${density === 'compact' ? 'mb-4 gap-4' : 'mb-6 gap-6'}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`relative ${density === 'compact' ? 'pb-2 text-[10px]' : 'pb-3 text-xs'} font-semibold uppercase tracking-widest transition-colors ${
            activeTab === tab.id ? 'text-brand' : 'text-ink-subtle hover:text-ink'
          }`}
        >
          {tab.label}
          {activeTab === tab.id ? (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function DataRow({
  label,
  value,
  children,
  density = 'comfortable',
}: {
  label: string
  value?: ReactNode
  children?: ReactNode
  density?: 'comfortable' | 'compact'
}) {
  return (
    <div className={`flex flex-col ${density === 'compact' ? 'gap-1 py-2' : 'gap-1.5 py-3'} first:pt-0 last:pb-0`}>
      <span className={`${density === 'compact' ? 'text-[9px] tracking-[0.14em]' : 'text-[10px] tracking-widest'} font-bold uppercase text-ink-subtle`}>
        {label}
      </span>
      <div className={`${density === 'compact' ? 'text-[13px]' : 'text-sm'} font-medium text-ink`}>
        {value !== undefined ? value : children}
      </div>
    </div>
  )
}

export function ActionGroup({ children, title, density = 'comfortable' }: { children: ReactNode; title?: string; density?: 'comfortable' | 'compact' }) {
  return (
    <div className={density === 'compact' ? 'space-y-2' : 'space-y-3'}>
      {title ? (
        <h4 className={`${density === 'compact' ? 'text-[9px] tracking-[0.14em]' : 'text-[10px] tracking-widest'} font-bold uppercase text-ink-subtle`}>
          {title}
        </h4>
      ) : null}
      <div className={`flex flex-wrap ${density === 'compact' ? 'gap-1.5' : 'gap-2'}`}>
        {children}
      </div>
    </div>
  )
}

export function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
