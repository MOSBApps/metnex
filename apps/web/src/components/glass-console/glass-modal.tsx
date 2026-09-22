'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

export function GlassModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector)
    firstFocusable?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-panel relative w-full max-w-md rounded-2xl border border-glass-border-default bg-glass-elevated shadow-glass"
      >
        <header className="border-b border-glass-border-subtle px-5 py-4">
          <h3 id={titleId} className="text-[15px] font-semibold text-glass-text-primary">
            {title}
          </h3>
          {description ? <p className="mt-1 text-[12px] text-glass-text-muted">{description}</p> : null}
        </header>
        <div className="px-5 py-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-glass-border-subtle bg-glass-subtle/40 px-5 py-4">{footer}</footer> : null}
      </div>
    </div>
  )
}
