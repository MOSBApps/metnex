# metnex — Deployment Rehberi

> Son güncelleme: 2026-03

## Genel Bakış

```
GitHub Actions CI/CD  (.github/workflows/pipeline.yml)
        │
        ├── CI Jobs (cloud runner — her push ve PR)
        │     ├── secret-scan       Gitleaks
        │     ├── dependency-scan   pnpm audit
        │     ├── sast              tsc + eslint
        │     ├── test              birim testler
        │     └── build-check       pnpm build
        │
        └── CD Jobs (sadece push, PR'da atlanır)
              ├── docker-build  → GHCR push (cloud runner)
              ├── scan          → Trivy CRITICAL/HIGH (cloud runner)
              └── deploy        → self-hosted runner (sunucuda)
                    ├── GHCR pull
                    ├── retag → 127.0.0.1:5000 (local registry)
                    ├── Migration container
                    ├── docker stack deploy
                    └── Convergence check (180s timeout)
```

Sunucu **dışa kapalı** (SSH portu internete açık değil). Self-hosted runner sunucudan
`github.com:443`'e **outbound** bağlantı kurar — gelen port açmaya gerek yok.

**Altyapı:**

- Tek node Docker Swarm (Debian 13)
- Nginx Proxy Manager (NPM) — TLS/SSL + host tabanlı routing
- Local Docker registry (`127.0.0.1:5000`) — image deposu
- GHCR — geçici transit depo (build → sunucu arası)
- Tüm servisler Docker (Engine/Swarm hariç native servis yok)

**Stack yapısı:**

| Stack | İçerik | Güncelleme |
|-------|---------|------------|
| `metnex-registry` | Local Docker registry | Manuel (nadiren) |
| `metnex-infra-<env>` | PostgreSQL + Redis + MinIO | Manuel (infra değişince) |
| `metnex-<env>` | metnex-api + metnex-web | **CD pipeline (otomatik)** |

---

## 1. CI/CD Pipeline Akışı

Tek dosya: `.github/workflows/pipeline.yml`

Tetikleyici: `push` ve `pull_request` → `dev`, `test`, `main` branch'leri

`concurrency` grubu: aynı ref'e paralel run'lar iptal edilir.

### CI Jobs (her push + PR)

| Job | Bağımlılık | Araç | Açıklama |
|-----|-----------|------|----------|
| `secret-scan` | — | Gitleaks | Tüm commit geçmişinde gizli anahtar tarama |
| `dependency-scan` | — | pnpm audit | High/Critical CVE → fail |
| `sast` | — | tsc + eslint | Tip hatası + lint |
| `test` | secret-scan, dependency-scan, sast | Jest | Birim testler |
| `build-check` | test | Turborepo | Derleme doğrulaması |

### CD Jobs (sadece `push`, PR'da atlanır)

```
build-check
    │
    ▼
docker-build  (cloud runner)
    ├── Branch → ENV çözümle: main=prod, test=test, diğer=dev
    ├── image_tag = <env>-<sha7>   örn: dev-a1b2c3d
    ├── Build API image → ghcr.io/<org>/metnex-api:<tag>
    └── Build Web image → ghcr.io/<org>/metnex-web:<tag>
          build-args:
            NEXT_PUBLIC_API_URL   (GitHub Variable: DEV/TEST/PROD_API_URL)
            NEXT_PUBLIC_BUILD_SHA (= image_tag, UI'da gösterilir)
    │
    ▼
scan  (cloud runner)
    ├── Trivy: API image → CRITICAL/HIGH CVE → fail
    └── Trivy: Web image → CRITICAL/HIGH CVE → fail
    │
    ▼
deploy  (self-hosted runner)
    ├── Environment: dev / test / prod  (prod'da reviewer onayı)
    ├── docker pull GHCR (api + web)
    ├── docker tag + push → 127.0.0.1:5000
    ├── source /opt/metnex/<env>/.env
    ├── Migration container:
    │     docker run --rm --network metnex-<env> \
    │       -e DATABASE_URL ... <api-image> node apps/api/dist/migrate.js
    ├── docker stack deploy --prune <compose_file> <stack_name>
    └── Convergence check (180s, 10s interval):
          Her servis için desired-state=running container sayılır
          RUNNING < 1 veya FAILED > 0 → exit 1 (rollback tespiti)
```

**Compose dosyası seçimi:**

| Branch | Compose dosyası | Stack adı |
|--------|----------------|-----------|
| `dev` | `infra/docker/docker-compose.dev-stack.yml` | `metnex-dev` |
| `test` | `infra/docker/docker-compose.test.yml` | `metnex-test` |
| `main` | `infra/docker/docker-compose.swarm.yml` | `metnex-prod` |

---

## 2. Image Stratejisi

**GHCR:** Build/push için geçici depo. Repo private olduğundan image'lar da private;
`GITHUB_TOKEN` olmadan pull yapılamaz.

**Local registry (`127.0.0.1:5000`):** Sunucuda kalıcı depo. Compose dosyaları bu adresi kullanır.
Swarm node'ları GHCR'a çıkmak zorunda kalmaz.

### Tag formatı

| Branch | Image tag örneği |
|--------|-----------------|
| dev | `dev-a1b2c3d` |
| test | `test-a1b2c3d` |
| main | `prod-a1b2c3d` |

### Build-time değişkenler (web image)

`NEXT_PUBLIC_*` değişkenler Next.js'de **build zamanında** içine işlenir, runtime env'i değiştirmez:

| ARG | Kaynak | Açıklama |
|-----|--------|----------|
| `NEXT_PUBLIC_API_URL` | GitHub Variable (`DEV/TEST/PROD_API_URL`) | API base URL |
| `NEXT_PUBLIC_BUILD_SHA` | `image_tag` | Login sayfası + sidebar'da görünen sürüm etiketi |

---

## 3. Ortam Port Tablosu

| Ortam | Web | API | MinIO Console |
|-------|-----|-----|---------------|
| dev | 3000 | 3001 | 9090 |
| test | 3010 | 3011 | 9091 |
| prod | 3020 | 3021 | 9092 |

NPM proxy kuralları (örnek):

- `metnex-dev.saas.example.com` → `http://localhost:3000`
- `metnex-api-dev.saas.example.com` → `http://localhost:3001`

Tüm portlar `127.0.0.1` üzerine bind olur — NPM dışında doğrudan erişim kapalı.

---

## 4. Sunucu İlk Kurulum (Debian 13)

**Ön koşullar:** Root/sudo yetkili kullanıcı, statik IP, DNS kayıtları (dev/test/prod), NTP aktif.

```bash
sudo hostnamectl set-hostname metnex-node-01
sudo timedatectl set-timezone Europe/Istanbul
sudo apt update && sudo apt -y full-upgrade
sudo apt -y install ca-certificates curl gnupg lsb-release git jq ufw acl
```

**SSH hardening** — `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
sudo systemctl restart ssh
```

**Firewall:**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 3000:3021/tcp
sudo ufw enable
```

### 4.0 Servis Hesapları

```bash
sudo groupadd --system metnex || true
sudo useradd --system --create-home --shell /bin/bash --gid metnex metnex-deploy || true
sudo useradd --system --create-home --shell /bin/bash --gid metnex metnex-backup || true
sudo useradd --system --create-home --shell /bin/bash --gid metnex github-runner || true

sudo usermod -aG docker metnex-deploy
sudo usermod -aG docker github-runner
```

> Grup değişikliği için ilgili kullanıcının yeni shell oturumu açması gerekir.

### 4.1 Docker Engine kurulumu

```bash
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
sudo apt update
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

### 4.2 Docker Swarm + insecure registry

```bash
docker swarm init --advertise-addr <sunucu-lan-ip-adresi>

sudo tee /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  },
  "insecure-registries": ["127.0.0.1:5000"]
}
EOF
sudo systemctl enable --now docker
sudo systemctl restart docker
sudo docker info | grep -E "Insecure Registries|Swarm"
```

> `--advertise-addr` için internete açık IP değil, Swarm node'larının birbirini göreceği
> sabit LAN/VPN adresi kullanılmalıdır. Tek node kurulumda da bunu açık vermek, daha sonra
> node eklendiğinde raft/overlay davranışının değişmesini önler.

> `live-restore` Swarm ile birlikte kullanılmamalıdır. Docker daemon `live-restore=true`
> ile ayağa kalkarsa Swarm cluster başlatılamaz.

### 4.3 Dizin yapısı

```bash
sudo mkdir -p /datastore/{registry,dev,test,prod}/{postgres,redis,minio}
sudo mkdir -p /opt/metnex/{dev,test,prod}

# PostgreSQL container'ı uid=999 ile çalışır
sudo chown -R 999:999 /datastore/{dev,test,prod}/postgres
sudo chown -R $USER:docker /datastore/{registry,dev,test,prod}/{redis,minio}
sudo chown -R $USER:docker /opt/metnex
```

### 4.4 Overlay ağlarını oluştur

```bash
docker network create --driver overlay --attachable --subnet 172.30.10.0/24 metnex-dev
docker network create --driver overlay --attachable --subnet 172.30.20.0/24 metnex-test
docker network create --driver overlay --attachable --subnet 172.30.30.0/24 metnex-prod
```

Önerilen subnet planı:

| Network | Subnet | Kullanım |
|--------|--------|----------|
| `metnex-dev` | `172.30.10.0/24` | Dev app + infra stack |
| `metnex-test` | `172.30.20.0/24` | Test app + infra stack |
| `metnex-prod` | `172.30.30.0/24` | Prod app + infra stack |

Notlar:
- Bu subnetler host LAN/VPN aralığıyla çakışmamalıdır.
- Ortamlar arasında çakışmasız sabit subnet kullanmak, Swarm debug ve future multi-node genişleme için önemlidir.
- `docker network inspect <network>` ile subnet doğrulanmalıdır.

### 4.5 Local registry deploy et (bir kez)

```bash
docker stack deploy -c infra/docker/docker-compose.registry.yml metnex-registry
curl http://127.0.0.1:5000/v2/   # {} dönmeli
```

### 4.6 Ortam .env dosyaları

`/opt/metnex/dev/.env`:

```env
ENV=dev

POSTGRES_PASSWORD=<güçlü şifre>
POSTGRES_DB=metnex_dev
REDIS_PASSWORD=<güçlü şifre>
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<güçlü şifre>
MINIO_CONSOLE_PORT=9090

DATABASE_URL=postgresql://metnex:<POSTGRES_PASSWORD>@postgres/metnex_dev
REDIS_URL=redis://:<REDIS_PASSWORD>@redis
JWT_SECRET=<min 64 karakter rastgele>
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d
ALLOWED_ORIGINS=https://metnex-dev.saas.example.com
NEXT_PUBLIC_API_URL=https://metnex-api-dev.saas.example.com

# GreenDocs entegrasyonu (opsiyonel)
GREENDOCS_BASE_URL=
GREENDOCS_API_KEY=
```

> `chmod 600 /opt/metnex/{dev,test,prod}/.env`
>
> `/opt/metnex/test/.env` → port 9091, test domain'leri
> `/opt/metnex/prod/.env` → port 9092, prod domain'leri, 2 replica

### 4.7 İnfra stack'lerini deploy et (bir kez)

```bash
for ENV_NAME in dev test prod; do
  set -a && source "/opt/metnex/${ENV_NAME}/.env" && set +a
  docker stack deploy \
    -c infra/docker/docker-compose.infra.yml \
    "metnex-infra-${ENV_NAME}"
done
```

### 4.8 İlk Uygulama Kurulumu

İlk deploy'dan sonra `https://metnex-dev.<domain>/setup` adresine git.
Setup sayfası:
- Platform daha önce kurulduysa (DB'de kullanıcı varsa) otomatik `/login`'e yönlendirir
- Boş platformda: Holding tenant adı, slug, kısa ad + SUPER_ADMIN hesabı oluşturur
- Setup tamamlanınca `/login` sayfasına yönlendirilir

---

## 5. Self-Hosted Runner Kurulumu

### 5.1 Runner kullanıcısı

```bash
sudo useradd -m -s /bin/bash github-runner
sudo usermod -aG docker github-runner
```

### 5.2 Runner indir ve kayıt et

GitHub → repo → **Settings → Actions → Runners → New self-hosted runner**

```bash
sudo -u github-runner -s
cd /home/github-runner
mkdir actions-runner && cd actions-runner

curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-linux-x64-2.x.x.tar.gz
tar xzf ./actions-runner-linux-x64.tar.gz

./config.sh \
  --url https://github.com/<org>/<repo> \
  --token <RUNNER_TOKEN> \
  --name metnex-swarm \
  --labels self-hosted,linux,swarm \
  --unattended
```

### 5.3 Systemd servisi olarak kaydet

```bash
cd /home/github-runner/actions-runner
sudo ./svc.sh install github-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

---

## 6. GitHub Actions Secrets / Variables

### Secrets

| Secret | Açıklama |
|--------|----------|
| *(yok)* | Self-hosted runner aynı repo'nun GITHUB_TOKEN'ı ile GHCR'dan pull yapabilir |

> Runner farklı org/repo'daysa `GHCR_TOKEN` (PAT, `read:packages`) gerekir.

### Variables

| Variable | Örnek |
|----------|-------|
| `DEV_API_URL` | `https://metnex-api-dev.saas.example.com` |
| `TEST_API_URL` | `https://metnex-api-test.saas.example.com` |
| `PROD_API_URL` | `https://metnex-api.saas.example.com` |

### GitHub Environments

| Environment | Koruma |
|-------------|--------|
| `dev` | Yok — otomatik deploy |
| `test` | Yok — otomatik deploy |
| `prod` | Required reviewers: min 1 ekip üyesi |

---

## 7. Migration Stratejisi

Her CD deploy'unda stack güncellenmeden önce çalışır:

```bash
docker run --rm \
  --network metnex-<env> \
  -e DATABASE_URL="$DATABASE_URL" \
  127.0.0.1:5000/metnex-api:<tag> \
  node apps/api/dist/migrate.js
```

- `platform._migration_log` tablosuyla hangi SQL dosyalarının uygulandığı takip edilir
- `packages/db/migrations/*.sql` alfabetik sırayla işlenir, idempotent (`IF NOT EXISTS`)
- Hata → `exit 1` → CD durur, stack güncellenmez

---

## 8. Rolling Deploy & Healthcheck

### Update stratejisi

Tüm servisler `update_config.order: start-first` ile çalışır:

1. Yeni container başlatılır
2. Healthcheck geçer (api: wget; web: node HTTP)
3. Eski container durdurulur
4. `failure_action: rollback` — healthcheck başarısız olursa Swarm önceki image'a döner

### Healthcheck yapılandırması

**API:**
```yaml
test: ["CMD", "wget", "-qO-", "http://localhost:<port>/api/v1/health"]
```

**Web:**
```yaml
test: ["CMD", "node", "-e",
  "require('http').get('http://127.0.0.1:3000/api/health',
    r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
```

> **Neden `127.0.0.1` ve `node` ?**
> Next.js 15+ standalone server `HOSTNAME` env var'ına göre bind eder. Docker Swarm container
> hostname'ini otomatik olarak `HOSTNAME` env var olarak set eder (container ID, örn. `60ca7bf15c50`).
> Bu durum server'ın yalnızca container network IP'sinde dinlemesine yol açar.
> Çözüm: compose'da `HOSTNAME: "0.0.0.0"` + healthcheck'te `127.0.0.1` explicit IPv4.
> Alpine Linux'te `localhost` `::1` (IPv6) resolve edebilir; `0.0.0.0` yalnızca IPv4 dinler —
> explicit `127.0.0.1` kullanmak DNS ambiguity'yi ortadan kaldırır.

### Pipeline convergence check

`docker stack deploy` asenkrondur — komut exit 0 döndürmesi deployment'ın başarılı olduğu anlamına gelmez.
Pipeline 180 saniye boyunca servislerin yakınsamasını bekler:

```bash
# Her servis için desired-state=running container'lar kontrol edilir
RUNNING = $(docker service ps ${STACK}_${SVC} --filter desired-state=running ... | grep -c "^Running")
FAILED  = $(docker service ps ${STACK}_${SVC} --filter desired-state=running ... | grep -c "Failed|Rejected|Shutdown")
# RUNNING < 1 veya FAILED > 0 → exit 1
```

Platform operations foundation sonrası deploy doğrulamasına şunları ekleyin:

- Prisma migration `0005_platform_operations_foundation` uygulanmış olmalı
- System admin ile `/system/audit` ve `/system/performance` açılmalı
- Performance settings kartı threshold ve trace değerlerini yüklemeli

---

## 9. Rollback

**Otomatik:** Swarm healthcheck başarısız olursa `failure_action: rollback` devreye girer.

**Manuel:**

```bash
set -a && source /opt/metnex/prod/.env && set +a
TAG=prod-<önceki-sha> \
  docker stack deploy \
    --compose-file infra/docker/docker-compose.swarm.yml \
    --prune \
    metnex-prod

# Hangi image çalışıyor?
docker service inspect metnex-prod_metnex-web \
  --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

---

## 10. Güvenlik Taramaları

### Dependency scan (CI)

```bash
pnpm audit --audit-level=high
```

Kritik CVE varken pipeline geçmez. Düzeltme:

```bash
pnpm update <paket> --filter=<app>
# Sonra lockfile'ı senkronize et:
pnpm install
```

> `.trivyignore` dosyası unfixed CVE'leri geçici olarak ignore etmek için kullanılabilir.
> Her ignore için gerekçe ve tarih yorum olarak eklenmeli.

### Container scan (CD)

Trivy, `HIGH` ve `CRITICAL` severity + unfixed CVE varsa pipeline'ı durdurur:

```bash
trivy image \
  --exit-code 1 \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --ignorefile .trivyignore \
  ghcr.io/<org>/metnex-api:<tag>
```

---

## 11. İnfra Güncellemesi

PostgreSQL/Redis/MinIO sürüm değişikliği:

```bash
set -a && source /opt/metnex/<env>/.env && set +a
docker stack deploy \
  -c infra/docker/docker-compose.infra.yml \
  metnex-infra-<env>
```

Swarm yalnızca değişen servisleri yeniden başlatır.

---

## 12. Yerel Geliştirme

```bash
# Altyapıyı başlat (postgres + redis + minio)
cd infra/docker && cp .env.example .env  # şifreleri düzenle
docker compose -f docker-compose.dev.yml up -d

# Uygulamaları başlat
cd ../..
pnpm dev
```

---

## 13. Dosya Haritası

```
infra/docker/
  docker-compose.registry.yml    Local Docker registry (bir kez)
  docker-compose.infra.yml       PostgreSQL + Redis + MinIO (ortam başına)
  docker-compose.dev-stack.yml   Dev app stack   → metnex-dev    port 3000/3001
  docker-compose.test.yml        Test app stack  → metnex-test   port 3010/3011
  docker-compose.swarm.yml       Prod app stack  → metnex-prod   port 3020/3021
  docker-compose.dev.yml         Local dev altyapısı (docker compose, swarm değil)
  init-db.sql                    İlk şema oluşturma SQL

.github/workflows/
  pipeline.yml    Tek unified pipeline — CI + CD (push: dev/test/main)

apps/
  api/Dockerfile          NestJS standalone build
  web/Dockerfile          Next.js standalone build
                          ENV HOSTNAME=0.0.0.0 (Next.js 15+ healthcheck için zorunlu)
```

---

## 14. Bilinen Kısıtlamalar ve Kararlar

| Konu | Karar | Gerekçe |
|------|-------|---------|
| Tek Swarm node | Kabul edildi | Mevcut altyapı; gelecekte multi-node eklenebilir |
| Host-bound port (`127.0.0.1:XXXX`) | Host mode (ingress değil) | NPM localhost'tan proxy yapıyor; ingress mesh gereksiz |
| `start-first` + host port | Her ikisi de gerekli | `start-first` zero-downtime için; host port güvenlik için |
| `HOSTNAME=0.0.0.0` | Zorunlu | Next.js 15+ Docker Swarm'da farklı davranış |
| Healthcheck `127.0.0.1` | Zorunlu | Alpine'de localhost → ::1 (IPv6) riski |
| Tek pipeline.yml | Tasarım kararı | workflow_run yerine daha basit, branch başına konfigürasyon gerekmez |
| NEXT_PUBLIC_* build-time | Next.js kısıtı | Runtime değiştirilemez; image ortam başına ayrı derlenir |
| pnpm GHCR token | GITHUB_TOKEN yeterli | Aynı repo'nun runner'ı; ekstra PAT gerekmez |

---

## 15. Operasyon Komutları Hızlı Referans

```bash
# Tüm stack'ler
docker stack ls

# Servis durumları
docker service ls

# Bir servisin canlı logları
docker service logs -f metnex-dev_metnex-api

# Belirli servis görev geçmişi
docker service ps metnex-dev_metnex-api --no-trunc

# Manuel rollback (tek servis)
docker service update --rollback metnex-dev_metnex-api

# Local registry katalog
curl -s http://127.0.0.1:5000/v2/_catalog
```

---

## 16. Backup Politikası

| Kaynak | Hedef dizin | Sıklık |
| --- | --- | --- |
| PostgreSQL dump | `/datastore/<env>/backups/postgres/` | Günlük |
| MinIO objects | `/datastore/<env>/backups/minio/` | Günlük |
| Secrets / `.env` | `/datastore/<env>/backups/secrets/` | Değişiklikte |

Önerilen saklama politikası: 7 günlük, 4 haftalık, 3 aylık.
Restore tatbikatı: aylık — yedek alınması restore edilebilmesi anlamına gelmez.

---

## 17. Yeni DevOps Onboarding Checklist

1. Sunucuya SSH ile bağlandım, sudo yetkim var.
2. Sistem güncel, saat dilimi/hostname doğru.
3. SSH hardening + ufw aktif.
4. Servis hesapları (`metnex-deploy`, `github-runner`) oluşturuldu, docker grubuna eklendi.
5. Docker kurulu, daemon.json (log + live-restore + insecure-registry) yüklü, servis aktif.
6. Swarm init tamamlandı, overlay ağlar oluştu.
7. `/datastore` dizinleri ve permission modeli tamamlandı.
8. Local registry çalışıyor (`curl http://127.0.0.1:5000/v2/`).
9. İnfra stack ayakta (postgres, redis, minio).
10. Dev stack deploy edildi, servisler healthy.
11. NPM upstream route'ları çalışıyor.
12. Self-hosted runner aktif (`sudo ./svc.sh status`).
13. CI/CD tetikleyip yeni image ile rolling update doğrulandı.
14. İlk backup dizinleri oluşturuldu, test backup yapıldı.

---

## 18. Acil Durum Admin Erişimi (Break-Glass)

Bu bölüm, tüm SUPER_ADMIN kullanıcı erişiminin kaybolduğu acil durumlarda
sunucu/container düzeyinde doğrudan müdahale prosedürünü açıklar.

Her müdahale `platform.audit_log` tablosuna yazılır.

### 18.1 Container Tespiti

```bash
API_CONTAINER=$(docker ps --format '{{.Names}}' | grep 'metnex-.*_metnex-api' | head -1)
echo "API container: $API_CONTAINER"
```

### 18.2 Normal Mod (aktör biliniyorsa)

```bash
# SUPER_ADMIN listesi
docker exec -it "$API_CONTAINER" node apps/api/scripts/admin-cli.js list \
  --actor-email admin@example.com

# Şifre sıfırlama
docker exec -it "$API_CONTAINER" node apps/api/scripts/admin-cli.js reset-password \
  --actor-email admin@example.com \
  --email hedef@example.com

# Yeni SUPER_ADMIN — belirli tenant'lar
docker exec -it "$API_CONTAINER" node apps/api/scripts/admin-cli.js add-user \
  --actor-email admin@example.com \
  --email yeni@example.com --name "Ad Soyad" \
  --tenant-slugs tenant-root,tenant-region

# Yeni SUPER_ADMIN — tüm tenant'lar
docker exec -it "$API_CONTAINER" node apps/api/scripts/admin-cli.js add-user \
  --actor-email admin@example.com \
  --email yeni@example.com --name "Ad Soyad" \
  --all-tenants --confirm-all-tenants yes
```

### 18.3 Break-Glass Mod (tüm erişim kayıpsa)

`--actor-email` KULLANILMAZ. `--break-glass` + `--reason` zorunludur.
`user_id = null` olarak audit log'a yazılır.

```bash
# Şifre sıfırlama
docker exec -it "$API_CONTAINER" node apps/api/scripts/admin-cli.js reset-password \
  --break-glass \
  --reason "Tüm SUPER_ADMIN erişimi kayboldu — INC-1234" \
  --ticket INC-1234 \
  --email hedef@example.com

# Yeni kullanıcı ekleme
docker exec -it "$API_CONTAINER" node apps/api/scripts/admin-cli.js add-user \
  --break-glass \
  --reason "Acil admin hesabı oluşturma" \
  --ticket INC-1234 \
  --email yeni.admin@example.com --name "Acil Admin" \
  --all-tenants --confirm-all-tenants yes
```

> `--dry-run` eklenirse hiçbir şey DB'ye yazılmaz; yapılacak işlem stdout'a yazdırılır.

### 18.4 Müdahale Sonrası Audit Doğrulama

```bash
PGPASSWORD=<şifre> psql -h <host> -U metnex -d metnex -c "
  SELECT id, user_id, action,
    new_value->>'reason' AS reason,
    new_value->>'break_glass' AS break_glass,
    new_value->>'ticket' AS ticket,
    created_at
  FROM platform.audit_log
  WHERE action IN ('PASSWORD_RESET_CLI','USER_CREATED_CLI','SUPER_ADMIN_LIST_CLI')
  ORDER BY created_at DESC LIMIT 10;
"
```

### 18.5 Exit Code Referansı

| Kod | Anlam |
| --- | --- |
| 0 | Başarılı |
| 1 | Doğrulama hatası (e-posta, şifre, eksik parametre) |
| 2 | Yetki/politika hatası (aktör bulunamadı, break-glass ihlali) |
| 3 | DB işlem hatası (transaction rollback) |

---

## 19. Report Renderer (Jasper — `services/jasper-renderer/`)

**TASK-022.5** provisioned the internal-only Jasper renderer that TASK-022.4 had documented but
could not implement (no source existed yet). It is a standalone Maven/Spring Boot 3 (Java 21)
service, independent of the NestJS `apps/api` app, using real JasperReports
(`net.sf.jasperreports:jasperreports:6.20.6`) to produce actual PDF/XLSX output. Full HTTP
contract, template allowlist, and JRXML sandbox rules: `docs/runbooks/reporting-foundation.md`.

### 19.1 Dizin Yapısı

```
services/jasper-renderer/
  pom.xml                     Maven build, Java 21, Spring Boot 3.3.4, JasperReports 6.20.6 (tümü sabitlenmiş)
  Dockerfile                  Multi-stage: maven:3.9-eclipse-temurin-21 build → eclipse-temurin:21-jre-alpine runtime
  src/main/java/com/metnex/jasperrenderer/
    web/                      RenderController (POST /render), HealthController (GET /health)
    security/                 TokenAuthFilter (constant-time Bearer check), PayloadSizeFilter
    template/                 TemplateRegistry (allowlist + path-traversal guard), JrxmlSandbox
    render/                   JasperRenderService (fillReport + PDF/XLSX export, bounded timeout)
    exception/                RendererException hierarchy + GlobalExceptionHandler (JSON errors)
  src/main/resources/
    application.yml           renderer.* config, all REPORT_RENDER_* env-overridable
    templates/                default-report.jrxml (built-in layout) + sample-report.jrxml (allowlisted demo)
  src/test/java/...           36 tests: template sandbox/traversal, real PDF/XLSX render, auth, limits, timeout
```

### 19.2 Local (`./dev.sh`)

`infra/docker/docker-compose.dev.yml` defines a `jasper-renderer` service (`build.context: ../..`
= repo root, `Dockerfile: services/jasper-renderer/Dockerfile`, loopback-only
`127.0.0.1:<port>:8088` publish). `./dev.sh`:

1. Builds `metnex-jasper-renderer:dev` only if the image doesn't already exist (or
   `--force-renderer-rebuild` is passed) — an already-running/built renderer is never rebuilt or
   restarted unnecessarily.
2. Generates `REPORT_RENDER_INTERNAL_TOKEN` once and persists it in `infra/docker/.env` (stable
   across re-runs).
3. Starts the container via `docker compose up -d jasper-renderer` and polls `GET /health` —
   **the script fails (non-zero exit) if the renderer doesn't become healthy**, it does not
   silently continue.
4. Writes `REPORT_RENDER_ENDPOINT`/`REPORT_RENDER_INTERNAL_TOKEN`/`REPORT_RENDER_TIMEOUT_MS` into
   `apps/api/.env` and prints the renderer URL + health status in the final summary.

### 19.3 Deployment Stacks (dev-stack / test / swarm)

`jasper-renderer` is defined in all three app stacks, each following the same pattern as
`metnex-api`/`metnex-web` but **never publishing a port**:

| Stack | Network | Replicas | Memory limit |
|---|---|---|---|
| `docker-compose.dev-stack.yml` | `metnex-dev` (internal only) | 1 | 512M |
| `docker-compose.test.yml` | `metnex-test` (internal only) | 1 | 512M |
| `docker-compose.swarm.yml` | `metnex-prod` (internal only) | 2 | 1024M |

`metnex-api` in each stack gets `REPORT_RENDER_ENDPOINT=http://jasper-renderer:8088/render` (the
Docker service name, resolved through the overlay network's internal DNS) plus
`REPORT_RENDER_INTERNAL_TOKEN`/`REPORT_RENDER_TIMEOUT_MS` from the deploy host's `.env` — same
injection mechanism as `DATABASE_URL`/`JWT_SECRET`.

Registry image tag: `127.0.0.1:5000/metnex-jasper-renderer:${TAG}` (matches the
`metnex-api`/`metnex-web` convention). **CI does not build/push this image yet** — wiring a
Maven build step into `.github/workflows/pipeline.yml` (currently Node/pnpm-only) is a follow-up,
not part of TASK-022.5. Until then, push a tag to the local registry manually with the same
`docker build -f services/jasper-renderer/Dockerfile -t
127.0.0.1:5000/metnex-jasper-renderer:<tag> .` command `dev.sh` uses locally (there, the `dev`
tag is purely local and never pushed).

### 19.4 Doğrulanan Kontroller

| Kural | Kanıt |
|---|---|
| Container dışarıya port publish etmiyor | `dev-stack`/`test`/`swarm`'da `ports:` yok; sadece dev.yml'de `127.0.0.1`-only publish |
| Yalnızca API'nin internal network'ü üzerinden erişiliyor | Aynı `metnex-<env>` overlay network, `REPORT_RENDER_ENDPOINT` Docker service adı ile çözümleniyor |
| Token compose secret/env mekanizmasıyla aktarılıyor | `${REPORT_RENDER_INTERNAL_TOKEN}` — `${DATABASE_URL}`/`${JWT_SECRET}` ile aynı desen |
| Non-root çalışıyor | Doğrulandı: `docker exec <container> whoami` → `renderer` (`uid=100`) |
| CPU/memory limitleri tanımlı | `deploy.resources.limits`/`reservations` her stack'te; `JAVA_OPTS` heap limiti container limitinin altında |
| Template/çıktı dizinleri kontrollü | Bind mount yok — template'ler image'a gömülü classpath resource; host'a yazılabilir hiçbir şey mount edilmiyor |
| Healthcheck mevcut | Her stack'te `GET /health`'e karşı `healthcheck:`; Dockerfile'ın kendi `HEALTHCHECK`'i de aynı endpoint'e karşı |
| Token doğrulaması çalışıyor | Gerçek container'da doğrulandı: token yok/yanlış → 401, doğru token → 200 |
| PDF/XLSX gerçek çıktı üretiyor | Gerçek container'a curl ile doğrulandı: `%PDF-` imzalı PDF, `PK` (ZIP) imzalı XLSX |
| Template allowlist + path traversal koruması | `sample-report` → 200; `unknown-report` → 404; `../../etc/passwd` → 400 |

### 19.5 API Tarafında Zaten Uygulanan Kontroller (TASK-022.4'ten korunan)

- `REPORT_RENDER_INTERNAL_TOKEN` yapılandırılmamışsa `REPORT_RENDER_ENDPOINT` set olsa bile API
  renderer'ı hiç çağırmadan fail-closed olur (`ReportRenderService.render`).
- Template'ler yalnızca `TemplateRegistryService` allowlist'i üzerinden `templateId` ile
  çözümlenir — `report_artifacts.templatePath` alanının ham değeri hiçbir zaman renderer'a
  gönderilmez.
- `apps/web` kaynak kodunun `REPORT_RENDER_ENDPOINT`/`REPORT_RENDER_INTERNAL_TOKEN`/
  `report-renderer` referansı içermediği statik testle (`report-render-network-boundary.spec.ts`)
  doğrulanıyor — browser hiçbir zaman renderer'a doğrudan erişemez.
- Render payload'ı satır sayısı (5000) ve serileştirilmiş boyut (10 MB) sınırına tabi; aşımda
  renderer'a hiç istek gitmeden `BadRequestException` döner.
