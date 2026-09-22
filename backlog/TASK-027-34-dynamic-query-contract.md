---
id: TASK-027.34
title: Data-Plane Hedef Ortam ve PostgreSQL Readiness Evidence
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Dynamic query contract" (Wave 5, SCADA/DMS) placeholder'ıydı. AI1'in talimatıyla kapsam **data-plane hedef ortam ve PostgreSQL readiness evidence (salt-okuma)** olarak yeniden tanımlandı;
> **dynamic query contract bu task'ta yapılmadı** (Wave 5). Orijinal placeholder en altta tarihi kayıt olarak korunmuştur. Talimatta backlog dosya adı verilmemişti; aynı ID'nin mevcut dosyası güncellendi.

## AI2 Teslim Raporu (2026-09-21)

**Yalnızca salt-okuma kanıt toplama. Hiçbir veri/schema/rol/yetki/owner/migration değişmedi; production'a bağlanılmadı; kod, yapılandırma, DEC değişmedi.** Teslim dosyası: `docs/migration/METNEX_DATA_PLANE_TARGET_ENVIRONMENT_READINESS.md` (her konu için kanıt, sorgu türü, sonuç, güven, prod'da doğrulanamayan, karar etkisi, sonraki task; Ek A sorgu türleri).

### Yöntem
Dev PostgreSQL container'ı (`metnex-postgres-dev`) **durmuş** bulundu (`Exited (255)`); yalnızca bu mevcut container `docker start` ile başlatıldı ve iş bitince `docker stop` ile durduruldu (silme/`down -v`/prune/reset/rename yok; diğer projelerin container'larına ve volume'lere dokunulmadı; son durum `Exited (0)`).
Bağlantı `default_transaction_read_only=on` ile açıldı (doğrulandı), yalnızca `SELECT`/`SHOW`; bağlantı dizesi hiçbir yere yazılmadı/yazdırılmadı; `pg_authid` sorgulanmadı; tenant adı/slug'ı seçilmedi; betikler repoya yazılmadı (scratchpad).

### Sonuçlar (dev; production `[DOĞRULANAMADI]`)
1. **PG sürümü:** 16.15 (infra compose da `postgres:16-alpine`). `to_regnamespace` mevcut.
2. **Pooler:** doğrudan bağlantı (20 ardışık ifadede tek backend PID; tek oturum; Docker port eşlemesi; repoda/compose'da pooler yok). **Prod doğrulanamadı.**
3. **`pg_namespace`/görünürlük:** `pg_namespace`/`pg_roles` PUBLIC SELECT; `information_schema.schemata` yetkiye göre süzülür (görünüm tanımı kanıtlı; superuser ile ampirik gösterilemedi).
4. **Eski schema'lar:** `platform`/`shared`/`customer_root` **var ama tamamen boş** (0 ilişki, 0 fonksiyon), kodda **kullanılmıyor**; tek referans `scripts/db/recreate-db-with-icu.sh`'de var olmayan `platform._migration_log`; `init-db.sql` dev ve infra compose'unda initdb'ye bağlı.
5. **Customer schema adları:** dev'de **hiç customer schema ve registry satırı yok** → gerçek veride sınanamadı; üretici gerçek ROOT id'si için uyumlu ad üretiyor (yalnızca yerel hesap).
6. **Tenant id'leri:** 2/2 UUID (n=2, düşük güven).
7. **Sahiplik:** non-system schema'lar `metnex`, `public` `pg_database_owner`, `public` tabloları 29/29 `metnex`; customer schema yok → customer schema sahipliği gözlenemedi.
8. **Kimlikler:** tek rol `metnex` = superuser + `BYPASSRLS` + createrole + createdb + DB sahibi; migration/fan-out kimliği yok.
9. **Minimum salt-okuma yetkileri:** probe/owner/advisory lock için ek yetki gerekmez (kanıtlı); registry okuma/CAS için GRANT gerekir (tasarım); **düşük yetkili rolde ampirik doğrulama yapılamadı** (rol oluşturmak yasak).
10. **Dev↔prod farkları:** teslim dosyası §11 tablosu.

### Yeni bulgular
- **R-1 / Q-DP15:** `TenantService.create` (admin API) `parentId` yoksa `type='ROOT'` tenant açar ama registry/schema provizyonunu **çağırmaz** (tek çağıran `SaasService.createCustomerTenant`); dev'deki tek ROOT tenant'ın registry satırı/schema'sı yok → o root data-plane'de sessizce fail-closed. Dev ROOT'un hangi yolla oluşturulduğu `[DOĞRULANAMADI]`.
- **R-2:** tek rol superuser+`BYPASSRLS` → RLS bu rolle etkisiz; kimlik ayrımı/RLS kanıtı için rol gerekir (Q-DP05).
- **R-3:** `lock_timeout`/`statement_timeout`/`idle_in_transaction_session_timeout` = 0 → runner kendi zaman aşımlarını ayarlamalı (sayılar PO).
- **R-4/R-5:** infra compose da aynı `init-db.sql`'i mount ediyor; `drizzle` schema'sı control-plane migration takibine ait (3 uygulanmış migration), data-plane takibi orada tutulmamalı.

### İlgili soruların durumu (hiçbiri kapatılmadı)
Q-DP14 kısmen kanıtlandı (dev), **prod kısmı açık**; Q-DP13, Q-DP12, Q-DP11, Q-DP05, Q-ID01 **açık** (etkileri teslim dosyası §12). **Yeni: Q-DP15** (ROOT oluşturma yollarında provizyon tutarsızlığı), **Q-DP16** (eski `init-db.sql` schema'ları ve script referansının akıbeti).

### Önerilen sonraki task'lar (karar AI1'de)
Q-DP15 kararı → sonra küçük düzeltme; prod'da aynı salt-okuma kanıtı (DB sahibi tarafından; yalnızca sayım/biçim); geçici DB harness'inde düşük yetkili rol/`information_schema` süzme/pooler öz-testi; Q-DP13/Q-DP05 kararı; Q-DP16 kararı.

**Yapılmayanlar:** production bağlantısı, herhangi bir yazma/DDL/DCL, rol/RLS/owner değişikliği, tenant seed/oluşturma, port/probe/ledger/executor/fan-out, Vardiya, Docker image/volume silme veya reset, Docker runtime rename, Wave 2/3, git commit/push. Gerçek secret/bağlantı dizesi/tenant adı-slug'ı rapora yazılmadı.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (40 suite / 600 test; kod değişmedi, yalnızca dokümantasyon).

### Durum
`status: done` — read-only dev readiness evidence AI1 tarafından teslimat olarak onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.34 kabul edildi ve `done` olarak kapatıldı. PostgreSQL 16.15, doğrudan
bağlantı, boş/eski schema bulguları, UUID örneklemi, mevcut tek superuser
kimliği ve timeout/pooler belirsizlikleri kanıt sınırlarıyla birlikte kabul edildi.

Production bağlantısı yapılmadı ve production readiness onayı verilmedi.
Q-DP11, Q-DP12, Q-DP13, Q-DP14, Q-DP15, Q-DP16, Q-DP05 ve Q-ID01 açık kaldı.
Port, probe, ledger, executor, fan-out, Vardiya, Wave 2/3 ve Git işlemleri bu
task kapsamında yapılmadı.

---

# TASK-027.34: Dynamic query contract

## Amaç

Güvenli kaynak, kolon, tarih ve filtre sözleşmesini uygula.

## Wave ve bağımlılık

TASK-027.33

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
