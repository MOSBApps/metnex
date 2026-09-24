import { assertMappableTenant } from '../catalog/tenant-guards'
import { classifyBucket, summariseQuality } from '../series/series-quality'
import { computeStatistics } from '../series/series-statistics'
import type { ScadaOutputBucket, ScadaSeriesCode, ScadaSeriesOutput } from '../series/scada-series.contract'
import { ExpressionError, type ExprNode } from './virtual-column-expression'
import { limitsValid } from './virtual-column-parser'
import { derivedQuality, type BucketOutcome } from './virtual-column-quality'
import { evaluate } from './virtual-column-evaluator'
import { activeVersions, compileDefinition, definitionShapeValid, versionAt } from './virtual-column-validator'
import type {
  VirtualColumnAuditPort,
  VirtualColumnDefinition,
  VirtualColumnErrorCode,
  VirtualColumnFailure,
  VirtualColumnRequest,
  VirtualColumnResult,
  VirtualOutputBucket,
  VirtualSeriesOutput,
} from './virtual-column.contract'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const iso = (s: string) => new Date(s).toISOString()

interface Piece {
  def: VirtualColumnDefinition
  ast: ExprNode
  refs: string[]
}

/**
 * Governed virtual columns (TASK-027.70). PURE: no I/O, no logging, deterministic, never mutates its input, never runs
 * anything but the allowlist AST. The produced series is a 027.68/027.69-compatible `ScadaSeriesOutput`. A virtual column can
 * neither widen the tenant/source scope nor create a tenant, source or mapping: it sees only the real series of its own
 * tenant AND source that were handed in.
 *
 * `audit` is an optional PORT (best effort, never changes an outcome): it receives ids/version/result/static reason only —
 * never the expression. Action/entity names are Q-W519 (open) and are decided by whoever implements the port.
 */
export class VirtualColumnService {
  constructor(private readonly audit?: VirtualColumnAuditPort) {}

  async evaluate(req: VirtualColumnRequest): Promise<VirtualColumnResult> {
    const result = this.run(req)
    if (this.audit && isObj(req) && Array.isArray(req.definitions)) {
      const root = isObj(req.scope) && typeof req.scope.customerRootTenantId === 'string' ? req.scope.customerRootTenantId : ''
      const failed = new Map(result.failures.map(f => [f.virtualColumnId, f.code]))
      const versions = new Map<string, Set<number>>()
      for (const s of result.series) versions.set(s.virtual.virtualColumnId, new Set(s.virtual.versions))
      const ids = new Set<string>()
      for (const d of req.definitions) if (isObj(d) && typeof d.virtualColumnId === 'string') ids.add(d.virtualColumnId)
      for (const id of [...ids].sort()) {
        const code = failed.get(id) ?? (result.code && !versions.has(id) ? result.code : null)
        try {
          await this.audit.record({
            virtualColumnId: id,
            catalogId: typeof req.catalogId === 'string' ? req.catalogId : '',
            customerRootTenantId: root,
            version: versions.get(id) ? Math.max(...versions.get(id)!) : null,
            result: code ? (code === 'VIRTUAL_COLUMN_SCOPE_BLOCKED' || code === 'VIRTUAL_COLUMN_NOT_ACTIVE' ? 'DENIED' : 'FAILED') : 'SUCCEEDED',
            reasonCode: code ?? 'OK',
          })
        } catch {
          // best effort: the pure core's outcome never depends on the audit port
        }
      }
    }
    return result
  }

  private blocked(root: string, code: VirtualColumnErrorCode): VirtualColumnResult {
    return { status: 'BLOCKED', code, customerRootTenantId: root, series: [], failures: [] }
  }

  private run(req: VirtualColumnRequest): VirtualColumnResult {
    if (!isObj(req) || !isObj(req.scope) || typeof req.scope.customerRootTenantId !== 'string' || req.scope.customerRootTenantId === '' || typeof req.scope.tenantId !== 'string' || !Array.isArray(req.scope.dataScopeTenantIds) || typeof req.catalogId !== 'string' || req.catalogId === '' || !Array.isArray(req.definitions) || !Array.isArray(req.inputSeries)) {
      return this.blocked(isObj(req) && isObj(req.scope) && typeof req.scope.customerRootTenantId === 'string' ? req.scope.customerRootTenantId : '', 'VIRTUAL_COLUMN_EXPRESSION_INVALID')
    }
    const root = req.scope.customerRootTenantId
    if (!limitsValid(req.limits)) return this.blocked(root, 'VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX') // no limits ⇒ fail closed

    // ---- scope gate (whole request): the mapped tenant must be resolved, active, inside the resolved data scope
    let scopeOk = req.mappingResolved === true && req.tenant !== null && req.scope.dataScopeTenantIds.includes(req.tenant.id)
    if (scopeOk) {
      try {
        assertMappableTenant(req.tenant)
      } catch {
        scopeOk = false
      }
    }
    if (!scopeOk) return this.blocked(root, 'VIRTUAL_COLUMN_SCOPE_BLOCKED')

    // ---- the ONLY series an expression can see: real series of THIS tenant and THIS source, not tenant-blocked
    const available = new Map<string, ScadaSeriesOutput>()
    const ambiguous = new Set<string>()
    for (const raw of req.inputSeries as readonly unknown[]) {
      if (!isObj(raw)) continue
      const s = raw as unknown as ScadaSeriesOutput
      if (s.customerRootTenantId !== root || s.sourceCatalogId !== req.catalogId || !Array.isArray(s.codes) || s.codes.includes('TENANT_SCOPE_BLOCKED') || typeof s.seriesKey !== 'string' || !Array.isArray(s.buckets)) continue
      if (available.has(s.seriesKey)) ambiguous.add(s.seriesKey)
      available.set(s.seriesKey, s)
    }
    for (const k of ambiguous) available.delete(k) // two series with one key: not addressable, never guessed
    const keys = new Set(available.keys())

    // ---- group the versions by virtualColumnId
    const groups = new Map<string, VirtualColumnDefinition[]>()
    const failures: VirtualColumnFailure[] = []
    for (const d of req.definitions) {
      if (!definitionShapeValid(d)) {
        if (isObj(d) && typeof d.virtualColumnId === 'string') failures.push({ virtualColumnId: d.virtualColumnId, code: 'VIRTUAL_COLUMN_EXPRESSION_INVALID' })
        continue
      }
      if (!groups.has(d.virtualColumnId)) groups.set(d.virtualColumnId, [])
      groups.get(d.virtualColumnId)!.push(d)
    }
    const failed = new Set(failures.map(f => f.virtualColumnId))

    // ---- seriesKey uniqueness inside the tenant: a virtual column never shadows a real series or another column
    const owner = new Map<string, string>()
    const collide = new Set<string>()
    for (const [id, versions] of [...groups].sort((a, b) => cmp(a[0], b[0]))) {
      for (const key of new Set(versions.filter(v => v.status === 'ACTIVE').map(v => v.seriesKey))) {
        if (available.has(key) || (owner.has(key) && owner.get(key) !== id)) {
          collide.add(id)
          if (owner.has(key)) collide.add(owner.get(key)!)
        }
        owner.set(key, id)
      }
    }

    const outputs: VirtualSeriesOutput[] = []
    for (const [id, versions] of [...groups].sort((a, b) => cmp(a[0], b[0]))) {
      if (failed.has(id)) continue
      const fail = (code: VirtualColumnErrorCode) => {
        failures.push({ virtualColumnId: id, code })
      }
      // tenant / source scope of the DEFINITION: another tenant's or another source's column is never evaluated
      if (versions.some(v => v.customerRootTenantId !== root || v.catalogId !== req.catalogId) || collide.has(id)) {
        fail('VIRTUAL_COLUMN_SCOPE_BLOCKED')
        continue
      }
      const av = activeVersions(versions)
      if (!av.ok) {
        fail(av.code)
        continue
      }
      try {
        const pieces: Piece[] = av.active.map(def => {
          const c = compileDefinition(def, req.limits, keys)
          return { def, ast: c.ast, refs: c.refs }
        })
        outputs.push(this.build(id, pieces, available, req.limits.maxAbsoluteResult, root, req.catalogId))
      } catch (e) {
        fail(e instanceof ExpressionError ? e.code : 'VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX')
      }
    }

    outputs.sort((a, b) => cmp(a.seriesKey, b.seriesKey))
    failures.sort((a, b) => cmp(a.virtualColumnId, b.virtualColumnId) || cmp(a.code, b.code))
    if (outputs.length === 0) return { status: 'BLOCKED', code: failures[0]?.code ?? 'VIRTUAL_COLUMN_NOT_ACTIVE', customerRootTenantId: root, series: [], failures }
    return { status: failures.length > 0 ? 'PARTIAL' : 'OK', code: failures.length > 0 ? failures[0]!.code : null, customerRootTenantId: root, series: outputs, failures }
  }

  private build(virtualColumnId: string, pieces: Piece[], available: ReadonlyMap<string, ScadaSeriesOutput>, maxAbs: number, root: string, catalogId: string): VirtualSeriesOutput {
    const newest = pieces[pieces.length - 1]!.def
    const allRefs = [...new Set(pieces.flatMap(p => p.refs))].sort()
    const inputBlocked = (s: ScadaSeriesOutput) => s.status === 'BLOCKED' || !s.analysisAllowed

    // per input series: placed buckets by instant (duplicates are kept visible), and the readings without an instant
    const placed = new Map<string, Map<string, ScadaOutputBucket[]>>()
    const unplaced: Array<{ key: string; bucket: ScadaOutputBucket }> = []
    for (const key of allRefs) {
      const m = new Map<string, ScadaOutputBucket[]>()
      for (const b of available.get(key)!.buckets) {
        if (b.bucketStartUtc === null) {
          unplaced.push({ key, bucket: b })
          continue
        }
        const t = iso(b.bucketStartUtc)
        if (!m.has(t)) m.set(t, [])
        m.get(t)!.push(b)
      }
      placed.set(key, m)
    }

    const buckets: VirtualOutputBucket[] = []
    const times = new Map<string, Piece>() // instant → the version effective there
    let notEffective = 0
    const allTimes = new Set<string>()
    for (const p of pieces) for (const key of p.refs) for (const t of placed.get(key)!.keys()) allTimes.add(t)
    for (const t of [...allTimes].sort()) {
      const def = versionAt(pieces.map(p => p.def), Date.parse(t))
      if (!def) {
        notEffective += 1 // no ACTIVE version is effective here: not computed, not listed
        continue
      }
      times.set(t, pieces.find(p => p.def === def)!)
    }
    for (const [t, piece] of [...times].sort((a, b) => cmp(a[0], b[0]))) {
      const values = new Map<string, number>()
      const flags = new Set<ScadaOutputBucket['qualityFlags'][number]>()
      let unresolved = false
      let missing = false
      let localWall: string | null = null
      for (const key of piece.refs) {
        const series = available.get(key)!
        const here = placed.get(key)!.get(t)
        if (!here) {
          unresolved = true // an input without a bucket at this instant is MISSING — never 0
          missing = true
          continue
        }
        if (here.length > 1) {
          unresolved = true
          flags.add('DUPLICATE_TIMESTAMP')
          here.forEach(h => h.qualityFlags.forEach(f => flags.add(f)))
          continue
        }
        const b = here[0]!
        localWall ??= b.localWallTime
        b.qualityFlags.forEach(f => flags.add(f))
        if (inputBlocked(series) || b.classification !== 'VALID' || b.value === null || !Number.isFinite(b.value)) {
          unresolved = true
          if (b.classification === 'MISSING' || b.value === null) missing = true
        } else {
          values.set(key, b.value) // a real 0 is a normal valid input
        }
      }
      let outcome: BucketOutcome = { kind: 'UNRESOLVED' }
      if (!unresolved) {
        const r = evaluate(piece.ast, values, maxAbs)
        outcome = r.ok ? { kind: 'VALUE', value: r.value } : r.reason === 'DIVISION' ? { kind: 'DIVISION' } : { kind: 'NUMERIC' }
      }
      buckets.push(this.makeBucket(virtualColumnId, t, localWall, outcome, [...flags], missing, piece.refs, piece.def.version))
    }
    // readings with no trustworthy instant cannot be aligned: the derived bucket is unplaced and unresolved
    const singleVersion = pieces.length === 1 ? pieces[0]!.def.version : null
    const seen = new Set<string>()
    for (const u of unplaced) {
      const id = `${u.key}\u0000${u.bucket.recordId}`
      if (seen.has(id)) continue
      seen.add(id)
      const referencing = pieces.filter(p => p.refs.includes(u.key))
      buckets.push(this.makeBucket(virtualColumnId, null, u.bucket.localWallTime, { kind: 'UNRESOLVED' }, [...u.bucket.qualityFlags], false, [...new Set(referencing.flatMap(p => p.refs))].sort(), singleVersion, u.bucket.recordId))
    }
    buckets.sort((a, b) => {
      if (a.bucketStartUtc !== null && b.bucketStartUtc !== null) return Date.parse(a.bucketStartUtc) - Date.parse(b.bucketStartUtc) || cmp(a.recordId, b.recordId)
      if (a.bucketStartUtc === null && b.bucketStartUtc === null) return cmp(a.localWallTime ?? '', b.localWallTime ?? '') || cmp(a.recordId, b.recordId)
      return a.bucketStartUtc === null ? 1 : -1
    })

    const analysisAllowed = allRefs.every(k => !inputBlocked(available.get(k)!))
    const summary = summariseQuality(buckets, analysisAllowed)
    const statistics = computeStatistics(buckets, !analysisAllowed)
    const codes: ScadaSeriesCode[] = []
    if (!analysisAllowed) codes.push('SERIES_ANALYSIS_BLOCKED')
    if (summary.dstAmbiguous + summary.dstNonexistent > 0) codes.push('DST_UNRESOLVED')
    if (summary.counterResetUnresolved > 0) codes.push('COUNTER_RESET_UNRESOLVED')
    if (buckets.some(b => !b.isComplete && b.classification !== 'MISSING')) codes.push('INCOMPLETE_BUCKET')
    if (analysisAllowed && statistics.validCount > 0 && (statistics.sum === null || statistics.average === null)) codes.push('INVALID_STATISTICS_INPUT')
    if (analysisAllowed && statistics.status === 'NO_VALID_DATA') codes.push('NO_VALID_DATA')
    return {
      seriesKey: newest.seriesKey,
      label: newest.label,
      unit: newest.unit,
      valueType: newest.valueType,
      sourceCatalogId: catalogId,
      customerRootTenantId: root,
      analysisAllowed,
      status: analysisAllowed ? statistics.status : 'BLOCKED',
      codes: [...new Set(codes)],
      buckets,
      statistics,
      qualitySummary: summary,
      outOfRangeBuckets: 0,
      virtual: { virtualColumnId, versions: pieces.map(p => p.def.version), sourceSeriesKeys: allRefs, notEffectiveBuckets: notEffective },
    }
  }

  private makeBucket(virtualColumnId: string, t: string | null, localWall: string | null, outcome: BucketOutcome, inputFlags: ScadaOutputBucket['qualityFlags'], missing: boolean, refs: string[], version: number | null, unplacedRecord?: string): VirtualOutputBucket {
    const q = derivedQuality(outcome, inputFlags, missing)
    return {
      recordId: t !== null ? `${virtualColumnId}:${t}` : `${virtualColumnId}:LOCAL:${localWall ?? ''}:${unplacedRecord ?? ''}`,
      bucketStartUtc: t,
      localWallTime: localWall,
      value: q.value,
      dataQuality: q.dataQuality,
      qualityFlags: q.flags,
      isComplete: q.isComplete,
      classification: classifyBucket({ value: q.value, qualityFlags: q.flags, isComplete: q.isComplete }),
      analysisAllowed: q.analysisAllowed,
      sourceSeriesKeys: [...refs],
      virtualColumnId,
      version,
    }
  }
}
