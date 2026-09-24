import { assertTimeZone, isCatalogId } from '../catalog/catalog-rules'
import type { CatalogService, QueryProfile } from '../catalog/catalog.service'
import { ScadaAdapterError, SCADA_QUERY_ACTION, SCADA_QUERY_ENTITY_TYPE } from '../adapter/scada-adapter.errors'
import type { ScadaActor, ScadaOrchestratedReadPort, ScadaQueryAuditEntry, ScadaQueryAuditPort, ScadaReadOutcome, ScadaReadScope } from '../adapter/scada-readonly.port'
import {
  SCADA_INTERVALS,
  SCADA_INTERVAL_VALUE_TYPE_COMPATIBILITY,
  SCADA_MULTI_SOURCE_MODES,
  SCADA_VALUE_TYPES,
  type ScadaAnalysisQuery,
  type ScadaDstResolution,
  type ScadaMultiSourceMode,
  type ScadaMultiSourceResult,
  type ScadaQueryWindowConfig,
  type ScadaRawDataQuality,
  type ScadaRawRecord,
  type ScadaRawTimeSeriesResult,
  type ScadaSourceReport,
} from './scada-analysis-query.contract'
import { MULTI_SOURCE_BLOCKED_REASON, ScadaQueryError, type ScadaQueryErrorCode } from './scada-query.errors'
import { ambiguousCandidates, buildWindow, gapUncertainRange, isValidBuffer, localToUtc, parseSourceDate, parseSourceDateTime, parseSourceTime, type DstResolution } from './scada-time-window.service'
import { localDateTimeString } from '../time/scada-source-time'

export interface ScadaAnalysisQueryServiceDeps {
  catalog: Pick<CatalogService, 'evaluateQueryAccess'>
  /** Read WITHOUT audit: this service is the single audit boundary (Q-W526), so there is exactly one record per source. */
  adapter: ScadaOrchestratedReadPort
  /** The shared SCADA_QUERY_* audit port. Audit failure is fail-closed for a success; a rejection stays a rejection. */
  audit: ScadaQueryAuditPort
  /** Server-side correlation id (one per call); a client value can never reach the audit. */
  correlationId: () => string
  nowMs: () => number
  /** Q-W521 (open): no default. Needed only for INDEX (Q-W529). */
  windowConfig: () => ScadaQueryWindowConfig
  /**
   * OPTIONAL source-provided fold/offset information for repeated wall times (0 = first pass, 1 = second pass). Without it
   * a repeated wall time stays UNRESOLVED — the service never places it at a guessed instant (TASK-027.67-R1).
   */
  foldOf?: (row: Record<string, unknown>) => 0 | 1 | undefined
}

const QUERY_KEYS = ['catalogId', 'table', 'columns', 'valueType', 'dateColumn', 'timeColumn', 'startAt', 'endAt', 'interval', 'tenantScope', 'signal']
const SCOPE_KEYS = ['tenantId', 'customerRootTenantId', 'dataScopeTenantIds']

/** Catalog denial reason → static error, in the documented validation order (first match wins). */
const REASON_PRIORITY: ReadonlyArray<[string, ScadaQueryErrorCode]> = [
  ['NOT_FOUND', 'SOURCE_NOT_FOUND'],
  ['OUT_OF_SCOPE', 'SOURCE_NOT_FOUND'],
  ['BLOCKED', 'SOURCE_BLOCKED'],
  ['NOT_VERIFIED', 'SOURCE_NOT_VERIFIED'],
  ['SCHEMA_UNDEFINED', 'SOURCE_NOT_VERIFIED'],
  ['MAPPING_UNRESOLVED', 'SOURCE_MAPPING_UNRESOLVED'],
  ['TENANT_NOT_ACCESSIBLE', 'TENANT_SCOPE_DENIED'],
  ['TIMEZONE_UNDEFINED', 'SOURCE_TIMEZONE_REQUIRED'],
  ['LIMIT_PROFILE_INCOMPLETE', 'SOURCE_LIMIT_PROFILE_REQUIRED'],
  ['TABLE_UNKNOWN', 'TABLE_NOT_ALLOWED'],
  ['COLUMN_UNKNOWN', 'COLUMN_NOT_ALLOWED'],
  ['COLUMN_NOT_VERIFIED', 'COLUMN_NOT_ALLOWED'],
]

/** Adapter error code → static query error. Anything not listed collapses to SCADA_ADAPTER_FAILED. */
const ADAPTER_CODE_MAP: Readonly<Record<string, ScadaQueryErrorCode>> = {
  INVALID_CATALOG_ID: 'INVALID_CATALOG_ID',
  SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
  NOT_FOUND: 'SOURCE_NOT_FOUND',
  BLOCKED: 'SOURCE_BLOCKED',
  NOT_VERIFIED: 'SOURCE_NOT_VERIFIED',
  MAPPING_UNRESOLVED: 'SOURCE_MAPPING_UNRESOLVED',
  TIMEZONE_UNDEFINED: 'SOURCE_TIMEZONE_REQUIRED',
  LIMIT_PROFILE_INCOMPLETE: 'SOURCE_LIMIT_PROFILE_REQUIRED',
  TABLE_UNKNOWN: 'TABLE_NOT_ALLOWED',
  COLUMN_UNKNOWN: 'COLUMN_NOT_ALLOWED',
  COLUMN_NOT_VERIFIED: 'COLUMN_NOT_ALLOWED',
  TIME_RANGE_INVALID: 'TIME_RANGE_INVALID',
  TIME_RANGE_EXCEEDED: 'TIME_RANGE_LIMIT_EXCEEDED',
}

const fail = (code: ScadaQueryErrorCode): never => {
  throw new ScadaQueryError(code)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/** A validated, detached copy of the request (the caller's object is never touched). */
interface CleanQuery {
  catalogId: string
  table: string
  columns: string[]
  valueType: ScadaAnalysisQuery['valueType']
  dateColumn: string
  timeColumn: string
  startAt: Date
  endAt: Date
  interval: ScadaAnalysisQuery['interval']
  tenantScope: ScadaReadScope
  signal?: AbortSignal
}

interface Prepared {
  profile: QueryProfile
  window: ReturnType<typeof buildWindow>
  adapterColumns: string[]
}

interface Fetched {
  rows: Record<string, unknown>[]
  rowCount: number
  columnCount: number
}

/** Who/what a record belongs to; tolerant: a malformed request still gets an audit record (null = unreadable). */
interface AuditContext {
  actorId: string
  tenantId: string | null
  customerRootTenantId: string | null
  entityId: string | null
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Analysis query service (TASK-027.65): validates the request against the catalog and the resolved scope BEFORE
 * any adapter call, then turns the adapter's rows into a normalised raw time series in UTC. It computes no
 * delta, no aggregation, no roll-over handling and never clamps a negative value.
 *
 * AUDIT (Q-W526): this service is the ONE audit boundary. Every outcome — including every rejection that never
 * reaches the adapter — produces exactly one SCADA_QUERY_* record per source through the shared audit port; the
 * adapter is used through `readUnaudited`, so there are no double records. A success is returned only after its
 * record is durable. No new action code, no analysis rows in the record, no separate table.
 */
export class ScadaAnalysisQueryService {
  constructor(private readonly deps: ScadaAnalysisQueryServiceDeps) {}

  async run(actor: ScadaActor, query: ScadaAnalysisQuery): Promise<ScadaRawTimeSeriesResult> {
    const correlationId = this.deps.correlationId()
    const started = this.deps.nowMs()
    const ctx = this.contextOf(actor, query)
    let fetched: Fetched | null = null
    try {
      const clean = this.validateShape(query)
      const prepared = await this.prepare(clean)
      fetched = await this.fetch(actor, clean, prepared)
      const result = this.finish(clean, prepared, fetched.rows)
      await this.auditSuccess(ctx, correlationId, fetched, this.deps.nowMs() - started)
      return result
    } catch (error) {
      const e = this.asQueryError(error)
      await this.auditRejection(ctx, correlationId, e, this.deps.nowMs() - started) // best effort; an audit failure is itself recorded as a FAILED outcome with reason AUDIT_FAILED
      throw e
    }
  }

  /**
   * Several sources, EACH read by its own adapter call and audited as its own record; results merge deterministically.
   *  - EXPLICIT: one rejected/failed source blocks the whole request; nothing is returned (Q-W528).
   *  - ROOT_AGGREGATION: every source is reported with its own status; a denied/unresolved source yields no data.
   */
  async runMany(
    actor: ScadaActor,
    tenantScope: ScadaReadScope,
    queries: ReadonlyArray<Omit<ScadaAnalysisQuery, 'tenantScope' | 'signal'>>,
    options: { mode: ScadaMultiSourceMode; signal?: AbortSignal },
  ): Promise<ScadaMultiSourceResult> {
    const correlationId = this.deps.correlationId()
    const started = this.deps.nowMs()
    const elapsed = () => this.deps.nowMs() - started
    const rawList = Array.isArray(queries) ? queries : []
    const full = rawList.map(q => ({ ...(isPlainObject(q) ? q : {}), tenantScope, ...(options?.signal ? { signal: options.signal } : {}) }) as ScadaAnalysisQuery)
    const contexts = (full.length > 0 ? full : [{ tenantScope } as ScadaAnalysisQuery]).map(q => this.contextOf(actor, q))

    // ---- shape phase: a malformed multi-source request is blocked as a whole, every source is audited
    let cleans: CleanQuery[] = []
    let shapeError: ScadaQueryError | null = null
    const perQueryError: Array<ScadaQueryError | null> = []
    if (!isPlainObject(options) || !SCADA_MULTI_SOURCE_MODES.includes(options.mode) || full.length === 0) {
      shapeError = new ScadaQueryError('INVALID_REQUEST')
    } else {
      for (const q of full) {
        try {
          cleans.push(this.validateShape(q))
          perQueryError.push(null)
        } catch (error) {
          const e = this.asQueryError(error)
          perQueryError.push(e)
          shapeError ??= e
        }
      }
      if (!shapeError) {
        const first = cleans[0]!
        if (cleans.some(c => c.interval !== first.interval || c.valueType !== first.valueType) || new Set(cleans.map(c => c.catalogId)).size !== cleans.length) {
          shapeError = new ScadaQueryError('INVALID_REQUEST')
        }
      }
    }
    if (shapeError) {
      await this.auditBlocked(contexts, correlationId, elapsed(), perQueryError, shapeError)
      throw shapeError
    }

    const mode = options.mode
    const ordered = cleans
      .map((clean, index) => ({ clean, ctx: contexts[index]! }))
      .sort((a, b) => cmp(a.clean.catalogId, b.clean.catalogId))
    const first = ordered[0]!.clean

    if (mode === 'EXPLICIT') return this.explicit(actor, ordered, first, correlationId, elapsed)
    return this.rootAggregation(actor, ordered, first, correlationId, options.signal)
  }

  // ------------------------------------------------------------------ multi-source modes

  private async explicit(
    actor: ScadaActor,
    ordered: Array<{ clean: CleanQuery; ctx: AuditContext }>,
    first: CleanQuery,
    correlationId: string,
    elapsed: () => number,
  ): Promise<ScadaMultiSourceResult> {
    const blockedFor = (error: ScadaQueryError) => new ScadaQueryError(error.code, { outcome: 'DENIED', auditReason: MULTI_SOURCE_BLOCKED_REASON })
    const rejectAll = async (errors: Array<ScadaQueryError | null>, cause: ScadaQueryError): Promise<never> => {
      for (let i = 0; i < ordered.length; i += 1) await this.auditRejection(ordered[i]!.ctx, correlationId, errors[i] ?? blockedFor(cause), elapsed())
      throw cause
    }

    // 1) prepare EVERY source first: nothing is read while any source would be rejected (all rejections are audited)
    const prepared: Prepared[] = []
    const errors: Array<ScadaQueryError | null> = []
    for (const item of ordered) {
      try {
        prepared.push(await this.prepare(item.clean))
        errors.push(null)
      } catch (error) {
        errors.push(this.asQueryError(error))
      }
    }
    const firstRejection = errors.find((e): e is ScadaQueryError => e !== null)
    if (firstRejection) return rejectAll(errors, firstRejection)

    // 2) read each source with its own adapter call; the first failure blocks the whole request
    const done: Array<{ item: (typeof ordered)[number]; fetched: Fetched; records: ScadaRawRecord[] }> = []
    for (let i = 0; i < ordered.length; i += 1) {
      const item = ordered[i]!
      try {
        const fetched = await this.fetch(actor, item.clean, prepared[i]!)
        done.push({ item, fetched, records: this.finish(item.clean, prepared[i]!, fetched.rows).records })
      } catch (error) {
        const e = this.asQueryError(error)
        const perSource = ordered.map((_, j) => (j === i ? e : null))
        return rejectAll(perSource, e)
      }
    }
    for (const d of done) await this.auditSuccess(d.item.ctx, correlationId, d.fetched, elapsed())
    const records = done.flatMap(d => d.records)
    this.sortMerged(records)
    return {
      mode: 'EXPLICIT',
      interval: first.interval,
      valueType: first.valueType,
      complete: true,
      records,
      sources: done.map(d => ({ catalogId: d.item.clean.catalogId, status: 'READ' as const, code: null, rowCount: d.records.length })),
    }
  }

  private async rootAggregation(
    actor: ScadaActor,
    ordered: Array<{ clean: CleanQuery; ctx: AuditContext }>,
    first: CleanQuery,
    correlationId: string,
    signal?: AbortSignal,
  ): Promise<ScadaMultiSourceResult> {
    const records: ScadaRawRecord[] = []
    const sources: ScadaSourceReport[] = []
    for (const item of ordered) {
      const started = this.deps.nowMs()
      let report: ScadaSourceReport
      try {
        if (signal?.aborted) fail('SCADA_QUERY_CANCELLED')
        const prepared = await this.prepare(item.clean)
        const fetched = await this.fetch(actor, item.clean, prepared)
        const result = this.finish(item.clean, prepared, fetched.rows)
        try {
          await this.auditSuccess(item.ctx, correlationId, fetched, this.deps.nowMs() - started)
        } catch (auditError) {
          throw this.asQueryError(auditError) // AUDIT_FAILED: this source's data is dropped, its status says so
        }
        records.push(...result.records)
        report = { catalogId: item.clean.catalogId, status: 'READ', code: null, rowCount: result.records.length }
      } catch (error) {
        const e = this.asQueryError(error)
        await this.auditRejection(item.ctx, correlationId, e, this.deps.nowMs() - started)
        if (e.code === 'SCADA_QUERY_CANCELLED') {
          // the caller cancelled: stop here; the sources not yet read are cancelled too (audited below)
          const rest = ordered.slice(ordered.indexOf(item) + 1)
          for (const r of rest) await this.auditRejection(r.ctx, correlationId, e, this.deps.nowMs() - started)
          throw e
        }
        report = { catalogId: item.clean.catalogId, status: e.outcome === 'DENIED' ? 'EXCLUDED' : 'FAILED', code: e.code, rowCount: 0 }
      }
      sources.push(report)
    }
    this.sortMerged(records)
    return { mode: 'ROOT_AGGREGATION', interval: first.interval, valueType: first.valueType, complete: sources.every(s => s.status === 'READ'), records, sources }
  }

  private sortMerged(records: ScadaRawRecord[]): void {
    records.sort((a, b) => cmp(a.occurredAtUtc ?? `~${a.localWallTime}`, b.occurredAtUtc ?? `~${b.localWallTime}`) || cmp(a.sourceCatalogId, b.sourceCatalogId) || cmp(a.seriesKey, b.seriesKey) || cmp(a.recordId, b.recordId))
  }

  // ------------------------------------------------------------------ audit boundary

  private contextOf(actor: ScadaActor, query: unknown): AuditContext {
    const q = isPlainObject(query) ? query : {}
    const scope = isPlainObject(q['tenantScope']) ? (q['tenantScope'] as Record<string, unknown>) : {}
    return {
      actorId: actor.id,
      tenantId: typeof scope['tenantId'] === 'string' ? scope['tenantId'] : null,
      customerRootTenantId: typeof scope['customerRootTenantId'] === 'string' ? scope['customerRootTenantId'] : null,
      // audited only when a well-formed UUID; anything else is never written (entityId = null)
      entityId: isCatalogId(q['catalogId']) ? (q['catalogId'] as string) : null,
    }
  }

  private entry(ctx: AuditContext, correlationId: string, action: ScadaQueryAuditEntry['actionCode'], reasonCode: string, fetched: Fetched | null, limitReason: string | null, durationMs: number): ScadaQueryAuditEntry {
    return {
      actionCode: action,
      entityType: SCADA_QUERY_ENTITY_TYPE,
      entityId: ctx.entityId,
      actorId: ctx.actorId,
      tenantId: ctx.tenantId,
      customerRootTenantId: ctx.customerRootTenantId,
      reasonCode,
      rowCount: fetched?.rowCount ?? null,
      columnCount: fetched?.columnCount ?? null,
      durationMs,
      limitReason,
      correlationId,
    }
  }

  /** Fail-closed: the caller only gets its data if this resolves. */
  private async auditSuccess(ctx: AuditContext, correlationId: string, fetched: Fetched, durationMs: number): Promise<void> {
    try {
      await this.deps.audit.record(this.entry(ctx, correlationId, SCADA_QUERY_ACTION.SUCCEEDED, 'OK', fetched, null, durationMs))
    } catch {
      throw new ScadaQueryError('AUDIT_FAILED')
    }
  }

  /** A rejection stays a rejection even if its own audit record cannot be written. */
  private async auditRejection(ctx: AuditContext, correlationId: string, error: ScadaQueryError, durationMs: number): Promise<void> {
    const action = error.outcome === 'DENIED' ? SCADA_QUERY_ACTION.DENIED : SCADA_QUERY_ACTION.FAILED
    try {
      await this.deps.audit.record(this.entry(ctx, correlationId, action, error.auditReason, null, error.limitReason, durationMs))
    } catch {
      // nothing more to do: the request is already rejected
    }
  }

  /** Blocks a malformed multi-source request: invalid sources carry their own code, the others the blocked reason. */
  private async auditBlocked(contexts: AuditContext[], correlationId: string, durationMs: number, perQuery: Array<ScadaQueryError | null>, general: ScadaQueryError): Promise<void> {
    const blocked = new ScadaQueryError(general.code, { outcome: 'DENIED', auditReason: MULTI_SOURCE_BLOCKED_REASON })
    for (let i = 0; i < contexts.length; i += 1) {
      await this.auditRejection(contexts[i]!, correlationId, perQuery[i] ?? (perQuery.length === 0 ? general : blocked), durationMs)
    }
  }

  private asQueryError(error: unknown): ScadaQueryError {
    if (error instanceof ScadaQueryError) return error
    if (error instanceof ScadaAdapterError) return this.fromAdapter(error.code, error.outcome, error.limitReason)
    return new ScadaQueryError('SCADA_ADAPTER_FAILED')
  }

  private fromAdapter(code: string, outcome: 'DENIED' | 'FAILED' | 'CANCELLED', limitReason: string | null): ScadaQueryError {
    if (outcome === 'CANCELLED') return new ScadaQueryError('SCADA_QUERY_CANCELLED')
    // any tenant-rule rejection of the catalog (TENANT_* / *_IS_NOT_A_TENANT) is a scope denial
    if (/^TENANT_|_IS_NOT_A_TENANT$/.test(code)) return new ScadaQueryError('TENANT_SCOPE_DENIED', { outcome, limitReason, auditReason: code })
    const mapped = ADAPTER_CODE_MAP[code] ?? 'SCADA_ADAPTER_FAILED'
    return new ScadaQueryError(mapped, { outcome, limitReason, auditReason: code })
  }

  // ------------------------------------------------------------------ validation

  /** Steps 1–2: request shape and catalog id format. */
  private validateShape(query: ScadaAnalysisQuery): CleanQuery {
    if (!isPlainObject(query)) return fail('INVALID_REQUEST')
    if (Object.keys(query).some(key => !QUERY_KEYS.includes(key))) return fail('INVALID_REQUEST')
    const { catalogId, table, columns, valueType, dateColumn, timeColumn, startAt, endAt, interval, tenantScope, signal } = query as unknown as Record<string, unknown>
    if (typeof catalogId !== 'string') return fail('INVALID_REQUEST')
    if (typeof table !== 'string' || typeof dateColumn !== 'string' || typeof timeColumn !== 'string') return fail('INVALID_REQUEST')
    if (!Array.isArray(columns) || columns.length === 0 || columns.some(c => typeof c !== 'string') || new Set(columns).size !== columns.length) return fail('INVALID_REQUEST')
    if (!SCADA_VALUE_TYPES.includes(valueType as never) || !SCADA_INTERVALS.includes(interval as never)) return fail('INVALID_REQUEST')
    if (!isValidDate(startAt) || !isValidDate(endAt)) return fail('INVALID_REQUEST')
    if (signal !== undefined && !(signal instanceof AbortSignal)) return fail('INVALID_REQUEST')
    if (!isPlainObject(tenantScope) || Object.keys(tenantScope).some(k => !SCOPE_KEYS.includes(k))) return fail('INVALID_REQUEST')
    const scope = tenantScope as Record<string, unknown>
    if (typeof scope['tenantId'] !== 'string' || typeof scope['customerRootTenantId'] !== 'string' || !Array.isArray(scope['dataScopeTenantIds']) || scope['dataScopeTenantIds'].some(t => typeof t !== 'string')) {
      return fail('INVALID_REQUEST')
    }
    if (!isCatalogId(catalogId)) return fail('INVALID_CATALOG_ID')
    return {
      catalogId,
      table,
      columns: [...(columns as string[])],
      valueType: valueType as CleanQuery['valueType'],
      dateColumn,
      timeColumn,
      startAt: new Date((startAt as Date).getTime()),
      endAt: new Date((endAt as Date).getTime()),
      interval: interval as CleanQuery['interval'],
      tenantScope: { tenantId: scope['tenantId'] as string, customerRootTenantId: scope['customerRootTenantId'] as string, dataScopeTenantIds: [...(scope['dataScopeTenantIds'] as string[])] },
      ...(signal ? { signal: signal as AbortSignal } : {}),
    }
  }

  /** Everything up to (not including) the adapter call. Throws a ScadaQueryError; nothing has touched a driver. */
  private async prepare(q: CleanQuery): Promise<Prepared> {
    if (q.signal?.aborted) return fail('SCADA_QUERY_CANCELLED')

    // 3–8 (+9–11): catalog gates, applied in the documented priority
    const adapterColumns = [...new Set([q.dateColumn, q.timeColumn, ...q.columns])]
    const access = await this.deps.catalog.evaluateQueryAccess(q.tenantScope, q.catalogId, { table: q.table, columns: adapterColumns })
    if (!access.ok) {
      const code = REASON_PRIORITY.find(([reason]) => access.reasons.includes(reason))?.[1]
      return fail(code ?? 'SOURCE_NOT_FOUND')
    }
    const profile = access.profile
    this.assertColumns(q, profile)
    try {
      assertTimeZone(profile.sourceTimeZone)
    } catch {
      return fail('SOURCE_TIMEZONE_REQUIRED')
    }

    // 13: range order → Q-W521 buffer (INDEX only, Q-W529) → 14: window limit
    if (q.startAt.getTime() >= q.endAt.getTime()) return fail('TIME_RANGE_INVALID')
    let bufferMs = 0
    if (q.valueType === 'INDEX') {
      const configured = this.deps.windowConfig()?.forwardBufferMs
      if (!isValidBuffer(configured)) return fail('QUERY_WINDOW_CONFIGURATION_REQUIRED')
      bufferMs = configured
    }
    const window = buildWindow(q.startAt, q.endAt, bufferMs)
    if (window.bufferEndAt.getTime() - window.startAt.getTime() > profile.limitProfile.maxRangeMs) return fail('TIME_RANGE_LIMIT_EXCEEDED')

    // 15: interval ↔ value type; 16: tenant scope integrity
    if (!SCADA_INTERVAL_VALUE_TYPE_COMPATIBILITY[q.valueType].includes(q.interval)) return fail('INVALID_REQUEST')
    if (!q.tenantScope.dataScopeTenantIds.includes(q.tenantScope.tenantId)) return fail('TENANT_SCOPE_DENIED')
    return { profile, window, adapterColumns }
  }

  /** Step 17: the ONLY request that reaches the adapter — catalog id, allowlisted names, normalised window, no SQL. */
  private async fetch(actor: ScadaActor, q: CleanQuery, p: Prepared): Promise<Fetched> {
    let outcome: ScadaReadOutcome
    try {
      outcome = await this.deps.adapter.readUnaudited(actor, q.tenantScope, {
        catalogId: q.catalogId,
        table: p.profile.table,
        columns: p.adapterColumns,
        timeRange: { from: new Date(p.window.startAt.getTime()), to: new Date(p.window.bufferEndAt.getTime()) },
        ...(q.signal ? { signal: q.signal } : {}),
      })
    } catch (error) {
      throw this.asQueryError(error)
    }
    if (!outcome.ok) throw this.fromAdapter(outcome.code, outcome.outcome, outcome.limitReason)
    return { rows: outcome.rows, rowCount: outcome.rowCount, columnCount: outcome.columnCount }
  }

  /** Steps 9–12: the request's table/date/time/measurement columns must match the catalog. */
  private assertColumns(q: CleanQuery, profile: QueryProfile): void {
    if (q.table !== profile.table) fail('TABLE_NOT_ALLOWED')
    if (q.dateColumn !== profile.dateColumn || q.timeColumn !== profile.timeColumn) fail('COLUMN_NOT_ALLOWED')
    const measurement = q.columns.filter(c => c !== profile.dateColumn && c !== profile.timeColumn && profile.columnKinds[c] === 'NUMERIC')
    if (measurement.length === 0 || measurement.length !== q.columns.length) fail('COLUMN_NOT_ALLOWED')
  }

  // ------------------------------------------------------------------ normalisation

  private finish(q: CleanQuery, p: Prepared, rows: Record<string, unknown>[]): ScadaRawTimeSeriesResult {
    const records = this.normalise(rows, q, p.profile, p.window)
    return {
      catalogId: q.catalogId,
      interval: q.interval,
      valueType: q.valueType,
      window: { startAtUtc: p.window.startAt.toISOString(), endAtUtc: p.window.endAt.toISOString(), bufferEndAtUtc: p.window.bufferEndAt.toISOString() },
      records,
    }
  }

  private normalise(rows: Record<string, unknown>[], q: CleanQuery, profile: QueryProfile, window: ReturnType<typeof buildWindow>): ScadaRawRecord[] {
    type Item = {
      /** null = unresolved AMBIGUOUS wall time (no true instant) */
      ms: number | null
      sortMs: number
      wall: string
      candidates: string[]
      range: [string, string] | null
      series: string
      index: number
      quality: ScadaRawDataQuality
      rawValue: number | null
      dst: ScadaDstResolution
    }
    const items: Item[] = []
    const startMs = window.startAt.getTime()
    const endMs = window.bufferEndAt.getTime()
    rows.forEach((row, index) => {
      const local = profile.dateColumn === profile.timeColumn ? parseSourceDateTime(row[profile.dateColumn]) : this.combine(row[profile.dateColumn], row[profile.timeColumn])
      if (!local) return fail('SCADA_ADAPTER_FAILED') // malformed source timestamp: fail closed, never guess UTC
      const resolved = localToUtc(local, profile.sourceTimeZone)
      const wall = localDateTimeString(new Date(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond ?? 0)), 'UTC')
      let ms: number | null = resolved.instant.getTime()
      let dst: ScadaDstResolution = resolved.dst
      let candidates: string[] = []
      let range: [string, string] | null = null
      let sortMs = ms
      if (resolved.dst === 'AMBIGUOUS') {
        const pair = ambiguousCandidates(local, profile.sourceTimeZone)!
        const fold = this.deps.foldOf?.(row)
        if (fold === 0 || fold === 1) {
          ms = pair[fold].getTime() // the source itself told which pass this is
          sortMs = ms
          dst = 'AMBIGUOUS_RESOLVED'
        } else {
          ms = null // no fold/offset from the source: NO instant is invented, the two readings are never forced onto one UTC time
          sortMs = pair[0].getTime()
          candidates = pair.map(c => c.toISOString())
        }
      }
      if (resolved.dst === 'GAP') {
        // Q-W529c: a wall time that does not exist has NO instant: neither offset is applied; only the uncertain range is recorded
        const gap = gapUncertainRange(local, profile.sourceTimeZone)!
        ms = null
        sortMs = gap[0].getTime()
        range = [gap[0].toISOString(), gap[1].toISOString()]
      }
      // in the window? an unresolved row is kept if a possible instant (or its uncertain range) touches the window — it blocks the analysis downstream
      const inside = (v: number) => v >= startMs && v < endMs
      const keep = ms !== null ? inside(ms) : range ? Date.parse(range[0]) < endMs && Date.parse(range[1]) >= startMs : candidates.some(c => inside(Date.parse(c)))
      if (!keep) return
      for (const series of q.columns) {
        const { rawValue, quality } = classify(row[series], dst === 'AMBIGUOUS_RESOLVED' ? 'NORMAL' : (dst as DstResolution))
        items.push({ ms, sortMs, wall, candidates, range, series, index, quality, rawValue, dst })
      }
    })
    items.sort((a, b) => a.sortMs - b.sortMs || cmp(a.series, b.series) || a.index - b.index)
    const ordinal = new Map<string, number>()
    return items.map(item => {
      const occurredAtUtc = item.ms === null ? null : new Date(item.ms).toISOString()
      const key = `${occurredAtUtc ?? `LOCAL:${item.wall}`}|${item.series}`
      const n = ordinal.get(key) ?? 0
      ordinal.set(key, n + 1)
      return {
        occurredAtUtc,
        localWallTime: item.wall,
        dstCandidatesUtc: item.candidates,
        dstUncertainRangeUtc: item.range,
        recordId: `${q.catalogId}:${occurredAtUtc ?? `LOCAL:${item.wall}`}:${item.series}:${n}`,
        seriesKey: item.series,
        rawValue: item.rawValue,
        valueType: q.valueType,
        sourceCatalogId: q.catalogId,
        dataQuality: item.quality,
        dstResolution: item.dst,
        isBufferRow: item.ms !== null && item.ms >= window.endAt.getTime(),
      }
    })
  }

  private combine(dateValue: unknown, timeValue: unknown) {
    const date = parseSourceDate(dateValue)
    const time = parseSourceTime(timeValue)
    return date && time ? { ...date, ...time } : null
  }
}

/** Raw value classification. The value itself is preserved untouched (no clamping, no delta). */
function classify(value: unknown, dst: DstResolution): { rawValue: number | null; quality: ScadaRawDataQuality } {
  if (value === null || value === undefined) return { rawValue: null, quality: 'MISSING' }
  let numeric: number | null = null
  if (typeof value === 'number') numeric = value
  else if (typeof value === 'bigint') numeric = Number(value)
  else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) numeric = Number(value.trim())
  if (numeric === null || !Number.isFinite(numeric)) return { rawValue: null, quality: 'INVALID' }
  // provisional DST markers (final data-quality policy: TASK-027.67)
  return { rawValue: numeric, quality: dst === 'NORMAL' ? 'VALID' : dst === 'AMBIGUOUS' ? 'UNVERIFIED' : 'INVALID' }
}
