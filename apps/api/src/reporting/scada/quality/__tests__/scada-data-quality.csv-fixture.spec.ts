import { existsSync } from 'node:fs'
import path from 'node:path'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import { InMemoryRolloverPolicyProvider } from '../rollover-policy.port'
import type { ScadaQualityInputRow } from '../scada-data-quality.contract'
import { ScadaDataQualityService } from '../scada-data-quality.service'

/**
 * TASK-027.67 — the quality service over the REAL CSV snapshot (027.63-R1 development provider, read-only; nothing is
 * written). The zone is a TEST parameter (the manifest's own zone is UNVERIFIED). `veriler/raw/` is git-ignored, so the
 * suite is skipped when the snapshot is absent.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../../../../..')
const HAS = existsSync(path.join(REPO_ROOT, 'veriler/raw/endeksler.csv')) && existsSync(path.join(REPO_ROOT, 'veriler/manifest/scada-fixtures.manifest.json'))
const suite = HAS ? describe : describe.skip
const ENV = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' } as NodeJS.ProcessEnv
const SERIES = 'Turbin1_Enerji_kWh'

suite('quality service over the real CSV snapshot (development fixture)', () => {
  const records = new ScadaCsvFixtureProvider(REPO_ROOT).loadSourceRecords('endeksler', '11111111-1111-4111-8111-111111111111', ENV).filter(r => r.seriesKey === SERIES)
  const rows: ScadaQualityInputRow[] = records.map((r, i) => ({
    occurredAtUtc: r.occurredAt,
    localWallTime: r.occurredAt.replace('Z', ''),
    dstCandidatesUtc: [],
    dstUncertainRangeUtc: null,
    recordId: `${r.recordId}#${i}`,
    seriesKey: r.seriesKey,
    rawValue: r.rawValue,
    valueType: 'INDEX',
    sourceCatalogId: r.sourceCatalogId,
    dataQuality: r.dataQuality === 'MISSING' ? 'MISSING' : 'VALID',
    dstResolution: 'NORMAL',
    isBufferRow: false,
  }))
  const sorted = [...rows].sort((a, b) => Date.parse(a.occurredAtUtc!) - Date.parse(b.occurredAtUtc!) || (a.recordId < b.recordId ? -1 : 1))
  const service = new ScadaDataQualityService(new InMemoryRolloverPolicyProvider([]))
  const evaluate = (svc = service, list = rows) => svc.evaluate({ catalogId: sorted[0]!.sourceCatalogId, sourceTimeZone: 'Europe/Istanbul', rows: list })

  it('sanity: the snapshot series is present', () => expect(rows.length).toBeGreaterThan(50))

  it('without a policy every negative step is COUNTER_RESET_UNRESOLVED with a null delta — never a forced 0 — and raw values are preserved', () => {
    const result = evaluate()
    const negatives = sorted.slice(0, -1).filter((r, i) => {
      const n = sorted[i + 1]!
      return r.rawValue !== null && n.rawValue !== null && n.rawValue < r.rawValue && Date.parse(n.occurredAtUtc!) !== Date.parse(r.occurredAtUtc!)
    }).length
    const unresolved = result.rows.filter(r => r.qualityFlags.includes('NEGATIVE_DELTA'))
    expect(unresolved.length).toBe(negatives)
    expect(unresolved.every(r => r.deltaValue === null && r.dataQuality === 'COUNTER_RESET_UNRESOLVED' && !r.isComplete)).toBe(true)
    expect(result.rows.filter(r => r.deltaValue === 0 && r.rawValue !== null && r.nextRawValue !== null && r.nextRawValue < r.rawValue)).toHaveLength(0)
    for (const r of result.rows) expect(r.rawValue).toBe(sorted.find(s => s.recordId === r.recordId)!.rawValue)
    expect(result.rows.at(-1)).toMatchObject({ dataQuality: 'INSUFFICIENT_NEXT_READING', deltaValue: null })
  })

  it('an explicit policy resolves a real negative step exactly (range derived from the data in the test, never a constant)', () => {
    const idx = sorted.slice(0, -1).findIndex((r, i) => r.rawValue !== null && sorted[i + 1]!.rawValue !== null && sorted[i + 1]!.rawValue! < r.rawValue!)
    if (idx < 0) return // this snapshot has no negative step for the series
    const cur = sorted[idx]!.rawValue!
    const nxt = sorted[idx + 1]!.rawValue!
    const range = 10 ** Math.ceil(Math.log10(cur + 1))
    const svc = new ScadaDataQualityService(new InMemoryRolloverPolicyProvider([{ catalogId: sorted[0]!.sourceCatalogId, seriesKey: SERIES, valueType: 'INDEX', rolloverMode: 'MODULO', rolloverValue: range, enabled: true, version: 'csv-test' }]))
    const row = evaluate(svc).rows.find(r => r.recordId === sorted[idx]!.recordId)!
    expect(row).toMatchObject({ dataQuality: 'COUNTER_RESET_RESOLVED', isComplete: true, rawValue: cur, nextRawValue: nxt })
    expect(row.deltaValue).toBeCloseTo(nxt - cur + range, 3)
    expect(row.policy).toMatchObject({ status: 'APPLIED', version: 'csv-test' })
  })

  it('is deterministic and does not alter the input rows', () => {
    const before = JSON.stringify(rows)
    const a = evaluate()
    const b = evaluate(service, [...rows].reverse())
    expect(b).toEqual(a)
    expect(JSON.stringify(rows)).toBe(before)
  })
})
