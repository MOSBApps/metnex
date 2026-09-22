'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AccordionSection } from './primitives'

export interface ConsoleBreadcrumbItem {
  label: string
  href?: string
}

export function ConsoleTopbar({
  breadcrumb,
  tenantSelector,
  notifications,
  userMenu,
  languageSelector,
  themeToggle,
  onMenuToggle,
  menuButtonRef,
}: {
  breadcrumb: ConsoleBreadcrumbItem[]
  tenantSelector: ReactNode
  notifications: ReactNode
  userMenu: ReactNode
  languageSelector?: ReactNode
  themeToggle: ReactNode
  onMenuToggle: () => void
  menuButtonRef?: RefObject<HTMLButtonElement | null>
}) {
  return (
    <header className="glass-panel relative z-10 flex h-12 items-stretch border-b border-glass-border-focus/50 bg-glass-elevated shadow-glass">
      <div className="flex shrink-0 items-center gap-2 px-3 md:w-52 md:border-r md:border-glass-border-default">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onMenuToggle}
          aria-label="Menüyü aç/kapat"
          aria-controls="console-sidebar"
          className="rounded-md p-1.5 text-glass-text-secondary hover:bg-glass-subtle focus-visible:outline-none focus-visible:shadow-glass-focus md:hidden"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <span className="shrink-0 truncate text-[15px] font-semibold tracking-wide text-glass-text-primary">Metnex</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 sm:px-4">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[12px] text-glass-text-muted">
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1
            return (
              <span
                key={`${item.label}-${index}`}
                className={`items-center gap-1.5 truncate ${isLast ? 'flex' : 'hidden sm:flex'}`}
              >
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {item.href ? (
                  <Link href={item.href} className="truncate text-glass-text-secondary hover:text-glass-accent-primary">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate text-glass-text-primary font-medium">
                    {item.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {notifications}
          {tenantSelector}
          {languageSelector}
          {userMenu}
          {themeToggle}
        </div>
      </div>
    </header>
  )
}

export interface ConsoleNavLink {
  href: string
  label: string
  active?: boolean
}

export interface ConsoleNavGroup {
  key: string
  title: string
  links: ConsoleNavLink[]
}

export function ConsoleSidebar({
  groups,
  systemStatus,
  profileMenu,
  open,
  onClose,
}: {
  groups: ConsoleNavGroup[]
  systemStatus?: ReactNode
  profileMenu: ReactNode
  open: boolean
  onClose: () => void
}) {
  const visibleGroups = groups.filter(group => group.links.length > 0)
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !asideRef.current) return
      const focusable = asideRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <>
      {open ? (
        <div
          className="fixed inset-x-0 bottom-0 top-12 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}
      <aside
        id="console-sidebar"
        ref={asideRef}
        className={`glass-panel fixed bottom-0 left-0 top-12 z-50 flex w-52 flex-col border-r border-glass-border-default bg-glass-elevated shadow-glass transition-transform duration-200 ease-in-out md:static md:inset-auto md:z-auto md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {visibleGroups.map(group => (
            <AccordionSection key={group.key} id={group.key} title={`${group.title} (${group.links.length})`} defaultOpen>
              {group.links.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={link.active ? 'page' : undefined}
                  className={`block rounded-r-md border-l-2 px-2.5 py-1 text-[12.5px] transition-colors duration-150 ease-in-out ${
                    link.active
                      ? 'border-glass-accent-primary bg-glass-accent-primary/15 font-medium text-glass-accent-primary shadow-glow-primary'
                      : 'border-glass-border-default text-glass-text-secondary hover:border-glass-accent-primary/50 hover:bg-glass-subtle hover:text-glass-text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </AccordionSection>
          ))}
        </nav>

        {systemStatus ? <div className="border-t border-glass-border-subtle px-2.5 py-2">{systemStatus}</div> : null}

        <div className="border-t border-glass-border-subtle px-2.5 py-2">{profileMenu}</div>
      </aside>
    </>
  )
}

export function useConsoleSidebarState() {
  const [open, setOpen] = useState(false)
  return { open, toggle: () => setOpen(prev => !prev), close: () => setOpen(false) }
}
