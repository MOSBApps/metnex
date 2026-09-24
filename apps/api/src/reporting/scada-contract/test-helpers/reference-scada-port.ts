/**
 * TASK-027.58 — TEST-ONLY reference model of the SCADA/DMS read-only port contract.
 *
 * NOT a production adapter (the production adapter is `reporting/scada/adapter/`, TASK-027.64). Aligned with
 * DEC-0015 in the TASK-027.64 R1: limit breaches DENIED, audit fail-closed, server-generated correlation id. No SQL Server driver, connection string, secret or real data appears
 * here, nothing in production code imports this file (enforced by `scada-static-security.spec.ts`),
 * and it is never registered as a provider (DEC-0012: no demo/synthetic providers).
 *
 * Why it exists: as of TASK-027.58 the repository has no SQL Server adapter, port, source catalog
 * or allowlist implementation (TASK-027.31–027.36 reused their IDs for other work). The security
 * requirements are nevertheless precise, so they are written as an executable contract
 * (`scada-readonly-port.contract.ts`) and validated against this model. When a real adapter
 * exists, that same contract must be run against it (see the delivery note in
 * `backlog/TASK-027-58-scada-security-performance-tests.md`).
 *
 * Every limit is injected by the caller and there are deliberately NO default numbers — the
 * numeric thresholds are an open product/architecture decision and must not be invented here.
 * The small numbers used in specs are test parameters, not proposed production values.
 */

export interface ScadaAllowlistEntry {
  sourceKey: string
  database: string
  schema: string
  table: string
  timeColumn: string
  allowedColumns: readonly string[]
  permittedFilters: readonly string[]
  /** `null` = mapping unresolved/ambiguous: the source is never readable. */
  ownerTenantId: string | null
  maxTimeRangeMs: number
  maxRows: number
}

export interface ScadaLimits {
  timeoutMs: number
  maxRows: number
  maxColumns: number
  maxPayloadBytes: number
  maxConcurrent: number
  poolSize: number
}

/** Same shape as `TenantScopeResult` — the only place a data scope may come from. */
export interface ScadaTenantScope {
  tenantId: string
  customerRootTenantId: string
  dataScopeTenantIds: readonly string[]
}

export interface ScadaReadRequest {
  sourceKey: string
  columns: readonly string[]
  filters?: Readonly<Record<string, string | number | boolean | Date>>
  timeRange: { from: Date; to: Date }
  /** There is NO client-supplied correlation id (DEC-0015 Q-SA07): the port generates it server-side. */
  signal?: AbortSignal
}

export interface ScadaStatement {
  text: string
  params: Record<string, unknown>
}

/** What a real SQL Server driver wrapper would implement; specs supply a mock. */
export interface ScadaSqlDriver {
  execute(statement: ScadaStatement, signal: AbortSignal): Promise<{ rows: Record<string, unknown>[] }>
}

export type ScadaReasonCode =
  | 'OK'
  | 'INVALID_REQUEST'
  | 'SOURCE_NOT_ALLOWED'
  | 'SOURCE_MAPPING_UNRESOLVED'
  | 'TENANT_SCOPE_DENIED'
  | 'COLUMN_NOT_ALLOWED'
  | 'FILTER_NOT_ALLOWED'
  | 'TIME_RANGE_INVALID'
  | 'TIME_RANGE_EXCEEDED'
  | 'COLUMN_LIMIT_EXCEEDED'
  | 'ROW_LIMIT_EXCEEDED'
  | 'PAYLOAD_LIMIT_EXCEEDED'
  | 'CONCURRENCY_LIMIT'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'SOURCE_UNAVAILABLE'
  | 'AUDIT_FAILED'

const SAFE_MESSAGES: Record<ScadaReasonCode, string> = {
  OK: 'ok',
  INVALID_REQUEST: 'Geçersiz istek',
  SOURCE_NOT_ALLOWED: 'Kaynak erişime açık değil',
  SOURCE_MAPPING_UNRESOLVED: 'Kaynak erişime açık değil',
  TENANT_SCOPE_DENIED: 'Kaynak erişime açık değil',
  COLUMN_NOT_ALLOWED: 'Geçersiz istek',
  FILTER_NOT_ALLOWED: 'Geçersiz istek',
  TIME_RANGE_INVALID: 'Geçersiz istek',
  TIME_RANGE_EXCEEDED: 'İstek sınırı aşıldı',
  COLUMN_LIMIT_EXCEEDED: 'İstek sınırı aşıldı',
  ROW_LIMIT_EXCEEDED: 'İstek sınırı aşıldı',
  PAYLOAD_LIMIT_EXCEEDED: 'İstek sınırı aşıldı',
  CONCURRENCY_LIMIT: 'Kaynak şu anda meşgul',
  TIMEOUT: 'Kaynak zaman aşımına uğradı',
  CANCELLED: 'İstek iptal edildi',
  SOURCE_UNAVAILABLE: 'Kaynak şu anda erişilemez',
  AUDIT_FAILED: 'Kaynak şu anda erişilemez',
}

/** Message and code are static — never derived from a driver/SQL Server error, never `cause`d. */
export class ScadaReadError extends Error {
  constructor(readonly reasonCode: ScadaReasonCode) {
    super(SAFE_MESSAGES[reasonCode])
    this.name = 'ScadaReadError'
  }
}

export type ScadaAuditResult = 'SUCCEEDED' | 'DENIED' | 'FAILED'

export type ScadaLimitReason = 'ROW_LIMIT' | 'PAYLOAD_LIMIT' | 'COLUMN_LIMIT' | 'TIME_RANGE_LIMIT' | 'CONCURRENCY_LIMIT' | 'TIMEOUT'

/**
 * The ONLY fields an audit entry may carry (DEC-0015 Q-SA / TASK-027.64). `catalogId` stands for the
 * catalog UUID (`entityId`); it is `null` when the request named no known source. `actionCode` follows the
 * fixed `SCADA_QUERY_*` set; cancellation is FAILED + reasonCode CANCELLED (Q-W520 — no extra action code).
 */
export interface ScadaAuditEntry {
  actionCode: 'SCADA_QUERY_SUCCEEDED' | 'SCADA_QUERY_DENIED' | 'SCADA_QUERY_FAILED'
  actorId: string
  tenantId: string
  customerRootTenantId: string
  catalogId: string | null
  result: ScadaAuditResult
  reasonCode: ScadaReasonCode
  rowCount: number | null
  columnCount: number | null
  durationMs: number
  limitReason: ScadaLimitReason | null
  correlationId: string
}

/** Limit breaches are DENIED (DEC-0015 D6.1); timeouts/driver errors/cancellation are FAILED. */
const DENIED_REASONS: readonly ScadaReasonCode[] = [
  'INVALID_REQUEST', 'SOURCE_NOT_ALLOWED', 'SOURCE_MAPPING_UNRESOLVED', 'TENANT_SCOPE_DENIED', 'COLUMN_NOT_ALLOWED', 'FILTER_NOT_ALLOWED',
  'TIME_RANGE_INVALID', 'TIME_RANGE_EXCEEDED', 'COLUMN_LIMIT_EXCEEDED', 'ROW_LIMIT_EXCEEDED', 'PAYLOAD_LIMIT_EXCEEDED', 'CONCURRENCY_LIMIT',
]
const LIMIT_REASONS: Partial<Record<ScadaReasonCode, ScadaLimitReason>> = {
  COLUMN_LIMIT_EXCEEDED: 'COLUMN_LIMIT',
  TIME_RANGE_EXCEEDED: 'TIME_RANGE_LIMIT',
  ROW_LIMIT_EXCEEDED: 'ROW_LIMIT',
  PAYLOAD_LIMIT_EXCEEDED: 'PAYLOAD_LIMIT',
  CONCURRENCY_LIMIT: 'CONCURRENCY_LIMIT',
  TIMEOUT: 'TIMEOUT',
}

export type ScadaAuditSink = (entry: ScadaAuditEntry) => Promise<void> | void

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const ALLOWED_REQUEST_KEYS = new Set(['sourceKey', 'columns', 'filters', 'timeRange', 'signal'])

const FORBIDDEN_STATEMENT_TOKENS =
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|EXEC|EXECUTE|MERGE|GRANT|REVOKE|INTO|OPENROWSET|OPENQUERY|XP_CMDSHELL)\b/i

/** Defense in depth: called on every statement right before it reaches the driver. */
export function assertReadOnlyStatement(text: string): void {
  if (!/^\s*SELECT\b/i.test(text) || text.includes(';') || text.includes('--') || text.includes('/*') || FORBIDDEN_STATEMENT_TOKENS.test(text)) {
    throw new ScadaReadError('INVALID_REQUEST')
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export class ReferenceScadaPort {
  private readonly entries = new Map<string, ScadaAllowlistEntry>()
  private inFlight = 0

  constructor(
    allowlist: readonly ScadaAllowlistEntry[],
    private readonly limits: ScadaLimits,
    private readonly driver: ScadaSqlDriver,
    private readonly audit: ScadaAuditSink,
    private readonly newCorrelationId: () => string,
  ) {
    // No default numbers exist: a missing/invalid limit is a construction error, never a fallback.
    for (const key of ['timeoutMs', 'maxRows', 'maxColumns', 'maxPayloadBytes', 'maxConcurrent', 'poolSize'] as const) {
      if (!isPositiveInteger(limits[key])) throw new Error(`Invalid or missing limit: ${key}`)
    }
    if (limits.maxConcurrent > limits.poolSize) throw new Error('maxConcurrent cannot exceed poolSize')

    for (const entry of allowlist) {
      const identifiers = [entry.database, entry.schema, entry.table, entry.timeColumn, ...entry.allowedColumns]
      if (!identifiers.every(id => IDENTIFIER.test(id))) throw new Error('Allowlist contains an unsafe identifier')
      if (!entry.permittedFilters.every(filter => entry.allowedColumns.includes(filter))) {
        throw new Error('Allowlist filter is not an allowed column')
      }
      if (!isPositiveInteger(entry.maxRows) || !isPositiveInteger(entry.maxTimeRangeMs)) throw new Error('Allowlist entry has no limits')
      if (this.entries.has(entry.sourceKey)) throw new Error('Ambiguous allowlist: duplicate source key')
      this.entries.set(entry.sourceKey, entry)
    }
  }

  /** Sources readable from a resolved scope — never lists anything owned outside it. */
  listSources(scope: ScadaTenantScope): string[] {
    return [...this.entries.values()]
      .filter(entry => entry.ownerTenantId !== null && scope.dataScopeTenantIds.includes(entry.ownerTenantId))
      .map(entry => entry.sourceKey)
  }

  async read(actorId: string, scope: ScadaTenantScope, request: ScadaReadRequest): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    const correlationId = this.newCorrelationId()
    const started = Date.now()
    // Set as soon as the source key matches the allowlist, so a denial for a KNOWN source records its key
    // while an unknown (attacker-controlled) key is never recorded.
    const matched: { entry?: ScadaAllowlistEntry } = {}
    const columnCount = Array.isArray(request?.columns) ? request.columns.length : null
    const write = (result: ScadaAuditResult, reasonCode: ScadaReasonCode, rowCount: number | null) =>
      this.writeAudit({
        actionCode: result === 'SUCCEEDED' ? 'SCADA_QUERY_SUCCEEDED' : result === 'DENIED' ? 'SCADA_QUERY_DENIED' : 'SCADA_QUERY_FAILED',
        actorId,
        tenantId: scope.tenantId,
        customerRootTenantId: scope.customerRootTenantId,
        catalogId: matched.entry?.sourceKey ?? null,
        result,
        reasonCode,
        rowCount,
        columnCount,
        durationMs: Date.now() - started,
        limitReason: LIMIT_REASONS[reasonCode] ?? null,
        correlationId,
      })
    let entry: ScadaAllowlistEntry
    let result: { rows: Record<string, unknown>[]; rowCount: number }
    try {
      entry = this.authorize(scope, request, matched)
      const statement = this.buildStatement(entry, request)
      assertReadOnlyStatement(statement.text)
      result = await this.executeGuarded(statement, Math.min(this.limits.maxRows, entry.maxRows), request.signal)
    } catch (error) {
      const reasonCode = error instanceof ScadaReadError ? error.reasonCode : 'SOURCE_UNAVAILABLE'
      // best effort: the read is already rejected, so a failing audit cannot change the outcome
      await write(DENIED_REASONS.includes(reasonCode) ? 'DENIED' : 'FAILED', reasonCode, null).catch(() => undefined)
      throw error instanceof ScadaReadError ? error : new ScadaReadError('SOURCE_UNAVAILABLE')
    }
    // FAIL-CLOSED (DEC-0015 Q-SA05): rows are handed out only after their audit record was written.
    try {
      await write('SUCCEEDED', 'OK', result.rowCount)
    } catch {
      throw new ScadaReadError('AUDIT_FAILED')
    }
    return result
  }

  private authorize(scope: ScadaTenantScope, request: ScadaReadRequest, matched: { entry?: ScadaAllowlistEntry }): ScadaAllowlistEntry {
    if (!request || typeof request !== 'object') throw new ScadaReadError('INVALID_REQUEST')
    // Raw SQL / database / schema / table / tenant / `Sirket` are not request fields at all.
    for (const key of Object.keys(request)) {
      if (!ALLOWED_REQUEST_KEYS.has(key)) throw new ScadaReadError('INVALID_REQUEST')
    }
    if (typeof request.sourceKey !== 'string') throw new ScadaReadError('INVALID_REQUEST')

    const entry = this.entries.get(request.sourceKey)
    if (!entry) throw new ScadaReadError('SOURCE_NOT_ALLOWED')
    matched.entry = entry
    if (entry.ownerTenantId === null) throw new ScadaReadError('SOURCE_MAPPING_UNRESOLVED')
    if (!scope.dataScopeTenantIds.includes(entry.ownerTenantId)) throw new ScadaReadError('TENANT_SCOPE_DENIED')

    const columns = request.columns
    if (!Array.isArray(columns) || columns.length === 0 || new Set(columns).size !== columns.length) throw new ScadaReadError('INVALID_REQUEST')
    if (columns.length > this.limits.maxColumns) throw new ScadaReadError('COLUMN_LIMIT_EXCEEDED')
    if (!columns.every(column => typeof column === 'string' && entry.allowedColumns.includes(column))) throw new ScadaReadError('COLUMN_NOT_ALLOWED')

    for (const [name, value] of Object.entries(request.filters ?? {})) {
      if (!entry.permittedFilters.includes(name)) throw new ScadaReadError('FILTER_NOT_ALLOWED')
      const primitive = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date
      if (!primitive) throw new ScadaReadError('INVALID_REQUEST')
    }

    const { from, to } = request.timeRange ?? {}
    if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new ScadaReadError('TIME_RANGE_INVALID')
    }
    if (to.getTime() - from.getTime() > entry.maxTimeRangeMs) throw new ScadaReadError('TIME_RANGE_EXCEEDED')
    return entry
  }

  /** Identifiers come only from the (validated) allowlist; every value is a bound parameter. */
  private buildStatement(entry: ScadaAllowlistEntry, request: ScadaReadRequest): ScadaStatement {
    const params: Record<string, unknown> = {
      top: Math.min(this.limits.maxRows, entry.maxRows) + 1,
      from: request.timeRange.from,
      to: request.timeRange.to,
    }
    const predicates = [`[${entry.timeColumn}] >= @from`, `[${entry.timeColumn}] < @to`]
    Object.entries(request.filters ?? {}).forEach(([name, value], index) => {
      params[`p${index}`] = value
      predicates.push(`[${name}] = @p${index}`)
    })
    const columns = request.columns.map(column => `[${column}]`).join(', ')
    return {
      text: `SELECT TOP (@top) ${columns} FROM [${entry.database}].[${entry.schema}].[${entry.table}] WHERE ${predicates.join(' AND ')}`,
      params,
    }
  }

  private async executeGuarded(statement: ScadaStatement, rowCap: number, external?: AbortSignal): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    if (external?.aborted) throw new ScadaReadError('CANCELLED')
    if (this.inFlight >= this.limits.maxConcurrent) throw new ScadaReadError('CONCURRENCY_LIMIT')
    this.inFlight += 1

    const controller = new AbortController()
    let timedOut = false
    const onExternalAbort = () => controller.abort()
    external?.addEventListener('abort', onExternalAbort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.limits.timeoutMs)

    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new ScadaReadError(timedOut ? 'TIMEOUT' : 'CANCELLED')), { once: true })
    })

    try {
      // A driver that ignores its signal must still not be able to outlive the deadline.
      const { rows } = await Promise.race([this.driver.execute(statement, controller.signal), aborted])
      if (rows.length > rowCap) throw new ScadaReadError('ROW_LIMIT_EXCEEDED')
      if (Buffer.byteLength(JSON.stringify(rows), 'utf8') > this.limits.maxPayloadBytes) throw new ScadaReadError('PAYLOAD_LIMIT_EXCEEDED')
      return { rows, rowCount: rows.length }
    } catch (error) {
      if (error instanceof ScadaReadError) throw error
      throw new ScadaReadError('SOURCE_UNAVAILABLE') // raw driver text is dropped here — never propagated
    } finally {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
      this.inFlight -= 1
    }
  }

  private async writeAudit(entry: ScadaAuditEntry) {
    // Explicit field-by-field construction (an allowlist), never a spread of request/error data.
    await this.audit({
      actionCode: entry.actionCode,
      actorId: entry.actorId,
      tenantId: entry.tenantId,
      customerRootTenantId: entry.customerRootTenantId,
      catalogId: entry.catalogId,
      result: entry.result,
      reasonCode: entry.reasonCode,
      rowCount: entry.rowCount,
      columnCount: entry.columnCount,
      durationMs: entry.durationMs,
      limitReason: entry.limitReason,
      correlationId: entry.correlationId,
    })
  }
}
