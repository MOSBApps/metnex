# Metnex Rename Envanteri ve İsim Sözleşmesi

> **Durum: Envanter — kod/veri değişikliği içermez.** Bu belge TASK-024.1'in tek teslimatıdır.
> Hiçbir dosya, klasör, package, database veya deployment adı bu task kapsamında değiştirilmedi.
> Kaynak görev: `backlog/TASK-024-1-metnex-rename-inventory-and-naming-contract.md`.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)
**Kapsam:** rename öncesi kullanılan eski proje kimliğinin (slug ve ürün adı) ve türevlerinin
repository genelinde tam envanteri + hedef isim sözleşmesi.

> **Terim notu (TASK-024.2 düzeltmesi, 2026-09-17):** AI1 kararı gereği bu belgenin açıklama
> metinlerinde eski marka/slug adı literal olarak yazılmaz. Bu belgede eski slug `eski-ad`,
> eski büyük-harf biçimi `ESKI-AD`, eski ürün adı `EskiAd` placeholder'larıyla anılır. Yalnızca
> §1 (Tarama Yöntemi), §7 (Doğrulama Komutları) ve §9 (Ham Tarama Çıktısı) içindeki **gerçek
> komutlar ve gerçek komut çıktıları** — tekrar üretilebilirlik için — orijinal string'i literal
> olarak içerir; bunlar açıklama metni değil, çalıştırılan/çalıştırılacak komutlardır.

---

## 1. Tarama Yöntemi ve Kapsamı

### Kullanılan komutlar

```bash
# İçerik taraması (case-insensitive, dosya listesi)
rg -n -i 'openmas|aiskeleton' --hidden \
  -g '!node_modules' -g '!.git' -g '!.next' -g '!dist' -g '!coverage' -g '!target' .

# Dosya/klasör adı taraması
find . -iname "*openmas*" -not -path "*/node_modules/*" -not -path "*/.git/*"
find . -iname "*aiskeleton*" -not -path "*/node_modules/*" -not -path "*/.git/*"

# Dosya başına geçiş sayısı (önceliklendirme için)
rg -c -i 'openmas|aiskeleton' --hidden -g '!node_modules' -g '!.git' -g '!.next' \
  -g '!dist' -g '!coverage' -g '!target' .

# Belirli kategoriler için hedefli taramalar
grep -rn "@openmas" --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.yml" --include="Dockerfile*" --include="*.sh" .
grep -rn "AIS_" apps/ infra/ scripts/ dev.sh
grep -n "groupId\|artifactId\|<name>" services/jasper-renderer/pom.xml
```

### Dışlanan dizinler (yanlış pozitif kaynakları)

| Dizin/desen | Neden dışlandı |
|---|---|
| `node_modules/` | Üçüncü taraf bağımlılık kaynağı; hiçbir zaman elle taranmaz/rename edilmez, `pnpm install` yeniden üretir |
| `.git/` | Bu ortamda repository bir git deposu **değil** (`git remote -v` boş, `.git` yok) — bkz. §6 |
| `.next/`, `dist/`, `coverage/`, `target/` (Maven build çıktısı) | Build artefact'ları; kaynağa göre yeniden üretilir, elle rename gerektirmez |
| `pnpm-lock.yaml` | `eski-ad`/`@eski-ad` için 0 sonuç döndü — pnpm lockfile workspace paketlerini yol bazlı (`apps/web`) anahtarlıyor, isimle değil; `package.json` adı değiştiğinde `pnpm install` ile otomatik güncellenir |

### Kapsam dahilinde bulunanlar

- Tüm kaynak kod (`apps/api`, `apps/web`, `services/jasper-renderer`)
- Tüm dokümantasyon (`docs/**`)
- Backlog kayıtları (`backlog/**`)
- Deployment/infra (`infra/docker/**`, `.github/workflows/**`, `dev.sh`, `scripts/**`)
- Kök seviye dosyalar (`README.md`, `ODC.md`, `ODC_AI2_ONBOARDING_PROMPT.md`, `package.json`)

### Toplam bulgu

| Ölçüt | Sayı |
|---|---|
| Eşleşen dosya (içerik) | **147** |
| Toplam eşleşme (satır bazlı `rg -c` toplamı) | **572** |
| Adında `eski-ad` geçen dosya/klasör | **9** dosya + **2** klasör (`services/jasper-renderer/src/{main,test}/java/com/eski-ad`) |
| Adında `eski-urun` geçen dosya/klasör | **0** |

---

## 2. Eski İsimlerin Dosya ve Klasör Bazlı Tam Listesi

### 2.1 Dosya/klasör **adında** `eski-ad` geçenler (rename gerektirir)

| Yol | Tür | Not |
|---|---|---|
| `docs/decisions/DEC-0007-eski-ad-db-locale-and-collation.md` | dosya | **Tarihi karar kaydı — DEĞİŞTİRİLMEYECEK** (bkz. §3, §6) |
| `docs/opendevcon/ESKI-AD_STATE.md` | dosya | Task'ın kalite kapısında `METNEX_STATE.md` olarak açıkça hedeflendi |
| `docs/project/ESKI-AD_DELIVERY.json` | dosya | |
| `docs/project/ESKI-AD_EXECUTION.json` | dosya | |
| `docs/project/ESKI-AD_PLAN.json` | dosya | |
| `docs/project/ESKI-AD_SCOPE.json` | dosya | |
| `docs/project/ESKI-AD_TRACEABILITY.json` | dosya | |
| `docs/runbooks/ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md` | dosya | |
| `scripts/eski-ad-env-create.sh` | dosya | Sunucu tarafı `.env` üretim scripti |
| `services/jasper-renderer/src/main/java/com/eski-ad/` | klasör | Java package dizini (`com.eski-ad.jasperrenderer`) |
| `services/jasper-renderer/src/test/java/com/eski-ad/` | klasör | Java test package dizini |

### 2.2 İçerikte `eski-ad`/`eski-urun` geçen dosyalar — kategori bazlı

Aşağıdaki alt bölümler 147 dosyayı kategoriye göre gruplar. Tam dosya:geçiş-sayısı listesi §9
Ek'te (ham `rg -c` çıktısı) verilmiştir.

#### a) Uygulama kaynak kodu — çalışma zamanı davranışını etkileyen (YÜKSEK öncelik)

| Dosya | Geçiş | Bulgu türü |
|---|---|---|
| `apps/web/src/middleware.ts` | 6 | Cookie adları: `eski-ad_refresh_token`, `eski-ad_tenant_id`, `eski-ad_tenant_type`, `eski-ad_is_impersonating`, `eski-ad_is_customer_admin`, `eski-ad_is_system_admin` |
| `apps/web/src/lib/tenant-context.ts` | 5 | Cookie adları + custom event adı `eski-ad:tenantchange` |
| `apps/web/src/lib/impersonation.ts` | 5 | localStorage anahtarları + cookie `eski-ad_is_impersonating` |
| `apps/web/src/app/(app)/layout.tsx` | 3 | Cookie adları (okuma) |
| `apps/web/src/app/(platform)/layout.tsx` | 3 | Cookie adları (okuma) |
| `apps/web/src/lib/refresh.ts` | 2 | `ACCESS_KEY`, `IS_SYSTEM_ADMIN_COOKIE` |
| `apps/web/src/lib/api-base.ts` | 2 | `window.__ESKI-AD_API_URL__` global değişkeni |
| `apps/web/src/app/layout.tsx` | 2 | `<title>eski-ad</title>`, `window.__ESKI-AD_API_URL__` set eden inline script |
| `apps/web/src/components/session-guard.tsx` | 1 | localStorage `eski-ad_access_token` |
| `apps/web/src/lib/api.ts` | 1 | localStorage `eski-ad_access_token` |
| `apps/web/src/lib/i18n/i18n-config.ts` | 1 | localStorage `eski-ad_language` |
| `apps/web/src/lib/nav-storage.ts` | 1 | localStorage namespace `eski-ad.nav.v1` |
| `apps/web/src/lib/nav-storage.spec.ts` | 1 | Test dosya başlığı yorumu (davranışsal değil) |
| `apps/web/src/components/app-sidebar.tsx` | 1 | UI metni "eski-ad" (marka) |
| `apps/web/src/components/console-shell.tsx` | 1 | UI metni "eski-ad" (marka) |
| `apps/web/src/components/glass-console/console-shell.tsx` | 1 | UI metni "eski-ad" (marka) |
| `apps/web/src/app/login/page.tsx` | 1 | UI metni "eski-ad" (marka) |
| `apps/api/src/platform/auth.controller.ts` | 1 | `REFRESH_COOKIE = 'eski-ad_refresh_token'` (httpOnly cookie set/read) |
| `apps/api/src/platform/mfa.service.ts` | 1 | TOTP issuer etiketi `'EskiAd'` — kullanıcı authenticator uygulamasında görür |
| `apps/api/src/platform/storage-usage.service.ts` | 1 | `MINIO_BUCKET` fallback değeri `'eski-ad-dev'` |
| `apps/api/src/settings/credential-crypto.service.ts` | 1 | Dev-only fallback şifreleme anahtarı `'eski-ad-dev-key'` (gerçek secret değil, placeholder) |
| `apps/api/src/settings/platform-settings.service.ts` | 2 | Varsayılan platform adı `'eski-ad'` (seed/fallback branding) |
| `apps/api/drizzle.config.ts` | 1 | Varsayılan `DATABASE_URL` (`postgresql://eski-ad:eski-ad_dev_2026@.../eski-ad`) |
| `apps/api/scripts/check-db.js` | 1 | Aynı varsayılan `DATABASE_URL` |
| `apps/api/.env.example` | 2 | Aynı varsayılan `DATABASE_URL` + dosya başlığı yorumu |
| `apps/web/.env.example` | 1 | Yorum satırı |
| `apps/web/package.json` | 1 | `"name": "@eski-ad/web"` |
| `apps/web/Dockerfile` | 2 | `pnpm install --filter @eski-ad/web...`, `pnpm --filter @eski-ad/web build` |
| `package.json` (kök) | 1 | `"name": "eski-ad"` |

#### b) Java renderer servisi (`services/jasper-renderer/`) — 33 dosya, tek kök neden

Tüm 24 `.java` dosyası (main: 16, exception: 8, test: 6) `package com.eski-ad.jasperrenderer...`
satırıyla başlar — bu **tek bir kök neden** (Maven `groupId: com.eski-ad`), 24 ayrı bulgu değil.
`pom.xml` (`groupId`, `<name>ESKI-AD Jasper Renderer</name>`), `Dockerfile` (başlık yorumu) ve
`application.yml` de aynı kökten. Dosya bazlı geçiş sayıları §9 Ek'inde `services/` grubunda.

#### c) Docker / deployment altyapısı

| Dosya | Geçiş | Bulgu türü |
|---|---|---|
| `infra/docker/docker-compose.dev-stack.yml` | 17 | Image adları (`eski-ad-api`, `eski-ad-web`, `eski-ad-jasper-renderer`), network `eski-ad-dev` |
| `infra/docker/docker-compose.swarm.yml` | 17 | Aynı, network `eski-ad-prod` |
| `infra/docker/docker-compose.test.yml` | 17 | Aynı, network `eski-ad-test` |
| `infra/docker/docker-compose.dev.yml` | 9 | `name: eski-ad`, container adları (`eski-ad-postgres-dev` vb.) |
| `infra/docker/docker-compose.infra.yml` | 9 | `/opt/eski-ad`, `POSTGRES_USER: eski-ad`, stack adı `eski-ad-infra-<env>` |
| `infra/docker/.env.example` | 3 | Yorum satırları |
| `infra/docker/init-db.sql` | 1 | Dosya başlığı yorumu |
| `infra/docker/docker-compose.registry.yml` | 1 | Stack adı `eski-ad-registry` |
| `.github/workflows/pipeline.yml` | 12 | GHCR image adları, stack adı, deploy path, network adı, servis listesi |
| `dev.sh` | 21 | Container adları, varsayılan `POSTGRES_USER`/`DB`/`PASSWORD`, `MINIO_BUCKET`, başlık metinleri |

#### d) Operasyon script'leri

| Dosya | Geçiş | Bulgu türü |
|---|---|---|
| `scripts/db/recreate-db-with-icu.sh` | 17 | `/opt/eski-ad`, stack adı, container adı, `PG_USER`/`DB_NAME` varsayılanı |
| `scripts/db/verify-db-locale.sh` | 9 | Aynı desen |
| `scripts/restore-db.sh` | 9 | Aynı desen + `/tmp/eski-ad-restore-*` |
| `scripts/eski-ad-env-create.sh` | 11 | `/opt/eski-ad`, `POSTGRES_DB=eski-ad[_dev\|_test]`, domain örnekleri |
| `scripts/backup-db.sh` | 5 | Container/kullanıcı/DB varsayılanları |
| `scripts/hooks/pre-commit` | 6 | Aynı desen (local backup hook) |
| `scripts/create-project.sh` | 6 | **Skeleton'ın kendi fork-generator'ı** — `'eski-ad'`/`'ESKI-AD'` burada literal placeholder pattern'i olarak kullanılıyor (bkz. §6, özel risk) |
| `scripts/create-project.ps1` | 6 | Aynı, Windows eşdeğeri |
| `scripts/check.sh` | 3 | Docker image tag'leri (`eski-ad-api:check-local` vb.) |
| `scripts/setup-hooks.sh` | 2 | Başlık/log metni |

#### e) Dokümantasyon (branding + operasyonel referans karışık)

| Dosya | Geçiş | Bulgu türü |
|---|---|---|
| `docs/runbooks/deployment.md` | 71 | **En yoğun dosya** — tüm deployment kimlikleri (Linux kullanıcı/grup, hostname, `/opt/eski-ad`, domain'ler, network'ler, DB adı, GHCR path'leri) |
| `docs/requirements/DISCOVERY.md` | 28 | Aktif BOTC/Metnex migration Discovery belgesi — "ESKI-AD" hedef stack adı olarak yoğun kullanılmış |
| `docs/opendevcon/PROGRESS_LOG.md` | 14 | Append-only log — **geçmiş kayıtlar değiştirilemez** (bkz. §6) |
| `docs/runbooks/db-recreate-with-icu.md` | 14 | Operasyonel runbook, script ile birebir örtüşen komutlar |
| `docs/runbooks/db-collation-strategy.md` | 7 | Aynı desen |
| `docs/runbooks/reporting-foundation.md` | 10 | Marka + `services/jasper-renderer` yol referansları |
| `backlog/TASK-022-5-jasper-renderer-service.md` | 10 | Geçmiş task kaydı |
| `README.md` (kök) | 9 | Kurulum örnekleri, `scripts/create-project.sh` açıklaması |
| `docs/domain/DB_META.md` | 6 | DB adı/collation örnekleri |
| `ODC.md` | 3 | `name: "EskiAd"`, `slug: "eski-ad"` — **makine tarafından okunabilir proje kimliği** |
| `docs/requirements/SRS.md` | 3 | |
| `docs/runbooks/local-development.md` | 3 | |
| `docs/runbooks/PRODUCT_OWNER_LIFECYCLE_PLAYBOOK.md` | 3 | |
| `docs/decisions/DEC-0007-*.md` | 4 | **Tarihi karar kaydı — DEĞİŞTİRİLMEYECEK** |
| `docs/decisions/DEC-0008-*.md`, `DEC-0009-*.md` | 1+1 | **Tarihi karar kaydı — DEĞİŞTİRİLMEYECEK** |
| `docs/decisions/DEC-0012-*.md`, `DEC-0013-*.md` | 1+2 | Yakın geçmiş karar kayıtları — DEĞİŞTİRİLMEYECEK (governance rule tüm DEC-* için geçerli) |
| `docs/project/ESKI-AD_*.json` (5 dosya) | 2 x 5 = 10 | `name: "EskiAd"`, `slug: "eski-ad"` alanları |
| `docs/security/APPLICATION_SECURITY_ARCHITECTURE.md` | 4 | "her eski-ad'tan türetilen proje..." kalıp cümleler |
| `docs/AI_Governance/*.md` (4 dosya) | 1 x 4 | Belge başlıkları |
| `docs/training/*.md` (3 dosya) | 1+1+4 | Son kullanıcı dokümantasyonu, saf marka |
| `docs/ui-contract/**/*.md` (16 dosya) | 1-2 her biri | UI Contract belgeleri, saf marka/başlık |
| `docs/domain/DB-METADATA-TEMPLATE.md`, `DOMAIN_MODEL.md` | 1+2 | |
| `docs/runbooks/AI_KEY_ROTATION_RUNBOOK.md`, `local-db-backup.md`, `ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md` | 4+1+2 | |
| `docs/training/USER-MANUAL-TR.md`, `TRAINING-SCENARIOS.md`, `quickstart-tenant-admin.md` | 4+1+1 | |
| `docs/README.md` | 1 | |
| `docs/AI_Governance/DEPRECATED_MODULES.md` | 1 | `demo.admin@eski-ad.local` — **tarihi/deprecated kayıt örneği, değiştirilmemeli** |
| `ODC_AI2_ONBOARDING_PROMPT.md` | 1 | `"EskiAd" (repository doganzorlu/eski-ad)` — **harici repo referansı, açık soru** |

#### f) Backlog kayıtları (bu conversation'da üretilen, kronolojik kayıt)

`backlog/TASK-022-*.md` (7 dosya), `backlog/TASK-023-1-*.md`, `backlog/TASK-024-1-*.md` —
toplam 9 dosya, 30 geçiş. Bunlar geçmiş task teslim kayıtları; içerik olarak "ESKI-AD"/"eski-ad"
ürün/repo adına atıfta bulunuyor, kod değişikliği taşımıyor. Rename kapsamına girer ama düşük
risk — sadece metin.

---

## 3. Hedef İsim Mapping Tablosu

### 3.1 Task'ta verilen üst düzey sözleşme (referans)

| Kategori | Hedef |
|---|---|
| Ürün adı | Metnex |
| Repository / klasör | metnex |
| npm scope | `@metnex/*` |
| Docker image prefix | `metnex-` |
| Container / network / stack prefix | `metnex-` |
| Deployment path | `/opt/metnex` |
| PostgreSQL database/user | `metnex` |
| MinIO bucket prefix | `metnex-` |
| Kullanıcı-facing servis adı | Metnex |

### 3.2 Somut, bulgulara bağlanmış mapping

| # | Bulgu (mevcut) | Hedef | Kategori | Örnek konum |
|---|---|---|---|---|
| 1 | `eski-ad` (metin, lowercase) | `metnex` | Genel metin/tanımlayıcı | Çoğu dosya |
| 2 | `ESKI-AD` (metin, uppercase) | `METNEX` | Genel metin/tanımlayıcı | Başlıklar, env prefix'leri |
| 3 | `EskiAd` / `EskiAd` | `Metnex` | Ürün marka adı | `ODC.md`, `docs/project/*.json`, `mfa.service.ts` TOTP issuer |
| 4 | `@eski-ad/web` (npm paket adı) | `@metnex/web` | npm scope | `apps/web/package.json`, `apps/web/Dockerfile` (×2 `--filter`) |
| 5 | `eski-ad` (kök `package.json` adı) | `metnex` | npm paket adı | `package.json` |
| 6 | `com.eski-ad` (Maven groupId + Java package) | `com.metnex` | Java namespace | `services/jasper-renderer/pom.xml`, 24 `.java` dosyası, 2 klasör |
| 7 | `ESKI-AD Jasper Renderer` (Maven `<name>`) | `Metnex Jasper Renderer` | Maven artifact adı | `pom.xml` |
| 8 | `eski-ad-api`, `eski-ad-web`, `eski-ad-jasper-renderer` (Docker image adı) | `metnex-api`, `metnex-web`, `metnex-jasper-renderer` | Docker image | `infra/docker/*.yml`, `.github/workflows/pipeline.yml`, `scripts/check.sh` |
| 9 | `eski-ad-postgres-dev`, `eski-ad-redis-dev`, `eski-ad-minio-dev`, `eski-ad-jasper-renderer-dev` (container adı) | `metnex-postgres-dev`, `metnex-redis-dev`, `metnex-minio-dev`, `metnex-jasper-renderer-dev` | Docker container | `dev.sh`, `infra/docker/docker-compose.dev.yml`, script'ler |
| 10 | `eski-ad` (compose proje adı, `name:` alanı) | `metnex` | Docker Compose project | `infra/docker/docker-compose.dev.yml:1` |
| 11 | `eski-ad-dev`/`eski-ad-test`/`eski-ad-prod` (overlay network + stack adı) | `metnex-dev`/`metnex-test`/`metnex-prod` | Docker Swarm network/stack | `docker-compose.{dev-stack,test,swarm}.yml`, `deployment.md`, `pipeline.yml` |
| 12 | `eski-ad-infra-<env>` (infra stack adı) | `metnex-infra-<env>` | Docker Swarm stack | `docker-compose.infra.yml`, `scripts/db/*.sh` |
| 13 | `eski-ad-registry` (registry stack adı) | `metnex-registry` | Docker Swarm stack | `docker-compose.registry.yml` |
| 14 | `eski-ad` (PostgreSQL user) | `metnex` | Database kimlik doğrulama | `drizzle.config.ts`, `.env.example`, `init-db.sql`, script'ler |
| 15 | `eski-ad` / `eski-ad_dev` / `eski-ad_test` (PostgreSQL database adı) | `metnex` / `metnex_dev` / `metnex_test` | Database adı | `scripts/eski-ad-env-create.sh`, `deployment.md` |
| 16 | `eski-ad-dev`/`eski-ad-test`/`eski-ad-prod` (MinIO bucket) | `metnex-dev`/`metnex-test`/`metnex-prod` | Object storage | `infra/docker/docker-compose.{dev-stack,test,swarm}.yml`, `storage-usage.service.ts` fallback |
| 17 | `/opt/eski-ad` (deployment path) | `/opt/metnex` | Sunucu dosya sistemi | `deployment.md`, `docker-compose.infra.yml`, script'ler, `pipeline.yml` |
| 18 | `eski-ad`/`eski-ad-deploy`/`eski-ad-backup` (Linux grup/kullanıcı) | `metnex`/`metnex-deploy`/`metnex-backup` | Sunucu sistem hesabı | `deployment.md` §4 |
| 19 | `eski-ad-node-01` (hostname örneği) | `metnex-node-01` | Sunucu hostname | `deployment.md` |
| 20 | `eski-ad-swarm` (Swarm cluster adı örneği) | `metnex-swarm` | Docker Swarm init | `deployment.md` |
| 21 | `ghcr.io/<org>/eski-ad-api`, `eski-ad-web` | `ghcr.io/<org>/metnex-api`, `metnex-web` | Container registry path | `pipeline.yml` |
| 22 | `eski-ad-dev.saas.example.com`, `eski-ad-api-dev.saas.example.com` vb. (domain örnekleri) | `metnex-dev.<domain>`, `metnex-api-dev.<domain>` | DNS/domain (örnek değer, gerçek domain kullanıcı kararı) | `deployment.md`, `scripts/eski-ad-env-create.sh` |
| 23 | `eski-ad_refresh_token` (httpOnly cookie) | `metnex_refresh_token` | Auth cookie | `auth.controller.ts` ↔ `refresh.ts` (eşleşmeli) |
| 24 | `eski-ad_tenant_id`, `eski-ad_tenant_name`, `eski-ad_tenant_type`, `eski-ad_is_system_admin`, `eski-ad_is_customer_admin`, `eski-ad_is_impersonating` (cookie'ler) | `metnex_*` eşdeğerleri | Web session/tenant cookie | `middleware.ts`, `tenant-context.ts`, `(app)/layout.tsx`, `(platform)/layout.tsx`, `impersonation.ts` |
| 25 | `eski-ad_access_token`, `eski-ad_language`, `eski-ad_impersonation_original_access_token`, `eski-ad_impersonation_meta` (localStorage) | `metnex_*` eşdeğerleri | Web localStorage | `api.ts`, `session-guard.tsx`, `i18n-config.ts`, `impersonation.ts` |
| 26 | `eski-ad.nav.v1` (localStorage namespace) | `metnex.nav.v1` | Web localStorage | `nav-storage.ts` |
| 27 | `window.__ESKI-AD_API_URL__` (global runtime değişkeni) | `window.__METNEX_API_URL__` | Web runtime config | `layout.tsx`, `api-base.ts` |
| 28 | `eski-ad:tenantchange` (custom DOM event adı) | `metnex:tenantchange` | Web event bus | `tenant-context.ts` |
| 29 | `eski-ad` (varsayılan platform display adı, DB seed/fallback) | `Metnex` | Kullanıcı-facing branding | `platform-settings.service.ts` |
| 30 | `EskiAd` (TOTP/MFA issuer etiketi) | `Metnex` | Kullanıcı-facing (authenticator app) | `mfa.service.ts:76` |
| 31 | `eski-ad-dev-key` (dev-only fallback şifreleme anahtarı, gerçek secret değil) | `metnex-dev-key` | Dev placeholder | `credential-crypto.service.ts` |
| 32 | `name: "EskiAd"`, `slug: "eski-ad"` (ODC makine kaydı) | `name: "Metnex"`, `slug: "metnex"` | ODC identity contract | `ODC.md`, `docs/project/ESKI-AD_*.json` (5 dosya) |
| 33 | `docs/opendevcon/ESKI-AD_STATE.md` (dosya adı) | `docs/opendevcon/METNEX_STATE.md` | ODC dosya adı | Task'ın kalite kapısında açıkça istendi |
| 34 | `docs/project/ESKI-AD_*.json` (5 dosya adı) | `docs/project/METNEX_*.json` | ODC dosya adı | |
| 35 | `docs/runbooks/ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md` (dosya adı) | `docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` | Runbook dosya adı | |
| 36 | `docs/decisions/DEC-0007-eski-ad-db-locale-and-collation.md` (dosya adı) | **DEĞİŞTİRİLMEYECEK** | Tarihi karar kaydı | Bkz. §6 |
| 37 | `scripts/eski-ad-env-create.sh` (dosya adı) | `scripts/metnex-env-create.sh` | Script dosya adı | |
| 38 | `AIS_DEMO_PACKAGE` (migration SQL literal) | **DEĞİŞTİRİLMEYECEK** | Immutable migration | `0002_thick_earthquake.sql` — zaten kaldırılmış demo verisiyle ilgili, `eski-ad` değil `AIS` prefix'i, ayrıca migration dosyaları hiç değiştirilmez |
| 39 | `demo.admin@eski-ad.local` (DEPRECATED_MODULES.md örnek e-posta) | **DEĞİŞTİRİLMEYECEK** | Tarihi/deprecated kayıt | Kaldırılmış Demo Operations modülünün belgelenmiş geçmişi |
| 40 | `docganzorlu/eski-ad` (harici repo referansı) | **Açık soru** | Harici bağımlılık | `ODC_AI2_ONBOARDING_PROMPT.md` — bkz. §8 |
| 41 | `scripts/create-project.sh` / `.ps1` içindeki literal `'eski-ad'`/`'ESKI-AD'` pattern string'leri | **Özel karar gerektirir** | Skeleton'ın kendi rename-generator mantığı | Bkz. §6 — kör replace ile bu script'in KENDİ ÇALIŞMA MANTIĞI bozulabilir |

---

## 4. Runtime / Deployment / Database Etkileri

| Katman | Etki | Otomatik mi, elle mi | Not |
|---|---|---|---|
| **PostgreSQL user/db adı** | `eski-ad` → `metnex` kullanıcı/veritabanı adı değişirse tüm `DATABASE_URL` değerleri (kod varsayılanları + `.env` dosyaları + deployment secret'ları) senkron değişmeli | Elle (deploy runbook) | Local dev'de `docker compose down -v` + yeniden `init-db.sql` ile sıfırdan kurulum mümkün (veri kaybı kabul edilebilir, zaten dev). **Test/prod'da veri taşıma (rename veya dump/restore) gerekir — bu ayrı bir migration task'ı.** |
| **MinIO bucket adı** | `eski-ad-dev/test/prod` → `metnex-dev/test/prod` | Elle | Bucket adını değiştirmek nesneleri taşımaz; yeni bucket oluşturup nesneleri migrate etmek ya da bucket'ı olduğu gibi bırakıp yeni env değişkeniyle eski bucket adını göstermek gerekir. Bu ortamda gerçek MinIO nesnesi olup olmadığı bilinmiyor (açık soru, bkz. §8). |
| **Docker image/container/network/stack adları** | Tüm `infra/docker/*.yml`, `pipeline.yml`, `dev.sh`, `scripts/check.sh` senkron değişmeli | Elle + `docker compose down` / `docker stack rm` + yeniden `up`/`deploy` | Eski adla çalışan container'lar otomatik silinmez; geçiş sırasında hem eski hem yeni adla kaynaklar geçici olarak var olabilir (port çakışması riski). |
| **GHCR image path'leri** | `ghcr.io/<org>/eski-ad-api` → `ghcr.io/<org>/metnex-api` | Elle (CI + deploy stack dosyaları birlikte) | Eski image'lar registry'de kalır (orphan, sonradan temizlenebilir). CI (`pipeline.yml`) ve stack dosyaları (`docker-compose.{test,swarm}.yml`) **aynı PR/commit'te** değişmeli — aksi halde CD, olmayan bir image tag'ini dener. |
| **`/opt/eski-ad` deployment path'i** | Sunucudaki gerçek dizin + `.env` dosyaları + systemd/cron varsa onlar da etkilenir | Elle (sunucu erişimi gerekir) | Bu task kapsamında sunucuya erişim/değişiklik yok; yalnızca kod/doküman içindeki path referansları envanterlendi. |
| **npm scope (`@eski-ad/web` → `@metnex/web`)** | `apps/web/package.json` adı + `apps/web/Dockerfile`'daki iki `--filter @eski-ad/web` satırı **atomik** değişmeli | Elle, tek commit | Senkronsuz değişirse `apps/web` Docker build'i "filter, hiçbir paket eşleşmedi" hatasıyla kırılır. `pnpm-lock.yaml` yeniden `pnpm install` ile senkronlanmalı. |
| **Java package/groupId (`com.eski-ad` → `com.metnex`)** | 2 klasör fiziksel taşınmalı, 24 `.java` dosyasında `package`/`import` satırları güncellenmeli, `pom.xml` `groupId` değişmeli | Elle (IDE refactor veya dikkatli `sed` + dizin taşıma) | Mekanik ama hataya açık — bir dosyanın `package` satırı unutulursa derleme hatası. Şu an yayınlanmış/dış tüketilen bir Maven artifact'ı yok (yalnızca local Docker build), bu yüzden dış etki düşük. |
| **Cookie adları (auth/tenant/impersonation)** | `apps/api` (set eden) ile `apps/web` (okuyan) **aynı anda** değişmeli | Elle, tek commit | **Deploy anındaki tüm aktif kullanıcı oturumları geçersiz kalır** (tarayıcıda eski isimli cookie var, sunucu yeni ismi arıyor) — zorunlu re-login. Kabul edilebilir mi, yoksa geçiş dönemi (dual-read) mi isteniyor, açık soru (§8). |
| **localStorage anahtarları (access token, dil, nav state, impersonation)** | Aynı senkron zorunluluğu, `apps/web` içi | Elle | Aynı risk — kullanıcı tarayıcısında eski anahtarlar kalır, yeni kodda okunmaz → oturum/dil tercihi/nav durumu sıfırlanır. Şifre/PII kaybı yok, yalnızca UX sıfırlanması. |
| **`window.__ESKI-AD_API_URL__`** | `layout.tsx` (yazan) + `api-base.ts` (okuyan) senkron | Elle | Server-side render edilen inline script; deploy anında hemen etkili olur, geçmiş tarayıcı state'i etkilemez (sayfa yenilemesiyle güncellenir). |
| **ODC.md + `docs/project/ESKI-AD_*.json`** | Makine tarafından okunabilir proje kimliği | Elle | Harici bir OpenDevConnect (ODC) aracı bu dosyaları otomatik tüketiyorsa (bu repo içinden doğrulanamadı), rename o entegrasyonu bozabilir — açık soru (§8). |
| **`docs/opendevcon/ESKI-AD_STATE.md`** | Task'ın kalite kapısında `METNEX_STATE.md` olarak hedeflendi | Elle | Bu dosya `AGENT_BOOTSTRAP.md`'nin "Reporting Rule"ünde ve tüm önceki backlog task'larında sabit yol olarak referans alınıyor — rename edilirse **tüm** governance dosyalarındaki yol referansları da güncellenmeli (döngüsel bağımlılık, TASK-024.2+'a not edildi). |

---

## 5. Rename Sırası ve Dosya Sahipliği

Bu bölüm **öneri**dir — hiçbiri bu task'ta uygulanmadı. Sıralama, "geri alınması kolay / risk
düşük"ten "geri alınması zor / risk yüksek"e doğru ilerler; her adım ayrı bir task olarak
planlanmalı ve bir önceki adım `./scripts/check.sh --skip-docker` yeşil olmadan bir sonrakine
geçilmemelidir.

| Sıra | Adım | Kapsam | Risk |
|---|---|---|---|
| 1 | Saf dokümantasyon/marka metni | `docs/training/**`, `docs/ui-contract/**`, `docs/AI_Governance/*.md` başlıkları, `README.md`, `docs/README.md` | Yok — kod/veri etkisi sıfır |
| 2 | ODC kimlik kayıtları | `ODC.md`, `docs/project/ESKI-AD_*.json` → `METNEX_*.json` | Düşük — yalnızca ODC harici entegrasyonu varsa etki (açık soru) |
| 3 | ODC durum/runbook dosya adları | `docs/opendevcon/ESKI-AD_STATE.md` → `METNEX_STATE.md`, `docs/runbooks/ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md` → `METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` | Orta — bu dosyalara yapılan **tüm** çapraz referanslar (AGENT_BOOTSTRAP.md, backlog/*.md, PROGRESS_LOG.md geçmiş girdileri hariç) güncellenmeli |
| 4 | Geçmiş kayıtların KORUNMASI teyidi | `DEC-0007/0008/0009/0012/0013`, `docs/opendevcon/PROGRESS_LOG.md` geçmiş girdileri, `DEPRECATED_MODULES.md` | Değişiklik yok — sadece "dokunulmadı" doğrulaması |
| 5 | npm scope + Dockerfile filter (atomik) | `apps/web/package.json`, `apps/web/Dockerfile` (2 satır), `package.json` (kök) | Yüksek eğer senkronsuz yapılırsa — build kırılır |
| 6 | Java package/groupId (mekanik) | `services/jasper-renderer/{pom.xml, 2 klasör taşıma, 24 .java dosyası, application.yml}` | Orta — mekanik ama hataya açık, derleme ile doğrulanabilir |
| 7 | Uygulama runtime varsayılanları (dev-only) | `drizzle.config.ts`, `check-db.js`, `.env.example` dosyaları, `credential-crypto.service.ts` fallback, `storage-usage.service.ts` fallback, `platform-settings.service.ts` varsayılan adı, `mfa.service.ts` TOTP issuer | Düşük — sadece varsayılan/fallback değerler, gerçek `.env` içeriğini etkilemez |
| 8 | Docker Compose (yerel) | `infra/docker/docker-compose.dev.yml`, container adları, `dev.sh` | Orta — yerel geliştirme ortamı yeniden `./dev.sh --stop && ./dev.sh` gerektirir |
| 9 | Tarayıcı state'i (cookie/localStorage/window global) | `apps/web/src/{middleware.ts, lib/*, app/**/layout.tsx, components/*}`, `apps/api/src/platform/auth.controller.ts` | **En yüksek kullanıcı etkisi** — tüm aktif oturumlar geçersiz kalır; deploy penceresi/duyuru gerektirir |
| 10 | Docker Compose (deployment stack'leri) + CI | `docker-compose.{dev-stack,test,swarm,infra,registry}.yml`, `.github/workflows/pipeline.yml` | Yüksek — CI ve stack dosyaları aynı anda değişmeli, GHCR image path'leri |
| 11 | Sunucu/altyapı (gerçek ortam) | `/opt/eski-ad` → `/opt/metnex`, Linux kullanıcı/grup, hostname, PostgreSQL gerçek user/db, MinIO gerçek bucket, DNS/domain | **Kapsam dışı, ayrı bir deployment runbook/task gerektirir** — kod değişikliği değil, sunucu operasyonu |
| 12 | Fork-generator script'lerinin kendisi | `scripts/create-project.sh`, `scripts/create-project.ps1` | **Özel karar gerektirir** — bkz. §6 |

**Dosya sahipliği:** Bu proje tek bir AI2 (Engineering Executor) tarafından yürütüldüğünden
"sahiplik" insan-takım anlamında değil, **hangi adımın hangi task/teslimde ele alınacağı**
anlamında kullanılmalıdır — her adım kendi `TASK-024.N` kaydına ve `./scripts/check.sh` kanıtına
sahip olmalı, tek dev büyük bir "rename her şeyi" commit'i olmamalı.

---

## 6. Veri Kaybı, Downtime, Redirect ve Geriye Dönük Uyumluluk Riskleri

| Risk | Şiddet | Açıklama | Azaltma önerisi |
|---|---|---|---|
| **Cookie/localStorage rename → oturum kaybı** | Yüksek | Deploy anında aktif tüm kullanıcılar zorla logout olur (auth cookie'si dahil) | Deploy penceresi planla, kullanıcıları önceden bilgilendir; alternatif: geçiş sürümünde API'nin hem eski hem yeni cookie adını okuması (dual-read), sonraki sürümde eskisi kaldırılır |
| **PostgreSQL user/db rename (test/prod)** | Yüksek | Gerçek ortamlarda kullanıcı/DB adı değişimi veri taşıma veya downtime gerektirir | Local dev'de veri kaybı kabul edilebilir (sıfırdan `init-db.sql`); test/prod için ayrı bir DB migration/rename runbook'u gerekir — bu task'ın kapsamı dışında |
| **MinIO bucket rename** | Orta | Bucket adı değişirse eski bucket'taki nesneler yeni koddan erişilemez hale gelir (silinmez ama "kaybolmuş" görünür) | Nesne taşıma script'i veya bucket adını sabit tutup yalnızca env değişkenini yeniden adlandırma (bucket'ın kendisini rename etmeme) seçeneği değerlendirilmeli |
| **Docker image/network/stack adı senkronsuzluğu** | Yüksek (geçici) | CI ve deployment stack dosyaları aynı anda değişmezse CD, var olmayan image tag'ini çekmeye çalışır → deploy başarısız | Aynı PR/commit'te değiştir, `docker compose config` ile statik doğrulama yap (bu task'ta zaten örneklendi) |
| **npm scope / Dockerfile filter senkronsuzluğu** | Yüksek (geçici) | `apps/web/package.json` adı değişip `Dockerfile` değişmezse (veya tersi) `pnpm --filter` hiçbir paket bulamaz, build kırılır | Atomik commit + `docker build` (Docker mevcutsa) veya en azından `pnpm --filter <yeni-ad> build` yerel doğrulaması |
| **Java package rename hatası** | Orta | Bir dosyanın `package`/`import` satırı atlanırsa derleme hatası | `mvn compile` ile anında yakalanır (mekanik hata, veri kaybı riski yok) |
| **create-project.sh/.ps1 kendi mantığının bozulması** | Yüksek (kavramsal) | Bu script'ler `'eski-ad'`'ı **bu projenin adı olarak değil, "eski skeleton adı → yeni fork adı" placeholder pattern'i olarak** kullanıyor. Script'in kendi literal string'lerini körü körüne `metnex`'e çevirmek, script'in gelecekte BAŞKA bir fork oluştururken artık `eski-ad` deseni yerine `metnex` deseni arayacağı anlamına gelir — bu proje zaten "eski-ad" adını taşımadığı için script kırılmaz ama **niyeti** değişir (artık "metnex"ten yeni fork üretir, "eski-ad"tan değil) | Bu, bir "bug" değil bir **karar**dır: script bu repo'nun (artık Metnex) kendi identity'sini mi arayacak (`metnex`→yeni-fork-slug) yoksa hâlâ tarihi/genel bir placeholder mı kalacak. Sonraki task'ta AI1 kararı gerekir |
| **ODC.md / `docs/project/*.json` harici tüketim riski** | Bilinmiyor | Bu dosyaların bir "OpenDevConnect" harici aracı tarafından otomatik okunup okunmadığı bu repo içinden doğrulanamadı | Rename öncesi ODC entegrasyonunun var olup olmadığı netleştirilmeli (açık soru §8) |
| **Git history rewrite** | Yok / kapsam dışı | Bu ortamda `.git` dizini yok, `git remote -v` boş — **repository şu an git kontrolünde değil**. Gerçek bir git deposuna dönüştürüldüğünde (ör. `git init` + gerçek remote), geçmiş commit mesajlarında "eski-ad" geçip geçmeyeceği o noktada yeni bir karardır | Bu task git history rewrite yapmadı ve yapamaz (repo yok); ileride gerçek bir git geçmişi oluşursa rewrite **kapsam dışı** kalmaya devam etmeli (kullanıcı açıkça istemedikçe) |
| **Tarihi kayıtların (DEC-*, PROGRESS_LOG geçmiş girdileri, DEPRECATED_MODULES örnekleri) yanlışlıkla rewrite edilmesi** | Yüksek (governance ihlali) | Bu dosyalar `AGENT_BOOTSTRAP.md` ve proje geçmişi gereği **immutable** kabul edilir | Rename script'i/task'ı bu dosyaları allowlist DIŞINDA (yani dokunulmayacaklar listesinde) tutmalı |
| **Downtime (gerçek test/prod ortamı)** | Değerlendirilemedi | Bu envanter yalnızca kod/doküman taraması; gerçek test/prod sunucusuna erişim yok | Gerçek ortamlarda DB/network/container rename bir bakım penceresi gerektirir — ayrı bir deployment runbook konusu |

---

## 7. Rename Sonrası Doğrulama Komutları

Bu komutlar, **gelecekteki** rename task'larının (TASK-024.2+) tamamlandığını doğrulamak için
hazırlanmıştır — bu task'ta henüz çalıştırılacak bir "sonrası" yoktur (hiçbir rename yapılmadı).

```bash
# 1. Kalan eski isim taraması — sıfır sonuç beklenir (tarihi kayıtlar hariç, bkz. not)
rg -n -i 'openmas|aiskeleton' --hidden \
  -g '!node_modules' -g '!.git' -g '!.next' -g '!dist' -g '!coverage' -g '!target' .

# Not: docs/decisions/DEC-0007..0013, docs/opendevcon/PROGRESS_LOG.md (geçmiş girdiler),
# docs/AI_Governance/DEPRECATED_MODULES.md, apps/api/drizzle/migrations/**
# BEKLENEN kalıcı istisnalardır — bu dosyalarda kalan "openmas" bulgusu HATA DEĞİLDİR.

# 2. Dosya/klasör adı taraması — sıfır sonuç beklenir (istisnalar hariç)
find . -iname "*openmas*" -not -path "*/node_modules/*" -not -path "*/.git/*"

# 3. npm scope tutarlılığı
grep -rn "@openmas" --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.yml" --include="Dockerfile*" . | grep -v node_modules
# → boş olmalı

# 4. Java package tutarlılığı
grep -rln "com\.openmas" services/jasper-renderer/src
# → boş olmalı
grep -c "com\.metnex" services/jasper-renderer/src/main/java/com/metnex/jasperrenderer/JasperRendererApplication.java 2>/dev/null

# 5. Docker Compose statik doğrulama (Docker gerektirmez)
docker compose -f infra/docker/docker-compose.dev.yml config --quiet
docker compose -f infra/docker/docker-compose.test.yml config --quiet
docker compose -f infra/docker/docker-compose.swarm.yml config --quiet
docker compose -f infra/docker/docker-compose.dev-stack.yml config --quiet

# 6. Maven derleme doğrulaması (Docker/Maven mevcutsa)
docker run --rm -v "$(pwd)/services/jasper-renderer:/build" -w /build \
  maven:3.9-eclipse-temurin-21 mvn -B -q compile

# 7. Cookie/localStorage/window-global çift taraflı tutarlılık
grep -n "metnex_refresh_token" apps/api/src/platform/auth.controller.ts apps/web/src/lib/refresh.ts
grep -n "__METNEX_API_URL__" apps/web/src/app/layout.tsx apps/web/src/lib/api-base.ts

# 8. Bütüncül kalite kapısı
./scripts/check.sh --skip-docker
```

---

## 8. Açık Sorular ve Varsayımlar

| # | Soru | Neden önemli | Varsayım (netleşene kadar) |
|---|---|---|---|
| 1 | `ODC_AI2_ONBOARDING_PROMPT.md`'de geçen `doganzorlu/eski-ad` gerçek bir GitHub repository mi, yoksa şablon metni mi? Bu repo şu an git kontrolünde değil (`.git` yok, remote yok) | Rename'in bir "yeni repo taşıma" mı yoksa "mevcut in-place rename" mi olacağını belirler | Bu ortamda git repository olmadığı için bu referansın **miras kalan şablon metni** olduğu, gerçek bir aktif remote olmadığı varsayıldı |
| 2 | ODC (OpenDevConnect) harici bir araç `ODC.md` / `docs/project/ESKI-AD_*.json` / `docs/opendevcon/ESKI-AD_STATE.md`'yi otomatik okuyor mu? | Rename bu entegrasyonu sessizce bozabilir | Bu repo içinden doğrulanamadı; TASK-024.2 öncesi netleştirilmeli |
| 3 | PostgreSQL/MinIO gerçek test/prod ortamlarında canlı veri var mı, yoksa proje hâlâ saf-skeleton aşamasında mı? | DB/bucket rename'in "veri taşıma" mı "sıfırdan init" mi gerektireceğini belirler | Bu ortamda yalnızca local dev container'ları gözlemlenebildi (`eski-ad-postgres-dev` vb.); test/prod'un varlığı doğrulanamadı |
| 4 | Kullanıcı oturumu sürekliliği: cookie/localStorage rename sırasında mevcut kullanıcıların zorla logout olması kabul edilebilir mi, yoksa dual-read geçiş dönemi mi isteniyor? | Adım 9'un (§5) uygulama stratejisini belirler | Netleşene kadar "kabul edilebilir tek seferlik logout" varsayılmadı — bu bir ürün/iş kararı, AI2 tek taraflı varsaymadı |
| 5 | `scripts/create-project.sh`/`.ps1` kendisi rename edilecek mi, yoksa bu script'lerin `'eski-ad'`/`'ESKI-AD'` literal pattern'leri (genel skeleton-fork mekanizması olarak) korunacak mı? | §6'da detaylandırılan kavramsal risk | Netleşene kadar bu script'ler **dokunulmamış** kabul edildi; TASK-024.2+ öncesi AI1 kararı gerekir |
| 6 | Gerçek deployment domain'leri (`saas.example.com` örnekleri) gerçek bir domain mi yoksa placeholder mı? | §3.2 madde 22 | `deployment.md` içindeki `saas.example.com` zaten placeholder olarak işaretli (örnek domain); gerçek Metnex domain'i ayrı bir karar |
| 7 | `AIS_` env var prefix'i (`AIS_DEMO_PACKAGE`, tarihi migration'da) "eski-ad" ile mi ilişkili yoksa bağımsız bir kısaltma mı? | Yanlışlıkla rename kapsamına alınmasın diye | İncelendi: `AIS` muhtemelen "EskiAd" kısaltması, ancak bu env var zaten kaldırılmış Demo Operations'a ait ve yalnızca immutable migration SQL'inde kalıyor — **rename kapsamı dışı** (hem tarihi hem işlevsiz) |

---

## 9. Ek: Ham Tarama Çıktısı (dosya:geçiş-sayısı)

Aşağıdaki liste `rg -c -i 'eski-ad|eski-urun'` çıktısının tamamıdır (147 dosya, 572 toplam
geçiş) — §2'deki kategorik tabloların kaynağıdır.

```
apps/api/drizzle.config.ts:1
apps/api/.env.example:2
apps/api/scripts/check-db.js:1
apps/api/src/platform/auth.controller.ts:1
apps/api/src/platform/mfa.service.ts:1
apps/api/src/platform/storage-usage.service.ts:1
apps/api/src/settings/credential-crypto.service.ts:1
apps/api/src/settings/platform-settings.service.ts:2
apps/web/Dockerfile:2
apps/web/.env.example:1
apps/web/package.json:1
apps/web/src/app/(app)/layout.tsx:3
apps/web/src/app/layout.tsx:2
apps/web/src/app/login/page.tsx:1
apps/web/src/app/(platform)/layout.tsx:3
apps/web/src/components/app-sidebar.tsx:1
apps/web/src/components/console-shell.tsx:1
apps/web/src/components/glass-console/console-shell.tsx:1
apps/web/src/components/session-guard.tsx:1
apps/web/src/lib/api-base.ts:2
apps/web/src/lib/api.ts:1
apps/web/src/lib/i18n/i18n-config.ts:1
apps/web/src/lib/impersonation.ts:5
apps/web/src/lib/nav-storage.spec.ts:1
apps/web/src/lib/nav-storage.ts:1
apps/web/src/lib/refresh.ts:2
apps/web/src/lib/tenant-context.ts:5
apps/web/src/middleware.ts:6
backlog/TASK-022-1-jasper-render-service.md:1
backlog/TASK-022-2-reporting-dataset-provider-abstraction.md:1
backlog/TASK-022-3-demo-operations-removal.md:2
backlog/TASK-022-3-R1-demo-specific-filter-cleanup.md:1
backlog/TASK-022-4-jasper-render-service-deployment-contract.md:4
backlog/TASK-022-5-jasper-renderer-service.md:10
backlog/TASK-022-5-R1-api-renderer-template-registry-alignment.md:2
backlog/TASK-023-1-botc-source-schema-and-migration-inventory.md:3
backlog/TASK-024-1-metnex-rename-inventory-and-naming-contract.md:6
dev.sh:21
docs/AI_Governance/AGENT-OPERATING-MODEL.md:1
docs/AI_Governance/AGENT_REGISTRY.md:1
docs/AI_Governance/DEPRECATED_MODULES.md:1
docs/AI_Governance/SDLC-CHECKLIST.md:1
docs/decisions/DEC-0007-openmas-db-locale-and-collation.md:4
docs/decisions/DEC-0008-package-provisioned-demo-and-reporting-foundation.md:1
docs/decisions/DEC-0009-shared-schema-tenant-isolation-hardening.md:1
docs/decisions/DEC-0012-demo-operations-removal.md:1
docs/decisions/DEC-0013-jasper-renderer-service.md:2
docs/domain/DB-METADATA-TEMPLATE.md:1
docs/domain/DB_META.md:6
docs/domain/DOMAIN_MODEL.md:2
docs/opendevcon/OPENMAS_STATE.md:1
docs/opendevcon/PROGRESS_LOG.md:14
docs/project/OPENMAS_DELIVERY.json:2
docs/project/OPENMAS_EXECUTION.json:2
docs/project/OPENMAS_PLAN.json:2
docs/project/OPENMAS_SCOPE.json:2
docs/project/OPENMAS_TRACEABILITY.json:2
docs/README.md:1
docs/requirements/DISCOVERY.md:28
docs/requirements/SRS.md:3
docs/runbooks/AI_KEY_ROTATION_RUNBOOK.md:4
docs/runbooks/db-collation-strategy.md:7
docs/runbooks/db-recreate-with-icu.md:14
docs/runbooks/deployment.md:71
docs/runbooks/local-db-backup.md:1
docs/runbooks/local-development.md:3
docs/runbooks/OPENMAS_LIFECYCLE_AND_STATUS_RUNBOOK.md:2
docs/runbooks/PRODUCT_OWNER_LIFECYCLE_PLAYBOOK.md:3
docs/runbooks/reporting-foundation.md:10
docs/security/APPLICATION_SECURITY_ARCHITECTURE.md:4
docs/training/quickstart-tenant-admin.md:1
docs/training/TRAINING-SCENARIOS.md:1
docs/training/USER-MANUAL-TR.md:4
docs/ui-contract/components/badge.md:1
docs/ui-contract/components/button.md:1
docs/ui-contract/components/dropdown.md:1
docs/ui-contract/components/input.md:1
docs/ui-contract/foundations/colors.md:1
docs/ui-contract/foundations/motion.md:2
docs/ui-contract/foundations/spacing.md:1
docs/ui-contract/foundations/typography.md:1
docs/ui-contract/governance/deviation-log.md:1
docs/ui-contract/governance/override-rules.md:1
docs/ui-contract/patterns/crud-screen.md:1
docs/ui-contract/patterns/dashboard.md:1
docs/ui-contract/patterns/empty-state.md:1
docs/ui-contract/patterns/form.md:1
docs/ui-contract/patterns/layout.md:1
docs/ui-contract/patterns/modal-drawer.md:1
docs/ui-contract/patterns/table.md:1
docs/ui-contract/UI_CONTRACT.md:2
.github/workflows/pipeline.yml:12
infra/docker/docker-compose.dev-stack.yml:17
infra/docker/docker-compose.dev.yml:9
infra/docker/docker-compose.infra.yml:9
infra/docker/docker-compose.registry.yml:1
infra/docker/docker-compose.swarm.yml:17
infra/docker/docker-compose.test.yml:17
infra/docker/.env.example:3
infra/docker/init-db.sql:1
ODC_AI2_ONBOARDING_PROMPT.md:1
ODC.md:3
package.json:1
README.md:9
scripts/backup-db.sh:5
scripts/check.sh:3
scripts/create-project.ps1:6
scripts/create-project.sh:6
scripts/db/recreate-db-with-icu.sh:17
scripts/db/verify-db-locale.sh:9
scripts/hooks/pre-commit:6
scripts/openmas-env-create.sh:11
scripts/restore-db.sh:9
scripts/setup-hooks.sh:2
services/jasper-renderer/Dockerfile:1
services/jasper-renderer/pom.xml:2
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/config/RendererProperties.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/ForbiddenTemplateContentException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/GlobalExceptionHandler.java:2
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/InvalidTemplateIdException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/PayloadTooLargeException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/RendererException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/RenderFailedException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/RenderTimeoutException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/TemplateNotFoundException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/exception/UnsupportedFormatException.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/JasperRendererApplication.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/render/JasperRenderService.java:8
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/render/RenderedDocument.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/security/LimitedServletInputStream.java:2
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/security/PayloadSizeFilter.java:2
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/security/RendererErrorResponses.java:2
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/security/TokenAuthFilter.java:2
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/template/JrxmlSandbox.java:3
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/template/TemplateRegistry.java:5
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/web/dto/ErrorResponse.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/web/dto/RenderRequest.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/web/dto/RenderRow.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/web/HealthController.java:1
services/jasper-renderer/src/main/java/com/openmas/jasperrenderer/web/RenderController.java:4
services/jasper-renderer/src/main/resources/application.yml:1
services/jasper-renderer/src/test/java/com/openmas/jasperrenderer/template/JrxmlSandboxTest.java:3
services/jasper-renderer/src/test/java/com/openmas/jasperrenderer/template/TemplateRegistryTest.java:4
services/jasper-renderer/src/test/java/com/openmas/jasperrenderer/web/RenderControllerLimitsTest.java:4
services/jasper-renderer/src/test/java/com/openmas/jasperrenderer/web/RenderControllerPayloadSizeTest.java:4
services/jasper-renderer/src/test/java/com/openmas/jasperrenderer/web/RenderControllerTest.java:4
services/jasper-renderer/src/test/java/com/openmas/jasperrenderer/web/RenderControllerTimeoutTest.java:4
```

---

## 10. Teslim Özeti (Kapsam Doğrulaması)

- **Değiştirilen production kodu:** Yok.
- **Değiştirilen veritabanı:** Yok.
- **Değiştirilen deployment yapılandırması:** Yok.
- **Değiştirilen Git geçmişi:** Yok — repository zaten git kontrolünde değil (`.git` yok,
  `git remote -v` boş).
- **BOTC repository'sinde değişiklik:** Yok — bu envanter yalnızca bu repository'yi taradı.
- **Eklenen tek dosya:** `docs/rename/METNEX_RENAME_INVENTORY.md` (bu belge).
