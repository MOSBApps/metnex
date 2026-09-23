import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTenantPermissions } from '@/contexts/tenant-permission-context'
import { ApiError, tenantApiDownload, tenantApiGet } from '@/lib/api'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { renderSvgToPngBlob } from './png-export'
import { ReportAnalysisClient } from './report-analysis-client'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, tenantApiGet: vi.fn(), tenantApiDownload: vi.fn() }
})

vi.mock('./png-export', async () => {
  const actual = await vi.importActual<typeof import('./png-export')>('./png-export')
  return { ...actual, renderSvgToPngBlob: vi.fn() }
})

// TASK-027.57 — PDF/XLSX visibility is (UX-only) gated on REPORT:ARTIFACT:EXPORT. Every test in
// this file defaults to "granted" (mirrors a real user who can already reach this screen and has
// export rights) unless a test overrides it to specifically cover the "no permission" contract.
vi.mock('@/contexts/tenant-permission-context', () => ({
  useTenantPermissions: vi.fn(() => ({ can: () => true, isTenantAdmin: false, loading: false, permissions: [], refresh: () => undefined })),
}))

const mockedGet = vi.mocked(tenantApiGet)
const mockedDownload = vi.mocked(tenantApiDownload)
const mockedRenderSvgToPngBlob = vi.mocked(renderSvgToPngBlob)
const mockedUseTenantPermissions = vi.mocked(useTenantPermissions)

const sampleRow = {
  no: 'ROW-0001',
  label: 'Vardiya Kontrolü',
  occurredAt: '2026-01-05T00:00:00.000Z',
  status: 'COMPLETED',
  quantity: 2,
  unitPrice: 50,
  amount: 100,
}

/**
 * TASK-027.54 — the reporting web analysis screen had no frontend coverage before this task
 * (the JSON `/data` endpoint and this page are both new). Covers the states the spec calls out:
 * loading, success, empty, 404/403/5xx, filter query params, and tenant-switch clearing.
 */
describe('ReportAnalysisClient', () => {
  beforeEach(() => {
    mockedGet.mockReset()
  })

  it('shows a loading state, then the stat cards and table once data arrives', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'İşlem Kayıtları' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)

    expect(screen.getByText('Yükleniyor')).toBeInTheDocument()
    expect(await screen.findByText('Vardiya Kontrolü')).toBeInTheDocument()
    expect(screen.getByText('ROW-0001')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledWith('/api/v1/reports/A1/data')
  })

  it('shows an empty state when the artifact returns zero rows', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'İşlem Kayıtları' }, rows: [], totalAmount: 0 })
    render(<ReportAnalysisClient artifactId="A1" />)

    expect(await screen.findByText('Sonuç yok')).toBeInTheDocument()
  })

  it('shows a "data source not configured" state on a 404 (missing artifact, or one with no registered dataset provider — the expected DEC-0012 default before a domain module registers its own)', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError('not found', 404))
    render(<ReportAnalysisClient artifactId="MISSING" />)

    expect(await screen.findByText('Veri kaynağı yapılandırılmamış')).toBeInTheDocument()
  })

  it('shows a permission message on 401/403 without leaking the raw backend error', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError('Forbidden resource', 403))
    render(<ReportAnalysisClient artifactId="A1" />)

    expect(await screen.findByText('Bu rapora erişim yetkiniz yok.')).toBeInTheDocument()
    expect(screen.queryByText('Forbidden resource')).not.toBeInTheDocument()
  })

  it('shows a generic message on a 5xx without leaking the raw backend error', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError('relation "x" does not exist', 500))
    render(<ReportAnalysisClient artifactId="A1" />)

    expect(await screen.findByText(/Rapor sunucusunda bir sorun oluştu/)).toBeInTheDocument()
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
  })

  it('sends q/status filters as query params when Uygula is clicked', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'İşlem Kayıtları' }, rows: [], totalAmount: 0 })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByText('Sonuç yok')

    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'İşlem Kayıtları' }, rows: [sampleRow], totalAmount: 100 })
    fireEvent.change(screen.getByPlaceholderText('Ara...'), { target: { value: 'vardiya' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'COMPLETED' } })
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }))

    await waitFor(() =>
      expect(mockedGet).toHaveBeenLastCalledWith('/api/v1/reports/A1/data?q=vardiya&status=COMPLETED'),
    )
  })

  it('clears stale data and reloads when the active tenant changes', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'Tenant A' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    expect(await screen.findByText('Vardiya Kontrolü')).toBeInTheDocument()

    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'Tenant B' }, rows: [], totalAmount: 0 })
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))

    expect(await screen.findByText('Sonuç yok')).toBeInTheDocument()
    expect(screen.queryByText('Vardiya Kontrolü')).not.toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })
})

/**
 * TASK-027.55 — CSV/PNG export from the analysis screen. `URL.createObjectURL`/`revokeObjectURL`
 * and `<a>.click()` are mocked (jsdom has no real download mechanism); `renderSvgToPngBlob` (the
 * canvas-heavy part) is mocked here too — its own orchestration is covered directly in
 * png-export.spec.ts, so this file only asserts the *wiring*: what the button does, when it's
 * disabled, and that a double click never produces two downloads.
 */
describe('ReportAnalysisClient — CSV/PNG export', () => {
  let clickSpy: ReturnType<typeof vi.fn>
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>
  let anchors: HTMLAnchorElement[]

  beforeEach(() => {
    mockedGet.mockReset()
    mockedRenderSvgToPngBlob.mockReset()
    anchors = []
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
        anchors.push(el as HTMLAnchorElement)
      }
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('CSV indir is disabled while there is no data, enabled once rows arrive', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [], totalAmount: 0 })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByText('Sonuç yok')
    // rows.length === 0, so the button never appears — the empty state replaces the whole content area
    expect(screen.queryByRole('button', { name: 'CSV indir' })).not.toBeInTheDocument()

    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }))
    await screen.findByRole('button', { name: 'CSV indir' })
    expect(screen.getByRole('button', { name: 'CSV indir' })).not.toBeDisabled()
  })

  it('PNG export is blocked when there is no chart data — no PNG indir button when rows are empty', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [], totalAmount: 0 })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByText('Sonuç yok')
    expect(screen.queryByRole('button', { name: 'PNG indir' })).not.toBeInTheDocument()
    expect(mockedRenderSvgToPngBlob).not.toHaveBeenCalled()
  })

  it('clicking CSV indir downloads a CSV blob with a safe filename', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'CSV indir' }))

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    const blob = createObjectURLSpy.mock.calls[0]![0] as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(anchors[0]!.download).toMatch(/^rapor_A1_\d{4}-\d{2}-\d{2}\.csv$/)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('a rapid double click on CSV indir produces exactly one download', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    const button = await screen.findByRole('button', { name: 'CSV indir' })

    fireEvent.click(button)
    fireEvent.click(button)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    // real-timer wait past the 400ms cooldown — a genuinely new click afterwards still works
    await new Promise(resolve => setTimeout(resolve, 450))
    fireEvent.click(button)
    expect(clickSpy).toHaveBeenCalledTimes(2)
  }, 10000)

  it('shows the "Geliştirme simülasyon verisi" badge only for the dev fixture artifact code', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'DEV_REPORTING_FIXTURE', title: 'Simülasyon' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="DEV_REPORTING_FIXTURE" />)
    expect(await screen.findByText('Geliştirme simülasyon verisi')).toBeInTheDocument()
  })

  it('does not show the dev fixture badge for an ordinary artifact', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByText('Vardiya Kontrolü')
    expect(screen.queryByText('Geliştirme simülasyon verisi')).not.toBeInTheDocument()
  })

  /** Recharts' `ResponsiveContainer` renders its inner `<svg>` one effect-cycle after the button
   * that triggers export becomes queryable (it sizes itself off the ResizeObserver polyfill in
   * vitest.setup.ts, which fires after commit) — the export handler reads that `<svg>` from the
   * DOM, so every PNG test waits for it explicitly instead of racing the click against it. */
  async function findChartSvg(container: HTMLElement) {
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy())
  }

  it('PNG indir is enabled once chart data exists, and downloads the mocked PNG blob', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' })
    mockedRenderSvgToPngBlob.mockResolvedValueOnce(pngBlob)
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    const { container } = render(<ReportAnalysisClient artifactId="A1" />)
    const button = await screen.findByRole('button', { name: 'PNG indir' })
    expect(button).not.toBeDisabled()
    await findChartSvg(container)

    fireEvent.click(button)
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(createObjectURLSpy).toHaveBeenCalledWith(pngBlob)
    expect(anchors[0]!.download).toMatch(/^rapor_A1_\d{4}-\d{2}-\d{2}\.png$/)
  })

  it('passes the active filters and dev-fixture flag into the PNG caption', async () => {
    mockedRenderSvgToPngBlob.mockResolvedValueOnce(new Blob(['png']))
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'DEV_REPORTING_FIXTURE', title: 'Simülasyon' }, rows: [sampleRow], totalAmount: 100 })
    const { container } = render(<ReportAnalysisClient artifactId="DEV_REPORTING_FIXTURE" />)
    const button = await screen.findByRole('button', { name: 'PNG indir' })
    await findChartSvg(container)
    fireEvent.click(button)

    await waitFor(() => expect(mockedRenderSvgToPngBlob).toHaveBeenCalledTimes(1))
    const [, options] = mockedRenderSvgToPngBlob.mock.calls[0]!
    expect(options.captionLines).toContain('Geliştirme simülasyon verisi')
  })

  it('a rapid double click on PNG indir produces exactly one export call', async () => {
    let resolvePng: (blob: Blob) => void = () => undefined
    mockedRenderSvgToPngBlob.mockReturnValueOnce(new Promise(resolve => (resolvePng = resolve)))
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    const { container } = render(<ReportAnalysisClient artifactId="A1" />)
    const button = await screen.findByRole('button', { name: 'PNG indir' })
    await findChartSvg(container)

    fireEvent.click(button)
    fireEvent.click(button)
    resolvePng(new Blob(['png']))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedRenderSvgToPngBlob).toHaveBeenCalledTimes(1)
  })

  it('PNG export failure shows a safe generic message, never the raw error', async () => {
    mockedRenderSvgToPngBlob.mockRejectedValueOnce(new Error('canvas getContext returned null at internal/canvas.js:42'))
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    const { container } = render(<ReportAnalysisClient artifactId="A1" />)
    const button = await screen.findByRole('button', { name: 'PNG indir' })
    await findChartSvg(container)
    fireEvent.click(button)

    expect(await screen.findByText('PNG oluşturulurken bir sorun oluştu.')).toBeInTheDocument()
    expect(screen.queryByText(/getContext/)).not.toBeInTheDocument()
  })

  it('clears export state on tenant change — no export button targets the old tenant\'s data after a switch', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'Tenant A' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByRole('button', { name: 'CSV indir' })

    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'Tenant B' }, rows: [], totalAmount: 0 })
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))

    await screen.findByText('Sonuç yok')
    expect(screen.queryByRole('button', { name: 'CSV indir' })).not.toBeInTheDocument()
  })
})

/**
 * TASK-027.56 — PDF/XLSX export. Unlike CSV/PNG, the file bytes and filename come from the
 * backend (`GET /reports/:code/export/:format`, via `tenantApiDownload`, mocked here) — this file
 * only asserts the wiring: active filters forwarded as query params, loading/disabled state,
 * double-click protection (the same `export-guard.ts` primitive already unit-tested on its own in
 * export-guard.spec.ts), and safe error messages per status code.
 */
describe('ReportAnalysisClient — PDF/XLSX export', () => {
  let clickSpy: ReturnType<typeof vi.fn>
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>
  let anchors: HTMLAnchorElement[]

  beforeEach(() => {
    mockedGet.mockReset()
    mockedDownload.mockReset()
    anchors = []
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
        anchors.push(el as HTMLAnchorElement)
      }
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('PDF/XLSX indir are disabled while there is no data, enabled once rows arrive', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [], totalAmount: 0 })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByText('Sonuç yok')
    expect(screen.queryByRole('button', { name: 'PDF indir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'XLSX indir' })).not.toBeInTheDocument()

    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }))
    await screen.findByRole('button', { name: 'PDF indir' })
    expect(screen.getByRole('button', { name: 'PDF indir' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'XLSX indir' })).not.toBeDisabled()
  })

  it('clicking PDF indir downloads the blob/filename the backend returned, with active filters as query params', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    fireEvent.change(await screen.findByPlaceholderText('Ara...'), { target: { value: 'vardiya' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'COMPLETED' } })

    const pdfBlob = new Blob(['%PDF-'], { type: 'application/pdf' })
    mockedDownload.mockResolvedValueOnce({ blob: pdfBlob, fileName: 'a1.pdf' })
    fireEvent.click(screen.getByRole('button', { name: 'PDF indir' }))

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedDownload).toHaveBeenCalledWith('/api/v1/reports/A1/export/PDF?q=vardiya&status=COMPLETED')
    expect(createObjectURLSpy).toHaveBeenCalledWith(pdfBlob)
    expect(anchors[0]!.download).toBe('a1.pdf')
  })

  it('clicking XLSX indir calls the XLSX export endpoint (no filters set)', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)

    const xlsxBlob = new Blob(['PK'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    mockedDownload.mockResolvedValueOnce({ blob: xlsxBlob, fileName: 'a1.xlsx' })
    fireEvent.click(await screen.findByRole('button', { name: 'XLSX indir' }))

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedDownload).toHaveBeenCalledWith('/api/v1/reports/A1/export/XLSX')
    expect(anchors[0]!.download).toBe('a1.xlsx')
  })

  it('shows loading text and disables the button while the export is in flight', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    let resolveDownload: ((v: { blob: Blob; fileName: string }) => void) | undefined
    mockedDownload.mockReturnValueOnce(new Promise(resolve => (resolveDownload = resolve)))

    const button = await screen.findByRole('button', { name: 'PDF indir' })
    fireEvent.click(button)

    expect(await screen.findByRole('button', { name: 'PDF oluşturuluyor...' })).toBeDisabled()
    resolveDownload?.({ blob: new Blob(['%PDF-']), fileName: 'a1.pdf' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF indir' })).not.toBeDisabled())
  })

  it.each([
    [401, 'Bu export işlemi için yetkiniz yok.'],
    [403, 'Bu export işlemi için yetkiniz yok.'],
    [404, "Rapor artifact'ı bulunamadı."],
    [502, 'PDF oluşturulurken sunucu tarafında bir sorun oluştu. Lütfen daha sonra tekrar deneyin.'],
    [500, 'PDF oluşturulurken sunucu tarafında bir sorun oluştu. Lütfen daha sonra tekrar deneyin.'],
  ])('a %i export failure shows a safe message, never the raw backend error', async (status, expectedMessage) => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    mockedDownload.mockRejectedValueOnce(new ApiError('relation "report_artifacts" does not exist', status))

    fireEvent.click(await screen.findByRole('button', { name: 'PDF indir' }))

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument()
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
    expect(clickSpy).not.toHaveBeenCalled() // no fake success — nothing was downloaded
  })

  it('a rapid double click on PDF indir produces exactly one download call', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    let resolveDownload: ((v: { blob: Blob; fileName: string }) => void) | undefined
    mockedDownload.mockReturnValueOnce(new Promise(resolve => (resolveDownload = resolve)))

    const button = await screen.findByRole('button', { name: 'PDF indir' })
    fireEvent.click(button)
    fireEvent.click(button)
    resolveDownload?.({ blob: new Blob(['%PDF-']), fileName: 'a1.pdf' })

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedDownload).toHaveBeenCalledTimes(1)
  })

  it('a rapid double click on XLSX indir produces exactly one download call', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    let resolveDownload: ((v: { blob: Blob; fileName: string }) => void) | undefined
    mockedDownload.mockReturnValueOnce(new Promise(resolve => (resolveDownload = resolve)))

    const button = await screen.findByRole('button', { name: 'XLSX indir' })
    fireEvent.click(button)
    fireEvent.click(button)
    resolveDownload?.({ blob: new Blob(['PK']), fileName: 'a1.xlsx' })

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(mockedDownload).toHaveBeenCalledTimes(1)
  })

  it('PDF and XLSX export independently — clicking one does not block the other', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    mockedDownload.mockResolvedValueOnce({ blob: new Blob(['%PDF-']), fileName: 'a1.pdf' })
    mockedDownload.mockResolvedValueOnce({ blob: new Blob(['PK']), fileName: 'a1.xlsx' })

    fireEvent.click(await screen.findByRole('button', { name: 'PDF indir' }))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'XLSX indir' }))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(2))

    expect(mockedDownload).toHaveBeenNthCalledWith(1, '/api/v1/reports/A1/export/PDF')
    expect(mockedDownload).toHaveBeenNthCalledWith(2, '/api/v1/reports/A1/export/XLSX')
  })

  it('shows the "Geliştirme simülasyon verisi" badge for the dev fixture artifact (the export label row is a backend-side guarantee, verified in reporting.jasper-integration.spec.ts against the real renderer)', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'DEV_REPORTING_FIXTURE', title: 'Simülasyon' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="DEV_REPORTING_FIXTURE" />)
    expect(await screen.findByText('Geliştirme simülasyon verisi')).toBeInTheDocument()
  })

  it('clears export state on tenant change — no PDF/XLSX button targets the old tenant\'s data after a switch', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'Tenant A' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)
    await screen.findByRole('button', { name: 'PDF indir' })

    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'Tenant B' }, rows: [], totalAmount: 0 })
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))

    await screen.findByText('Sonuç yok')
    expect(screen.queryByRole('button', { name: 'PDF indir' })).not.toBeInTheDocument()
    expect(mockedDownload).not.toHaveBeenCalled()
  })
})

/**
 * TASK-027.57 — frontend export buttons are UX-only, never the authorization boundary (that is
 * `PermissionGuard`, unit-tested for real in permission.guard.spec.ts). This block only proves the
 * visibility contract: PDF/XLSX (backend REPORT:ARTIFACT:EXPORT-gated) hide when the tenant
 * permission context says the user lacks that permission, while CSV/PNG (gated only on the VIEW
 * permission implied by having fetched `data` at all) stay visible regardless.
 */
describe('ReportAnalysisClient — export button visibility contract (TASK-027.57)', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedDownload.mockReset()
    mockedUseTenantPermissions.mockReturnValue({ can: () => true, isTenantAdmin: false, loading: false, permissions: [], refresh: () => undefined })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides PDF/XLSX indir when the user lacks REPORT:ARTIFACT:EXPORT, while CSV/PNG stay visible', async () => {
    mockedUseTenantPermissions.mockReturnValue({
      can: (code: string) => code !== 'REPORT:ARTIFACT:EXPORT',
      isTenantAdmin: false,
      loading: false,
      permissions: [],
      refresh: () => undefined,
    })
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)

    await screen.findByRole('button', { name: 'CSV indir' })
    expect(screen.getByRole('button', { name: 'PNG indir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PDF indir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'XLSX indir' })).not.toBeInTheDocument()
  })

  it('shows PDF/XLSX indir when the user holds REPORT:ARTIFACT:EXPORT', async () => {
    mockedGet.mockResolvedValueOnce({ artifact: { code: 'A1', title: 'X' }, rows: [sampleRow], totalAmount: 100 })
    render(<ReportAnalysisClient artifactId="A1" />)

    expect(await screen.findByRole('button', { name: 'PDF indir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'XLSX indir' })).toBeInTheDocument()
  })
})
