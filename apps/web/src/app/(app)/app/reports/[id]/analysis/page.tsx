import { ReportAnalysisClient } from './report-analysis-client'

export default async function ReportAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ReportAnalysisClient artifactId={id} />
}
