/**
 * Domain-agnostic row shape reporting core (HTML preview + PDF/XLSX export)
 * renders. Providers translate their own domain entities into this shape so
 * reporting core never depends on a specific module's entity fields.
 */
export interface ReportDatasetRow {
  no: string
  label: string
  occurredAt: string | Date
  status: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface ReportDataset {
  rows: ReportDatasetRow[]
  totalAmount: number
}

/**
 * Dataset provider contract for a report artifact. A provider must not reach
 * into another module's tables directly — it must go through that module's
 * own service layer, and must always be called with an explicit tenantId.
 */
export interface ReportDatasetProvider<TFilters = unknown> {
  supports(artifactCode: string): boolean
  loadDataset(tenantId: string, filters: TFilters): Promise<ReportDataset>
}

export const REPORT_DATASET_PROVIDERS = 'REPORT_DATASET_PROVIDERS'
