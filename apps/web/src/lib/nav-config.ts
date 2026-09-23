export type NavSectionKey = 'GENERAL' | 'DEFINITIONS' | 'TRANSACTIONS' | 'LISTS' | 'REPORTS' | 'SETTINGS'

const SECTION_LABELS: Record<NavSectionKey, string> = {
  GENERAL: 'Genel',
  DEFINITIONS: 'Tanımlar',
  TRANSACTIONS: 'İşlemler',
  LISTS: 'Listeler',
  REPORTS: 'Raporlar',
  SETTINGS: 'Ayarlar',
}

export interface NavLinkConfig {
  label: string
  href: string
  requiredPermission?: string
}

export interface NavSectionConfig {
  section: NavSectionKey
  requiredPermission?: string
  systemAdminOnly?: boolean
  links: NavLinkConfig[]
}

export interface NavModuleConfig {
  key: string
  label: string
  scope: 'PLATFORM' | 'TENANT'
  requiredPermission?: string
  sections: NavSectionConfig[]
}

export interface ResolvedNavSection {
  section: NavSectionKey
  label: string
  links: NavLinkConfig[]
}

export interface ResolvedNavModule {
  key: string
  label: string
  sections: ResolvedNavSection[]
}

export interface NavVisibilityContext {
  isPlatformRoot: boolean
  isSystemAdmin: boolean
  can: (code: string) => boolean
}

/** Module tree for the tenant-side sidebar. One entry per fork-ready module. */
export const NAV_MODULES: NavModuleConfig[] = [
  {
    key: 'CUSTOMER_ADMIN',
    label: 'Müşteri Yönetimi',
    scope: 'TENANT',
    requiredPermission: 'CUSTOMER:ADMIN:VIEW',
    sections: [
      { section: 'GENERAL', links: [{ label: 'Dashboard', href: '/app/admin' }] },
      {
        section: 'LISTS',
        links: [
          { label: 'Kullanıcılar', href: '/app/admin/users' },
          { label: 'Tenant Yönetimi', href: '/app/admin/tenants' },
        ],
      },
    ],
  },
  {
    key: 'REPORTING',
    label: 'Raporlar',
    scope: 'TENANT',
    requiredPermission: 'REPORT:ARTIFACT:VIEW',
    sections: [{ section: 'GENERAL', links: [{ label: 'Dashboard', href: '/app/reports' }] }],
  },
]

/** Platform-console module tree. Only ever rendered when the active tenant is PLATFORM_ROOT. */
export const PLATFORM_MODULES: NavModuleConfig[] = [
  {
    key: 'PLATFORM_CONSOLE',
    label: 'Platform',
    scope: 'PLATFORM',
    sections: [
      { section: 'GENERAL', links: [{ label: 'Dashboard', href: '/system' }] },
      {
        section: 'LISTS',
        links: [
          { label: 'Kullanıcılar', href: '/system/users', requiredPermission: 'PLATFORM:USER:VIEW' },
          { label: 'Tenant Yönetimi', href: '/system/tenants', requiredPermission: 'PLATFORM:TENANT:VIEW' },
          { label: 'Roller', href: '/system/roles', requiredPermission: 'PLATFORM:ROLE:VIEW' },
          { label: 'Paketler', href: '/system/packages', requiredPermission: 'PLATFORM:PACKAGE:VIEW' },
        ],
      },
      {
        section: 'SETTINGS',
        systemAdminOnly: true,
        links: [
          { label: 'Audit', href: '/system/audit' },
          { label: 'Performance', href: '/system/performance' },
        ],
      },
    ],
  },
]

/** Rendered separately, pinned to the bottom of the tenant sidebar. */
export const TENANT_SETTINGS_MODULE: NavModuleConfig = {
  key: 'TENANT_SETTINGS',
  label: 'Tenant Ayarları',
  scope: 'TENANT',
  sections: [
    {
      section: 'SETTINGS',
      links: [
        { label: 'SMTP', href: '/app/settings/smtp', requiredPermission: 'SETTINGS:SMTP:VIEW' },
        { label: 'AI Provider', href: '/app/settings/ai-provider', requiredPermission: 'SETTINGS:AI_PROVIDER:VIEW' },
      ],
    },
  ],
}

/**
 * Filters the static config down to what this tenant/user may actually see. Frontend visibility
 * only hides menu entries — it is never a substitute for the backend permission guards.
 */
export function resolveNavModules(modules: NavModuleConfig[], ctx: NavVisibilityContext): ResolvedNavModule[] {
  const scope: NavModuleConfig['scope'] = ctx.isPlatformRoot ? 'PLATFORM' : 'TENANT'

  return modules
    .filter(module => module.scope === scope)
    .filter(module => !module.requiredPermission || ctx.can(module.requiredPermission))
    .map(module => ({
      key: module.key,
      label: module.label,
      sections: module.sections
        .filter(section => !section.systemAdminOnly || ctx.isSystemAdmin)
        .filter(section => !section.requiredPermission || ctx.can(section.requiredPermission))
        .map(section => ({
          section: section.section,
          label: SECTION_LABELS[section.section],
          links: section.links.filter(link => !link.requiredPermission || ctx.can(link.requiredPermission)),
        }))
        .filter(section => section.links.length > 0),
    }))
    .filter(module => module.sections.length > 0)
}

function hrefMatchesPath(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isModuleActive(module: ResolvedNavModule, pathname: string): boolean {
  return module.sections.some(section => section.links.some(link => hrefMatchesPath(link.href, pathname)))
}

/**
 * Nested CRUD detail/tab routes (e.g. /app/admin/users/edit/1) must still highlight their
 * owning link, but sibling hrefs can share a prefix (e.g. /app/admin vs /app/admin/users) — only
 * the longest matching href should ever render as active, never both at once.
 */
export function pickActiveHref(hrefs: string[], pathname: string): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    if (!hrefMatchesPath(href, pathname)) continue
    if (!best || href.length > best.length) best = href
  }
  return best
}
