# Architecture Rules

This document defines architectural rules that must be respected by all AI agents and human contributors when modifying the system.

These rules ensure that the platform remains maintainable, modular, and scalable as new modules and capabilities are introduced.

---

# Architectural Principles

All implementations must follow these core principles:

1. Prefer **simple solutions first**.
2. Avoid unnecessary architectural complexity.
3. Maintain **clear module boundaries**.
4. Prefer **extending existing modules** rather than creating new ones.
5. Ensure **loose coupling between modules**.
6. Keep domain models consistent.

In addition to the general architecture rules above, all implementations must follow the
canonical application security contract in:

`docs/security/APPLICATION_SECURITY_ARCHITECTURE.md`

This is mandatory for:

* authentication assumptions
* permission naming
* menu vs CRUD separation
* tab/section authorization
* row-level boundary enforcement
* legacy role fallback restrictions

All new CRUD-oriented management screens must also follow:

`docs/AI_Governance/CRUD_SCREEN_STANDARD.md`

All new first-class modules must also follow:

`docs/AI_Governance/MODULE_DASHBOARD_STANDARD.md`

---

# Module Boundaries

Each module represents a **domain capability**.

Modules should:

* own their domain entities
* expose clear services or APIs
* avoid direct database coupling with other modules

Cross-module communication should happen through:

* service interfaces
* application services
* domain events (when appropriate)

---

# Domain Model Rules

Domain entities must:

* represent real business concepts
* have clear ownership
* avoid duplication across modules

If a new feature needs an entity that already exists in another module, prefer **extending the existing entity**.

---

# Module Creation Rule

Before creating a new module, contributors must verify:

1. The capability does not already belong to an existing module
2. The feature cannot be implemented as an extension
3. The domain is sufficiently independent

Creating new modules unnecessarily increases system complexity and must be avoided.

---

# Integration Rules

Modules must integrate through **well-defined boundaries**.

Preferred integration patterns:

* service layer calls
* domain services
* application orchestration

Avoid:

* direct database access across modules
* hidden dependencies

If an endpoint creates a record in another bounded context, the target context's
`CREATE` permission must also be enforced. Source module `UPDATE` permission alone is not sufficient.

---

# Data Ownership

Each module must own its data models.

Other modules may reference these entities but should not mutate them directly without going through the owning module's service layer.

---

# Backward Compatibility

New changes must preserve compatibility with existing workflows whenever possible.

Breaking changes require:

* migration strategy
* versioning plan

---

# Refactoring Rules

Large refactors must be approved by the governance layer (AI1).

Small improvements that:

* improve readability
* reduce duplication
* simplify logic

are encouraged.

---

# Architecture Authority

AI1 (Product Governance Agent) acts as the architectural authority.

All major architectural decisions must pass AI1 review.

---

## Database Locale & Collation Rule

**If the project's user-facing content includes non-ASCII text (names, titles, descriptions),
the DB locale/collation decision is a mandatory architecture input.**

Rules:

1. The decision must be recorded before any data model or sort behaviour is designed.
2. Source of truth: `docs/domain/DB_META.md § Locale & Collation`.
3. Decision record: `docs/decisions/DEC-NNNN-db-locale.md` (use `DB-METADATA-TEMPLATE.md` as starting point).
4. `datlocprovider` cannot be changed after DB creation — **decide at init, not later**.
5. All `ORDER BY` on user-visible text columns must use the project's declared collation.
6. App-layer sort (Node.js / browser) must use the matching locale: `localeCompare('<lang>')`.
7. Environment parity: dev/test/prod must use the same PostgreSQL image and ICU support.
8. **New environments must be provisioned with `POSTGRES_INITDB_ARGS` guardrail** — see compose files.
9. **DB locale must be verified with `./scripts/db/verify-db-locale.sh` before the environment is declared ready.**
10. Non-compliant environments (libc locale) must be remediated with `./scripts/db/recreate-db-with-icu.sh`.

See: [DEC-0006](../decisions/DEC-0006-database-locale-and-collation-must-be-decided-at-project-init.md) | [db-collation-strategy.md](../runbooks/db-collation-strategy.md) | [db-recreate-with-icu.md](../runbooks/db-recreate-with-icu.md)
