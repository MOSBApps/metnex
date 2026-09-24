import { CatalogError, isCatalogId } from '../catalog/catalog-rules'
import type { CatalogService, ExecutionProfile } from '../catalog/catalog.service'
import { buildSourceWindow } from '../time/scada-source-time'
import { SCADA_QUERY_ACTION, SCADA_QUERY_ENTITY_TYPE, ScadaAdapterError, type ScadaLimitReason, type ScadaOutcome } from './scada-adapter.errors'
import type {
  ScadaActor,
  ScadaOrchestratedReadPort,
  ScadaQueryAuditEntry,
  ScadaQueryAuditPort,
  ScadaReadOutcome,
  ScadaReadRequest,
  ScadaReadResult,
  ScadaReadScope,
  ScadaReadonlyPort,
} from './scada-readonly.port'
import type { SqlServerDriver } from './sqlserver-driver.port'
import { buildSelectStatement } from './sqlserver-query-builder'

export interface SqlServerReadonlyAdapterDeps {
  catalog: CatalogService
  driver: SqlServerDriver
  audit: ScadaQueryAuditPort
  /** Server-side correlation id (Q-SA07); a client value can never reach the audit. */
  correlationId: () => string
  nowMs: () => number
}

const REQUEST_KEYS = ['catalogId', 'table', 'columns', 'timeRange', 'signal']

interface Failure {
  code: string
  outcome: ScadaOutcome
  limitReason?: ScadaLimitReason
}
class Rejection extends Error {
  constructor(readonly failure: Failure) {
    super(failure.code)
  }
}
const deny = (code: string, limitReason?: ScadaLimitReason) => new Rejection({ code, outcome: 'DENIED', limitReason })

/**
 * Read-only SCADA adapter. It reads only sources the catalog hands out through `getExecutionProfile`
 * (in scope, mapping RESOLVED to a still-active tenant, VERIFIED, time zone + limit profile present,
 * verified table/columns); every other case is rejected BEFORE the driver is touched.
 * The date predicate is a loss-free SOURCE-LOCAL window built from the catalog's time zone (Q-W527): no driver
 * behaviour is assumed and no record on a day boundary can be lost to a UTC/local mismatch.
 * No per-request state is shared: the only instance state is the per-source in-flight counter.
 */
export class SqlServerReadonlyAdapter implements ScadaReadonlyPort, ScadaOrchestratedReadPort {
  private readonly inFlight = new Map<string, number>()

  constructor(private readonly deps: SqlServerReadonlyAdapterDeps) {}

  listSources(scope: ScadaReadScope) {
    return this.deps.catalog.listAccessibleSources(scope)
  }

  /** Audited read (own SCADA_QUERY_* record). Not to be combined with an orchestration boundary that audits. */
  async read(actor: ScadaActor, scope: ScadaReadScope, request: ScadaReadRequest): Promise<ScadaReadResult> {
    const correlationId = this.deps.correlationId()
    const catalogId = request && typeof request === 'object' && isCatalogId(request.catalogId) ? request.catalogId : null
    const outcome = await this.readUnaudited(actor, scope, request)
    if (outcome.ok) {
      const result: ScadaReadResult = { correlationId, catalogId: request.catalogId, columns: [...request.columns], rows: outcome.rows, rowCount: outcome.rowCount, durationMs: outcome.durationMs }
      // The result is only handed out once its audit record is durable (fail-closed, Q-SA).
      try {
        await this.deps.audit.record(this.entry(actor, scope, catalogId, correlationId, SCADA_QUERY_ACTION.SUCCEEDED, 'OK', outcome, null))
      } catch {
        throw new ScadaAdapterError('AUDIT_FAILED', 'FAILED', correlationId)
      }
      return result
    }
    const action = outcome.outcome === 'DENIED' ? SCADA_QUERY_ACTION.DENIED : SCADA_QUERY_ACTION.FAILED
    try {
      await this.deps.audit.record(this.entry(actor, scope, catalogId, correlationId, action, outcome.code, null, outcome.limitReason, outcome.durationMs))
    } catch {
      // already rejected; a failing audit can never turn this into a success
    }
    throw new ScadaAdapterError(outcome.code, outcome.outcome, correlationId, (outcome.limitReason as ScadaLimitReason | null) ?? null)
  }

  /** Same read, no audit side effect: for the orchestration boundary that owns the single audit record. */
  async readUnaudited(actor: ScadaActor, scope: ScadaReadScope, request: ScadaReadRequest): Promise<ScadaReadOutcome> {
    void actor
    const started = this.deps.nowMs()
    let profile: ExecutionProfile | null = null
    let acquired = false
    try {
      this.assertRequestShape(request)
      profile = await this.resolveProfile(scope, request)
      this.assertRequestLimits(profile, request)
      acquired = this.acquire(profile)
      const rows = await this.runDriver(profile, request)
      if (rows.length > profile.limitProfile.maxRows) throw deny('ROW_LIMIT_EXCEEDED', 'ROW_LIMIT')
      const projected = rows.map(row => Object.fromEntries(request.columns.map(column => [column, row[column] ?? null])))
      if (Buffer.byteLength(JSON.stringify(projected), 'utf8') > profile.limitProfile.maxPayloadBytes) throw deny('PAYLOAD_LIMIT_EXCEEDED', 'PAYLOAD_LIMIT')
      return { ok: true, rows: projected, rowCount: projected.length, columnCount: request.columns.length, durationMs: this.deps.nowMs() - started }
    } catch (error) {
      const failure: Failure = error instanceof Rejection ? error.failure : { code: 'INTERNAL_ERROR', outcome: 'FAILED' }
      return { ok: false, code: failure.code, outcome: failure.outcome, limitReason: failure.limitReason ?? null, durationMs: this.deps.nowMs() - started }
    } finally {
      if (acquired && profile) this.release(profile)
    }
  }

  private assertRequestShape(request: ScadaReadRequest): void {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw deny('INVALID_REQUEST')
    if (!isCatalogId(request.catalogId)) throw deny('INVALID_CATALOG_ID')
    if (Object.keys(request).some(key => !REQUEST_KEYS.includes(key))) throw deny('INVALID_REQUEST')
    if (typeof request.table !== 'string') throw deny('INVALID_REQUEST')
    if (!Array.isArray(request.columns) || request.columns.length === 0 || request.columns.some(c => typeof c !== 'string') || new Set(request.columns).size !== request.columns.length) {
      throw deny('INVALID_REQUEST')
    }
    const range = request.timeRange
    if (!range || !(range.from instanceof Date) || !(range.to instanceof Date) || Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime())) {
      throw deny('INVALID_REQUEST')
    }
    if (range.from.getTime() >= range.to.getTime()) throw deny('TIME_RANGE_INVALID')
    if (request.signal !== undefined && !(request.signal instanceof AbortSignal)) throw deny('INVALID_REQUEST')
  }

  private async resolveProfile(scope: ScadaReadScope, request: ScadaReadRequest): Promise<ExecutionProfile> {
    try {
      return await this.deps.catalog.getExecutionProfile(scope, request.catalogId, { table: request.table, columns: [...request.columns] })
    } catch (error) {
      // catalog codes are static strings by construction (never driver text, names or values)
      const code = error instanceof CatalogError ? error.code : 'SOURCE_NOT_ACCESSIBLE'
      throw deny(code === 'NOT_FOUND' ? 'SOURCE_NOT_FOUND' : code)
    }
  }

  private assertRequestLimits(profile: ExecutionProfile, request: ScadaReadRequest): void {
    if (request.columns.length > profile.limitProfile.maxColumns) throw deny('COLUMN_LIMIT_EXCEEDED', 'COLUMN_LIMIT')
    if (request.timeRange.to.getTime() - request.timeRange.from.getTime() > profile.limitProfile.maxRangeMs) throw deny('TIME_RANGE_EXCEEDED', 'TIME_RANGE_LIMIT')
  }

  private acquire(profile: ExecutionProfile): boolean {
    const current = this.inFlight.get(profile.catalogId) ?? 0
    if (current >= profile.limitProfile.maxConcurrent) throw deny('CONCURRENCY_LIMIT_EXCEEDED', 'CONCURRENCY_LIMIT')
    this.inFlight.set(profile.catalogId, current + 1)
    return true
  }

  private release(profile: ExecutionProfile): void {
    const next = (this.inFlight.get(profile.catalogId) ?? 1) - 1
    if (next <= 0) this.inFlight.delete(profile.catalogId)
    else this.inFlight.set(profile.catalogId, next)
  }

  private async runDriver(profile: ExecutionProfile, request: ScadaReadRequest): Promise<Record<string, unknown>[]> {
    if (profile.dateColumnKind !== 'DATE' && profile.dateColumnKind !== 'DATETIME') throw deny('DATE_COLUMN_KIND_NOT_SUPPORTED')
    let statement
    try {
      const window = buildSourceWindow(request.timeRange.from, request.timeRange.to, profile.sourceTimeZone, profile.dateColumnKind)
      statement = buildSelectStatement({ ...profile, columns: [...request.columns] }, window)
    } catch {
      throw deny('IDENTIFIER_NOT_ALLOWED')
    }
    const controller = new AbortController()
    let timedOut = false
    let cancelled = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, profile.limitProfile.timeoutMs)
    const onCallerAbort = () => {
      cancelled = true
      controller.abort()
    }
    if (request.signal?.aborted) onCallerAbort()
    request.signal?.addEventListener('abort', onCallerAbort, { once: true })
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true }))
    aborted.catch(() => undefined)
    try {
      if (controller.signal.aborted) throw new Error('ABORTED')
      const outcome = await Promise.race([this.deps.driver.run(statement, controller.signal), aborted])
      return outcome.rows
    } catch {
      controller.abort() // release the driver request/connection on every failure path
      if (cancelled) throw new Rejection({ code: 'CANCELLED', outcome: 'CANCELLED' })
      if (timedOut) throw new Rejection({ code: 'TIMEOUT', outcome: 'FAILED', limitReason: 'TIMEOUT' })
      throw new Rejection({ code: 'SOURCE_UNAVAILABLE', outcome: 'FAILED' })
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', onCallerAbort)
    }
  }

  private entry(
    actor: ScadaActor,
    scope: ScadaReadScope,
    catalogId: string | null,
    correlationId: string,
    actionCode: ScadaQueryAuditEntry['actionCode'],
    reasonCode: string,
    counts: { rowCount: number; columnCount: number } | null,
    limitReason: string | null,
    durationMs?: number,
  ): ScadaQueryAuditEntry {
    return {
      actionCode,
      entityType: SCADA_QUERY_ENTITY_TYPE,
      entityId: catalogId,
      actorId: actor.id,
      tenantId: scope.tenantId,
      customerRootTenantId: scope.customerRootTenantId,
      reasonCode,
      rowCount: counts?.rowCount ?? null,
      columnCount: counts?.columnCount ?? null,
      durationMs: durationMs ?? (counts as { durationMs?: number } | null)?.durationMs ?? 0,
      limitReason,
      correlationId,
    }
  }
}
