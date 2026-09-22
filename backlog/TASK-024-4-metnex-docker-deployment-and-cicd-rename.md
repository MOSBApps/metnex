---
id: TASK-024.4
title: Metnex Docker, deployment path ve CI/CD rename
status: done
srs_refs: []
parent_epic: EPIC-003
updated_at: 2026-09-17
---

> AI1 final onayı: 2026-09-17. Docker/compose, deployment path ve CI/CD
> rename’leri doğrulandı. C seçeneğiyle mevcut volume/container'lara
> dokunulmadı; veri kimlik geçişi TASK-024.5 kapsamına devredildi.

## AI2 Teslim Raporu (2026-09-17)

### ⚠️ Operasyonel risk — kullanıcı kararı gerekiyor (uygulamadan önce okuyun)

Bu ortamda **gerçekten çalışan** container'lar var: `openmas-postgres-dev`, `openmas-redis-dev`,
`openmas-minio-dev`, `openmas-jasper-renderer-dev` (`docker ps -a` ile doğrulandı). `docker-compose.dev.yml`'in
`name: openmas` → `name: metnex` değişikliği, compose'un otomatik adlandırdığı volume'leri
(`postgres_data`, `redis_data`, `minio_data`) artık `metnex_postgres_data` vb. adlar altında arayacağı
anlamına gelir. **Bu volume'ler `openmas_` altında hâlâ duruyor ve içindeki veri silinmedi**, ama bir
sonraki `./dev.sh` çalıştırması bunları görmeyecek ve sıfırdan boş `metnex_*` volume'leri oluşturacaktır.
AI2 bu container/volume'leri **kendiliğinden durdurmadı veya silmedi** (yıkıcı işlem, kullanıcı onayı
gerektirir). Seçenekler:
- **A)** Mevcut container'ları durdurup (`./dev.sh --stop`), eski volume'leri yeni adlara taşıyıp/
  yeniden bağlayıp veriyi koruyarak devam etmek,
- **B)** Yerel dev verisinin zaten yeniden üretilebilir (migration/seed) olduğu kabul edilip eski
  `openmas-*` container/volume'lerini silip `./dev.sh` ile sıfırdan `metnex-*` başlatmak,
- **C)** Bu geçişi TASK-024.5 (veya ayrı bir infra-cutover adımı) ile birlikte, tek seferde
  planlamak.

AI2 önerisi: **B** (bu bir yerel geliştirme ortamı, üretim verisi yok) — ama karar kullanıcıya
bırakıldı, hiçbir container/volume işlemi yapılmadı.

### Değiştirilen dosyalar ve kapsam

| Dosya | Değişiklik |
|---|---|
| `infra/docker/docker-compose.dev.yml` | `name: openmas`→`metnex`; 4 container adı (`metnex-{postgres,redis,minio,jasper-renderer}-dev`); jasper-renderer image adı |
| `infra/docker/docker-compose.{dev-stack,test,swarm}.yml` | compose servis adları (`metnex-api`/`metnex-web`), registry image adları, overlay network adları, deployment path/domain yorumları — `MINIO_BUCKET` değeri **korundu** (TASK-024.5) |
| `infra/docker/docker-compose.infra.yml` | network adı (`metnex-${ENV}`), deployment path/stack adı yorumları — `POSTGRES_USER`/`POSTGRES_DB`/`pg_isready -U` **korundu** (TASK-024.5) |
| `infra/docker/docker-compose.registry.yml` | stack adı yorumu |
| `infra/docker/init-db.sql` | başlık yorumu (marka) |
| `.github/workflows/pipeline.yml` | GHCR/local registry image adları, `stack_name`, network adı, `/opt/metnex/${ENV_NAME}` deploy path, `SERVICES=("metnex-api" "metnex-web")` |
| `dev.sh` | 4 container adı sabiti, jasper-renderer image adı, başlık/log metinleri — `POSTGRES_USER`/`PASSWORD`/`DB`, `MINIO_ROOT_USER`, `MINIO_BUCKET` **korundu** (TASK-024.5) |
| `scripts/check.sh` | `metnex-api:check-local`/`metnex-web:check-local` image tag'leri |
| `scripts/hooks/pre-commit` | container adı, başlık yorumu — `PG_USER`/`PG_DB` **korundu** |
| `scripts/db/recreate-db-with-icu.sh`, `verify-db-locale.sh` | container adı, stack adı, `/opt/metnex/<env>` path'i, başlık yorumları — `PG_USER`/`DB_NAME`/`--pg-user` varsayılanları **korundu** |
| `scripts/backup-db.sh`, `restore-db.sh` | container adı, stack adı, `/opt/metnex/<env>` path'i, `/tmp/metnex-restore-*` — `PG_USER`/`PG_DB` **korundu** |
| `scripts/setup-hooks.sh` | başlık/log metni (marka) |
| `scripts/metnex-env-create.sh` | `BASE="/opt/metnex/$ENV"`, `ORIGIN`/`API` domain örnekleri — `POSTGRES_DB`/`DATABASE_URL` postgres kullanıcı adı **korundu** (TASK-024.5) |
| `docs/decisions/DEC-0013-jasper-renderer-service.md` | önceki "henüz rename edilmedi" caveat'ları kaldırıldı — artık gerçek durumu (`metnex-api`/`metnex-web`/`metnex-jasper-renderer`) yansıtıyor |

### Kasıtlı olarak dokunulmayan (PostgreSQL/MinIO veri kimlikleri — TASK-024.5'e devredildi)

`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` ve `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`/
`MINIO_BUCKET` değerleri şu dosyalarda **hiçbir yerde değiştirilmedi**: `infra/docker/docker-compose.{dev,infra,dev-stack,test,swarm}.yml`,
`infra/docker/.env.example`, `dev.sh`, `scripts/{backup-db,restore-db,setup-hooks}.sh`,
`scripts/db/{recreate-db-with-icu,verify-db-locale}.sh`, `scripts/hooks/pre-commit`,
`scripts/metnex-env-create.sh`, `apps/api/{drizzle.config.ts,scripts/check-db.js}`,
`apps/api/src/platform/storage-usage.service.ts`.

### Kasıtlı olarak dokunulmayan (açık soru — generator pattern, ayrı karar)

`scripts/create-project.sh`/`.ps1`: kendi `'openmas'`/`'OPENMAS'` placeholder pattern'leri —
bu projenin markası değil, fork-generator mekanizmasının arama deseni. TASK-024.1'den beri açık
soru olarak işaretli, bu task'ta da değiştirilmedi.

### Doğrulama

- `docker compose -f infra/docker/docker-compose.{dev,dev-stack,test,swarm,infra,registry}.yml
  config --quiet` → **tüm dosyalar sözdizimsel olarak geçerli** (exit 0; yalnızca beklenen
  "değişken tanımlı değil" ve pre-existing "version alanı obsolete" uyarıları — regresyon değil).
- `./scripts/check.sh --skip-docker` → **PASS** (audit, typecheck, lint, test, build).
- Yeni tarama: `rg -c -i 'openmas|aiskeleton' ...` → **29 dosya, 256 geçiş** (35/313'ten düştü).
  `.github/workflows/pipeline.yml` artık listede yok (tamamen temiz). Kalan kategoriler: (1)
  PostgreSQL/MinIO veri kimlikleri (TASK-024.5'e devredildi), (2) `scripts/create-project.sh`/`.ps1`
  (açık soru, generator pattern), (3) `docs/opendevcon/PROGRESS_LOG.md` (onaylı istisna), (4)
  `docs/rename/*.md`/`METNEX_STATE.md`/`backlog/TASK-024-*.md` (kendine-referans meta-dokümanlar).
- `find . -iname "*openmas*" -o -iname "*aiskeleton*"` → **sıfır sonuç** (değişmedi, zaten
  temizdi).

### Kabul kriterleri karşılama

| Kriter | Durum |
|---|---|
| Docker image/container/network/stack adları Metnex'e taşınmış (Postgres/MinIO veri kimlikleri hariç) | ✅ |
| CI/CD pipeline image/stack/network/path referansları Metnex'e taşınmış | ✅ — `pipeline.yml` tamamen temiz |
| `docker compose config` ile tüm compose dosyaları geçerli | ✅ |
| PostgreSQL/MinIO veri kimlikleri değişmemiş | ✅ |
| Mevcut yerel container/volume riski teslim raporunda açıkça belirtilmiş | ✅ — yukarıda, karar bekleniyor |
| `./scripts/check.sh --skip-docker` PASS | ✅ |
| Git commit/push yapılmamış | ✅ |

### Durum

`status: review` — özellikle **operasyonel risk kararı** (A/B/C seçeneklerinden hangisi) ve
genel onay AI1'e bırakıldı.

# TASK-024.4: Metnex Docker, Deployment Path ve CI/CD Rename

## Amaç

`openmas-*` Docker image/container/network/stack adlarını, `/opt/openmas` deployment path'ini,
registry ve CI/CD (`.github/workflows/pipeline.yml`) referanslarını Metnex'e taşımak.
PostgreSQL ve MinIO veri kimlikleri (kullanıcı adı, parola, database/bucket adı) bu task'ın
kapsamı dışındadır ve TASK-024.5'te ele alınacaktır.

## Kapsam

- `infra/docker/docker-compose.dev.yml`: compose project adı (`name:`), container adları
  (postgres/redis/minio/jasper-renderer), jasper-renderer image adı.
- `infra/docker/docker-compose.{dev-stack,test,swarm}.yml`: compose servis adları
  (`openmas-api`/`openmas-web`), registry image adları, overlay network adları, deployment
  path/domain örnekleri (yorum satırlarında).
- `infra/docker/docker-compose.infra.yml`: network adı, deployment path/stack adı yorumları.
- `infra/docker/docker-compose.registry.yml`: stack adı yorumu.
- `infra/docker/init-db.sql`: başlık yorumu (marka, işlevsel şema adı değil).
- `.github/workflows/pipeline.yml`: GHCR/local registry image adları, stack adı, network adı,
  deploy path, `SERVICES` dizisi.
- `dev.sh`: container adı sabitleri, jasper-renderer image adı, başlık/log metinleri (marka).
- `scripts/check.sh`, `scripts/db/*.sh`, `scripts/backup-db.sh`, `scripts/restore-db.sh`,
  `scripts/hooks/pre-commit`: container adı, stack adı, deployment path referansları.
- `scripts/metnex-env-create.sh`: `/opt/openmas` deployment path'i ve `ORIGIN`/`API` domain
  örnekleri (`openmas-dev.$DOMAIN` vb.) — yalnızca path/domain, `POSTGRES_DB`/`DATABASE_URL`
  postgres kullanıcı adı hariç.
- `docs/decisions/DEC-0013-jasper-renderer-service.md`: bu task tamamlandıktan sonra artık
  gerçek olan `metnex-api`/`metnex-web`/`metnex-jasper-renderer` image adlarını yansıtacak
  şekilde önceki "henüz rename edilmedi" notlarının güncellenmesi.

## Kapsam dışı

- PostgreSQL `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` gerçek değerleri (TASK-024.5).
- MinIO `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`/`MINIO_BUCKET` gerçek değerleri (TASK-024.5).
- Canlı deployment sunucusunda gerçek `/opt/openmas` dizininin taşınması/rename edilmesi
  (sunucu erişimi bu ortamda yok; yalnızca repo içi config metni güncellenir).
- Git commit/push veya Git history rewrite.
- BOTC repository'si.

## Bilinen operasyonel risk (teslim raporunda açıkça belirtilmeli)

Bu ortamda gerçekten çalışan `openmas-postgres-dev`, `openmas-redis-dev`, `openmas-minio-dev`,
`openmas-jasper-renderer-dev` container'ları ve `docker-compose.dev.yml`'in `name: openmas`
compose project'ine bağlı adsız volume'ler (`postgres_data`, `redis_data`, `minio_data`) mevcut.
`name: openmas` → `name: metnex` değişikliği sonrası bir sonraki `./dev.sh`/`docker compose up`
çalıştırması **yeni, boş** `metnex_postgres_data` vb. volume'ler oluşturur; eski `openmas-*`
container'ları ve `openmas_postgres_data` vb. volume'leri **silinmez ama artık kullanılmaz**
(orphan) hâle gelir. AI2 bu container/volume'leri kendiliğinden durdurmamalı/silmemelidir
(yıkıcı işlem) — yalnızca riski raporda net şekilde belirtmeli ve kullanıcıya bir sonraki adımı
(durdur/temizle/yeniden başlat veya volume migration) sorması/önermesi gerekir.

## Kabul kriterleri

| Kriter | Kanıt |
|---|---|
| Docker image/container/network/stack adları Metnex'e taşınmış (Postgres/MinIO veri kimlikleri hariç) | `rg` taraması + dosya listesi |
| CI/CD pipeline image/stack/network/path referansları Metnex'e taşınmış | `pipeline.yml` diff |
| `docker compose config` ile tüm compose dosyaları sözdizimsel olarak geçerli | `docker compose -f ... config` çıktısı |
| PostgreSQL/MinIO veri kimlikleri değişmemiş | Değişmeyen dosya/satır listesi |
| Mevcut yerel container/volume riski teslim raporunda açıkça belirtilmiş | Rapor metni |
| `./scripts/check.sh --skip-docker` PASS | Komut çıktısı |
| Git commit/push yapılmamış | — |

## Doğrulama

```bash
docker compose -f infra/docker/docker-compose.dev.yml config --quiet
docker compose -f infra/docker/docker-compose.dev-stack.yml config --quiet
docker compose -f infra/docker/docker-compose.test.yml config --quiet
docker compose -f infra/docker/docker-compose.swarm.yml config --quiet
docker compose -f infra/docker/docker-compose.infra.yml config --quiet
docker compose -f infra/docker/docker-compose.registry.yml config --quiet
rg -n -i 'openmas|aiskeleton' infra/ .github/ dev.sh scripts/
./scripts/check.sh --skip-docker
```

Kalan sonuçlar yalnızca onaylı Postgres/MinIO veri kimliği istisnaları olmalıdır.

## ODC güncellemesi

Teslim sonunda: backlog status `review`, `docs/opendevcon/METNEX_STATE.md` ve
`docs/opendevcon/PROGRESS_LOG.md` (append-only) güncellenecek.

## AI2 talimatı

Kör global replace yapma; PostgreSQL/MinIO veri kimliği değerlerine dokunma. Yerel çalışan
container/volume'leri kendiliğinden durdurma veya silme — riski raporla, kullanıcıya sor. Git
commit/push yapma.
