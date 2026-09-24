import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTenantPermissions } from '@/contexts/tenant-permission-context'
import { ApiError, tenantApiDownload, tenantApiDownloadPost, tenantApiGet, tenantApiPost } from '@/lib/api'
import { renderSvgToPngBlob } from './png-export'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { ReportAnalysisClient } from './report-analysis-client'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    tenantApiGet: vi.fn(),
    tenantApiPost: vi.fn(),
    tenantApiDownload: vi.fn(),
    tenantApiDownloadPost: vi.fn(),
  }
})

vi.mock('./png-export', async () => {
  const actual = await vi.importActual<typeof import('./png-export')>('./png-export')
  return { ...actual, renderSvgToPngBlob: vi.fn() }
})

vi.mock('@/contexts/tenant-permission-context', () => ({
  useTenantPermissions: vi.fn(() => ({
    can: () => true,
    isTenantAdmin: false,
    loading: false,
    permissions: [],
    refresh: () => undefined,
  })),
}))

vi.setConfig({ testTimeout: 30000 })
configure({ asyncUtilTimeout: 5000 }) // the web suite runs in parallel (turbo): panel hand-offs need headroom

const mockedGet = vi.mocked(tenantApiGet)
const mockedPost = vi.mocked(tenantApiPost)
const mockedDownload = vi.mocked(tenantApiDownload)
const mockedDownloadPost = vi.mocked(tenantApiDownloadPost)
const mockedRenderPng = vi.mocked(renderSvgToPngBlob)
const mockedUseTenantPermissions = vi.mocked(useTenantPermissions)

const sampleScadaAnalysis = {
  artifactCode: 'A1',
  status: 'OK',
  code: null,
  interval: 'HOURLY',
  timezone: 'Europe/Istanbul',
  range: { startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-01T02:00:00Z' },
  preset: null,
  series: [
    {
      seriesKey: 'S1',
      sourceCatalogId: 'CAT-001',
      label: 'Sayaç Endeksi',
      unit: 'kWh',
      valueType: 'INDEX',
      analysisAllowed: true,
      status: 'OK',
      codes: [],
      points: [
        {
          t: '2026-01-01T00:00:00Z',
          localWallTime: '2026-01-01 03:00',
          value: 150.5,
          quality: 'VALID',
          qualityFlags: [],
          isComplete: true,
          classification: 'OK',
        },
        {
          t: '2026-01-01T01:00:00Z',
          localWallTime: '2026-01-01 04:00',
          value: null, // Null value MUST be preserved as '—' in table, never 0
          quality: 'MISSING',
          qualityFlags: ['DST_AMBIGUOUS'],
          isComplete: false,
          classification: 'MISSING',
        },
      ],
      statistics: {
        status: 'OK',
        sum: 150.5,
        average: 150.5,
        min: 150.5,
        max: 150.5,
        count: 2,
        validCount: 1,
        missingCount: 1,
        invalidCount: 0,
        incompleteCount: 1,
      },
      qualitySummary: {
        totalBuckets: 2,
        validBuckets: 1,
        invalidBuckets: 0,
        missingBuckets: 1,
        incompleteBuckets: 1,
        qualityStates: ['VALID', 'MISSING'],
      },
      virtual: null,
    },
  ],
  excluded: [],
  sources: [{ sourceCatalogId: 'CAT-001', status: 'OK', code: null, rowCount: 2 }],
  virtualColumnFailures: [],
  pointFilter: { qualityStates: [], onlyAnalysisAllowed: false },
}

const sampleLegacyRow = {
  no: 'ROW-0001',
  label: 'Vardiya Kontrolü',
  occurredAt: '2026-01-05T00:00:00.000Z',
  status: 'COMPLETED',
  quantity: 2,
  unitPrice: 50,
  amount: 100,
}

const CAT_A = '11111111-1111-4111-8111-111111111111'
const CAT_B = '22222222-2222-4222-8222-222222222222'
const series = (id: string) => [
  { seriesKey: 'S1', label: 'Sayaç Endeksi', unit: 'kWh', valueType: 'INDEX', available: true, qualityStatus: 'OK', verificationStatus: 'VERIFIED', sourceCatalogId: id },
  { seriesKey: 'S2', label: 'Reaktif Endeks', unit: '', valueType: 'INDEX', available: true, qualityStatus: 'PARTIAL', verificationStatus: 'VERIFIED', sourceCatalogId: id },
  { seriesKey: 'S3', label: 'Kimliği Belirsiz', unit: '', valueType: 'UNVERIFIED', available: false, qualityStatus: 'UNVERIFIED', verificationStatus: 'UNVERIFIED', sourceCatalogId: id },
]
const source = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  catalogId: id, name, status: 'ACTIVE', mappingStatus: 'RESOLVED', schemaStatus: 'UNVERIFIED', timezoneStatus: 'DEVELOPMENT_OVERRIDE', timezone: 'Europe/Istanbul',
  supportedIntervals: ['HOURLY', 'DAILY'], rowCount: 48, minAt: '2025-12-31T21:00:00.000Z', maxAt: '2026-01-02T20:00:00.000Z', selectable: true, blockedReason: null, series: series(id), ...over,
})
const DEV = 'Geliştirme CSV snapshot verisi'
const catalog = (over: Record<string, unknown> = {}) => ({
  artifact: { code: 'SCADA_HOURLY_ANALYSIS', name: 'SCADA', description: 'd', status: 'DEVELOPMENT_ONLY', developmentOnly: true, supportedIntervals: ['HOURLY', 'DAILY'], supportedFormats: ['CHART', 'TABLE'], sourceCatalogIds: [CAT_A, CAT_B], timezoneStatus: 'DEVELOPMENT_OVERRIDE', dataOrigin: 'DEVELOPMENT_CSV_SNAPSHOT' },
  developmentLabel: DEV,
  sources: [source(CAT_A, 'Kaynak A'), source(CAT_B, 'Kaynak B')],
  ...over,
})

const installGet = (cat: unknown, presets: unknown = { presets: [] }) =>
  mockedGet.mockImplementation(async (url: string) => {
    if (url.endsWith('/analysis/catalog')) {
      if (cat instanceof Error) throw cat
      return cat as never
    }
    if (url.includes('/analysis/presets')) return presets as never
    if (url.includes('/data')) return { artifact: { code: 'A1', title: 'Legacy Data' }, rows: [sampleLegacyRow], totalAmount: 100 } as never
    throw new ApiError('Not found', 404)
  })

/** open the form: pick a source (its range defaults to the data bounds) and one series */
async function pickSourceAndSeries(id = CAT_A, name = 'Sayaç Endeksi') {
  const select = await screen.findByLabelText('Kaynak')
  fireEvent.change(select, { target: { value: id } })
  fireEvent.click(await screen.findByLabelText(new RegExp(name)))
}
const runButton = () => screen.getByRole('button', { name: /Analiz/ })

describe('ReportAnalysisClient — discovery-driven SCADA analysis (TASK-027.73-R1)', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedPost.mockReset()
    mockedDownload.mockReset()
    installGet(catalog())
    mockedPost.mockResolvedValue(sampleScadaAnalysis as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the selection form from the discovery result; nothing is analysed and no chart is drawn before a selection', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    expect(await screen.findByLabelText('Kaynak')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledWith('/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/catalog')
    expect(mockedPost).not.toHaveBeenCalled()
    expect(screen.getByText('Analiz bekleniyor')).toBeInTheDocument()
    expect(screen.queryByText(/SCADA Zaman Serisi Grafiği/)).not.toBeInTheDocument()
  })

  it('shows the development label on the artifact page, in the source list, on the result and in the chart title', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    const select = await screen.findByLabelText('Kaynak')
    expect(screen.getAllByText(DEV).length).toBeGreaterThan(0) // page header + panel badge
    expect(within(select).getAllByRole('option').some(o => o.textContent?.includes(DEV))).toBe(true)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    expect(await screen.findByText(new RegExp(`SCADA Zaman Serisi Grafiği — ${DEV}`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`İstatistik Özet Kartları — ${DEV}`))).toBeInTheDocument()
  })

  it('selecting a source works and bounds the dates by the CSV range (min / max in the source zone)', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: CAT_A } })
    const start = screen.getByLabelText('Başlangıç tarihi') as HTMLInputElement
    const end = screen.getByLabelText('Bitiş tarihi') as HTMLInputElement
    expect(start.min).toBe('2026-01-01T00:00')
    expect(start.max).toBe('2026-01-02T23:00')
    expect(end.min).toBe('2026-01-01T00:00')
    expect(end.max).toBe('2026-01-02T23:00')
    expect(start.value).toBe('2026-01-01T00:00')
    expect(end.value).toBe('2026-01-02T23:00')
  })

  it('shows the unit ONLY when the manifest declared it ("Birim belirtilmemiş" otherwise) and never derives one from the column name', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: CAT_A } })
    expect(screen.getByText(/Sayaç Endeksi \(kWh, INDEX\)/)).toBeInTheDocument()
    expect(screen.getByText(/Reaktif Endeks \(Birim belirtilmemiş, INDEX\)/)).toBeInTheDocument()
  })

  it('an UNVERIFIED column is listed as such and cannot be ticked', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: CAT_A } })
    const box = screen.getByLabelText(/Kimliği Belirsiz — doğrulanmamış \(UNVERIFIED\)/) as HTMLInputElement
    expect(box.disabled).toBe(true)
    fireEvent.click(box)
    expect(box.checked).toBe(false)
  })

  it('a source with only unverified columns cannot be selected and says why', async () => {
    installGet(catalog({ sources: [source(CAT_A, 'Kaynak A', { selectable: false, blockedReason: 'NO_SERIES', minAt: null, maxAt: null, timezone: null, series: [{ seriesKey: 'X1', label: 'X1', unit: '', valueType: 'UNVERIFIED', available: false, qualityStatus: 'UNVERIFIED', verificationStatus: 'UNVERIFIED', sourceCatalogId: CAT_A }] })] }))
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    expect(await screen.findByText(/1 kolon doğrulanmamış \(UNVERIFIED\)/)).toBeInTheDocument()
    const option = within(screen.getByLabelText('Kaynak')).getByRole('option', { name: /Kaynak A/ }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
    expect(option.textContent).toContain('Doğrulanmış seri yok')
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('a successful discovery never shows the "Erişim yok" state (development scope bridge open)', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await screen.findByLabelText('Kaynak')
    expect(screen.queryByText('Erişim yok')).not.toBeInTheDocument()
    expect(screen.getAllByText(DEV).length).toBeGreaterThan(0)
  })

  it('an ACTIVE development virtual column of the selected source is sent as virtualColumnIds and shown next to the physical series, marked "(sanal)"', async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/analysis/catalog')) return catalog() as never
      if (url.endsWith('/analysis/virtual-columns')) return { virtualColumns: [{ virtualColumnId: 'vc-1', catalogId: CAT_A, seriesKey: 'TOTAL', label: 'Toplam Tüketim', unit: 'kWh', valueType: 'INDEX', inputSeriesKeys: ['S1'], version: 1, status: 'ACTIVE', activeVersion: 1, versions: [{ version: 1, status: 'ACTIVE' }] }], canManage: false } as never
      return { presets: [] } as never
    })
    const virtualSeries = { ...sampleScadaAnalysis.series[0]!, seriesKey: 'TOTAL', label: 'Toplam Tüketim', virtual: { virtualColumnId: 'vc-1', versions: [1], sourceSeriesKeys: ['S1'] } }
    mockedPost.mockResolvedValue({ ...sampleScadaAnalysis, series: [sampleScadaAnalysis.series[0]!, virtualSeries] } as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(await screen.findByLabelText('Kullan: Toplam Tüketim'))
    fireEvent.click(runButton())
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0]![1]).toMatchObject({ seriesKeys: ['S1'], virtualColumnIds: ['vc-1'] })
    expect(JSON.stringify(mockedPost.mock.calls[0]![1])).not.toMatch(/expression/i)
    expect((await screen.findAllByText(/Toplam Tüketim \(sanal\)/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sayaç Endeksi').length).toBeGreaterThan(0) // the physical series is still there, unmarked
  })

  it('without a development label in the catalog no virtual column section is rendered and no virtual-column request is made (production)', async () => {
    installGet(catalog({ developmentLabel: null }))
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await screen.findByLabelText('Kaynak')
    expect(screen.queryByTestId('virtual-column-panel')).not.toBeInTheDocument()
    expect(mockedGet.mock.calls.some(c => String(c[0]).includes('virtual-columns'))).toBe(false)
  })

  it('a series cannot be chosen before a source: the list is empty and says so', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await screen.findByLabelText('Kaynak')
    expect(screen.getByText('Seri seçmek için önce bir kaynak seçin.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Sayaç Endeksi/)).not.toBeInTheDocument()
    expect((screen.getByLabelText('Başlangıç tarihi') as HTMLInputElement).disabled).toBe(true)
  })

  it('selecting a series works; changing the source CLEARS the series selection', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries(CAT_A)
    expect((screen.getByLabelText(/Sayaç Endeksi/) as HTMLInputElement).checked).toBe(true)
    fireEvent.change(screen.getByLabelText('Kaynak'), { target: { value: CAT_B } })
    await waitFor(() => expect((screen.getByLabelText(/Sayaç Endeksi/) as HTMLInputElement).checked).toBe(false))
    expect((screen.getByLabelText(/Reaktif Endeks/) as HTMLInputElement).checked).toBe(false)
  })

  it('the selected values reach the query request exactly: only that source, that series, the converted inclusive range, the interval and the zone', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.change(screen.getByLabelText('Başlangıç tarihi'), { target: { value: '2026-01-01T02:00' } })
    fireEvent.change(screen.getByLabelText('Bitiş tarihi'), { target: { value: '2026-01-01T05:00' } })
    fireEvent.click(runButton())
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1))
    const [url, body] = mockedPost.mock.calls[0]! as [string, Record<string, unknown>]
    expect(url).toBe('/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/query')
    expect(body).toMatchObject({ artifactCode: 'SCADA_HOURLY_ANALYSIS', mode: 'EXPLICIT', sourceCatalogIds: [CAT_A], seriesKeys: ['S1'], startAt: '2025-12-31T23:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul' })
    expect(JSON.stringify(body)).not.toMatch(/csv|veriler|path|table|sql|database|schema/i)
  })

  it('switching to DAILY sends whole-day instants', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.change(screen.getByLabelText('Aralık'), { target: { value: 'DAILY' } })
    fireEvent.click(runButton())
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0]![1]).toMatchObject({ bucketInterval: 'DAILY', startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' })
  })

  it('a range outside the CSV range, or an inverted one, makes NO call and says why', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.change(screen.getByLabelText('Bitiş tarihi'), { target: { value: '2026-02-01T00:00' } })
    fireEvent.click(runButton())
    expect((await screen.findAllByText('Tarih aralığı kaynağın veri aralığı dışında.')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Bitiş tarihi'), { target: { value: '2026-01-01T00:00' } })
    fireEvent.change(screen.getByLabelText('Başlangıç tarihi'), { target: { value: '2026-01-01T05:00' } })
    fireEvent.click(runButton())
    expect((await screen.findAllByText('Başlangıç tarihi bitiş tarihinden sonra olamaz.')).length).toBeGreaterThan(0)
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('with no series chosen nothing is sent', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: CAT_A } })
    fireEvent.click(runButton())
    expect((await screen.findAllByText('En az bir seri seçin.')).length).toBeGreaterThan(0)
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('locks every selection control while the analysis runs', async () => {
    let release: (v: unknown) => void = () => undefined
    mockedPost.mockImplementation(() => new Promise(resolve => { release = resolve }))
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    await waitFor(() => expect((screen.getByLabelText('Kaynak') as HTMLSelectElement).disabled).toBe(true))
    expect((screen.getByLabelText('Aralık') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText(/Sayaç Endeksi/) as HTMLInputElement).disabled).toBe(true)
    release(sampleScadaAnalysis)
    await waitFor(() => expect((screen.getByLabelText('Kaynak') as HTMLSelectElement).disabled).toBe(false))
  })

  it('renders the real analysis result as chart, statistic cards and table; a null value is "—", never 0', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    expect((await screen.findAllByText('Sayaç Endeksi')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('150,50').length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('DST_AMBIGUOUS')).toBeInTheDocument()
  })

  it('a BLOCKED / empty analysis draws NO chart', async () => {
    mockedPost.mockResolvedValue({ ...sampleScadaAnalysis, status: 'BLOCKED', code: 'NO_VALID_DATA', series: [{ ...sampleScadaAnalysis.series[0]!, points: [], status: 'NO_VALID_DATA' }] } as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    expect(await screen.findByText('Analiz verisi üretilemedi')).toBeInTheDocument()
    expect(screen.queryByText(/SCADA Zaman Serisi Grafiği/)).not.toBeInTheDocument()
  })

  it('a catalog without any source shows an empty state and no chart area', async () => {
    installGet(catalog({ sources: [] }))
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    expect(await screen.findByText('Kaynak bulunamadı')).toBeInTheDocument()
    expect(screen.queryByLabelText('Kaynak')).not.toBeInTheDocument()
    expect(screen.queryByText(/SCADA Zaman Serisi Grafiği/)).not.toBeInTheDocument()
  })

  it('sources that are not ready (e.g. no time zone) are listed but cannot be selected', async () => {
    installGet(catalog({ sources: [source(CAT_A, 'Kaynak A', { selectable: false, blockedReason: 'TIMEZONE_UNVERIFIED', timezone: null, series: [], minAt: null, maxAt: null })] }))
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    expect(await screen.findByText('Seçilebilir kaynak yok')).toBeInTheDocument()
    const option = within(screen.getByLabelText('Kaynak')).getByRole('option', { name: /Kaynak A/ }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
    expect(option.textContent).toContain('Saat dilimi tanımlı değil')
  })

  describe('discovery failures are shown safely and draw nothing', () => {
    it.each([
      ['fixture closed / unknown artifact (404)', new ApiError('x', 404, { code: 'SCADA_NOT_FOUND' }), 'Kaynak kataloğu kapalı'],
      ['provider not configured (503)', new ApiError('x', 503, { code: 'SCADA_SOURCE_NOT_CONFIGURED' }), 'Veri kaynağı yapılandırılmamış'],
      ['limits not configured (503)', new ApiError('x', 503, { code: 'SCADA_LIMITS_NOT_CONFIGURED' }), 'Limit yapılandırılmamış'],
      ['tenant mismatch / forbidden (403)', new ApiError('x', 403, { code: 'SCADA_SCOPE_DENIED' }), 'Erişim yok'],
      ['catalog blocked / unreachable (503)', new ApiError('x', 503, { code: 'SCADA_SOURCE_UNAVAILABLE' }), 'Katalog erişilemiyor'],
      ['anything else', new Error('Server=10.0.0.5;Password=hunter2'), 'Kaynaklar yüklenemedi'],
    ])('%s', async (_n, error, title) => {
      installGet(error)
      mockedGet.mockImplementation(async (url: string) => {
        if (url.endsWith('/analysis/catalog')) throw error
        if (url.includes('/data')) throw new ApiError('nf', 404)
        return { presets: [] } as never
      })
      const { container } = render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
      expect(await screen.findByText(title)).toBeInTheDocument()
      expect(screen.queryByLabelText('Kaynak')).not.toBeInTheDocument()
      expect(screen.queryByText(DEV)).not.toBeInTheDocument()
      expect(screen.queryByText(/SCADA Zaman Serisi Grafiği/)).not.toBeInTheDocument()
      expect(container.textContent).not.toMatch(/hunter2|Server=|10\.0\.0\.5/)
      expect(mockedPost).not.toHaveBeenCalled()
    })
  })

  it('tenant change clears the catalog, the source, the series, the results and re-discovers', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    await screen.findAllByText('Sayaç Endeksi')
    installGet(catalog({ sources: [source(CAT_B, 'Kaynak B')] }))
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))
    await waitFor(() => expect((screen.getByLabelText('Kaynak') as HTMLSelectElement).value).toBe(''))
    expect(screen.queryByText(/SCADA Zaman Serisi Grafiği/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Sayaç Endeksi/)).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Kaynak')).queryByRole('option', { name: /Kaynak A/ })).not.toBeInTheDocument()
    expect(mockedGet.mock.calls.filter(c => String(c[0]).endsWith('/analysis/catalog'))).toHaveLength(2)
  })

  it('after a tenant change the previous selection is gone even if the NEW tenant offers the same source id', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries(CAT_A)
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))
    await waitFor(() => expect((screen.getByLabelText('Kaynak') as HTMLSelectElement).value).toBe(''))
    expect(screen.queryByLabelText(/Sayaç Endeksi/)).not.toBeInTheDocument() // no series list without a (re)selected source
    expect((screen.getByLabelText('Başlangıç tarihi') as HTMLInputElement).value).toBe('')
    fireEvent.click(runButton())
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('while the NEW tenant is being discovered the old tenant\'s sources are not shown', async () => {
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await screen.findByLabelText('Kaynak')
    mockedGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/analysis/catalog')) return new Promise(() => undefined) as never // never answers
      return { presets: [] } as never
    })
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))
    expect(await screen.findByText('Kaynaklar yükleniyor')).toBeInTheDocument()
    expect(screen.queryByLabelText('Kaynak')).not.toBeInTheDocument()
  })

  it('a slow discovery of the OLD tenant can never overwrite the NEW tenant\'s catalog', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    mockedGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/analysis/catalog')) return new Promise(resolve => resolvers.push(resolve)) as never
      return { presets: [] } as never
    })
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await waitFor(() => expect(resolvers).toHaveLength(1))
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))
    await waitFor(() => expect(resolvers).toHaveLength(2))
    resolvers[1]!(catalog({ sources: [source(CAT_B, 'Yeni Tenant Kaynağı')] }))
    await screen.findByLabelText('Kaynak')
    resolvers[0]!(catalog({ sources: [source(CAT_A, 'Eski Tenant Kaynağı')] })) // arrives late
    await new Promise(r => setTimeout(r, 30))
    const options = within(screen.getByLabelText('Kaynak')).getAllByRole('option').map(o => o.textContent)
    expect(options.join('|')).toContain('Yeni Tenant Kaynağı')
    expect(options.join('|')).not.toContain('Eski Tenant Kaynağı')
  })

  it('an artifact the catalog does not serve keeps the legacy dataset view (no SCADA chart, no dev label)', async () => {
    installGet(new ApiError('nf', 404, { code: 'SCADA_NOT_FOUND' }))
    render(<ReportAnalysisClient artifactId="A1" />)
    expect(await screen.findByText('Kaynak kataloğu kapalı')).toBeInTheDocument()
    expect(await screen.findByText('Kayıt Sayısı')).toBeInTheDocument()
    expect(screen.queryByText(DEV)).not.toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('lists presets from the { presets } response and loads the chosen one', async () => {
    const preset = { presetId: 'P1', version: 1, scope: 'PRIVATE', name: 'Vardiya Preset', description: null, status: 'ACTIVE', isOwner: true, bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', sourceCatalogIds: [CAT_A], seriesKeys: ['S1'], virtualColumns: [], statistics: ['SUM'], comparisonMode: 'NONE', chartType: 'LINE', timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, comparison: { mode: 'NONE', comparisonRange: null, leftSourceCatalogId: null, rightSourceCatalogId: null, seriesMapping: [] }, effectiveFrom: null, effectiveTo: null, updatedAt: '2026-01-01T00:00:00Z' }
    mockedGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/analysis/catalog')) return catalog() as never
      if (url.includes('/analysis/presets/P1')) return { preset, versions: [], resolution: { status: 'RESOLVED' } } as never
      if (url.includes('/analysis/presets')) return { presets: [preset] } as never
      throw new ApiError('nf', 404)
    })
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    expect(await screen.findByText(/Vardiya Preset/)).toBeInTheDocument()
    await screen.findByLabelText('Kaynak')
    fireEvent.change(screen.getByLabelText('Kayıtlı Preset Şablonu'), { target: { value: 'P1' } })
    await waitFor(() => expect(mockedGet).toHaveBeenCalledWith('/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/presets/P1'))
    // the preset FILLS the form (source, series, range, statistics); the analysis is then the explicit one
    await waitFor(() => expect((screen.getByLabelText('Kaynak') as HTMLSelectElement).value).toBe(CAT_A))
    await waitFor(() => {
      fireEvent.click(runButton()) // the parent may still be catching up with the panel right after the preset is applied
      expect(mockedPost).toHaveBeenCalled()
    })
    expect(mockedPost.mock.calls[0]![1]).toMatchObject({ artifactCode: 'SCADA_HOURLY_ANALYSIS', mode: 'EXPLICIT', sourceCatalogIds: [CAT_A], seriesKeys: ['S1'], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z', bucketInterval: 'HOURLY', statistics: ['SUM'] })
  })

  it('maps analysis errors to safe messages (503 provider / limits) without leaking details', async () => {
    mockedPost.mockRejectedValueOnce(new ApiError('SCADA_SOURCE_NOT_CONFIGURED', 503, { code: 'SCADA_SOURCE_NOT_CONFIGURED' }))
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    expect(await screen.findAllByText('Veri kaynağı yapılandırılmamış.')).not.toHaveLength(0)
  })

  it('shows the partial badge and the analysis-blocked warning', async () => {
    mockedPost.mockResolvedValue({ ...sampleScadaAnalysis, status: 'PARTIAL' } as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    expect(await screen.findByText('Kısmi sonuç')).toBeInTheDocument()
    mockedPost.mockResolvedValue({ ...sampleScadaAnalysis, series: [{ ...sampleScadaAnalysis.series[0]!, analysisAllowed: false }] } as never)
    fireEvent.click(runButton())
    expect(await screen.findByText(/Analiz Bloklandı/)).toBeInTheDocument()
  })

  it('SOURCE comparison needs a second discovered source and sends both catalog ids', async () => {
    const cmp = { artifactCode: 'SCADA_HOURLY_ANALYSIS', status: 'OK', code: null, mode: 'SOURCE', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', comparability: 'COMPARABLE', rows: [], unmatchedSeries: [], summary: { totalPairs: 0, validPairs: 0, averageAbsoluteDelta: null, maxAbsoluteDelta: null }, preset: null, sources: [] }
    mockedPost.mockResolvedValue(cmp as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.change(screen.getByLabelText('Karşılaştırma Modu'), { target: { value: 'SOURCE' } })
    fireEvent.click(runButton())
    expect(await screen.findByText('Karşılaştırma için ikinci bir kaynak seçin.')).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Karşılaştırma Kaynağı'), { target: { value: CAT_B } })
    fireEvent.click(runButton())
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0]![0]).toBe('/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/compare')
    expect(mockedPost.mock.calls[0]![1]).toMatchObject({ mode: 'SOURCE', leftSourceCatalogId: CAT_A, rightSourceCatalogId: CAT_B, seriesMapping: [{ leftSeriesKey: 'S1', rightSeriesKey: 'S1' }] }) // identical keys are paired automatically; the pairs are explicit
  })
})

describe('ReportAnalysisClient — CSV/PNG/PDF/XLSX export wiring', () => {
  const installExportGet = () => installGet(catalog())
  const runThroughDiscovery = async () => {
    await pickSourceAndSeries()
    fireEvent.click(runButton())
  }

  let clickSpy: ReturnType<typeof vi.fn>
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockedGet.mockReset()
    mockedPost.mockReset()
    mockedDownload.mockReset()
    clickSpy = vi.fn()
    createObjectURLSpy = vi.fn(() => 'blob:mock-url')
    revokeObjectURLSpy = vi.fn()
    global.URL.createObjectURL = createObjectURLSpy as never
    global.URL.revokeObjectURL = revokeObjectURLSpy as never
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        el.click = clickSpy as unknown as () => void
      }
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows downloading CSV for SCADA analysis data (from the server: the file the export endpoint built)', async () => {
    installExportGet()
    mockedPost.mockResolvedValueOnce(sampleScadaAnalysis as never)
    mockedDownloadPost.mockResolvedValueOnce({ blob: new Blob(['x']), fileName: 'scada_a_2026-06-01.csv' })
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await runThroughDiscovery()
    const csvBtn = await screen.findByRole('button', { name: 'CSV indir' })

    fireEvent.click(csvBtn)
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(createObjectURLSpy).toHaveBeenCalled()
  })

  it('hides PDF/XLSX when user lacks REPORT:ARTIFACT:EXPORT permission', async () => {
    mockedUseTenantPermissions.mockReturnValue({
      can: (code: string) => code !== 'REPORT:ARTIFACT:EXPORT',
      isTenantAdmin: false,
      loading: false,
      permissions: [],
      refresh: () => undefined,
    })
    installExportGet()
    mockedPost.mockResolvedValueOnce(sampleScadaAnalysis as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await runThroughDiscovery()

    await screen.findByText(/SCADA Zaman Serisi Grafiği/)
    for (const name of ['CSV indir', 'PNG indir', 'PDF indir', 'XLSX indir']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })
})

describe('ReportAnalysisClient — SCADA export (TASK-027.74)', () => {
  const EXPORT = '/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/export'
  let clickSpy: ReturnType<typeof vi.fn>
  let downloads: string[]

  const period = { ...sampleScadaAnalysis, status: 'OK' }
  const cmp = { artifactCode: 'SCADA_HOURLY_ANALYSIS', status: 'OK', code: null, mode: 'SOURCE', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', comparability: 'COMPARABLE', rows: [{ t: '2026-01-01T00:00:00Z', comparisonT: '2026-01-01T00:00:00Z', seriesLabel: 'S', comparisonSeriesLabel: 'S', sourceLabel: 'A', comparisonSourceLabel: 'B', baseline: 1, comparison: 2, absoluteDelta: 1, percentageDelta: 100, quality: 'VALID', status: 'COMPARABLE', reasonCode: null, baselineReason: null, comparisonReason: null }], unmatchedSeries: [], summary: { totalPairs: 1, validPairs: 1, averageAbsoluteDelta: 1, maxAbsoluteDelta: 1 }, preset: null, sources: [] }

  async function analyse(result: unknown = period) {
    mockedPost.mockResolvedValueOnce(result as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    await screen.findByText(/SCADA (Zaman Serisi|Karşılaştırma) Grafiği/)
  }
  const queryBody = () => mockedPost.mock.calls[0]![1]

  beforeEach(() => {
    mockedGet.mockReset()
    mockedPost.mockReset()
    mockedDownload.mockReset()
    mockedDownloadPost.mockReset()
    mockedRenderPng.mockReset()
    mockedUseTenantPermissions.mockReturnValue({ can: () => true, isTenantAdmin: false, loading: false, permissions: [], refresh: () => undefined })
    installGet(catalog())
    clickSpy = vi.fn()
    downloads = []
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url') as never
    global.URL.revokeObjectURL = vi.fn() as never
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') el.click = (() => { downloads.push((el as HTMLAnchorElement).download); (clickSpy as unknown as () => void)() }) as unknown as () => void
      return el
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([['CSV'], ['XLSX'], ['PDF']] as const)('%s: the SERVER file is downloaded; the request is the SAME body the analysis used and carries no rows, tenant or actor', async format => {
    mockedDownloadPost.mockResolvedValueOnce({ blob: new Blob(['server bytes']), fileName: `scada_x_2026-06-01.${format.toLowerCase()}` })
    await analyse()
    fireEvent.click(screen.getByRole('button', { name: `${format} indir` }))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedDownloadPost).toHaveBeenCalledWith(`${EXPORT}/${format}`, { analysis: queryBody() })
    expect(JSON.stringify(mockedDownloadPost.mock.calls[0]![1])).not.toMatch(/rows|points|tenantId|actorId|Sayaç Endeksi/)
    expect(downloads).toEqual([`scada_x_2026-06-01.${format.toLowerCase()}`])
  })

  it('PNG: the caption comes from the SERVER (title, filters, warnings, labels) and is drawn onto the chart the screen shows', async () => {
    const caption = { format: 'PNG', exportId: 'srv-1', fileName: 'scada_x_2026-06-01.png', title: 'SCADA analiz raporu', captionLines: ['SCADA analiz raporu', 'Geliştirme CSV snapshot verisi', 'Kalite durumu filtresi: Tümü', 'Uyarı: Kalite uyarısı'], developmentLabel: 'Geliştirme CSV snapshot verisi', rowCount: 2 }
    mockedPost.mockResolvedValueOnce(period as never)
    mockedPost.mockResolvedValueOnce(caption as never)
    mockedPost.mockResolvedValueOnce({ recorded: true } as never)
    mockedRenderPng.mockResolvedValueOnce(new Blob(['png']))
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    await screen.findByText(/SCADA Zaman Serisi Grafiği/)
    document.querySelector('div.h-72')!.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    fireEvent.click(screen.getByRole('button', { name: 'PNG indir' }))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedPost.mock.calls[1]).toEqual([`${EXPORT}/PNG`, { analysis: queryBody() }])
    expect(mockedRenderPng.mock.calls[0]![1].captionLines).toEqual(caption.captionLines)
    expect(mockedPost.mock.calls[2]).toEqual([`${EXPORT}/PNG/complete`, { exportId: 'srv-1', outcome: 'SUCCEEDED' }])
    // order: caption → bytes drawn → completion (success audit) → delivery
    expect(mockedPost.mock.invocationCallOrder[2]!).toBeGreaterThan(mockedRenderPng.mock.invocationCallOrder[0]!)
    expect(downloads).toEqual(['scada_x_2026-06-01.png'])
  })

  async function pngSetup() {
    mockedPost.mockResolvedValueOnce(period as never)
    mockedPost.mockResolvedValueOnce({ format: 'PNG', exportId: 'srv-1', fileName: 'x.png', title: 'T', captionLines: ['T'], developmentLabel: null, rowCount: 2 } as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    await screen.findByText(/SCADA Zaman Serisi Grafiği/)
    document.querySelector('div.h-72')!.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
  }

  it('PNG: if the completion (success audit) cannot be recorded the file is NOT delivered', async () => {
    await pngSetup()
    mockedRenderPng.mockResolvedValueOnce(new Blob(['png']))
    mockedPost.mockRejectedValueOnce(new ApiError('x', 503, { code: 'SCADA_AUDIT_FAILED' }))
    fireEvent.click(screen.getByRole('button', { name: 'PNG indir' }))
    expect(await screen.findByText('Dışa aktarım kaydı (audit) yazılamadığı için dosya oluşturulmadı.')).toBeInTheDocument()
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('PNG: a drawing failure reports FAILED (never a success) and delivers nothing', async () => {
    await pngSetup()
    mockedRenderPng.mockRejectedValueOnce(new Error('canvas boom'))
    mockedPost.mockResolvedValueOnce({ recorded: true } as never)
    fireEvent.click(screen.getByRole('button', { name: 'PNG indir' }))
    expect(await screen.findByText('PNG oluşturulurken bir sorun oluştu.')).toBeInTheDocument()
    expect(mockedPost.mock.calls[2]).toEqual([`${EXPORT}/PNG/complete`, { exportId: 'srv-1', outcome: 'FAILED' }])
    expect(mockedPost.mock.calls.some(c => JSON.stringify(c[1]).includes('SUCCEEDED'))).toBe(false)
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('PNG without a drawn chart is never "successful": nothing is requested, nothing is downloaded', async () => {
    await analyse()
    document.querySelectorAll('div.h-72 svg').forEach(n => n.remove()) // whatever the test renderer drew: no chart
    fireEvent.click(screen.getByRole('button', { name: 'PNG indir' }))
    expect(await screen.findByText('Dışa aktarılacak grafik yok.')).toBeInTheDocument()
    expect(mockedPost).toHaveBeenCalledTimes(1) // only the analysis itself
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('a comparison is exported with the comparison body', async () => {
    mockedPost.mockReset()
    mockedDownloadPost.mockResolvedValueOnce({ blob: new Blob(['x']), fileName: 'c.xlsx' })
    mockedPost.mockResolvedValueOnce(cmp as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.change(screen.getByLabelText('Karşılaştırma Modu'), { target: { value: 'SOURCE' } })
    fireEvent.change(screen.getByLabelText('Karşılaştırma Kaynağı'), { target: { value: CAT_B } })
    fireEvent.click(runButton())
    await screen.findByText(/SCADA Karşılaştırma Grafiği/)
    fireEvent.click(screen.getByRole('button', { name: 'XLSX indir' }))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedDownloadPost).toHaveBeenCalledWith(`${EXPORT}/XLSX`, { comparison: mockedPost.mock.calls[0]![1] })
  })

  it('all four buttons need the EXISTING export permission; without it none is rendered and nothing can be requested', async () => {
    mockedUseTenantPermissions.mockReturnValue({ can: (c: string) => c !== 'REPORT:ARTIFACT:EXPORT', isTenantAdmin: false, loading: false, permissions: [], refresh: () => undefined })
    await analyse()
    for (const name of ['CSV indir', 'PNG indir', 'PDF indir', 'XLSX indir']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(mockedDownloadPost).not.toHaveBeenCalled()
  })

  it('a blocked analysis has no chart and therefore no export buttons at all', async () => {
    mockedPost.mockResolvedValueOnce({ ...period, status: 'BLOCKED', code: 'NO_VALID_DATA' } as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await pickSourceAndSeries()
    fireEvent.click(runButton())
    await screen.findByText(/analiz edilebilir veri yok/)
    for (const name of ['CSV indir', 'PNG indir', 'PDF indir', 'XLSX indir']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(mockedDownloadPost).not.toHaveBeenCalled()
  })

  it.each([
    ['no points at all', { ...period, series: [{ ...period.series[0]!, points: [] }] }],
  ])('%s: an empty result is never exported — no request, a clear message', async (_n, result) => {
    await analyse(result)
    for (const name of ['CSV indir', 'XLSX indir', 'PDF indir']) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(await screen.findByText('Dışa aktarılacak veri yok.')).toBeInTheDocument()
    }
    expect(mockedDownloadPost).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('a rapid double click sends ONE request (the export guard lives in the export path, not only in disabled)', async () => {
    let resolve!: (v: { blob: Blob; fileName: string }) => void
    mockedDownloadPost.mockReturnValueOnce(new Promise(r => (resolve = r)))
    await analyse()
    const btn = screen.getByRole('button', { name: 'PDF indir' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(mockedDownloadPost).toHaveBeenCalledTimes(1)
    resolve({ blob: new Blob(['x']), fileName: 'a.pdf' })
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(btn).not.toBeDisabled())
  })

  it.each([
    [403, 'x', 'Bu export işlemi için yetkiniz yok.'],
    [409, 'SCADA_EXPORT_EMPTY', 'Dışa aktarılacak veri yok.'],
    [503, 'SCADA_AUDIT_FAILED', 'Dışa aktarım kaydı (audit) yazılamadığı için dosya oluşturulmadı.'],
    [502, 'SCADA_EXPORT_RENDER_FAILED', 'PDF oluşturucu servisine ulaşılamadı. Lütfen daha sonra tekrar deneyin.'],
    [400, 'SCADA_LIMIT_EXCEEDED', 'PDF için veri çok büyük; aralığı daraltın.'],
    [500, 'SCADA_INTERNAL_ERROR', 'PDF oluşturulurken sunucu tarafında bir sorun oluştu. Lütfen daha sonra tekrar deneyin.'],
  ])('a %i / %s answer shows a static Turkish message and never the server text', async (status, code, message) => {
    mockedDownloadPost.mockRejectedValueOnce(new ApiError('Server=10.0.0.5;Password=hunter2', status, { code, message: 'Server=10.0.0.5;Password=hunter2' }))
    await analyse()
    fireEvent.click(screen.getByRole('button', { name: 'PDF indir' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/hunter2|Server=/)
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('the export repeats the request of the LAST analysis, not whatever the form says now; a tenant change removes the result and the buttons', async () => {
    mockedDownloadPost.mockResolvedValue({ blob: new Blob(['x']), fileName: 'a.csv' })
    await analyse()
    const first = queryBody()
    fireEvent.click(await screen.findByLabelText(/Reaktif Endeks/)) // the form changes, no new analysis
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }))
    await waitFor(() => expect(mockedDownloadPost).toHaveBeenCalledTimes(1))
    expect(mockedDownloadPost.mock.calls[0]![1]).toEqual({ analysis: first })
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'CSV indir' })).not.toBeInTheDocument())
    expect(mockedDownloadPost).toHaveBeenCalledTimes(1)
  })

  it('the legacy dataset view keeps its own CSV / PDF / XLSX (no SCADA export endpoint is used)', async () => {
    installGet(new ApiError('nf', 404, { code: 'SCADA_NOT_FOUND' }))
    mockedDownload.mockResolvedValueOnce({ blob: new Blob(['x']), fileName: 'legacy.pdf' })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByText('Kayıt Sayısı')
    fireEvent.click(await screen.findByRole('button', { name: 'PDF indir' }))
    await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith('/api/v1/reports/A1/export/PDF'))
    expect(mockedDownloadPost).not.toHaveBeenCalled()
  })
})
