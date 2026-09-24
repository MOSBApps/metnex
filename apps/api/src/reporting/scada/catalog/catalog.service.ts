import {
  CatalogError,
  assertDeclaredTables,
  assertDisplayName,
  assertLimitProfile,
  assertPhysicalDatabaseName,
  assertTimeZone,
  isCatalogId,
  isLimitProfileComplete,
  isObservedClassCompatible,
} from './catalog-rules'
import type { CatalogAuditPort, CatalogClock, CatalogRepository, CatalogTransaction, CatalogWriteAuthorizer, TenantDirectory } from './catalog.ports'
import type {
  AccessDecision,
  AccessDenialReason,
  CatalogActor,
  CatalogAuditResult,
  CatalogOperation,
  CatalogScope,
  ColumnKind,
  CatalogSource,
  CatalogTable,
  DeclaredTable,
  DefinitionPatch,
  LimitProfile,
  MappingStatus,
  PreflightObservation,
  RegisterSourceInput,
  ScopeStatus,
  TenantMapping,
} from './catalog.types'
import { assertMappableTenant } from './tenant-guards'

export interface CatalogServiceDeps {
  repository: CatalogRepository
  authorizer: CatalogWriteAuthorizer
  audit: CatalogAuditPort
  tenants: TenantDirectory
  clock: CatalogClock
  /** Opaque catalog id generator (UUID). The id is NEVER derived from the physical name. */
  newId: () => string
  /** Server-side correlation id (Q-SA07); client-supplied values do not exist in this API. */
  correlationId: () => string
}

/** What analysis callers may see: no physical database name, no mappings. */
export interface CatalogSourceView {
  id: string
  displayName: string
  sourceTimeZone: string
  limitProfile: LimitProfile
  tables: Array<{ name: string; dateColumn: string; timeColumn: string; columns: Array<{ name: string; kind: string }> }>
}

/**
 * What the analysis query service needs to validate a request and normalise time: NO physical database name,
 * NO schema. Produced only for a source that passed every catalog gate.
 */
export interface QueryProfile {
  catalogId: string
  version: number
  sourceTimeZone: string
  limitProfile: LimitProfile
  table: string
  dateColumn: string
  timeColumn: string
  columnKinds: Readonly<Record<string, ColumnKind>>
}

/** `reasons` are static codes: catalog denial reasons plus the read-time tenant codes. */
export type QueryAccess = { ok: true; profile: QueryProfile } | { ok: false; reasons: string[] }

/** INTERNAL — for the future read-only adapter only; contains the physical database name. */
export interface ExecutionProfile {
  catalogId: string
  version: number
  physicalDatabase: string
  sourceTimeZone: string
  limitProfile: LimitProfile
  schema: string
  table: string
  dateColumn: string
  /** Kind of the date column (DATE / TIME / DATETIME): decides how the source-local query window is built. */
  dateColumnKind: ColumnKind
  timeColumn: string
  columns: string[]
}

export type PreflightOutcome =
  | { status: 'VERIFIED'; source: CatalogSource }
  | { status: 'BLOCKED'; reasonCode: string; source: CatalogSource }
  | { status: 'NOT_APPLIED'; reasonCode: string; source: CatalogSource }

const REGISTER_KEYS = ['displayName', 'physicalDatabase', 'scope', 'tables', 'sourceTimeZone', 'limitProfile']
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,63}$/
const APPROVAL_REF = /^[A-Za-z0-9_-]{1,64}$/

function assertKeys(input: unknown, allowed: readonly string[], code = 'INVALID_INPUT_FIELD'): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CatalogError(code)
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new CatalogError(code)
}

const clone = <T>(value: T): T => structuredClone(value)

function toTables(declared: DeclaredTable[]): CatalogTable[] {
  return declared.map(table => ({
    schema: table.schema ?? null,
    name: table.name,
    dateColumn: table.dateColumn,
    timeColumn: table.timeColumn,
    columns: table.columns.map(column => ({ name: column.name, kind: column.kind, verification: 'UNVERIFIED' as const })),
  }))
}

const unverifiedColumns = (tables: CatalogTable[]): CatalogTable[] =>
  tables.map(table => ({ ...table, columns: table.columns.map(column => ({ ...column, verification: 'UNVERIFIED' as const })) }))

export class CatalogService {
  constructor(private readonly deps: CatalogServiceDeps) {}

  // ---------------------------------------------------------------- writes

  registerSource(actor: CatalogActor, input: RegisterSourceInput): Promise<CatalogSource> {
    return this.run(actor, 'REGISTER', null, async tx => {
      assertKeys(input, REGISTER_KEYS)
      assertDisplayName(input.displayName)
      assertPhysicalDatabaseName(input.physicalDatabase)
      if (input.scope !== 'IN_SCOPE' && input.scope !== 'OUT_OF_SCOPE') throw new CatalogError('INVALID_SCOPE')
      assertDeclaredTables(input.tables)
      if (input.sourceTimeZone != null) assertTimeZone(input.sourceTimeZone)
      if (input.limitProfile != null) assertLimitProfile(input.limitProfile)
      for (const existing of await this.deps.repository.list()) {
        if (existing.physicalDatabase === input.physicalDatabase) throw new CatalogError('DUPLICATE_PHYSICAL_DATABASE')
      }
      const id = this.deps.newId()
      if (!isCatalogId(id)) throw new CatalogError('INVALID_CATALOG_ID')
      if ((await tx.get(id)) !== null) throw new CatalogError('DUPLICATE_CATALOG_ID')
      const now = this.deps.clock.now().toISOString()
      const snapshot: CatalogSource = {
        id,
        version: 1,
        displayName: input.displayName,
        physicalDatabase: input.physicalDatabase,
        scope: input.scope,
        verification: 'UNVERIFIED',
        blockedReason: null,
        sourceTimeZone: input.sourceTimeZone ?? null,
        limitProfile: input.limitProfile ? clone(input.limitProfile) : null,
        tables: toTables(input.tables),
        mappings: [],
        createdAt: now,
        updatedAt: now,
      }
      return { snapshot }
    }).then(result => result.source)
  }

  updateDefinition(actor: CatalogActor, id: string, expectedVersion: number, patch: DefinitionPatch): Promise<CatalogSource> {
    return this.run(actor, 'UPDATE_DEFINITION', id, async (_tx, current) => {
      const source = this.requireCurrent(current, expectedVersion)
      assertKeys(patch, REGISTER_KEYS)
      const next = clone(source)
      let physicalChanged = false
      if (patch.displayName !== undefined) {
        assertDisplayName(patch.displayName)
        next.displayName = patch.displayName
      }
      if (patch.physicalDatabase !== undefined) {
        assertPhysicalDatabaseName(patch.physicalDatabase)
        if (patch.physicalDatabase !== source.physicalDatabase) {
          for (const other of await this.deps.repository.list()) {
            if (other.id !== id && other.physicalDatabase === patch.physicalDatabase) throw new CatalogError('DUPLICATE_PHYSICAL_DATABASE')
          }
          physicalChanged = true
        }
        next.physicalDatabase = patch.physicalDatabase
      }
      if (patch.scope !== undefined) {
        if (patch.scope !== 'IN_SCOPE' && patch.scope !== 'OUT_OF_SCOPE') throw new CatalogError('INVALID_SCOPE')
        next.scope = patch.scope as ScopeStatus
      }
      if (patch.tables !== undefined) {
        assertDeclaredTables(patch.tables)
        next.tables = toTables(patch.tables)
        physicalChanged = true
      }
      if (patch.sourceTimeZone !== undefined) {
        if (patch.sourceTimeZone !== null) assertTimeZone(patch.sourceTimeZone)
        next.sourceTimeZone = patch.sourceTimeZone
      }
      if (patch.limitProfile !== undefined) {
        if (patch.limitProfile !== null) assertLimitProfile(patch.limitProfile)
        next.limitProfile = patch.limitProfile ? clone(patch.limitProfile) : null
      }
      if (physicalChanged) {
        // A verified structure that changed is no longer verified; a BLOCKED source stays BLOCKED until explicitly unblocked.
        next.tables = unverifiedColumns(next.tables)
        if (next.verification === 'VERIFIED') next.verification = 'UNVERIFIED'
      }
      return { snapshot: this.bump(next) }
    }).then(result => result.source)
  }

  /** The ONLY way a source becomes VERIFIED: applying the result of an authorised read-only preflight. */
  applyPreflight(actor: CatalogActor, id: string, expectedVersion: number, observation: PreflightObservation): Promise<PreflightOutcome> {
    return this.run(actor, 'APPLY_PREFLIGHT', id, async (_tx, current) => {
      const source = this.requireCurrent(current, expectedVersion)
      if (source.scope !== 'IN_SCOPE') throw new CatalogError('PREFLIGHT_NOT_ALLOWED_OUT_OF_SCOPE')
      if (source.verification === 'BLOCKED') throw new CatalogError('PREFLIGHT_NOT_ALLOWED_WHILE_BLOCKED')
      if (source.tables.some(table => !table.schema)) {
        // No schema, no verification: the source stays UNVERIFIED (nothing is guessed, `dbo` is never assumed).
        return { snapshot: null, auditResult: 'DENIED' as const, reasonCode: 'PREFLIGHT_SCHEMA_UNDEFINED', outcome: { status: 'NOT_APPLIED', reasonCode: 'PREFLIGHT_SCHEMA_UNDEFINED', source } as PreflightOutcome }
      }
      assertKeys(observation, ['connectionOk', 'databaseExists', 'tables'], 'INVALID_PREFLIGHT_OBSERVATION')
      if (typeof observation.connectionOk !== 'boolean' || typeof observation.databaseExists !== 'boolean' || !Array.isArray(observation.tables)) {
        throw new CatalogError('INVALID_PREFLIGHT_OBSERVATION')
      }
      if (!observation.connectionOk) {
        // Not a definitive result: no state change, no version bump; recorded as a FAILED attempt.
        return { snapshot: null, auditResult: 'FAILED' as const, reasonCode: 'PREFLIGHT_CONNECTION_FAILED', outcome: { status: 'NOT_APPLIED', reasonCode: 'PREFLIGHT_CONNECTION_FAILED', source } as PreflightOutcome }
      }
      const mismatch = this.findMismatch(source, observation)
      const next = clone(source)
      if (mismatch) {
        next.verification = 'BLOCKED'
        next.blockedReason = mismatch
        next.tables = unverifiedColumns(next.tables)
        const snapshot = this.bump(next)
        return { snapshot, auditResult: 'SUCCEEDED' as const, reasonCode: mismatch, outcome: { status: 'BLOCKED', reasonCode: mismatch, source: snapshot } as PreflightOutcome }
      }
      next.verification = 'VERIFIED'
      next.blockedReason = null
      next.tables = next.tables.map(table => ({ ...table, columns: table.columns.map(column => ({ ...column, verification: 'VERIFIED' as const })) }))
      const snapshot = this.bump(next)
      return { snapshot, outcome: { status: 'VERIFIED', source: snapshot } as PreflightOutcome }
    }).then(result => result.outcome as PreflightOutcome)
  }

  blockSource(actor: CatalogActor, id: string, expectedVersion: number, reasonCode: string): Promise<CatalogSource> {
    return this.run(actor, 'BLOCK', id, async (_tx, current) => {
      const source = this.requireCurrent(current, expectedVersion)
      if (!REASON_CODE.test(reasonCode)) throw new CatalogError('INVALID_REASON_CODE')
      if (source.verification === 'BLOCKED') throw new CatalogError('TRANSITION_NOT_ALLOWED')
      const next = clone(source)
      next.verification = 'BLOCKED'
      next.blockedReason = reasonCode
      next.tables = unverifiedColumns(next.tables)
      return { snapshot: this.bump(next) }
    }).then(result => result.source)
  }

  /** BLOCKED → UNVERIFIED only. A blocked source can never jump straight to VERIFIED. */
  unblockSource(actor: CatalogActor, id: string, expectedVersion: number): Promise<CatalogSource> {
    return this.run(actor, 'UNBLOCK', id, async (_tx, current) => {
      const source = this.requireCurrent(current, expectedVersion)
      if (source.verification !== 'BLOCKED') throw new CatalogError('TRANSITION_NOT_ALLOWED')
      const next = clone(source)
      next.verification = 'UNVERIFIED'
      next.blockedReason = null
      next.tables = unverifiedColumns(next.tables)
      return { snapshot: this.bump(next) }
    }).then(result => result.source)
  }

  approveMapping(actor: CatalogActor, id: string, expectedVersion: number, input: { tenantId: string; approvalRef: string }): Promise<CatalogSource> {
    return this.mapping(actor, 'APPROVE_MAPPING', id, expectedVersion, input, async (source, mapping) => {
      assertKeys(input, ['tenantId', 'approvalRef'])
      if (source.scope !== 'IN_SCOPE') throw new CatalogError('MAPPING_NOT_ALLOWED_OUT_OF_SCOPE')
      if (typeof input.approvalRef !== 'string' || !APPROVAL_REF.test(input.approvalRef)) throw new CatalogError('INVALID_APPROVAL_REF')
      assertMappableTenant(await this.deps.tenants.find(input.tenantId))
      if (mapping && mapping.status !== 'UNRESOLVED') throw new CatalogError('TRANSITION_NOT_ALLOWED')
      return { status: 'RESOLVED', approvalRef: input.approvalRef }
    })
  }

  revokeMapping(actor: CatalogActor, id: string, expectedVersion: number, input: { tenantId: string }): Promise<CatalogSource> {
    return this.mapping(actor, 'REVOKE_MAPPING', id, expectedVersion, input, async (_source, mapping) => {
      if (mapping?.status !== 'RESOLVED') throw new CatalogError('TRANSITION_NOT_ALLOWED')
      return { status: 'UNRESOLVED', approvalRef: null }
    })
  }

  blockMapping(actor: CatalogActor, id: string, expectedVersion: number, input: { tenantId: string }): Promise<CatalogSource> {
    return this.mapping(actor, 'BLOCK_MAPPING', id, expectedVersion, input, async (_source, mapping) => {
      if (mapping?.status === 'BLOCKED') throw new CatalogError('TRANSITION_NOT_ALLOWED')
      return { status: 'BLOCKED', approvalRef: null }
    })
  }

  /** BLOCKED → UNRESOLVED only; a blocked mapping can never jump straight to RESOLVED. */
  resetMapping(actor: CatalogActor, id: string, expectedVersion: number, input: { tenantId: string }): Promise<CatalogSource> {
    return this.mapping(actor, 'RESET_MAPPING', id, expectedVersion, input, async (_source, mapping) => {
      if (mapping?.status !== 'BLOCKED') throw new CatalogError('TRANSITION_NOT_ALLOWED')
      return { status: 'UNRESOLVED', approvalRef: null }
    })
  }

  // ---------------------------------------------------------------- reads (scope-resolved)

  async history(id: string): Promise<CatalogSource[]> {
    return this.deps.repository.history(id)
  }

  /** Access decision for a scope. Unmapped sources look non-existent to tenants that have no mapping to them. */
  async checkAccess(scope: CatalogScope, id: string, request?: { table: string; columns: string[] }): Promise<AccessDecision> {
    const source = isCatalogId(id) ? await this.deps.repository.get(id) : null
    return this.decide(scope, source, request)
  }

  async listAccessibleSources(scope: CatalogScope): Promise<CatalogSourceView[]> {
    const views: CatalogSourceView[] = []
    for (const source of await this.deps.repository.list()) {
      if (!this.decide(scope, source).accessible) continue
      views.push({
        id: source.id,
        displayName: source.displayName,
        sourceTimeZone: source.sourceTimeZone!,
        limitProfile: clone(source.limitProfile!),
        tables: source.tables.map(table => ({
          name: table.name,
          dateColumn: table.dateColumn,
          timeColumn: table.timeColumn,
          columns: table.columns.map(column => ({ name: column.name, kind: column.kind })),
        })),
      })
    }
    return views
  }

  /**
   * TASK-027.65: full gate evaluation for an analysis query — every catalog reason (not just the first) plus the
   * read-time tenant re-check — returned as data so the caller can apply its own documented priority.
   */
  async evaluateQueryAccess(scope: CatalogScope, id: string, request: { table: string; columns: string[] }): Promise<QueryAccess> {
    const source = isCatalogId(id) ? await this.deps.repository.get(id) : null
    const decision = this.decide(scope, source, request)
    if (!decision.accessible || !source) return { ok: false, reasons: [...decision.reasons] }
    try {
      await this.assertLiveMappedTenant(scope, source)
    } catch (error) {
      // every read-time tenant failure (missing / not mappable / inactive / excluded organisation) is one static reason
      return { ok: false, reasons: [error instanceof CatalogError && error.code === 'MAPPING_UNRESOLVED' ? 'MAPPING_UNRESOLVED' : 'TENANT_NOT_ACCESSIBLE'] }
    }
    const table = source.tables.find(candidate => candidate.name === request.table)!
    return {
      ok: true,
      profile: {
        catalogId: source.id,
        version: source.version,
        sourceTimeZone: source.sourceTimeZone!,
        limitProfile: clone(source.limitProfile!),
        table: table.name,
        dateColumn: table.dateColumn,
        timeColumn: table.timeColumn,
        columnKinds: Object.fromEntries(table.columns.map(column => [column.name, column.kind])),
      },
    }
  }

  /**
   * INTERNAL, for the future read-only adapter: returns the physical database name ONLY when every
   * prerequisite holds (in scope, mapped RESOLVED for this scope, VERIFIED, time zone defined,
   * complete limit profile, table and every requested column VERIFIED). Otherwise throws with the
   * first static reason; nothing unverified is ever handed out.
   */
  async getExecutionProfile(scope: CatalogScope, id: string, request: { table: string; columns: string[] }): Promise<ExecutionProfile> {
    const source = isCatalogId(id) ? await this.deps.repository.get(id) : null
    const decision = this.decide(scope, source, request)
    if (!decision.accessible || !source) throw new CatalogError(decision.reasons[0] ?? 'NOT_FOUND')
    await this.assertLiveMappedTenant(scope, source)
    const table = source.tables.find(candidate => candidate.name === request.table)!
    return {
      catalogId: source.id,
      version: source.version,
      physicalDatabase: source.physicalDatabase,
      sourceTimeZone: source.sourceTimeZone!,
      limitProfile: clone(source.limitProfile!),
      schema: table.schema!,
      table: table.name,
      dateColumn: table.dateColumn,
      dateColumnKind: table.columns.find(column => column.name === table.dateColumn)!.kind,
      timeColumn: table.timeColumn,
      columns: [...request.columns],
    }
  }

  // ---------------------------------------------------------------- internals

  /**
   * Read-time re-check (TASK-027.64): at least one RESOLVED in-scope mapping must point at a tenant that is
   * STILL mappable (active, not platform root, not the excluded organisation) — a suspended tenant's
   * approved mapping stops granting access without any catalog write.
   */
  private async assertLiveMappedTenant(scope: CatalogScope, source: CatalogSource): Promise<void> {
    let firstFailure: unknown = new CatalogError('MAPPING_UNRESOLVED')
    let failed = false
    for (const mapping of source.mappings) {
      if (mapping.status !== 'RESOLVED' || !scope.dataScopeTenantIds.includes(mapping.tenantId)) continue
      try {
        assertMappableTenant(await this.deps.tenants.find(mapping.tenantId))
        return
      } catch (error) {
        if (!failed) firstFailure = error
        failed = true
      }
    }
    throw firstFailure
  }

  private decide(scope: CatalogScope, source: CatalogSource | null, request?: { table: string; columns: string[] }): AccessDecision {
    if (!source) return { accessible: false, reasons: ['NOT_FOUND'] }
    const relevant = source.mappings.filter(mapping => scope.dataScopeTenantIds.includes(mapping.tenantId))
    if (relevant.length === 0) return { accessible: false, reasons: ['NOT_FOUND'] }
    const reasons: AccessDenialReason[] = []
    if (!relevant.some(mapping => mapping.status === 'RESOLVED')) reasons.push('MAPPING_UNRESOLVED')
    if (source.scope !== 'IN_SCOPE') reasons.push('OUT_OF_SCOPE')
    if (source.verification === 'BLOCKED') reasons.push('BLOCKED')
    else if (source.verification !== 'VERIFIED') reasons.push('NOT_VERIFIED')
    if (!source.sourceTimeZone) reasons.push('TIMEZONE_UNDEFINED')
    if (!isLimitProfileComplete(source.limitProfile)) reasons.push('LIMIT_PROFILE_INCOMPLETE')
    if (request) {
      const table = source.tables.find(candidate => candidate.name === request.table)
      if (!table) reasons.push('TABLE_UNKNOWN')
      else {
        if (!table.schema) reasons.push('SCHEMA_UNDEFINED')
        for (const name of request.columns) {
          const column = table.columns.find(candidate => candidate.name === name)
          if (!column) {
            if (!reasons.includes('COLUMN_UNKNOWN')) reasons.push('COLUMN_UNKNOWN')
          } else if (column.verification !== 'VERIFIED' && !reasons.includes('COLUMN_NOT_VERIFIED')) reasons.push('COLUMN_NOT_VERIFIED')
        }
      }
    }
    return { accessible: reasons.length === 0, reasons }
  }

  private findMismatch(source: CatalogSource, observation: PreflightObservation): string | null {
    if (!observation.databaseExists) return 'PREFLIGHT_DATABASE_MISSING'
    for (const table of source.tables) {
      const observed = observation.tables.find(candidate => candidate.name === table.name)
      if (observed && observed.schemaExists !== true) return 'PREFLIGHT_SCHEMA_MISSING'
      if (!observed || !observed.exists) return 'PREFLIGHT_TABLE_MISSING'
      for (const column of table.columns) {
        const seen = observed.columns.find(candidate => candidate.name === column.name)
        if (!seen || !seen.exists) return 'PREFLIGHT_COLUMN_MISSING'
        if (!isObservedClassCompatible(column.kind, seen.observedClass)) return 'PREFLIGHT_TYPE_MISMATCH'
      }
    }
    return null
  }

  private bump(next: CatalogSource): CatalogSource {
    next.version += 1
    next.updatedAt = this.deps.clock.now().toISOString()
    return next
  }

  private requireCurrent(current: CatalogSource | null, expectedVersion: number): CatalogSource {
    if (!current) throw new CatalogError('NOT_FOUND')
    if (current.version !== expectedVersion) throw new CatalogError('VERSION_CONFLICT')
    return current
  }

  private mapping(
    actor: CatalogActor,
    operation: CatalogOperation,
    id: string,
    expectedVersion: number,
    input: { tenantId: string },
    decide: (source: CatalogSource, current: TenantMapping | undefined) => Promise<{ status: MappingStatus; approvalRef: string | null }>,
  ): Promise<CatalogSource> {
    return this.run(actor, operation, id, async (_tx, current) => {
      const source = this.requireCurrent(current, expectedVersion)
      if (!input || typeof input.tenantId !== 'string' || input.tenantId.length === 0) throw new CatalogError('INVALID_INPUT_FIELD')
      const existing = source.mappings.find(mapping => mapping.tenantId === input.tenantId)
      const next = clone(source)
      const decided = await decide(source, existing)
      if (existing) {
        const target = next.mappings.find(mapping => mapping.tenantId === input.tenantId)!
        target.status = decided.status
        target.approvalRef = decided.approvalRef
      } else {
        next.mappings.push({ tenantId: input.tenantId, status: decided.status, approvalRef: decided.approvalRef })
      }
      return { snapshot: this.bump(next), mappedTenantId: input.tenantId }
    }).then(result => result.source)
  }

  /**
   * Single write path. Order: authorise (fail-closed) → transactional change → audit INSIDE the
   * transaction (an audit failure rolls the change back). The audit entry carries only the allowed
   * fields; the correlation id is server-generated.
   */
  private async run(
    actor: CatalogActor,
    operation: CatalogOperation,
    catalogId: string | null,
    work: (
      tx: CatalogTransaction,
      current: CatalogSource | null,
    ) => Promise<{ snapshot: CatalogSource | null; mappedTenantId?: string; auditResult?: CatalogAuditResult; reasonCode?: string; outcome?: PreflightOutcome }>,
  ): Promise<{ source: CatalogSource; outcome?: PreflightOutcome }> {
    const correlationId = this.deps.correlationId()
    const entry = (result: CatalogAuditResult, reasonCode: string, version: number | null, mappedTenantId: string | null = null) => ({
      actorId: actor.id,
      catalogId,
      version,
      operation,
      result,
      reasonCode,
      correlationId,
      mappedTenantId,
    })

    let allowed = false
    try {
      allowed = (await this.deps.authorizer.authorize(actor, operation)) === true
    } catch {
      allowed = false
    }
    if (!allowed) {
      await this.recordBestEffort(entry('DENIED', 'NOT_AUTHORIZED', null))
      throw new CatalogError('NOT_AUTHORIZED')
    }

    try {
      return await this.deps.repository.withTransaction(async tx => {
        const current = catalogId === null ? null : isCatalogId(catalogId) ? await tx.get(catalogId) : null
        const done = await work(tx, current)
        let version: number | null = current?.version ?? null
        if (done.snapshot) {
          await tx.saveVersion(done.snapshot)
          version = done.snapshot.version
        }
        try {
          await this.deps.audit.record(
            entry(done.auditResult ?? 'SUCCEEDED', done.reasonCode ?? 'OK', done.snapshot ? done.snapshot.version : version, done.mappedTenantId ?? null) as never,
          )
        } catch {
          throw new CatalogError('CATALOG_AUDIT_FAILED')
        }
        const source = done.snapshot ?? current!
        return { source, outcome: done.outcome }
      }).then(result => (result.outcome ? { source: result.source, outcome: result.outcome } : { source: result.source }))
    } catch (error) {
      const code = error instanceof CatalogError ? error.code : 'CATALOG_INTERNAL_ERROR'
      if (code !== 'CATALOG_AUDIT_FAILED') {
        // every deliberate CatalogError is a rejection (DENIED); anything else is an unexpected failure
        const denied = error instanceof CatalogError && code !== 'CATALOG_INTERNAL_ERROR'
        await this.recordBestEffort(entry(denied ? 'DENIED' : 'FAILED', code, null))
      }
      throw error instanceof CatalogError ? error : new CatalogError('CATALOG_INTERNAL_ERROR')
    }
  }

  /** Failure/denial audit is best effort — it can never turn a rejection into success. */
  private async recordBestEffort(entry: Parameters<CatalogAuditPort['record']>[0]): Promise<void> {
    try {
      await this.deps.audit.record(entry)
    } catch {
      // the operation is already rejected; nothing else to do
    }
  }
}
