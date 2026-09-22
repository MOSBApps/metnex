# DEC-0007 — metnex Database Locale and Collation

**Date:** 2026-04-22
**Status:** Accepted
**Deciders:** Repository Maintainer

---

## Context

`metnex` now contains an implemented SaaS foundation with Turkish operator-facing copy, user-visible tenant and user names, sortable admin tables, and Docker-based local/server environments.

The generic policy in DEC-0006 requires every derived project to record its own concrete locale and collation choice. Until now, `metnex` still had placeholder metadata even though its local Docker setup had already standardized on ICU Turkish.

---

## Decision

`metnex` adopts the following locale/collation strategy:

| Decision | Value |
|---|---|
| Primary product language | `Turkish (tr-TR)` |
| Database locale provider | `icu` |
| Database ICU locale | `tr-TR` |
| Database encoding | `UTF8` |
| Query collation strategy | `tr-x-icu` when explicit user-visible ordering needs query-level collation |
| App-layer sort locale | `localeCompare('tr')` / `localeCompare('tr-TR')` |
| Locale-neutral uniqueness fields | `email`, `slug`, token/hash fields |

Implementation guardrail:
- Local Docker Postgres must be initialized with `POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=tr-TR --encoding=UTF8"`.

Environment parity rule:
- `dev`, `test`, and `prod` must all use PostgreSQL images with ICU support enabled.

---

## Why this decision

1. Turkish lexical ordering is part of the expected operator experience.
2. The repository already uses Turkish copy and Turkish-formatted dates/numbers.
3. ICU Turkish avoids late surprises around `İ/I`, `Ş/ş`, `Ç/ç`, `Ö/ö`, `Ü/ü`.
4. Deciding now is cheaper than repairing a larger deployed schema later.

---

## Consequences

### Positive

- Local environments and future derived environments have one explicit DB initialization rule.
- User-visible sorts can be implemented against a declared language model.
- Governance documents now match actual local Compose behavior.

### Constraints

- Existing databases created without ICU Turkish are non-compliant and must be rebuilt/restored using the remediation runbook.
- App-layer sorting must not use default JavaScript sort for user-visible Turkish text.
- Future compose and infrastructure changes must preserve the ICU initialization guardrail.

---

## Enforcement

The decision is currently enforced in these places:

- `infra/docker/docker-compose.dev.yml` via `POSTGRES_INITDB_ARGS`
- `docs/domain/DB_META.md`
- `docs/runbooks/db-collation-strategy.md`
- `docs/runbooks/db-recreate-with-icu.md`

Verification command:

```bash
./scripts/db/verify-db-locale.sh
```

---

## Follow-up

- Keep `docs/domain/DB_META.md` updated if schema or migration inventory changes.
- If query-level `COLLATE "tr-x-icu"` becomes a hard application requirement in Prisma queries, document the exact pattern in backend code guidelines.
