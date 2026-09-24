import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaComparisonService } from '../../comparison/scada-comparison.service'
import { ScadaMultiSeriesService } from '../../series/scada-multi-series.service'
import type { ScadaOutputBucket, ScadaSeriesOutput } from '../../series/scada-series.contract'
import type { VirtualColumnDefinition, VirtualColumnLimits } from '../../virtual-columns/virtual-column.contract'
import { VirtualColumnService } from '../../virtual-columns/virtual-column.service'
import { planToComparisonInputs, planToSeriesRequestBase, resolvePreset, selectPlannedDefinitions } from '../scada-preset-resolver'
import { canUsePreset, findForbiddenKey } from '../scada-preset-security'
import { canTransition, checkAppendOnly, checkVersionSet } from '../scada-preset-versioning'
import type { PresetAuditEvent, PresetCaller, PresetLimits, PresetResolveRequest, PresetSourceInfo, ScadaPreset } from '../scada-preset.contract'
import { ScadaPresetService } from '../scada-preset.service'
import { validatePreset } from '../scada-preset.validator'

/** Synthetic fixtures only. Every limit below is a TEST parameter, not a proposed production value. */
const ROOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ROOT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T_A = '11111111-1111-4111-8111-111111111111'
const CAT1 = '00000000-0000-4000-8000-000000000001'
const CAT2 = '00000000-0000-4000-8000-000000000002'
const ZONE = 'Europe/Istanbul'
const LIMITS: PresetLimits = { maxNameLength: 80, maxDescriptionLength: 200, maxSourceCount: 4, maxSeriesCount: 6, maxVirtualColumnCount: 3, maxPageSize: 50 }
const AT = '2026-03-01T00:00:00.000Z'
const tenant = (over: Partial<TenantRecord> = {}) => ({ id: T_A, slug: 'tenant-a', type: 'STANDARD', status: 'ACTIVE', ...over }) as unknown as TenantRecord

function preset(over: Record<string, unknown> = {}): ScadaPreset {
  return {
    presetId: 'preset-1', customerRootTenantId: ROOT, ownerUserId: 'u-1', scope: 'PRIVATE', name: 'Haftalık tüketim', description: 'Açıklama', version: 1, status: 'ACTIVE',
    sourceCatalogIds: [CAT1], seriesKeys: ['A', 'B'], virtualColumns: [], statistics: ['SUM', 'AVERAGE'], comparison: { mode: 'NONE' }, filters: {},
    timeRange: { startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-02-08T00:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE, display: { chartType: 'LINE' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', effectiveFrom: null, effectiveTo: null, ...over,
  } as ScadaPreset
}
const source = (over: Partial<PresetSourceInfo> = {}): PresetSourceInfo => ({ catalogId: CAT1, customerRootTenantId: ROOT, active: true, mappingResolved: true, tenant: tenant(), sourceTimeZone: ZONE, seriesKeys: ['A', 'B', 'C'], ...over })
const caller = (over: Partial<PresetCaller> = {}): PresetCaller => ({ userId: 'u-1', userActive: true, tenant: tenant(), scope: { tenantId: T_A, customerRootTenantId: ROOT, dataScopeTenantIds: [ROOT, T_A] }, ...over })
function vcDef(over: Partial<VirtualColumnDefinition> = {}): VirtualColumnDefinition {
  return { virtualColumnId: 'vc-1', catalogId: CAT1, customerRootTenantId: ROOT, seriesKey: 'SANAL', label: 'Sanal', unit: 'kWh', expression: 'A + B', inputSeriesKeys: ['A', 'B'], valueType: 'INDEX', version: 1, effectiveFrom: null, effectiveTo: null, status: 'ACTIVE', createdBy: 'actor-1', updatedAt: '2026-01-01T00:00:00.000Z', ...over }
}
function req(over: Partial<PresetResolveRequest> = {}): PresetResolveRequest {
  return { caller: caller(), presetVersions: [preset()], at: AT, limits: LIMITS, sources: [source()], virtualColumnDefinitions: [], ...over }
}
const code = (r: ReturnType<typeof resolvePreset>) => (r.ok ? 'OK' : r.code)
const invalid = (over: Record<string, unknown>) => {
  const r = validatePreset({ ...preset(), ...over }, LIMITS)
  return r.ok ? 'OK' : r.code
}

describe('PRIVATE and TENANT_SHARED access', () => {
  it('a PRIVATE preset resolves for its owner only — not for another user of the same tenant', () => {
    expect(code(resolvePreset(req()))).toBe('OK')
    expect(code(resolvePreset(req({ caller: caller({ userId: 'u-2' }) })))).toBe('PRESET_SCOPE_BLOCKED')
  })
  it('a TENANT_SHARED preset resolves for every active user of the SAME root, never for another root', () => {
    const shared = preset({ scope: 'TENANT_SHARED' })
    expect(code(resolvePreset(req({ presetVersions: [shared], caller: caller({ userId: 'u-2' }) })))).toBe('OK')
    const foreign = caller({ userId: 'u-9', scope: { tenantId: T_A, customerRootTenantId: OTHER_ROOT, dataScopeTenantIds: [OTHER_ROOT, T_A] } })
    expect(code(resolvePreset(req({ presetVersions: [shared], caller: foreign })))).toBe('PRESET_SCOPE_BLOCKED')
    expect(code(resolvePreset(req({ presetVersions: [preset()], caller: foreign })))).toBe('PRESET_SCOPE_BLOCKED')
  })
  it('a preset of another root reveals NOTHING beyond PRESET_SCOPE_BLOCKED (not even a validation error)', () => {
    const broken = { ...preset({ customerRootTenantId: OTHER_ROOT }), name: 'x'.repeat(500), bogusField: 1 }
    expect(resolvePreset(req({ presetVersions: [broken as never] }))).toEqual({ ok: false, code: 'PRESET_SCOPE_BLOCKED' })
  })
  it.each([
    ['unresolved tenant', { tenant: null }],
    ['inactive tenant', { tenant: tenant({ status: 'SUSPENDED' }) }],
    ['the excluded organisation (never a tenant)', { tenant: tenant({ slug: 'Mosedaş' }) }],
    ['platform root', { tenant: tenant({ type: 'PLATFORM_ROOT' }) }],
    ['a tenant outside the resolved data scope', { tenant: tenant({ id: '99999999-9999-4999-8999-999999999999' }) }],
    ['an inactive user (also an inactive owner)', { userActive: false }],
  ])('%s ⇒ PRESET_SCOPE_BLOCKED (for PRIVATE and TENANT_SHARED alike)', (_n, over) => {
    for (const scope of ['PRIVATE', 'TENANT_SHARED'] as const) expect(code(resolvePreset(req({ presetVersions: [preset({ scope })], caller: caller(over as never) })))).toBe('PRESET_SCOPE_BLOCKED')
  })
  it('canUsePreset is fail-closed on a malformed caller', () => {
    for (const bad of [undefined, null, {}, { scope: null }, { userId: 'u-1', scope: { customerRootTenantId: ROOT } }] as never[]) expect(canUsePreset(preset(), bad)).toBe(false)
  })
})

describe('sources and tenant isolation', () => {
  it.each([
    ['the source is not in the catalog view', { sources: [] }],
    ['an unresolved mapping', { sources: [source({ mappingResolved: false })] }],
    ['an inactive source', { sources: [source({ active: false })] }],
    ['a source of another root', { sources: [source({ customerRootTenantId: OTHER_ROOT })] }],
    ['no mapped tenant', { sources: [source({ tenant: null })] }],
    ['an inactive mapped tenant', { sources: [source({ tenant: tenant({ status: 'ARCHIVED' }) })] }],
    ['the excluded organisation as mapped tenant', { sources: [source({ tenant: tenant({ slug: 'MOSEDAŞ' }) })] }],
    ['a platform-root mapped tenant', { sources: [source({ tenant: tenant({ type: 'PLATFORM_ROOT' }) })] }],
    ['a mapped tenant outside the data scope', { sources: [source({ tenant: tenant({ id: '99999999-9999-4999-8999-999999999999' }) })] }],
    ['an ambiguous catalog view (the same source twice)', { sources: [source(), source()] }],
  ])('%s ⇒ the WHOLE plan is blocked without naming anything', (_n, over) => {
    const r = resolvePreset(req(over as never))
    expect(r).toEqual({ ok: false, code: 'PRESET_SCOPE_BLOCKED' })
  })
  it('an unverified / different source time zone blocks (PRESET_TIMEZONE_UNVERIFIED); nothing is converted silently', () => {
    expect(code(resolvePreset(req({ sources: [source({ sourceTimeZone: null })] })))).toBe('PRESET_TIMEZONE_UNVERIFIED')
    expect(code(resolvePreset(req({ sources: [source({ sourceTimeZone: 'Europe/Berlin' })] })))).toBe('PRESET_TIMEZONE_UNVERIFIED')
    expect(code(resolvePreset(req({ sources: [source({ sourceTimeZone: '+03:00' })] })))).toBe('PRESET_TIMEZONE_UNVERIFIED')
  })
  it('a selected series the catalog does not approve blocks the plan (PRESET_INVALID)', () => {
    expect(code(resolvePreset(req({ presetVersions: [preset({ seriesKeys: ['A', 'NOT_APPROVED'] })] })))).toBe('PRESET_INVALID')
  })
  it('a series is planned for EVERY selected source that approves it (deterministic, sorted)', () => {
    const r = resolvePreset(req({ presetVersions: [preset({ sourceCatalogIds: [CAT2, CAT1], seriesKeys: ['B', 'A'] })], sources: [source({ catalogId: CAT2, seriesKeys: ['A'] }), source()] }))
    expect(r.ok && r.plan.series).toEqual([{ sourceCatalogId: CAT1, seriesKey: 'A' }, { sourceCatalogId: CAT1, seriesKey: 'B' }, { sourceCatalogId: CAT2, seriesKey: 'A' }])
  })
  it('the plan and every error carry no other tenant\'s source, series or label', () => {
    const r = resolvePreset(req({ sources: [source(), source({ catalogId: CAT2, customerRootTenantId: OTHER_ROOT, seriesKeys: ['GIZLI_SERI'] })] }))
    expect(JSON.stringify(r)).not.toMatch(/GIZLI|bbbbbbbb|0000000-0000-4000-8000-000000000002/)
  })
})

describe('validation (fail-closed)', () => {
  it('a valid preset passes and is returned as a detached copy', () => {
    const input = preset()
    const r = validatePreset(input, LIMITS)
    expect(r.ok && r.preset).toEqual(input)
    if (r.ok) {
      r.preset.name = 'changed'
      expect(input.name).toBe('Haftalık tüketim')
    }
  })
  it.each([
    ['schemaName', 'dbo'], ['databaseName', 'MOSB ENERJI DB'], ['database', 'x'], ['schema', 'x'], ['tableName', 't'], ['table', 't'], ['physicalSource', 'x'], ['connectionString', 'Server=x'],
    ['sql', 'SELECT 1'], ['query', 'x'], ['expression', 'A + B'], ['ast', {}], ['password', 'p'], ['apiToken', 't'], ['secret', 's'], ['passwordHash', 'h'], ['credentials', {}], ['host', 'h'], ['code', 'alert(1)'], ['renderer', 'x'], ['component', 'MyChart'], ['html', '<b>'], ['css', 'x'], ['script', 'x'], ['extra', 1],
  ])('an unknown top-level field %s is refused (PRESET_UNKNOWN_FIELD)', (key, value) => {
    expect(invalid({ [key as string]: value })).toBe('PRESET_UNKNOWN_FIELD')
  })
  it('unknown nested fields are refused too (comparison, filters, display, timeRange, table options, mapping)', () => {
    expect(invalid({ comparison: { mode: 'NONE', schemaName: 'x' } })).toBe('PRESET_UNKNOWN_FIELD')
    expect(invalid({ comparison: { mode: 'PERIOD', comparisonRange: { startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-02T00:00:00Z', database: 'x' } } })).toBe('PRESET_UNKNOWN_FIELD')
    expect(invalid({ filters: { rawSql: 'x' } })).toBe('PRESET_UNKNOWN_FIELD')
    expect(invalid({ filters: { password: 'x' } })).toBe('PRESET_UNKNOWN_FIELD')
    expect(invalid({ display: { chartType: 'LINE', cssClass: 'x' } })).toBe('PRESET_UNKNOWN_FIELD')
    expect(invalid({ display: { chartType: 'LINE', tableOptions: { pageSize: 10, table: 'x' } } })).toBe('PRESET_UNKNOWN_FIELD')
    expect(invalid({ timeRange: { startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-02T00:00:00Z', tz: 'x' } })).toBe('PRESET_UNKNOWN_FIELD')
    expect(invalid({ comparison: { mode: 'SOURCE', leftSourceCatalogId: CAT1, rightSourceCatalogId: CAT2, seriesMapping: [{ baseline: { sourceCatalogId: CAT1, seriesKey: 'A', schema: 'x' }, comparison: { sourceCatalogId: CAT2, seriesKey: 'A' } }] } })).toBe('PRESET_UNKNOWN_FIELD')
  })
  it('the virtual column reference holds ONLY id (+ version): an expression / AST / SQL / any other field is refused', () => {
    expect(invalid({ virtualColumns: [{ virtualColumnId: 'vc-1' }, { virtualColumnId: 'vc-2', version: 3 }] })).toBe('OK')
    for (const extra of [{ expression: 'A + B' }, { ast: {} }, { sql: 'SELECT 1' }, { tableName: 't' }, { code: 'x' }, { label: 'x' }]) {
      expect(invalid({ virtualColumns: [{ virtualColumnId: 'vc-1', ...extra }] })).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    }
    for (const bad of [{ virtualColumnId: 'a b' }, { virtualColumnId: '' }, { virtualColumnId: 'vc-1', version: 0 }, { virtualColumnId: 'vc-1', version: 1.5 }, null, 'x']) expect(invalid({ virtualColumns: [bad] })).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
  })
  it('duplicates are refused, never merged: sources, series, virtual columns', () => {
    expect(invalid({ sourceCatalogIds: [CAT1, CAT1] })).toBe('PRESET_DUPLICATE_SOURCE')
    expect(invalid({ seriesKeys: ['A', 'A'] })).toBe('PRESET_DUPLICATE_SERIES')
    expect(invalid({ virtualColumns: [{ virtualColumnId: 'vc-1' }, { virtualColumnId: 'vc-1', version: 2 }] })).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
  })
  it('scope, tenant, owner, id, texts, statuses', () => {
    expect(invalid({ scope: 'PUBLIC' })).toBe('PRESET_SCOPE_INVALID')
    expect(invalid({ scope: undefined })).toBe('PRESET_SCOPE_INVALID')
    expect(invalid({ scope: 'PRIVATE', ownerUserId: null })).toBe('PRESET_OWNER_REQUIRED')
    expect(invalid({ scope: 'PRIVATE', ownerUserId: '  ' })).toBe('PRESET_OWNER_REQUIRED')
    expect(invalid({ scope: 'TENANT_SHARED', ownerUserId: null })).toBe('OK')
    expect(invalid({ customerRootTenantId: '' })).toBe('PRESET_TENANT_REQUIRED')
    expect(invalid({ customerRootTenantId: undefined })).toBe('PRESET_TENANT_REQUIRED')
    for (const id of ['', 'a b', '../x', 'x'.repeat(65), "x'; DROP--", 5]) expect(invalid({ presetId: id })).toBe('PRESET_INVALID')
    for (const bad of [{ name: '' }, { name: 'x'.repeat(81) }, { name: 'a\nb' }, { name: 5 }, { description: 'x'.repeat(201) }, { description: 5 }, { version: 0 }, { version: 'x' }, { status: 'LIVE' }, { createdAt: 'x' }, { effectiveFrom: 'x' }, { effectiveFrom: '2026-02-01T00:00:00Z', effectiveTo: '2026-01-01T00:00:00Z' }]) expect(invalid(bad)).toBe('PRESET_INVALID')
    expect(invalid({ description: null })).toBe('OK')
  })
  it('connection-string-like free text is refused', () => {
    for (const t of ['Server=db01;Password=x', 'Data Source=x', 'pwd = 1', 'user id=sa']) {
      expect(invalid({ name: t })).toBe('PRESET_INVALID')
      expect(invalid({ description: t })).toBe('PRESET_INVALID')
      expect(invalid({ seriesKeys: [t] })).toBe('PRESET_INVALID')
    }
  })
  it('interval, time range, time zone', () => {
    expect(invalid({ bucketInterval: 'WEEKLY' })).toBe('PRESET_INVALID_INTERVAL')
    expect(invalid({ bucketInterval: undefined })).toBe('PRESET_INVALID_INTERVAL')
    for (const tr of [{ startAt: '2026-02-02T00:00:00Z', endAt: '2026-02-01T00:00:00Z' }, { startAt: '2026-02-01T00:00:00Z', endAt: '2026-02-01T00:00:00Z' }, { startAt: 'x', endAt: 'y' }, null, { startAt: '2026-02-01T00:00:00Z' }]) expect(invalid({ timeRange: tr })).toBe('PRESET_INVALID_TIME_RANGE')
    for (const tz of ['+03:00', 'Turkey Standard Time', '', 'Nope/Zone', undefined, null, 5]) expect(invalid({ timezone: tz })).toBe('PRESET_TIMEZONE_UNVERIFIED')
  })
  it('statistics allowlist, filters and display allowlist (symbols only)', () => {
    expect(invalid({ statistics: ['SUM', 'MEDIAN'] })).toBe('PRESET_INVALID')
    expect(invalid({ statistics: ['SUM', 'SUM'] })).toBe('PRESET_INVALID')
    expect(invalid({ statistics: ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'VALID_COUNT', 'MISSING_COUNT', 'INVALID_COUNT', 'INCOMPLETE_COUNT'] })).toBe('OK')
    expect(invalid({ filters: { qualityStates: ['VALID', 'NOT_A_STATE'] } })).toBe('PRESET_INVALID')
    expect(invalid({ filters: { qualityStates: ['DST_AMBIGUOUS'], onlyAnalysisAllowed: true } })).toBe('OK')
    for (const chartType of ['LINE', 'BAR', 'AREA', 'TABLE']) expect(invalid({ display: { chartType } })).toBe('OK')
    for (const chartType of ['PIE', '<script>alert(1)</script>', 'MyCustomComponent', 'javascript:x', 'line', '', undefined, 5]) expect(invalid({ display: { chartType } })).toBe('PRESET_INVALID')
    expect(invalid({ display: { chartType: 'TABLE', tableOptions: { sortBy: 'value', sortDirection: 'DESC', pageSize: 50, page: 2 } } })).toBe('OK')
    for (const t of [{ sortBy: 'password' }, { sortDirection: 'UP' }, { pageSize: 51 }, { pageSize: 0 }, { page: 0 }, { pageSize: 1.5 }]) expect(invalid({ display: { chartType: 'TABLE', tableOptions: t } })).toBe('PRESET_INVALID')
  })
  it('comparison settings must fit the contract', () => {
    const range = { startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-08T00:00:00Z' }
    expect(invalid({ comparison: { mode: 'PERIOD', comparisonRange: range, decimals: 2 } })).toBe('OK')
    expect(invalid({ comparison: { mode: 'PERIOD', comparisonRange: { startAt: 'x', endAt: 'y' } } })).toBe('PRESET_INVALID_TIME_RANGE')
    expect(invalid({ comparison: { mode: 'PERIOD' } })).toBe('PRESET_INVALID_TIME_RANGE')
    expect(invalid({ comparison: { mode: 'SOURCE', leftSourceCatalogId: CAT1, rightSourceCatalogId: CAT2 } })).toBe('OK')
    expect(invalid({ comparison: { mode: 'SOURCE', leftSourceCatalogId: CAT1, rightSourceCatalogId: CAT1 } })).toBe('PRESET_INVALID')
    expect(invalid({ comparison: { mode: 'SOURCE', leftSourceCatalogId: 'MOSB ENERJI DB', rightSourceCatalogId: CAT2 } })).toBe('PRESET_INVALID')
    expect(invalid({ comparison: { mode: 'AUTO' } })).toBe('PRESET_INVALID')
    expect(invalid({ comparison: { mode: 'PERIOD', comparisonRange: range, decimals: 13 } })).toBe('PRESET_INVALID')
    expect(invalid({ comparison: null })).toBe('PRESET_INVALID')
  })
  it('counts are bounded by the external limits; missing / invalid limits fail closed', () => {
    expect(invalid({ sourceCatalogIds: [CAT1, CAT2, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005'] })).toBe('PRESET_INVALID')
    expect(invalid({ seriesKeys: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] })).toBe('PRESET_INVALID')
    expect(invalid({ virtualColumns: [1, 2, 3, 4].map(i => ({ virtualColumnId: `v${i}` })) })).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    expect(invalid({ seriesKeys: [], virtualColumns: [] })).toBe('PRESET_INVALID') // nothing to analyse
    for (const k of Object.keys(LIMITS)) {
      expect(validatePreset(preset(), { ...LIMITS, [k]: undefined })).toEqual({ ok: false, code: 'PRESET_INVALID' })
      expect(validatePreset(preset(), { ...LIMITS, [k]: 0 })).toEqual({ ok: false, code: 'PRESET_INVALID' })
    }
    expect(validatePreset(preset(), null)).toEqual({ ok: false, code: 'PRESET_INVALID' })
    for (const bad of [null, undefined, 'x', 5, []]) expect(validatePreset(bad, LIMITS)).toEqual({ ok: false, code: 'PRESET_INVALID' })
  })
})

describe('virtual column references → resolved versions', () => {
  const withVc = (vcs: Array<{ virtualColumnId: string; version?: number }>, defs: VirtualColumnDefinition[], over: Record<string, unknown> = {}) => resolvePreset(req({ presetVersions: [preset({ virtualColumns: vcs, ...over })], virtualColumnDefinitions: defs }))
  it('the preset holds no expression; the plan carries only the RESOLVED version and ids', () => {
    const r = withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ expression: 'A + B + 987654' })])
    expect(r.ok && r.plan.virtualColumns).toEqual([{ virtualColumnId: 'vc-1', version: 1, catalogId: CAT1, seriesKey: 'SANAL' }])
    expect(JSON.stringify(r)).not.toMatch(/987654|A \+ B/)
  })
  it('without a pinned version the single version EFFECTIVE at the resolution time is chosen (window [from, to))', () => {
    const v1 = vcDef({ version: 1, effectiveTo: '2026-03-01T00:00:00.000Z' })
    const v2 = vcDef({ version: 2, effectiveFrom: '2026-03-01T00:00:00.000Z' })
    const at = (iso: string) => resolvePreset(req({ presetVersions: [preset({ virtualColumns: [{ virtualColumnId: 'vc-1' }] })], virtualColumnDefinitions: [v1, v2], at: iso }))
    const pickV = (r: ReturnType<typeof resolvePreset>) => (r.ok ? r.plan.virtualColumns[0]!.version : code(r))
    expect(pickV(at('2026-02-28T23:59:59.999Z'))).toBe(1)
    expect(pickV(at('2026-03-01T00:00:00.000Z'))).toBe(2) // to is exclusive, from is inclusive
  })
  it('a pinned version is used exactly (and must be ACTIVE and effective)', () => {
    const v1 = vcDef({ version: 1 })
    const v2 = vcDef({ version: 2, effectiveFrom: '2027-01-01T00:00:00.000Z' })
    expect(withVc([{ virtualColumnId: 'vc-1', version: 1 }], [v1, v2]).ok).toBe(true)
    expect(code(withVc([{ virtualColumnId: 'vc-1', version: 2 }], [v1, v2]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID') // not effective yet
    expect(code(withVc([{ virtualColumnId: 'vc-1', version: 9 }], [v1]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    expect(code(withVc([{ virtualColumnId: 'vc-1', version: 1 }], [vcDef({ status: 'DISABLED' })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
  })
  it('several effective versions and no pin ⇒ PRESET_VIRTUAL_COLUMN_VERSION_AMBIGUOUS — never a silent choice', () => {
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ version: 1 }), vcDef({ version: 2 })]))).toBe('PRESET_VIRTUAL_COLUMN_VERSION_AMBIGUOUS')
    // …but a pin resolves the ambiguity explicitly
    expect(withVc([{ virtualColumnId: 'vc-1', version: 2 }], [vcDef({ version: 1 }), vcDef({ version: 2 })]).ok).toBe(true)
  })
  it('an unknown / inactive / not-yet-effective reference blocks the WHOLE plan', () => {
    expect(code(withVc([{ virtualColumnId: 'nope' }], [vcDef()]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ status: 'DRAFT' })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ effectiveFrom: '2027-01-01T00:00:00.000Z' })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ label: 'x'.repeat(200) })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    expect(code(withVc([{ virtualColumnId: 'vc-1' }, { virtualColumnId: 'vc-2' }], [vcDef()]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID') // one of two missing ⇒ nothing runs
  })
  it('a virtual column of another tenant never resolves; a catalog-incompatible one is refused', () => {
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ customerRootTenantId: OTHER_ROOT })]))).toBe('PRESET_SCOPE_BLOCKED')
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ catalogId: CAT2 })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID') // not one of the preset's sources
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ inputSeriesKeys: ['A', 'NOT_APPROVED'] })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID')
    expect(code(withVc([{ virtualColumnId: 'vc-1' }], [vcDef({ seriesKey: 'A' })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID') // would shadow a real series
    expect(code(withVc([{ virtualColumnId: 'vc-1' }, { virtualColumnId: 'vc-2' }], [vcDef(), vcDef({ virtualColumnId: 'vc-2' })]))).toBe('PRESET_VIRTUAL_COLUMN_INVALID') // same seriesKey twice
  })
})

describe('preset versions', () => {
  const v = (over: Record<string, unknown>) => preset({ scope: 'TENANT_SHARED', ...over })
  it('the ACTIVE version effective now is used; window [effectiveFrom, effectiveTo)', () => {
    const v1 = v({ version: 1, effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: '2026-03-01T00:00:00.000Z', name: 'Eski' })
    const v2 = v({ version: 2, effectiveFrom: '2026-03-01T00:00:00.000Z', name: 'Yeni', createdAt: '2026-02-01T00:00:00.000Z' })
    const at = (iso: string) => resolvePreset(req({ presetVersions: [v2, v1], caller: caller({ userId: 'u-2' }), at: iso }))
    const ver = (r: ReturnType<typeof resolvePreset>) => (r.ok ? r.plan.presetVersion : code(r))
    expect(ver(at('2026-02-28T23:59:59.999Z'))).toBe(1)
    expect(ver(at('2026-03-01T00:00:00.000Z'))).toBe(2)
    expect(ver(at('2025-12-31T00:00:00.000Z'))).toBe('PRESET_NOT_ACTIVE')
  })
  it.each(['DRAFT', 'DISABLED', 'BLOCKED', 'ARCHIVED'] as const)('a %s preset is never run', status => {
    expect(code(resolvePreset(req({ presetVersions: [preset({ status })] })))).toBe('PRESET_NOT_ACTIVE')
  })
  it('conflicting versions ⇒ PRESET_VERSION_CONFLICT and nothing resolves', () => {
    const base = { scope: 'TENANT_SHARED' }
    const cases: ScadaPreset[][] = [
      [preset({ ...base, version: 1 }), preset({ ...base, version: 1, createdAt: '2026-02-01T00:00:00.000Z' })], // the same version twice
      [preset({ ...base, version: 1 }), preset({ ...base, version: 2, createdAt: '2026-02-01T00:00:00.000Z' })], // two open ACTIVE windows overlap
      [preset({ ...base, version: 1, effectiveTo: '2026-06-01T00:00:00.000Z' }), preset({ ...base, version: 2, effectiveFrom: '2026-05-01T00:00:00.000Z', createdAt: '2026-02-01T00:00:00.000Z' })],
      [preset({ ...base, version: 1, createdAt: '2026-05-01T00:00:00.000Z', effectiveTo: '2026-03-01T00:00:00.000Z' }), preset({ ...base, version: 2, effectiveFrom: '2026-03-01T00:00:00.000Z', createdAt: '2026-02-01T00:00:00.000Z' })], // not monotonic
      [preset({ ...base, version: 1 }), preset({ ...base, presetId: 'other', version: 2 })], // mixed presets
      [preset({ ...base, version: 1 }), preset({ ...base, version: 2, ownerUserId: 'u-9', effectiveFrom: '2027-01-01T00:00:00.000Z' })],
    ]
    for (const versions of cases) expect(code(resolvePreset(req({ presetVersions: versions, caller: caller({ userId: 'u-2' }) })))).toBe('PRESET_VERSION_CONFLICT')
    expect(checkVersionSet([])).toEqual({ ok: false, code: 'PRESET_VERSION_CONFLICT' })
  })
  it('touching windows [a,b) and [b,c) do not overlap; a non-ACTIVE version never conflicts', () => {
    const v1 = v({ version: 1, effectiveTo: '2026-03-01T00:00:00.000Z' })
    const v2 = v({ version: 2, effectiveFrom: '2026-03-01T00:00:00.000Z', createdAt: '2026-02-01T00:00:00.000Z' })
    expect(checkVersionSet([v1, v2]).ok).toBe(true)
    expect(checkVersionSet([v({ version: 1 }), v({ version: 2, status: 'DRAFT', createdAt: '2026-02-01T00:00:00.000Z' })]).ok).toBe(true)
  })
  it('append-only: a new version must be higher; an existing version keeps its content and only moves along the allowed status transitions; ARCHIVED never returns', () => {
    const stored = [v({ version: 1, status: 'DISABLED' }), v({ version: 2, status: 'ARCHIVED', createdAt: '2026-02-01T00:00:00.000Z' })]
    expect(checkAppendOnly(stored, v({ version: 3, createdAt: '2026-03-01T00:00:00.000Z' })).ok).toBe(true)
    expect(checkAppendOnly(stored, v({ version: 2, createdAt: '2026-03-01T00:00:00.000Z' })).ok).toBe(false)
    expect(checkAppendOnly(stored, v({ version: 1, status: 'ACTIVE' })).ok).toBe(true) // DISABLED → ACTIVE
    expect(checkAppendOnly(stored, v({ version: 1, status: 'DISABLED', name: 'Sessizce değişti' })).ok).toBe(false) // content rewrite
    expect(checkAppendOnly(stored, v({ version: 2, status: 'ACTIVE', createdAt: '2026-02-01T00:00:00.000Z' }))).toEqual({ ok: false, code: 'PRESET_VERSION_CONFLICT' }) // ARCHIVED is terminal
    expect(checkAppendOnly(stored, v({ version: 0 })).ok).toBe(false)
    expect(canTransition('ARCHIVED', 'ACTIVE')).toBe(false)
    expect(canTransition('ACTIVE', 'ACTIVE')).toBe(true)
    expect(canTransition('BLOCKED', 'ACTIVE')).toBe(false)
  })
  it('a corrupt stored version is an ambiguity: the request fails instead of skipping it', () => {
    expect(code(resolvePreset(req({ presetVersions: [preset(), { ...preset({ version: 2 }), bogus: 1 } as never] })))).toBe('PRESET_UNKNOWN_FIELD')
  })
})

describe('the analysis plan', () => {
  const plan = () => {
    const r = resolvePreset(req({ presetVersions: [preset({ virtualColumns: [{ virtualColumnId: 'vc-1' }], statistics: ['MAX', 'SUM'], filters: { qualityStates: ['MISSING_VALUE', 'DST_AMBIGUOUS'], onlyAnalysisAllowed: true }, display: { chartType: 'TABLE', tableOptions: { sortBy: 'value', pageSize: 10 } } })], virtualColumnDefinitions: [vcDef()] }))
    if (!r.ok) throw new Error(r.code)
    return r.plan
  }
  it('carries the tenant scope, versions, settings; no SQL, physical name, credential or expression', () => {
    const p = plan()
    expect(p).toMatchObject({ presetId: 'preset-1', presetVersion: 1, scope: 'PRIVATE', tenantScope: { customerRootTenantId: ROOT, tenantId: T_A, dataScopeTenantIds: [ROOT, T_A].sort() }, timeRange: { startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-02-08T00:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE, resolvedAtUtc: AT, statistics: ['MAX', 'SUM'], filters: { qualityStates: ['DST_AMBIGUOUS', 'MISSING_VALUE'], onlyAnalysisAllowed: true } })
    expect(p.virtualColumns).toEqual([{ virtualColumnId: 'vc-1', version: 1, catalogId: CAT1, seriesKey: 'SANAL' }])
    const text = JSON.stringify(p)
    expect(text).not.toMatch(/SELECT|INSERT|FROM\s|Server=|Password|schema|"table":|database|dbo\.|connection|expression|A \+ B|MOSB/i)
    expect(findForbiddenKey(p)).toBeNull()
  })
  it('the defensive scan finds physical / credential / expression keys anywhere', () => {
    for (const k of ['schemaName', 'database', 'tableName', 'connectionString', 'password', 'apiToken', 'expression', 'sql', 'host']) expect(findForbiddenKey({ a: [{ b: { [k]: 1 } }] })).not.toBeNull()
    expect(findForbiddenKey({ sourceCatalogId: 'x', seriesKeys: [], tableOptions: {}, description: 'x', virtualColumnId: 'y', statistics: [] })).toBeNull()
  })
  it('is deterministic: the same plan for any input order; the input is never mutated', () => {
    const request = req({ presetVersions: [preset({ sourceCatalogIds: [CAT2, CAT1], seriesKeys: ['B', 'A'], virtualColumns: [{ virtualColumnId: 'vc-2' }, { virtualColumnId: 'vc-1' }], statistics: ['SUM', 'AVERAGE'] })], sources: [source({ catalogId: CAT2, seriesKeys: ['A', 'B'] }), source()], virtualColumnDefinitions: [vcDef({ virtualColumnId: 'vc-2', seriesKey: 'S2' }), vcDef()] })
    const shuffled = req({ presetVersions: [preset({ sourceCatalogIds: [CAT1, CAT2], seriesKeys: ['A', 'B'], virtualColumns: [{ virtualColumnId: 'vc-1' }, { virtualColumnId: 'vc-2' }], statistics: ['AVERAGE', 'SUM'] })], sources: [source(), source({ catalogId: CAT2, seriesKeys: ['B', 'A'] })], virtualColumnDefinitions: [vcDef(), vcDef({ virtualColumnId: 'vc-2', seriesKey: 'S2' })] })
    const deep = (o: unknown): void => { if (o && typeof o === 'object') { Object.values(o).forEach(deep); Object.freeze(o) } }
    const before = JSON.stringify(request)
    deep(request)
    const a = resolvePreset(request)
    expect(JSON.stringify(request)).toBe(before)
    expect(JSON.stringify(resolvePreset(request))).toBe(JSON.stringify(a))
    expect(resolvePreset(shuffled)).toEqual(a)
    if (a.ok) a.plan.series.length = 0
    expect(JSON.stringify(request)).toBe(before)
  })
  it('never lets a raw error out; nothing is logged', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      for (const bad of [null, {}, { ...req(), caller: null }, { ...req(), presetVersions: 'x' }, { ...req(), at: 'nope' }, { ...req(), limits: null }, { ...req(), sources: null }]) {
        const r = resolvePreset(bad as never)
        expect(r.ok).toBe(false)
        expect(JSON.stringify(r)).not.toMatch(/Error|stack|at Object|TypeError/)
      }
      for (const s of spies) expect(s).not.toHaveBeenCalled()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })
})

describe('comparison settings against the selected sources', () => {
  it('SOURCE mode needs both sources selected; PERIOD carries its range; NONE stays NONE', () => {
    const src = { mode: 'SOURCE', leftSourceCatalogId: CAT1, rightSourceCatalogId: CAT2 }
    expect(code(resolvePreset(req({ presetVersions: [preset({ comparison: src })] })))).toBe('PRESET_INVALID') // CAT2 not selected
    const ok = resolvePreset(req({ presetVersions: [preset({ sourceCatalogIds: [CAT1, CAT2], comparison: src })], sources: [source(), source({ catalogId: CAT2 })] }))
    expect(ok.ok && ok.plan.comparison).toEqual(src)
    const plain = resolvePreset(req())
    expect(plain.ok && plain.plan.comparison).toEqual({ mode: 'NONE' })
  })
})

describe('share authorization port (no permission is invented here — Q-W517)', () => {
  const shared = preset({ scope: 'TENANT_SHARED' })
  it('a PRIVATE preset needs no sharing right; TENANT_SHARED is refused without a port (fail-closed)', async () => {
    expect(await new ScadaPresetService().authorizeShare(caller(), preset())).toEqual({ ok: true })
    expect(await new ScadaPresetService().authorizeShare(caller(), shared)).toEqual({ ok: false, code: 'PRESET_SCOPE_BLOCKED' })
  })
  it('the port decides: yes ⇒ ok; no / throws / non-true ⇒ refused', async () => {
    const seen: unknown[] = []
    expect(await new ScadaPresetService({ canSharePreset: a => (seen.push(a), true) }).authorizeShare(caller(), shared)).toEqual({ ok: true })
    expect(seen).toEqual([{ userId: 'u-1', customerRootTenantId: ROOT }]) // only ids, no permission code
    expect((await new ScadaPresetService({ canSharePreset: () => false }).authorizeShare(caller(), shared)).ok).toBe(false)
    expect((await new ScadaPresetService({ canSharePreset: () => Promise.reject(new Error('x')) }).authorizeShare(caller(), shared)).ok).toBe(false)
    expect((await new ScadaPresetService({ canSharePreset: (() => 'yes') as never }).authorizeShare(caller(), shared)).ok).toBe(false)
  })
  it('the caller must belong to the preset\'s root and be an active, mappable tenant user, whatever the port says', async () => {
    const yes = new ScadaPresetService({ canSharePreset: () => true })
    expect((await yes.authorizeShare(caller({ scope: { tenantId: T_A, customerRootTenantId: OTHER_ROOT, dataScopeTenantIds: [T_A] } }), shared)).ok).toBe(false)
    expect((await yes.authorizeShare(caller({ tenant: tenant({ slug: 'Mosedaş' }) }), shared)).ok).toBe(false)
    expect((await yes.authorizeShare(caller({ tenant: null }), shared)).ok).toBe(false)
    expect((await yes.authorizeShare(caller({ userActive: false }), shared)).ok).toBe(false)
    expect((await yes.authorizeShare(caller(), { scope: 'PUBLIC' as never, customerRootTenantId: ROOT })).ok).toBe(false)
  })
})

describe('audit port (metadata only; action names are Q-W519 and NOT fixed here)', () => {
  it('receives ids / version / scope / result / static reason — never the expression, SQL, source names or raw filters', async () => {
    const events: PresetAuditEvent[] = []
    const svc = new ScadaPresetService(undefined, { record: e => void events.push(e) })
    await svc.resolve(req({ presetVersions: [preset({ virtualColumns: [{ virtualColumnId: 'vc-1' }], filters: { qualityStates: ['MISSING_VALUE'] }, name: 'ÖZEL AD' })], virtualColumnDefinitions: [vcDef({ expression: 'A + B + 424242' })] }))
    await svc.resolve(req({ caller: caller({ userId: 'u-2' }) }))
    await svc.resolve(req({ presetVersions: [preset({ status: 'DISABLED' })] }))
    await svc.resolve({ ...req(), sources: [] })
    expect(events.map(e => [e.result, e.reasonCode, e.presetVersion, e.actorUserId, e.scope])).toEqual([
      ['SUCCEEDED', 'OK', 1, 'u-1', 'PRIVATE'],
      ['DENIED', 'PRESET_SCOPE_BLOCKED', null, 'u-2', 'PRIVATE'],
      ['DENIED', 'PRESET_NOT_ACTIVE', null, 'u-1', 'PRIVATE'],
      ['DENIED', 'PRESET_SCOPE_BLOCKED', null, 'u-1', 'PRIVATE'],
    ])
    for (const e of events) expect(Object.keys(e).sort()).toEqual(['actorUserId', 'customerRootTenantId', 'presetId', 'presetVersion', 'reasonCode', 'result', 'scope'])
    expect(JSON.stringify(events)).not.toMatch(/424242|A \+ B|ÖZEL AD|MISSING_VALUE|SELECT|schema|database|Server=/i)
  })
  it('a failing audit port never changes the outcome', async () => {
    const svc = new ScadaPresetService(undefined, { record: () => Promise.reject(new Error('down')) })
    expect((await svc.resolve(req())).ok).toBe(true)
  })
})

describe('chain with TASK-027.68 / .69 / .70', () => {
  const H = 3_600_000
  const t = (base: string, h: number) => new Date(Date.parse(base) + h * H).toISOString()
  const START = '2026-02-01T00:00:00.000Z'
  let n = 0
  const bucket = (iso: string, value: number | null): ScadaOutputBucket => {
    n += 1
    return { recordId: `r${n}`, bucketStartUtc: iso, localWallTime: null, value, dataQuality: value === null ? 'MISSING_VALUE' : 'VALID', qualityFlags: [value === null ? 'MISSING_VALUE' : 'VALID'], isComplete: value !== null, classification: value === null ? 'MISSING' : 'VALID' }
  }
  const out = (key: string, cat: string, start: string, values: Array<number | null>): ScadaSeriesOutput => ({ seriesKey: key, label: `E ${key}`, unit: 'kWh', valueType: 'INDEX', sourceCatalogId: cat, customerRootTenantId: ROOT, analysisAllowed: true, status: 'OK', codes: [], buckets: values.map((v, i) => bucket(t(start, i), v)), statistics: {} as never, qualitySummary: {} as never, outOfRangeBuckets: 0 })
  const VCL: VirtualColumnLimits = { maxExpressionLength: 100, maxAstDepth: 8, maxOperatorCount: 10, maxRoundDecimals: 4, maxAbsoluteResult: 1e12 }

  it('027.68: the plan fixes scope, range and interval of the multi-series build', () => {
    const r = resolvePreset(req())
    if (!r.ok) throw new Error(r.code)
    const base = planToSeriesRequestBase(r.plan)
    const res = new ScadaMultiSeriesService().build({
      ...base,
      series: r.plan.series.map(s => ({ seriesKey: s.seriesKey, label: `E ${s.seriesKey}`, unit: 'kWh', valueType: 'INDEX' as const, sourceCatalogId: s.sourceCatalogId, customerRootTenantId: ROOT, tenant: tenant(), mappingResolved: true, analysisAllowed: true, buckets: [0, 1, 2].map(i => ({ recordId: `${s.seriesKey}${i}`, bucketStartUtc: t(START, i), value: i + 1, dataQuality: 'VALID' as const, qualityFlags: ['VALID' as const], isComplete: true })) })),
    })
    expect(res).toMatchObject({ status: 'OK', customerRootTenantId: ROOT, interval: 'HOURLY', range: r.plan.timeRange })
    expect(res.series.map(s => s.seriesKey)).toEqual(['A', 'B'])
    expect(res.series[0]!.statistics).toMatchObject({ sum: 6 })
  })
  it('027.69: a PERIOD comparison in the preset becomes the periods of the comparison engine', () => {
    const cmpRange = { startAt: '2026-03-01T00:00:00.000Z', endAt: '2026-03-08T00:00:00.000Z' }
    const r = resolvePreset(req({ presetVersions: [preset({ comparison: { mode: 'PERIOD', comparisonRange: cmpRange, decimals: 1 } })] }))
    if (!r.ok) throw new Error(r.code)
    const c = planToComparisonInputs(r.plan)
    if (c.mode !== 'PERIOD') throw new Error('mode')
    const res = new ScadaComparisonService().comparePeriods({
      customerRootTenantId: ROOT,
      baselinePeriod: { ...c.baselinePeriod, series: [out('A', CAT1, START, [10, 20])] },
      comparisonPeriod: { ...c.comparisonPeriod, series: [out('A', CAT1, cmpRange.startAt, [12, 15])] },
      options: { decimals: c.decimals },
    })
    expect(res.status).toBe('OK')
    expect(res.rows.map(x => [x.absoluteDelta, x.percentageDelta])).toEqual([[2, 20], [-5, -25]])
    const none = resolvePreset(req())
    if (!none.ok) throw new Error(none.code)
    expect(planToComparisonInputs(none.plan)).toEqual({ mode: 'NONE' })
  })
  it('027.70: the plan selects exactly the resolved definition versions, which the virtual column engine evaluates', async () => {
    const store = [vcDef({ version: 1, effectiveTo: '2026-01-01T00:00:00.000Z' }), vcDef({ version: 2, expression: 'A + B', effectiveFrom: '2026-01-01T00:00:00.000Z' }), vcDef({ virtualColumnId: 'other', seriesKey: 'BASKA', version: 1 })]
    const r = resolvePreset(req({ presetVersions: [preset({ virtualColumns: [{ virtualColumnId: 'vc-1' }] })], virtualColumnDefinitions: store }))
    if (!r.ok) throw new Error(r.code)
    const defs = selectPlannedDefinitions(r.plan, store)
    expect(defs.map(d => [d.virtualColumnId, d.version])).toEqual([['vc-1', 2]])
    const vc = await new VirtualColumnService().evaluate({
      scope: { tenantId: T_A, customerRootTenantId: ROOT, dataScopeTenantIds: [ROOT, T_A] },
      catalogId: CAT1,
      tenant: tenant(),
      mappingResolved: true,
      limits: VCL,
      definitions: defs,
      inputSeries: [out('A', CAT1, START, [1, 2]), out('B', CAT1, START, [10, null])],
    })
    expect(vc.status).toBe('OK')
    expect(vc.series[0]!.buckets.map(b => [b.value, b.version])).toEqual([[11, 2], [null, 2]])
    expect(vc.series[0]!.buckets[1]!.classification).toBe('INCOMPLETE') // an unresolved input is never 0
  })
})
