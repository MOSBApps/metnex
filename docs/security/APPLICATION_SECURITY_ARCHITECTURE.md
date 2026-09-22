# Application Security Architecture

> This document is the mandatory application security contract for every project derived from `metnex`.
> Replace placeholder examples with project-specific resources, but do not weaken the rules.

---

## 1. Purpose

Every derived project must define and preserve a single canonical security model for:

1. authentication
2. tenant or account boundary
3. permission naming
4. menu visibility vs CRUD separation
5. section/tab authorization
6. row-level access control
7. legacy role compatibility rules

This file is the source of truth for that contract.

---

## 2. Mandatory Security Principles

All derived projects must follow these principles:

1. Fail closed: no explicit permission means no access.
2. Permission first: runtime authorization comes from permissions, not UI role shortcuts.
3. Backend authority: final authorization is enforced in backend guards and service policies.
4. Navigation is not CRUD: seeing a menu does not imply create/update/delete rights.
5. Row-level scope is separate: permission answers `what`, scope answers `which records`.
6. Compatibility fields do not produce auth semantics.
7. Internal infrastructure endpoints must not leak to browsers.

---

## 3. Authorization Layers

Every project derived from `metnex` must separate authorization into four layers.

### 3.1 Navigation / Module Visibility

Controls whether the user can see a module in navigation or open its list page.
This is usually a `VIEW` permission.

### 3.2 Page / Section / Tab Visibility

Controls whether the user can see a tab, panel, or child surface inside a module.
If a tab shows a distinct data surface, it must have its own `VIEW` permission.

### 3.3 Action / CRUD Permission

Controls whether the user can create, update, delete, approve, or execute a domain action.
Typical actions are:

- `CREATE`
- `UPDATE`
- `DELETE`
- `APPROVE`
- domain-specific actions where needed

### 3.4 Row-Level Boundary

Controls which records the user may see or mutate.
This must be enforced separately from permission checks.

Accepted scope inputs include:

- tenant boundary
- visibility level
- responsibility assignments
- owner relation
- assignment/member relation
- department/process scope

### 3.5 Package / Capability Availability

Package availability controls whether a tenant has a module or capability at all.
It is not a replacement for permissions.

Rules:

1. Package assignment answers `is this capability available to this tenant?`.
2. Permission answers `what can this user do inside the available capability?`.
3. Backend routes for package-provisioned modules must enforce both package availability and action permission.
4. Frontend navigation must hide package-provisioned modules unless both package availability and menu/read permission are present.
5. Removing a package assignment must hide frontend navigation and cause backend routes to fail closed.

---

## 4. Permission Contract

Derived projects must define permissions in the canonical format:

`DOMAIN:RESOURCE:ACTION`

Examples:

- `AUDIT:AUDIT:VIEW`
- `AUDIT:ASSIGNMENT:UPDATE`
- `DOCUMENT:DOCUMENT:VIEW`
- `PERFORMANCE:MEASUREMENT:CREATE`

Rules:

1. Main resource CRUD and child resource CRUD must be separated when they represent different business actions.
2. Tabs with distinct data surfaces must not reuse one coarse `UPDATE` permission by default.
3. UI buttons such as `New`, `Save`, `Delete`, `Approve`, `Start`, `Close` must be tied to explicit action permissions.

---

## 5. Frontend Rules

Frontend code in derived projects must follow these rules:

1. Use permission helpers such as `hasPermission(...)` for gating.
2. Do not decode JWT and derive `isAdmin` style write access from role arrays.
3. Do not use legacy `additionalRoles` or equivalent compatibility fields for gating.
4. A read-only user may see a read-only surface, but editable controls must stay disabled or hidden.
5. Tabs must be filtered by their own `VIEW` permission when they expose distinct data.

---

## 6. Backend Rules

Backend code in derived projects must follow these rules:

1. Read endpoints must have explicit `VIEW` guards or a documented exception.
2. Write endpoints must have explicit action guards.
3. Service-level policy checks must enforce row-level scope.
4. Cross-module create flows must also require the target resource's `CREATE` permission.
5. Elevated or bootstrap-only endpoints must be intentionally narrow and documented.

---

## 7. Legacy Compatibility Rules

Compatibility fields may remain during migrations, but they must not produce runtime authorization decisions.

Examples:

- `additionalRoles`-style arrays
- legacy rank fields
- old owner user columns retained for backfill or compatibility

Forbidden patterns:

1. `[primaryRole, ...additionalRoles]` deciding write access
2. hardcoded frontend admin role arrays opening CRUD controls
3. using legacy fields as the canonical source of authorization

---

## 8. Cross-Module Create Rule

If one module creates a record in another bounded context, both permissions are required:

1. source module permission for the initiating action
2. target module `CREATE` permission

Source `UPDATE` permission alone is not sufficient.

---

## 9. File Delivery / Storage Rule

If the project uses object storage, browsers must not receive internal storage URLs.

Canonical model:

- browser calls project API
- API streams or proxies the file
- internal storage hostnames stay private

This rule is mandatory for HTTPS deployments.

---

## 10. Required Project Initialization Decisions

Before feature work grows, every derived project must record:

1. canonical permission naming strategy
2. menu vs CRUD separation rule
3. tab/child-resource separation rule
4. row-level boundary strategy
5. legacy compatibility fields that are forbidden from producing auth semantics
6. storage delivery rule if files exist

A project that has not recorded these decisions is not security-ready.

---

## 11. Delivery Gate For Authorization Changes

Any task that changes authorization behavior must include:

1. affected UI surfaces
2. affected backend endpoints
3. final permission matrix
4. row-level boundary note
5. quality gate evidence

A module is not considered closed until menu visibility, read surfaces, write surfaces, and row-level boundary are all explicit.

---

## 12. Tenant Isolation — Shared-Schema Hardening Standard (baseline)

> Decision record: [DEC-0009](../decisions/DEC-0009-shared-schema-tenant-isolation-hardening.md)
> Full table-level checklist: [DB_META.md § Tenant Isolation Standard](../domain/DB_META.md#tenant-isolation-standard-shared-schema)
>
> **This section is the default baseline, not the final isolation profile.** METNEX's
> target architecture is customer-root schema isolation — see §13 and
> [DEC-0010](../decisions/DEC-0010-customer-root-schema-isolation-and-hierarchical-scope.md).
> Everything below still applies *inside* one customer root's data (control-plane tables, and
> any data-plane table before it has a resolver-scoped access path) — it is not superseded, it is
> the floor that DEC-0010 builds on top of.

Derived projects that keep the shared-schema multi-tenancy model (one set of tables, `tenantId`
column, no schema-per-tenant split) must additionally guarantee:

1. Every tenant-owned domain table has `tenantId NOT NULL` with an FK to `tenants.id`.
2. Tenant-scoped business-key uniqueness is always `(tenantId, businessKey)`, never a bare
   `businessKey` unique.
3. If a tenant-owned child table references another tenant-owned parent table (not `Tenant`
   itself), the FK must be composite: `(childFk, tenantId) -> Parent(id, tenantId)`, with a
   matching `@@unique([id, tenantId])` on the parent. A bare `childFk -> Parent.id` FK only
   proves the parent row exists — not that it belongs to the same tenant.
4. List/update/delete service methods must never issue a query without a tenant predicate.
   `findFirst({ id, tenantId })` before mutating, not `findUnique({ id })` followed by a
   separate ownership check.
5. Controllers must resolve `X-Tenant-Id` through a fail-fast helper (`requireTenantId()`), never
   `tenantId ?? ''`. A missing tenant header is a `400`, not an empty-string query scope.

This standard is DB-level defense in depth. It does not replace `PermissionGuard` /
`PackageFeatureGuard`, and it does not close read-path leaks where a query legitimately omits a
tenant predicate — see DEC-0009's "What this does NOT guarantee" section.

---

## 13. Customer-Root Schema Isolation and Hierarchical Tenant Scope (target architecture)

> Decision record: [DEC-0010](../decisions/DEC-0010-customer-root-schema-isolation-and-hierarchical-scope.md)
> Table-level detail: [DB_META.md § Customer-Root Schema Isolation](../domain/DB_META.md#customer-root-schema-isolation-and-hierarchical-tenant-scope)

METNEX's target isolation profile moves domain/operational data out of the shared `public`
schema into a dedicated PostgreSQL schema **per customer root** (not per every `STANDARD`
tenant — see DEC-0010 §11 for why). Rules for any code touching data-plane tables:

1. The isolation boundary is the customer root. Everything inside one customer root's tree
   (however deep) shares that root's schema and stays `tenantId`-scoped within it — the §12
   standard still applies at that layer.
2. Every tenant node declares `canEnterData` (may create/own records) and
   `canAggregateChildren` (may see its descendants' data in lists/reports). A node can be either,
   neither is meaningless (a pure pass-through), or both.
3. Data-plane reads/writes must go through the tenant-scope resolver
   (`TenantScopeService`) to get the customer root's schema name and the caller's
   `dataScopeTenantIds` — never construct a schema-qualified query from a raw frontend/cookie
   tenant value, and never accept a schema name from anything other than the resolver.
4. The resolver fails closed: unknown tenant, `PLATFORM_ROOT`, inactive tenant, or a customer
   root with no `ACTIVE` schema registry row are all rejected before any data-plane query runs.
5. `PLATFORM_ROOT` never resolves a data-plane scope, full stop — it has no customer root and no
   schema.

This is additive to, not a replacement for, `PermissionGuard`/`PackageFeatureGuard` — the
resolver answers "what data can this already-authorized tenant see," not "is the caller allowed
to act as this tenant."
