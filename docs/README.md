# Metnex — Documentation Map

> This index describes Metnex's documentation architecture.

---

## Categories

| Symbol | Category | Purpose |
|--------|----------|---------|
| 🏛 | Governance Policy | Rules contributors and agents must follow |
| 🗺 | Domain Contract | Live system and data model source of truth |
| 📋 | Runbook | Operational procedures |
| 📌 | Decision Record | Architectural decisions and rationale |
| 📦 | Backlog | Planning-only artifacts |
| 🎓 | Training | End-user guides |
| 🔒 | Security | Security process and templates |
| 🎨 | UI Contract | Binding frontend design and interaction contract |
| 🚫 | Deprecated | Removed modules and compatibility notes |
| 📡 | External Reporting | Non-AI status surface for external tools (e.g. OpenDevConnect) |

---

## AI Governance (`docs/AI_Governance/`)

Start here when working in the repository.

| File | Purpose |
|---|---|
| `AGENT_BOOTSTRAP.md` | Shared governance entrypoint |
| `AI1_BOOTSTRAP_PROMPT.md` | Direct startup prompt for AI1 |
| `AI2_BOOTSTRAP_PROMPT.md` | Direct startup prompt for AI2 |
| `AI_ROLES.md` | Role definitions |
| `ARCHITECTURE_RULES.md` | Architecture boundaries and anti-patterns |
| `CRUD_SCREEN_STANDARD.md` | Canonical CRUD information architecture: list + filters, detail screen, tabs, per-tab authorization |
| `MODULE_DASHBOARD_STANDARD.md` | Canonical first menu surface for new modules: dashboard with top info cards and lower graph cards |
| `QUALITY_GATES.md` | Required validation gates |
| `DROPDOWN_DYNAMIC_LOADING_POLICY.md` | Form/dropdown policy |
| `DEPRECATED_MODULES.md` | Deprecated module/runbook template |

---

## UI Contract (`docs/ui-contract/`)

Binding frontend/UI contract. Read this before implementing any screen or component.

| File / Folder | Purpose |
|---|---|
| `ui-contract/UI_CONTRACT.md` | Master index, bootstrap checklist, override mechanism |
| `ui-contract/foundations/` | Semantic tokens and immutable visual foundations |
| `ui-contract/patterns/` | Canonical screen patterns: layout, CRUD, dashboard, form, table, modal/drawer |
| `ui-contract/components/` | Component-level behavior rules |
| `ui-contract/governance/override-rules.md` | How UI overrides are justified and approved |
| `ui-contract/governance/deviation-log.md` | Approved UI deviations log |

---

## Domain (`docs/domain/`)

| File | Purpose |
|---|---|
| `DOMAIN_MODEL.md` | Live domain source of truth |
| `DB_META.md` | Live database source of truth, including selected app language and DB collation |
| `DB-METADATA-TEMPLATE.md` | Starter template for initializing `DB_META.md` with locale/collation decisions |

---

## Runbooks (`docs/runbooks/`)

| File | Purpose |
|---|---|
| `deployment.md` | Canonical deployment runbook |
| `AI_KEY_ROTATION_RUNBOOK.md` | AI key rotation procedure (optional if AI exists) |
| `db-collation-strategy.md` | DB locale/collation decision and verification runbook |
| `db-recreate-with-icu.md` | ICU locale remediation and restore runbook |
| `local-development.md` | macOS native, Linux native, and Windows WSL2 Debian local setup and script compatibility guide |
| `platform-operations.md` | System-admin audit/performance operations runbook |
| `reporting-foundation.md` | Report artifact registry, dataset provider abstraction, and Jasper renderer (`services/jasper-renderer/`) HTTP contract/operations |
| `REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` | Discovery-to-approved-SRS process and document rules |
| `METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` | Post-SRS lifecycle stages and machine-readable status contract |
| `PRODUCT_OWNER_LIFECYCLE_PLAYBOOK.md` | Human (PO/Chief Engineer) end-to-end action checklist, discovery to continuous development |
| `MFA_ENFORCEMENT_ROUTE_MATRIX.md` | MFA enforcement guard route matrix, exemptions, rollout strategy (TASK-027.48) |

---

## External Reporting (`docs/opendevcon/`)

Non-AI status surface. External tools (e.g. OpenDevConnect / ODC) and AI
agents (AI1, AI2) read/write here to report project status without
requiring an AI to interpret the codebase.

| File | Purpose |
|---|---|
| `README.md` | Explains the reporting surface and update obligation |
| `METNEX_STATE.md` | Single-source current stage/status snapshot |
| `PROGRESS_LOG.md` | Append-only agent session log |

Process: `docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md`. Note:
the `ODC.md` contract file itself lives at the **repo root**, not here.

---

## Decisions (`docs/decisions/`)

| File | Purpose |
|---|---|
| `DEC-0000-template.md` | Decision record template |
| `DEC-0001-documentation-architecture.md` | Baseline docs architecture decision |
| `DEC-0006-database-locale-and-collation-must-be-decided-at-project-init.md` | Project-init DB locale/collation decision rule |
| `DEC-0007-metnex-db-locale-and-collation.md` | metnex-specific DB locale/collation decision |
| `DEC-0008-package-provisioned-demo-and-reporting-foundation.md` | Package entitlement, demo module, and reporting foundation decision |
| `DEC-0009-shared-schema-tenant-isolation-hardening.md` | Composite tenant FK hardening for the shared-schema multi-tenancy model |
| `DEC-0012-demo-operations-removal.md` | Demo Operations module removal — kept the generic Jasper render adapter and dataset provider abstraction |
| `DEC-0013-jasper-renderer-service.md` | Jasper renderer provisioned as a standalone Maven/Spring Boot service (`services/jasper-renderer/`) |
| `DEC-0015-wave5-hourly-consumption-and-scada-decisions.md` | Wave 5 Hourly Consumption ve SCADA karar kapanışları (Q-W501–W515, Q-SC/SP/SA/SR, Q-M05, Q-E04): delta semantiği, katalog control-plane, canlı sorgu, audit sözleşmesi, redaction |
| `DEC-0016-scada-catalog-verification-and-physical-identity.md` | SCADA katalog: kontrollü read-only preflight doğrulaması (UNVERIFIED→VERIFIED) ve fiziksel database adı ↔ opaque katalog kimliği ayrımı |

---

## Backlog (`docs/backlog/`)

Planning-only templates. These are not live behavior docs.

| File | Purpose |
|---|---|
| `ARCHITECTURE_BACKLOG_TEMPLATE.md` | Architecture backlog template |
| `FEATURE_RELEASE_PLAN_TEMPLATE.md` | Release plan template |
| `DEPENDENCY_MAP_TEMPLATE.md` | Dependency map template |
| `AI_MODULE_BACKLOG_TEMPLATE.md` | Optional AI backlog template |

---

## Training (`docs/training/`)

Role-based user guides and training scenarios.

---

## Security (`docs/security/`)

Threat models, pentest/DAST templates, security checklists, risk registers, and the mandatory application security contract for derived projects.

| File | Purpose |
|---|---|
| `security/README.md` | Security docs index |
| `security/APPLICATION_SECURITY_ARCHITECTURE.md` | Mandatory auth/permission architecture contract for derived projects |

---

## Documentation Update Rules

When a task changes source-of-truth behavior:
1. New entity/module -> update `docs/domain/DOMAIN_MODEL.md`
2. Schema/migration change -> update `docs/domain/DB_META.md`
2a. Project initialization must record app language, DB locale provider, and DB collation in `docs/domain/DB_META.md`
3. Operational change -> update `docs/runbooks/`
4. Architectural decision -> add `docs/decisions/DEC-NNNN-*.md`
5. Policy change -> update `docs/AI_Governance/`
5a. New screen/pattern/component contract -> update `docs/ui-contract/`
5b. UI override (Seviye 3) -> update `docs/ui-contract/governance/deviation-log.md`
6. Auth/security model change -> update `docs/security/APPLICATION_SECURITY_ARCHITECTURE.md`
7. Deprecated/removed surface -> update `docs/AI_Governance/DEPRECATED_MODULES.md`
8. Any task completion (always) -> update `docs/opendevcon/METNEX_STATE.md` and append `docs/opendevcon/PROGRESS_LOG.md`
