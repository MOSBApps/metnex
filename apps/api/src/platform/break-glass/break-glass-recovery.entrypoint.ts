import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { PlatformAuditService } from '../../audit/platform-audit.service'
import { requireDatabaseUrl } from '../../db/database-url'
import * as schema from '../../db/schema'
import { BREAK_GLASS_ENV } from './break-glass.contract'
import { BreakGlassRecoveryService } from './break-glass-recovery.service'

const CONNECTION_TIMEOUT_MS = 10_000

/**
 * Standalone break-glass recovery entrypoint (TASK-027.47), mirroring `apps/api/src/migrate.ts`: a script run
 * out-of-band by an operator with direct database and environment access — never wired into the running
 * application, never an HTTP route. It never prints the configured token, the supplied password or a hash; on
 * failure it prints only the static reason and the correlating `eventId` (also written to the audit log).
 *
 * Required environment (all three, or the run refuses before touching the database):
 *   DATABASE_URL, BREAK_GLASS_RECOVERY_TOKEN, BREAK_GLASS_TARGET_EMAIL, BREAK_GLASS_NEW_PASSWORD
 * A missing/mismatched token, an already-active system administrator, an unknown or non-system-administrator
 * target, or a policy-violating password all refuse safely — see BreakGlassRecoveryService.
 */
export async function runBreakGlassRecovery(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let url: string
  try {
    url = requireDatabaseUrl(env)
  } catch (error) {
    console.error(`break-glass recovery aborted: ${(error as Error).message}`)
    return 1
  }

  const token = env[BREAK_GLASS_ENV.TOKEN]
  const targetEmail = env[BREAK_GLASS_ENV.TARGET_EMAIL]
  const newPassword = env[BREAK_GLASS_ENV.NEW_PASSWORD]
  if (!token || !targetEmail || !newPassword) {
    console.error(`break-glass recovery aborted: ${BREAK_GLASS_ENV.TOKEN}, ${BREAK_GLASS_ENV.TARGET_EMAIL} and ${BREAK_GLASS_ENV.NEW_PASSWORD} are all required`)
    return 1
  }

  let pool: Pool | undefined
  try {
    pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS })
    const db = drizzle(pool, { schema })
    const service = new BreakGlassRecoveryService(db, new PlatformAuditService(db), env)
    const outcome = await service.recover({ token, targetEmail, newPassword })
    if (!outcome.success) {
      console.error(`break-glass recovery refused: ${outcome.reason} (eventId=${outcome.eventId})`)
      return 1
    }
    console.log(`break-glass recovery: complete (eventId=${outcome.eventId})`)
    return 0
  } catch (error) {
    console.error(`break-glass recovery failed: ${(error as Error).message}`)
    return 1
  } finally {
    if (pool) await pool.end().catch(() => undefined)
  }
}

if (require.main === module) {
  const fail = () => {
    console.error('break-glass recovery failed: unexpected error')
    process.exit(1)
  }
  process.on('uncaughtException', fail)
  process.on('unhandledRejection', fail)
  runBreakGlassRecovery().then(code => process.exit(code), fail)
}
