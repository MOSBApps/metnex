# DEC-0009 — Shared-Schema Tenant Isolation Hardening

Status: Accepted

Date: 2026-07-28

## Context

METNEX uses a shared-schema multi-tenancy model: every tenant's rows live in the same
tables, distinguished only by a `tenantId` column. Before this decision, tenant isolation was
enforced entirely at the application layer (service-level `where: { tenantId }` predicates) and
by simple single-column foreign keys (e.g. `UserTenantRoleAssignment.roleId -> TenantRole.id`).

A single-column FK only proves the referenced row *exists* — it does not prove the referenced
row belongs to the *same tenant* as the referencing row. Two concrete gaps existed:

1. Nothing at the DB level stopped a `UserTenantRoleAssignment` row from claiming
   `tenantId = A` while its `roleId` pointed at a `TenantRole` actually owned by tenant `B`.
2. Nothing at the DB level stopped a `DemoSampleTransaction` row from claiming
   `tenantId = A` while its `definitionId` pointed at a `DemoSampleDefinition` owned by tenant `B`.

In both cases the *application* code already happened to guard against this correctly (service
methods scope their lookups by tenantId before use), so there was no known exploitable path
today — but the DB itself did not enforce it, so a future code path that skipped the
service-level check would have silently created a cross-tenant reference.

Schema-per-tenant and Postgres Row-Level Security were both considered and rejected as
disproportionate for this stage (see Alternatives Rejected) — this decision hardens the existing
shared-schema model instead.

## Decision

1. **Composite tenant FKs** for every tenant-owned child table that references another
   tenant-owned parent table:
   - `TenantRole` gets `@@unique([id, tenantId])` so it can be the target of a composite FK.
   - `UserTenantRoleAssignment.role` becomes a composite FK: `(roleId, tenantId) -> TenantRole(id, tenantId)`.
   - `DemoSampleDefinition` gets `@@unique([id, tenantId])`.
   - `DemoSampleTransaction.definition` becomes a composite FK: `(definitionId, tenantId) -> DemoSampleDefinition(id, tenantId)`.
   - Net effect: the database itself now rejects "assignment tenant A, role tenant B" and
     "transaction tenant A, definition tenant B" — verified against a real Postgres instance
     (see AI2 completion note for AIS-SEC-003; both cases raise Prisma `P2003`).

2. **Canonical tenant-owned table standard** (see `docs/domain/DB_META.md § Tenant Isolation
   Standard` for the full checklist): `tenantId NOT NULL`, FK to `tenants.id`, tenant-scoped
   unique keys as `(tenantId, businessKey)`, composite FK for any child referencing another
   tenant-owned parent, and no list/update/delete service method without a tenant predicate.

3. **Controller-level fail-fast**: tenant-scoped controllers must resolve `X-Tenant-Id` through
   a `requireTenantId()` helper (`apps/api/src/common/tenant-header.util.ts`) instead of
   `tenantId ?? ''`, so a missing header is a `400` before any service code runs, never a query
   scoped to an empty string.

## Consequences

- Positive: cross-tenant reference bugs in these two relations are now caught by the database
  even if a future application-level guard is missing or buggy — defense in depth, not a
  replacement for the service-level checks (which remain in place and are still what produces
  the user-facing `404`/`403` instead of a raw constraint-violation error).
- Positive: the pattern (`@@unique([id, tenantId])` + composite `@relation`) is now the
  documented template for hardening any future tenant-owned parent/child pair.
- Negative: every tenant-owned child table that references another tenant-owned parent now
  needs to carry `tenantId` explicitly and repeat it in the FK — slightly more verbose than a
  bare `roleId`/`definitionId` FK.
- Migration/compatibility impact: `0007_tenant_isolation_hardening` alters
  `user_tenant_role_assignments` (drops and replaces the `roleId` FK). `demo_sample_transactions`'
  composite FK for `definitionId` was folded directly into the not-yet-shipped
  `0006_package_demo_reporting_foundation` migration rather than added as a follow-up ALTER,
  since that migration had not been applied anywhere yet.

## What this does NOT guarantee

- It does not stop a bug where the application passes the *correct* tenantId for one query but
  the *wrong* tenantId came from an upstream auth bug (e.g. `X-Tenant-Id` trusted without
  membership validation) — that boundary is `PermissionGuard`/`PackageFeatureGuard`'s job, not
  the FK's.
- It does not cover every tenant-owned relation in the schema — only the two relations named in
  this decision (`UserTenantRoleAssignment.role`, `DemoSampleTransaction.definition`). Other
  tenant-owned tables (e.g. `TenantSmtpOverride`, `TenantAiProviderOverride`) do not currently
  have tenant-owned parents other than `Tenant` itself, so a bare FK to `tenants.id` is already
  sufficient for them.
- It is not Postgres Row-Level Security. A backend process connecting with the application's
  single DB role can still issue a query with no tenant predicate at all and read across
  tenants — the FK only constrains what a *write* can reference, not what a *read* can select.
  Read-path isolation is still entirely a service-code responsibility.

## Alternatives Rejected

- **Schema-per-tenant**: correct isolation model long-term, but a major operational and
  migration-tooling change; explicitly out of scope for this ticket.
- **PostgreSQL Row-Level Security**: would close the read-path gap noted above, but requires a
  session-level tenant GUC/claim wired through every DB connection and interacts with Prisma's
  connection pooling in ways this codebase has not yet designed for; deferred, not rejected
  outright — worth revisiting if a real cross-tenant read leak is ever found.
- **Application-layer-only hardening (status quo)**: rejected as insufficient — it depends on
  every future service method remembering to scope by tenantId, with no backstop.
