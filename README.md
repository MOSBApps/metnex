# Metnex

Kurumsal multi-tenant SaaS platform temeli — güvenlik, yönetişim ve mühendislik
disiplinini birlikte taşıyan monorepo.

## Bu repo neler içeriyor

- `.github/workflows/pipeline.yml` — CI/CD pipeline
- `infra/docker/` — local/dev/test/swarm senaryoları için Docker Compose stack'leri
- `apps/api` — NestJS platform backend'i
- `apps/web` — Next.js web uygulaması
- `docs/` — governance politikaları, domain sözleşmeleri, runbook'lar, kararlar, güvenlik ve eğitim dokümanları
- `dev.sh` — local development bootstrap (proje-özel port bloğu seçimi ve `.env` üretimi)
- `scripts/metnex-env-create.sh` — sunucu tarafı `.env` üretimi ve seed secret yardımcı script'i
- `scripts/setup-hooks.sh` — local güvenlik rail'leri için git hook kurulumu
- `scripts/backup-db.sh` — local PostgreSQL yedekleme yardımcı script'i
- `scripts/check.sh` — local SDLC kalite kapısı runner'ı
- `scripts/extract-db-meta.sh` — migration/schema dosyalarından DB metadata taslağı üretir

## Hızlı başlangıç

```bash
cd /path/to/metnex
pnpm install
./scripts/setup-hooks.sh
./dev.sh
pnpm dev
```

Desteklenen local geliştirme platformları: macOS native, Linux native ve yalnızca
WSL2 Debian üzerinden Windows. Windows native PowerShell/CMD/Git Bash desteklenmiyor.

Windows için kanonik yol WSL2 + Debian'dır. Repoyu WSL dosya sisteminde tutup Bash
script'lerini doğrudan Debian terminalinden çalıştırın:

```bash
cd ~/projects/metnex
./dev.sh
```

WSL2 Debian veya Docker Desktop eksikse:

```powershell
wsl --install -d Debian
winget install -e --id Docker.DockerDesktop
```

Git, Node.js ve pnpm'i Debian içine kurun, Windows-native araç zinciri olarak değil.

Port bloğu kuralı:

```text
web=base
api=base+1
postgres=base+2
redis=base+3
minio=base+4
minio console=base+5
```

Bu repo `.project-defaults` üzerinden varsayılan olarak `7500` port bloğunu kullanır.

Local bootstrap admin:

```text
email: admin@example.com
password: StrongPass1!
tenant: Platform (slug: platform)
```

Bu varsayılanlar `./dev.sh` tarafından `apps/api/.env` içine yazılır ve gerçek
ortamlar için değiştirilmelidir.

## AI agent başlangıcı

Bir AI ajanına yalnızca rolünü söylemek yeterli olmalı.

- AI1: `docs/AI_Governance/AI1_BOOTSTRAP_PROMPT.md`
- AI2: `docs/AI_Governance/AI2_BOOTSTRAP_PROMPT.md`
- Ortak governance giriş noktası: `docs/AI_Governance/AGENT_BOOTSTRAP.md`
- Tam dokümantasyon haritası: `docs/README.md`

## Database metadata iş akışı

Şablon konumu:

```bash
docs/domain/DB-METADATA-TEMPLATE.md
```

Taslak çıkarımı:

```bash
./scripts/extract-db-meta.sh --root . --project-name "Metnex" --project-slug metnex
```

Varsayılan çıktı:

```bash
docs/domain/DB-METADATA-AUTO.md
```

## Notlar

Faydalı manuel komutlar:

```bash
./dev.sh --status
./dev.sh --stop
./scripts/db/verify-db-locale.sh
pnpm turbo:clean
./scripts/backup-db.sh
./scripts/restore-db.sh --file backup/<file>.dump
```

Turbo veya Next local cache'leri büyürse `pnpm turbo:clean` çalıştırın. Bu,
`.turbo`, `apps/web/.next/dev` ve `apps/web/.next/cache` dizinlerini temizler.
