'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useTenantPermissions } from '../contexts/tenant-permission-context'
import {
  isModuleActive,
  NAV_MODULES,
  pickActiveHref,
  PLATFORM_MODULES,
  resolveNavModules,
  TENANT_SETTINGS_MODULE,
  type ResolvedNavModule,
} from '../lib/nav-config'
import { loadNavOpenState, saveNavOpenState, type NavOpenState } from '../lib/nav-storage'
import { getActiveTenantId, TENANT_CHANGE_EVENT } from '../lib/tenant-context'
import { LogoutButton } from './logout-button'
import { TenantSwitcher } from './tenant-switcher'
import { useTheme } from './theme-provider'

function SunIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

interface AppSidebarProps {
  tenantName: string
  tenantType: string
  isSystemAdmin?: boolean
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform duration-150 ease-in-out ${
        open ? 'rotate-90' : ''
      }`}
    >
      <path
        d="M7 5l6 5-6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`block rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 ease-in-out ${
        active ? 'bg-surface-subtle font-medium text-ink' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
      }`}
    >
      {label}
    </Link>
  )
}

function NavModuleAccordion({
  module,
  pathname,
  activeHref,
  open,
  onToggle,
}: {
  module: ResolvedNavModule
  pathname: string
  activeHref: string | null
  open: boolean
  onToggle: () => void
}) {
  const expanded = open || isModuleActive(module, pathname)
  const panelId = `nav-module-${module.key}`

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle transition-colors duration-150 ease-in-out hover:bg-surface-subtle hover:text-ink"
      >
        <span>{module.label}</span>
        <ChevronIcon open={expanded} />
      </button>
      {expanded ? (
        <div id={panelId} className="space-y-2 py-1 pl-2">
          {module.sections.map(section => (
            <div key={section.section} className="space-y-0.5">
              <div className="px-3 text-[10px] font-medium uppercase tracking-wider text-ink-subtle/70">
                {section.label}
              </div>
              {section.links.map(link => (
                <NavLink key={link.href} href={link.href} label={link.label} active={link.href === activeHref} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AppSidebar({ tenantName, tenantType, isSystemAdmin = false }: AppSidebarProps) {
  const { can, loading } = useTenantPermissions()
  const isPlatformRoot = tenantType === 'PLATFORM_ROOT'
  const pathname = usePathname()

  const [tenantId, setTenantId] = useState('')
  const [openState, setOpenState] = useState<NavOpenState>({})

  useEffect(() => {
    function syncTenant() {
      const id = getActiveTenantId() ?? ''
      setTenantId(id)
      setOpenState(loadNavOpenState(id))
    }
    syncTenant()
    window.addEventListener(TENANT_CHANGE_EVENT, syncTenant)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, syncTenant)
  }, [])

  function toggleModule(key: string) {
    setOpenState(prev => {
      const next = { ...prev, [key]: !prev[key] }
      saveNavOpenState(tenantId, next)
      return next
    })
  }

  const visibilityCtx = useMemo(
    () => ({ isPlatformRoot, isSystemAdmin, can }),
    [isPlatformRoot, isSystemAdmin, can],
  )

  const modules = useMemo(() => {
    if (loading) return []
    return resolveNavModules(isPlatformRoot ? PLATFORM_MODULES : NAV_MODULES, visibilityCtx)
  }, [loading, isPlatformRoot, visibilityCtx])

  const tenantSettingsModule = useMemo(() => {
    if (loading || isPlatformRoot) return null
    return resolveNavModules([TENANT_SETTINGS_MODULE], visibilityCtx)[0] ?? null
  }, [loading, isPlatformRoot, visibilityCtx])

  const activeHref = useMemo(() => {
    const hrefs = [
      ...modules.flatMap(module => module.sections.flatMap(section => section.links.map(link => link.href))),
      ...(tenantSettingsModule
        ? tenantSettingsModule.sections.flatMap(section => section.links.map(link => link.href))
        : []),
    ]
    return pickActiveHref(hrefs, pathname)
  }, [modules, tenantSettingsModule, pathname])

  const { theme, toggle: toggleTheme } = useTheme()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-surface-border bg-surface">
      <div>
        <div className="flex h-14 items-center border-b border-surface-border px-4 text-xl font-semibold text-ink">
          Metnex
        </div>
        <TenantSwitcher
          tenantName={tenantName}
          tenantType={tenantType}
          subtitle={isPlatformRoot ? 'Platform Console' : undefined}
        />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {modules.map(module => (
          <NavModuleAccordion
            key={module.key}
            module={module}
            pathname={pathname}
            activeHref={activeHref}
            open={!!openState[module.key]}
            onToggle={() => toggleModule(module.key)}
          />
        ))}
      </nav>

      {tenantSettingsModule ? (
        <div className="border-t border-surface-border px-3 py-3">
          <NavModuleAccordion
            module={tenantSettingsModule}
            pathname={pathname}
            activeHref={activeHref}
            open={!!openState[tenantSettingsModule.key]}
            onToggle={() => toggleModule(tenantSettingsModule.key)}
          />
        </div>
      ) : null}

      <div className="space-y-1.5 border-t border-surface-border p-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-ink-muted transition-colors duration-150 ease-in-out hover:bg-surface-subtle hover:text-ink"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          <span>{theme === 'dark' ? 'Aydınlık Mod' : 'Karanlık Mod'}</span>
        </button>
        <LogoutButton />
      </div>
    </aside>
  )
}
