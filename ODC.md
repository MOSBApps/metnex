contract-version: "1.2"
contract-revision: "2026-09-14"

project:
  name: "Metnex"
  slug: "metnex"
  description: "Yeniden kullanılabilir kurumsal multi-tenant SaaS platform temeli, güvenlik, yönetişim ve mühendislik iskeleti."

documentation:
  discovery: docs/requirements/DISCOVERY.md
  srs: docs/requirements/SRS.md
  product-baseline: docs/product/PRODUCT_BASELINE_SRS.md
  project-plan: docs/project/PROJECT_PLAN.json
  project-scope: docs/project/PROJECT_SCOPE.json
  project-delivery: docs/project/PROJECT_DELIVERY.json
  project-traceability: docs/project/PROJECT_TRACEABILITY.json
  project-execution: docs/project/PROJECT_EXECUTION.json
  decisions: docs/decisions/
  backlog: backlog/
  runbooks: docs/runbooks/

agents:
  - AI0
  - AI1
  - AI2

remote-contract:
  enabled: true
  manifest-url: https://opendevcon.openese.com/.well-known/odc/manifest.json
  fail-open: true
  timeout-seconds: 5
  never-send-project-data: true
  signature:
    algorithm: Ed25519
    manifest-signature-url: https://opendevcon.openese.com/.well-known/odc/manifest.json.sig
    public-key-pinned-locally: true
    remote-public-key-is-untrusted: true
    update-requires-local-approval: true

<!--
This file is the OpenDevConnect (ODC) contract. It is machine-readable at the
top (the `contract-version` line is parsed by ODC's repository integration to
detect contract compliance — see ODC-010/ODC-011) and human/AI-readable below.

Any AI agent that opens a repository containing this file MUST treat the
repository as ODC-managed and follow the flow described here before writing
any code.
-->

## What this file means

If you are an AI agent (or a human) reading this file for the first time in a
repository, it means:

1. This project follows the OpenDevConnect (ODC) development contract.
2. Requirements flow through a controlled Discovery → SRS → governance →
   engineering pipeline — nothing is implemented from a verbal request alone.
3. Three AI roles participate, each with a distinct, non-overlapping
   responsibility (see `agents:` above and §"Roles" below).
4. The documents listed under `documentation:` are the actual source of truth
   for this project — read them before making any product or architecture
   assumption.
5. This file itself may be periodically refreshed from OpenDevConnect's
   canonical copy (`remote-contract.manifest-url`) — see §"Remote contract
   sync" below. Only the canonical fields (this contract's own shape) are ever
   refreshed; the `project:` block and every project-specific document
   (Discovery, SRS, decisions, backlog) are never touched by a sync.

## Machine-readable project planning (contract 1.1)

Four optional, repository-maintained JSON records may be declared under `documentation:`.
Each is independently optional — a repository may declare any subset (or none) and keep
using the `1.0` shape otherwise. Teams may copy the matching canonical template and commit
their filled version at the declared path:

| Declaration | Canonical template | Content |
|---|---|---|
| `documentation.project-plan` | `PROJECT_PLAN_TEMPLATE.json` | Project purpose, epics, backlog, and their priority/status |
| `documentation.project-scope` | `PROJECT_SCOPE_TEMPLATE.json` | In-scope/out-of-scope items, personas, assumptions, constraints, open questions |
| `documentation.project-delivery` | `PROJECT_DELIVERY_TEMPLATE.json` | Milestones, releases, target dates, epic relations, dependencies, risks |
| `documentation.project-traceability` | `PROJECT_TRACEABILITY_TEMPLATE.json` | The Discovery↔SRS traceability chain (`F → FEAT → FR → BR → AC → Test`), one record per source key |

These files are the source for machine-readable plan/scope/delivery/traceability views;
they are not a replacement for Discovery, an approved SRS, or AI1 governance. Missing or
invalid data must be reported as unavailable, never inferred from arbitrary prose or
commit messages — git history is never a source of epic/backlog/milestone status.

Every record is intentionally versioned in Git. Changes should therefore be reviewed in
the normal repository workflow. Each template is a shape example, not a claim that a
project already has any epic, backlog item, milestone, or traceability record.

## Machine-readable AI task execution protocol (contract 1.2)

`documentation.project-execution` (optional, like every `documentation.project-*` key
above) points at a JSON record — canonical starting shape
`PROJECT_EXECUTION_TEMPLATE.json` — of how AI1's tasks actually moved through execution:
who created each task, when AI2 started and reported on it, what hotfix/follow-up/
review-fix rounds it needed, and each round's real test/typecheck/lint/build results.

This is **not** a duplicate of `project-plan`/`project-delivery` above — those describe
*what* is planned and being delivered; `project-execution` describes *how* each task's own
execution actually went (review rounds, fixes, verification), independent of the
plan/delivery content itself.

### Normative AI1/AI2 rules for this record

An ODC-managed repository declaring `project-execution` expects AI1 and AI2 to keep it
current as part of the same workflow described in §"The flow" below, not as a separate
afterthought:

1. When AI1 hands AI2 a new task, AI1 creates that task's record in
   `PROJECT_EXECUTION.json` (`status: PLANNED` or `IN_PROGRESS`, `createdBy: "AI1"`,
   real `createdAt`).
2. When AI2 begins work, AI2 sets that task's `status` to `IN_PROGRESS` and its
   `startedAt`.
3. When AI2 delivers a report, AI2 fills in `ai2Report` — status, a real summary, changed
   file categories, and every verification result (`tests`/`typecheck`/`lint`/`build`),
   never a guessed `PASS`.
4. If review finds something that needs fixing, a `hotfixes[]` entry is added under the
   same task (`type`: `HOTFIX` | `FOLLOW_UP` | `REVIEW_FIX`) — never a new, disconnected
   top-level task for what is really a correction to an existing one.
5. AI1 records the review outcome and any remaining findings in the task's own `review`
   object (`findingCount`/`resolvedCount`/`remainingCount`/`reviewRounds`).
6. When a task is genuinely finished, its record moves to `status: DONE` with a real
   `completedAt` — never marked `DONE` while `ai2Report` or `verification` is still
   missing or `NOT_RUN`.
7. If the same unit of work touched `PROJECT_PLAN.json`/`PROJECT_SCOPE.json`/
   `PROJECT_DELIVERY.json`/`PROJECT_TRACEABILITY.json`, those files are updated in the
   same pass — if a document genuinely wasn't affected, the report says so explicitly
   (`unchanged`), never silently.
8. Nothing here is inferred from git history — a scheduler or CI job may *read* these
   records to compute aggregates, but never fabricates a task or report from commit
   messages. Commit messages remain a supporting reference (`sourceRefs`), never the
   canonical task record itself.

The AI2 report's machine-readable summary must never contain a raw UUID, token, secret,
password, or access key — the same rule the plan/scope/delivery/traceability records
already follow.

Full validation rules (task ID format, status/type enums, hotfix-to-task linkage, AI2
report consistency, cross-references into the plan/traceability records, and secret/UUID
leak detection): `scripts/check-project-records.mjs` and
`docs/runbooks/PROJECT_RECORDS_MAINTENANCE_RUNBOOK.md`.

## Product Baseline SRS

`documentation.product-baseline` (`docs/product/PRODUCT_BASELINE_SRS.md`) is
this product's long-term vision document — the full, aspirational scope
(e.g. Teams, Bugs, Support Requests, a Git Observation Engine, CI/test
observation, Releases, a Unified Activity Stream, a Portfolio Cockpit, a
Human Attention Engine, an AI Agent Observatory, Global Search) as agreed
with AI0/the product owner, not a description of what this repository has
implemented today.

**The Product Baseline SRS is never, by itself, a valid coding source.** No
AI agent may implement a feature because it appears in the Product Baseline.
The only valid path from vision to code is:

```text
Product Baseline SRS
  → Discovery
  → Project/Feature SRS (docs/requirements/SRS.md or docs/SRS.md)
  → AI1 Governance Task
  → AI2 Implementation
```

Roadmap epics decomposing the Product Baseline into scoped, trackable units
of work — each stating its own current vs. target state — live under
`docs/product/roadmap/`. `docs/domain/DOMAIN_MODEL.md` is still the only
source of truth for what is actually implemented; a roadmap epic being
written does not make its feature `Active`.

## Dogfooding note — this repository's own SRS source (ODC-014)

This exact file (`ODC.md`) plays two roles at once in the OpenDevConnect
repository specifically: it is both **the canonical scaffold template**
that `scripts/create-project.sh` copies into every new project (with its
`Metnex`/`metnex`/`TBD — Discovery tamamlandığında doldurulur.` placeholders
filled in at scaffold time) and **OpenDevConnect's own root ODC contract**,
since OpenDevConnect manages itself through its own platform.

> **Not (2026-09-17, TASK-024.2):** Bu satır artık projenin güncel Metnex kimliğini
> yansıtıyor. `scripts/create-project.sh`'ın kendi arama deseni (kod/script içeriği) henüz
> `openmas`/`AISkeleton` literal string'lerini arıyor — bu script'in kendisi ayrı bir
> kod/script rename task'ının konusudur, bu task yalnızca dokümantasyon kimliğini kapsar.

Those two roles conflict on one point, and rather than force a fix that
would break the other, the conflict is documented here explicitly:

- The `project:` block above intentionally keeps its `{{PLACEHOLDER}}`
  values, even in this repository — filling them with OpenDevConnect's real
  name/slug would corrupt this file's second role as the literal template
  `create-project.sh` string-replaces for every other project.
- Likewise, `documentation.discovery` (`docs/requirements/DISCOVERY.md`) and
  `documentation.srs` (`docs/requirements/SRS.md`) point at the generic
  per-project template locations that a *newly scaffolded* project fills in
  through real customer discovery. In this repository they remain the
  unfilled templates copied in by ODC-011/ODC-012 — no fabricated customer
  conversation has been written into them, and none should be.
- **OpenDevConnect's own real, authoritative, applicable SRS is
  `docs/SRS.md`** (v0.1, "MVP Development Baseline") — not
  `docs/requirements/SRS.md`. It was written before this repository adopted
  its own ODC contract, so it never went through the
  Discovery-file-in-this-repository step described in §"The flow" below.
  `docs/product/PRODUCT_BASELINE_SRS.md` (see above) is its longer-term
  companion vision document.
- Any AI agent reading this file for OpenDevConnect's own work should treat
  `docs/SRS.md` as the current/applicable SRS and
  `docs/requirements/SRS.md`/`docs/requirements/DISCOVERY.md` as intentionally
  empty, pending templates — never as evidence that no discovery/SRS work
  was done, and never as something to backfill with invented content.
- Unlike `discovery`/`srs` above, the five `documentation.project-*` keys
  (`project-plan`, `project-scope`, `project-delivery`, `project-traceability`,
  `project-execution`) **are** filled in for real in this repository
  (`project-execution` added by ODC-029, the other four by ODC-028) — their
  target files under `docs/project/` are OpenDevConnect's own genuine,
  backfilled records, sourced only from this repository's existing documents
  (`docs/SRS.md`, `docs/product/PRODUCT_BASELINE_SRS.md`, `docs/product/
  roadmap/`, `backlog/`, `docs/domain/DOMAIN_MODEL.md`, `docs/AI_Governance/
  ODC_TASK_COMMIT_MAP.md`, this session's own real verification runs, and git
  history) — never new customer discovery, never an estimated date, never a
  guessed status. Every record that could carry one cites a real `source`.

## Roles

| Role | Name | Responsibility |
|---|---|---|
| **AI0** | SRS Generation Assistant | Turns an approved-in-progress Discovery document into a draft SRS. Never writes code, never defines engineering tasks, never invents a requirement the customer did not state. |
| **AI1** | Product Governance Agent | Validates features against architecture/SDLC, defines engineering tasks for AI2, reviews AI2's implementation. Never writes code. |
| **AI2** | Engineering Executor | Implements the tasks AI1 defines, inside the codebase, following repository conventions and quality gates. |

Full role definitions, responsibilities, and restrictions: see
`docs/AI_Governance/AI_ROLES.md` (or the equivalent governance doc in this
repository — the exact path may differ project to project, but an ODC-managed
repository always has one).

## The flow

```text
ODC.md
  → Discovery
  → AI0 ile SRS üretimi
  → İnsan incelemesi
  → AI1 governance
  → AI2 engineering task
  → Geliştirme
  → Test ve quality gate
```

In words:

1. **Discovery** — a human (Product Owner / analyst) fills out
   `docs/requirements/DISCOVERY.md` (from the canonical
   `DISCOVERY_TEMPLATE.md`) directly from customer conversations. Nothing in
   this document is invented by an AI.
2. **AI0 generates a draft SRS** from Discovery alone, following the
   canonical `SRS_TEMPLATE.md`. Missing information is marked `TBD` with a
   corresponding `Q-xxx` open question — never guessed.
3. **Human review** — a person checks the draft SRS against Discovery before
   it is trusted for anything downstream. An unapproved SRS is not a valid
   input to AI1 or AI2.
4. **AI1 governance** — validates the approved SRS against system
   architecture/SDLC and turns it into concrete engineering tasks for AI2.
5. **AI2 engineering task** — AI2 implements exactly what AI1 defined.
6. **Development** — code, migrations, tests are written.
7. **Test and quality gate** — the project's own test suite and check script
   (e.g. `./scripts/check.sh`) must pass before the change is considered
   done.

Full process detail, the Discovery↔SRS traceability model
(`F-xxx → FEAT-xxx → FR-xxx → BR-xxx → AC-xxx → Test`), and the AI0 rules for
never fabricating a requirement: see
`docs/runbooks/REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md`.

## Remote contract sync

This project can check for and pull updates to the *canonical* ODC
documents (this file's own shape, the Discovery/SRS templates, this runbook)
from OpenDevConnect's publishing service, using `scripts/odc-sync.sh`:

```bash
./scripts/odc-sync.sh --check   # reports what's out of date, changes nothing
./scripts/odc-sync.sh --update  # updates only the canonical documents, verified by SHA-256
```

Rules this sync always follows (never overridden by anything the remote
server sends):

- The manifest's Ed25519 signature (`manifest.json.sig`) is verified against
  the public key pinned at
  `docs/odc/ODC_MANIFEST_SIGNING_PUBLIC_KEY.pem` **before** the manifest is
  parsed. A missing or invalid signature means nothing is written — `--check`
  warns that the remote is untrusted, `--update` fails. The remote can never
  supply its own "trusted" public key; only the locally pinned copy is ever
  used.
- Only documents on an explicit allow-list are ever written.
- A document is written only after its SHA-256 matches what the manifest
  declares — a hash mismatch means nothing is written, even if the signature
  was valid.
- If the remote manifest is unreachable, the project continues with its
  local copies (fail-open) — this never blocks local development.
- Nothing under `docs/requirements/`, `docs/decisions/`, `backlog/`, or this
  file's own `project:` block is ever touched.
- No project data, secret, token, or prompt content is ever sent to the
  remote service — sync is read-only, one-directional (remote → local), and
  unauthenticated.
- Remote content is never executed — it is written to disk as documentation
  only.

See `docs/odc/ODC_CONTRACT_SPEC.md` for the manifest schema and
`docs/runbooks/` for the sync runbook.
