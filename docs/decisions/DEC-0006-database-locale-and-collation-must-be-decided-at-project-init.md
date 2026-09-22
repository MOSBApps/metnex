# DEC-0006 — Database Locale and Collation Must Be Decided at Project Initialization

**Date:** 2026-03-25
**Status:** Accepted
**Deciders:** Product Governance + Engineering

---

## Context

Derived projects frequently defer DB locale/collation decisions until after schema and UI work starts.
That leads to late discovery of sorting, search, UNIQUE, and index behaviour defects.

`datlocprovider` cannot be changed after DB creation without dump + recreate + restore.
Because of that, locale/collation is a project-init decision, not a post-launch optimization.

---

## Decision

A project cloned from this skeleton is not ready for data modelling until the following are explicitly decided and recorded:

| Decision | Example |
|---|---|
| Primary product language | `Turkish (tr-TR)` |
| Database locale provider | `icu` |
| Database ICU locale | `tr-TR` |
| Query collation strategy | `tr-x-icu` |
| Query-level exceptions | `email / slug => C` |
| App-layer sort locale | `localeCompare('tr')` |

Required artifacts:

1. `docs/domain/DB_META.md § Locale & Collation`
2. a project-specific decision record: `docs/decisions/DEC-NNNN-db-locale.md`
3. working guardrail in compose/init: `POSTGRES_INITDB_ARGS`
4. successful verification via `./scripts/db/verify-db-locale.sh`

---

## Consequences

- New environments must be created with ICU locale from the start.
- Dev/test/prod must use the same PostgreSQL image family and ICU support.
- User-visible text ordering must use the declared project collation.
- App-layer sorting must use the matching locale.
- Non-compliant environments must be rebuilt using `./scripts/db/recreate-db-with-icu.sh`.

---

## Implementation Checklist

- [ ] `docs/domain/DB_META.md` locale section filled with real values
- [ ] project-specific `DEC-NNNN-db-locale.md` created
- [ ] `POSTGRES_INITDB_ARGS` added to compose/init files
- [ ] `verify-db-locale.sh` PASS on first cluster start
- [ ] `db-collation-strategy.md` reviewed for the chosen locale

---

## Related

- `docs/domain/DB_META.md`
- `docs/runbooks/db-collation-strategy.md`
- `docs/runbooks/db-recreate-with-icu.md`
