# AI Skeleton

Reusable project skeleton aligned with the current metnex engineering and documentation model.

## What this skeleton provides

- `.github/workflows/pipeline.yml` — baseline CI/CD pipeline
- `infra/docker/` — Docker Compose stacks for local/dev/test/swarm scenarios
- `apps/api` — minimal NestJS platform foundation starter
- `apps/web` — minimal Next.js login + protected shell starter
- `docs/` — governance policies, domain contracts, runbooks, decisions, security docs, training docs
- `scripts/create-project.sh` — bootstrap a new project from the skeleton
- `dev.sh` — local development bootstrap with project-specific port block selection and `.env` generation
- `scripts/metnex-env-create.sh` — server-side `.env` generation and seeded secrets helper
- `scripts/setup-hooks.sh` — installs git hooks for local safety rails
- `scripts/backup-db.sh` — local PostgreSQL backup helper
- `scripts/check.sh` — local SDLC quality gate runner
- `scripts/extract-db-meta.sh` — generates a database metadata draft from migrations/schema files

## Fast start

Skeleton repo üzerinde çalışmak için:

```bash
cd /Users/dogan/Documents/Projects/ownprojects/metnex
pnpm install
./scripts/setup-hooks.sh
./dev.sh
pnpm dev
```

Skeleton'dan yeni proje üretmek için:

```bash
cd /Users/dogan/Documents/Projects/ownprojects/metnex
./scripts/create-project.sh --name "My New Platform" --slug myplatform --port-base 7500
```

Default output:

```bash
/Users/dogan/Documents/Projects/ownprojects/<slug>
```

Custom output path:

```bash
./scripts/create-project.sh --name "My New Platform" --slug myplatform --out /path/to/myplatform
```

Supported local development platforms are macOS native, Linux native, and Windows only through WSL2 Debian. Windows native PowerShell/CMD/Git Bash development is not supported.

Windows canonical path is WSL2 + Debian. Keep repos under the WSL filesystem, then use the Bash scripts normally from the Debian terminal:

```bash
cd ~/projects/metnex
./scripts/create-project.sh --name "My New Platform" --slug myplatform --out ../myplatform
```

If WSL2 Debian or Docker Desktop is missing on Windows:

```powershell
wsl --install -d Debian
winget install -e --id Docker.DockerDesktop
```

Install Git, Node.js and pnpm inside Debian, not as the primary Windows-native toolchain.

Non-interactive locale/collation selection:

```bash
./scripts/create-project.sh   --name "My New Platform"   --slug myplatform   --app-language tr-TR   --db-locale-provider icu   --db-collation tr-x-icu   --port-base 7500
```

If `--app-language`, `--db-locale-provider`, `--db-collation`, or `--port-base` are omitted, the script prompts for them interactively.

Port block rule:

```text
web=base
api=base+1
postgres=base+2
redis=base+3
minio=base+4
minio console=base+5
```

This skeleton uses `6500` as its own default base via `.project-defaults`. New generated projects should typically start from a different block such as `7500`.

Yeni üretilen projede ilk çalıştırma:

```bash
cd /path/to/project
git init
pnpm install
./scripts/setup-hooks.sh
./dev.sh
./scripts/db/verify-db-locale.sh
pnpm dev
```

Local bootstrap admin:

```text
email: admin@example.com
password: StrongPass1!
tenant: Platform (slug: platform)
```

These defaults are written by `./dev.sh` into `apps/api/.env` and should be changed for real environments.

## AI agent startup

For a freshly cloned project, telling the agent only its role should be enough.

- AI1: start from `docs/AI_Governance/AI1_BOOTSTRAP_PROMPT.md`
- AI2: start from `docs/AI_Governance/AI2_BOOTSTRAP_PROMPT.md`
- Shared governance entrypoint: `docs/AI_Governance/AGENT_BOOTSTRAP.md`
- Full documentation map: `docs/README.md`

## Database metadata workflow

Template location:

```bash
docs/domain/DB-METADATA-TEMPLATE.md
```

Draft extraction:

```bash
./scripts/extract-db-meta.sh --root /path/to/project --project-name "My New Platform" --project-slug myplatform
```

Default output:

```bash
<root>/docs/domain/DB-METADATA-AUTO.md
```

## Notes

`create-project.sh` replaces both modern placeholders and legacy metnex-style placeholders:
- `Open Mas`
- `metnex`
- `METNEX`
- `tr-TR`
- `tr-x-icu`
- `icu`
- `metnex / metnex / METNEX`

Useful manual commands:

```bash
./dev.sh --status
./dev.sh --stop
./scripts/db/verify-db-locale.sh
pnpm turbo:clean
./scripts/backup-db.sh
./scripts/restore-db.sh --file backup/<file>.dump
```

If Turbo or Next local caches grow too much, run `pnpm turbo:clean`. This clears `.turbo`, `apps/web/.next/dev`, and `apps/web/.next/cache`.
