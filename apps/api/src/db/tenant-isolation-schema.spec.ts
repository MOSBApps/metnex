import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static schema-source check (AIS-SEC-003 / DEC-0009): every tenant-scoped table whose row
 * references another tenant-scoped table's row must do so through a composite
 * (childId, tenantId) -> (parentId, parentTenantId) foreign key, not a plain id FK. A plain id
 * FK lets a row point at a same-shaped row owned by a *different* tenant; the DB itself must
 * reject that, not just the application layer. This was previously verified by grepping
 * schema.prisma text; DEC-0011 moved schema definition to Drizzle, so the same invariant is now
 * checked against the Drizzle schema source files.
 */
function readSchemaSource(fileName: string) {
  return readFileSync(join(__dirname, 'schema', fileName), 'utf8')
}

describe('tenant isolation — composite FK invariants in Drizzle schema', () => {
  it('user_tenant_role_assignments.roleId is FK-bound together with tenantId to tenant_roles(id, tenantId)', () => {
    const source = readSchemaSource('platform.ts')
    expect(source).toMatch(
      /foreignKey\(\{\s*columns:\s*\[t\.roleId,\s*t\.tenantId\],\s*foreignColumns:\s*\[tenantRoles\.id,\s*tenantRoles\.tenantId\]/,
    )
  })

  it('the composite FK targets are backed by a real unique constraint, not a plain index', () => {
    // drizzle-kit orders CREATE UNIQUE CONSTRAINT before dependent ALTER TABLE ... ADD FOREIGN KEY
    // statements, but only for unique() — a uniqueIndex() target breaks fresh-DB migration order.
    const platform = readSchemaSource('platform.ts')
    expect(platform).toMatch(/unique\(['"]tenant_roles_id_tenantId_key['"]\)\.on\(t\.id,\s*t\.tenantId\)/)
  })
})
