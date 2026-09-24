import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, tenantApiGet } from '@/lib/api'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { ReportsListClient } from './reports-list-client'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, tenantApiGet: vi.fn() }
})

const mockedGet = vi.mocked(tenantApiGet)

/**
 * TASK-027.54-R2 — the reporting entry point (`/app/reports`) had no frontend coverage before
 * this task. Covers loading/success/empty/401/403/5xx, active-vs-inactive analysis links, URL
 * encoding of the artifact code, and tenant-switch reload.
 */
describe('ReportsListClient', () => {
  beforeEach(() => {
    mockedGet.mockReset()
  })

  it('lists artifacts with title, code, and an Analiz link for an active artifact', async () => {
    mockedGet.mockResolvedValueOnce({
      artifacts: [{ code: 'A1', title: 'İşlem Kayıtları', description: null, isActive: true }],
    })
    render(<ReportsListClient />)

    expect(await screen.findByText('İşlem Kayıtları')).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Analiz' })).toHaveAttribute('href', '/app/reports/A1/analysis')
    expect(mockedGet).toHaveBeenCalledWith('/api/v1/reports/artifacts')
  })

  it('marks the development CSV snapshot artifact with its label; a normal artifact has none (TASK-027.73-R1)', async () => {
    mockedGet.mockResolvedValueOnce({
      artifacts: [
        { code: 'SCADA_HOURLY_ANALYSIS', title: 'SCADA Saatlik/Günlük Analiz', description: null, isActive: true, developmentOnly: true, developmentLabel: 'Geliştirme CSV snapshot verisi' },
        { code: 'A1', title: 'Normal Rapor', description: null, isActive: true },
      ],
    })
    render(<ReportsListClient />)

    expect(await screen.findByText('Geliştirme CSV snapshot verisi')).toBeInTheDocument()
    expect(screen.getAllByText('Geliştirme CSV snapshot verisi')).toHaveLength(1)
  })

  it('shows the SCADA_HOURLY_ANALYSIS artifact with its analysis link when the API lists it (fixture on) and shows nothing of it when it does not (TASK-027.73-R3)', async () => {
    mockedGet.mockResolvedValueOnce({
      artifacts: [{ code: 'SCADA_HOURLY_ANALYSIS', title: 'SCADA Saatlik/Günlük Analiz', description: null, isActive: true, developmentOnly: true, developmentLabel: 'Geliştirme CSV snapshot verisi' }],
    })
    const { unmount } = render(<ReportsListClient />)
    expect(await screen.findByRole('link', { name: 'Analiz' })).toHaveAttribute('href', '/app/reports/SCADA_HOURLY_ANALYSIS/analysis')
    unmount()
    mockedGet.mockResolvedValueOnce({ artifacts: [{ code: 'A1', title: 'Normal Rapor', description: null, isActive: true }] })
    render(<ReportsListClient />)
    expect(await screen.findByText('Normal Rapor')).toBeInTheDocument()
    expect(screen.queryByText('SCADA_HOURLY_ANALYSIS')).not.toBeInTheDocument()
    expect(screen.queryByText('Geliştirme CSV snapshot verisi')).not.toBeInTheDocument()
  })

  it('does not render an analysis link for an inactive artifact', async () => {
    mockedGet.mockResolvedValueOnce({
      artifacts: [{ code: 'A2', title: 'Pasif Rapor', description: null, isActive: false }],
    })
    render(<ReportsListClient />)

    expect(await screen.findByText('Pasif Rapor')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Analiz' })).not.toBeInTheDocument()
  })

  it('URL-encodes an artifact code containing unsafe characters in the analysis link', async () => {
    mockedGet.mockResolvedValueOnce({
      artifacts: [{ code: 'A/B C', title: 'Encoded Kod', description: null, isActive: true }],
    })
    render(<ReportsListClient />)

    expect(await screen.findByRole('link', { name: 'Analiz' })).toHaveAttribute(
      'href',
      `/app/reports/${encodeURIComponent('A/B C')}/analysis`,
    )
  })

  it('shows the exact empty-state copy when there are no artifacts', async () => {
    mockedGet.mockResolvedValueOnce({ artifacts: [] })
    render(<ReportsListClient />)

    expect(await screen.findByText('Henüz kullanılabilir bir rapor tanımlanmamış.')).toBeInTheDocument()
  })

  it('shows a permission message on 401/403 without leaking the raw backend error', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError('Forbidden resource', 403))
    render(<ReportsListClient />)

    expect(await screen.findByText('Bu rapor listesine erişim yetkiniz yok.')).toBeInTheDocument()
    expect(screen.queryByText('Forbidden resource')).not.toBeInTheDocument()
  })

  it('shows a generic message on a 5xx without leaking the raw backend error', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError('relation "x" does not exist', 500))
    render(<ReportsListClient />)

    expect(await screen.findByText(/Rapor sunucusunda bir sorun oluştu/)).toBeInTheDocument()
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
  })

  it('TASK-027.60: shows a safe generic message (not the raw fetch/network error) when the API is unreachable, e.g. a misconfigured NEXT_PUBLIC_API_URL/port', async () => {
    mockedGet.mockRejectedValueOnce(new TypeError('fetch failed'))
    render(<ReportsListClient />)

    expect(await screen.findByText('Rapor listesi yüklenemedi. Lütfen tekrar deneyin.')).toBeInTheDocument()
    expect(screen.queryByText(/fetch failed/)).not.toBeInTheDocument()
  })

  it('clears stale data and reloads when the active tenant changes', async () => {
    mockedGet.mockResolvedValueOnce({
      artifacts: [{ code: 'A1', title: 'Tenant A Raporu', description: null, isActive: true }],
    })
    render(<ReportsListClient />)
    expect(await screen.findByText('Tenant A Raporu')).toBeInTheDocument()

    mockedGet.mockResolvedValueOnce({ artifacts: [] })
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: 'tenant-b' } }))

    expect(await screen.findByText('Henüz kullanılabilir bir rapor tanımlanmamış.')).toBeInTheDocument()
    expect(screen.queryByText('Tenant A Raporu')).not.toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })
})

/**
 * DEC-0012 guard, frontend half: this list screen must render whatever the API returns and never
 * hardcode a demo/sample artifact — the empty state is the only thing shown when the API returns
 * nothing (i.e. no dataset provider has been registered by a real domain module yet).
 */
describe('ReportsListClient — no hardcoded demo artifact (DEC-0012)', () => {
  it('the component source contains no hardcoded artifact code or demo/sample artifact literal', () => {
    const source = readFileSync(join(__dirname, 'reports-list-client.tsx'), 'utf8')
    expect(source).not.toMatch(/DEMO_|SAMPLE_ARTIFACT|Demo Operations/i)
  })
})
