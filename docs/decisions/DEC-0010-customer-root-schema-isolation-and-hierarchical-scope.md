# DEC-0010 — Customer-Root Schema Isolation and Hierarchical Tenant Scope

Status: Accepted (Phase 1-4 only — Phase 5-9 pending review before implementation)

Date: 2026-07-28

## Context

AIS-SEC-003 hardened the shared-schema model (`public` schema, every table carries `tenantId`,
composite FKs prevent cross-tenant parent/child references). That hardening is real and stays —
but it is a **baseline**, not the target isolation profile for a multi-customer SaaS skeleton.

Two structural gaps remain that composite FKs cannot close:

1. **Cross-customer read isolation.** A single shared schema means any query that forgets a
   `tenantId` predicate can read across *every* customer, not just across sibling tenants inside
   one customer. AIS-SEC-003's FKs only constrain what a *write* can reference — they do not
   constrain what a *read* can select.
2. **Flat tenant tree.** The current model has `PLATFORM_ROOT -> ROOT -> STANDARD`, with all
   `STANDARD` tenants effectively siblings under one customer root. There is no way to express
   "Region contains Operating Units" and have reporting/list scope resolve down that tree, or
   settings resolve up it.

This decision defines the target architecture that closes both gaps, and sequences the work so
the riskiest part — the data model itself — is reviewed before any runtime behavior changes.

## Decision

### 1. Public/control-plane table inventory (stays in `public`, unchanged ownership)

Auth, identity, tenant tree, permissions, memberships, packages, settings, subscriptions,
audit/performance — everything that is *about* tenants and users, not *belonging to* one
tenant's business data:

`users`, `auth_sessions`, `system_roles`, `permissions`, `role_permissions`,
`user_system_role_assignments`, `system_bootstrap`, `tenants`, `tenant_memberships`,
`tenant_roles`, `tenant_role_permissions`, `user_tenant_role_assignments`,
`platform_general_settings`, `platform_smtp_settings`, `platform_ai_provider_settings`,
`tenant_smtp_overrides`, `tenant_ai_provider_overrides`, `resource_packages`,
`customer_subscriptions`, `package_features`, `tenant_package_assignments`,
`platform_audit_logs`, `platform_performance_settings`, `performance_request_logs`,
`performance_request_query_logs`, `report_artifacts` (metadata only — see §4).

New in this decision, also `public`, because they are *about* the tenant tree, not tenant
business data: `tenant_closure`, `customer_schema_registry`.

### 2. Customer-root data-plane table inventory (moves to per-customer-root schema — Phase 5)

Initially: `demo_sample_definitions`, `demo_sample_transactions`. Any future first-class module's
business/operational tables join this list. `report_artifacts` (the catalogue/metadata row)
stays in `public`; the *data a report reads* comes from the data-plane schema.

### 3. Schema naming convention

`cust_<sanitized-slug><underscore><8-hex-char id fingerprint>`, e.g. `cust_acme_a1b2c3d4`.

- Never accept a schema name from user input directly. The name is *generated* from the
  customer-root tenant's `slug` (cosmetic, for readability) and a fingerprint derived from its
  `id` (guarantees uniqueness even if slugs collide or get renamed later — renaming a tenant must
  never rename its schema).
- Sanitization: lowercase, `[^a-z0-9]` collapsed to `_`, leading/trailing `_` trimmed, truncated
  so the full name stays within PostgreSQL's 63-byte identifier limit. Empty-after-sanitization
  falls back to a fixed literal (`tenant`), never to an empty or attacker-influenced string.
- Implementation + tests: `apps/api/src/tenant-scope/schema-name.util.ts`.

### 4. Root schema registry model

`customer_schema_registry` (public): `id`, `customerRootTenantId` (unique), `schemaName`
(unique), `migrationVersion`, `status` (`PROVISIONING | ACTIVE | FAILED | ARCHIVED`),
`lastError`, timestamps.

- One row per customer root, one active schema per customer root.
- `PLATFORM_ROOT` can never have a registry row — enforced by the provisioning service refusing
  to provision for a tenant whose `type !== 'ROOT'`.
- Provisioning is idempotent: re-invoking it for an already-`ACTIVE` row is a no-op; for a
  `FAILED` row it retries; for a missing row it creates one.

### 5. Tenant hierarchy model

`Tenant` gains two flags (default `canEnterData = true`, `canAggregateChildren = false`,
matching a plain leaf data-entry node):

| Node kind | `canEnterData` | `canAggregateChildren` |
|---|---|---|
| `PLATFORM_ROOT` | `false` | `false` (no data-plane scope at all) |
| `ROOT` (customer root) | `true` | `true` |
| org/reporting node (`STANDARD`) | `false` | `true` |
| operating/data-entry node (`STANDARD`) | `true` | `false` |
| both (rare) | `true` | `true` |

`parentId`/`customerRootId` already support arbitrary depth (verified in the existing
`TenantService.create` / `SaasService.createCustomerTenant` code paths — nothing to change
there structurally, both already chain through any parent). What's missing is an efficient way
to answer "give me every descendant of node X" without a recursive query on every list/report
request — that's what the closure table is for.

### 6. `tenant_closure` (public)

`ancestorTenantId`, `descendantTenantId`, `customerRootTenantId` (**nullable** — see below),
`depth`, `createdAt`. PK `(ancestorTenantId, descendantTenantId)`.

- Every tenant gets a self-row (`ancestor = descendant = self`, `depth = 0`) at creation.
- Every tenant creation additionally copies its parent's ancestor rows forward one depth level
  (standard closure-table insert: `INSERT ... SELECT ancestor, <newId>, customerRootTenantId,
  depth+1 FROM tenant_closure WHERE descendant = <parentId>`), so descendant queries never
  recurse at read time.
- **Deviation from the literal ticket wording**: `customerRootTenantId` is nullable, not
  required. Reason: `PLATFORM_ROOT` gets a trivial self-row too (so "every tenant has a self
  row" holds without exception), but `PLATFORM_ROOT` is explicitly *not* part of any customer
  root's data scope — it has no customer root to point at. Its self-row's
  `customerRootTenantId` is `null`. Every `ROOT` tenant's self-row points at itself; every
  descendant's rows carry that same non-null id. A resolver query for `PLATFORM_ROOT` is
  rejected before it would ever need this column (see §8), so the nullability never leaks into
  data-plane logic — it only exists to keep "every tenant has a self-row" literally true.
- No cycles: closure rows are only ever generated by the insert-on-create algorithm above, which
  cannot produce a cycle (a new tenant can only inherit ancestors from an *existing* parent).
  Moving a tenant to a different parent is **not implemented in this phase** — doing it correctly
  means deleting and rebuilding every closure row for the entire moved subtree, which is real
  work with real failure modes; until that's built, tenant re-parenting after creation is
  explicitly disallowed (there is no API for it today, and none should be added without also
  building the closure-rebuild logic).
- Serves **both** directions: descendant queries for reporting/list scope
  (`WHERE ancestorTenantId = X`) and ancestor queries for settings inheritance
  (`WHERE descendantTenantId = X ORDER BY depth ASC`) — one table, no separate parentId-walk loop
  needed for settings (Phase 6).

### 7. Data-plane resolver (`TenantScopeService`, Phase 4)

Given an active `tenantId`, resolves: the tenant row, its customer root, the customer root's
schema name (from the registry), the set of tenant ids in data scope, and the two capability
flags. Fails closed (throws) when: tenant not found, tenant is `PLATFORM_ROOT`, tenant is not
`ACTIVE`, or the customer root has no `ACTIVE` schema registry row.

`dataScopeTenantIds`:
- `canAggregateChildren = true` → all rows from `tenant_closure` where `ancestorTenantId =
  tenantId` (naturally includes self via the depth-0 row, and *only* that node's own subtree —
  siblings and other branches are never ancestors of tenantId, so they never appear).
- `canAggregateChildren = false` → `[tenantId]` only.

This one query shape satisfies every acceptance scenario: `ROOT` resolves its entire tree
(everything descends from it), a reporting node resolves only its own subtree, an operating node
resolves only itself.

The resolver takes `tenantId` as an explicit parameter from **already-authenticated,
already-validated** request context (the same `X-Tenant-Id` header value that
`PermissionGuard`/`PackageFeatureGuard` already validate membership for) — it is not itself an
authentication or membership check, and it must never be called with a raw, unvalidated
frontend/cookie value. It answers "given a tenant the caller is already allowed to act as, what
data can it see" — not "is the caller allowed to act as this tenant."

### 8. Prisma vs Drizzle

**Decision: no Drizzle in Phase 1-4.** Everything built in this phase (`tenant_closure`,
`customer_schema_registry`, the resolver, the schema-name generator) lives in `public` and stays
on Prisma — the ticket's instruction to not rewrite control-plane Prisma without proof is
respected by not touching it at all here.

**Planned for Phase 5**: adopt Drizzle for the data-plane (`demo_sample_definitions`,
`demo_sample_transactions`, and future business tables), because Prisma's schema selection is
static at `generate`/`migrate` time (one `PrismaClient`, one declared set of schemas) and does
not fit a schema name that is only known *at request time* from the registry lookup. Drizzle can
build a query against a runtime-parameterized `pgSchema(schemaName)` without needing that name
baked into a generated client. Prisma remains the public/control-plane ORM indefinitely — this is
a two-ORM split by design, not a migration path off Prisma.

### 9. Migration orchestration strategy

- **Control-plane**: unchanged — `prisma migrate deploy` against `public`, as today.
- **Data-plane**: each customer-root schema is its own migration target. `customer_schema_
  registry.migrationVersion` records which data-plane version a given schema is currently at.
  Provisioning a new customer root creates the schema and stamps it at the current version.
  Shipping a new data-plane migration means: iterate every `ACTIVE` registry row, apply the new
  migration SQL against that row's `schemaName`, bump `migrationVersion` on success, mark
  `FAILED` + `lastError` on failure without touching other rows. This fan-out mechanism is
  **designed here, not built yet** — Phase 5 builds it when there is an actual data-plane
  migration to run.

### 10. Rollback / failed provisioning behavior

Tenant-row creation and schema provisioning are **two separate steps, not one transaction**.
The tenant (control-plane) commits first — a customer root always exists as a normal tenant even
if its schema is never successfully provisioned. Schema provisioning
(`CREATE SCHEMA IF NOT EXISTS`) runs after, writes a `PROVISIONING` row before attempting the
DDL, and updates it to `ACTIVE` or `FAILED` + `lastError` after. A `FAILED` or missing row simply
means: this customer root's control-plane features (users, memberships, settings, subscription)
work normally, but the resolver refuses all data-plane operations until provisioning is retried
and succeeds. This keeps failure isolated and safe — no half-created cross-cutting transaction
spanning DDL and business rows to unwind.

### 11. Why not schema-per-tenant (every `STANDARD` tenant, not just the root)

A customer root can have an arbitrarily deep, arbitrarily wide tree of `STANDARD` nodes (regions,
operating units, ...). Giving every one of them its own physical schema means migration fan-out
and connection/schema bookkeeping that scales with org-chart size, not customer count — and most
`STANDARD` nodes are lightweight, don't hold their own data (`canEnterData = false` reporting
nodes), and don't need physical isolation from siblings under the *same paying customer*. The
real security/compliance boundary is *between customers*, not between departments of one
customer. Isolating at the customer-root level gets the boundary that actually matters while
keeping the intra-customer tree cheap (shared schema, `tenantId`-scoped, already
composite-FK-hardened by AIS-SEC-003).

### 12. Why not PostgreSQL RLS yet

RLS would additionally close the *intra-customer-root* sibling-read gap (operating unit A reading
operating unit B's rows within the same customer schema) — a real but smaller-blast-radius gap
than the cross-customer one this decision closes. Deferred, not rejected, because: (a) it needs
a session-level tenant claim (`SET LOCAL`) wired through every connection, which interacts with
Prisma's connection pooling in ways not yet designed here, and (b) the resolver-scoped query
pattern this decision introduces (§7) already closes most of that gap for any code path that
goes through it — RLS would mainly protect against a future code path that bypasses the resolver
entirely. Worth revisiting if such a bypass is ever found in practice.

## Consequences

- Positive: cross-customer data leakage becomes a schema-boundary problem, not a
  "did every query remember `WHERE tenantId`" problem.
- Positive: reporting/list scope for arbitrary-depth org trees is an indexed closure-table
  lookup, not a recursive query written ad hoc per feature.
- Negative: two ORMs in the codebase going forward (Prisma for control-plane, Drizzle for
  data-plane from Phase 5) — a real cognitive cost, accepted because the alternative (Prisma
  raw-SQL escape hatches for every data-plane query) is worse for maintainability.
- Negative: customer-root provisioning is now a two-step process (tenant row, then schema) with
  its own failure mode to monitor (`customer_schema_registry.status = FAILED`).
- Migration/compatibility impact: `0008_customer_root_schema_isolation_foundation` adds
  `canEnterData`/`canAggregateChildren` to `tenants`, and the two new public tables. No existing
  table is dropped or moved in this migration — Demo Operations tables stay in `public` until
  Phase 5. Tenants created before this migration do not get backfilled `tenant_closure` rows in
  this phase (see AI2 completion note); this project has no deployed production data, and the
  demo seed already recreates its tenants idempotently.

## Alternatives Rejected

- **Schema-per-every-tenant / database-per-tenant**: see §11 — operational cost scales with org
  size, not customer count; the wrong axis for this SaaS's actual tree shape.
- **PostgreSQL RLS instead of schema isolation**: see §12 — solves a smaller problem
  (intra-customer) while leaving the bigger one (cross-customer) to shared-schema discipline.
- **Recursive CTE at read time instead of a closure table**: works, but re-computes the same
  subtree on every list/dashboard/report call instead of once at write time; rejected for
  reporting-hot-path cost as the tree gets deeper.
- **Full Prisma-to-Drizzle rewrite**: not needed — public/control-plane has no dynamic-schema
  problem to solve, only data-plane does.
