import { NotFoundException } from '@nestjs/common'
import type { ReportDataset, ReportDatasetProvider } from './report-dataset.contract'
import { ReportDatasetResolver } from './report-dataset.resolver'

function fakeProvider(code: string): ReportDatasetProvider {
  return {
    supports: (artifactCode: string) => artifactCode === code,
    loadDataset: jest.fn().mockResolvedValue({ rows: [], totalAmount: 0 } satisfies ReportDataset),
  }
}

describe('ReportDatasetResolver', () => {
  it('resolves the provider whose supports() matches the artifact code', () => {
    const sampleProvider = fakeProvider('SAMPLE_REPORT')
    const otherProvider = fakeProvider('OTHER_REPORT')
    const resolver = new ReportDatasetResolver([sampleProvider, otherProvider])

    expect(resolver.resolve('OTHER_REPORT')).toBe(otherProvider)
    expect(resolver.resolve('SAMPLE_REPORT')).toBe(sampleProvider)
  })

  it('throws a controlled NotFoundException when no provider supports the artifact code', () => {
    const resolver = new ReportDatasetResolver([fakeProvider('SAMPLE_REPORT')])

    expect(() => resolver.resolve('UNKNOWN_ARTIFACT')).toThrow(NotFoundException)
  })
})
