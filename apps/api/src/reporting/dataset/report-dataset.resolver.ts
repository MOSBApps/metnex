import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { REPORT_DATASET_PROVIDERS, type ReportDatasetProvider } from './report-dataset.contract'

/**
 * Resolves a ReportDatasetProvider by artifact code. Reporting core depends
 * only on this resolver — never on a specific provider or domain module.
 */
@Injectable()
export class ReportDatasetResolver {
  constructor(
    @Inject(REPORT_DATASET_PROVIDERS) private readonly providers: ReportDatasetProvider[],
  ) {}

  resolve(artifactCode: string): ReportDatasetProvider {
    const provider = this.providers.find(candidate => candidate.supports(artifactCode))
    if (!provider) {
      throw new NotFoundException(`Bu artifact için dataset provider bulunamadı: ${artifactCode}`)
    }
    return provider
  }
}
