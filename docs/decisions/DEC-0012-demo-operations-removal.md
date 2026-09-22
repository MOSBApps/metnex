# DEC-0012 — Demo Operations Removal

**Date:** 2026-09-16
**Status:** Accepted
**Deciders:** AI1 (Product Governance Agent), AI2 (Engineering Executor)

---

## Context

DEC-0008 introduced `Demo Operations` as a package-provisioned, neutral sample module (dashboard,
`Sample Definition` / `Sample Transaction` CRUD, and a `DEMO_SAMPLE_TRANSACTIONS` reporting
artifact) so a freshly cloned METNEX skeleton had a working, permission-gated reference to fork
from. TASK-022.1 and TASK-022.2 already separated the parts of that scaffolding that are genuinely
reusable infrastructure — the Jasper render adapter (`ReportRenderService`) and the dataset
provider abstraction (`ReportDatasetProvider` / `ReportDatasetResolver`) — from the demo-specific
code that consumed them (`DemoTransactionsDatasetProvider`, demo routes, demo nav, demo seed).

With that separation done, Demo Operations itself no longer earns its place in the skeleton: it is
sample data and a sample CRUD surface that every fork immediately needs to delete before adding its
own first real module. Keeping it increases the surface every fork has to understand and remove by
hand.

## Decision

Remove the Demo Operations module and all of its dependents, while keeping the generic
infrastructure it exercised:

- Backend: delete `apps/api/src/demo-operations/` (module, controller, service, tests) and the
  `demo_sample_definitions` / `demo_sample_transactions` tables (forward migration
  `0002_thick_earthquake.sql`, old migrations untouched).
- Reporting: remove `DemoTransactionsDatasetProvider`, its DI wiring, `ensureDemoReportArtifact()`,
  the `DEMO_SAMPLE_TRANSACTIONS` artifact auto-seed, and demo-named methods
  (`renderDemoHtml`/`exportDemo` renamed to `renderHtml`/`exportReport`). `ReportingModule`,
  `ReportRenderService`, `ReportDatasetProvider`/`ReportDatasetResolver`, and the generic
  `ReportArtifact` table/API are kept — with zero dataset providers registered by default until a
  real domain module adds one.
- Bootstrap/entitlement: remove `ensureDemoSeedFromEnv()` and everything it seeded
  (`AIS_ENABLE_DEMO_SEED`, Demo Tenant/Region/Operating Unit, demo admin user, `AIS_DEMO_PACKAGE`,
  demo role/permission seeds, demo definitions/transactions, demo report artifact, demo schema
  provisioning). Generic platform bootstrap (`bootstrapInitialAdmin`, env-gated system admin
  bootstrap, builtin role/permission seeding) is unchanged.
- Frontend: remove `/app/demo`, `/app/demo/definitions`, `/app/demo/transactions`, the
  `Demo Operations` nav module (including its `Demo Report` link hardcoded to
  `DEMO_SAMPLE_TRANSACTIONS`), and the demo-specific `Definition` filter/endpoint call in the
  generic report viewer. The generic `/app/reports/[id]/view` surface is kept, artifact-driven, and
  now shows an explicit empty state when an artifact/provider is not found (HTTP 404) instead of a
  raw error.
- Authorization: remove all `DEMO:*` permission codes from the builtin permission catalogue and
  builtin role seeds. `REPORT:ARTIFACT:VIEW` / `REPORT:ARTIFACT:EXPORT` are kept, and the reporting
  endpoints keep their separate VIEW/EXPORT guards.

## Consequences

- Positive: forks start from a demo-free baseline; nothing has to be deleted before adding a real
  first module. The reporting foundation (render adapter + dataset provider abstraction) is proven
  to work with zero built-in providers, which is exactly the state a fresh fork needs.
- Negative: there is currently no working example dataset provider wired into `ReportingModule` —
  the next module that needs reporting must add its own `ReportDatasetProvider` and register it via
  the `REPORT_DATASET_PROVIDERS` token, following the pattern documented in
  `docs/AI_Governance/AI2_BOOTSTRAP_PROMPT.md` history / `apps/api/src/reporting/dataset/`.
- Migration / compatibility impact: `demo_sample_definitions` and `demo_sample_transactions` table
  data is dropped, not archived (see `docs/AI_Governance/DEPRECATED_MODULES.md` for the full data
  status). Demo tenant/user/role data seeded by a prior `AIS_ENABLE_DEMO_SEED=true` run is **not**
  deleted by the migration — tenant/org data lifecycle is out of scope for a schema migration; an
  environment that ran the demo seed still has that tenant and must decommission it manually if no
  longer needed.

## Alternatives Rejected

- **Keep Demo Operations, mark it deprecated only in docs:** rejected — a fork-ready skeleton
  should not ship dead/sample code as its default state; TASK-022.1/TASK-022.2 already did the work
  needed to remove it safely without losing the reusable reporting infrastructure.
- **Replace Demo Operations with a different first-class sample module:** rejected — out of scope
  for this task; the reporting/rendering infrastructure is intentionally left provider-less so the
  next real module defines its own dataset shape instead of inheriting demo's.
