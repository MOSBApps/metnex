import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, tenantApiGet, tenantApiPost } from '@/lib/api'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { ScadaVirtualColumnPanel } from './scada-virtual-column-panel'
import type { ScadaCatalog, VirtualColumnSummary } from './scada-catalog.types'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, tenantApiGet: vi.fn(), tenantApiPost: vi.fn() }
})
const mockedGet = vi.mocked(tenantApiGet)
const mockedPost = vi.mocked(tenantApiPost)

const CAT = '11111111-1111-4111-8111-111111111111'
const DEV = 'Geliştirme CSV snapshot verisi'
const series = (k: string) => ({ seriesKey: k, label: k, unit: '', valueType: 'INDEX', available: true, qualityStatus: 'OK', verificationStatus: 'VERIFIED' as const, sourceCatalogId: CAT })
const catalog = (developmentLabel: string | null = DEV): ScadaCatalog => ({
  artifact: null, developmentLabel,
  sources: [{ catalogId: CAT, name: 'Kaynak A', status: 'ACTIVE', mappingStatus: 'RESOLVED', schemaStatus: 'UNVERIFIED', timezoneStatus: 'DEVELOPMENT_OVERRIDE', timezone: 'Europe/Istanbul', supportedIntervals: ['HOURLY'], rowCount: 1, minAt: null, maxAt: null, selectable: true, blockedReason: null, series: [series('A_COUNTER'), series('C_INDEX')] }],
})
const vc = (over: Partial<VirtualColumnSummary> = {}): VirtualColumnSummary => ({ virtualColumnId: 'vc-1', catalogId: CAT, seriesKey: 'TOTAL', label: 'Toplam', unit: 'kWh', valueType: 'INDEX', inputSeriesKeys: ['A_COUNTER', 'C_INDEX'], version: 1, status: 'ACTIVE', activeVersion: 1, versions: [{ version: 1, status: 'ACTIVE' }], ...over })
const install = (items: VirtualColumnSummary[], canManage = true) => mockedGet.mockImplementation(async () => ({ virtualColumns: items, canManage }) as never)
const LIST = '/api/v1/reports/SCADA_HOURLY_ANALYSIS/analysis/virtual-columns'
const mount = (over: { cat?: ScadaCatalog | null; source?: string; onUse?: (ids: string[]) => void } = {}) =>
  render(<ScadaVirtualColumnPanel artifactId="SCADA_HOURLY_ANALYSIS" catalog={over.cat === undefined ? catalog() : over.cat} selectedSourceId={over.source ?? CAT} locked={false} onUseChange={over.onUse ?? (() => undefined)} />)

describe('ScadaVirtualColumnPanel (development only)', () => {
  beforeEach(() => { mockedGet.mockReset(); mockedPost.mockReset() })
  afterEach(() => vi.restoreAllMocks())

  it('is NOT rendered — and asks the API for nothing — when the catalog carries no development label (production / fixture off)', async () => {
    install([vc()])
    const { container } = mount({ cat: catalog(null) })
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
    expect(mockedGet).not.toHaveBeenCalled()
    const none = mount({ cat: null })
    expect(none.container.innerHTML).toBe('')
  })

  it('is hidden when the list route does not exist (404) — the environment has no development store', async () => {
    mockedGet.mockRejectedValue(new ApiError('nf', 404))
    const { container } = mount()
    await waitFor(() => expect(mockedGet).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  it('lists the tenant\'s columns with status, unit and version and carries the development label', async () => {
    install([vc(), vc({ virtualColumnId: 'vc-2', label: 'Taslak', seriesKey: 'DRAFTY', status: 'DRAFT', activeVersion: null })], false)
    mount()
    expect(await screen.findByText('Toplam')).toBeInTheDocument()
    expect(screen.getByText('Taslak')).toBeInTheDocument()
    expect(screen.getByText(DEV)).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledWith(LIST)
  })

  it('a normal user (canManage:false) sees no create / activate / disable control', async () => {
    install([vc(), vc({ virtualColumnId: 'vc-2', label: 'Taslak', seriesKey: 'D', status: 'DRAFT', activeVersion: null })], false)
    mount()
    await screen.findByText('Toplam')
    expect(screen.queryByRole('button', { name: 'Yeni sanal kolon' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aktif et' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Devre dışı bırak' })).not.toBeInTheDocument()
  })

  it('only an ACTIVE column of the SELECTED source can be used; the choice is reported and drops when the source changes', async () => {
    install([vc(), vc({ virtualColumnId: 'vc-2', label: 'Taslak', seriesKey: 'D', status: 'DRAFT', activeVersion: null })], false)
    const onUse = vi.fn()
    const { rerender } = mount({ onUse })
    fireEvent.click(await screen.findByLabelText('Kullan: Toplam'))
    expect(onUse).toHaveBeenLastCalledWith(['vc-1'])
    expect((screen.getByLabelText('Kullan: Taslak') as HTMLInputElement).disabled).toBe(true)
    rerender(<ScadaVirtualColumnPanel artifactId="SCADA_HOURLY_ANALYSIS" catalog={catalog()} selectedSourceId="" locked={false} onUseChange={onUse} />)
    await waitFor(() => expect(onUse).toHaveBeenLastCalledWith([]))
    expect((screen.getByLabelText('Kullan: Toplam') as HTMLInputElement).disabled).toBe(true)
  })

  it('an admin creates a column: exactly the authored fields are sent, the expression is dropped from the form after saving', async () => {
    install([], true)
    mockedPost.mockResolvedValue({} as never)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni sanal kolon' }))
    fireEvent.change(screen.getByLabelText('Sanal kolon etiketi'), { target: { value: 'Toplam' } })
    fireEvent.change(screen.getByLabelText('Sanal kolon birimi'), { target: { value: 'kWh' } })
    fireEvent.change(screen.getByLabelText('Sanal kolon seri anahtarı'), { target: { value: 'TOTAL' } })
    expect(screen.getByRole('button', { name: 'Doğrula ve kaydet' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Sanal kolon kaynağı'), { target: { value: CAT } })
    fireEvent.click(screen.getByLabelText('A_COUNTER'))
    fireEvent.click(screen.getByLabelText('C_INDEX'))
    fireEvent.change(screen.getByLabelText('Sanal kolon formülü'), { target: { value: 'A_COUNTER + C_INDEX' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve kaydet' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1))
    expect(mockedPost).toHaveBeenCalledWith(LIST, { label: 'Toplam', unit: 'kWh', catalogId: CAT, seriesKey: 'TOTAL', expression: 'A_COUNTER + C_INDEX', inputSeriesKeys: ['A_COUNTER', 'C_INDEX'] })
    await waitFor(() => expect(screen.queryByLabelText('Sanal kolon formülü')).not.toBeInTheDocument())
    expect(document.body.textContent).not.toContain('A_COUNTER + C_INDEX')
    expect(mockedGet.mock.calls.length).toBeGreaterThan(1) // the list is reloaded
  })

  it('input series are limited to the source\'s VERIFIED series and cannot be picked before a source', async () => {
    install([], true)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni sanal kolon' }))
    expect(screen.getByText('Girdi serisi seçmek için önce bir kaynak seçin.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Sanal kolon kaynağı'), { target: { value: CAT } })
    expect(screen.getAllByRole('checkbox').map(c => (c.closest('label') as HTMLElement).textContent)).toEqual(['A_COUNTER', 'C_INDEX'])
  })

  it('a validation failure shows a STATIC message only — never the server text or the user\'s expression — and logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => undefined))
    install([], true)
    mockedPost.mockRejectedValue(new ApiError('Server=10.0.0.5;Password=hunter2 SELECT 1', 409, { code: 'SCADA_VIRTUAL_COLUMN_INVALID', message: 'Server=10.0.0.5' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni sanal kolon' }))
    fireEvent.change(screen.getByLabelText('Sanal kolon etiketi'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Sanal kolon birimi'), { target: { value: 'kWh' } })
    fireEvent.change(screen.getByLabelText('Sanal kolon seri anahtarı'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Sanal kolon kaynağı'), { target: { value: CAT } })
    fireEvent.click(screen.getByLabelText('A_COUNTER'))
    fireEvent.change(screen.getByLabelText('Sanal kolon formülü'), { target: { value: 'eval(SECRET_EXPR_424242)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve kaydet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Formül doğrulanamadı')
    expect(document.body.textContent).not.toMatch(/hunter2|Server=|10\.0\.0\.5/)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Sanal kolon formülü')).toBeInTheDocument() // the form stays for correction
  })

  it('activate / disable call the management routes for THAT column', async () => {
    install([vc({ virtualColumnId: 'vc-2', label: 'Taslak', seriesKey: 'D', status: 'DRAFT', activeVersion: null }), vc()], true)
    mockedPost.mockResolvedValue({} as never)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Aktif et' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith(`${LIST}/vc-2/activate`, {}))
    fireEvent.click(await screen.findByRole('button', { name: 'Devre dışı bırak' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith(`${LIST}/vc-1/disable`, {}))
  })

  it('a tenant change clears the list, the selection and the form at once; a late answer of the OLD tenant cannot come back', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    mockedGet.mockImplementationOnce(async () => ({ virtualColumns: [vc({ label: 'Eski Tenant Kolonu' })], canManage: true }) as never)
    mount()
    await screen.findByText('Eski Tenant Kolonu')
    mockedGet.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)) as never)
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 't-b' } }))
    await waitFor(() => expect(screen.queryByText('Eski Tenant Kolonu')).not.toBeInTheDocument())
    await waitFor(() => expect(resolvers).toHaveLength(1))
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 't-c' } }))
    await waitFor(() => expect(resolvers).toHaveLength(2))
    resolvers[1]!({ virtualColumns: [vc({ label: 'Yeni Tenant Kolonu' })], canManage: false })
    await screen.findByText('Yeni Tenant Kolonu')
    resolvers[0]!({ virtualColumns: [vc({ label: 'Gecikmiş Eski Yanıt' })], canManage: true })
    await new Promise(r => setTimeout(r, 30))
    expect(screen.queryByText('Gecikmiş Eski Yanıt')).not.toBeInTheDocument()
    expect(screen.getByText('Yeni Tenant Kolonu')).toBeInTheDocument()
  })

  it('locks every control while an analysis / request is running', async () => {
    install([vc()], true)
    render(<ScadaVirtualColumnPanel artifactId="SCADA_HOURLY_ANALYSIS" catalog={catalog()} selectedSourceId={CAT} locked onUseChange={() => undefined} />)
    expect((await screen.findByLabelText('Kullan: Toplam') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Devre dışı bırak' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Yeni sanal kolon' })).toBeDisabled()
  })
})
