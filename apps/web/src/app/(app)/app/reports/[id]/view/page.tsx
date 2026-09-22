import { ReportViewerClient } from './report-viewer-client'

export default async function ReportViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ReportViewerClient artifactId={id} />
}
