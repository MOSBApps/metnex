import { describe, expect, it } from 'vitest'
import { ReportAnalysisClient } from './report-analysis-client'
import ReportAnalysisPage from './page'

/**
 * TASK-027.54-R2 — regression guard: adding the `/app/reports` list entry point must not touch
 * or break the existing TASK-027.54 analysis route. `page.tsx` is an async server component (its
 * whole body is just resolving the route param and delegating to the client component), so this
 * awaits it directly rather than rendering it through RTL.
 */
describe('ReportAnalysisPage — TASK-027.54 route not broken by R2', () => {
  it('resolves the artifactId param and renders ReportAnalysisClient with it', async () => {
    const element = await ReportAnalysisPage({ params: Promise.resolve({ id: 'A1' }) })
    expect(element.type).toBe(ReportAnalysisClient)
    expect(element.props).toEqual({ artifactId: 'A1' })
  })
})
