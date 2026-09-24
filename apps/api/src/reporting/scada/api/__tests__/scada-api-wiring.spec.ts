import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DevCsvFixtureLimits } from '../dev-csv-scada-fixture'
import { SCADA_ANALYSIS_QUERY, SCADA_API_LIMITS, SCADA_DEV_CSV_FIXTURE, SCADA_PRESET_AUTHORIZATION, SCADA_PRESET_STORE, SCADA_ROLLOVER_POLICIES, SCADA_SOURCE_CATALOG, SCADA_VIRTUAL_COLUMN_STORE, ScadaApiError } from '../scada-api.contract'
import { SCADA_API_LIMIT_ENV, loadScadaApiLimits } from '../scada-api.env'
import { scadaApiProviders } from '../scada-api.providers'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'

const API_DIR = path.resolve(__dirname, '..')
const REPORTING_DIR = path.resolve(API_DIR, '../..')
const productionFiles = readdirSync(API_DIR).filter(f => f.endsWith('.ts'))
const read = (file: string) => readFileSync(path.join(API_DIR, file), 'utf8')
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const tokens = (env: NodeJS.ProcessEnv) => scadaApiProviders(env).map(p => (p as { provide: unknown }).provide)

describe('development fixture provider registration (TASK-027.72)', () => {
  const FIXTURE_TOKENS = [SCADA_SOURCE_CATALOG, SCADA_ANALYSIS_QUERY]

  it.each([
    ['production', { NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true' }],
    ['production without the flag', { NODE_ENV: 'production' }],
    ['test with the flag', { NODE_ENV: 'test', REPORTING_DEV_FIXTURES: 'true' }],
    ['development WITHOUT the flag', { NODE_ENV: 'development' }],
    ['development with the flag false', { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'false' }],
    ['no environment at all', {}],
  ])('%s ⇒ no fixture / simulation provider exists in the DI container', (_n, env) => {
    const list = tokens(env)
    for (const token of FIXTURE_TOKENS) expect(list).not.toContain(token)
    const providers = scadaApiProviders(env)
    expect(JSON.stringify(providers.map(p => (p as { useValue?: unknown }).useValue?.constructor?.name))).not.toMatch(/DevCsv/)
  })

  it('only NODE_ENV=development AND REPORTING_DEV_FIXTURES=true register the simulation catalog, query and limits', () => {
    const providers = scadaApiProviders({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' })
    const byToken = new Map(providers.map(p => [(p as { provide: unknown }).provide, p as { useValue?: unknown }]))
    expect(byToken.has(SCADA_SOURCE_CATALOG)).toBe(true)
    expect(byToken.has(SCADA_ANALYSIS_QUERY)).toBe(true)
    expect(byToken.has(SCADA_DEV_CSV_FIXTURE)).toBe(true)
    expect(byToken.get(SCADA_API_LIMITS)!.useValue).toBeInstanceOf(DevCsvFixtureLimits)
    // the preset authorization adapter is always composed (existing role / scope model); it is not a fixture
    expect(tokens({})).toContain(SCADA_PRESET_AUTHORIZATION)
  })

  it('the persistent-store and policy PORT tokens are never registered here (no repository exists yet)', () => {
    for (const env of [{}, { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' }]) {
      const list = tokens(env)
      for (const token of [SCADA_PRESET_STORE, SCADA_VIRTUAL_COLUMN_STORE, SCADA_ROLLOVER_POLICIES]) expect(list).not.toContain(token)
    }
  })

  it('loading the ReportingModule under each environment registers the simulation ONLY in dev-fixture mode (real @Module metadata)', () => {
    const saved = { ...process.env }
    const load = (env: Record<string, string | undefined>) => {
      process.env = { ...saved, ...env }
      jest.resetModules()
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../../../reporting.module') as { ReportingModule: new () => unknown }
      const providers = (Reflect.getMetadata('providers', mod.ReportingModule) as Array<{ provide?: unknown }>).map(p => p.provide)
      const controllers = (Reflect.getMetadata('controllers', mod.ReportingModule) as Array<{ name: string }>).map(c => c.name)
      return { providers, controllers }
    }
    try {
      const prod = load({ NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true' })
      expect(prod.providers).not.toContain(SCADA_ANALYSIS_QUERY)
      expect(prod.providers).not.toContain(SCADA_SOURCE_CATALOG)
      expect(prod.controllers).toEqual(['ReportingController', 'ScadaAnalysisController'])
      const dev = load({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' })
      expect(dev.providers).toContain(SCADA_ANALYSIS_QUERY)
      expect(dev.providers).toContain(SCADA_SOURCE_CATALOG)
    } finally {
      process.env = saved
      jest.resetModules()
    }
  })

  it('the development fixture provider objects are wired lazily: the fixture token exists only in dev-fixture mode', () => {
    expect(tokens({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' })).toContain(SCADA_DEV_CSV_FIXTURE)
    expect(tokens({ NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true' })).not.toContain(SCADA_DEV_CSV_FIXTURE)
    expect(tokens({})).not.toContain(SCADA_DEV_CSV_FIXTURE)
  })

  it('WITHOUT any fixture (production shape) the service answers a safe SCADA_SOURCE_NOT_CONFIGURED — no synthetic data, no 500', async () => {
    const audits: unknown[] = []
    const service = new ScadaAnalysisApiService({
      scopes: { resolve: async () => ({ tenantId: 't-1', customerRootTenantId: 'r-1', dataScopeTenantIds: ['t-1'] }) },
      callers: { describe: async () => ({ tenant: null, userActive: true }) },
      artifacts: { assertExists: async () => undefined },
      clock: { nowMs: () => 0, correlationId: () => 'c' },
      audit: { record: async e => void audits.push(e) },
      limits: new DevCsvFixtureLimits(),
    })
    const body = { sourceCatalogIds: ['00000000-0000-4000-8000-000000000001'], seriesKeys: ['A'], startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-02-01T06:00:00.000Z', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul' }
    const error = await service.runAnalysis({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'X', body }).catch(e => e)
    expect(error).toBeInstanceOf(ScadaApiError)
    expect(error.code).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    expect(error.status).toBe(503)
    expect(audits).toHaveLength(1)
  })
})

describe('limits come from the environment only (no default anywhere)', () => {
  const full = (): NodeJS.ProcessEnv => Object.fromEntries(Object.values(SCADA_API_LIMIT_ENV).map((name, i) => [name, String(10 + i)]))

  it('a complete environment produces the limits', () => {
    const l = loadScadaApiLimits(full())
    expect(l).not.toBeNull()
    expect(l!.preset.maxNameLength).toBe(10)
    expect(l!.maxSeriesMappings).toBeGreaterThan(0)
  })

  it('an empty environment gives NO limits (there is no built-in default)', () => {
    expect(loadScadaApiLimits({})).toBeNull()
  })

  it.each(Object.values(SCADA_API_LIMIT_ENV))('a missing %s invalidates the whole profile', name => {
    const env = full()
    delete env[name]
    expect(loadScadaApiLimits(env)).toBeNull()
  })

  it.each(['abc', '0', '-5', '', ' ', 'NaN', 'Infinity', '1e999', '12px', '0x10'])('the value %j is not a valid limit', bad => {
    const env = full()
    env[SCADA_API_LIMIT_ENV.maxSeriesCount] = bad
    expect(loadScadaApiLimits(env)).toBeNull()
  })

  it('the production limits provider reads that environment and yields null (fail-closed) when it is empty', () => {
    const provider = scadaApiProviders({ NODE_ENV: 'production' }).find(p => (p as { provide: unknown }).provide === SCADA_API_LIMITS) as { useValue: { get(): unknown } }
    expect(provider.useValue.get()).toBeNull()
  })
})

describe('static guarantees of the SCADA API module', () => {
  it('has the expected files', () => {
    expect(productionFiles).toEqual(expect.arrayContaining(['scada-api.contract.ts', 'scada-api.validator.ts', 'scada-api.projection.ts', 'scada-analysis-api.service.ts', 'scada-analysis.controller.ts', 'scada-api.providers.ts', 'scada-api.env.ts', 'dev-csv-scada-fixture.ts', 'scada-preset-authorization.ts']))
  })

  it('no file executes raw SQL, discovers a schema, opens a driver / socket / file, evals, or logs', () => {
    for (const f of productionFiles) {
      const c = code(f)
      expect(c).not.toMatch(/\.execute\(|\bsql`|\.query\(|information_schema|from\s+['"](mssql|tedious|pg|fs|node:fs|http|https|net|child_process|vm)['"]|\beval\s*\(|new\s+Function\b|console\.|Logger\b/)
    }
  })

  it('names neither the excluded organisation nor the source company field, and stores no credential-like literal', () => {
    for (const f of productionFiles) expect(read(f)).not.toMatch(/sirket|mosedas|mosedaş|Server=\w|Password\s*=\s*\w|BotToken|PasswordSalt/i)
  })

  it('defines no permission code and no audit action name of its own (existing REPORT:ARTIFACT:VIEW / :EXPORT and SCADA_QUERY_* only; EXPORT only on the export route)', () => {
    for (const f of productionFiles) {
      const c = code(f)
      const permissions = [...c.matchAll(/['"`]([A-Z]+:[A-Z_]+:[A-Z_]+)['"`]/g)].map(m => m[1])
      expect(permissions.filter(p => p !== 'REPORT:ARTIFACT:VIEW' && p !== 'REPORT:ARTIFACT:EXPORT')).toEqual([])
      if (f !== 'scada-analysis.controller.ts') expect(permissions).not.toContain('REPORT:ARTIFACT:EXPORT')
      const actions = [...c.matchAll(/['"`](SCADA_[A-Z_]+)['"`]/g)].map(m => m[1]).filter(a => /^SCADA_QUERY_/.test(a!))
      expect(actions.filter(a => !['SCADA_QUERY_SUCCEEDED', 'SCADA_QUERY_DENIED', 'SCADA_QUERY_FAILED'].includes(a!))).toEqual([])
    }
  })

  it('the fixture is imported ONLY by the provider registration, and there only behind isDevFixtureEnabled', () => {
    const importers = productionFiles.filter(f => /dev-csv-scada-fixture/.test(code(f)) && f !== 'dev-csv-scada-fixture.ts')
    expect(importers).toEqual(['scada-api.providers.ts'])
    const providers = code('scada-api.providers.ts')
    expect(providers).toMatch(/const dev = isDevFixtureEnabled\(env\)/)
    expect(providers).toMatch(/dev\s*\?\s*\[[\s\S]*createDevCsvFixture[\s\S]*\]\s*:\s*\[/)
    const csvImporters = productionFiles.filter(f => /ScadaCsvFixtureProvider/.test(code(f))).sort()
    expect(csvImporters).toEqual(['dev-csv-scada-fixture.ts', 'scada-api.providers.ts'])
    expect(readFileSync(path.join(REPORTING_DIR, 'reporting.module.ts'), 'utf8')).not.toMatch(/DevCsv|dev-csv-scada-fixture|ScadaCsvFixture/)
    expect(readFileSync(path.join(REPORTING_DIR, 'reporting.module.ts'), 'utf8')).not.toMatch(/SCADA_PRESET_STORE|SCADA_SOURCE_CATALOG/)
  })

  it('the request is validated BEFORE any scope, provider or query access (source order of every entry point)', () => {
    const svc = code('scada-analysis-api.service.ts')
    const body = (name: string) => {
      const start = svc.indexOf(`async ${name}(`)
      return svc.slice(start, svc.indexOf('\n  }\n', start))
    }
    expect(body('runAnalysis')).toContain('this.analysisCore(')
    expect(body('runComparison')).toContain('this.comparisonCore(')
    for (const [name, validate] of [['analysisCore', 'validateAnalysisRequest('], ['comparisonCore', 'validateComparisonRequest('], ['runExport', 'validateExportBody('], ['completePngExport', 'validatePngCompletion(']] as const) {
      const b = body(name)
      expect(b.indexOf(validate)).toBeGreaterThan(-1)
      for (const later of ['requireProviders(', 'assertArtifact(', 'this.environment(', 'this.runPipeline(', 'this.compare(', 'this.analysisCore(', 'this.comparisonCore(', 'buildExportFile(', 'exportAudit.record(']) {
        if (b.indexOf(later) >= 0) expect(b.indexOf(validate)).toBeLessThan(b.indexOf(later))
      }
    }
    for (const name of ['listPresets', 'getPreset']) {
      const b = body(name)
      expect(b.indexOf('this.requireLimits(')).toBeLessThan(b.indexOf('this.environment('))
      expect(b.indexOf('validateRouteCode(')).toBeLessThan(b.indexOf('this.environment('))
    }
  })

  it('the raw HTTP body is only ever handed to the pure validators (never to a domain service)', () => {
    const svc = code('scada-analysis-api.service.ts')
    const uses = [...svc.matchAll(/call\.body/g)].length
    expect(uses).toBe(6) // validateAnalysisRequest, validateComparisonRequest, (027.71-R1) validateVirtualColumnRequest and (027.74) validateExportBody
    expect(svc).toMatch(/validateExportBody\(call\.body\)/)
    expect(svc).toMatch(/validatePngCompletion\(call\.body\)/)
    expect(svc).toMatch(/validatePresetCreateRequest\(call\.body, limits\)/)
    expect(svc).toMatch(/validateVirtualColumnRequest\(call\.body, limits\)/)
    expect(svc).toMatch(/validateAnalysisRequest\(call\.routeCode, call\.body, limits\)/)
    expect(svc).toMatch(/validateComparisonRequest\(call\.routeCode, call\.body, limits\)/)
  })

  it('a client value can never become the correlation id or a tenant (they are server / guard derived)', () => {
    const svc = code('scada-analysis-api.service.ts')
    expect(svc).toMatch(/correlationId: this\.deps\.clock\.correlationId\(\)/)
    expect(svc).not.toMatch(/body\[['"]correlationId['"]\]|body\.correlationId|clean\.correlationId/)
    expect(REPORTING_DIR).toContain('reporting')
  })

  it('the projection is a whitelist: no spread of an internal object into a response', () => {
    const projection = code('scada-api.projection.ts')
    expect(projection).not.toMatch(/\.\.\.(series|source|plan|preset|chart|result|executed|o)\b(?!\.)/)
  })
})
