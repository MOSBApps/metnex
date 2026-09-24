import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

const TEMPLATES_DIR = resolve(__dirname)
const MAX_TEMPLATE_BYTES = 256 * 1024

const TEMPLATE_ID_PATTERN = /^[a-z0-9-]{1,64}$/

const FORBIDDEN_JRXML_TOKENS = [
  'Runtime.getRuntime',
  'java.io.File',
  'java.sql',
  'jdbc:',
  '<queryString',
  'System.exit',
  'ProcessBuilder',
  'java.net.',
  'URLConnection',
  'HttpURLConnection',
]

/**
 * Allowlist of renderer templates: templateId -> file name inside this directory only.
 *
 * This must stay in sync with the renderer's OWN allowlist
 * (services/jasper-renderer/.../template/TemplateRegistry.java TEMPLATE_ALLOWLIST) — the same
 * templateId key, resolvable on both sides — since the API only validates/gatekeeps here (the
 * literal file content is never forwarded to the renderer), while the renderer is the one that
 * actually compiles and fills the template. `sample-report` is the one demonstration entry both
 * sides ship (TASK-022.5-R1); a future domain module adds its own entry to both allowlists
 * instead of letting a free-text DB column (report_artifacts.templatePath) name an arbitrary
 * filesystem path that would otherwise leak to an external renderer process.
 */
const TEMPLATE_ALLOWLIST: Record<string, string> = {
  'sample-report': 'sample-report.jrxml',
  'scada-analysis-report': 'scada-analysis-report.jrxml',
}

export interface ResolvedTemplate {
  id: string
  content: string
}

/**
 * Throws when jrxml content contains a token that would let a template escape the reporting
 * sandbox (shell exec, filesystem, JDBC/SQL, outbound network). Exported standalone so it can be
 * exercised directly in tests without needing a real allowlisted file on disk.
 */
export function assertJrxmlSandboxSafe(content: string): void {
  if (Buffer.byteLength(content, 'utf8') > MAX_TEMPLATE_BYTES) {
    throw new BadRequestException(`Template boyutu izin verilen sınırı (${MAX_TEMPLATE_BYTES} byte) aşıyor`)
  }
  const hit = FORBIDDEN_JRXML_TOKENS.find(token => content.includes(token))
  if (hit) {
    throw new BadRequestException(`JRXML sandbox violation: ${hit}`)
  }
}

/**
 * Resolves a caller-supplied template id to sandbox-checked content. Never accepts a filesystem
 * path — only a safe slug checked against TEMPLATE_ID_PATTERN and then looked up in the
 * allowlist above. This is the only way reporting core reads a template file.
 */
@Injectable()
export class TemplateRegistryService {
  has(templateId: string): boolean {
    return TEMPLATE_ID_PATTERN.test(templateId) && templateId in TEMPLATE_ALLOWLIST
  }

  resolve(templateId: string): ResolvedTemplate {
    if (!TEMPLATE_ID_PATTERN.test(templateId)) {
      throw new BadRequestException('Geçersiz template id')
    }

    const fileName = TEMPLATE_ALLOWLIST[templateId]
    if (!fileName) {
      throw new NotFoundException(`Template allowlist'te bulunamadı: ${templateId}`)
    }

    const filePath = resolve(TEMPLATES_DIR, fileName)
    if (filePath !== TEMPLATES_DIR && !filePath.startsWith(`${TEMPLATES_DIR}/`)) {
      // Defense in depth: even a misconfigured allowlist entry can't escape this directory.
      throw new BadRequestException('Template dizininin dışına çıkılamaz')
    }

    const content = readFileSync(filePath, 'utf8')
    assertJrxmlSandboxSafe(content)

    return { id: templateId, content }
  }
}
