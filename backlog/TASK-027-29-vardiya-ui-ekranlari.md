---
id: TASK-027.29
title: Migration ve Runtime Database Connection Security Hardening
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Vardiya UI ekranları" placeholder'ıydı. AI1'in talimatıyla kapsam **migration/runtime DB bağlantı güvenliği sertleştirmesi**
> olarak yeniden tanımlandı; **Vardiya UI bu task'ta yapılmadı**. Orijinal placeholder en altta tarihi kayıt olarak korunmuştur. Talimat dosya adı
> `TASK-027-29-migration-connection-security-hardening.md` idi; aynı ID için ikinci dosya açılmadı, mevcut dosya güncellendi.

## AI2 Teslim Raporu (2026-09-21)

**Uygulanan AI1 güvenlik kararı:** `DATABASE_URL` her ortamda zorunlu; sabit fallback yok; eksik/hatalı → fail-fast; gerçek değer loglanmaz/raporlanmaz; geliştirmede de zorunlu (sessiz localhost/default yok).

### Değişen dosyalar
| Dosya | Değişiklik |
|---|---|
| `apps/api/src/db/database-url.ts` (yeni) | `requireDatabaseUrl()`: boş → `DATABASE_URL is required`; biçim/protokol hatalı → `DATABASE_URL is invalid`; değer yankılanmaz |
| `apps/api/drizzle.config.ts` | Sabit fallback kaldırıldı; `requireDatabaseUrl()` kullanır |
| `apps/api/scripts/check-db.js` | Sabit fallback kaldırıldı; eksik/hatalı → `exit 1` + güvenli mesaj; `maskUrl` korundu; `require` yan etkisiz (test edilebilir) |
| `apps/api/src/db/db.service.ts` | `new Pool({ connectionString: requireDatabaseUrl() })` — `DATABASE_URL` yoksa **Pool oluşmadan** fail-fast (pg/libpq varsayılanına düşmez) |
| `.github/workflows/pipeline.yml` | `source .env` ve `set -a` kaldırıldı; `-e DATABASE_URL="$DATABASE_URL"` kaldırıldı; özel (`umask 077`) `--env-file` + `trap`/`rm`; `docker stack deploy` için açık env allowlist |
| `scripts/ci/env-allowlist.sh` (yeni) | Adı verilen değişkenleri dosyayı çalıştırmadan okuyan yardımcılar (`read_env_var`, `export_env_allowlist`, `write_env_file_var`); değer basılmaz/argv'ye girmez |
| `.dockerignore` (yeni) | `.env`, `.env.*`, `*.pem`, `*.key`, `*.crt`, `backup/`, `node_modules/`, `.git/`, `coverage/`, `dist/` (+ `**/`, `.next/`, `.turbo/`) |
| `apps/api/src/db/connection-security.spec.ts` (yeni) | 38 test (aşağıda) |
| `docs/migration/METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md` | §8 uygulama durumu, §9 kimlik sınırı, başlıkta güncel durum notu |
| `docs/migration/METNEX_MIGRATION_ENTRYPOINT_PROVENANCE.md` | §6 TASK-027.29 sonrası güncel durum |
| `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` | append-only (Q-DP07 uygulandı, Q-DP02/Q-DP08 açık, yeni Q-DP09) |

`dev.sh` değişmedi: `apps/api/.env`'i (DATABASE_URL dahil) migration'dan önce zaten yazıyor; `apps/api/.env.example` `DATABASE_URL` anahtarını içeriyor; `create-project.sh` `.env.example`'ı `.env`'e kopyalıyor.

### Testler (38 yeni, gerçek DB'ye bağlanmaz)
`DATABASE_URL` mevcut → başarı; yok/boş/hatalı → fail-fast (mesajda değer yok); `check-db.js` spawn ile `exit 1` (bağlantı denenmez); sabit fallback/kimlik bilgili URL kaynakta yok (dört dosya);
`DbService` `DATABASE_URL` yokken Pool oluşturmaz (mock), varsa yalnızca o değerle oluşturur; pipeline'da `source .env`/`set -a`/`-e DATABASE_URL=`/`set -x` yok, `--env-file`+`umask 077`+`trap` var, allowlist compose değişkenleriyle senkron;
`.dockerignore` gerekli kuralları içerir ve Dockerfile girdilerini dışlamaz; `env-allowlist.sh` (tırnak, `export`, `=` içeren değer, son tanım kazanır, yalnızca allowlist export, isim-yalnızca mesajlar, 0600 dosya, geçersiz isim reddi).
Eski kalıplar üzerinde regex'lerin **tespit ettiği** ayrıca elle doğrulandı. `drizzle-kit check` ile config yükleme (URL var/yok/hatalı) DB'ye bağlanmadan doğrulandı.

### Migration/runtime kimlik sınırı
Belgelendi (`…CONNECTION_SECURITY_BOUNDARY.md` §9): runtime (DML), control-plane migration (DDL), data-plane fan-out runner (DDL, hedef schema'lar) ayrı kimlikler olmalı; **bugün tek kimlik**; **hiçbir kimlik/parola oluşturulmadı**;
önerilen env adı `MIGRATION_DATABASE_URL` henüz hiçbir kod tarafından okunmuyor; `isSystemAdmin`/`PLATFORM_ROOT`/`TENANT_ADMIN` DB migration yetkisi **değildir**.

### Kalan blocker'lar ve riskler
- **Q-DP02 ve Q-DP08 AÇIK (kapatılmadı):** `dist/migrate.js` **oluşturulmadı**; pipeline'daki `node apps/api/dist/migrate.js` çağrısı **değişmedi** (hedef dosya yok → migration adımı başarısız, deploy durur). Yalnızca secret aktarımı değişti.
- **Q-DP09 (yeni):** `--env-file` değeri argv/süreç listesi/workflow loglarından çıkarır ama migration container'ının `Config.Env`'i `docker inspect`'te görünür; `docker stack deploy` interpolasyonu değerleri servis tanımına yazar (mevcut tasarım). Tam gizleme `*_FILE` deseni ve uygulama desteği ister.
- Sunucudaki `.env` biçimi (düz `KEY=VALUE`, kabuk genişletmesi yok) `[DOĞRULANAMADI]`: eski `source` genişletmesine bağlı bir değer literal aktarılır → **ilk dev deploy'unda doğrulanmalı**. Pipeline runner'da çalıştırılamadı (statik + yerel bash testleri kanıt).
- P6 (`cancel-in-progress: true`), CI migration artifact doğrulaması yok, `dev.sh` `db:generate` — bu task kapsamı dışı, açık.
- `db:generate` da artık `DATABASE_URL` ister (drizzle config yüklenirken); dev akışları `.env` sağlıyor.

**Yapılmayanlar:** `dist/migrate.js`/migration entrypoint, fan-out runner, `pgSchema()`, schema/migration/seed, tenant/mapping, DB role/RLS, gerçek PostgreSQL/SQL Server bağlantısı, gerçek secret/parola/connection string, Docker build/run, Vardiya UI, Wave 2/3, git commit/push.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (**37 suite / 371 test**; önceki 36/333 → +1 suite, +38 test), typecheck/lint/build temiz.

### Durum
`status: done` — bağlantı güvenliği implementation'ı AI1 tarafından onaylanmıştır.

## AI1 Onay — 2026-09-21

TASK-027.29 teslimatı kapsamına uygun bulunarak onaylandı ve `done` olarak kapatıldı.
`DATABASE_URL` zorunlu/fail-fast politikası, sabit fallback'lerin kaldırılması, güvenli
allowlist env aktarımı, `.dockerignore` ve 38 yeni güvenlik testi kabul edildi.

Q-DP07, AI1 kararıyla **kapandı**: her ortamda `DATABASE_URL` zorunludur; sabit fallback
yoktur; değer loglanmaz veya raporlanmaz. Q-DP02 ve Q-DP08 açık kalmıştır. Yeni Q-DP09
(Docker `Config.Env` görünürlüğü, `*_FILE`/Docker secrets ve sunucu `.env` biçimi) açık
karar/risk olarak korunmuştur. `dist/migrate.js`, fan-out runner, DB role/RLS ve Vardiya UI
oluşturulmamıştır.

---

# TASK-027.29: Vardiya UI ekranları

## Amaç

Vardiya CRUD/list/detail akışlarını UI Contract’a uygun oluştur.

## Wave ve bağımlılık

TASK-027.24; TASK-027.25

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
