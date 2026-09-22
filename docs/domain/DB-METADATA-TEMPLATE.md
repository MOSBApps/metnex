# Open Mas — Database Metadata Template

> Fill this file to make the database model self-describing for humans and AI agents.
> This is a project template, not the live source of truth. The live document should become `docs/domain/DB_META.md`.

---

## 1. Document Control

- Project Name: `Open Mas`
- Project Slug: `metnex`
- Owner: `<team-or-person>`
- Last Updated: `<YYYY-MM-DD>`
- Version: `<vX.Y.Z>`
- Environments: `dev / test / prod`

## 2. System Summary

- DB Engine: `<PostgreSQL 16+ etc.>`
- ORM / Query Layer: `<Drizzle / Prisma / TypeORM / raw SQL>`
- Migration Runner: `<path and command>`
- Tenant Model: `<schema-per-tenant / row-level / single-tenant>`
- Main Schemas: `<platform/shared/<tenant_slug> etc.>`

## 3. Environment Matrix

| Environment | Host | Database | User | Schema Model | Notes |
|---|---|---|---|---|---|
| dev | `<host>` | `<db>` | `<user>` | `<model>` | `<notes>` |
| test | `<host>` | `<db>` | `<user>` | `<model>` | `<notes>` |
| prod | `<host>` | `<db>` | `<user>` | `<model>` | `<notes>` |

## 3A. Locale & Collation

> **Mandatory before data modelling:** fill this section and create `docs/decisions/DEC-NNNN-db-locale.md`.

- Primary Product Language: `tr-TR`
- Database Locale Provider: `icu`
- Database ICU Locale: `{{DB_ICU_LOCALE}}` (example: `tr-TR`)
- Default Database Collation Strategy: `{{DB_QUERY_COLLATION}}` (example: `tr-x-icu`)
- App-layer Sort Locale: `{{APP_SORT_LOCALE}}` (example: `'tr'`)
- Query-level Collation Exceptions: `<none / list exceptions>`
- UNIQUE/index Collation Exceptions: `<email, slug => C>`
- Environment Parity Note: `dev / test / prod must expose the same collation behavior`
- Compose Guardrail: `POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale={{DB_ICU_LOCALE}} --encoding=UTF8"`
- Verification Script: `./scripts/db/verify-db-locale.sh`

## 4. Schema Inventory

### 4.1 Core Schema

Describe platform-level tables, auth, tenant metadata, audit logs, queues, or shared platform entities.

| Table | Purpose | PK | Critical Columns | Main FK Relations |
|---|---|---|---|---|
| `<table_name>` | `<description>` | `<id>` | `<cols>` | `<relations>` |

### 4.2 Shared Schema (Optional)

Describe shared templates, taxonomies, reference data, or immutable seed content.

| Table | Purpose | Notes |
|---|---|---|
| `<table_name>` | `<description>` | `<seed / readonly / imported>` |

### 4.3 Tenant Schema

Describe tenant-owned operational modules.

| Table | Module | Purpose | Critical Fields | FK / Constraints |
|---|---|---|---|---|
| `<table_name>` | `<module>` | `<description>` | `<fields>` | `<rules>` |

## 5. Module-by-Module Data Model

### Module: `<MODULE_NAME>`

- Owning Team: `<team>`
- Source Tables:
  - `<schema.table_a>`
  - `<schema.table_b>`
- Records Produced: `<ref_no / events / outputs>`
- State Machine: `<OPEN -> IN_PROGRESS -> VERIFIED>`
- Write Ownership: `<which service writes>`
- Read Ownership: `<which modules consume>`

## 6. Critical Relationships

1. `<A>` -> `<B>` -> `<C>`
2. `<Risk>` -> `<Control>` -> `<Assessment>`
3. `<AuditFinding>` -> `<Action>` -> `<Verification>`

## 7. Constraints and Integrity Rules

### Unique Constraints

| Table | Constraint | Columns | Business Rule |
|---|---|---|---|
| `<table>` | `<uq_name>` | `<col_a,col_b>` | `<meaning>` |

### Check Constraints

| Table | Constraint | Rule | Meaning |
|---|---|---|---|
| `<table>` | `<ck_name>` | `<expression>` | `<meaning>` |

### Index Inventory

| Table | Index | Type | Columns | Why |
|---|---|---|---|---|
| `<table>` | `<idx_name>` | `<btree/gin/...>` | `<cols>` | `<query/perf reason>` |

## 8. Migration Register

| File | Date | Summary | Backward Impact | Idempotent |
|---|---|---|---|---|
| `<000_init.sql>` | `<YYYY-MM-DD>` | `<summary>` | `<low/med/high>` | `<yes/no>` |

## 9. Seed / Reference Data Policy

- Seed Source: `<file/command/service>`
- Idempotency Strategy: `<ON CONFLICT / guard query / merge>`
- Environment Differences: `<dev/test/prod>`
- Tenant Application Order: `<shared -> tenant>`

## 10. Security / Privacy / Retention

- PII Fields: `<table.column list>`
- Sensitive Fields: `<password_hash, token, secret>`
- Encryption / Hashing Approach: `<bcrypt / app-layer encryption / KMS>`
- Audit Logging Coverage: `<which operations>`
- Retention:
  - App Data: `<duration>`
  - Logs: `<duration>`
  - Backups: `<duration>`

## 11. Operational SQL Checks

```sql
SELECT * FROM platform._migration_log ORDER BY applied_at DESC LIMIT 20;
SELECT current_database(), datlocprovider, daticulocale
FROM pg_database
WHERE datname = current_database();
```

## 12. Change Log

| Date | By | Summary | Related PR / Commit |
|---|---|---|---|
| `<YYYY-MM-DD>` | `<name/agent>` | `<summary>` | `<id>` |

## 13. TODO Checklist

- [ ] Locale & collation decision recorded with real values
- [ ] `DEC-NNNN-db-locale.md` created
- [ ] `verify-db-locale.sh` passes on first cluster start
- [ ] All schemas are correctly named and documented
- [ ] Migration index is current
- [ ] Security / retention section is complete
