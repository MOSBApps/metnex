import { existsSync } from 'node:fs'
import path from 'node:path'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { BadGatewayException } from '@nestjs/common'
import { MfaEnforcementGuard } from '../../../../platform/guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from '../../../../platform/guards/tenant-header-format.guard'
import { JwtAuthGuard } from '../../../../platform/jwt-auth.guard'
import { PERMISSION_KEY, PermissionGuard } from '../../../../platform/permission.guard'
import { TenantMembershipGuard } from '../../../../platform/tenant-membership.guard'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { TenantRecord } from '../../catalog/tenant-guards'
import type { ScadaExportAuditEntry, ScadaExportResult } from '../../export/scada-export.contract'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import { SCADA_FIXTURE_DEVELOPMENT_LABEL } from '../../fixture/scada-fixture-artifact'
import type { ScadaPreset } from '../../presets/scada-preset.contract'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture, fixtureCatalogId } from '../dev-csv-scada-fixture'
import { SCADA_FIXTURE_SCOPE_BRIDGE_ENV } from '../dev-fixture-scope-resolver'
import { DevVirtualColumnStore } from '../dev-virtual-column.store'
import { ScadaApiError, SCADA_ANALYSIS_QUERY, SCADA_SOURCE_CATALOG } from '../scada-api.contract'
import { scadaApiControllers, scadaApiProviders } from '../scada-api.providers'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'
import { ScadaAnalysisController } from '../scada-analysis.controller'
import { ScadaPresetController } from '../scada-preset.controller'
import { ScadaVirtualColumnController } from '../scada-virtual-column.controller'

/**
 * TASK-027.59 — Wave 5 reporting acceptance over the REAL development CSV snapshot (`veriler/raw/*.csv`, git-ignored, so the suite is
 * skipped when it is absent). The chain under test is the composed one: manifest / catalog → dev scope → real 027.65 query service →
 * quality / roll-over → aggregation → multi-series / statistics → comparison → virtual columns → presets → API service → export.
 * No database, no Docker, no SQL Server, no Jasper service (the renderer seam is a stub); the tenant / caller records are synthetic.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../../../../..')
const HAS = ['endeksler', 'gt_endeksler', 'komur_endeksler', 'sg_endeksler'].every(f => existsSync(path.join(REPO_ROOT, `veriler/raw/${f}.csv`))) && existsSync(path.join(REPO_ROOT, 'veriler/manifest/scada-fixtures.manifest.json'))
const acceptance = HAS ? describe : describe.skip

const ZONE = 'Europe/Istanbul'
const ENV = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [DEV_FIXTURE_ZONE_ENV]: ZONE, [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'true' } as NodeJS.ProcessEnv
const CODE = 'SCADA_HOURLY_ANALYSIS'
const GT = fixtureCatalogId('gt_endeksler')
const SG = fixtureCatalogId('sg_endeksler')
const EN = fixtureCatalogId('endeksler')
const KOMUR = fixtureCatalogId('komur_endeksler')
const GT1 = 'GT1_ELEKTRIK_URETIM_KWH'
const GT2 = 'GT2_ELEKTRIK_URETIM_KWH'
const GT3 = 'GT3_ELEKTRIK_URETIM_KWH'
const SG1 = 'SG50_1_ELEKTRIK_URETIM_KWH'
const T1 = 'Turbin1_Enerji_kWh'
const T2 = 'Turbin2_Enerji_kWh'

const rootOf = (t: string) => (t.startsWith('a') ? 'root-A' : 'root-B')
const tenantOf = (t: string, over: Partial<TenantRecord> = {}): TenantRecord => ({ id: t, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${t}`, ...over })

interface Opts {
  env?: NodeJS.ProcessEnv
  tenant?: (t: string) => TenantRecord | null
  failQueryAudit?: boolean
  failExportAudit?: boolean
  presets?: ScadaPreset[]
  renderer?: { configured: boolean; fail?: unknown }
  omit?: Array<'sources' | 'query' | 'limits' | 'exportAudit'>
  store?: DevVirtualColumnStore
}

function compose(o: Opts = {}) {
  const queryAudits: ScadaQueryAuditEntry[] = []
  const exportAudits: ScadaExportAuditEntry[] = []
  const rendered: Array<{ templateId: string | null; rows: Array<Record<string, string>> }> = []
  const tenants = o.tenant ?? ((t: string) => tenantOf(t))
  const audit = { record: async (e: ScadaQueryAuditEntry) => (o.failQueryAudit ? Promise.reject(new Error('down')) : void queryAudits.push(e)) }
  let n = 0
  const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => `srv-${(n += 1)}` }
  const fixture = createDevCsvFixture({ provider: new ScadaCsvFixtureProvider(REPO_ROOT), tenants: { get: async id => tenants(id) }, env: o.env ?? ENV })
  const store = o.store ?? new DevVirtualColumnStore()
  const omit = new Set(o.omit ?? [])
  const svc = new ScadaAnalysisApiService({
    scopes: { resolve: async t => ({ tenantId: t, customerRootTenantId: rootOf(t), dataScopeTenantIds: [t] }) },
    callers: { describe: async (_u, t) => ({ tenant: tenants(t), userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock,
    audit,
    presetAuthorization: { canSharePreset: ({ userId }) => userId.endsWith('-admin') },
    ...(omit.has('sources') ? {} : { sources: fixture.catalog }),
    ...(omit.has('query') ? {} : { query: fixture.queryService(audit, clock) }),
    presets: { listPresetVersions: async () => o.presets ?? [] },
    virtualColumns: store,
    virtualColumnManager: store,
    ...(omit.has('limits') ? {} : { limits: { get: () => DEV_FIXTURE_API_LIMITS } }),
    ...(omit.has('exportAudit') ? {} : { exportAudit: { record: async (e: ScadaExportAuditEntry) => { if (o.failExportAudit) throw new Error('Server=10.0.0.5;Password=hunter2'); exportAudits.push(e) } } }),
    exportRenderer: { isConfigured: () => o.renderer?.configured ?? false, render: async (i: { templateId: string | null; rows: unknown[] }) => { rendered.push(JSON.parse(JSON.stringify(i))); if (o.renderer?.fail) throw o.renderer.fail; return { buffer: Buffer.from('%PDF-jasper'), contentType: 'application/pdf', fileName: 'x.pdf' } } },
  })
  return { svc, store, queryAudits, exportAudits, rendered, provider: new ScadaCsvFixtureProvider(REPO_ROOT), fixture }
}
type World = ReturnType<typeof compose>

const call = (user: string, tenant: string, body?: unknown, param?: unknown) => ({ actor: { id: user }, tenantId: tenant, routeCode: CODE, body, param })
const exp = (user: string, tenant: string, format: unknown, body?: unknown) => call(user, tenant, body, format)
const U = 'a-user'
const A1 = 'a-t1'
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)
const hourly = (over: Record<string, unknown> = {}) => ({ sourceCatalogIds: [GT], seriesKeys: [GT1], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-03T21:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE, ...over })
const period = (over: Record<string, unknown> = {}) => ({ mode: 'PERIOD', sourceCatalogIds: [GT], seriesKeys: [GT1], baseline: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, comparison: { startAt: '2026-01-01T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE, ...over })
const fileOf = (r: ScadaExportResult) => {
  if (r.kind !== 'FILE') throw new Error('not a file')
  return r
}
const csvOf = (r: ScadaExportResult) => fileOf(r).buffer.toString('utf8').replace(/^﻿/, '').split('\r\n')
const unzip = (buf: Buffer) => {
  const out = new Map<string, string>()
  let off = 0
  while (buf.readUInt32LE(off) === 0x04034b50) {
    const size = buf.readUInt32LE(off + 18)
    const nameLen = buf.readUInt16LE(off + 26)
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString('utf8')
    out.set(name, buf.subarray(off + 30 + nameLen, off + 30 + nameLen + size).toString('utf8'))
    off += 30 + nameLen + size
  }
  return out
}

async function withVirtual(w: World, expression: string, inputs: string[], catalogId = GT, seriesKey = 'TOTAL', label = 'Toplam sanal') {
  const created = await w.svc.createVirtualColumn({ actor: { id: 'a-admin' }, tenantId: A1, routeCode: CODE, body: { label, unit: 'kWh', catalogId, seriesKey, expression, inputSeriesKeys: inputs } })
  await w.svc.activateVirtualColumn({ actor: { id: 'a-admin' }, tenantId: A1, routeCode: CODE, param: created.virtualColumnId })
  return created.virtualColumnId
}

const preset = (over: Partial<ScadaPreset> = {}): ScadaPreset => ({
  presetId: 'p-private', customerRootTenantId: 'root-A', ownerUserId: U, scope: 'PRIVATE', name: 'Vardiya', description: null, version: 1, status: 'ACTIVE',
  sourceCatalogIds: [GT], seriesKeys: [GT1], virtualColumns: [], statistics: ['SUM', 'AVERAGE'], comparison: { mode: 'NONE' }, filters: {}, timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' },
  bucketInterval: 'HOURLY', timezone: ZONE, display: { chartType: 'LINE' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', effectiveFrom: null, effectiveTo: null, ...over,
})

acceptance('S1 access — the guard chain and the artifact', () => {
  const proto = ScadaAnalysisController.prototype as unknown as Record<string, () => unknown>
  it('every SCADA route sits behind JWT → MFA → tenant header → membership → permission; reading needs VIEW, export needs EXPORT', () => {
    expect(Reflect.getMetadata('__guards__', ScadaAnalysisController)).toEqual([JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard])
    const perms: Record<string, string> = { analyse: 'REPORT:ARTIFACT:VIEW', compare: 'REPORT:ARTIFACT:VIEW', catalog: 'REPORT:ARTIFACT:VIEW', listPresets: 'REPORT:ARTIFACT:VIEW', getPreset: 'REPORT:ARTIFACT:VIEW', exportAnalysis: 'REPORT:ARTIFACT:EXPORT', completePngExport: 'REPORT:ARTIFACT:EXPORT' }
    for (const [h, p] of Object.entries(perms)) {
      expect(Reflect.getMetadata(PERMISSION_KEY, proto[h]!)).toBe(p)
      expect(Reflect.getMetadata(METHOD_METADATA, proto[h]!)).toBeDefined()
      expect(Reflect.getMetadata(PATH_METADATA, proto[h]!)).toMatch(/^:code\/analysis\//)
    }
    const vc = ScadaVirtualColumnController.prototype as unknown as Record<string, () => unknown>
    for (const h of ['list', 'create', 'activate', 'disable']) expect(Reflect.getMetadata(PERMISSION_KEY, vc[h]!)).toBe('REPORT:ARTIFACT:VIEW')
  })

  it('the catalog serves SCADA_HOURLY_ANALYSIS with the development label; an unknown artifact code is not served', async () => {
    const w = compose()
    const cat = await w.svc.getCatalog(call(U, A1))
    expect(cat.artifact).toMatchObject({ code: CODE, developmentOnly: true, dataOrigin: 'DEVELOPMENT_CSV_SNAPSHOT' })
    expect(cat.developmentLabel).toBe(SCADA_FIXTURE_DEVELOPMENT_LABEL)
    expect(await codeOf(w.svc.getCatalog({ ...call(U, A1), routeCode: 'SOMETHING_ELSE' }))).toBe('SCADA_NOT_FOUND')
  })
})

acceptance('S2 source discovery', () => {
  it('four sources; verified columns selectable, unverified listed but never selectable / queryable; units only when evidenced; nothing physical', async () => {
    const w = compose()
    const cat = await w.svc.getCatalog(call(U, A1))
    expect(cat.sources.map(s => s.catalogId).sort()).toEqual([EN, GT, KOMUR, SG].sort())
    for (const s of cat.sources) {
      expect(s.selectable).toBe(true)
      const verified = s.series.filter(x => x.verificationStatus === 'VERIFIED')
      const unverified = s.series.filter(x => x.verificationStatus === 'UNVERIFIED')
      expect(verified.length).toBeGreaterThan(0)
      for (const v of verified) expect(['INDEX', 'REAL_VALUE']).toContain(v.valueType)
      for (const u of unverified) expect(u).toMatchObject({ available: false, valueType: 'UNVERIFIED' })
    }
    const gt = cat.sources.find(s => s.catalogId === GT)!
    expect(gt.series.find(x => x.seriesKey === GT1)).toMatchObject({ unit: '', verificationStatus: 'VERIFIED' }) // no evidenced unit ⇒ empty (the screen says "Birim belirtilmemiş")
    expect(gt.series.find(x => x.seriesKey === 'GT1_BUHAR_URETIM_TON')!.unit).toBe('ton')
    const unverifiedKey = gt.series.find(x => x.verificationStatus === 'UNVERIFIED')!.seriesKey
    expect(await codeOf(w.svc.runAnalysis(call(U, A1, hourly({ seriesKeys: [unverifiedKey] }))))).not.toBe('OK')
    expect(JSON.stringify(cat)).not.toMatch(/veriler|raw\/|\.csv|sha256|KAYIT_TARIHI|KAYIT_SAATI|phys|schema_|Server=|password|Sirket|mosedas/i)
  })
})

acceptance('S3 hourly analysis over the real CSV', () => {
  it('values equal the CSV index differences; a REAL 0 stays 0', async () => {
    const w = compose()
    const r = await w.svc.runAnalysis(call(U, A1, hourly()))
    expect(r.status).toBe('OK')
    const csv = w.provider.loadSourceRecords('gt_endeksler', A1, ENV).filter(x => x.seriesKey === GT1)
    const pts = r.series[0]!.points
    expect(pts.length).toBe(72)
    let zeros = 0
    pts.forEach((p, i) => {
      const d = csv[i + 1]!.rawValue! - csv[i]!.rawValue!
      expect(p.value).toBeCloseTo(d, 3)
      if (d === 0) {
        zeros += 1
        expect(p.value).toBe(0)
        expect(p.quality).toBe('VALID')
      }
    })
    expect(zeros).toBeGreaterThan(0) // the snapshot really has zero-consumption hours
  })

  it('a missing reading is null with flags — never 0 — and a counter reset is unresolved, not a negative or zero value', async () => {
    const w = compose()
    const missing = await w.svc.runAnalysis(call(U, A1, { sourceCatalogIds: [EN], seriesKeys: [T2], startAt: '2025-11-17T21:00:00.000Z', endAt: '2025-11-19T21:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }))
    const pts = missing.series[0]!.points
    const nulls = pts.filter(p => p.value === null)
    expect(nulls.length).toBeGreaterThan(0)
    for (const p of nulls) {
      expect(p.quality).not.toBe('VALID')
      expect(p.qualityFlags.length).toBeGreaterThan(0)
    }
    for (const p of pts) if (p.qualityFlags.includes('MISSING_VALUE')) expect(p.value).toBeNull()
    const reset = await w.svc.runAnalysis(call(U, A1, hourly({ seriesKeys: [GT2], startAt: '2026-02-24T21:00:00.000Z', endAt: '2026-02-26T21:00:00.000Z' })))
    const flagged = reset.series[0]!.points.filter(p => p.qualityFlags.includes('COUNTER_RESET_UNRESOLVED'))
    expect(flagged.length).toBeGreaterThan(0)
    for (const p of flagged) expect(p.value).toBeNull()
    expect(reset.series[0]!.points.every(p => p.value === null || p.value >= 0)).toBe(true)
  })
})

acceptance('S4 daily analysis', () => {
  it('INDEX is SUM per local day of the hourly buckets; a missing hour is never silently 0; no DST artefacts in Europe/Istanbul', async () => {
    const w = compose()
    const h = await w.svc.runAnalysis(call(U, A1, hourly({ startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-04T21:00:00.000Z' })))
    const d = await w.svc.runAnalysis(call(U, A1, hourly({ startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-04T21:00:00.000Z', bucketInterval: 'DAILY' })))
    expect(d.series[0]!.points).toHaveLength(4)
    d.series[0]!.points.forEach((p, i) => {
      const day = h.series[0]!.points.slice(i * 24, i * 24 + 24)
      if (day.every(x => x.value !== null)) expect(p.value).toBeCloseTo(day.reduce((s, x) => s + (x.value as number), 0), 2)
    })
    const gap = await w.svc.runAnalysis(call(U, A1, { sourceCatalogIds: [EN], seriesKeys: [T2], startAt: '2025-11-17T21:00:00.000Z', endAt: '2025-11-19T21:00:00.000Z', bucketInterval: 'DAILY', timezone: ZONE }))
    const day = gap.series[0]!.points.find(p => p.localWallTime?.startsWith('2025-11-18'))
    expect(day).toBeDefined()
    // the day with 8 missing hours must not look like a complete, clean sum
    expect(day!.isComplete === false || day!.quality !== 'VALID' || day!.qualityFlags.length > 0).toBe(true)
    const eu = await w.svc.runAnalysis(call(U, A1, hourly({ startAt: '2026-03-28T21:00:00.000Z', endAt: '2026-03-29T21:00:00.000Z' })))
    expect(eu.series[0]!.points).toHaveLength(24) // Turkey has no DST: the EU switch day has 24 hourly buckets
    expect(eu.series[0]!.points.every(p => !p.qualityFlags.some(f => /DST/.test(f)))).toBe(true)
  })
})

acceptance('S5 multi series', () => {
  it('several series of one source: deterministic order, all statistics, one flagged series does not block the other', async () => {
    const w = compose()
    const body = hourly({ seriesKeys: [GT3, GT1, GT2] })
    const a = await w.svc.runAnalysis(call(U, A1, { ...body, }))
    const b = await w.svc.runAnalysis(call(U, A1, { ...body, seriesKeys: [GT1, GT2, GT3], }))
    expect(a.series.map(s => s.seriesKey)).toEqual([GT1, GT2, GT3])
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    for (const s of a.series) expect(Object.keys(s.statistics).sort()).toEqual(['average', 'count', 'incompleteCount', 'invalidCount', 'max', 'min', 'missingCount', 'status', 'sum', 'validCount'].sort())
    const mixed = await w.svc.runAnalysis(call(U, A1, { sourceCatalogIds: [EN], seriesKeys: [T1, T2], startAt: '2025-11-17T21:00:00.000Z', endAt: '2025-11-19T21:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }))
    const t1 = mixed.series.find(s => s.seriesKey === T1)!
    const t2 = mixed.series.find(s => s.seriesKey === T2)!
    expect(t2.points.some(p => p.value === null)).toBe(true)
    expect(t1.points.filter(p => p.value !== null).length).toBeGreaterThan(0)
    expect(t1.statistics.validCount as number).toBeGreaterThan(0)
  })
})

acceptance('S6 comparison', () => {
  it('PERIOD: normalised buckets, delta and percentage, "—" (null) percentage for a zero baseline, unmatched buckets stay visible', async () => {
    const w = compose()
    const r = await w.svc.runComparison(call(U, A1, period({ comparison: { startAt: '2026-01-01T21:00:00.000Z', endAt: '2026-01-02T23:00:00.000Z' } }))) // 2 extra hours
    expect(r.mode).toBe('PERIOD')
    const comparable = r.rows.filter(x => x.status === 'COMPARABLE')
    expect(comparable.length).toBeGreaterThan(0)
    for (const x of comparable) expect(x.absoluteDelta).toBeCloseTo((x.comparison as number) - (x.baseline as number), 3)
    const zeroBase = comparable.filter(x => x.baseline === 0)
    expect(zeroBase.length).toBeGreaterThan(0)
    for (const x of zeroBase) expect(x.percentageDelta).toBeNull()
    for (const x of comparable.filter(y => y.baseline !== 0)) expect(typeof x.percentageDelta).toBe('number')
    expect(r.rows.filter(x => x.status === 'BUCKET_UNMATCHED').length).toBeGreaterThan(0)
    expect(JSON.stringify(r)).not.toMatch(/veriler|\.csv|KAYIT_/)
  })

  it('SOURCE: needs an EXPLICIT mapping (no order based pairing); an unmapped series is reported', async () => {
    const w = compose()
    const src = { mode: 'SOURCE', leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesKeys: [GT1, GT2], period: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE }
    expect(await codeOf(w.svc.runComparison(call(U, A1, src)))).toBe('SCADA_MAPPING_REQUIRED')
    const entry = (l: string, r: string) => ({ baseline: { sourceCatalogId: GT, seriesKey: l }, comparison: { sourceCatalogId: SG, seriesKey: r } })
    // GT2 has no partner in the mapping: the comparison is BLOCKED with a static code — nothing is paired by position
    const partial = await w.svc.runComparison(call(U, A1, { ...src, seriesMapping: [entry(GT1, SG1)] }))
    expect(partial).toMatchObject({ status: 'BLOCKED', code: 'SERIES_MAPPING_REQUIRED', rows: [] })
    const mapped = await w.svc.runComparison(call(U, A1, { ...src, seriesKeys: [GT1, SG1], seriesMapping: [entry(GT1, SG1)] }))
    expect(mapped.mode).toBe('SOURCE')
    expect(mapped.rows.some(x => x.status === 'COMPARABLE')).toBe(true)
    for (const x of mapped.rows.filter(y => y.status === 'COMPARABLE')) expect(x.absoluteDelta).toBeCloseTo((x.comparison as number) - (x.baseline as number), 3)
    expect(Array.isArray(mapped.unmatchedSeries)).toBe(true)
  })
})

acceptance('S6b finding: the web SOURCE comparison maps every series to the SAME key on the other source', () => {
  it('a same-key mapping onto a source that has no such series (what the screen used to send) is still refused: no rows (Q-W543 b is closed by the explicit mapping of TASK-027.59-R1)', async () => {
    const w = compose()
    const sameKey = { mode: 'SOURCE', leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesKeys: [GT1], period: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, seriesMapping: [{ baseline: { sourceCatalogId: GT, seriesKey: GT1 }, comparison: { sourceCatalogId: SG, seriesKey: GT1 } }], bucketInterval: 'HOURLY', timezone: ZONE }
    const r = await w.svc.runComparison(call(U, A1, sameKey)).catch((e: ScadaApiError) => e)
    expect(r instanceof ScadaApiError ? r.code : (r as { status: string; rows: unknown[] }).status === 'BLOCKED' && (r as { rows: unknown[] }).rows.length === 0).toBeTruthy()
  })
})

acceptance('S7 virtual column', () => {
  it('create → activate → analyse: a "(sanal)" series with id + version; null input stays null; division by zero is a quality error; the expression never leaves', async () => {
    const w = compose()
    const id = await withVirtual(w, `${T1} + ${T2}`, [T1, T2], EN, 'ENERJI_TOPLAM')
    const r = await w.svc.runAnalysis(call(U, A1, { sourceCatalogIds: [EN], seriesKeys: [T1], virtualColumnIds: [id], startAt: '2025-11-17T21:00:00.000Z', endAt: '2025-11-19T21:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }))
    const v = r.series.find(s => s.virtual)!
    expect(v.virtual).toMatchObject({ virtualColumnId: id, versions: [1] })
    expect(v.points.some(p => p.value === null)).toBe(true) // T2 is missing on 18.11 ⇒ the sum is null
    for (const p of v.points) if (p.value === null) expect(p.qualityFlags.length).toBeGreaterThan(0)
    const divId = await withVirtual(w, `${GT1} / (${GT2} - ${GT2})`, [GT1, GT2], GT, 'DIV0', 'Sıfıra bölme')
    const d = await w.svc.runAnalysis(call(U, A1, hourly({ seriesKeys: [GT1], virtualColumnIds: [divId], endAt: '2025-12-31T23:00:00.000Z' })))
    const dv = d.series.find(s => s.virtual)!
    expect(dv.points.every(p => p.value === null && p.qualityFlags.includes('VIRTUAL_COLUMN_DIVISION_INVALID'))).toBe(true)
    const text = JSON.stringify([r, d, w.queryAudits, w.exportAudits, await w.svc.listVirtualColumns(call(U, A1))])
    expect(text).not.toMatch(/expression|createdBy| \+ |ENERJI_TOPLAM_KWH/)
  })

  it('an invalid formula is refused and stores nothing; only an admin manages; a normal user can list and use', async () => {
    const w = compose()
    for (const expression of ['SELECT 1', 'GT1_ELEKTRIK_URETIM_KWH; DROP', 'eval(1)', `${GT1} + NOPE`, `${GT1}.x`]) {
      const e = await codeOf(w.svc.createVirtualColumn({ actor: { id: 'a-admin' }, tenantId: A1, routeCode: CODE, body: { label: 'X', unit: 'kWh', catalogId: GT, seriesKey: 'BAD', expression, inputSeriesKeys: [GT1] } }))
      expect(['SCADA_VIRTUAL_COLUMN_INVALID', 'SCADA_REQUEST_INVALID']).toContain(e)
    }
    expect(await w.store.listDefinitions('root-A')).toEqual([])
    expect(await codeOf(w.svc.createVirtualColumn({ actor: { id: U }, tenantId: A1, routeCode: CODE, body: { label: 'X', unit: 'kWh', catalogId: GT, seriesKey: 'T', expression: GT1, inputSeriesKeys: [GT1] } }))).toBe('SCADA_SCOPE_DENIED')
    expect((await w.svc.listVirtualColumns(call(U, A1))).canManage).toBe(false)
  })

  it('the in-memory store is emptied by an API restart (a new store) — reported behaviour, not a defect', async () => {
    const w = compose()
    await withVirtual(w, GT1, [GT1])
    expect((await w.svc.listVirtualColumns(call(U, A1))).virtualColumns).toHaveLength(1)
    expect((await compose().svc.listVirtualColumns(call(U, A1))).virtualColumns).toEqual([])
  })
})

acceptance('S8 presets', () => {
  const store = [
    preset(),
    preset({ presetId: 'p-shared', scope: 'TENANT_SHARED', ownerUserId: 'a-admin', name: 'Ortak' }),
    preset({ presetId: 'p-other-user', ownerUserId: 'a-someone-else', name: 'Başkasının' }),
    preset({ presetId: 'p-other-root', customerRootTenantId: 'root-B', scope: 'TENANT_SHARED', ownerUserId: 'b-admin', name: 'Diğer tenant' }),
    preset({ presetId: 'p-off', status: 'DISABLED', name: 'Kapalı' }),
  ]
  it('lists the private + same-root shared presets, never another root\'s or another user\'s private one; no expression', async () => {
    const w = compose({ presets: store })
    const names = (await w.svc.listPresets(call(U, A1))).presets.map(p => p.presetId).sort()
    expect(names).toContain('p-private')
    expect(names).toContain('p-shared')
    expect(names).not.toContain('p-other-root')
    expect(names).not.toContain('p-other-user')
    expect(JSON.stringify(await w.svc.listPresets(call(U, A1)))).not.toMatch(/expression|ownerUserId|a-someone-else/)
  })

  it('applying a preset resolves source, series, range and statistics; running it yields the analysis; another root\'s preset is "not found"', async () => {
    const w = compose({ presets: store })
    const d = await w.svc.getPreset({ ...call(U, A1), param: 'p-shared' })
    expect(d.resolution).toMatchObject({ status: 'RESOLVED' })
    expect(d.preset).toMatchObject({ sourceCatalogIds: [GT], seriesKeys: [GT1], statistics: ['SUM', 'AVERAGE'], bucketInterval: 'HOURLY' })
    const r = await w.svc.runAnalysis(call(U, A1, { presetId: 'p-private' }))
    expect(r.preset).toEqual({ presetId: 'p-private', presetVersion: 1 })
    expect(r.series[0]!.points.length).toBeGreaterThan(0)
    expect(await codeOf(w.svc.runAnalysis(call(U, A1, { presetId: 'p-other-root' })))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(w.svc.getPreset({ ...call(U, A1), param: 'p-other-root' }))).toBe('SCADA_NOT_FOUND')
  })

  it('an inactive preset is not run', async () => {
    const w = compose({ presets: store })
    expect(await codeOf(w.svc.runAnalysis(call(U, A1, { presetId: 'p-off' })))).toBe('SCADA_PRESET_NOT_ACTIVE')
  })
})

acceptance('S9 export of the real analysis (CSV / XLSX / PDF / PNG)', () => {
  const analysisReq = (id: string) => ({ analysis: { sourceCatalogIds: [EN], seriesKeys: [T1], virtualColumnIds: [id], startAt: '2025-11-17T21:00:00.000Z', endAt: '2025-11-19T21:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE, statistics: ['SUM', 'COUNT'] } })

  it('every format carries the filters, the physical + virtual series, quality flags, the development label; null is never 0; nothing physical or expression', async () => {
    const w = compose({ renderer: { configured: true } })
    const id = await withVirtual(w, `${T1} + ${T2}`, [T1, T2], EN, 'ENERJI_TOPLAM')
    const req = analysisReq(id)
    const csv = csvOf(await w.svc.runExport(exp(U, A1, 'CSV', req)))
    expect(csv[0]).toContain('Kalite bayrakları')
    const rows = csv.slice(1, -1)
    expect(rows.every(l => l.includes(SCADA_FIXTURE_DEVELOPMENT_LABEL))).toBe(true)
    expect(rows.some(l => l.includes(`,${id},1,`))).toBe(true)
    const nullRows = rows.filter(l => l.includes('MISSING_VALUE'))
    expect(nullRows.length).toBeGreaterThan(0)
    for (const l of nullRows) expect(l.split(',')[4]).toBe('') // Değer empty, not 0
    expect(rows.some(l => l.includes('Birim belirtilmemiş'))).toBe(true)
    const xlsx = unzip(fileOf(await w.svc.runExport(exp(U, A1, 'XLSX', req))).buffer)
    expect([...(xlsx.get('xl/workbook.xml') ?? '').matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1])).toEqual(['Analysis', 'Statistics', 'Quality'])
    expect(xlsx.get('xl/worksheets/sheet1.xml')).toContain('—')
    fileOf(await w.svc.runExport(exp(U, A1, 'PDF', req)))
    expect(w.rendered).toHaveLength(1)
    expect(w.rendered[0]!.templateId).toBe('scada-analysis-report')
    const flat = JSON.stringify(w.rendered[0]!.rows)
    expect(flat).toContain(SCADA_FIXTURE_DEVELOPMENT_LABEL)
    expect(flat).toContain('MISSING_VALUE')
    expect(flat).toContain(`sanal ${id} v1`)
    const png = await w.svc.runExport(exp(U, A1, 'PNG', req))
    expect(png.kind).toBe('PNG_CAPTION')
    const all = [csv.join('\n'), [...xlsx.values()].join('\n'), flat, JSON.stringify(png)].join('\n')
    expect(all).not.toMatch(/expression|createdBy|veriler|\.csv|KAYIT_TARIHI|Server=|password|ENERJI_TOPLAM_KWH/i)
    expect(w.exportAudits.map(a => [a.format, a.result])).toEqual([['CSV', 'SUCCEEDED'], ['XLSX', 'SUCCEEDED'], ['PDF', 'SUCCEEDED']]) // PNG: no success before completion
  })

  it('comparison export: CSV and XLSX carry the baseline, comparison, deltas, statuses and the development label', async () => {
    const w = compose()
    const req = { comparison: period() }
    const csv = csvOf(await w.svc.runExport(exp(U, A1, 'CSV', req)))
    expect(csv[0]).toMatch(/Temel,Karşılaştırma,Mutlak fark,Yüzde fark,Kalite,Durum/)
    expect(csv.slice(1, -1).every(l => l.includes(SCADA_FIXTURE_DEVELOPMENT_LABEL))).toBe(true)
    expect(csv.slice(1, -1).some(l => l.includes(',COMPARABLE,'))).toBe(true)
    const z = unzip(fileOf(await w.svc.runExport(exp(U, A1, 'XLSX', req))).buffer)
    expect([...(z.get('xl/workbook.xml') ?? '').matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1])).toEqual(['Comparison'])
  })

  it('PNG: the success audit is written only by a verified completion; a wrong actor cannot complete it', async () => {
    const w = compose()
    const r = await w.svc.runExport(exp(U, A1, 'PNG', { analysis: hourly() }))
    if (r.kind !== 'PNG_CAPTION') throw new Error('caption expected')
    expect(w.exportAudits).toEqual([])
    expect(await codeOf(w.svc.completePngExport(call('a-intruder', A1, { exportId: r.exportId, outcome: 'SUCCEEDED' })))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
    const r2 = await w.svc.runExport(exp(U, A1, 'PNG', { analysis: hourly() }))
    if (r2.kind !== 'PNG_CAPTION') throw new Error('caption expected')
    await w.svc.completePngExport(call(U, A1, { exportId: r2.exportId, outcome: 'SUCCEEDED' }))
    expect(w.exportAudits).toEqual([expect.objectContaining({ format: 'PNG', result: 'SUCCEEDED', delivery: 'CLIENT_RENDERED', simulation: true })])
  })

  it('a Jasper failure is a static message; without a configured Jasper the built-in fallback is used and audited as FALLBACK', async () => {
    const bad = compose({ renderer: { configured: true, fail: new BadGatewayException('jdbc:postgresql://internal/x') } })
    const err = await bad.svc.runExport(exp(U, A1, 'PDF', { analysis: hourly() })).catch(e => e)
    expect(err.code).toBe('SCADA_EXPORT_RENDER_FAILED')
    expect(JSON.stringify(err)).not.toMatch(/jdbc|internal/)
    const fb = compose({ renderer: { configured: false } })
    expect(fileOf(await fb.svc.runExport(exp(U, A1, 'PDF', { analysis: hourly() }))).buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(fb.exportAudits[0]).toMatchObject({ rendererMode: 'FALLBACK' })
  })
})

acceptance('S10 tenant isolation', () => {
  it('root A\'s virtual column, presets and export context are invisible to root B; the excluded organisation, a platform root, an inactive and an unresolved tenant get nothing', async () => {
    const w = compose({ presets: [preset()] })
    const id = await withVirtual(w, GT1, [GT1])
    expect((await w.svc.listVirtualColumns(call('b-user', 'b-t1'))).virtualColumns).toEqual([])
    expect(await codeOf(w.svc.runAnalysis(call('b-user', 'b-t1', hourly({ virtualColumnIds: [id] }))))).not.toBe('OK')
    expect((await w.svc.listPresets(call('b-user', 'b-t1'))).presets).toEqual([])
    for (const [, rec] of [['excluded organisation', tenantOf('x-t', { slug: 'Mosedaş' })], ['platform root', tenantOf('x-t', { type: 'PLATFORM_ROOT' })], ['inactive', tenantOf('x-t', { status: 'SUSPENDED' })], ['unresolved', null]] as const) {
      const iso = compose({ tenant: () => rec })
      expect(await codeOf(iso.svc.runAnalysis(call(U, 'x-t', hourly())))).toBe('SCADA_SCOPE_DENIED')
      expect(await codeOf(iso.svc.runExport(exp(U, 'x-t', 'CSV', { analysis: hourly() })))).toBe('SCADA_SCOPE_DENIED')
      expect(iso.queryAudits.every(a => a.actionCode !== 'SCADA_QUERY_SUCCEEDED')).toBe(true)
      expect(iso.exportAudits.every(a => a.result === 'FAILED')).toBe(true)
    }
    const cat = await compose({ tenant: t => tenantOf(t) }).svc.getCatalog(call(U, A1))
    expect(JSON.stringify(cat)).not.toMatch(/mosedas|mosedaş/i)
  })
})

acceptance('S11 fail-closed', () => {
  it('fixture off / bridge off: the fixture providers and the dev-only controller do not exist', () => {
    const off = { ...ENV, REPORTING_DEV_FIXTURES: 'false' } as NodeJS.ProcessEnv
    const tokens = (e: NodeJS.ProcessEnv) => scadaApiProviders(e).map(p => (p as { provide: unknown }).provide)
    expect(tokens(off)).not.toContain(SCADA_SOURCE_CATALOG)
    expect(tokens(off)).not.toContain(SCADA_ANALYSIS_QUERY)
    expect(tokens({ ...ENV, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).not.toContain(SCADA_SOURCE_CATALOG)
    expect(tokens(ENV)).toContain(SCADA_SOURCE_CATALOG)
    const noBridge = { ...ENV, [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'false' } as NodeJS.ProcessEnv
    expect(scadaApiControllers(noBridge)).toEqual([ScadaAnalysisController])
    expect(scadaApiControllers(ENV)).toEqual([ScadaAnalysisController, ScadaVirtualColumnController, ScadaPresetController])
  })

  it('missing zone, no provider, no limits, unreachable catalog, empty result, audit down: none looks like a success', async () => {
    const noZone = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' } as NodeJS.ProcessEnv
    expect(await codeOf(compose({ env: noZone }).svc.runAnalysis(call(U, A1, hourly())))).toBe('SCADA_TIMEZONE_MISMATCH')
    expect(await codeOf(compose({ omit: ['sources', 'query'] }).svc.runAnalysis(call(U, A1, hourly())))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    expect(await codeOf(compose({ omit: ['limits'] }).svc.runAnalysis(call(U, A1, hourly())))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
    expect(await codeOf(compose({ omit: ['limits'] }).svc.runExport(exp(U, A1, 'CSV', { analysis: hourly() })))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
    expect(await codeOf(compose({ failQueryAudit: true }).svc.runAnalysis(call(U, A1, hourly())))).toBe('SCADA_AUDIT_FAILED')
    expect(await codeOf(compose({ failExportAudit: true }).svc.runExport(exp(U, A1, 'CSV', { analysis: hourly() })))).toBe('SCADA_AUDIT_FAILED')
    expect(await codeOf(compose({ omit: ['exportAudit'] }).svc.runExport(exp(U, A1, 'CSV', { analysis: hourly() })))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    const w = compose()
    const empty = hourly({ startAt: '2030-01-01T00:00:00.000Z', endAt: '2030-01-01T06:00:00.000Z' })
    const r = await w.svc.runAnalysis(call(U, A1, empty)).catch((e: ScadaApiError) => e)
    expect(r instanceof ScadaApiError || (r as { status: string }).status === 'BLOCKED').toBe(true)
    expect(await codeOf(w.svc.runExport(exp(U, A1, 'CSV', { analysis: empty })))).toBe('SCADA_EXPORT_EMPTY')
  })

  it('a source with no verified series is listed as not selectable and cannot be analysed', async () => {
    const w = compose()
    const real = w.fixture.catalog
    const stub = { ...real, listSources: async (s: Parameters<typeof real.listSources>[0]) => (await real.listSources(s)).map(x => ({ ...x, series: [] })) }
    const svc = new ScadaAnalysisApiService({
      scopes: { resolve: async t => ({ tenantId: t, customerRootTenantId: rootOf(t), dataScopeTenantIds: [t] }) },
      callers: { describe: async (_u, t) => ({ tenant: tenantOf(t), userActive: true }) },
      artifacts: { assertExists: async () => undefined },
      clock: { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => 'c' },
      audit: { record: async () => undefined },
      sources: stub,
      query: w.fixture.queryService({ record: async () => undefined }, { nowMs: () => 0, correlationId: () => 'c' }),
      limits: { get: () => DEV_FIXTURE_API_LIMITS },
    })
    const cat = await svc.getCatalog(call(U, A1))
    expect(cat.sources.every(s => !s.selectable && s.blockedReason === 'NO_SERIES' && s.series.every(x => x.available === false))).toBe(true)
    expect(await codeOf(svc.runAnalysis(call(U, A1, hourly())))).not.toBe('OK')
  })
})
