import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { join } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireDatabaseUrl } from './db/database-url'

export const MIGRATIONS_FOLDER = join(__dirname, '..', 'drizzle', 'migrations')

const LOCK_NAME = 'metnex:control-plane-migration'
const CONNECTION_TIMEOUT_MS = 10_000
const MAX_MESSAGE_LENGTH = 500

// Error text may echo connection details; scrub every part of the URL before it reaches a log.
function redact(message: string, url: string): string {
  let out = message.split(url).join('[redacted]')
  try {
    const parsed = new URL(url)
    const parts = [parsed.password, parsed.username, parsed.hostname]
    for (const part of [...parts, ...parts.map(part => decodeURIComponent(part))]) {
      if (part) out = out.split(part).join('[redacted]')
    }
  } catch {
    // the URL was validated before use; nothing more to scrub
  }
  return out
}

function describeError(error: unknown, url: string): string {
  if (!(error instanceof Error)) return 'unknown error'
  const code = (error as { code?: unknown }).code
  const suffix = typeof code === 'string' ? ` [${code}]` : ''
  return `${error.name}${suffix}: ${redact(error.message, url).slice(0, MAX_MESSAGE_LENGTH)}`
}

/** Applies pending public/control-plane migrations from `drizzle/migrations`. Returns the process exit code. */
export async function runControlPlaneMigrations(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let url: string
  try {
    url = requireDatabaseUrl(env)
  } catch (error) {
    console.error(`control-plane migration aborted: ${(error as Error).message}`)
    return 1
  }

  let pool: Pool | undefined
  let lockClient: PoolClient | undefined
  try {
    pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS })
    lockClient = await pool.connect()
    const lock = await lockClient.query('select pg_try_advisory_lock(hashtext($1)) as locked', [LOCK_NAME])
    if (!lock.rows[0]?.locked) {
      console.error('control-plane migration aborted: another migration is already running')
      return 1
    }
    console.log('control-plane migration: applying pending migrations')
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
    console.log('control-plane migration: complete')
    return 0
  } catch (error) {
    console.error(`control-plane migration failed: ${describeError(error, url)}`)
    return 1
  } finally {
    if (lockClient) {
      try {
        await lockClient.query('select pg_advisory_unlock(hashtext($1))', [LOCK_NAME])
      } catch {
        // the lock disappears with the session anyway
      }
      lockClient.release()
    }
    if (pool) await pool.end().catch(() => undefined)
  }
}

if (require.main === module) {
  const fail = () => {
    console.error('control-plane migration failed: unexpected error')
    process.exit(1)
  }
  process.on('uncaughtException', fail)
  process.on('unhandledRejection', fail)
  runControlPlaneMigrations().then(code => process.exit(code), fail)
}
