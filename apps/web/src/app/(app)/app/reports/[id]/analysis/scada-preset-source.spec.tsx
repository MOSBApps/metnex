import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, tenantApiGet, tenantApiPost } from '@/lib/api'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { ReportAnalysisClient } from './report-analysis-client'

vi.mock('@/lib/api', async () => ({ ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')), tenantApiGet: vi.fn(), tenantApiPost: vi.fn(), tenantApiDownload: vi.fn(), tenantApiDownloadPost: vi.fn() }))
vi.mock('@/contexts/tenant-permission-context', () => ({ useTenantPermissions: () => ({ can: () => true, isTenantAdmin: false, loading: false, permissions: [], refresh: () => undefined }) }))

vi.setConfig({ testTimeout: 30000 })
configure({ asyncUtilTimeout: 10000 }) // the whole web suite runs in parallel: state hand-offs between panels need headroom

const mockedGet = vi.mocked(tenantApiGet)
const mockedPost = vi.mocked(tenantApiPost)

/** TASK-027.59-R1 — preset hydration, development preset store, explicit SOURCE series mapping (web side). */
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const DEV = 'Geliştirme CSV snapshot verisi'
const DEV_PRESET = 'Geliştirme ortamı — bellek içi preset'
const ser = (id: string, key: string, unit = '') => ({ seriesKey: key, label: key, unit, valueType: 'INDEX', available: true, qualityStatus: 'OK', verificationStatus: 'VERIFIED', sourceCatalogId: id })
const src = (id: string, name: string, keys: string[]) => ({ catalogId: id, name, status: 'ACTIVE', mappingStatus: 'RESOLVED', schemaStatus: 'UNVERIFIED', timezoneStatus: 'DEVELOPMENT_OVERRIDE', timezone: 'Europe/Istanbul', supportedIntervals: ['HOURLY', 'DAILY'], rowCount: 48, minAt: '2025-12-31T21:00:00.000Z', maxAt: '2026-01-02T20:00:00.000Z', selectable: true, blockedReason: null, series: keys.map(k => ser(id, k)) })
const catalog = () => ({ artifact: { code: 'SCADA_HOURLY_ANALYSIS', name: 'SCADA', description: 'd', status: 'DEVELOPMENT_ONLY', developmentOnly: true, supportedIntervals: ['HOURLY', 'DAILY'], supportedFormats: [], sourceCatalogIds: [A, B, C], timezoneStatus: 'X', dataOrigin: 'Y' }, developmentLabel: DEV, sources: [src(A, 'Kaynak GT', ['GT1', 'GT2']), src(B, 'Kaynak SG', ['SG1', 'SG2']), src(C, 'Kaynak GT-2', ['GT1', 'GT2'])] })
const NONE = { mode: 'NONE', comparisonRange: null, leftSourceCatalogId: null, rightSourceCatalogId: null, seriesMapping: [] }
const preset = (over: Record<string, unknown> = {}) => ({ presetId: 'pr-1', version: 1, scope: 'PRIVATE', name: 'Vardiya', description: null, status: 'ACTIVE', isOwner: true, bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', sourceCatalogIds: [A], seriesKeys: ['GT1'], virtualColumns: [], statistics: ['SUM', 'MAX'], comparisonMode: 'NONE', comparison: NONE, chartType: 'LINE', timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, effectiveFrom: null, effectiveTo: null, updatedAt: 'x', ...over })
const sourcePreset = (over: Record<string, unknown> = {}) => preset({ name: 'GT↔SG', sourceCatalogIds: [A, B], seriesKeys: ['GT1', 'SG1'], comparisonMode: 'SOURCE', comparison: { mode: 'SOURCE', comparisonRange: null, leftSourceCatalogId: A, rightSourceCatalogId: B, seriesMapping: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG1' }, { leftSeriesKey: 'GT2', rightSeriesKey: 'SG2' }] }, ...over })

interface Env {
  presets: Array<Record<string, unknown>>
  developmentStore: boolean
  canShare: boolean
  resolved: boolean
  details: Record<string, unknown>
  vcs: unknown[]
}
let env: Env
function install() {
  mockedGet.mockImplementation(async (url: string) => {
    if (url.endsWith('/analysis/catalog')) return catalog() as never
    const one = /\/analysis\/presets\/([^/]+)$/.exec(url)
    if (one) {
      const p = env.presets.find(x => x['presetId'] === one[1])
      if (!p) throw new ApiError('nf', 404, { code: 'SCADA_NOT_FOUND' })
      return (env.details[one[1]!] ?? { preset: p, versions: [], resolution: { status: env.resolved ? 'RESOLVED' : 'NOT_RESOLVED' } }) as never
    }
    if (url.endsWith('/analysis/presets')) return { presets: env.presets, developmentStore: env.developmentStore, canShare: env.canShare } as never
    if (url.endsWith('/analysis/virtual-columns')) return { virtualColumns: env.vcs, canManage: false } as never
    throw new ApiError('nf', 404)
  })
}
const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const selectSource = async (id: string) => fireEvent.change(await screen.findByLabelText('Kaynak'), { target: { value: id } })
const tick = () => new Promise(r => setTimeout(r, 30))
async function applyPreset(id: string) {
  await screen.findByLabelText('Kaynak') // the catalog is loaded (a preset is validated against it)
  fireEvent.change(await screen.findByLabelText('Kayıtlı Preset Şablonu'), { target: { value: id } })
}
const sampleAnalysis = { artifactCode: 'SCADA_HOURLY_ANALYSIS', status: 'OK', code: null, interval: 'HOURLY', timezone: 'Europe/Istanbul', range: { startAt: 'a', endAt: 'b' }, preset: null, series: [], excluded: [], sources: [], virtualColumnFailures: [], pointFilter: { qualityStates: [], onlyAnalysisAllowed: false } }

/** Clicks "Analiz Çalıştır" until the request went out: right after a preset is applied the parent may still be catching up with the panel's state. */
async function runUntilCalled() {
  await waitFor(() => {
    fireEvent.click(screen.getByRole('button', { name: /Analiz Çalıştır/ }))
    expect(mockedPost).toHaveBeenCalled()
  })
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  env = { presets: [], developmentStore: true, canShare: false, resolved: true, details: {}, vcs: [] }
})
afterEach(() => vi.restoreAllMocks())

describe('development label and the save form exist only with the development store', () => {
  it('with the store: the label, the restart note and "Preset olarak kaydet" are shown — even with no preset yet', async () => {
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    expect(await screen.findByText(DEV_PRESET)).toBeInTheDocument()
    expect(screen.getByText(/API yeniden başlatılınca silinir/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preset olarak kaydet' })).toBeInTheDocument()
  })

  it('without the store (production): no label, no form, and NO made-up demo preset', async () => {
    env.developmentStore = false
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await screen.findByLabelText('Kaynak')
    await tick()
    expect(screen.queryByText(DEV_PRESET)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preset olarak kaydet' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Kayıtlı Preset Şablonu')).not.toBeInTheDocument()
  })
})

describe('preset hydration', () => {
  it('a plain preset fills source, series, start / end, interval and statistics; the form runs the EXPLICIT analysis afterwards', async () => {
    env.presets = [preset({ bucketInterval: 'DAILY', timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' } })]
    install()
    mockedPost.mockResolvedValue(sampleAnalysis as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await applyPreset('pr-1')
    await waitFor(() => {
      expect(select('Kaynak').value).toBe(A)
      expect(input('Başlangıç tarihi').value).toBe('2026-01-01T00:00')
      expect(input('Bitiş tarihi').value).toBe('2026-01-02T00:00')
      expect(select('Aralık').value).toBe('DAILY')
      expect((screen.getByLabelText(/GT1/) as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText(/GT2/) as HTMLInputElement).checked).toBe(false)
      expect((screen.getByLabelText('SUM') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText('MAX') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText('AVERAGE') as HTMLInputElement).checked).toBe(false)
      expect(screen.getByText(/Uygulanan: Vardiya/)).toBeInTheDocument()
    })
    await runUntilCalled()
    expect(mockedPost.mock.calls[0]![0]).toBe('/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/query')
    expect(mockedPost.mock.calls[0]![1]).toMatchObject({ mode: 'EXPLICIT', sourceCatalogIds: [A], seriesKeys: ['GT1'], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z', bucketInterval: 'DAILY', statistics: ['SUM', 'MAX'] })
  })

  it('PERIOD: the comparison mode and both periods are filled', async () => {
    env.presets = [preset({ comparisonMode: 'PERIOD', comparison: { ...NONE, mode: 'PERIOD', comparisonRange: { startAt: '2026-01-01T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' } } })]
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await applyPreset('pr-1')
    await waitFor(() => {
      expect(select('Karşılaştırma Modu').value).toBe('PERIOD')
      expect(input('Başlangıç tarihi').value).toBe('2026-01-01T00:00')
      expect((screen.getAllByDisplayValue(/2026-01-02T/) as HTMLInputElement[]).map(i => i.value)).toEqual(['2026-01-02T00:00', '2026-01-02T23:00'])
    })
  })

  it('SOURCE: both sources and the explicit pairs (different names) are filled; running sends only those pairs', async () => {
    env.presets = [sourcePreset()]
    install()
    mockedPost.mockResolvedValue({ artifactCode: 'SCADA_HOURLY_ANALYSIS', status: 'OK', code: null, mode: 'SOURCE', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', comparability: 'COMPARABLE', rows: [], unmatchedSeries: [], summary: {}, preset: null, sources: [] } as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await applyPreset('pr-1')
    await waitFor(() => expect(select('Karşılaştırma Modu').value).toBe('SOURCE'))
    await waitFor(() => {
      expect(select('Kaynak').value).toBe(A)
      expect(select('Karşılaştırma Kaynağı').value).toBe(B)
      expect(select('Sağ seri: GT1').value).toBe('SG1')
      expect(select('Sağ seri: GT2').value).toBe('SG2')
    })
    await runUntilCalled()
    expect(mockedPost.mock.calls[0]![0]).toBe('/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/compare')
    expect(mockedPost.mock.calls[0]![1]).toEqual({ artifactCode: 'SCADA_HOURLY_ANALYSIS', mode: 'SOURCE', leftSourceCatalogId: A, rightSourceCatalogId: B, statistics: ['SUM', 'MAX'], period: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, seriesMapping: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG1' }, { leftSeriesKey: 'GT2', rightSeriesKey: 'SG2' }], bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul' })
  })

  it('virtual column references are handed to the virtual column panel and sent as virtualColumnIds', async () => {
    env.vcs = [{ virtualColumnId: 'vc-1', catalogId: A, seriesKey: 'TOTAL', label: 'Toplam sanal', unit: 'kWh', valueType: 'INDEX', inputSeriesKeys: ['GT1', 'GT2'], version: 1, status: 'ACTIVE', activeVersion: 1, versions: [{ version: 1, status: 'ACTIVE' }] }]
    env.presets = [preset({ virtualColumns: [{ virtualColumnId: 'vc-1', version: null }] })]
    install()
    mockedPost.mockResolvedValue(sampleAnalysis as never)
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await applyPreset('pr-1')
    await waitFor(() => expect((screen.getByRole('checkbox', { name: /Toplam sanal/ }) as HTMLInputElement).checked).toBe(true))
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /Analiz Çalıştır/ }))
      expect(mockedPost).toHaveBeenCalled()
      expect(mockedPost.mock.calls[mockedPost.mock.calls.length - 1]![1]).toMatchObject({ virtualColumnIds: ['vc-1'] })
    })
  })

  it.each([
    ['an inactive preset', () => [preset({ status: 'DISABLED' })], true, /Preset aktif değil/],
    ['a preset that no longer resolves', () => [preset()], false, /artık çözümlenemiyor/],
    ['a source that is gone', () => [preset({ sourceCatalogIds: ['44444444-4444-4444-8444-444444444444'] })], true, /kaynak artık mevcut/],
    ['a series that is gone', () => [preset({ seriesKeys: ['GT1', 'NOPE'] })], true, /seri artık kaynakta yok/],
    ['a range outside the data', () => [preset({ timeRange: { startAt: '2030-01-01T00:00:00.000Z', endAt: '2030-01-02T00:00:00.000Z' } })], true, /veri aralığı dışında/],
  ])('%s: NOTHING of the form is changed and a safe message is shown', async (_n, make, resolved, message) => {
    env.presets = make()
    env.resolved = resolved
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await selectSource(C)
    fireEvent.click(await screen.findByLabelText(/GT2/))
    const before = { source: select('Kaynak').value, start: input('Başlangıç tarihi').value, end: input('Bitiş tarihi').value }
    await applyPreset('pr-1')
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(select('Kaynak').value).toBe(before.source)
    expect(input('Başlangıç tarihi').value).toBe(before.start)
    expect(input('Bitiş tarihi').value).toBe(before.end)
    expect((screen.getByLabelText(/GT2/) as HTMLInputElement).checked).toBe(true)
    expect(select('Karşılaştırma Modu').value).toBe('NONE')
    expect(screen.queryByText(/Uygulanan:/)).not.toBeInTheDocument()
  })

  it('a preset that cannot be fetched (another tenant\'s id: 404) shows a safe message and changes nothing', async () => {
    env.presets = [preset()]
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await screen.findByLabelText('Kaynak')
    mockedGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/analysis/catalog')) return catalog() as never
      if (url.endsWith('/analysis/presets')) return { presets: env.presets, developmentStore: true, canShare: false } as never
      throw new ApiError('Server=10.0.0.5;Password=hunter2', 404, { code: 'SCADA_NOT_FOUND' })
    })
    await applyPreset('pr-1')
    expect(await screen.findByText(/Preset detayları yüklenemedi/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/hunter2|Server=/)
    expect(select('Kaynak').value).toBe('')
  })

  it('a tenant change clears the applied preset, the selection, the comparison state and the mapping', async () => {
    env.presets = [sourcePreset()]
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await applyPreset('pr-1')
    await waitFor(() => expect(select('Karşılaştırma Modu').value).toBe('SOURCE'))
    env.presets = []
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'other' } }))
    await waitFor(() => expect(select('Kaynak').value).toBe(''))
    expect(select('Karşılaştırma Modu').value).toBe('NONE')
    expect(screen.queryByLabelText('Kayıtlı Preset Şablonu')).not.toBeInTheDocument()
    expect(screen.queryByText(/Uygulanan:/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('source-mapping-panel')).not.toBeInTheDocument()
  })

  it('a slow preset answer of the OLD tenant cannot fill the NEW tenant\'s form', async () => {
    env.presets = [preset()]
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await screen.findByLabelText('Kaynak')
    let release!: (v: unknown) => void
    mockedGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/analysis/catalog')) return catalog() as never
      if (url.endsWith('/analysis/presets')) return { presets: [], developmentStore: true, canShare: false } as never
      if (url.includes('/analysis/presets/')) return new Promise(r => (release = r)) as never
      return { virtualColumns: [], canManage: false } as never
    })
    await applyPreset('pr-1')
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'other' } }))
    await waitFor(() => expect(select('Kaynak').value).toBe(''))
    release({ preset: preset(), versions: [], resolution: { status: 'RESOLVED' } })
    await tick()
    expect(select('Kaynak').value).toBe('')
    expect(screen.queryByText(/Uygulanan:/)).not.toBeInTheDocument()
  })
})

describe('explicit SOURCE series mapping', () => {
  async function open(rightId: string, seriesLabels: string[]) {
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await selectSource(A)
    for (const l of seriesLabels) fireEvent.click(await screen.findByLabelText(new RegExp(l)))
    fireEvent.change(select('Karşılaştırma Modu'), { target: { value: 'SOURCE' } })
    fireEvent.change(select('Karşılaştırma Kaynağı'), { target: { value: rightId } })
  }
  const run = () => fireEvent.click(screen.getByRole('button', { name: /Analiz Çalıştır/ }))

  it('shows one left → right row per selected series; identical names are paired automatically, different names are NOT', async () => {
    await open(C, ['GT1'])
    expect(select('Sağ seri: GT1').value).toBe('GT1') // same key in the right source
    fireEvent.change(select('Karşılaştırma Kaynağı'), { target: { value: B } })
    expect(select('Sağ seri: GT1').value).toBe('') // SG1 / SG2: nothing is paired by position or similarity
  })

  it('with different names and no explicit choice NO request is made and the user is told why', async () => {
    await open(B, ['GT1'])
    run()
    expect(await screen.findByText(/her seri için sağ kaynaktan bir seri eşleyin/)).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('an unmapped series is never silently dropped: with two selected and one mapped nothing is sent', async () => {
    await open(B, ['GT1', 'GT2'])
    fireEvent.change(select('Sağ seri: GT1'), { target: { value: 'SG1' } })
    run()
    expect(await screen.findByText(/eşlenmeyen seri karşılaştırılmaz/)).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('the same right series cannot be chosen for two left series (the option is disabled)', async () => {
    await open(B, ['GT1', 'GT2'])
    fireEvent.change(select('Sağ seri: GT1'), { target: { value: 'SG1' } })
    const option = within(select('Sağ seri: GT2')).getByRole('option', { name: /SG1/ }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
    expect((within(select('Sağ seri: GT1')).getByRole('option', { name: /SG1/ }) as HTMLOptionElement).disabled).toBe(false)
  })

  it('the explicit choice is sent as { leftSeriesKey, rightSeriesKey } pairs only (no seriesKeys, no baseline / comparison objects)', async () => {
    mockedPost.mockResolvedValue({ artifactCode: 'SCADA_HOURLY_ANALYSIS', status: 'OK', code: null, mode: 'SOURCE', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', comparability: 'COMPARABLE', rows: [], unmatchedSeries: [], summary: {}, preset: null, sources: [] } as never)
    await open(B, ['GT1', 'GT2'])
    fireEvent.change(select('Sağ seri: GT1'), { target: { value: 'SG2' } })
    fireEvent.change(select('Sağ seri: GT2'), { target: { value: 'SG1' } })
    run()
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    const body = mockedPost.mock.calls[0]![1] as Record<string, unknown>
    expect(body['seriesMapping']).toEqual([{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG2' }, { leftSeriesKey: 'GT2', rightSeriesKey: 'SG1' }])
    expect(body).not.toHaveProperty('seriesKeys')
    expect(JSON.stringify(body)).not.toMatch(/baseline|"comparison"/)
  })

  it('a mode change starts clean: switching away and back does not bring an old mapping back', async () => {
    await open(B, ['GT1'])
    fireEvent.change(select('Sağ seri: GT1'), { target: { value: 'SG1' } })
    fireEvent.change(select('Karşılaştırma Modu'), { target: { value: 'NONE' } })
    expect(screen.queryByTestId('source-mapping-panel')).not.toBeInTheDocument()
    fireEvent.change(select('Karşılaştırma Modu'), { target: { value: 'SOURCE' } })
    expect(select('Karşılaştırma Kaynağı').value).toBe('')
    fireEvent.change(select('Karşılaştırma Kaynağı'), { target: { value: B } })
    expect(select('Sağ seri: GT1').value).toBe('')
  })

  it('choosing a different right source drops the earlier mapping; the right source can never equal the left one', async () => {
    await open(B, ['GT1'])
    fireEvent.change(select('Sağ seri: GT1'), { target: { value: 'SG1' } })
    fireEvent.change(select('Karşılaştırma Kaynağı'), { target: { value: C } })
    expect(select('Sağ seri: GT1').value).toBe('GT1') // C has GT1: identical key, auto
    const options = within(select('Karşılaştırma Kaynağı')).getAllByRole('option').map(o => (o as HTMLOptionElement).value)
    expect(options).not.toContain(A)
  })
})

describe('"Preset olarak kaydet"', () => {
  async function ready() {
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await selectSource(A)
    fireEvent.click(await screen.findByLabelText(/GT1/))
    await screen.findByRole('button', { name: 'Preset olarak kaydet' })
  }
  const open = (name = 'Vardiya') => {
    fireEvent.click(screen.getByRole('button', { name: 'Preset olarak kaydet' }))
    if (name) fireEvent.change(screen.getByLabelText('Preset adı'), { target: { value: name } })
  }

  it('posts exactly the plan of the current form (no tenant, role, status, version, owner) and reloads the list', async () => {
    mockedPost.mockResolvedValue({ presetId: 'pr-1' } as never)
    await ready()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0]![0]).toBe('/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/presets')
    expect(mockedPost.mock.calls[0]![1]).toEqual({ name: 'Vardiya', scope: 'PRIVATE', statistics: ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'VALID_COUNT', 'MISSING_COUNT'], timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', sourceCatalogIds: [A], seriesKeys: ['GT1'], comparison: { mode: 'NONE' } })
    expect(await screen.findByText('Preset kaydedildi.')).toBeInTheDocument()
    expect(mockedGet.mock.calls.filter(c => String(c[0]).endsWith('/analysis/presets')).length).toBeGreaterThan(1)
  })

  it('a SOURCE plan is saved with the explicit pairs and no sources / series of its own', async () => {
    mockedPost.mockResolvedValue({ presetId: 'pr-1' } as never)
    await ready()
    fireEvent.change(select('Karşılaştırma Modu'), { target: { value: 'SOURCE' } })
    fireEvent.change(select('Karşılaştırma Kaynağı'), { target: { value: B } })
    fireEvent.change(select('Sağ seri: GT1'), { target: { value: 'SG1' } })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    const body = mockedPost.mock.calls[0]![1] as Record<string, unknown>
    expect(body['comparison']).toEqual({ mode: 'SOURCE', leftSourceCatalogId: A, rightSourceCatalogId: B, seriesMapping: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG1' }] })
    expect(body).not.toHaveProperty('sourceCatalogIds')
    expect(body).not.toHaveProperty('seriesKeys')
  })

  it.each([
    ['an empty name', '', /bir ad girin/],
  ])('%s: nothing is sent', async (_n, name, message) => {
    await ready()
    open(name)
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('an empty / invalid analysis plan (no series, no statistics, incomplete mapping) is never sent', async () => {
    install()
    render(<ReportAnalysisClient artifactId="SCADA_HOURLY_ANALYSIS" />)
    await selectSource(A)
    await screen.findByRole('button', { name: 'Preset olarak kaydet' })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(/En az bir seri seçin/)).toBeInTheDocument()
    fireEvent.click(await screen.findByLabelText(/GT1/))
    for (const s of ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'VALID_COUNT', 'MISSING_COUNT']) fireEvent.click(screen.getByLabelText(s))
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(/En az bir istatistik seçin/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('SUM'))
    fireEvent.change(select('Karşılaştırma Modu'), { target: { value: 'SOURCE' } })
    fireEvent.change(select('Karşılaştırma Kaynağı'), { target: { value: B } })
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(/eşlenmeyen seri karşılaştırılmaz/)).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('TENANT_SHARED is offered only to a caller who may share; a normal user has PRIVATE only', async () => {
    await ready()
    open()
    expect(within(screen.getByLabelText('Preset kapsamı')).queryByRole('option', { name: /TENANT_SHARED/ })).not.toBeInTheDocument()
    env.canShare = true
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'x' } }))
    await waitFor(() => expect(select('Kaynak').value).toBe(''))
    await selectSource(A)
    fireEvent.click(await screen.findByLabelText(/GT1/))
    await screen.findByRole('button', { name: 'Preset olarak kaydet' })
    open()
    expect(within(screen.getByLabelText('Preset kapsamı')).getByRole('option', { name: /TENANT_SHARED/ })).toBeInTheDocument()
  })

  it.each([
    [403, 'SCADA_SCOPE_DENIED', /paylaşmak için yetkiniz yok/],
    [503, 'SCADA_SOURCE_NOT_CONFIGURED', /Preset deposu bu ortamda yok/],
    [503, 'SCADA_AUDIT_FAILED', /Audit hatası/],
    [409, 'SCADA_VIRTUAL_COLUMN_INVALID', /plan geçersiz/],
  ])('a %i %s answer shows a static message and never the server text', async (status, code, message) => {
    mockedPost.mockRejectedValue(new ApiError('Server=10.0.0.5;Password=hunter2', status, { code, message: 'Server=10.0.0.5;Password=hunter2' }))
    await ready()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/hunter2|Server=/)
  })
})
