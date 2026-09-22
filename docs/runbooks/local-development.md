# metnex — Local Development Setup

Bu runbook, metnex icin desteklenen local development ortamlarini ve onboarding komutlarini tanimlar.

## 1. Desteklenen Platform Politikasi

Resmi local development hedefleri:

| Platform | Destek durumu | Canonical yol |
| --- | --- | --- |
| macOS native | Desteklenir | Terminal + Docker Desktop + Node/pnpm |
| Linux native | Desteklenir | Bash shell + Docker Engine/Compose plugin + Node/pnpm |
| Windows | Yalnizca WSL2 Debian ile desteklenir | Windows uzerinde WSL2 Debian + repo icinde Linux toolchain |

Windows native PowerShell, CMD, Git Bash veya Windows filesystem uzerinden local development desteklenmez. Windows kullanicilari repoyu WSL2 Debian filesystem icinde tutmali ve tum Bash scriptlerini Debian terminalinden calistirmalidir.

## 2. Ortak Gereksinimler

Tum desteklenen ortamlarda kurulu olmalidir:

- Git
- Docker Desktop veya Docker Engine + Docker Compose V2 plugin
- Node.js 20 LTS veya daha yeni uyumlu LTS
- pnpm `10.30.3` veya Corepack uzerinden pnpm
- Bash uyumlu terminal

Proje `package.json` icinde `packageManager` olarak `pnpm@10.30.3` kullanir.

Onerilen pnpm kurulumu:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm --version
```

Docker dogrulama:

```bash
docker --version
docker compose version
docker info
```

`docker info` hata veriyorsa Docker daemon calismiyordur veya WSL2 Docker integration kapali olabilir.

## 3. Windows Standardi: WSL2 Debian

Windows icin desteklenen tek local development yolu:

1. Windows uzerinde WSL2
2. Debian WSL distro
3. Docker Desktop WSL2 backend ve Debian integration
4. Debian icinde Git, Node.js, pnpm ve repo checkout

Windows native PowerShell/CMD akisiyla `dev.sh`, `scripts/check.sh`, `scripts/setup-hooks.sh`, DB backup/restore veya Prisma/Docker bootstrap calistirilmaz.

Windows tarafindan WSL2 Debian kurulumu:

```powershell
wsl --install -d Debian
```

Kurulumdan sonra Windows'u yeniden baslatmak gerekebilir.

Docker Desktop ayarlari:

- Docker Desktop calisiyor olmali.
- Settings > General altinda WSL2 backend acik olmali.
- Settings > Resources > WSL Integration altinda Debian integration acik olmali.
- Linux containers kullanilmali.

Debian terminalinde temel araclar:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates bash netcat-openbsd
curl -fsSL https://nodesource.com | sudo -E bash -
sudo apt-get install -y nodejs
```

Node.js icin Node.js 20 LTS kurun. `nvm` veya NodeSource kullanilabilir. Sonra Corepack ile pnpm'i etkinlestirin:

```bash
sudo corepack enable
sudo corepack prepare pnpm@10.30.3 --activate
node --version
pnpm --version
```

WSL2 Debian icinde Docker dogrulama:

```bash
wsl.exe --status
docker --version
docker compose version
docker info
```

`docker info` hata veriyorsa Docker Desktop calismiyor olabilir veya Debian integration kapali olabilir.

### Repo Konumu

Repo WSL filesystem icinde tutulmalidir:

```bash
mkdir -p ~/projects
cd ~/projects
git clone <repo-url>
cd <repo>
```

Kacinin:

```bash
cd /mnt/c/Users/<user>/Documents/<repo>
```

`/mnt/c` altinda calismak dosya izleme, izinler, symlink davranisi ve Node package performansi acisindan sorun cikarabilir.

### Windows'ta Projeyi Calistirma

Debian terminalinde:

```bash
cd ~/projects/<repo>
pnpm install
./scripts/setup-hooks.sh
./dev.sh
./scripts/db/verify-db-locale.sh
pnpm dev
```

Quality gate:

```bash
./scripts/check.sh
```

Docker erisimi lokal makinede kullanilamiyorsa dokumante fallback:

```bash
./scripts/check.sh --skip-docker
```

## 4. macOS Native Kurulum

Homebrew onerilir.

```bash
brew install git node pnpm
brew install --cask docker
```

Alternatif pnpm kurulumu:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
```

Docker Desktop'i uygulama olarak baslatin, sonra dogrulayin:

```bash
git --version
docker --version
docker compose version
docker info
node --version
pnpm --version
```

macOS local baslangic:

```bash
pnpm install
./scripts/setup-hooks.sh
./dev.sh
./scripts/db/verify-db-locale.sh
pnpm dev
```

## 5. Linux Native Kurulum

Debian/Ubuntu ornegi:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates bash netcat-openbsd
```

Docker Engine ve Compose plugin icin Docker'in resmi repository kurulumu kullanilmalidir. Kurulumdan sonra kullaniciyi `docker` grubuna ekleyin:

```bash
sudo usermod -aG docker "$USER"
```

Bu islemden sonra terminal oturumunu kapatip tekrar acin.

Node.js icin Node.js 20 LTS kurun. pnpm icin:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
```

Dogrulama:

```bash
git --version
docker --version
docker compose version
docker info
node --version
pnpm --version
```

Linux local baslangic:

```bash
pnpm install
./scripts/setup-hooks.sh
./dev.sh
./scripts/db/verify-db-locale.sh
pnpm dev
```

## 6. Local Bootstrap Akisi

Mevcut bir projede:

```bash
pnpm install
./scripts/setup-hooks.sh
./dev.sh
./scripts/db/verify-db-locale.sh
pnpm dev
```

`dev.sh` proje bazli port blogunu kullanir, cakismalari cozer, infra servislerini baslatir, Prisma generate/migrate calistirir ve uygulama `.env` dosyalarini uretir.

Komutlar:

```bash
./dev.sh
./dev.sh --stop
./dev.sh --status
pnpm turbo:clean
```

`dev.sh` sunlari yapar:

1. PostgreSQL, Redis, MinIO, Jasper renderer, API ve Web icin port secer.
2. `infra/docker/docker-compose.dev.yml` ile PostgreSQL + Redis + MinIO baslatir.
3. Jasper renderer image'ini (`metnex-jasper-renderer:dev`) gerekiyorsa build eder
   (`services/jasper-renderer/Dockerfile`, build context repo root) ve compose ile baslatir;
   healthcheck gecene kadar bekler, gecmezse script hata ile durur.
4. `apps/api/.env` ve `apps/web/.env.local` dosyalarini yazar (Jasper renderer icin
   `REPORT_RENDER_ENDPOINT`/`REPORT_RENDER_INTERNAL_TOKEN`/`REPORT_RENDER_TIMEOUT_MS` dahil).
5. `pnpm --filter api db:generate` ve `pnpm --filter api db:migrate` calistirir.
6. Gercek runtime URL'lerini (Jasper renderer health durumu dahil) terminalde ozetler.

Renderer zaten calisiyorsa (container running + healthy) `dev.sh` onu yeniden build/restart
etmez — idempotent'tir. Image'i zorla yeniden build etmek icin:

```bash
./dev.sh --force-renderer-rebuild
```

Detay ve internal HTTP contract: `docs/runbooks/reporting-foundation.md`.

## 7. DB Locale / Environment Readiness Gate

Yeni veya yeniden olusturulan her local environment, hazir kabul edilmeden once DB locale gate'ten gecmelidir:

```bash
./scripts/db/verify-db-locale.sh
```

Beklenen hedef:

- `datlocprovider = icu`
- `daticulocale = tr-TR`
- `encoding = UTF8`

Local compose guardrail korunmalidir:

```yaml
POSTGRES_INITDB_ARGS: "--locale-provider=icu --icu-locale=tr-TR --encoding=UTF8"
```

Verify FAIL donerse environment hazir degildir. Once remediation runbook'unu izleyin:

```bash
docs/runbooks/db-recreate-with-icu.md
```

## 8. Port Blogu

Varsayilan port blogu `.project-defaults` icindeki `DEV_PORT_BASE` degerinden gelir.

```text
web=base
api=base+1
postgres=base+2
redis=base+3
minio api=base+4
minio console=base+5
jasper renderer=base+6
```

Bu repo icin varsayilan baslangic `7500`'dur (`.project-defaults`).

## 9. Uretilen Local Dosyalar

- `infra/docker/.env` - local infra secret/config
- `apps/api/.env` - API local config
- `apps/web/.env.local` - Web local config

`apps/api/.env` icinde CORS icin `ALLOWED_ORIGINS` uretilir. `apps/web/.env.local` icinde `NEXT_PUBLIC_API_URL` yazilir.

`infra/docker/.env` icine `REPORT_RENDER_INTERNAL_TOKEN` de ilk `./dev.sh` calistirmasinda
otomatik uretilip yazilir (sonraki calistirmalarda ayni token korunur, `apps/api/.env` ile
senkron kalir).

Bu dosyalar commit edilmez. Sablon icin `infra/docker/.env.example` kullanilir.

## 10. Script Uyumluluk Matrisi

| Script | Amac | macOS native | Linux native | Windows WSL2 Debian | Windows native PowerShell/CMD |
| --- | --- | --- | --- | --- | --- |
| `dev.sh` | Local infra/env bootstrap | Evet | Evet | Evet | Hayir |
| `scripts/setup-hooks.sh` | Git hook kurulum | Evet | Evet | Evet | Hayir |
| `scripts/check.sh` | Quality gate | Evet | Evet | Evet | Hayir |
| `scripts/backup-db.sh` | Local DB backup | Evet | Evet | Evet | Hayir |
| `scripts/restore-db.sh` | Local/remote DB restore | Evet | Evet | Evet | Hayir |
| `scripts/db/verify-db-locale.sh` | DB locale dogrulama | Evet | Evet | Evet | Hayir |
| `scripts/db/recreate-db-with-icu.sh` | DB locale remediation | Evet | Evet | Evet | Hayir |
| `scripts/extract-db-meta.sh` | DB metadata taslagi | Evet | Evet | Evet | Hayir |

Windows native PowerShell/CMD ve Git Bash desteklenen local development yuzeyi degildir. `.sh` scriptleri WSL2 Debian terminalinden calistirilmalidir.

## 11. Backup / Restore

Local backup:

```bash
./scripts/backup-db.sh
```

Local restore:

```bash
./scripts/restore-db.sh --file backup/<file>.dump
```

Remote restore icin ek gereksinimler:

- `ssh`
- `scp`
- hedef sunucuda Docker yetkisi olan kullanici

```bash
./scripts/restore-db.sh --env dev --file backup/<file>.dump --host user@server
```

## 12. Quality Gate

Push oncesi:

```bash
./scripts/check.sh
```

Docker yoksa veya Docker Desktop/Engine calismiyorsa:

```bash
./scripts/check.sh --skip-docker
```

`check.sh` sirasiyla sunlari calistirir:

1. `pnpm audit --audit-level=high`
2. `pnpm run typecheck`
3. `pnpm run lint`
4. `pnpm run test`
5. `pnpm run build`
6. Docker build API + Web, `--skip-docker` verilmediyse

## 13. Git Hook

Her klonda bir kez:

```bash
./scripts/setup-hooks.sh
```

Bu komut pre-commit hook'unu acar. Local DB calisiyorsa her commit oncesi backup alinir.

Windows uzerinde bu komut WSL2 Debian terminalinden calistirilmalidir.

## 14. Cache Temizleme

Turbo veya Next local cache'i gereksiz buyurse:

```bash
pnpm turbo:clean
```

Bu komut `.turbo`, `apps/web/.next/dev` ve `apps/web/.next/cache` dizinlerini temizler.
