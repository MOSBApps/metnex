import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildMockDb, chain } from '../../../../db/test-helpers/drizzle-mock'
import { ReportingService } from '../../../reporting.service'
import { isDevFixtureEnabled } from '../../../dataset/dev-fixture-dataset.provider'
import { SCADA_FIXTURE_ARTIFACT_CODE, buildScadaFixtureArtifact, fixtureSourceZone, fixtureTimezoneStatus } from '../../fixture/scada-fixture-artifact'
import { scadaApiProviders } from '../scada-api.providers'
import { SCADA_ANALYSIS_QUERY, SCADA_SOURCE_CATALOG } from '../scada-api.contract'

/**
 * TASK-027.73-R3 — `dev.sh` activates the development CSV fixture for LOCAL development only. These tests run the real shell code
 * (`scripts/dev-fixture-env.sh` + the `write_api_env` function of `dev.sh`) in a temp dir — no Docker, no port, no database,
 * no CSV is read — and feed the result to the API's own gate functions.
 */
const REPO = path.resolve(__dirname, '../../../../../../..')
const DEV_SH = path.join(REPO, 'dev.sh')
const HELPER = path.join(REPO, 'scripts/dev-fixture-env.sh')
const CLEAN_ENV: NodeJS.ProcessEnv = { PATH: process.env['PATH'], HOME: process.env['HOME'] }

const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'metnex-devsh-'))
  dirs.push(d)
  return d
}

/** Runs resolve + write of the API .env exactly as dev.sh does (function text taken from dev.sh itself). */
function writeApiEnv(opts: { env?: NodeJS.ProcessEnv; existing?: string } = {}) {
  const dir = tmp()
  const apiEnv = path.join(dir, 'api.env')
  if (opts.existing !== undefined) writeFileSync(apiEnv, opts.existing)
  const fn = execFileSync('awk', ['/^write_api_env\\(\\) \\{/,/^\\}/', DEV_SH], { encoding: 'utf8' })
  const script = `
set -euo pipefail
source "${HELPER}"
API_ENV="${apiEnv}"
API_PORT=6501 WEB_PORT=6500 POSTGRES_USER=u POSTGRES_PASSWORD=p POSTGRES_LOCAL_PORT=6502 POSTGRES_DB=d REDIS_PASSWORD=r REDIS_LOCAL_PORT=6503
MINIO_API_PORT=6504 MINIO_ROOT_USER=m MINIO_ROOT_PASSWORD=s JASPER_RENDERER_LOCAL_PORT=6506 REPORT_RENDER_INTERNAL_TOKEN=t
${fn}
resolve_dev_fixture_env "$API_ENV" || exit 7
write_api_env
dev_fixture_status_message > "${dir}/status.txt"
`
  const r = spawnSync('bash', ['-c', script], { env: { ...CLEAN_ENV, ...opts.env }, encoding: 'utf8' })
  const content = existsSync(apiEnv) ? readFileSync(apiEnv, 'utf8') : ''
  const status = existsSync(path.join(dir, 'status.txt')) ? readFileSync(path.join(dir, 'status.txt'), 'utf8') : ''
  return { status: r.status, stderr: r.stderr, content, message: status, apiEnv }
}
const parse = (content: string): Record<string, string> => Object.fromEntries(content.split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

describe('dev.sh writes the development CSV fixture variables into the LOCAL API .env', () => {
  it('bash -n dev.sh and the helper are syntactically valid', () => {
    expect(spawnSync('bash', ['-n', DEV_SH]).status).toBe(0)
    expect(spawnSync('bash', ['-n', HELPER]).status).toBe(0)
  })

  it('the default output contains both fixture variables, with Europe/Istanbul as the default zone', () => {
    const r = writeApiEnv()
    expect(r.status).toBe(0)
    const env = parse(r.content)
    expect(env['REPORTING_DEV_FIXTURES']).toBe('true')
    expect(env['REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE']).toBe('Europe/Istanbul')
    expect(env['NODE_ENV']).toBe('development')
  })

  it('the generated environment really activates the fixture gate (artifact present, zone verified as a development override)', () => {
    const env = parse(writeApiEnv().content) as NodeJS.ProcessEnv
    expect(isDevFixtureEnabled(env)).toBe(true)
    expect(fixtureSourceZone(env)).toBe('Europe/Istanbul')
    expect(fixtureTimezoneStatus(env)).toBe('DEVELOPMENT_OVERRIDE')
    expect(buildScadaFixtureArtifact(env)?.code).toBe('SCADA_HOURLY_ANALYSIS')
    expect(SCADA_FIXTURE_ARTIFACT_CODE).toBe('SCADA_HOURLY_ANALYSIS')
    const tokens = scadaApiProviders(env).map(p => (p as { provide: unknown }).provide)
    expect(tokens).toContain(SCADA_SOURCE_CATALOG)
    expect(tokens).toContain(SCADA_ANALYSIS_QUERY)
  })

  it('the scope bridge flag defaults to true, an explicit false is kept, existing .env and exported values follow the same precedence (TASK-027.73-R4)', () => {
    expect(parse(writeApiEnv().content)['REPORTING_DEV_FIXTURE_SCOPE_BRIDGE']).toBe('true')
    const off = writeApiEnv({ env: { REPORTING_DEV_FIXTURE_SCOPE_BRIDGE: 'false' } })
    expect(parse(off.content)['REPORTING_DEV_FIXTURE_SCOPE_BRIDGE']).toBe('false')
    expect(off.message).toContain('Development CSV fixture scope bridge: disabled')
    const existing = 'REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=false\n'
    expect(parse(writeApiEnv({ existing }).content)['REPORTING_DEV_FIXTURE_SCOPE_BRIDGE']).toBe('false')
    expect(parse(writeApiEnv({ existing, env: { REPORTING_DEV_FIXTURE_SCOPE_BRIDGE: 'true' } }).content)['REPORTING_DEV_FIXTURE_SCOPE_BRIDGE']).toBe('true')
    const bad = writeApiEnv({ env: { REPORTING_DEV_FIXTURE_SCOPE_BRIDGE: 'true\nJWT_SECRET=x' } })
    expect(bad.status).toBe(7)
    expect(bad.content).toBe('')
  })

  it('a flag given by the user is kept', () => {
    const env = parse(writeApiEnv({ env: { REPORTING_DEV_FIXTURES: 'true' } }).content)
    expect(env['REPORTING_DEV_FIXTURES']).toBe('true')
  })

  it('a time zone given by the user is kept (never overwritten by the default)', () => {
    const env = parse(writeApiEnv({ env: { REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE: 'Europe/Berlin' } }).content)
    expect(env['REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE']).toBe('Europe/Berlin')
    expect(fixtureSourceZone(env as NodeJS.ProcessEnv)).toBe('Europe/Berlin')
  })

  it('values already present in the existing apps/api/.env survive a re-run; an exported variable still wins over them', () => {
    const existing = 'PORT=1\nREPORTING_DEV_FIXTURES=false\nREPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=Europe/Paris\n'
    const kept = parse(writeApiEnv({ existing }).content)
    expect(kept['REPORTING_DEV_FIXTURES']).toBe('false')
    expect(kept['REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE']).toBe('Europe/Paris')
    const overridden = parse(writeApiEnv({ existing, env: { REPORTING_DEV_FIXTURES: 'true', REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE: 'Europe/Rome' } }).content)
    expect(overridden['REPORTING_DEV_FIXTURES']).toBe('true')
    expect(overridden['REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE']).toBe('Europe/Rome')
  })

  it('a commented-out line of the existing file is not read as a value', () => {
    const env = parse(writeApiEnv({ existing: '# REPORTING_DEV_FIXTURES=false\n' }).content)
    expect(env['REPORTING_DEV_FIXTURES']).toBe('true')
  })

  it('an explicit REPORTING_DEV_FIXTURES=false keeps the fixture OFF: no artifact, no fixture providers, "disabled" message', () => {
    const r = writeApiEnv({ env: { REPORTING_DEV_FIXTURES: 'false' } })
    const env = parse(r.content) as NodeJS.ProcessEnv
    expect(env['REPORTING_DEV_FIXTURES']).toBe('false')
    expect(isDevFixtureEnabled(env)).toBe(false)
    expect(buildScadaFixtureArtifact(env)).toBeNull()
    expect(scadaApiProviders(env).map(p => (p as { provide: unknown }).provide)).not.toContain(SCADA_SOURCE_CATALOG)
    expect(r.message).toContain('Development CSV fixture: disabled')
  })

  it('NODE_ENV=production never activates the fixture, whatever the two variables say', () => {
    const env = { ...parse(writeApiEnv().content), NODE_ENV: 'production' } as NodeJS.ProcessEnv
    expect(isDevFixtureEnabled(env)).toBe(false)
    expect(buildScadaFixtureArtifact(env)).toBeNull()
    expect(scadaApiProviders(env).map(p => (p as { provide: unknown }).provide)).not.toContain(SCADA_ANALYSIS_QUERY)
  })

  it.each(['Not/AZone', '+03:00', 'Not_A_Zone', 'europe/istanbul_x'])('an invalid time zone %s is written AS GIVEN (never "fixed") and the API treats it as unverified: nothing is analysed', tz => {
    const r = writeApiEnv({ env: { REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE: tz } })
    const env = parse(r.content) as NodeJS.ProcessEnv
    expect(env['REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE']).toBe(tz)
    expect(fixtureSourceZone(env)).toBeNull()
    expect(fixtureTimezoneStatus(env)).toBe('UNVERIFIED')
    expect(r.message).toContain('fail-closed')
  })

  it.each([
    ['a newline', 'true\nJWT_SECRET=x'],
    ['a space', 'Europe/Istanbul extra'],
    ['a quote', 'Europe/"Istanbul'],
    ['a hash', 'Europe/Istanbul#x'],
    ['a dollar sign', 'Europe/$HOME'],
    ['a backslash', 'Europe\\Istanbul'],
    ['a semicolon', 'Europe/Istanbul;id'],
  ])('a zone value with %s is refused (no .env line injection) and nothing is written', (_n, bad) => {
    const r = writeApiEnv({ env: { REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE: bad } })
    expect(r.status).toBe(7)
    expect(r.content).toBe('')
    expect(r.stderr).not.toContain(bad)
  })

  it('the status message is static: it names the flag and the zone only — no path, row, connection string or credential', () => {
    const r = writeApiEnv()
    expect(r.message.trim().split('\n')).toEqual(['Development CSV fixture: enabled', 'Source timezone: Europe/Istanbul', 'Development CSV fixture scope bridge: enabled'])
    expect(r.message).not.toMatch(/veriler|\.csv|postgres|password|token|secret|Server=/i)
  })

  it('the generated .env carries no credential beyond what dev.sh already wrote: the fixture block adds exactly three variables', () => {
    const env = parse(writeApiEnv().content)
    const fixtureKeys = Object.keys(env).filter(k => k.startsWith('REPORTING_'))
    expect(fixtureKeys.sort()).toEqual(['REPORTING_DEV_FIXTURES', 'REPORTING_DEV_FIXTURE_SCOPE_BRIDGE', 'REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE'])
    const helper = readFileSync(HELPER, 'utf8').replace(/^\s*#.*$/gm, '')
    expect(helper).not.toMatch(/PASSWORD|SECRET|TOKEN|DATABASE_URL|cat\s|\.csv|veriler/i)
  })

  it('dev.sh resolves the fixture values BEFORE it overwrites the .env, and prints the status only through the static helper', () => {
    const src = readFileSync(DEV_SH, 'utf8')
    expect(src.indexOf('resolve_dev_fixture_env "$API_ENV"')).toBeGreaterThan(-1)
    expect(src.indexOf('resolve_dev_fixture_env "$API_ENV"')).toBeLessThan(src.indexOf('\nwrite_api_env\n'))
    expect(src).toContain('dev_fixture_status_message')
    expect(src).toMatch(/REPORTING_DEV_FIXTURES=\$\{DEV_FIXTURE_FLAG\}/)
    expect(src).toMatch(/REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=\$\{DEV_FIXTURE_TZ\}/)
  })

  it('the fixture variables exist ONLY in the local development bootstrap: not in any Docker / infra / production config or Dockerfile', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
      const f = path.join(dir, n)
      if (n === 'node_modules' || n === '.git') return []
      return statSync(f).isDirectory() ? walk(f) : [f]
    })
    const candidates = [...walk(path.join(REPO, 'infra')), ...walk(path.join(REPO, 'apps/api')).filter(f => /Dockerfile|docker-compose|\.production|\.prod\b/i.test(f)), ...walk(path.join(REPO, 'apps/web')).filter(f => /Dockerfile/.test(f))]
    expect(candidates.length).toBeGreaterThan(0)
    for (const f of candidates) expect(readFileSync(f, 'utf8')).not.toMatch(/REPORTING_DEV_FIXTURE/)
  })
})

describe('artifact activation through the API (no persistence)', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })
  function reporting() {
    const db = buildMockDb()
    db.select.mockReturnValue(chain([]))
    return { db, service: new ReportingService(db as never, {} as never, {} as never, {} as never, { log: jest.fn() } as never) }
  }
  const codes = async (s: ReturnType<typeof reporting>) => ((await s.service.listArtifacts('t-1')).artifacts as Array<{ code: string }>).map(a => a.code)

  it('with the generated environment SCADA_HOURLY_ANALYSIS is listed — and NOTHING is written to the database', async () => {
    process.env = { ...saved, ...parse(writeApiEnv().content) }
    const s = reporting()
    expect(await codes(s)).toContain('SCADA_HOURLY_ANALYSIS')
    expect(s.db.insert).not.toHaveBeenCalled()
    expect(s.db.update).not.toHaveBeenCalled()
  })

  it.each([
    ['fixture explicitly false', { REPORTING_DEV_FIXTURES: 'false' }],
    ['production', { NODE_ENV: 'production' }],
  ])('with %s the artifact is not listed and cannot be looked up', async (_n, over) => {
    process.env = { ...saved, ...parse(writeApiEnv().content), ...over }
    const s = reporting()
    expect(await codes(s)).not.toContain('SCADA_HOURLY_ANALYSIS')
    await expect(s.service.getArtifact('t-1', 'SCADA_HOURLY_ANALYSIS')).rejects.toMatchObject({ status: 404 })
  })

  it('the module never seeds the artifact: no insert into report_artifacts and no onModuleInit in the SCADA / reporting sources', () => {
    const files = ['reporting.module.ts', 'reporting.service.ts', 'scada/fixture/scada-fixture-artifact.ts', 'scada/api/scada-api.providers.ts', 'scada/api/dev-csv-scada-fixture.ts'].map(f => readFileSync(path.join(REPO, 'apps/api/src/reporting', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))
    for (const src of files) expect(src).not.toMatch(/\.insert\(|onModuleInit|onApplicationBootstrap|values\(/)
  })
})
