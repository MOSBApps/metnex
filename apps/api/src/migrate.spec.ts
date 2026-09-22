import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Control-plane migration entrypoint contract (TASK-027.30). Nothing here opens a real database
 * connection: the migrator is mocked, and the compiled artifact is only run with a missing or
 * malformed DATABASE_URL, which the entrypoint rejects before any connection attempt.
 */
const API_ROOT = join(__dirname, '..')
const REPO_ROOT = join(API_ROOT, '..', '..')
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8')
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const MIGRATE_SOURCE = join(API_ROOT, 'src', 'migrate.ts')

describe('entrypoint source and scope', () => {
  const code = () => stripComments(readFileSync(MIGRATE_SOURCE, 'utf8'))

  it('has a real source file', () => {
    expect(existsSync(MIGRATE_SOURCE)).toBe(true)
  })

  it('imports only the migrator, pg, path and the DATABASE_URL guard', () => {
    const imports = [...code().matchAll(/from\s+'([^']+)'/g)].map(match => match[1])
    expect(imports.sort()).toEqual(
      ['./db/database-url', 'drizzle-orm/node-postgres', 'drizzle-orm/node-postgres/migrator', 'node:path', 'pg'].sort(),
    )
  })

  it('uses the programmatic Drizzle migrator, not drizzle-kit', () => {
    expect(code()).toContain("from 'drizzle-orm/node-postgres/migrator'")
    expect(code()).not.toMatch(/drizzle-kit/)
  })

  it('does not start an HTTP server or bootstrap the application', () => {
    expect(code()).not.toMatch(/@nestjs|NestFactory|\.listen\(|createServer|express/i)
  })

  it('does not reference data-plane, fan-out, Vardiya, archive, identity, seed, provisioning or registry work', () => {
    expect(code()).not.toMatch(/pgSchema|fan-?out|data-?plane|customer-?root|vardiya|shift|archive|botc|identity|seed|provision|registry|reactivat|tenant/i)
  })

  it('takes no command-line arguments (parameterless run is control-plane only)', () => {
    expect(code()).not.toMatch(/process\.argv/)
  })

  it('is not wired into application startup', () => {
    for (const file of ['main.ts', 'app.module.ts']) {
      expect(readFileSync(join(API_ROOT, 'src', file), 'utf8')).not.toMatch(/migrate/i)
    }
    expect(read(API_ROOT, 'Dockerfile')).toMatch(/CMD \["node", "apps\/api\/dist\/main\.js"\]/)
  })
})

describe('runControlPlaneMigrations', () => {
  const MARKER = 'TopSecretMarker123'
  const URL_WITH_SECRET = `postgresql://svc_user:${MARKER}@db.internal.example:5432/appdb`

  afterEach(() => {
    jest.resetModules()
    jest.dontMock('pg')
    jest.dontMock('drizzle-orm/node-postgres')
    jest.dontMock('drizzle-orm/node-postgres/migrator')
    jest.restoreAllMocks()
  })

  function load(options: { migrateImpl?: jest.Mock; lockAcquired?: boolean; connectError?: Error } = {}) {
    const query = jest.fn(async (sql: string) => (sql.includes('try_advisory') ? { rows: [{ locked: options.lockAcquired ?? true }] } : { rows: [] }))
    const release = jest.fn()
    const end = jest.fn(async () => undefined)
    const client = { query, release }
    const pool = { connect: jest.fn(async () => { if (options.connectError) throw options.connectError; return client }), end }
    const Pool = jest.fn(() => pool)
    const migrate = options.migrateImpl ?? jest.fn(async () => undefined)
    jest.doMock('pg', () => ({ Pool }))
    jest.doMock('drizzle-orm/node-postgres', () => ({ drizzle: jest.fn(() => ({})) }))
    jest.doMock('drizzle-orm/node-postgres/migrator', () => ({ migrate }))
    const mod = require('./migrate') as typeof import('./migrate')
    return { mod, Pool, pool, client, migrate, query, end, release }
  }

  const spyOutput = () => {
    const lines: string[] = []
    jest.spyOn(console, 'log').mockImplementation((...args) => void lines.push(args.join(' ')))
    jest.spyOn(console, 'error').mockImplementation((...args) => void lines.push(args.join(' ')))
    return lines
  }

  it('uses the repository drizzle/migrations folder and exits 0 on success', async () => {
    const lines = spyOutput()
    const { mod, migrate, end, release } = load()
    const code = await mod.runControlPlaneMigrations({ DATABASE_URL: URL_WITH_SECRET } as NodeJS.ProcessEnv)
    expect(code).toBe(0)
    expect(migrate).toHaveBeenCalledTimes(1)
    expect(migrate.mock.calls[0]?.[1]).toEqual({ migrationsFolder: join(API_ROOT, 'drizzle', 'migrations') })
    expect(release).toHaveBeenCalled()
    expect(end).toHaveBeenCalled()
    expect(lines.join('\n')).not.toContain(MARKER)
  })

  it('the migrations folder exists and contains the journal and SQL files', () => {
    const folder = join(API_ROOT, 'drizzle', 'migrations')
    expect(existsSync(join(folder, 'meta', '_journal.json'))).toBe(true)
    expect(readdirSync(folder).some(name => name.endsWith('.sql'))).toBe(true)
  })

  it.each([[undefined], [''], ['not-a-url'], ['mysql://user:pw@host/db']])('exits 1 without touching the database when DATABASE_URL is %p', async value => {
    const lines = spyOutput()
    const { mod, Pool, migrate } = load()
    const code = await mod.runControlPlaneMigrations({ DATABASE_URL: value } as NodeJS.ProcessEnv)
    expect(code).toBe(1)
    expect(Pool).not.toHaveBeenCalled()
    expect(migrate).not.toHaveBeenCalled()
    expect(lines.join('\n')).toMatch(/DATABASE_URL is (required|invalid)/)
  })

  it('exits 1 on a migration failure and scrubs the URL, user, password and host from the log', async () => {
    const lines = spyOutput()
    const failure = Object.assign(new Error(`connect failed for ${URL_WITH_SECRET} user svc_user password ${MARKER} host db.internal.example`), { code: 'ECONNREFUSED' })
    const { mod, end } = load({ migrateImpl: jest.fn(async () => { throw failure }) })
    const code = await mod.runControlPlaneMigrations({ DATABASE_URL: URL_WITH_SECRET } as NodeJS.ProcessEnv)
    const output = lines.join('\n')
    expect(code).toBe(1)
    expect(output).toContain('control-plane migration failed')
    expect(output).toContain('ECONNREFUSED')
    for (const secret of [MARKER, 'svc_user', 'db.internal.example', URL_WITH_SECRET]) {
      expect(output).not.toContain(secret)
    }
    expect(end).toHaveBeenCalled()
  })

  it('exits 1 when the connection itself fails', async () => {
    const lines = spyOutput()
    const { mod, migrate } = load({ connectError: new Error(`refused ${URL_WITH_SECRET}`) })
    expect(await mod.runControlPlaneMigrations({ DATABASE_URL: URL_WITH_SECRET } as NodeJS.ProcessEnv)).toBe(1)
    expect(migrate).not.toHaveBeenCalled()
    expect(lines.join('\n')).not.toContain(MARKER)
  })

  it('refuses to run when another migration holds the advisory lock', async () => {
    const lines = spyOutput()
    const { mod, migrate } = load({ lockAcquired: false })
    expect(await mod.runControlPlaneMigrations({ DATABASE_URL: URL_WITH_SECRET } as NodeJS.ProcessEnv)).toBe(1)
    expect(migrate).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('another migration is already running')
  })

  it('does not run anything at import time (only when executed as the entrypoint)', () => {
    const { Pool, migrate } = load()
    expect(Pool).not.toHaveBeenCalled()
    expect(migrate).not.toHaveBeenCalled()
  })
})

describe('compiled artifact (real build output)', () => {
  const OUT_DIR = join(API_ROOT, `.tmp-build-migrate-${process.pid}`)

  beforeAll(() => {
    const result = spawnSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--outDir', OUT_DIR, '--incremental', 'false'],
      { cwd: API_ROOT, encoding: 'utf8' },
    )
    if (result.status !== 0) throw new Error(`build failed: ${result.stdout}${result.stderr}`)
  }, 180_000)

  afterAll(() => rmSync(OUT_DIR, { recursive: true, force: true }))

  it('produces dist/migrate.js at the path the pipeline and Dockerfile expect', () => {
    expect(existsSync(join(OUT_DIR, 'migrate.js'))).toBe(true)
    expect(existsSync(join(OUT_DIR, 'main.js'))).toBe(true)
  })

  it('the compiled entrypoint requires only the allowed modules', () => {
    const requires = [...read(OUT_DIR, 'migrate.js').matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])
    expect([...new Set(requires)].sort()).toEqual(
      ['./db/database-url', 'drizzle-orm/node-postgres', 'drizzle-orm/node-postgres/migrator', 'node:path', 'pg'].sort(),
    )
  })

  const runArtifact = (databaseUrl: string | undefined) => {
    const env: NodeJS.ProcessEnv = { ...process.env, DOTENV_CONFIG_PATH: join(OUT_DIR, 'no-such.env') }
    delete env.DATABASE_URL
    if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl
    return spawnSync('node', [join(OUT_DIR, 'migrate.js')], { cwd: API_ROOT, env, encoding: 'utf8', timeout: 30_000 })
  }

  it('exits 1 when DATABASE_URL is missing', () => {
    const result = runArtifact(undefined)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL is required')
  })

  it('exits 1 for a malformed DATABASE_URL without printing it', () => {
    const marker = 'TopSecretMarker123'
    const result = runArtifact(`mysql://user:${marker}@127.0.0.1:1/db`)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL is invalid')
    expect(`${result.stdout}${result.stderr}`).not.toContain(marker)
  })
})

describe('Dockerfile', () => {
  const dockerfile = read(API_ROOT, 'Dockerfile')

  it('verifies the artifact at build time and ships dist and the migrations folder in the final image', () => {
    expect(dockerfile).toMatch(/RUN pnpm --filter api build\s+RUN test -f apps\/api\/dist\/migrate\.js/)
    expect(dockerfile).toContain('COPY --from=build /app/apps/api/dist ./apps/api/dist')
    expect(dockerfile).toContain('COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle')
  })

  it('keeps the application startup command unchanged', () => {
    expect(dockerfile).toMatch(/^CMD \["node", "apps\/api\/dist\/main\.js"\]$/m)
    const mentions = dockerfile.split('\n').filter(line => line.includes('migrate.js'))
    expect(mentions).toEqual(['RUN test -f apps/api/dist/migrate.js'])
    expect(dockerfile).not.toMatch(/^(CMD|ENTRYPOINT)[^\n]*migrate/m)
  })
})

describe('.github/workflows/pipeline.yml migration job', () => {
  const pipeline = read(REPO_ROOT, '.github', 'workflows', 'pipeline.yml')
  const jobBody = (name: string) => {
    const start = pipeline.indexOf(`\n  ${name}:\n`)
    expect(start).toBeGreaterThan(-1)
    const rest = pipeline.slice(start + 1)
    const next = rest.slice(1).search(/\n  [a-z][a-z-]*:\n/)
    return next === -1 ? rest : rest.slice(0, next + 1)
  }
  const migrate = jobBody('migrate')
  const deploy = jobBody('deploy')
  const codeOf = (text: string) => text.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')

  it('runs the migration only in its own job, with the entrypoint that build produces', () => {
    expect(codeOf(migrate)).toContain('node apps/api/dist/migrate.js')
    expect(codeOf(deploy)).not.toMatch(/migrate\.js|--env-file|MIGRATION_ENV_FILE/)
    expect(existsSync(MIGRATE_SOURCE)).toBe(true)
  })

  it('runs the entrypoint without arguments (control-plane only)', () => {
    const line = codeOf(migrate).split('\n').find(candidate => candidate.includes('node apps/api/dist/migrate.js')) as string
    expect(line.trim()).toBe('node apps/api/dist/migrate.js')
  })

  it('uses a per-environment migration concurrency group that never cancels a running migration', () => {
    expect(migrate).toMatch(/concurrency:\s+group: metnex-migration-\$\{\{ needs\.docker-build\.outputs\.env_name \}\}\s+cancel-in-progress: false/)
    // a workflow-level cancel would kill the migration job with the run
    expect(pipeline).toMatch(/^concurrency:\n\s+group: [^\n]+\n\s+cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/m)
    expect(pipeline).not.toMatch(/cancel-in-progress: true/)
  })

  it('keeps the GitHub Environment approval gate on the migration and the deploy jobs', () => {
    expect(migrate).toMatch(/environment: \$\{\{ needs\.docker-build\.outputs\.env_name \}\}/)
    expect(deploy).toMatch(/environment: \$\{\{ needs\.docker-build\.outputs\.env_name \}\}/)
  })

  it('verifies the artifact before the database step and fails the job when it is missing', () => {
    const code = codeOf(migrate)
    const check = code.indexOf('test "$GHCR_API" -f apps/api/dist/migrate.js')
    const run = code.indexOf('node apps/api/dist/migrate.js')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(run)
    expect(code).toMatch(/if ! docker run --rm --entrypoint test "\$GHCR_API" -f apps\/api\/dist\/migrate\.js; then[\s\S]*?exit 1\s+fi/)
    expect(code).toContain('set -euo pipefail')
  })

  it('does not source .env, expand secrets into argv, trace, or run data-plane work', () => {
    const code = codeOf(migrate)
    expect(code).not.toMatch(/\bsource\s+[^\n]*\.env\b|set\s+-a\b|set\s+-[a-z]*x/)
    expect(code).not.toMatch(/-e\s+["']?DATABASE_URL=|DATABASE_URL="\$/)
    expect(code).toMatch(/--env-file "\$MIGRATION_ENV_FILE"/)
    expect(code).toMatch(/write_env_file_var "\$MIGRATION_ENV_FILE" "\$SERVER_ENV_FILE" DATABASE_URL/)
    expect(code).not.toMatch(/fan-?out|pgSchema|vardiya|archive|identity|seed|provision/i)
    expect(code).not.toMatch(/isSystemAdmin|PLATFORM_ROOT|TENANT_ADMIN|access[_-]?token|Authorization/i)
  })

  it('cannot continue to deploy when the migration fails or is skipped', () => {
    expect(deploy).toMatch(/needs: \[docker-build, scan, migrate\]/)
    for (const job of [migrate, deploy]) {
      expect(codeOf(job)).not.toMatch(/continue-on-error|always\(\)|failure\(\)|cancelled\(\)/)
    }
    expect(deploy).toMatch(/if: github\.event_name == 'push'/)
  })
})
