# DEC-0013 — Jasper Renderer Provisioned as a Standalone Maven/Spring Boot Service

**Date:** 2026-09-16
**Status:** Accepted
**Deciders:** AI1 (Product Governance Agent), AI2 (Engineering Executor)

---

## Context

TASK-022.1 built `ReportRenderService`, an API-side HTTP adapter for an internal Jasper renderer,
and documented the contract it expects. TASK-022.4 discovered that no renderer image, source, or
deployment wiring actually existed anywhere in the repository, and hardened the adapter contract
(`templateId` instead of a filesystem path, mandatory internal token, payload/row limits, runtime
format validation) so it would be ready the moment a real renderer showed up. AI1 correctly
declined to mark that task fully done — none of the deployment-facing acceptance criteria (real
`/render`/`/health` endpoints, network isolation, non-root, resource limits, real PDF/XLSX output)
could be demonstrated without an actual renderer.

TASK-022.5 provisions that renderer.

## Decision

Add `services/jasper-renderer/` as a standalone Maven project, independent of the `apps/api`
NestJS application and the pnpm workspace:

- **Java 21**, **Spring Boot 3.3.4**, **JasperReports 6.20.6** — all versions pinned exactly in
  `pom.xml` (no ranges, no `LATEST`/`RELEASE`). Spring Boot is used for its production HTTP
  behavior (embedded Tomcat, `@Valid` request validation, structured exception handling, graceful
  shutdown) rather than hand-rolling those concerns.
- Implements exactly the HTTP contract `ReportRenderService` already expected:
  `POST /render` (Bearer-token-guarded, `{artifactCode, templateId, format, rows}` →
  binary PDF/XLSX with correct `Content-Type`/`Content-Disposition`, or a JSON error) and
  `GET /health` (unauthenticated, `{"status":"UP","service":"jasper-renderer"}`).
- Owns its own template allowlist (`TemplateRegistry`, mirroring the API's
  `TemplateRegistryService`) and JRXML sandbox check (`JrxmlSandbox`, sharing the exact same
  forbidden-token list as the API side) — defense in depth, since the renderer must not trust that
  the API already validated a template before asking to render it.
- Renders through `JRBeanCollectionDataSource` only — no code path ever passes a
  `java.sql.Connection` to JasperReports' fill step, so there is no JDBC/SQL execution surface
  regardless of template content.
- Multi-stage `Dockerfile`: Maven build stage → minimal `eclipse-temurin:21-jre-alpine` runtime,
  non-root `renderer` user, container `HEALTHCHECK`, environment-tunable JVM heap.
- Wired into `infra/docker/docker-compose.dev.yml` (loopback-only local publish, built/started by
  `./dev.sh`) and into `docker-compose.{dev-stack,test,swarm}.yml` (internal-network-only, no
  published port, resource limits, healthcheck) following the exact pattern already used for
  `metnex-api`/`metnex-web` (TASK-024.4 ile Docker image/container/network adları Metnex'e
  taşındı — bkz. docs/rename/METNEX_RENAME_INVENTORY.md rename sırası adım 8/10).

## Consequences

- Positive: the reporting foundation now has a real, working Jasper backend, not just an adapter
  and a contract. TASK-022.4's blocking concerns (real endpoints, network isolation, non-root,
  resource limits, real PDF/XLSX output, token enforcement) are now demonstrable and were verified
  against a real running container (see `backlog/TASK-022-5-jasper-renderer-service.md` for the
  evidence).
- Positive: `dev.sh` remains idempotent — an already-built/running renderer is never rebuilt or
  restarted, matching the existing behavior for postgres/redis/minio.
- Negative / follow-up: CI (`.github/workflows/pipeline.yml`) does not yet build or push the
  `metnex-jasper-renderer` image — that pipeline is Node/pnpm-only today. Until a Maven build step
  is added there, `test`/`swarm` deployments need a manual `docker build` + push to the local
  registry for this image, using the same command `dev.sh` runs locally.
- Negative / follow-up: outbound network access from the render process itself is not sandboxed at
  the OS/JVM level (no seccomp/SecurityManager) — mitigated today only by network placement (the
  renderer container has no route to anything outside its internal overlay network). Acceptable at
  this scope because only the built-in default template and one demonstration template
  (`sample-report`) ship; revisit if templates from less-trusted sources are ever introduced.
- Migration / compatibility impact: none. `REPORT_RENDER_ENDPOINT` remains optional — unset, the
  API's in-process PDF/XLSX fallback (unchanged since before this task) is still the default in
  any environment that hasn't opted into the renderer.

## Alternatives Rejected

- **A different JVM report engine (e.g. a lighter PDF-only library) instead of JasperReports:**
  rejected — `ReportRenderService`'s contract (`templateId` referring to a `.jrxml` file, JRXML
  sandbox rules named after Jasper-specific dangerous constructs) was already written against
  JasperReports in TASK-022.1/TASK-022.4; switching engines now would mean redesigning the
  contract instead of implementing it.
- **A non-JVM renderer (e.g. a Node.js PDF library) instead of a real Jasper service:** rejected —
  the task explicitly required Jasper Reports, and a non-Jasper renderer would not honor
  `.jrxml` templates at all, breaking the documented template-registration workflow.
- **Building the renderer as a NestJS module inside `apps/api` instead of a separate service:**
  rejected — the whole point of the adapter/contract split from TASK-022.1 onward is that the
  renderer runs as a separate, internal-network-only process; folding Jasper (a JVM library) into
  the Node.js API process would also require running a JVM inside the API container, defeating the
  isolation and resource-limiting goals this task's deployment wiring achieves.
