# Reporting Foundation Runbook

## Purpose

This runbook covers the METNEX reporting foundation: the `ReportArtifact` registry, the
`ReportDatasetProvider` abstraction, the template allowlist (`TemplateRegistryService`), and the
Jasper HTTP render adapter (`ReportRenderService`).

> **Demo Operations removed (DEC-0012).** The module that used to exercise this foundation
> (`Demo Operations`, its `DEMO_SAMPLE_TRANSACTIONS` artifact, and its env-gated seed) was removed.
> No dataset provider is registered by default anymore — see "Adding a Dataset Provider" below.

> **Jasper renderer service exists (TASK-022.5).** `services/jasper-renderer/` is a standalone
> Maven/Spring Boot 3 (Java 21) service using real JasperReports (`net.sf.jasperreports`) to
> render actual PDF/XLSX documents. It is wired into `infra/docker/docker-compose.dev.yml`
> (`./dev.sh` builds and starts it locally) and into the `test`/`swarm` deployment stacks
> (internal-network-only, no published port). Exporting a report with `REPORT_RENDER_ENDPOINT`
> unset still uses the in-process fallback (simple PDF/XLSX, no Jasper) — that fallback is
> unchanged and remains the default when no renderer is configured.

## Adding a Dataset Provider

Reporting core never depends on a specific domain module. To make a module's data reportable:

1. Implement `ReportDatasetProvider` (`apps/api/src/reporting/dataset/report-dataset.contract.ts`):
   `supports(artifactCode)` and `loadDataset(tenantId, filters): Promise<ReportDataset>`. Read data
   only through your module's own service layer — never another module's tables directly.
2. Register an active `ReportArtifact` row for your artifact code (`report_artifacts` table).
3. Register your provider against the `REPORT_DATASET_PROVIDERS` token in
   `apps/api/src/reporting/reporting.module.ts` (currently an empty array by default).
4. `ReportingService.renderHtml` / `exportReport` resolve your provider by artifact code via
   `ReportDatasetResolver` and call it with an explicit `tenantId` — both HTML preview and
   PDF/XLSX export use the same provider/dataset flow.

## Adding a Renderer Template (Allowlist)

`report_artifacts.templatePath` is legacy free-text metadata — **its literal value is never sent
anywhere**, including to the external renderer. Its only role is a boolean-ish signal: if it is
set, the artifact needs a JRXML template; `ReportingService` then resolves the actual template
through `TemplateRegistryService` (`apps/api/src/reporting/templates/template-registry.ts`) using
the artifact's own `code` (lower-cased) as the `templateId` — never a filesystem path crosses the
process boundary.

There are **two independent allowlists** — the API's (defense: never forward a path; sanity-check
before calling the renderer) and the renderer's own (defense in depth: the renderer never trusts
that the API already validated). Both must agree on the `templateId` for a template to actually
render:

1. API side — `apps/api/src/reporting/templates/template-registry.ts`:
   - Add the `.jrxml` file under `apps/api/src/reporting/templates/`.
   - Add an entry to `TEMPLATE_ALLOWLIST`: `{ 'your-artifact-code': 'your-file.jrxml' }`. The key
     must match `^[a-z0-9-]{1,64}$` and must equal `artifact.code.toLowerCase()`.
   - Set `report_artifacts.templatePath` to any non-null value for that artifact row (it is only
     used as the "has a template" flag).
2. Renderer side — `services/jasper-renderer/src/main/java/com/metnex/jasperrenderer/template/TemplateRegistry.java`:
   - Add the same `.jrxml` file under `services/jasper-renderer/src/main/resources/templates/`.
   - Add the same `templateId` to `TEMPLATE_ALLOWLIST` there too.
   - Rebuild the renderer image (`./dev.sh --force-renderer-rebuild` locally, or a normal CI build
     for deployed environments).

On every resolve, both registries re-validate the file content: reject it if larger than 256 KB,
or if it contains any of the forbidden sandbox tokens (see "JRXML Sandbox Rules" below). An
artifact whose code has no matching allowlist entry fails export with a controlled
`NotFoundException` on either side — it never silently renders without checks or leaks a raw path.
`sample-report` ships as a working, allowlisted-on-both-sides demonstration template.

## Renderer HTTP Contract

The renderer is an **internal-only** HTTP service. Browsers must never call it directly — only
the API (`ReportRenderService`) does, and only over the deployment's internal network.

### `POST /render`

Request:

```http
POST /render HTTP/1.1
Content-Type: application/json
Authorization: Bearer <internal-token>

{
  "artifactCode": "SALES_REPORT",
  "templateId": "sales-report",
  "format": "PDF",
  "rows": []
}
```

- `templateId` is `null` when the artifact has no registered template (renderer should use a
  built-in default layout for that case, or reject — implementation-defined).
- `rows` is the domain-agnostic `ReportDatasetRow[]` produced by the artifact's
  `ReportDatasetProvider` (never raw domain entities, never tenant/schema identifiers).
- The API caps `rows.length` at 5000 and the serialized body at 10 MB before ever sending a
  request — a renderer implementation should apply its own limits too (defense in depth).

Response, success:

- HTTP `200`.
- Body: binary PDF or XLSX.
- `Content-Type`: `application/pdf` or
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (the API falls back to these
  defaults if the renderer omits the header, but a real renderer should always set it).
- `Content-Disposition`: `attachment; filename="<safe-name>.<ext>"` — the API sets this header
  itself from a sanitized artifact code (`buildReportFileName`), so the renderer's own
  `Content-Disposition` is not required, but if present must not contain unescaped user input.

Response, error:

- Any non-2xx status with a JSON error body. The API treats any non-`ok` response as a renderer
  failure (`BadGatewayException`, HTTP 502) — it does not parse the JSON body today, so the error
  shape is renderer-defined, but should be a plain `{ "error": string }` for operability.

### `GET /health`

Health probe for the renderer's own liveness/readiness (container healthcheck, orchestrator
probes). Not proxied by the API today — the API's own `/api/v1/reports/renderer/health` endpoint
reports the **adapter's configuration state** (endpoint/token/timeout presence), not the remote
renderer's live health.

### Authentication

`Authorization: Bearer <REPORT_RENDER_INTERNAL_TOKEN>` on every request. **The token is a
mandatory deployment secret**: if `REPORT_RENDER_ENDPOINT` is configured but
`REPORT_RENDER_INTERNAL_TOKEN` is not, the API fails closed with `BadGatewayException` before ever
calling the renderer — it never sends an unauthenticated request.

## JRXML Sandbox Rules

Enforced on **both** sides, before a template's content is ever compiled/rendered — API
(`TemplateRegistryService` / `apps/api/src/reporting/templates/template-registry.ts`) and renderer
(`TemplateRegistry` / `services/jasper-renderer/.../template/TemplateRegistry.java`, sharing the
same rules via `JrxmlSandbox.java`):

- Max template size: 256 KB.
- Forbidden substrings: `Runtime.getRuntime`, `java.io.File`, `java.sql`, `jdbc:`,
  `<queryString`, `System.exit`, `ProcessBuilder`, `java.net(.)`, and (API side only, defense in
  depth for the fallback path) `URLConnection`/`HttpURLConnection`.
- Templates are only ever loaded from each service's own `templates/` directory via its allowlist
  — an artifact can never reference an arbitrary filesystem path (renderer also verifies the
  resolved path can't escape that directory, even given a misconfigured allowlist entry).

Renderer-side guarantees beyond the substring check:

- **No JDBC/SQL execution path exists at all.** `JasperRenderService` only ever calls
  `JasperFillManager.fillReport(report, params, dataSource)` with a `JRBeanCollectionDataSource` —
  no overload that accepts a `java.sql.Connection` is used anywhere, so there is no code path for a
  template to reach a real connection even if it tried.
- **Render-time timeout independent of the API.** Each render runs on a bounded executor;
  `renderer.timeout-ms` (`REPORT_RENDER_TIMEOUT_MS` env, same default as the API's own timeout)
  aborts a pathological render with a `504 RENDER_TIMEOUT` — this is the renderer's own limit, not
  just the API's client-side timeout.

**Known gap:** outbound network access from the render process itself (e.g. a JRXML using a
scriptlet to open a socket) is not sandboxed at the OS/JVM level (no seccomp/SecurityManager). The
compose/stack wiring mitigates this at the network layer (the renderer container has no route to
anything but the internal network it's placed on), but a template-level network sandbox is not
implemented. Track as a follow-up if templates beyond the built-in/`sample-report` ones are ever
introduced.

## Renderer Mode

The in-process fallback (simple PDF/XLSX, no Jasper) remains the default when
`REPORT_RENDER_ENDPOINT` is unset. `services/jasper-renderer/` provides the real Jasper path.

Environment:

```bash
REPORT_RENDER_ENDPOINT=http://jasper-renderer:8088/render   # http://127.0.0.1:<port>/render locally
REPORT_RENDER_INTERNAL_TOKEN=<internal-token>   # mandatory once REPORT_RENDER_ENDPOINT is set
REPORT_RENDER_TIMEOUT_MS=15000
```

Locally, `./dev.sh` builds/starts the renderer and writes all three automatically into
`apps/api/.env` — see `docs/runbooks/local-development.md` § Local Bootstrap Akisi.

Security requirements:

- Renderer endpoints are internal infrastructure endpoints.
- Browsers must call the project API, not the renderer directly (see the static test
  `report-render-network-boundary.spec.ts`, which fails the build if `apps/web` ever references
  `REPORT_RENDER_ENDPOINT`/`REPORT_RENDER_INTERNAL_TOKEN`/a `report-renderer` hostname).
- `REPORT_RENDER_INTERNAL_TOKEN` is mandatory once an endpoint is configured — the API fails
  closed otherwise, and the renderer itself also rejects any `/render` call without a matching
  token (constant-time comparison, `TokenAuthFilter`).
- Templates are only referenced by `templateId` via the allowlist, never by filesystem path.

## Deployment Wiring

`services/jasper-renderer/Dockerfile` is a multi-stage build (Maven build stage → minimal
`eclipse-temurin:21-jre-alpine` runtime stage, non-root `renderer` user, `HEALTHCHECK` against its
own `/health`). It is wired into:

| File | Wiring |
|---|---|
| `infra/docker/docker-compose.dev.yml` | `jasper-renderer` service, `build:` context = repo root, loopback-only `127.0.0.1:<port>:8088` publish. `./dev.sh` builds/starts/health-waits it. |
| `infra/docker/docker-compose.dev-stack.yml` | `jasper-renderer` service on the `metnex-dev` overlay network, **no `ports:`** (internal-only), `metnex-api` gets `REPORT_RENDER_ENDPOINT=http://jasper-renderer:8088/render`. |
| `infra/docker/docker-compose.test.yml` | Same pattern on `metnex-test`. |
| `infra/docker/docker-compose.swarm.yml` | Same pattern on `metnex-prod`, 2 replicas, higher resource limits/JVM heap. |

All three deployment stacks (dev-stack/test/swarm) satisfy:

- [x] **No published port** — `jasper-renderer` has no `ports:` entry in any of the three; only
      `metnex-api` on the same overlay network can reach it.
- [x] **Internal network only** — joins the same `metnex-<env>` overlay network as `metnex-api`
      and no other network. `REPORT_RENDER_ENDPOINT=http://jasper-renderer:8088/render` resolves
      through that network's internal DNS — never a public hostname.
- [x] **Token via secret/env** — `REPORT_RENDER_INTERNAL_TOKEN` is injected the same way as
      `DATABASE_URL`/`JWT_SECRET` (environment substitution from the deploy host's `.env`), never
      baked into the image.
- [x] **Non-root process** — Dockerfile creates and switches to a `renderer` user
      (verified: `docker exec <container> whoami` → `renderer`, `uid=100`).
- [x] **Resource limits** — `deploy.resources.limits`/`reservations` (CPU + memory) set per stack;
      JVM heap (`JAVA_OPTS=-Xms.. -Xmx..`) is set below the container memory limit.
- [x] **Controlled template mount** — no bind mount at all; templates are baked into the image
      (`src/main/resources/templates/`) as classpath resources, so there is nothing writable to
      mount for a template, and no host directory is ever exposed to the container.
- [x] **Healthcheck** — `healthcheck:` block against `GET /health` in every stack (and in the
      Dockerfile's own `HEALTHCHECK` for plain `docker run`).

Registry image tag (matching the existing `metnex-api`/`metnex-web` convention):

```text
127.0.0.1:5000/metnex-jasper-renderer:${TAG}
```

CI does not yet build/push this image automatically (`.github/workflows/pipeline.yml` was not
modified by TASK-022.5 — wiring a Maven build into the existing Node/pnpm CI pipeline is a
separate follow-up). Until that exists, `${TAG}` images for `test`/`swarm` must be built and
pushed to the local registry manually using the same `docker build -f
services/jasper-renderer/Dockerfile -t 127.0.0.1:5000/metnex-jasper-renderer:<tag> .` command
`dev.sh` uses locally (tag `dev` there is purely local, never pushed).

## Smoke Checks

### Renderer itself (no API needed)

After `./dev.sh` (or a plain `docker run` of the image), verify the renderer directly:

```bash
# Health (no auth)
curl -s http://127.0.0.1:<port>/health
# {"status":"UP","service":"jasper-renderer"}

# Rejected without a token
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:<port>/render \
  -H "Content-Type: application/json" -d '{"artifactCode":"X","format":"PDF","rows":[]}'
# 401

# Real PDF, using the built-in default layout (no templateId)
curl -s -o out.pdf -X POST http://127.0.0.1:<port>/render \
  -H "Authorization: Bearer <REPORT_RENDER_INTERNAL_TOKEN>" -H "Content-Type: application/json" \
  -d '{"artifactCode":"SALES_REPORT","format":"PDF","rows":[{"no":"001","label":"Example","occurredAt":"2026-09-16T10:00:00Z","status":"OPEN","quantity":2,"unitPrice":100,"amount":200}]}'
head -c 5 out.pdf   # %PDF-
```

### Reporting flow through the API

With no dataset provider registered, `/app/reports/[artifactCode]/view` returns a controlled 404
and the viewer shows an empty state — this is expected until a domain module registers a provider
and artifact. Once one is registered:

1. Open `/app/reports/<your-artifact-code>/view`.
2. Click `Show` and confirm HTML renders on the page.
3. Download PDF and XLSX — with `REPORT_RENDER_ENDPOINT` configured, these go through the real
   Jasper renderer; confirm the downloaded PDF opens and the XLSX is genuinely a ZIP (`PK` file
   signature), not CSV-in-disguise.
4. Revoke the package/permission assignment (if your module gates it) and confirm menu/API access is blocked.

## Health Endpoint

Use:

```text
GET /api/v1/reports/renderer/health
```

The endpoint reports `FALLBACK` when no external renderer endpoint is configured. This is the
adapter's own configuration state (endpoint/token/timeout), not a live probe of the remote
renderer — see "Renderer HTTP Contract" above for the renderer's own `GET /health`.
