# Metnex — Domain Model

> Live domain source of truth for the current implemented SaaS foundation.
> Keep this file aligned with `apps/api/prisma/schema.prisma` and active runtime behavior.

---

## 1. Modules

| # | Module | Domain | Status | Notes |
|---|---|---|---|---|
| 1 | Platform | Authentication, bootstrap, tenant tree, users, roles, permissions | Active | Implemented in `apps/api/src/platform` |
| 2 | Settings | Platform defaults and tenant-level service overrides | Active | SMTP and AI provider override model implemented |
| 3 | SaaS Foundation | Resource packages, subscriptions, customer provisioning, customer-admin workflows | Active | Implemented inside platform module and customer-admin routes |
| 4 | Web Shell | Setup, login, tenant selection, tenant shell, platform shell, impersonation UX | Active | Implemented in `apps/web/src/app` |
| 5 | Package Entitlements | Tenant-level module/capability availability assignment | Active | Package availability is separate from permissions; implemented in `apps/api/src/package-entitlements` |
| 6 | Reporting Foundation | Report artifact registry, dataset provider abstraction, HTML/PDF/XLSX export surface, Jasper render adapter | Active | No dataset provider is registered by default (Demo Operations removed, DEC-0012); a future domain module registers its own `ReportDatasetProvider` |

---

## 2. Core Entities

### 2.1 Platform / Shared Entities

| Entity | Table | Key Fields | Owner Module |
|---|---|---|---|
| Tenant | `public.tenants` | `id`, `name`, `slug`, `type`, `status`, `parentId`, `customerRootId` | Platform |
| User | `public.users` | `id`, `email`, `displayName`, `isSystemAdmin`, `status` | Platform |
| SystemRole | `public.system_roles` | `id`, `name`, `isBuiltin` | Platform |
| Permission | `public.permissions` | `id`, `code` | Platform |
| UserSystemRoleAssignment | `public.user_system_role_assignments` | `userId`, `roleId`, `tenantId` | Platform |
| AuthSession | `public.auth_sessions` | `userId`, `refreshTokenHash`, `expiresAt`, `isRevoked` | Platform |
| SystemBootstrap | `public.system_bootstrap` | `singletonKey`, `adminUserId`, `completedAt` | Platform |
| PlatformGeneralSettings | `public.platform_general_settings` | `name`, `shortName`, `address` | Settings |
| PlatformSmtpSettings | `public.platform_smtp_settings` | `notificationsEnabled`, `host`, `port`, `secure`, `fromEmail` | Settings |
| PlatformAiProviderSettings | `public.platform_ai_provider_settings` | `providerType`, `endpoint`, `defaultModel`, `isActive` | Settings |
| ResourcePackage | `public.resource_packages` | `code`, `name`, quota fields, `isActive` | SaaS Foundation |
| CustomerSubscription | `public.customer_subscriptions` | `customerRootTenantId`, `resourcePackageId`, `status`, `startsAt`, `endsAt` | SaaS Foundation |
| PackageFeature | `public.package_features` | `code`, `moduleKey`, `name`, `isActive` | Package Entitlements |
| TenantPackageAssignment | `public.tenant_package_assignments` | `tenantId`, `packageFeatureId`, `isActive`, `assignedByUserId`, `assignedAt`, `revokedAt` | Package Entitlements |
| PlatformAuditLog | `public.platform_audit_logs` | `actorId`, `actionCode`, `entityType`, `entityId`, `summary`, `metadata` | Platform Operations |
| PlatformPerformanceSettings | `public.platform_performance_settings` | singleton `slowRequestThresholdMs`, `dbTraceEnabled` | Platform Operations |
| PerformanceRequestLog | `public.performance_request_logs` | `requestId`, `route`, `statusCode`, `durationMs`, optional `tenantId`/`userId` | Platform Operations |
| PerformanceRequestQueryLog | `public.performance_request_query_logs` | `requestLogId`, `queryHash`, `durationMs`, scrubbed `queryText` | Platform Operations |

### 2.2 Tenant / Business Entities

| Entity | Table | Key Fields | Owner Module |
|---|---|---|---|
| TenantMembership | `public.tenant_memberships` | `tenantId`, `userId`, `isActive` | Platform |
| TenantRole | `public.tenant_roles` | `tenantId`, `name`, `isActive` | Platform |
| TenantRolePermission | `public.tenant_role_permissions` | `roleId`, `permissionCode` | Platform |
| UserTenantRoleAssignment | `public.user_tenant_role_assignments` | `userId`, `roleId`, `tenantId` | Platform |
| TenantSmtpOverride | `public.tenant_smtp_overrides` | `tenantId`, SMTP fields | Settings |
| TenantAiProviderOverride | `public.tenant_ai_provider_overrides` | `tenantId`, AI provider fields | Settings |
| ReportArtifact | `public.report_artifacts` | `code`, `moduleKey`, `viewMode`, `supportedOutputFormats`, `printStrategy`, `templatePath` | Reporting Foundation |

---

## 3. Tenant Model

### 3.1 Tenant Types

| Tenant Type | Meaning | Typical Operator |
|---|---|---|
| `PLATFORM_ROOT` | SaaS provider root tenant and platform console scope | Super admin |
| `ROOT` | Customer root tenant; root of one customer tree | Customer tenant admin |
| `STANDARD` | Child tenant inside a customer tree | Customer users / sub-teams |

### 3.2 Hierarchy Fields

| Field | Meaning |
|---|---|
| `parentId` | Immediate parent tenant in the tree |
| `customerRootId` | Root tenant that owns the whole customer subtree |

Rules implemented today:
- `PLATFORM_ROOT` is created during bootstrap.
- Customer `ROOT` tenants are provisioned under the `PLATFORM_ROOT`.
- A `ROOT` tenant points `customerRootId` to itself.
- A `STANDARD` tenant points `customerRootId` to its owning customer root.
- Child tenant slugs are composed from parent slug for readability, but relational ownership is enforced through `parentId` and `customerRootId`, not through slug parsing.

---

## 4. Authorization Model

### 4.1 Identity and Session

- Canonical login identifier is `users.email`.
- Email is immutable in current management flows; display name and password are editable by admins.
- Access token is JWT-based.
- Refresh token is stored in `auth_sessions` and issued via httpOnly cookie.

### 4.2 Role Layers

| Layer | Entity Set | Scope | Purpose |
|---|---|---|---|
| Platform/system role | `SystemRole`, `Permission`, `UserSystemRoleAssignment` | Global or tenant-scoped (`tenantId` nullable) | Platform administration and customer-root admin assignment |
| Tenant role | `TenantRole`, `TenantRolePermission`, `UserTenantRoleAssignment` | One tenant | Fine-grained tenant-local permissions |
| Membership | `TenantMembership` | One tenant | Access boundary independent of permission codes |

### 4.3 Built-in Role Intent

| Role | Intent |
|---|---|
| `SYSTEM_ADMIN` | Platform-wide operator authority |
| `TENANT_ADMIN` | Customer-root administrator across a `ROOT` tenant and its descendants |
| `VIEWER` | Read-only platform visibility |

### 4.4 Runtime Access Distinction

- `TenantMembership` answers whether a user belongs to a tenant.
- `SystemRole` answers platform-level authority and customer-root admin scope.
- `TenantRole` answers tenant-local capability inside one tenant.
- `isSystemAdmin` is still present on `User` and currently grants an unconditional platform bypass in backend guards.
- Package availability is evaluated separately from permissions. `TenantPackageAssignment` answers whether a tenant has a module/capability; permission codes still answer what a user may do inside that module.

---

## 5. Key Relationships

1. `Tenant (PLATFORM_ROOT)` 1:N `Tenant (ROOT)` via `parentId`
2. `Tenant (ROOT)` 1:N `Tenant (STANDARD)` via `customerRootId` and `parentId`
3. `User` N:M `Tenant` via `TenantMembership`
4. `User` N:M `SystemRole` via `UserSystemRoleAssignment`
5. `User` N:M `TenantRole` via `UserTenantRoleAssignment`
6. `SystemRole` N:M `Permission` via `RolePermission`
7. `TenantRole` 1:N `TenantRolePermission`
8. `Tenant (ROOT)` 1:1 `CustomerSubscription`
9. `ResourcePackage` 1:N `CustomerSubscription`
10. `Tenant` 1:1 optional SMTP and AI override records
11. `Tenant` N:M `PackageFeature` through `TenantPackageAssignment`
12. `PackageFeature` 1:N optional `ReportArtifact`

---

## 6. Workflow Summaries

### Workflow: Platform Bootstrap
- Trigger: first deployment or first local startup before any system admin exists
- Main entities: `Tenant`, `User`, `SystemRole`, `Permission`, `UserSystemRoleAssignment`, `SystemBootstrap`
- Result:
  - built-in permissions and roles are seeded
  - first `PLATFORM_ROOT` tenant is created
  - first system admin user is created
  - bootstrap completion marker is written

### Workflow: Login and Session Refresh
- Trigger: user submits email/password on `/login`
- Main entities: `User`, `AuthSession`
- Flow:
  - credentials are checked against `User`
  - JWT access token is returned to the browser
  - refresh token is stored in httpOnly cookie and hashed in `auth_sessions`
  - `/auth/refresh` rotates refresh session and issues a new access token
  - `/auth/logout` revokes the current refresh session

### Workflow: Tenant Selection
- Trigger: authenticated browser lands without active tenant cookie
- Main entities: `TenantMembership`, `UserSystemRoleAssignment`, `Tenant`
- Flow:
  - `/platform/me/tenants` returns visible active tenants
  - selected tenant is validated against membership or customer-root admin scope
  - browser stores active tenant id/name/type cookies
  - tenant permissions are fetched separately using `X-Tenant-Id`

### Workflow: Customer Provisioning
- Trigger: super admin provisions a customer from package screen
- Main entities: `ResourcePackage`, `CustomerSubscription`, `Tenant`, `User`, `TenantMembership`, `UserSystemRoleAssignment`
- Result:
  - customer `ROOT` tenant created under `PLATFORM_ROOT`
  - tenant admin user created
  - tenant admin membership created on customer root
  - `TENANT_ADMIN` assigned scoped to that customer root
  - active subscription linked to resource package

### Workflow: Package-Provisioned Module Availability
- Trigger: platform admin assigns a `PackageFeature` to a tenant
- Main entities: `PackageFeature`, `TenantPackageAssignment`, tenant permission grants
- Flow:
  - backend records the package assignment and writes platform audit
  - `/platform/me/tenant-permissions` returns `enabledFeatures`
  - sidebar shows a module only when its package feature is enabled and the user holds the module's `:VIEW` permission
  - module API routes enforce both permission and package feature guards

### Workflow: Reporting (Artifact-Driven)
- Trigger: user opens `/app/reports/[artifactCode]/view`
- Main entities: `ReportArtifact`, a domain module's own `ReportDatasetProvider`
- Flow:
  - report viewer renders a filter panel and a full-width HTML preview on the same page
  - `ReportingService` resolves the artifact's `ReportDatasetProvider` via `ReportDatasetResolver` (by artifact code) and calls it with an explicit `tenantId`
  - export endpoints return PDF or XLSX downloads, either via `ReportRenderService` (external Jasper HTTP renderer, when `REPORT_RENDER_ENDPOINT` is configured) or an in-process fallback
  - artifact metadata includes `viewMode`, `defaultPreviewFormat`, `supportedOutputFormats`, and `printStrategy`
  - JRXML templates must not contain SQL/JDBC/direct external calls (sandbox check)
  - if no artifact or no provider matches the requested code, the API returns a controlled 404 and the viewer shows an empty state
  - **no dataset provider is registered by default** (DEC-0012) — a future domain module adds its own by implementing `ReportDatasetProvider` and registering it against the `REPORT_DATASET_PROVIDERS` token in `apps/api/src/reporting/reporting.module.ts`

### Workflow: Customer Admin Operations
- Trigger: tenant admin uses `/app/admin`
- Main entities: `CustomerSubscription`, `Tenant`, `User`, `TenantMembership`
- Capabilities:
  - create child tenants under current customer tree
  - create users
  - add memberships to allowed tenants in the same customer tree
  - update display names and admin-set passwords
  - enforce package-based child-tenant and user-count quotas

### Workflow: Impersonation
- Trigger: super admin chooses “Kılığına Gir” on a user
- Main entities: `User`
- Flow:
  - backend issues a short-lived impersonation access token
  - browser stores original access token separately
  - active tenant context is cleared
  - operator re-enters through tenant selection and sees the system as the target user
  - banner allows return to the original super admin session

### Workflow: Platform Audit Review
- Trigger: system admin opens `/system/audit`
- Main entities: `PlatformAuditLog`, `User`
- Flow:
  - platform auth and user-management mutations write immutable audit rows
  - system admin filters by action code, entity type, actor, and date
  - metadata payload is scrubbed before persistence; secrets are never rendered back

### Workflow: Platform Performance Diagnostics
- Trigger: system admin opens `/system/performance`
- Main entities: `PlatformPerformanceSettings`, `PerformanceRequestLog`, `PerformanceRequestQueryLog`
- Flow:
  - every request receives response-time measurement
  - requests above the configured threshold, or server errors, persist a slow-request row
  - when DB trace is enabled, Prisma query shapes are scrubbed and stored under the slow request
  - diagnostics screen reads DB stats, slow routes, slow queries, and heuristic recommendations

### Workflow: Settings Resolution
- Trigger: platform or tenant settings screens request current values
- Main entities: platform settings tables and tenant override tables
- Resolution:
  - platform screens read/write platform default tables
  - tenant screens first look for tenant override
  - when override is missing, effective value falls back to platform default

---

## 7. Integration Points

| From | To | Mechanism | Notes |
|---|---|---|---|
| Web login/setup/tenant-select | Platform API | HTTP JSON + cookies | Runtime API base resolved via injected `window.__METNEX_API_URL__` |
| Platform auth | Prisma | Direct service persistence | `users`, `auth_sessions`, `system_bootstrap` |
| Platform bootstrap | Role seed catalogue | Service orchestration | Built-in roles and permissions seeded before first admin |
| Customer admin flows | CustomerAccessService | Service policy checks | Enforces customer-root tree boundary |
| Reporting Foundation | Domain modules | `ReportDatasetProvider` / `ReportDatasetResolver` | Reporting core never reaches into a module's tables directly — providers read through their owning module's service and are resolved by artifact code (DEC-0012; no provider registered by default) |
| Reporting Foundation | External Jasper renderer | `ReportRenderService` HTTP adapter | Used when `REPORT_RENDER_ENDPOINT` is configured; browsers never call the renderer directly |
| Tenant settings | Platform settings | Fallback resolution | Tenant override or platform default |
| Local dev bootstrap | Docker Compose + Prisma migrate | `dev.sh` | Starts Postgres/Redis/MinIO, writes env files, runs Prisma generate/migrate |
| Platform ops console | Audit + Perf API | HTTP JSON + JWT | `/system/audit` and `/system/performance` are system-admin-only surfaces |

---

## 8. State Machines

| Entity | States | Transition Rules |
|---|---|---|
| `Tenant` | `ACTIVE`, `SUSPENDED`, `ARCHIVED` | New tenants start `ACTIVE`; `SUSPENDED` blocks normal use; `ARCHIVED` requires no active members |
| `User` | `ACTIVE`, `INACTIVE`, `LOCKED` | New users start `ACTIVE`; deactivation blocks login; inactive target cannot be impersonated |
| `CustomerSubscription` | `TRIAL`, `ACTIVE`, `SUSPENDED`, `CANCELLED`, `EXPIRED` | New provisioning currently creates `ACTIVE`; other states are schema-ready but not fully surfaced in UI |

---

## 9. Known Gaps / Deferred Items

- Storage quota usage is currently derived from inferred customer-root object prefixes in MinIO/S3 (`tenants/<customerRootId>/`, `customer-roots/<customerRootId>/`). Because this namespace is not yet an authoritative repository-wide write contract, the API must report the result as `APPROXIMATE`, not `REAL`.
- Database quota usage currently returns a real PostgreSQL database-size snapshot with `APPROXIMATE` status because the shared-schema model cannot reliably attribute physical bytes to one customer root.
- Platform audit coverage is intentionally additive: auth, impersonation, platform user, role, and membership mutations are logged first; broader platform surfaces can append new events later without changing the read contract.
- Performance diagnostics currently expose platform-global threshold and trace settings, not per-tenant overrides.
- Super admin user-management surface is lighter than the full target model: role revoke, tenant membership removal, and richer detail tabs remain future work.
- Governance source-of-truth now reflects the implemented foundation, but UI-contract compliance and permission-source normalization still need follow-up review.

- **SCADA source catalog (TASK-027.63, in-memory only):** `CatalogSource` (opaque UUID id, versioned/immutable, physical database name kept as-is, verification `UNVERIFIED|VERIFIED|BLOCKED`, tenant mappings `UNRESOLVED|RESOLVED|BLOCKED`, source time zone, limit profile, declared tables/columns with per-column verification) lives under `apps/api/src/reporting/scada/catalog/`. No PostgreSQL table/migration exists yet; persistence, write permission (Q-W516) and audit action names (Q-W519) are pending. See DEC-0015/DEC-0016.
