import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requireDatabaseUrl } from './database-url'

/**
 * Connection-security contract (TASK-027.29). No test here opens a database connection: URLs are
 * dummy values that are either syntactically rejected before any connect, or fed to mocks.
 * Dummy "secret" markers are used only to prove they never appear in error output.
 */
const API_ROOT = join(__dirname, '..', '..')
const REPO_ROOT = join(API_ROOT, '..', '..')
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8')

const CREDENTIAL_URL = /postgres(?:ql)?:\/\/[^\s'"`$@/]+:[^\s'"`$@/]+@/i

describe('requireDatabaseUrl', () => {
  it('returns a valid postgres URL unchanged', () => {
    const url = 'postgresql://user:pw@127.0.0.1:5432/db'
    expect(requireDatabaseUrl({ DATABASE_URL: url } as NodeJS.ProcessEnv)).toBe(url)
  })

  it.each([[undefined], [''], ['   ']])('fails fast when DATABASE_URL is %p', value => {
    expect(() => requireDatabaseUrl({ DATABASE_URL: value } as NodeJS.ProcessEnv)).toThrow('DATABASE_URL is required')
  })

  it('rejects a malformed or non-postgres URL without echoing it', () => {
    const marker = 'TopSecretMarker123'
    for (const bad of [`mysql://user:${marker}@host/db`, `not a url ${marker}`]) {
      let message = ''
      try {
        requireDatabaseUrl({ DATABASE_URL: bad } as NodeJS.ProcessEnv)
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toBe('DATABASE_URL is invalid')
      expect(message).not.toContain(marker)
    }
  })
})

describe('DbService', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('pg')
    jest.dontMock('drizzle-orm/node-postgres')
    delete process.env.DATABASE_URL
  })

  function loadDbService(poolCtor: jest.Mock) {
    jest.doMock('pg', () => ({ Pool: poolCtor }))
    jest.doMock('drizzle-orm/node-postgres', () => ({ drizzle: jest.fn(() => ({})) }))
    return require('./db.service') as typeof import('./db.service')
  }

  it('does not create a pool (no silent pg/libpq default) when DATABASE_URL is missing', () => {
    const Pool = jest.fn()
    delete process.env.DATABASE_URL
    const { DbService } = loadDbService(Pool)
    expect(() => new DbService()).toThrow('DATABASE_URL is required')
    expect(Pool).not.toHaveBeenCalled()
  })

  it('creates the pool from the explicit DATABASE_URL only', () => {
    const url = 'postgresql://user:pw@127.0.0.1:5432/db'
    const Pool = jest.fn(() => ({ query: jest.fn(), end: jest.fn() }))
    process.env.DATABASE_URL = url
    const { DbService } = loadDbService(Pool)
    new DbService()
    expect(Pool).toHaveBeenCalledWith({ connectionString: url })
  })

  it('reads the connection only through requireDatabaseUrl', () => {
    const source = read(API_ROOT, 'src', 'db', 'db.service.ts')
    expect(source).toContain('requireDatabaseUrl()')
    expect(source).not.toMatch(/connectionString:\s*process\.env/)
  })
})

describe('scripts/check-db.js', () => {
  const { resolveDatabaseUrl, maskUrl } = require('../../scripts/check-db.js') as {
    resolveDatabaseUrl: (env?: NodeJS.ProcessEnv) => string
    maskUrl: (url: string) => string
  }

  it('accepts a valid URL and requires one', () => {
    const url = 'postgresql://user:pw@127.0.0.1:5432/db'
    expect(resolveDatabaseUrl({ DATABASE_URL: url } as NodeJS.ProcessEnv)).toBe(url)
    expect(() => resolveDatabaseUrl({} as NodeJS.ProcessEnv)).toThrow('DATABASE_URL is required')
    expect(() => resolveDatabaseUrl({ DATABASE_URL: 'mysql://x' } as NodeJS.ProcessEnv)).toThrow('DATABASE_URL is invalid')
  })

  it('keeps masking the password in connection-failure output', () => {
    expect(maskUrl('postgresql://user:TopSecretMarker123@127.0.0.1:5432/db')).not.toContain('TopSecretMarker123')
  })

  it('exits non-zero with a safe message when DATABASE_URL is missing (no connection attempted)', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DOTENV_CONFIG_PATH: join(tmpdir(), 'metnex-no-such-dir', '.env') }
    delete env.DATABASE_URL
    const result = spawnSync('node', [join(API_ROOT, 'scripts', 'check-db.js')], { env, encoding: 'utf8', cwd: API_ROOT })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL is required')
  })

  it('never prints the value of an invalid DATABASE_URL', () => {
    const marker = 'TopSecretMarker123'
    const env = { ...process.env, DATABASE_URL: `mysql://user:${marker}@127.0.0.1:1/db`, DOTENV_CONFIG_PATH: join(tmpdir(), 'metnex-no-such-dir', '.env') }
    const result = spawnSync('node', [join(API_ROOT, 'scripts', 'check-db.js')], { env, encoding: 'utf8', cwd: API_ROOT })
    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).not.toContain(marker)
  })
})

describe('no hard-coded connection fallback in source', () => {
  const files: Array<[string, string]> = [
    ['drizzle.config.ts', join(API_ROOT, 'drizzle.config.ts')],
    ['scripts/check-db.js', join(API_ROOT, 'scripts', 'check-db.js')],
    ['src/db/db.service.ts', join(API_ROOT, 'src', 'db', 'db.service.ts')],
    ['src/db/database-url.ts', join(API_ROOT, 'src', 'db', 'database-url.ts')],
  ]

  it.each(files)('%s contains no credentialed connection string and no default URL', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).not.toMatch(CREDENTIAL_URL)
    expect(source).not.toMatch(/defaultDbUrl|default_db_url/i)
    // An empty-string default (env.DATABASE_URL || '') only feeds the required-check; any other default is a fallback.
    expect(source).not.toMatch(/DATABASE_URL\s*(?:\|\||\?\?)\s*(?!(?:''|""))\S/)
  })

  it('drizzle.config.ts takes its URL from requireDatabaseUrl()', () => {
    expect(read(API_ROOT, 'drizzle.config.ts')).toContain('requireDatabaseUrl()')
  })
})

describe('.github/workflows/pipeline.yml secret handling', () => {
  const pipeline = read(REPO_ROOT, '.github', 'workflows', 'pipeline.yml')
  const code = pipeline
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')

  it('does not source a whole .env file or export everything (set -a)', () => {
    expect(code).not.toMatch(/\bsource\s+["']?\/opt\/metnex/)
    expect(code).not.toMatch(/\bsource\s+[^\n]*\.env\b/)
    expect(code).not.toMatch(/set\s+-a\b/)
    expect(code).not.toMatch(/\.\s+["']?\/opt\/metnex/)
  })

  it('never expands DATABASE_URL into a docker command-line argument', () => {
    expect(code).not.toMatch(/-e\s+["']?DATABASE_URL=/)
    expect(code).not.toMatch(/DATABASE_URL="\$\{?DATABASE_URL\}?"/)
    expect(code).not.toMatch(/--env\s+["']?DATABASE_URL=/)
  })

  it('passes the migration secret through a private env-file that is cleaned up', () => {
    expect(code).toMatch(/--env-file\s+"\$MIGRATION_ENV_FILE"/)
    expect(code).toMatch(/umask 077/)
    expect(code).toMatch(/trap 'rm -f "\$MIGRATION_ENV_FILE"' EXIT/)
    expect(code).toMatch(/write_env_file_var "\$MIGRATION_ENV_FILE" "\$SERVER_ENV_FILE" DATABASE_URL/)
    expect(code).toContain('scripts/ci/env-allowlist.sh')
  })

  it('does not enable shell tracing that would print expanded secrets', () => {
    expect(code).not.toMatch(/set\s+-[a-z]*x/)
  })

  it('allowlist covers every variable the deployed compose files interpolate', () => {
    const block = code.slice(code.indexOf('export_env_allowlist'))
    const allowlistText = block.slice(0, block.indexOf('export TAG'))
    for (const file of ['docker-compose.swarm.yml', 'docker-compose.test.yml', 'docker-compose.dev-stack.yml']) {
      const compose = read(REPO_ROOT, 'infra', 'docker', file)
      const names = new Set([...compose.matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)].map(match => match[1] as string))
      names.delete('TAG')
      for (const name of names) {
        expect(allowlistText).toContain(name)
      }
    }
  })
})

describe('.dockerignore', () => {
  const rules = read(REPO_ROOT, '.dockerignore')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))

  it.each(['.env', '.env.*', '*.pem', '*.key', '*.crt', 'backup/', 'node_modules/', '.git/', 'coverage/', 'dist/'])(
    'excludes %s from the build context',
    rule => {
      expect(rules).toContain(rule)
    },
  )

  it('does not exclude build inputs the Dockerfiles need', () => {
    const required = [
      'package.json', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.base.json',
      'apps/api/package.json', 'apps/api/src/main.ts', 'apps/api/drizzle/migrations/0000_initial_baseline.sql',
      'apps/api/drizzle.config.ts', 'apps/web/package.json', 'apps/web/next.config.ts',
      'services/jasper-renderer/pom.xml', 'services/jasper-renderer/src/main/java/Any.java',
    ]
    for (const rule of rules) {
      const literal = rule.replace(/^\*\*\//, '').replace(/\/$/, '')
      for (const path of required) {
        const segments = path.split('/')
        const base = segments[segments.length - 1] as string
        if (literal.includes('*')) {
          const pattern = new RegExp(`^${literal.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
          expect(pattern.test(base)).toBe(false)
        } else {
          expect(segments).not.toContain(literal)
        }
      }
    }
  })
})

describe('scripts/ci/env-allowlist.sh', () => {
  const script = join(REPO_ROOT, 'scripts', 'ci', 'env-allowlist.sh')
  let dir: string
  let envFile: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metnex-env-test-'))
    envFile = join(dir, 'server.env')
    writeFileSync(
      envFile,
      [
        'DATABASE_URL="postgresql://user:AllowedMarker1@db:5432/app"',
        'export JWT_SECRET=AllowedMarker2',
        "REDIS_URL='redis://cache:6379'",
        'UNLISTED_SECRET=UnlistedMarker3',
        'WITH_EQUALS=a=b=c',
        'DUPLICATE=first',
        'DUPLICATE=second',
        '',
      ].join('\n'),
    )
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const bash = (body: string) =>
    spawnSync('bash', ['-c', `source "${script}"; ${body}`], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } })

  it('reads quoted, exported, `=`-containing and duplicated values (last wins)', () => {
    expect(bash(`read_env_var "${envFile}" DATABASE_URL`).stdout).toBe('postgresql://user:AllowedMarker1@db:5432/app')
    expect(bash(`read_env_var "${envFile}" JWT_SECRET`).stdout).toBe('AllowedMarker2')
    expect(bash(`read_env_var "${envFile}" REDIS_URL`).stdout).toBe('redis://cache:6379')
    expect(bash(`read_env_var "${envFile}" WITH_EQUALS`).stdout).toBe('a=b=c')
    expect(bash(`read_env_var "${envFile}" DUPLICATE`).stdout).toBe('second')
  })

  it('exports only the allowlisted names and warns without printing values', () => {
    const result = bash(`export_env_allowlist "${envFile}" DATABASE_URL MISSING_ONE; env`)
    expect(result.stdout).toContain('DATABASE_URL=')
    expect(result.stdout).not.toContain('UNLISTED_SECRET')
    expect(result.stdout).not.toContain('UnlistedMarker3')
    expect(result.stdout).not.toContain('AllowedMarker2')
    expect(result.stderr).toContain('MISSING_ONE')
    expect(result.stderr).not.toContain('AllowedMarker')
  })

  it('fails with a name-only message when a required variable is missing', () => {
    const out = join(dir, 'migration.env')
    const result = bash(`umask 077; write_env_file_var "${out}" "${envFile}" NOT_PRESENT`)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('NOT_PRESENT')
    expect(result.stderr).not.toMatch(/Marker/)
  })

  it('writes only the requested variable into a private (0600) env-file', () => {
    const out = join(dir, 'migration.env')
    const result = bash(`umask 077; : > "${out}"; write_env_file_var "${out}" "${envFile}" DATABASE_URL`)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    const written = readFileSync(out, 'utf8')
    expect(written).toBe('DATABASE_URL=postgresql://user:AllowedMarker1@db:5432/app\n')
    expect(written).not.toContain('UnlistedMarker3')
    expect(statSync(out).mode & 0o777).toBe(0o600)
  })

  it('rejects an invalid variable name instead of using it in a pattern', () => {
    expect(bash(`read_env_var "${envFile}" 'A.*'`).status).toBe(2)
  })
})
