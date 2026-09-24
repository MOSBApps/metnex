import { describe, expect, it } from 'vitest'
import {
  isModuleActive,
  NAV_MODULES,
  pickActiveHref,
  PLATFORM_MODULES,
  resolveNavModules,
  TENANT_SETTINGS_MODULE,
  type NavModuleConfig,
  type NavVisibilityContext,
} from './nav-config'

function ctx(overrides: Partial<NavVisibilityContext> = {}): NavVisibilityContext {
  return {
    isPlatformRoot: false,
    isSystemAdmin: false,
    can: () => false,
    ...overrides,
  }
}

/**
 * Synthetic fixture module with the same shape (4 sections, a section-level
 * permission, nested CRUD-style routes) fork-ready modules use — kept
 * independent of any real module so nav-config tests do not depend on which
 * modules currently exist in NAV_MODULES.
 */
const SAMPLE_MODULE: NavModuleConfig = {
  key: 'SAMPLE_MODULE',
  label: 'Sample Module',
  scope: 'TENANT',
  requiredPermission: 'SAMPLE:MODULE:VIEW',
  sections: [
    { section: 'GENERAL', links: [{ label: 'Dashboard', href: '/app/sample' }] },
    { section: 'DEFINITIONS', links: [{ label: 'Sample Definitions', href: '/app/sample/definitions' }] },
    { section: 'TRANSACTIONS', links: [{ label: 'Sample Transactions', href: '/app/sample/transactions' }] },
    {
      section: 'REPORTS',
      requiredPermission: 'REPORT:ARTIFACT:VIEW',
      links: [{ label: 'Sample Report', href: '/app/reports/SAMPLE_ARTIFACT/view' }],
    },
  ],
}

describe('resolveNavModules — tenant scope', () => {
  it('hides a module when the user lacks its module-level permission', () => {
    const modules = resolveNavModules([SAMPLE_MODULE], ctx({ can: code => code !== 'SAMPLE:MODULE:VIEW' }))
    expect(modules.find(m => m.key === 'SAMPLE_MODULE')).toBeUndefined()
  })

  it('shows a module with all standard sections when permission is granted', () => {
    const modules = resolveNavModules([SAMPLE_MODULE], ctx({ can: () => true }))
    const sample = modules.find(m => m.key === 'SAMPLE_MODULE')
    expect(sample).toBeDefined()
    expect(sample?.sections.map(s => s.section)).toEqual(['GENERAL', 'DEFINITIONS', 'TRANSACTIONS', 'REPORTS'])
  })

  it('drops a section on its own when only its section-level permission is missing', () => {
    const modules = resolveNavModules([SAMPLE_MODULE], ctx({ can: code => code !== 'REPORT:ARTIFACT:VIEW' }))
    const sample = modules.find(m => m.key === 'SAMPLE_MODULE')
    expect(sample?.sections.map(s => s.section)).toEqual(['GENERAL', 'DEFINITIONS', 'TRANSACTIONS'])
  })

  it('hides Customer Admin without CUSTOMER:ADMIN:VIEW', () => {
    const modules = resolveNavModules(NAV_MODULES, ctx())
    expect(modules).toHaveLength(0)
  })

  it('never resolves PLATFORM scope modules for a non-platform tenant', () => {
    const modules = resolveNavModules(PLATFORM_MODULES, ctx({ isPlatformRoot: false, can: () => true }))
    expect(modules).toHaveLength(0)
  })
})

/**
 * TASK-027.54-R2 — the Raporlar (Reporting) sidebar entry, gated by the existing
 * REPORT:ARTIFACT:VIEW permission (no new permission code introduced).
 */
describe('resolveNavModules — Raporlar (Reporting)', () => {
  it('shows the Raporlar module, pointing at /app/reports, when REPORT:ARTIFACT:VIEW is granted', () => {
    const modules = resolveNavModules(NAV_MODULES, ctx({ can: code => code === 'REPORT:ARTIFACT:VIEW' }))
    const reporting = modules.find(m => m.key === 'REPORTING')
    expect(reporting).toBeDefined()
    expect(reporting?.sections[0]?.links[0]).toEqual({ label: 'Dashboard', href: '/app/reports' })
  })

  it('hides the Raporlar module for a user without REPORT:ARTIFACT:VIEW', () => {
    const modules = resolveNavModules(NAV_MODULES, ctx({ can: code => code !== 'REPORT:ARTIFACT:VIEW' }))
    expect(modules.find(m => m.key === 'REPORTING')).toBeUndefined()
  })

  it('never resolves Raporlar on the platform tenant (TENANT scope only)', () => {
    const modules = resolveNavModules(NAV_MODULES, ctx({ isPlatformRoot: true, can: () => true }))
    expect(modules.find(m => m.key === 'REPORTING')).toBeUndefined()
  })
})

describe('resolveNavModules — platform scope', () => {
  it('gates each platform list link behind its own PLATFORM:*:VIEW permission', () => {
    const modules = resolveNavModules(
      PLATFORM_MODULES,
      ctx({ isPlatformRoot: true, can: code => code === 'PLATFORM:USER:VIEW' }),
    )
    const links = modules.flatMap(m => m.sections.flatMap(s => s.links.map(l => l.href)))
    // Dashboard has no requiredPermission, so it always survives alongside the one granted list link.
    expect(links).toEqual(['/system', '/system/users'])
  })

  it('hides Audit/Performance from non system admins even with full permissions', () => {
    const modules = resolveNavModules(
      PLATFORM_MODULES,
      ctx({ isPlatformRoot: true, isSystemAdmin: false, can: () => true }),
    )
    const sections = modules.flatMap(m => m.sections.map(s => s.section))
    expect(sections).not.toContain('SETTINGS')
  })

  it('shows Audit/Performance for system admins', () => {
    const modules = resolveNavModules(
      PLATFORM_MODULES,
      ctx({ isPlatformRoot: true, isSystemAdmin: true, can: () => true }),
    )
    const settingsSection = modules.flatMap(m => m.sections).find(s => s.section === 'SETTINGS')
    expect(settingsSection?.links.map(l => l.href)).toEqual(['/system/audit', '/system/performance'])
  })

  it('never resolves TENANT scope modules while on the platform tenant', () => {
    const modules = resolveNavModules(NAV_MODULES, ctx({ isPlatformRoot: true, can: () => true }))
    expect(modules).toHaveLength(0)
    const settings = resolveNavModules([TENANT_SETTINGS_MODULE], ctx({ isPlatformRoot: true, can: () => true }))
    expect(settings).toHaveLength(0)
  })
})

describe('isModuleActive', () => {
  const sampleModule = resolveNavModules([SAMPLE_MODULE], ctx({ can: () => true })).find(
    m => m.key === 'SAMPLE_MODULE',
  )!

  it('is active for an exact link match', () => {
    expect(isModuleActive(sampleModule, '/app/sample/definitions')).toBe(true)
  })

  it('is active for a nested CRUD detail route under one of its links', () => {
    expect(isModuleActive(sampleModule, '/app/sample/definitions/edit/123')).toBe(true)
  })

  it('is not active for an unrelated route', () => {
    expect(isModuleActive(sampleModule, '/app/admin/users')).toBe(false)
  })
})

describe('pickActiveHref', () => {
  it('picks the longest matching prefix so sibling routes never double-highlight', () => {
    const hrefs = ['/app/admin', '/app/admin/users', '/app/admin/tenants']
    expect(pickActiveHref(hrefs, '/app/admin/users')).toBe('/app/admin/users')
    expect(pickActiveHref(hrefs, '/app/admin')).toBe('/app/admin')
  })

  it('highlights the owning link for a nested detail/tab route', () => {
    const hrefs = ['/app/sample/definitions', '/app/sample/transactions']
    expect(pickActiveHref(hrefs, '/app/sample/definitions/edit/123')).toBe('/app/sample/definitions')
  })

  it('does not let the root dashboard link swallow every nested route', () => {
    const hrefs = ['/app', '/app/sample']
    expect(pickActiveHref(hrefs, '/app/sample')).toBe('/app/sample')
    expect(pickActiveHref(hrefs, '/app')).toBe('/app')
  })

  it('returns null when nothing matches', () => {
    expect(pickActiveHref(['/app/sample'], '/system/users')).toBeNull()
  })
})

describe('Dashboard-first standard', () => {
  const fullAccessCtx = ctx({ can: () => true })

  it('renders Dashboard as the very first section+link for every tenant-scope module', () => {
    const modules = resolveNavModules([...NAV_MODULES, SAMPLE_MODULE], fullAccessCtx)
    expect(modules.length).toBeGreaterThan(0)
    for (const navModule of modules) {
      const firstSection = navModule.sections[0]
      expect(firstSection?.section).toBe('GENERAL')
      expect(firstSection?.links[0]?.label).toBe('Dashboard')
    }
  })

  it('Customer Admin Dashboard points at /app/admin', () => {
    const modules = resolveNavModules(NAV_MODULES, fullAccessCtx)
    const customerAdmin = modules.find(m => m.key === 'CUSTOMER_ADMIN')!
    expect(customerAdmin.sections[0]?.links[0]).toEqual({ label: 'Dashboard', href: '/app/admin' })
  })

  it('Sample module Dashboard points at its module root', () => {
    const modules = resolveNavModules([SAMPLE_MODULE], fullAccessCtx)
    const sample = modules.find(m => m.key === 'SAMPLE_MODULE')!
    expect(sample.sections[0]?.links[0]).toEqual({ label: 'Dashboard', href: '/app/sample' })
  })

  it('Platform console Dashboard points at /system, not /app', () => {
    const modules = resolveNavModules(PLATFORM_MODULES, ctx({ isPlatformRoot: true, isSystemAdmin: true, can: () => true }))
    const platform = modules.find(m => m.key === 'PLATFORM_CONSOLE')!
    expect(platform.sections[0]).toMatchObject({ section: 'GENERAL' })
    expect(platform.sections[0]?.links[0]).toEqual({ label: 'Dashboard', href: '/system' })
  })
})
