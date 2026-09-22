# DEC-0011 — Full Drizzle Standard (Supersedes DEC-0010 §8's Prisma/Drizzle Split)

**Date:** 2026-07-29
**Status:** Accepted (Round 1 — ORM swap for existing control-plane and Phase 1-4 data-plane
foundation code; Phase 5-7 data-plane feature work on top of this foundation is a separate,
later round)
**Deciders:** AI1 (governance, via the "AIS-EPC-004 Amendment — Full Drizzle Standard" ticket) /
AI2 (engineering executor)

---

## Context

DEC-0010 §8 decided a two-ORM split: Prisma stays the control-plane ORM indefinitely, Drizzle
was planned only for data-plane tables from Phase 5 onward, because Prisma's schema selection is
static at `generate`/`migrate` time and cannot target a customer-root schema name that is only
known at request time from the schema registry lookup.

That reasoning about Prisma's static schema selection was correct as far as it went, but AI1's
follow-up amendment overrode the conclusion, not the diagnosis: running two ORMs side by side —
one static-schema (Prisma, `public`) and one dynamic-schema (Drizzle, `cust_*`) — is a permanent
cognitive and tooling split (two migration systems, two client-generation steps, two mocking
strategies in tests, two sets of idioms for the same kind of query) for a project whose explicit
goal is to be a clean fork-ready foundation. The amendment's judgment: pay the one-time cost of
moving control-plane onto Drizzle now, while the codebase is still small, rather than carry two
ORMs for the life of every fork of this skeleton.

The amendment was explicit and Forbidden a specific set of shortcuts that would have made the
migration hollow:

- No Prisma left as a runtime dependency anywhere in `apps/api`.
- No request-scoped `search_path` tenant switching (Drizzle's data-plane story must still be the
  runtime-parameterized `pgSchema(schemaName)` pattern DEC-0010 §8 envisioned, not a session-level
  hack).
- No raw user-provided schema names (the schema-name generator from DEC-0010 §3 is unchanged and
  still the only source of a schema identifier).
- No full schema-per-`STANDARD`-tenant (DEC-0010 §11's reasoning for isolating at the
  customer-root level, not the org-chart level, is unchanged and unaffected by the ORM choice).

## Decision

**Drizzle is now the only ORM in `apps/api`, for both the public/control-plane schema and the
customer-root data-plane schema.** DEC-0010 §8's "Prisma for control-plane, Drizzle for
data-plane" split is superseded. Every other decision in DEC-0010 (§1-7, §9-12 — the table
inventory split between `public` and per-customer-root schemas, the schema naming convention,
the registry model, the closure table, the resolver, the migration-orchestration design, the
rollback behavior, and the choice of customer-root-level isolation over per-tenant or RLS)
**stands unchanged.** This decision is scoped to the ORM/tooling layer only, not the data model
or isolation architecture.

### What Round 1 covered

Everything that existed at the time the amendment landed — control-plane and the already-built
Phase 1-4 data-plane foundation:

1. **Schema definition**: the full Prisma schema (26 tables across identity/auth, tenant tree,
   SaaS/packages, settings, operations, and the Phase 1-4 `tenant_closure` /
   `customer_schema_registry` foundation, plus the existing Demo Operations/reporting tables)
   rewritten as Drizzle `pgTable` definitions under `apps/api/src/db/schema/`, split by domain
   (`platform.ts`, `settings.ts`, `saas.ts`, `operations.ts`, `demo.ts`, `enums.ts`).
2. **Migration tooling**: `drizzle-kit` replaces `prisma migrate`. A single baseline migration
   (`apps/api/drizzle/migrations/0000_initial_baseline.sql`) replaces the eight Prisma migrations
   `0001`-`0008` — there is no production data to preserve, so this project consolidates rather
   than replays Prisma history as Drizzle SQL. `pnpm --filter api db:generate` / `db:migrate`
   keep their names (for `dev.sh` compatibility) but now invoke `drizzle-kit`.
3. **DB access layer**: `DbModule`/`DbService` (`apps/api/src/db/`) replace
   `PrismaModule`/`PrismaService`, wrapping a `pg.Pool` + `drizzle(pool, {schema})`. A `DB`
   injection token keeps the ergonomic `@Inject(DB) private readonly db: Db` pattern services
   already used for `PrismaService`.
4. **Every service that touched Prisma** — `tenant-scope` (closure, registry, resolver),
   `platform` (auth, tenant, user, role, saas, bootstrap, me, both guards), `audit`, `perf`,
   `settings` (platform + tenant), `package-entitlements`, `demo-operations`, `reporting` —
   rewritten against the Drizzle query builder.
5. **Tests**: every spec that mocked Prisma's `findFirst`/`findMany`/`upsert`/etc. shape rewritten
   against a new reusable chainable mock (`apps/api/src/db/test-helpers/drizzle-mock.ts`) that
   replicates Drizzle's fluent builder as jest-spy-friendly, thenable stand-ins. The static schema
   check that used to read `schema.prisma` text (composite-FK invariants from AIS-SEC-003 /
   DEC-0009) now reads the Drizzle schema source files instead
   (`apps/api/src/db/tenant-isolation-schema.spec.ts`).
6. **Removal**: `@prisma/client` and `prisma` dropped from `apps/api/package.json`; the
   `"prisma"` schema-path config block removed; `apps/api/prisma/` (schema + migrations) and
   `apps/api/src/prisma/` (service + module) deleted outright, not deprecated in place.

### What stays out of scope for Round 1 (later round, per the staged execution plan)

Phase 5-7 of AIS-EPC-004 — actually moving Demo Operations' data rows out of `public` into a
runtime-resolved `pgSchema(customerRootSchemaName)`, settings inheritance walking
`tenant_closure`, and reporting's dataset provider reading from the data-plane schema — is
**not** part of this decision. Demo Operations and reporting are on Drizzle now, but they still
read/write `public` exactly as DEC-0010 left them (Phase 1-4 foundation only: the closure table
and schema registry exist and are populated by real tenant-creation code paths, but no table has
moved schema yet). DEC-0010 §7's data-plane resolver (`TenantScopeService`) exists and is
Drizzle-native, but nothing calls it to redirect a query at a runtime schema yet — that wiring is
Phase 5 work, staged for a separate review checkpoint.

### Why a single consolidated baseline migration, not eight replayed migrations

The eight Prisma migrations (`0001`-`0008`) represent incremental schema evolution during
development, not a deployed production history — DEC-0010's own "Consequences" section already
noted this project has no deployed production data. Replaying eight migrations' worth of
`ALTER TABLE` history as Drizzle SQL would preserve a migration narrative nobody needs to run
against real data, at the cost of a much larger and harder-to-audit migration set. A single
baseline reflecting the schema's current, already-hardened shape (composite FKs included) is
simpler to read, simpler to verify, and simpler for a fork to reason about on day one.

### Verification performed before accepting this decision

- `pnpm run typecheck` — clean across both `apps/api` and `apps/web`, including
  `noUncheckedIndexedAccess` (every single-row destructure from a Drizzle `.returning()`/`.select()`
  result wrapped through a shared `assertRow()` helper rather than silently trusting a `T |
  undefined`).
- `pnpm run test` — 10 suites / 59 tests passing, including the migrated Prisma-mock specs and
  the relocated tenant-isolation composite-FK check.
- `pnpm run lint` — clean.
- Live disposable Postgres (`postgres:16-alpine`) run end to end: `drizzle-kit migrate` against a
  fresh database applies the baseline cleanly (33 FK constraints, correctly ordered after their
  unique-constraint targets); booting the API triggers `BootstrapService.onModuleInit`, which
  bootstraps the initial system admin from env, then runs the demo seed — creating the
  `PLATFORM_ROOT` and `Demo Tenant` / `Demo Region` / `Demo Operating Unit` hierarchy, writing
  `tenant_closure` rows for all four tenants, provisioning the demo customer root's schema
  (`customer_schema_registry.status = ACTIVE`, physical `cust_demo_tenant_<fingerprint>` schema
  created), and seeding demo definitions/transactions/report artifact. A second boot against the
  same database is idempotent — no duplicate tenants, users, transactions, or registry rows; the
  already-bootstrapped guard and every `onConflictDoUpdate`/`onConflictDoNothing` upsert behaved
  as designed.

## Consequences

- Positive: one ORM, one migration tool, one query-builder idiom, one test-mocking pattern across
  the entire API — the two-ORM cognitive cost DEC-0010 §8 explicitly accepted as a tradeoff is
  gone.
- Positive: the data-plane resolver's eventual runtime-schema queries (Phase 5) and every
  control-plane query now share the same client and connection pool — no second `PrismaClient`
  instance, no second connection-pool sizing decision to make.
- Positive: `noUncheckedIndexedAccess` is now enforced end to end on every DB read, which Prisma's
  generated types did not surface the same way — the `assertRow()` pattern makes "this row must
  exist" an explicit, auditable assertion instead of an implicit generated-type guarantee.
- Negative: schema definitions are hand-written `pgTable` calls instead of Prisma's declarative
  `.prisma` DSL — more verbose per table, and composite FKs / partial unique indexes need to be
  spelled out with `foreignKey()`/`unique()` helpers rather than `@@` block attributes. Accepted
  as the cost of a runtime-parameterizable schema story.
- Negative (temporary): this is a large, mechanical diff (every service file, every spec file).
  Reviewers should expect the *shape* of business logic to be unchanged — same validations, same
  error types, same audit log calls — only the persistence calls themselves differ.
- Migration/compatibility impact: `apps/api/prisma/` and `apps/api/src/prisma/` are deleted, not
  deprecated. Any fork or branch still depending on `PrismaService`/`PrismaModule` or the Prisma
  CLI must rebase onto this change; there is no compatibility shim by design (per the amendment's
  explicit "no backwards-compatibility hacks" framing of the migration).

## Alternatives Rejected

- **Keep DEC-0010 §8's split (Prisma control-plane, Drizzle data-plane) and only extend it in
  Phase 5**: this was the standing decision until the amendment explicitly overrode it — rejected
  by AI1 on cognitive-cost-over-project-lifetime grounds, not on any new technical finding about
  Prisma's static schema limitation (that finding was already correct and is unaffected by this
  decision).
- **Replay all eight Prisma migrations as equivalent Drizzle SQL migrations**: rejected — no
  production data to preserve, and a longer migration chain would only make a fresh install or a
  fork's first read of the schema history harder, not safer.
- **Session-level `SET LOCAL search_path` for data-plane tenant switching**: explicitly forbidden
  by the amendment and not evaluated further here — DEC-0010 §7's resolver + runtime-parameterized
  `pgSchema()` remains the intended Phase 5 mechanism.
