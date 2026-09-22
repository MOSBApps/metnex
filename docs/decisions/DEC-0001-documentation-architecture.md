# DEC-0001 — Documentation Architecture Categories

**Date:** 2026-03-13
**Status:** Accepted
**Deciders:** Repository Maintainer

---

## Context
New projects cloned from this skeleton need a predictable source-of-truth structure so AI and human contributors can work with minimal prior context.

## Decision
Documentation is split into fixed categories:
- `docs/AI_Governance/` for policies and contribution rules
- `docs/domain/` for live domain and database truth
- `docs/runbooks/` for operational procedures
- `docs/decisions/` for architectural decisions
- `docs/backlog/` for planning-only artifacts
- `docs/training/` for end-user training
- `docs/security/` for security material

## Consequences
- Positive: Faster agent onboarding and less chat-history dependency
- Positive: Easier stateless collaboration
- Negative: Every structural change must update docs and the documentation map
