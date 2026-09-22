# Deprecated Modules & Surfaces

> Track removed modules, routes, tables, and transitional compatibility shims here.
> This file is intentionally a template in the skeleton.

---

## How to Use This File

When a module or route is deprecated:
1. Add the deprecation date
2. State what replaced it
3. Describe data retention / backward compatibility
4. Note redirects, 404 behavior, or compatibility shims

---

## Entry Template

### `<module_or_surface_name>`

**Deprecated since**: `<YYYY-MM-DD>`  
**Replaced by**: `<new module / route / workflow>`  
**Status**: `Deprecated` / `Removed from code` / `DB retained`

#### Affected surfaces
- Tables: `<schema.table_a>`, `<schema.table_b>`
- Routes: `<old route>` -> `<new route>`
- UI: `<old menu / screen>`
- Compatibility shim: `<if any>`

#### Why deprecated
- `<reason>`

#### Data status
- `<kept / migrated / archived / dropped later>`

#### Follow-up
- [ ] remove compatibility shim
- [ ] archive old data
- [ ] update runbooks / docs

---

### `Demo Operations`

**Deprecated since**: `2026-09-16`
**Replaced by**: Nothing — the module was fork-scaffolding only (sample dashboard, CRUD, and a demo report artifact meant to be replaced by real domain modules). See `docs/decisions/DEC-0012-demo-operations-removal.md`.
**Status**: `Removed from code`

#### Affected surfaces
- Tables: `demo_sample_definitions`, `demo_sample_transactions` (dropped by `apps/api/drizzle/migrations/0002_thick_earthquake.sql`)
- Routes: `apps/api/src/demo-operations/*` (`/api/v1/demo-operations/*`) — removed. `apps/api/src/reporting/*` (`/api/v1/reports/*`) — kept, now demo-independent.
- UI: `/app/demo`, `/app/demo/definitions`, `/app/demo/transactions` — removed. `Demo Operations` nav module and its `Demo Report` link — removed from `apps/web/src/lib/nav-config.ts`.
- Compatibility shim: `DemoTransactionsDatasetProvider` (temporary `ReportDatasetProvider` added in TASK-022.2) — removed, not kept as a shim.

#### Why deprecated
- Demo Operations was always intended as fork-ready sample scaffolding, not a real product module. TASK-022.1/TASK-022.2 already separated the generic Jasper render adapter and the dataset provider abstraction from it; TASK-022.3 removes the sample module itself so forks start from a clean, demo-free baseline.

#### Data status
- `demo_sample_definitions` / `demo_sample_transactions` table data: **dropped** by the forward migration (`DROP TABLE ... CASCADE`) — not archived.
- `report_artifacts` row `DEMO_SAMPLE_TRANSACTIONS`: deleted by the same migration.
- `resource_packages` row `AIS_DEMO_PACKAGE`: deleted by the same migration, but only when no `customer_subscriptions` row still references it (`ON DELETE RESTRICT`) — if a demo tenant subscription is still active in an environment, that package row is left in place until the demo tenant is decommissioned.
- Demo tenant/user/role data seeded by the old `AIS_ENABLE_DEMO_SEED=true` bootstrap path (Demo Tenant, Demo Region, Demo Operating Unit, `demo.admin@metnex.local`, `Demo Operations Admin` role, and its customer-root data-plane schema) is **not** touched by this migration — tenant/org data lifecycle is out of scope for a module-removal schema migration. An environment that previously ran the demo seed still has that tenant; remove it manually via the platform tenant admin surface if it is no longer needed.
- Permission codes `DEMO:OPERATIONS:VIEW`, `DEMO:SAMPLE_DEFINITION:{VIEW,CREATE,UPDATE,DELETE}`, `DEMO:SAMPLE_TRANSACTION:{VIEW,CREATE,UPDATE,DELETE}` were removed from the builtin permission catalogue (`apps/api/src/platform/domain/system-role.domain.ts`, `apps/api/src/platform/permission-catalogue.ts`). Any pre-existing `tenant_role_permissions` / `role_permissions` rows referencing these codes become orphaned references to a code no longer in the catalogue; they are not actively cleaned up by the migration (no FK to the code list) and are harmless no-ops going forward.

#### Follow-up
- [x] remove compatibility shim (`DemoTransactionsDatasetProvider`)
- [ ] archive old data — not applicable, data was destructive-dropped by design (sample data only)
- [x] update runbooks / docs (`DOMAIN_MODEL.md`, `DB_META.md`, `reporting-foundation.md`, `docs/README.md`, this file, `DEC-0012`)
