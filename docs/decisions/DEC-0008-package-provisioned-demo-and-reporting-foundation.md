# DEC-0008 — Package-Provisioned Demo and Reporting Foundation

Status: Accepted

Date: 2026-07-28

## Context

METNEX is intended to be fork-ready. A fresh project needs a neutral, working reference for:

- tenant capability/package assignment
- permission-gated navigation
- a package-provisioned demo module
- canonical CRUD/list/detail surfaces
- route-based report preview and export

The existing SaaS foundation already has resource quota packages and customer subscriptions. Those entities answer commercial/quota questions, but they do not separately model module availability.

## Decision

Add a separate package entitlement layer:

- `PackageFeature`
- `TenantPackageAssignment`

Package assignment controls whether a tenant has a module/capability. Permissions still control user actions inside that capability.

Add `Demo Operations` as the canonical neutral sample module with:

- module dashboard at `/app/demo`
- `Sample Definition` CRUD at `/app/demo/definitions`
- `Sample Transaction` CRUD/list at `/app/demo/transactions`
- backend package + permission guards on all API routes

Add a reporting foundation with:

- `ReportArtifact` metadata
- `DEMO_SAMPLE_TRANSACTIONS` analytic report
- route-based viewer at `/app/reports/DEMO_SAMPLE_TRANSACTIONS/view`
- HTML preview on the same page
- PDF/XLSX download endpoints
- JRXML sandbox validation rule: no SQL/JDBC/direct external calls

Demo seed is env-gated and must not run automatically in production.

## Consequences

- Menu visibility now checks both enabled package features and permissions.
- Backend routes fail closed when package assignment is inactive or missing.
- `ResourcePackage` remains quota/subscription oriented; `PackageFeature` is module/capability oriented.
- Reporting orchestration must use domain-owned data providers/services instead of directly bypassing module ownership.
- Forked projects can replace Demo Operations while preserving the entitlement/reporting patterns.

## Permission / Package Matrix

| Surface | Package Feature | Permission |
|---|---|---|
| Demo module menu/dashboard | `AIS_DEMO_OPERATIONS` | `DEMO:OPERATIONS:VIEW` |
| Sample Definition list | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_DEFINITION:VIEW` |
| Sample Definition create | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_DEFINITION:CREATE` |
| Sample Definition update | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_DEFINITION:UPDATE` |
| Sample Definition delete | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_DEFINITION:DELETE` |
| Sample Transaction list | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_TRANSACTION:VIEW` |
| Sample Transaction create | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_TRANSACTION:CREATE` |
| Sample Transaction update | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_TRANSACTION:UPDATE` |
| Sample Transaction delete | `AIS_DEMO_OPERATIONS` | `DEMO:SAMPLE_TRANSACTION:DELETE` |
| Demo report HTML preview | `AIS_DEMO_OPERATIONS` | `REPORT:ARTIFACT:VIEW` |
| Demo report PDF/XLSX export | `AIS_DEMO_OPERATIONS` | `REPORT:ARTIFACT:EXPORT` |
