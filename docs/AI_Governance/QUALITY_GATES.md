# Quality Gates

This document defines mandatory local quality gates before push.

---

## Mandatory Pre-Push Gate

For every implementation task, **AI2 (Engineering Executor)** must run:

```bash
./scripts/check.sh
```

If Docker is unavailable, this fallback is allowed:

```bash
./scripts/check.sh --skip-docker
```

---

## Gate Policy

1. `check.sh` must complete successfully.
2. If `check.sh` fails, push is not allowed.
3. AI2 must fix issues first, then rerun `check.sh`.
4. A successful run means the branch is technically ready, not that AI2 is automatically allowed to write git history.
5. `git commit` requires explicit user instruction.
6. `git push` requires explicit user instruction.

---

## Evidence Requirement

AI2 completion report must include:

1. Command used (`./scripts/check.sh` or `--skip-docker`)
2. Result (`pass`/`fail`)
3. If failed initially: short fix summary + successful rerun confirmation

---

## PR Checklist — Dropdown Policy

If the PR contains form pages or list screens:

- [ ] Dropdown/combobox kaynak endpointi `q` **ve** `page` parametresi destekliyor mu?
- [ ] `onSearch` prop'u yeni imzayı kullanıyor mu? `(q, page) => Promise<{ options, hasMore }>`
- [ ] Dropdown açılışında default results geliyor mu (q='' ile ilk sayfa)?
- [ ] Sonuç listesinin altına scroll yapınca sonraki sayfa yükleniyor mu (infinite scroll)?
- [ ] FE'de debounce (250–400ms, sadece search input için) uygulanmış mı?
- [ ] `api.*.list({})` anti-pattern yok mu?
- [ ] `limit: 500` kullanımı varsa `// DROPDOWN-POLICY-EXCEPTION:` yorumu mevcut mu?
- [ ] Loading / empty / error state'leri ele alınmış mı?
- [ ] Hiyerarşik ağaç / kapsam istisnası varsa `// DROPDOWN-POLICY:` yorumu mevcut mu?

See: `DROPDOWN_DYNAMIC_LOADING_POLICY.md`

---

## PR Checklist — CRUD Screen Standard

If the PR introduces or materially redesigns a CRUD data-entry screen:

- [ ] Main entry screen is list + filters
- [ ] Create, edit, delete are initiated from the list screen
- [ ] Create/edit use a dedicated detail screen
- [ ] Detail screen separates main properties from related-data tabs
- [ ] Each tab has an explicit permission note
- [ ] Dropdown filters follow `DROPDOWN_DYNAMIC_LOADING_POLICY.md`
- [ ] Any deviation from `CRUD_SCREEN_STANDARD.md` is explicitly documented

See: `CRUD_SCREEN_STANDARD.md`

---

## PR Checklist — Module Dashboard Standard

If the PR introduces a new module or first-class module navigation:

- [ ] The first menu surface is a module dashboard, or an explicit exception is documented
- [ ] Dashboard has a top information-card section
- [ ] Dashboard has a lower graph/trend/distribution section, or an explicit placeholder rationale
- [ ] Dashboard permission visibility is explicitly stated
- [ ] Relationship between dashboard and CRUD/list screens is documented
- [ ] Any deviation from `MODULE_DASHBOARD_STANDARD.md` is explicitly documented

See: `MODULE_DASHBOARD_STANDARD.md`

---

## Documentation Gate

Before marking a task complete, verify:

- [ ] New module or entity? → `docs/domain/DOMAIN_MODEL.md` updated
- [ ] Schema/migration added? → `docs/domain/DB_META.md` migration index updated
- [ ] New operational procedure? → file added under `docs/runbooks/` + `docs/README.md` index row added
- [ ] Policy/architecture rule changed? → `docs/AI_Governance/` file updated
- [ ] Auth/security model changed? → `docs/security/APPLICATION_SECURITY_ARCHITECTURE.md` updated
- [ ] Significant architectural decision? → new `docs/decisions/DEC-NNNN-*.md` + `docs/README.md` row
- [ ] Module or route removed? → `docs/AI_Governance/DEPRECATED_MODULES.md` entry added

---

## Project Initialization Gate

For **new projects** (first commit or skeleton clone), the following must be resolved before any data model work:

- [ ] Primary app language declared
- [ ] DB locale/collation strategy decided and recorded in `docs/domain/DB_META.md § Locale & Collation`
- [ ] Decision record created: `docs/decisions/DEC-NNNN-db-locale.md`
- [ ] ICU collation availability verified on target PostgreSQL image
- [ ] Environment parity confirmed (dev/test/prod same image)
- [ ] App-layer sort locale set (`localeCompare('<lang>')` in frontend + Node.js)
- [ ] `POSTGRES_INITDB_ARGS` set in all compose files (dev + infra)
- [ ] `./scripts/db/verify-db-locale.sh` returns PASS on first cluster start

> **Rationale (DEC-0006):** `datlocprovider` cannot be changed after DB creation.
> Sorting, UNIQUE, and index behaviour all depend on collation. Deciding late is expensive.
>
> See: `docs/runbooks/db-collation-strategy.md`

---

## DB Locale Verify Gate

For any task that provisions a new environment or modifies DB infrastructure:

- [ ] `./scripts/db/verify-db-locale.sh` returns PASS
- [ ] If FAIL: `./scripts/db/recreate-db-with-icu.sh --dry-run` reviewed first, then real run executed
- [ ] Restore verified with smoke check before declaring environment ready
- [ ] Prod execution preceded by successful dev + test dry-run

> Environment is **not ready** until locale verify returns PASS.
> See: `docs/runbooks/db-recreate-with-icu.md`

See: `docs/README.md` for the full documentation map and category guidance.

---

## Status & External Reporting Gate

Before marking any task complete, AI1/AI2 must confirm all of the following
(see `AGENT_BOOTSTRAP.md` Reporting Rule and
`docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` §4, §6, §7):

- [ ] The relevant `backlog/EPIC-*.md` (or Feature/Story/Task) `status` field
      is updated to one of `backlog | ready | in_progress | review | blocked | done`
- [ ] That file's `srs_refs` frontmatter field is present and points back into
      the traceability chain (`F-xxx → FEAT-xxx → FR-xxx → BR-xxx → AC-xxx → TC-xxx`)
- [ ] `docs/opendevcon/METNEX_STATE.md` is updated (`stage`, `active_epics`,
      `blocked_epics`, `updated_at`, `updated_by`)
- [ ] A new entry is appended to `docs/opendevcon/PROGRESS_LOG.md` (append-only
      — prior entries are never edited or removed)

A task missing any of these four items is **not complete**, regardless of
`check.sh` passing.

---

## Authorization Gate

If a task changes authorization behavior, completion is blocked until all of the following are explicit:

- [ ] Menu visibility and CRUD/action permissions are separated
- [ ] Read endpoints have explicit `VIEW` guards or a documented exception
- [ ] Write endpoints have explicit action guards
- [ ] Frontend uses permission checks instead of JWT role or `additionalRoles` shortcuts
- [ ] Row-level boundary is described for the affected surface
- [ ] Permission matrix is included in the delivery report

---

## Scope

`check.sh` currently executes:

1. `pnpm audit --audit-level=high`
2. `pnpm run typecheck`
3. `pnpm run lint`
4. `pnpm run test`
5. `pnpm run build`
6. Docker builds for API and Web (unless `--skip-docker`)

This is the repository's minimum SDLC quality baseline for local push readiness.
