import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, tenantApiDownloadPost } from '@/lib/api'
import { hasExportableData, scadaExportErrorMessage } from './scada-export-client'
import type { ProjectedAnalysis, ProjectedComparison } from './scada-analysis.types'

afterEach(() => vi.unstubAllGlobals())

describe('tenantApiDownloadPost', () => {
  it('POSTs the JSON body with the tenant / auth headers and returns the blob and the server file name', async () => {
    localStorage.setItem('metnex_access_token', 'tok')
    const fetchMock = vi.fn(async () => new Response('bytes', { status: 200, headers: { 'content-disposition': 'attachment; filename="scada_x_2026-06-01.csv"' } }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await tenantApiDownloadPost('/api/v1/reports/A/analysis/export/CSV', { analysis: { a: 1 } })
    expect(out.fileName).toBe('scada_x_2026-06-01.csv')
    expect(await out.blob.text()).toBe('bytes')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toMatch(/\/api\/v1\/reports\/A\/analysis\/export\/CSV$/)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['Authorization']).toBe('Bearer tok')
    expect(init.body).toBe(JSON.stringify({ analysis: { a: 1 } }))
  })

  it('a failure keeps the STATIC error body on the ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ statusCode: 409, code: 'SCADA_EXPORT_EMPTY', message: 'SCADA_EXPORT_EMPTY' }), { status: 409 })))
    const err = await tenantApiDownloadPost('/x', {}).catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.body).toEqual({ statusCode: 409, code: 'SCADA_EXPORT_EMPTY', message: 'SCADA_EXPORT_EMPTY' })
  })
})

describe('hasExportableData / scadaExportErrorMessage', () => {
  const series = (points: number) => ({ points: Array.from({ length: points }, () => ({})) })
  it('an analysis needs a non-blocked status and at least one point; a comparison at least one row', () => {
    expect(hasExportableData(null, null)).toBe(false)
    expect(hasExportableData({ status: 'OK', series: [series(0), series(2)] } as unknown as ProjectedAnalysis, null)).toBe(true)
    expect(hasExportableData({ status: 'OK', series: [series(0)] } as unknown as ProjectedAnalysis, null)).toBe(false)
    expect(hasExportableData({ status: 'BLOCKED', series: [series(3)] } as unknown as ProjectedAnalysis, null)).toBe(false)
    expect(hasExportableData(null, { status: 'OK', rows: [{}] } as unknown as ProjectedComparison)).toBe(true)
    expect(hasExportableData(null, { status: 'OK', rows: [] } as unknown as ProjectedComparison)).toBe(false)
    expect(hasExportableData(null, { status: 'BLOCKED', rows: [{}] } as unknown as ProjectedComparison)).toBe(false)
  })

  it('a non-API error is a generic static message', () => {
    expect(scadaExportErrorMessage(new Error('boom hunter2'), 'XLSX')).toBe('XLSX oluşturulurken bir sorun oluştu.')
  })
})
