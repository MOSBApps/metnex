import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * TASK-029.02 — this MOSEDAŞ B2B sub-domain is a PURE reference/message contract: no NestJS wiring,
 * no DB/SQL, no HTTP client to MOSEDAŞ, no secret/certificate literal, no permission code, no
 * invented numeric retry/DLQ threshold, and no Kırım Tesisi order type mixed into this message model.
 */
const DIR = path.resolve(__dirname, '..')
const files = readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
const code = (f: string) => readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

describe('static guarantees of the MOSEDAŞ B2B domain module', () => {
  it('has the expected files', () => {
    expect(files.sort()).toEqual(['audit-entry.contract.ts', 'b2b-client-identity.contract.ts', 'idempotency.contract.ts', 'inbound-message-validation.contract.ts', 'message-envelope.contract.ts', 'retry-classification.contract.ts'].sort())
  })

  it('no file imports NestJS, Drizzle, a DB client, or an HTTP/network module — no real MOSEDAŞ connection is made', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/from\s+['"]@nestjs|from\s+['"]drizzle-orm|from\s+['"](pg|mssql|tedious|http|https|net|node:http|node:net|axios|fetch)['"]|\bfetch\(/)
    }
  })

  it('no file declares a NestJS decorator or an API route', () => {
    for (const f of files) expect(code(f)).not.toMatch(/@Controller\(|@Injectable\(|@Module\(|@Get\(|@Post\(/)
  })

  it('no file stores a credential-like literal (password, connection string, bearer token, private key, certificate)', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]|Server=\w|postgres(ql)?:\/\/\w|Bearer\s+[A-Za-z0-9._-]{10,}|BEGIN (RSA )?PRIVATE KEY/i)
    }
  })

  it('no file invents a numeric retry count, backoff interval, or DLQ threshold', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/maxRetries\s*[:=]\s*\d|backoff\w*\s*[:=]\s*\d|retryAfter\w*\s*[:=]\s*\d|dlqAfter\w*\s*[:=]\s*\d|timeoutMs\s*[:=]\s*\d/i)
    }
  })

  it('no file defines a permission code (COLON-separated ALLCAPS)', () => {
    for (const f of files) expect([...code(f).matchAll(/['"`]([A-Z]+:[A-Z_]+:[A-Z_]+)['"`]/g)]).toEqual([])
  })

  it('no message type or field resembles the Kırım Tesisi (paçal) internal production order — the two bounded contexts are never merged', () => {
    for (const f of files) expect(code(f)).not.toMatch(/KIRIM|PAÇAL|PACAL|BLEND|RECIPE|REÇETE/i)
  })

  it('this module never creates a user JWT-shaped or platform-role-shaped field (isSystemAdmin, TENANT_ADMIN, userId as an identity credential)', () => {
    for (const f of files) expect(code(f)).not.toMatch(/isSystemAdmin|TENANT_ADMIN|userId:\s*string.*identity/i)
  })

  it('MOSEDAS appears as a literal string value only where the identity/message contract legitimately names it as the external system', () => {
    const literalMosedas = /['"`][^\n'"`]*mosedas[^\n'"`]*['"`]/i
    const mentioning = files.filter(f => literalMosedas.test(code(f)))
    expect(mentioning.sort()).toEqual(['b2b-client-identity.contract.ts', 'message-envelope.contract.ts'].sort())
  })
})
