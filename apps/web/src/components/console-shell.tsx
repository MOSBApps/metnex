'use client'

import { usePathname } from 'next/navigation'
import { useRef, type ReactNode } from 'react'
import { useTenantPermissions } from '../contexts/tenant-permission-context'
import {
  NAV_MODULES,
  PLATFORM_MODULES,
  TENANT_SETTINGS_MODULE,
  pickActiveHref,
  resolveNavModules,
} from '../lib/nav-config'
import { ImpersonationBanner } from './impersonation-banner'
import {
  BreadcrumbProvider,
  ConsoleSidebar,
  ConsoleTopbar,
  GlassConsoleRoot,
  GlassLanguageSelector,
  GlassNotificationBell,
  GlassTenantSwitcher,
  GlassThemeToggle,
  GlassUserMenu,
  useBreadcrumbContext,
  useConsoleSidebarState,
  type ConsoleBreadcrumbItem,
  type ConsoleNavGroup,
} from './glass-console'

interface ConsoleShellProps {
  tenantName: string
  tenantType: string
  isSystemAdmin?: boolean
  children: ReactNode
}

function buildBreadcrumb(
  pathname: string,
  tenantName: string,
  segments: Record<string, string | null>,
): ConsoleBreadcrumbItem[] {
  const base: ConsoleBreadcrumbItem[] = [
    { label: 'Metnex', href: pathname.startsWith('/system') ? '/system' : '/app' },
    { label: tenantName || 'Tenant' },
  ]

  // System console routes
  if (pathname.startsWith('/system')) {
    if (pathname === '/system' || pathname === '/system/') {
      return [...base, { label: 'Platform Console' }]
    }
    if (pathname.startsWith('/system/users')) {
      return [...base, { label: 'Platform Console', href: '/system' }, { label: 'Kullanıcılar' }]
    }
    if (pathname.startsWith('/system/tenants')) {
      return [...base, { label: 'Platform Console', href: '/system' }, { label: 'Tenant Yönetimi' }]
    }
    if (pathname.startsWith('/system/roles')) {
      return [...base, { label: 'Platform Console', href: '/system' }, { label: 'Roller' }]
    }
    if (pathname.startsWith('/system/packages')) {
      return [...base, { label: 'Platform Console', href: '/system' }, { label: 'Paketler' }]
    }
    if (pathname.startsWith('/system/audit')) {
      return [...base, { label: 'Platform Console', href: '/system' }, { label: 'Audit' }]
    }
    if (pathname.startsWith('/system/performance')) {
      return [...base, { label: 'Platform Console', href: '/system' }, { label: 'Performance' }]
    }
    return [...base, { label: 'Platform Console', href: '/system' }, { label: segments.page ?? 'Sayfa' }]
  }

  // Tenant app routes
  if (pathname.startsWith('/app/admin')) {
    if (pathname === '/app/admin' || pathname === '/app/admin/') {
      return [...base, { label: 'Müşteri Yönetimi' }]
    }
    if (pathname.startsWith('/app/admin/users')) {
      return [...base, { label: 'Müşteri Yönetimi', href: '/app/admin' }, { label: 'Kullanıcılar' }]
    }
    if (pathname.startsWith('/app/admin/tenants')) {
      return [...base, { label: 'Müşteri Yönetimi', href: '/app/admin' }, { label: 'Tenant Yönetimi' }]
    }
  }

  if (pathname.startsWith('/app/reports')) {
    return [...base, { label: 'Raporlar' }, { label: segments.report ?? 'Rapor İzleme' }]
  }

  if (pathname.startsWith('/app/settings')) {
    if (pathname.includes('smtp')) {
      return [...base, { label: 'Tenant Ayarları' }, { label: 'SMTP' }]
    }
    if (pathname.includes('ai-provider')) {
      return [...base, { label: 'Tenant Ayarları' }, { label: 'AI Provider' }]
    }
  }

  return [...base, { label: segments.page ?? 'Dashboard' }]
}

export function ConsoleShell({ tenantName, tenantType, isSystemAdmin = false, children }: ConsoleShellProps) {
  const pathname = usePathname()

  return (
    <BreadcrumbProvider>
      <ConsoleShellInner pathname={pathname} tenantName={tenantName} tenantType={tenantType} isSystemAdmin={isSystemAdmin}>
        {children}
      </ConsoleShellInner>
    </BreadcrumbProvider>
  )
}

function ConsoleShellInner({
  pathname,
  tenantName,
  tenantType,
  isSystemAdmin,
  children,
}: {
  pathname: string
  tenantName: string
  tenantType: string
  isSystemAdmin: boolean
  children: ReactNode
}) {
  const { can, loading: permissionsLoading } = useTenantPermissions()
  const { segments } = useBreadcrumbContext()
  const sidebarState = useConsoleSidebarState()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const isPlatformRoot = tenantType === 'PLATFORM_ROOT'

  function closeSidebar() {
    sidebarState.close()
    menuButtonRef.current?.focus()
  }

  const visibilityCtx = { isPlatformRoot, isSystemAdmin, can }

  const modules = permissionsLoading
    ? []
    : resolveNavModules(isPlatformRoot ? PLATFORM_MODULES : NAV_MODULES, visibilityCtx)

  const tenantSettingsModule = permissionsLoading || isPlatformRoot
    ? null
    : (resolveNavModules([TENANT_SETTINGS_MODULE], visibilityCtx)[0] ?? null)

  const allSidebarHrefs = [
    ...modules.flatMap(module => module.sections.flatMap(section => section.links.map(link => link.href))),
    ...(tenantSettingsModule ? tenantSettingsModule.sections.flatMap(section => section.links.map(link => link.href)) : []),
  ]
  const activeSidebarHref = pickActiveHref(allSidebarHrefs, pathname)

  const sidebarGroups: ConsoleNavGroup[] = [
    ...modules.map(module => ({
      key: module.key,
      title: module.label,
      links: module.sections.flatMap(section =>
        section.links.map(link => ({ href: link.href, label: link.label, active: link.href === activeSidebarHref })),
      ),
    })),
    ...(tenantSettingsModule
      ? [
          {
            key: tenantSettingsModule.key,
            title: tenantSettingsModule.label,
            links: tenantSettingsModule.sections.flatMap(section =>
              section.links.map(link => ({ href: link.href, label: link.label, active: link.href === activeSidebarHref })),
            ),
          },
        ]
      : []),
  ]

  const breadcrumb = buildBreadcrumb(pathname, tenantName, segments)

  return (
    <GlassConsoleRoot defaultTheme="dark" className="flex h-screen flex-col overflow-hidden">
      <div className="sticky top-0 z-30">
        <ConsoleTopbar
          breadcrumb={breadcrumb}
          tenantSelector={<GlassTenantSwitcher />}
          notifications={<GlassNotificationBell />}
          languageSelector={<GlassLanguageSelector />}
          userMenu={<GlassUserMenu />}
          themeToggle={<GlassThemeToggle />}
          onMenuToggle={sidebarState.toggle}
          menuButtonRef={menuButtonRef}
          brandHref={pathname.startsWith('/system') ? '/system' : '/app'}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <ConsoleSidebar groups={sidebarGroups} profileMenu={<GlassUserMenu />} open={sidebarState.open} onClose={closeSidebar} />

        <main className="min-w-0 flex-1 overflow-y-auto bg-glass-glow bg-no-repeat p-4 sm:p-6">
          <ImpersonationBanner />
          {children}
        </main>
      </div>
    </GlassConsoleRoot>
  )
}
