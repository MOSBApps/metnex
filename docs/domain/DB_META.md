# metnex — Database Metadata

> Live database source of truth for the currently implemented SaaS foundation.
> Last updated: `2026-04-22`

---

## Status

- Project Name: `metnex`
- Project Slug: `metnex`
- Owner: `Repository Maintainer`
- Environment Model: `dev / test / prod`
- Primary schema: `public`
- ORM / migration tool: `Prisma`
- Current migration chain:
  - `0001_platform_foundation`
  - `0002_platform_tenant_settings_foundation`
  - `0003_saas_foundation`
  - `0004_saas_repair_existing_databases`
  - `0005_platform_operations_foundation`
  - `0006_package_demo_reporting_foundation`
  - `0007_tenant_isolation_hardening`
  - `0008_customer_root_schema_isolation_foundation`

---

## Locale & Collation

> **Project decision:** [DEC-0007](../decisions/DEC-0007-metnex-db-locale-and-collation.md)
>
> **Policy baseline:** [DEC-0006](../decisions/DEC-0006-database-locale-and-collation-must-be-decided-at-project-init.md)
>
> **Runbooks:** [db-collation-strategy.md](../runbooks/db-collation-strategy.md), [db-recreate-with-icu.md](../runbooks/db-recreate-with-icu.md)

### Target Architecture

| Field | Value |
| --- | --- |
| Primary product language | `Turkish (tr-TR)` |
| DB datlocprovider | `icu` |
| DB daticulocale | `tr-TR` |
| DB encoding | `UTF8` |
| Query collation | `tr-x-icu` for user-visible free-text ordering when query-level collation is needed |
| App-layer sort locale | `localeCompare('tr')` or `localeCompare('tr-TR')` |
| UNIQUE/index collation exceptions | `email`, `slug`, token/hash fields remain locale-neutral and uniqueness-driven |
| Environment parity | `dev/test/prod` must all use PostgreSQL 16 with ICU support |
| Compose guardrail | `POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=tr-TR --encoding=UTF8"` |

### Local Enforcement Today

| Surface | Current enforcement |
|---|---|
| Local Docker database | `infra/docker/docker-compose.dev.yml` sets `POSTGRES_INITDB_ARGS` to ICU Turkish |
| Local app bootstrap | `dev.sh` starts the infra stack and applies migrations after env generation |
| App-layer sort | Web tables currently use `localeCompare('tr', { sensitivity: 'base' })` where client-side sorting is implemented |

### Canonical DB Create Syntax

```sql
CREATE DATABASE metnex
    LOCALE_PROVIDER = icu
    ICU_LOCALE      = 'tr-TR'
    ENCODING        = 'UTF8'
    TEMPLATE        = template0;
```

---

## Enum Inventory

| Enum | Values | Used By |
|---|---|---|
| `TenantStatus` | `ACTIVE`, `SUSPENDED`, `ARCHIVED` | `tenants.status` |
| `TenantType` | `PLATFORM_ROOT`, `ROOT`, `STANDARD` | `tenants.type` |
| `UserStatus` | `ACTIVE`, `INACTIVE`, `LOCKED` | `users.status` |
| `SubscriptionStatus` | `TRIAL`, `ACTIVE`, `SUSPENDED`, `CANCELLED`, `EXPIRED` | `customer_subscriptions.status` |

---

## Table Inventory

### Identity, Auth, and Authorization

| Table | Purpose | Important Columns / Constraints |
|---|---|---|
| `users` | Canonical human identity | `email` unique, immutable login id in current UI |
| `auth_sessions` | Refresh token persistence | `refreshTokenHash` unique, revocation flag, expiry timestamp |
| `system_roles` | Platform/system roles | `name` unique |
| `permissions` | Permission catalogue | `code` unique |
| `role_permissions` | System role to permission join | composite PK `(roleId, permissionId)` |
| `user_system_role_assignments` | User-to-system-role assignment | unique `(userId, roleId, tenantId)`; `tenantId` nullable |
| `system_bootstrap` | Singleton bootstrap marker | `singletonKey` unique default `1` |

### Tenant Tree and Tenant-Local Authorization

| Table | Purpose | Important Columns / Constraints |
|---|---|---|
| `tenants` | Platform root, customer roots, and child tenants | `slug` unique; `parentId`; `customerRootId`; `canEnterData`/`canAggregateChildren` flags (AIS-EPC-004); indexes on `status`, `type`, `parentId`, `customerRootId` |
| `tenant_memberships` | Membership boundary | unique `(tenantId, userId)` |
| `tenant_roles` | Tenant-local roles | unique `(tenantId, name)`; unique `(id, tenantId)` — composite FK target |
| `tenant_role_permissions` | Tenant-role permission codes | composite PK `(roleId, permissionCode)` |
| `user_tenant_role_assignments` | User-to-tenant-role assignment | unique `(userId, roleId)`; composite FK `(roleId, tenantId) -> tenant_roles(id, tenantId)` |
| `tenant_closure` | Ancestor/descendant closure for the tenant tree (AIS-EPC-004) | composite PK `(ancestorTenantId, descendantTenantId)`; `depth`; `customerRootTenantId` nullable (null only for `PLATFORM_ROOT`'s self-row) |
| `customer_schema_registry` | One data-plane schema per customer root (AIS-EPC-004) | `customerRootTenantId` unique; `schemaName` unique; `status` enum (`PROVISIONING`, `ACTIVE`, `FAILED`, `ARCHIVED`) |

### SaaS and Quota Foundation

| Table | Purpose | Important Columns / Constraints |
|---|---|---|
| `resource_packages` | Customer package catalogue | `code` unique; quota fields are integers |
| `customer_subscriptions` | Package assigned to one customer root | `customerRootTenantId` unique; FK to `resource_packages` |
| `package_features` | Module/capability entitlement catalogue | `code` unique; `moduleKey`; `isActive` |
| `tenant_package_assignments` | Tenant-to-feature availability assignment | unique `(tenantId, packageFeatureId)`; active/revoked lifecycle fields |

### Platform Operations

| Table | Purpose | Important Columns / Constraints |
|---|---|---|
| `platform_audit_logs` | Immutable platform audit trail | indexed by `actionCode`, `actorId`, `entityType/entityId`, `createdAt` |
| `platform_performance_settings` | Singleton runtime diagnostics config | unique `singletonKey`; stores global slow-request threshold and DB trace toggle |
| `performance_request_logs` | Persisted slow request / 5xx log rows | indexed by `createdAt`, `route`, `tenantId`; optional FK to `users` and `tenants` |
| `performance_request_query_logs` | Child query traces under one slow request | FK `requestLogId`; query text is scrubbed/truncated before write |

### Settings

| Table | Purpose | Important Columns / Constraints |
|---|---|---|
| `platform_general_settings` | Platform identity metadata | singleton-by-convention via single-row usage |
| `platform_smtp_settings` | Platform default SMTP config | encrypted password stored as ciphertext |
| `platform_ai_provider_settings` | Platform default AI provider config | encrypted API key stored as ciphertext |
| `tenant_smtp_overrides` | Tenant SMTP override | PK `tenantId`; falls back to platform default when absent |
| `tenant_ai_provider_overrides` | Tenant AI provider override | PK `tenantId`; falls back to platform default when absent |
| `report_artifacts` | Reporting artifact catalogue | `code` unique; view/output/print metadata; optional FK to `package_features`; **no rows are seeded by default** (Demo Operations sample artifact removed, DEC-0012) |

---

## Critical Relationships and Constraints

1. `tenants.parentId -> tenants.id`
   - immediate tree relationship
   - `PLATFORM_ROOT` is top node for customer root provisioning

2. `tenants.customerRootId -> tenants.id`
   - customer subtree owner relationship
   - customer `ROOT` tenant points to itself
   - every `STANDARD` tenant points to its owning `ROOT`

3. `tenant_memberships.tenantId -> tenants.id`
   - membership boundary is explicit and separate from permission grants

4. `user_system_role_assignments.tenantId -> tenants.id`
   - nullable to support global/system assignment
   - used for scoped `TENANT_ADMIN` assignment on one customer root

5. `customer_subscriptions.customerRootTenantId -> tenants.id`
   - one subscription row per customer root
   - current design assumes one commercial subscription row per customer root

6. `tenant_*_overrides.tenantId -> tenants.id`
   - optional one-to-one override tables for tenant service settings

7. `tenant_package_assignments.tenantId -> tenants.id`
   - capability availability is tenant/root scoped and separate from permissions

8. `user_tenant_role_assignments.(roleId, tenantId) -> tenant_roles.(id, tenantId)`
   - composite FK (AIS-SEC-003 / DEC-0009) — an assignment cannot reference a role owned by a
     different tenant, not just an existing role id

---

## Tenant Isolation Standard (Shared-Schema)

> Decision record: [DEC-0009](../decisions/DEC-0009-shared-schema-tenant-isolation-hardening.md)
> Security contract: [APPLICATION_SECURITY_ARCHITECTURE.md § 12](../security/APPLICATION_SECURITY_ARCHITECTURE.md)

METNEX stays on the shared-schema multi-tenancy model (no schema-per-tenant, no Postgres
RLS). Every tenant-owned domain table added from here on must follow this checklist:

1. `tenantId` is `NOT NULL` with a plain FK to `tenants.id`.
2. Tenant-scoped business-key uniqueness is `@@unique([tenantId, businessKey])`, never a bare
   `businessKey` unique.
3. If the table has a child that references it (another tenant-owned table, not `Tenant`
   itself), this table also needs `@@unique([id, tenantId])` so the child can carry a
   **composite FK**: `(childFk, tenantId) -> ThisTable(id, tenantId)`. A bare `childFk -> id` FK
   only proves the parent row exists somewhere — not that it belongs to the same tenant as the
   child row.
4. List/update/delete service methods must always filter by `tenantId` — `findFirst({ id,
   tenantId })` before mutating, never `findUnique({ id })` plus a separate ownership check.
5. Tenant-owned list-query indexes should lead with `tenantId` (e.g. `@@index([tenantId,
   status])`), matching the shape of the actual `where` clause. Don't add a bare
   `@@index([tenantId])` speculatively if no query ever lists by tenant alone — match the index
   to the real access pattern instead of a mechanical rule.

Applied so far (AIS-SEC-003):

| Parent (tenant-owned) | Child (tenant-owned) | Composite FK |
|---|---|---|
| `tenant_roles` | `user_tenant_role_assignments` | `(roleId, tenantId) -> tenant_roles(id, tenantId)` |

A tenant-owned table that references another tenant-owned table (not shown above since
Demo Operations, the previous second example of this pattern, was removed — DEC-0012) must still
follow this composite-FK pattern; `demo_sample_transactions -> demo_sample_definitions` was the
worked example before removal.

Tables that only ever reference `Tenant` directly (`tenant_smtp_overrides`,
`tenant_ai_provider_overrides`, `tenant_package_assignments`, etc.) don't need this pattern — a
plain `tenantId -> tenants.id` FK is already sufficient for them. The composite pattern is only
needed when a tenant-owned table references *another* tenant-owned table.

**What this guarantees:** the DB physically rejects a write where a tenant-owned child claims
one tenant while its tenant-owned parent reference belongs to another.

**What this does NOT guarantee:** it does not validate that the tenantId on the child row is the
*correct* one for the acting user (that's `PermissionGuard`/session-scope's job), and it does not
constrain reads — a query that omits a tenant predicate can still select across tenants. See
DEC-0009 for the full list of what's out of scope.

---

## Customer-Root Schema Isolation and Hierarchical Tenant Scope

> Decision record: [DEC-0010](../decisions/DEC-0010-customer-root-schema-isolation-and-hierarchical-scope.md)
> This is the target isolation profile. The shared-schema standard above remains the baseline
> inside one customer root's data — this section is additive, not a replacement.

**Status: Phase 1-4 foundation only.** `tenant_closure` and `customer_schema_registry` exist and
are populated; no domain module's tables have moved out of `public` into the data-plane schema yet
(Phase 5). Demo Operations, the module that previously exercised this migration path locally, was
removed (DEC-0012); a future domain module is the next candidate for Phase 5.

> **Pending data-plane candidate (TASK-027.25, decision package only — nothing implemented):** the Vardiya
> `shift_reports` table is the first proposed data-plane consumer. Placement (`public` vs data-plane), the
> `tenantId NOT NULL` vs nullable conflict with the standard below, mapping and staging persistence are **open
> decisions** — see `docs/migration/METNEX_SHIFT_REPORT_POSTGRES_SCHEMA_DECISION_PACKAGE.md`.
> Data-plane foundation prerequisites (no `pgSchema()`, no fan-out runner, no registry↔physical-schema check exist
> today; TASK-027.26, decision packages only): `docs/migration/METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md`,
> `METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`, `METNEX_DATA_PLANE_READINESS_BLOCKER.md`.
> Decision-gate closure package and registry hardening plan (TASK-027.27, AI1/PO decisions pending; existing
> registry behavior unchanged): `METNEX_DATA_PLANE_DECISION_GATE_CLOSURE_PACKAGE.md`,
> `METNEX_DATA_PLANE_REGISTRY_HARDENING_PLAN.md`.

### Tenant hierarchy

- `tenants.canEnterData` / `tenants.canAggregateChildren` classify every node: `PLATFORM_ROOT`
  is `false`/`false` (no data-plane scope ever); `ROOT` is `true`/`true`; a `STANDARD` reporting
  node is `false`/`true`; a `STANDARD` operating node is `true`/`false` (schema default).
- `tenant_closure` gives O(1) indexed descendant lookups (`WHERE ancestorTenantId = X`) and
  ancestor lookups (`WHERE descendantTenantId = X ORDER BY depth`) without a recursive query at
  read time. Every tenant gets a self-row (`depth = 0`) at creation; descendant rows are copied
  forward from the parent's own closure rows in the same transaction as tenant creation.
- `customerRootTenantId` on `tenant_closure` is **nullable** — the only null row is
  `PLATFORM_ROOT`'s own self-row, which has no customer root to point at. See DEC-0010 §6 for
  why this is a deliberate deviation from a "required, non-null" reading of the field.
- Moving a tenant to a different parent after creation is not implemented and not supported in
  this phase — there is no API for it, and none should be added without also rebuilding every
  affected closure row.

### Schema registry

- `customer_schema_registry`: one row per customer root (`ROOT` tenant), never for
  `PLATFORM_ROOT`. `schemaName` is generated (`cust_<slug>_<id fingerprint>`), never accepted
  raw from user input — see `apps/api/src/tenant-scope/schema-name.util.ts`.
- `status` lifecycle: `PROVISIONING` → `ACTIVE`, or `PROVISIONING`/`ACTIVE` → `FAILED` (with
  `lastError` set) on a failed `CREATE SCHEMA`/migration step. Provisioning is idempotent —
  re-running it against an `ACTIVE` row is a no-op, against a `FAILED` row retries.
- Tenant-row creation and schema provisioning are two separate steps (not one transaction) — a
  customer root always exists as a normal tenant even if its schema provisioning has failed or
  not run yet; the data-plane resolver is what enforces "no `ACTIVE` schema, no data-plane
  access," not the tenant row itself.

### Data-plane resolver

`TenantScopeService` (`apps/api/src/tenant-scope/tenant-scope.service.ts`) resolves, given an
already-authorized `tenantId`: the customer root, its schema name, the set of tenant ids in data
scope (self, or self+descendants if `canAggregateChildren`), and the two capability flags. It
fails closed for `PLATFORM_ROOT`, unknown/inactive tenants, and customer roots without an
`ACTIVE` registry row.

### Known gap (Phase 1-4)

Tenants created **before** migration `0008` do not get backfilled `tenant_closure` rows in this
phase — there is no deployed production data yet, so this gap is accepted rather than backfilled.
A project that later has real pre-existing tenant data would need a one-time backfill migration
before relying on `tenant_closure` for those rows.

---

## Migration Register

| Migration | Purpose |
|---|---|
| `0001_platform_foundation` | Base platform schema: users, tenants, system roles, permissions, sessions, bootstrap |
| `0002_platform_tenant_settings_foundation` | Tenant type/customer tree support and settings tables |
| `0003_saas_foundation` | Resource packages, subscriptions, SaaS/customer-root model expansion |
| `0004_saas_repair_existing_databases` | Forward-repair migration for local databases created before `customerRootId` and SaaS tables existed |
| `0005_platform_operations_foundation` | Platform audit logs, performance settings, slow-request log tables |
| `0006_package_demo_reporting_foundation` | Package feature assignments, Demo Operations sample tables (**since dropped**, see below), report artifact catalogue |
| `0007_tenant_isolation_hardening` | Composite tenant FK: `user_tenant_role_assignments.roleId` now targets `tenant_roles(id, tenantId)` instead of a bare `id` |
| `0008_customer_root_schema_isolation_foundation` | `tenants.canEnterData`/`canAggregateChildren`; new `tenant_closure` and `customer_schema_registry` public tables (foundation for DEC-0010, no data-plane tables moved yet) |

> **Note:** the register above predates the ORM/migration-tool switch to Drizzle (DEC-0011); the
> repository's actual migration files live in `apps/api/drizzle/migrations/` (`0000_initial_baseline`,
> `0001_elite_boomerang`, ...) and do not share numbering with this historical list. The Demo
> Operations removal migration is the real, current one: `apps/api/drizzle/migrations/0002_thick_earthquake.sql`
> drops `demo_sample_definitions`/`demo_sample_transactions` and deletes the `DEMO_SAMPLE_TRANSACTIONS`
> `report_artifacts` row and the `AIS_DEMO_PACKAGE` `resource_packages` row (skipped if a live
> subscription still references it) — see DEC-0012.
>
> `apps/api/drizzle/migrations/0004_tenant_role_admin_flag.sql` (TASK-027.49) adds
> `tenant_roles.isAdminRole boolean not null default false` — marks a custom tenant role as that
> tenant's "administrator" role for the last-tenant-admin floor invariant (the last ACTIVE
> assignment of an `isAdminRole`-flagged role in a tenant cannot be revoked). Generated with
> `drizzle-kit generate` from the schema snapshot diff, not run against a live database.

---

## Seed / Reference Data Policy

- Built-in platform permissions and roles are seeded at runtime by `BootstrapService`, not by static SQL seed files.
- The env-gated demo tenant/data seed (`AIS_ENABLE_DEMO_SEED`) and everything it created (Demo Tenant, `AIS_DEMO_PACKAGE`, sample definitions/transactions, demo report artifact) was removed with Demo Operations (DEC-0012). No package/report-artifact seed data is created by default anymore.
- Initial system admin and initial `PLATFORM_ROOT` tenant are created either:
  - interactively through `/api/v1/platform/bootstrap`, or
  - automatically from environment variables on module init.
- Current local bootstrap defaults are written by `dev.sh` into `apps/api/.env`.

---

## Operational Checks

### Verify locale / collation

```bash
./scripts/db/verify-db-locale.sh
```

### Verify tenant tree schema

```sql
\d tenants
```

Expected notable columns:
- `type`
- `status`
- `parentId`
- `customerRootId`

### Verify bootstrap artifacts

```sql
SELECT email, "isSystemAdmin", status FROM users ORDER BY "createdAt";
SELECT name, slug, type, "parentId", "customerRootId" FROM tenants ORDER BY "createdAt";
SELECT "singletonKey", "completedAt" FROM system_bootstrap;
```

---

## Security and Retention Notes

- Passwords are never stored in cleartext; `users.passwordHash` stores hashed passwords only.
- Refresh tokens are persisted only as hashed values in `auth_sessions.refreshTokenHash`.
- SMTP and AI provider secrets are stored encrypted as ciphertext in settings tables.
- Browser clients should never receive internal object storage URLs; file-delivery rule remains defined by the application security contract even though file serving is not yet implemented in this repo.

---

## Known Limitations / Follow-up

- `platform_general_settings`, `platform_smtp_settings`, and `platform_ai_provider_settings` are singleton-by-convention tables without a DB-level singleton constraint.
- Storage quota usage is measured at runtime by scanning inferred customer-root object prefixes in the configured MinIO/S3 bucket. Because the repository does not yet define these prefixes as an authoritative write contract, API responses return `APPROXIMATE` on successful scans and `UNSUPPORTED` when storage connectivity is missing.
- Database quota usage returns `APPROXIMATE` runtime snapshots via `pg_database_size(current_database())` because the current shared-schema layout cannot provide reliable customer-root physical size attribution.
- `platform_audit_logs` is immutable by contract at the application layer; no update/delete surface is exposed.
- `performance_request_logs` persists only threshold breaches and 5xx responses. It is not a full request ledger.
- Query traces are stored only when platform-global `dbTraceEnabled` is true; otherwise `queryCount = null` means trace was not active for that request.
- Governance docs now match the current schema, but some UI and permission implementation details still require a future cleanup pass.
- AIS-EPC-004 (DEC-0010) Phase 1-4 is foundation only: `tenant_closure` and `customer_schema_registry` exist and are populated by real tenant-creation code paths, but no domain module's data lives in a per-customer-root schema yet, and no customer-admin UI exists yet to set `canEnterData`/`canAggregateChildren` on a child tenant at creation time (backend accepts optional overrides). Phase 5-9 (data-plane move, settings inheritance, reporting adaptation) are pending review before implementation.
