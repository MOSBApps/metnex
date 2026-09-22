contract-version: "1.0"
contract-revision: "2026-09-10"

project:
  name: "OpenSMS"
  slug: "web-api"
  description: "TBD — Discovery tamamlandığında doldurulur."

documentation:
  discovery: docs/requirements/DISCOVERY.md
  srs: docs/requirements/SRS.md
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
