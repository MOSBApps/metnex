import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * TASK-029.01 — this domain is a PURE reference/domain contract: no NestJS wiring, no DB/SQL, no
 * secret literal, no permission code, no migration, no tenant/role creation. These static checks are
 * the guardrail that keeps a later task from silently turning this into an API/DB module without a
 * deliberate decision.
 */
const DIR = path.resolve(__dirname, '..')
const files = readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
const code = (f: string) => readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

describe('static guarantees of the operations domain module', () => {
  it('has the expected files (fails loudly if a new file is added without updating this guard)', () => {
    expect(files.sort()).toEqual(
      [
        'external-reference.contract.ts',
        'facility-machine.contract.ts',
        'operation-center.contract.ts',
        'ownership-operator.contract.ts',
        'reference-validity.contract.ts',
        'tenant-identity.ts',
        'tenant-operation-scope.contract.ts',
      ].sort(),
    )
  })

  it('no file imports NestJS, Drizzle, a DB client, or any HTTP/network module — this is a pure domain layer', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/from\s+['"]@nestjs|from\s+['"]drizzle-orm|from\s+['"](pg|mssql|tedious|http|https|net|node:http|node:net)['"]/)
    }
  })

  it('no file declares a NestJS decorator (@Controller/@Injectable/@Module) — no API endpoint or module wiring exists yet', () => {
    for (const f of files) expect(code(f)).not.toMatch(/@Controller\(|@Injectable\(|@Module\(|@Get\(|@Post\(/)
  })

  it('no file executes raw SQL, opens a driver/socket/file, or references a schema/table/database name', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/\.execute\(|\bsql`|information_schema|pgTable\(|CREATE TABLE|INSERT INTO|SELECT\s+\*\s+FROM/i)
    }
  })

  it('no file defines a permission code (COLON-separated ALLCAPS) or a new audit action name literal', () => {
    for (const f of files) {
      const c = code(f)
      const permissionShaped = [...c.matchAll(/['"`]([A-Z]+:[A-Z_]+:[A-Z_]+)['"`]/g)]
      expect(permissionShaped).toEqual([])
    }
  })

  it('no file stores a credential-like literal (password, connection string, bearer token, API key)', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]|Server=\w|postgres(ql)?:\/\/\w|Bearer\s+[A-Za-z0-9._-]{10,}/i)
    }
  })

  it('no file constructs or persists a new tenant, role, or permission catalogue entry', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/createTenant|new\s+Tenant\b|permission-catalogue|RequirePermission\(|INSERT INTO\s+tenants/i)
    }
  })

  it('MOSEDAŞ appears as a literal string value only in the rejection rule (tenant-identity.ts) and the external-system name list (external-reference.contract.ts) — never elsewhere; using the shared guard FUNCTION by name in other files is fine and expected', () => {
    const literalMosedas = /['"`][^\n'"`]*mosedas[^\n'"`]*['"`]/i
    const mentioning = files.filter(f => literalMosedas.test(code(f)))
    expect(mentioning.sort()).toEqual(['external-reference.contract.ts', 'tenant-identity.ts'].sort())
  })

  it('the operation-center owner-role table is fixed and never derived from a tenant slug/name inside this module', () => {
    const c = code('operation-center.contract.ts')
    expect(c).not.toMatch(/\.slug\b.*(mosb|kirim|komur)/i)
    expect(c).toMatch(/OPERATION_CENTER_OWNER_ROLE/)
  })
})
