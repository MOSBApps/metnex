import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const IGNORED_DIR_NAMES = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectSourceFiles(fullPath, files)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('renderer internal network boundary', () => {
  it('the browser bundle (apps/web) never references the internal renderer endpoint or a raw renderer hostname', () => {
    const webSrcDir = join(__dirname, '../../../web/src')
    const files = collectSourceFiles(webSrcDir)

    const offenders = files.filter(file => {
      const content = readFileSync(file, 'utf8')
      return /REPORT_RENDER_ENDPOINT|REPORT_RENDER_INTERNAL_TOKEN|report-renderer/i.test(content)
    })

    expect(offenders).toEqual([])
  })

  it('ReportRenderService is the only place that reads REPORT_RENDER_ENDPOINT in the API source', () => {
    const apiReportingDir = join(__dirname)
    const files = collectSourceFiles(apiReportingDir).filter(file => !file.endsWith('.spec.ts'))

    const offenders = files.filter(file => {
      if (file.endsWith(join('reporting', 'report-render.service.ts'))) return false
      const content = readFileSync(file, 'utf8')
      return content.includes('REPORT_RENDER_ENDPOINT') || content.includes('REPORT_RENDER_INTERNAL_TOKEN')
    })

    expect(offenders).toEqual([])
  })
})
