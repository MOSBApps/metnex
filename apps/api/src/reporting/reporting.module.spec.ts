import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * DEC-0012 pins reporting core to zero dataset providers and zero seeded report_artifacts rows by
 * default — the exact state the removed Demo Operations module used to violate (a demo report
 * artifact auto-seed plus a `DemoTransactionsDatasetProvider` wired in by default). An earlier
 * revision of TASK-027.54 reintroduced that pattern (a `DemoAnalysisDatasetProvider` + a runtime
 * `onModuleInit` artifact seed); this is a static regression guard so it can't silently come back.
 *
 * TASK-027.55 adds one narrowly-scoped exception: a development-only fixture provider, gated by
 * `isDevFixtureEnabled()` (NODE_ENV=development AND REPORTING_DEV_FIXTURES=true). The tests below
 * are split in two: a static guard (this describe block) pinning the *shape* of that exception —
 * it must stay conditional, never unconditional, never demo/seed-named — and a behavioural describe
 * block further down that actually loads the module under each env combination and inspects Nest's
 * own provider metadata, proving the provider is truly absent from the DI container outside dev-
 * fixture mode (not just "unused" — never registered at all).
 */
describe('ReportingModule — no regression against DEC-0012 (no default dataset provider, no seed)', () => {
  const source = readFileSync(join(__dirname, 'reporting.module.ts'), 'utf8')

  it('the REPORT_DATASET_PROVIDERS token still has a literal-empty-array fallback branch for the non-dev-fixture case', () => {
    expect(source).toMatch(/provide:\s*REPORT_DATASET_PROVIDERS\s*,\s*useValue:\s*\[\s*\]/)
  })

  it('the useFactory branch (the only place a provider is ever registered) is strictly gated by isDevFixtureEnabled()', () => {
    expect(source).toMatch(/isDevFixtureEnabled\(\)\s*\?\s*\{[\s\S]*useFactory/)
  })

  it('no onModuleInit / startup seed exists in this module', () => {
    expect(source).not.toContain('onModuleInit')
  })

  it('the providers list carries no unconditional demo/seed-named entry', () => {
    const providersBlock = source.match(/providers:\s*\[([\s\S]*?)\n {2}\],/)?.[1] ?? ''
    expect(providersBlock).not.toMatch(/Demo|(?<!Dev)Seed/)
  })

  it('no demo dataset provider file exists in the dataset directory', () => {
    expect(existsSync(join(__dirname, 'dataset', 'demo-analysis-dataset.provider.ts'))).toBe(false)
  })
})

/**
 * Behavioural half: actually `require()`s the module fresh under each env combination and reads
 * Nest's own `@Module()` metadata (via `Reflect.getMetadata`) — no DI container instantiation, so
 * no DbModule/AuditModule DB connection is ever opened, but this is real module metadata, not a
 * text-match proxy for it.
 */
describe('ReportingModule — TASK-027.55 dev-fixture provider registration (behavioural, per env)', () => {
  const ORIGINAL_ENV = { ...process.env }

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    jest.resetModules()
  })

  function loadReportingModule() {
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ReportingModule } = require('./reporting.module') as typeof import('./reporting.module')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DevFixtureDatasetProvider } = require('./dataset/dev-fixture-dataset.provider') as typeof import('./dataset/dev-fixture-dataset.provider')
    const providers: unknown[] = Reflect.getMetadata('providers', ReportingModule)
    return { providers, DevFixtureDatasetProvider }
  }

  it('registers DevFixtureDatasetProvider only when NODE_ENV=development AND REPORTING_DEV_FIXTURES=true', () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const { providers, DevFixtureDatasetProvider } = loadReportingModule()
    expect(providers).toContain(DevFixtureDatasetProvider)
  })

  it('does NOT register DevFixtureDatasetProvider when NODE_ENV=production, even with the flag set', () => {
    process.env.NODE_ENV = 'production'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const { providers, DevFixtureDatasetProvider } = loadReportingModule()
    expect(providers).not.toContain(DevFixtureDatasetProvider)
  })

  it('does NOT register DevFixtureDatasetProvider when the flag is missing', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.REPORTING_DEV_FIXTURES
    const { providers, DevFixtureDatasetProvider } = loadReportingModule()
    expect(providers).not.toContain(DevFixtureDatasetProvider)
  })

  it('does NOT register DevFixtureDatasetProvider when the flag is explicitly "false"', () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'false'
    const { providers, DevFixtureDatasetProvider } = loadReportingModule()
    expect(providers).not.toContain(DevFixtureDatasetProvider)
  })

  it('when disabled, REPORT_DATASET_PROVIDERS resolves via useValue: [] — no factory, nothing to instantiate', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.REPORTING_DEV_FIXTURES
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ReportingModule } = require('./reporting.module') as typeof import('./reporting.module')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { REPORT_DATASET_PROVIDERS } = require('./dataset/report-dataset.contract') as typeof import('./dataset/report-dataset.contract')
    const providers = Reflect.getMetadata('providers', ReportingModule) as Array<{ provide?: unknown; useValue?: unknown; useFactory?: unknown }>
    const tokenProvider = providers.find(p => p?.provide === REPORT_DATASET_PROVIDERS)
    expect(tokenProvider?.useFactory).toBeUndefined()
    expect(tokenProvider?.useValue).toEqual([])
  })
})
