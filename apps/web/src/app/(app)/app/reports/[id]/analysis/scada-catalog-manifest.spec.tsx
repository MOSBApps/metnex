import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tenantApiGet, tenantApiPost } from '@/lib/api'
import { ReportAnalysisClient } from './report-analysis-client'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, tenantApiGet: vi.fn(), tenantApiPost: vi.fn(), tenantApiDownload: vi.fn() }
})
vi.mock('@/contexts/tenant-permission-context', () => ({
  useTenantPermissions: vi.fn(() => ({ can: () => true, isTenantAdmin: false, loading: false, permissions: [], refresh: () => undefined })),
}))

/**
 * TASK-027.73-R2 — manifest-driven web test. The catalog the screen receives is built from the CHECKED-IN manifest with the same rules
 * the API applies (verified + evidence ⇒ selectable series with the manifest's type / unit; everything else UNVERIFIED and closed).
 * The manifest is a repo file (no raw CSV needed), so this suite skips only if the manifest is missing.
 */
const MANIFEST = path.resolve(__dirname, '../../../../../../../../../veriler/manifest/scada-fixtures.manifest.json')
const suite = existsSync(MANIFEST) ? describe : describe.skip

interface Col { sourceColumn: string; label?: string; verified: boolean; valueType: string | null; unit?: string | null; evidenceRefs?: string[] }
interface Src { sourceKey: string; logicalSourceName: string; columns?: Col[] }

const DEV = 'Geliştirme CSV snapshot verisi'
const mockedGet = vi.mocked(tenantApiGet)
const mockedPost = vi.mocked(tenantApiPost)

suite('analysis screen over a catalog built from the real manifest', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { sources: Src[] }
  const id = (key: string, n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
  const catalog = {
    artifact: null,
    developmentLabel: DEV,
    sources: manifest.sources.map((s, i) => {
      const cols = s.columns ?? []
      const verified = cols.filter(c => c.verified && (c.valueType === 'INDEX' || c.valueType === 'REAL_VALUE') && (c.evidenceRefs?.length ?? 0) > 0)
      const cid = id(s.sourceKey, i + 1)
      return {
        catalogId: cid, name: s.logicalSourceName, status: 'ACTIVE', mappingStatus: 'RESOLVED', schemaStatus: 'UNVERIFIED', timezoneStatus: 'DEVELOPMENT_OVERRIDE', timezone: 'Europe/Istanbul',
        supportedIntervals: ['HOURLY', 'DAILY'], rowCount: 100, minAt: '2025-12-31T21:00:00.000Z', maxAt: '2026-01-05T20:00:00.000Z', selectable: verified.length > 0, blockedReason: verified.length > 0 ? null : 'NO_SERIES',
        series: [
          ...verified.map(c => ({ seriesKey: c.sourceColumn, label: c.label ?? c.sourceColumn, unit: c.unit ?? '', valueType: c.valueType as string, available: true, qualityStatus: 'OK', verificationStatus: 'VERIFIED', sourceCatalogId: cid })),
          ...cols.filter(c => !verified.includes(c)).map(c => ({ seriesKey: c.sourceColumn, label: c.sourceColumn, unit: '', valueType: 'UNVERIFIED', available: false, qualityStatus: 'UNVERIFIED', verificationStatus: 'UNVERIFIED', sourceCatalogId: cid })),
        ],
      }
    }),
  }
  const gtId = catalog.sources.find(s => s.name.startsWith('GT '))!.catalogId

  beforeEach(() => {
    mockedGet.mockReset()
    mockedPost.mockReset()
    mockedGet.mockImplementation(async (url: string) => (url.endsWith('/analysis/catalog') ? (catalog as never) : ({ presets: [] } as never)))
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists the sources, at least one verified series is selectable and the development label shows', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    const select = await screen.findByLabelText('Kaynak')
    expect(within(select).getAllByRole('option').length).toBeGreaterThan(4)
    expect(screen.getAllByText(DEV).length).toBeGreaterThan(0)
    fireEvent.change(select, { target: { value: gtId } })
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.some(b => !b.disabled)).toBe(true)
  })

  it('a verified column without a declared unit shows "Birim belirtilmemiş" (its "KWH" name is NOT a unit); a declared one shows its unit', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: gtId } })
    expect(screen.getByText(/GT1_ELEKTRIK_URETIM_KWH \(Birim belirtilmemiş, INDEX\)/)).toBeInTheDocument()
    expect(screen.getByText(/GT1_DOGALGAZ_TUKETIM_SM3 \(Sm3, INDEX\)/)).toBeInTheDocument()
  })

  it('unverified columns are shown as such and cannot be ticked', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: gtId } })
    const box = screen.getByLabelText(/GT1_SICAKSU_URETIM_KWH — doğrulanmamış \(UNVERIFIED\)/) as HTMLInputElement
    expect(box.disabled).toBe(true)
    fireEvent.click(box)
    expect(box.checked).toBe(false)
  })

  it('the request carries only the ticked verified series; a null value in the answer is shown as "—", quality flags are kept', async () => {
    mockedPost.mockResolvedValue({
      artifactCode: 'SCADA_HOURLY_ANALYSIS', status: 'OK', code: null, interval: 'HOURLY', timezone: 'Europe/Istanbul', range: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-05T21:00:00.000Z' }, preset: null,
      series: [{ seriesKey: 'GT1_DOGALGAZ_TUKETIM_SM3', sourceCatalogId: gtId, label: 'GT1_DOGALGAZ_TUKETIM_SM3', unit: 'Sm3', valueType: 'INDEX', analysisAllowed: true, status: 'OK', codes: [],
        points: [{ t: '2025-12-31T21:00:00.000Z', localWallTime: null, value: 12.5, quality: 'VALID', qualityFlags: ['VALID'], isComplete: true, classification: 'VALID' }, { t: '2025-12-31T22:00:00.000Z', localWallTime: null, value: null, quality: 'COUNTER_RESET_UNRESOLVED', qualityFlags: ['COUNTER_RESET_UNRESOLVED'], isComplete: false, classification: 'INCOMPLETE' }],
        statistics: { status: 'OK', sum: 12.5, average: 12.5, min: 12.5, max: 12.5, count: 2, validCount: 1, missingCount: 0, invalidCount: 0, incompleteCount: 1 },
        qualitySummary: { totalBuckets: 2, validBuckets: 1, invalidBuckets: 0, missingBuckets: 0, incompleteBuckets: 1, qualityStates: ['VALID', 'COUNTER_RESET_UNRESOLVED'] }, virtual: null }],
      excluded: [], sources: [], virtualColumnFailures: [], pointFilter: { qualityStates: [], onlyAnalysisAllowed: false },
    } as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: gtId } })
    fireEvent.click(screen.getByLabelText(/GT1_DOGALGAZ_TUKETIM_SM3/))
    fireEvent.click(screen.getByRole('button', { name: /Analiz/ }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0]![1]).toMatchObject({ sourceCatalogIds: [gtId], seriesKeys: ['GT1_DOGALGAZ_TUKETIM_SM3'], bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul' })
    expect(await screen.findByText(new RegExp(`SCADA Zaman Serisi Grafiği — ${DEV}`))).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getAllByText('COUNTER_RESET_UNRESOLVED').length).toBeGreaterThan(0)
  })
})
