import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { KNOWN_TENANT_SLUGS } from '../../migration/botc-identity/tenant-mapping'

/**
 * TASK-027.58-R1 — DEC-0014 ↔ code consistency guard.
 *
 * DEC-0014 (Accepted, 2026-09-22): MOSEDAŞ is NOT a Metnex tenant; MOSB Enerji and MOSBIO are the
 * separate operating tenants under the MİP root. The Wave 1 identity migration (written earlier)
 * still models `ApprovedTenantSlug = 'MOSB' | 'MOSEDAS' | 'MOSBIO'`.
 *
 * This suite deliberately does NOT fix that code (AI1 decision, Q-SP04) and does NOT endorse it. It
 * (1) pins DEC-0014's wording so it cannot be silently edited, (2) records the exact known
 * conflicts as an explicit register so any NEW MOSEDAŞ reference in code fails loudly, and (3)
 * proves no code path creates a tenant for these slugs. When AI1 resolves Q-SP04, shrink the
 * register below in the same change.
 */
const API_ROOT = path.resolve(__dirname, '../../..')
const SRC = path.join(API_ROOT, 'src')
const REPO_ROOT = path.resolve(API_ROOT, '../..')

const read = (file: string) => readFileSync(file, 'utf8')
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** Every `apps/api/src` file (code, specs, fixtures) that mentions MOSEDAŞ in any spelling. */
const mentioning = walk(SRC)
  .filter(file => /\.(ts|json)$/.test(file) && /mosedas|mosedaş/i.test(read(file)))
  .map(rel)
  .sort()

/** Production code (non-spec, non-fixture) that mentions it — the conflicts that actually ship. */
const KNOWN_PRODUCTION_CONFLICTS = [
  'migration/botc-identity/source-validation.ts', // error text: "yalnızca MOSB/MOSEDAS/MOSBIO kabul edilir"
  'migration/botc-identity/tenant-coverage.ts', // usersByTenant record keyed by MOSEDAS
  'migration/botc-identity/tenant-mapping.ts', // KNOWN_TENANT_SLUGS
  'migration/botc-identity/types.ts', // ApprovedTenantSlug
]

/** Catalog tenant guard (TASK-027.63): names MOSEDAŞ only to REJECT mapping it as a tenant. */
const CATALOG_REJECTION_RULE = 'reporting/scada/catalog/tenant-guards.ts'

/** Slug status against DEC-0014. `MOSB` is ambiguous: DEC-0014 names the tenant "MOSB Enerji". */
const CONFORMING_SLUGS = ['MOSBIO']
const REGISTERED_CONFLICTS = ['MOSEDAS'] // DEC-0014: not a tenant
const REGISTERED_AMBIGUITIES = ['MOSB'] // DEC-0014: "MOSB Enerji" is a tenant, "MOSB" is not — mapping unresolved (Q-SP04)

describe('DEC-0014 tenant-slug consistency (TASK-027.58-R1)', () => {
  it('DEC-0014 still says what this suite assumes (decision text cannot drift silently)', () => {
    const text = read(path.join(REPO_ROOT, 'docs/decisions/DEC-0014-mosedas-production-planning-and-metnex-operations-boundary.md'))
    expect(text).toMatch(/Status:\*{0,2}\s*Accepted/)
    expect(text).toContain("Metnex'te MOSEDAŞ veya MOSB operasyon tenantı yoktur")
    expect(text).toContain('MOSB Enerji ve MOSBIO ayrı operasyon tenantlarıdır')
  })

  it('the production code that mentions MOSEDAŞ is exactly the known-conflict register (any new reference fails)', () => {
    const production = mentioning.filter(file => !file.endsWith('.spec.ts') && !file.includes('/fixtures/') && !file.startsWith('reporting/scada-contract/'))
    expect(production).toEqual([...KNOWN_PRODUCTION_CONFLICTS, CATALOG_REJECTION_RULE].sort())
  })

  it('outside the identity-migration directory only the test-only SCADA contract mentions MOSEDAŞ (as a negative check, never as a tenant)', () => {
    const outside = mentioning.filter(file => !file.startsWith('migration/botc-identity/'))
    expect(outside.every(file => file.startsWith('reporting/scada-contract/') || file === CATALOG_REJECTION_RULE || (file.startsWith('reporting/scada/') && file.endsWith('.spec.ts')))).toBe(true)
  })

  it('every slug the migration code accepts is either DEC-0014-conforming or a registered conflict/ambiguity — no new slug can appear unnoticed', () => {
    const allowed = new Set([...CONFORMING_SLUGS, ...REGISTERED_CONFLICTS, ...REGISTERED_AMBIGUITIES])
    expect(KNOWN_TENANT_SLUGS.filter(slug => !allowed.has(slug))).toEqual([])
  })

  it('no migration code creates a tenant: slugs are only looked up against tenants that must already exist', () => {
    const migrationProduction = walk(path.join(SRC, 'migration/botc-identity')).filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    expect(migrationProduction.length).toBeGreaterThan(0)
    const creators = migrationProduction.filter(file => /insert\(\s*tenants\s*\)|createTenant|provisionCustomer|TenantService/.test(read(file))).map(rel)
    expect(creators).toEqual([])
  })

  it('no SQL migration, seed or bootstrap code provisions a MOSEDAŞ tenant', () => {
    const sqlDir = path.join(API_ROOT, 'drizzle')
    const sql = walk(sqlDir).filter(file => file.endsWith('.sql'))
    expect(sql.length).toBeGreaterThan(0)
    expect(sql.filter(file => /mosedas|mosedaş/i.test(read(file)))).toEqual([])
    const bootstrap = walk(path.join(SRC, 'platform')).filter(file => !file.endsWith('.spec.ts') && /mosedas|mosedaş/i.test(read(file)))
    expect(bootstrap).toEqual([])
  })

  it('the R1 inventory document lists every apps/api/src file that mentions MOSEDAŞ (so the classification cannot go stale)', () => {
    const doc = read(path.join(REPO_ROOT, 'backlog/TASK-027-58-R1-scada-contract-closure.md'))
    const missing = mentioning.filter(file => !doc.includes(path.basename(file)))
    expect(missing).toEqual([])
  })
})
