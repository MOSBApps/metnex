---
id: TASK-027.31
title: Customer Schema Registry State Safety Hardening
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "SCADA DMS source catalog" (Wave 5) placeholder'ıydı. AI1'in talimatıyla kapsam **customer schema registry durum güvenliği sertleştirmesi** olarak yeniden tanımlandı;
> **SCADA/DMS kaynak kataloğu bu task'ta yapılmadı** (Wave 5). Orijinal placeholder en altta tarihi kayıt olarak korunmuştur. Talimat dosya adı `TASK-027-31-registry-state-safety-hardening.md` idi;
> aynı ID için ikinci dosya açılmadı, mevcut dosya güncellendi. (Talimat metni iki kez yapıştırılmıştı; tek bir görev olarak ele alındı.)

## AI2 Teslim Raporu (2026-09-21)

**Uygulama task'ı — gerçek PostgreSQL bağlantısı, data-plane migration, `pgSchema()`, fan-out, retry job/CLI, reactivation akışı yok.**

### Değişen dosyalar
| Dosya | Değişiklik |
|---|---|
| `apps/api/src/tenant-scope/customer-schema-registry.service.ts` | `ARCHIVED` → `SCHEMA_ARCHIVED` (409, statik mesaj): `CREATE SCHEMA` yok, yazma yok, status değişmez, tekrar çağrıda aynı sonuç; bilinmeyen status → `REGISTRY_STATUS_UNKNOWN`; durum değişiklikleri beklenen mevcut duruma bağlı (koşullu upsert `setWhere` + `PROVISIONING`-koşullu ACTIVE/FAILED güncellemesi) — eşzamanlı değişen satır `ACTIVE` ile ezilmez, DDL çalışmaz, `REGISTRY_STATE_CONFLICT`; `lastError`/log/fırlatılan hata DB metni içermez (`Error [SQLSTATE]: schema provisioning failed`, dış hata `InternalServerErrorException({ code: 'SCHEMA_PROVISIONING_FAILED' })`); güvenli olmayan schema adı hatası adı yankılamaz |
| `apps/api/src/tenant-scope/registry-state.ts` (yeni) | Saf durum kuralları: bilinen durumlar (schema enum'undan), hata kodları (`SCHEMA_ARCHIVED`, `REGISTRY_STATUS_UNKNOWN`, `REGISTRY_STATE_CONFLICT`), `RegistryStateError`, izinli geçişler (`null→PROVISIONING`, `PROVISIONING→PROVISIONING/ACTIVE/FAILED`, `FAILED→PROVISIONING`; `ACTIVE`/`ARCHIVED` çıkışsız) |
| `apps/api/src/tenant-scope/registry-diagnostics.ts` (yeni) | Salt-okuma tanı sözleşmesi: `diagnoseRegistryState` (saf) + `RegistryPhysicalSchemaProbe` **yalnızca arayüz**; durumlar `HEALTHY/PROVISIONING/FAILED/ARCHIVED/SCHEMA_MISSING/REGISTRY_INCONSISTENT/REGISTRY_MISSING/VERSION_GATE_BLOCKER`; yalnızca `HEALTHY` `accessible`; stale yalnızca çağıranın verdiği eşikle raporlanır (varsayılan yok); hiçbir yerde DB/onarım yok; production'a bağlı değil |
| `apps/api/src/tenant-scope/customer-schema-registry.service.spec.ts` | Yeni davranışa uyarlandı (`insert…returning`, sanitize edilmiş `lastError`/hata) |
| `apps/api/src/tenant-scope/registry-state-safety.spec.ts` (yeni) | 61 test |
| `docs/migration/METNEX_DATA_PLANE_REGISTRY_HARDENING_PLAN.md`, `…READINESS_BLOCKER.md`, `BOTC_MIGRATION_OPEN_QUESTIONS.md` | Uygulama durumu (append-only/başlık notu) |

`TenantScopeService` **değişmedi**: davranışı (ACTIVE dışı → 403, PLATFORM_ROOT 403) testlerle kilitlendi; closure doğrulaması genişletilmedi; yeni admin bypass yok.

### Testler (61 yeni; gerçek DB yok)
ARCHIVED → hata/`CREATE SCHEMA` çağrılmaz/yazma yok/tekrarda aynı sonuç/mesajda schema adı yok; bilinmeyen status reddi; koşullu upsert (`setWhere`); eşzamanlı değişimde DDL yok ve ACTIVE ile ezme yok; ACTIVE idempotent no-op; PROVISIONING yalnızca DDL yoluyla ACTIVE olur;
hata/log/`lastError`/fırlatılan hatada secret yok; `PROVISIONING`/`FAILED`/`ARCHIVED`/bilinmeyen → `resolve()` 403 ve hiçbir yazma/DDL yok (otomatik terfi yok); `getActiveRegistry` yalnızca `ACTIVE`; PLATFORM_ROOT registry'ye ulaşmaz; `resolve()` yalnızca tenant id alır; registry/scope/tanı kodunda `isSystemAdmin`/`TENANT_ADMIN`/`SYSTEM_ADMIN` yok;
tanı modülünde DB/sürücü bağımlılığı yok; otomatik reactivation/retry girişi yok; geçiş tablosu (izinli/yasak/bilinmeyen); tanı sözleşmesi (SCHEMA_MISSING, ARCHIVED+var, FAILED+var, PROVISIONING+var, sürüm bilinmiyor, REGISTRY_MISSING, INCONSISTENT, yalnızca HEALTHY erişilebilir, stale yalnızca eşikle, girdi değişmez).
**Mutasyon kontrolü:** ARCHIVED guard'ı ve `setWhere` kaldırılınca 3 test başarısız oldu (guard'sız yol geçiş doğrulayıcısına da çarpıyor — iki katman), sonra geri alındı.

### Uygulanan registry davranışları ve açık kararlar (ayrı)
- **Uygulandı:** ARCHIVED asla ACTIVE olmaz; PROVISIONING/FAILED erişilebilir değil; hiçbir okuma yolu terfi/onarım yapmaz; durum geçişleri korumalı; hatalar/loglar DB metni içermez; tanı sözleşmesi hazır.
- **Açık — Q-DP03:** açık reactivation akışı (onaylayan, audit, rollback) uygulanmadı. **Açık — Q-DP04:** retry sahibi/limit/backoff/job/CLI uygulanmadı. **Açık — Q-DP01:** sürüm geçidi uygulanmadı. **Yeni Q-DP10:** fiziksel schema probe implementasyonu, stale eşiği (sayı PO), tanının çalışacağı süreç.
- **AI1 kararı gereken nokta:** `ensureSchemaProvisioned`'ın **açık çağrıda** `FAILED`/`PROVISIONING` satırı idempotent yeniden sürmesi (DEC-0010 §4 ve mevcut spec) **korundu** — otomatik değil, tek çağıran tenant oluşturma; bunu "elle retry" sayıp reddetmek mi, Q-DP04 mekanizması gelene kadar korumak mı? AI1 kararı olmadan mevcut davranışı bozmamak için dokunmadım.

### Bildirimler
1. **Davranış değişikliği:** provisioning başarısızlığında dış hata artık `InternalServerErrorException({ code: 'SCHEMA_PROVISIONING_FAILED' })` (önceden ham hata); `lastError` biçimi `Error [SQLSTATE]: schema provisioning failed` (önceden ham DB mesajı). Tek çağıran `SaasService.createCustomerTenant` bunları incelemiyor.
2. Fiziksel schema doğrulaması **implemente edilmedi** (yalnızca saf sözleşme); registry↔fiziksel tutarsızlık hiçbir yerde otomatik onarılmaz.
3. Gerçek DB olmadığından eşzamanlılık korumasının (koşullu upsert/koşullu güncelleme) gerçek PostgreSQL semantiği `[DOĞRULANAMADI]` (drizzle `setWhere` API'si tip düzeyinde doğrulandı, mock testlerle davranış kanıtlandı).

**Yapılmayanlar:** data-plane migration runner, `pgSchema()`, Vardiya/archive, tenant/mapping seed ve tenant oluşturma, otomatik retry job/CLI, explicit reactivation, DB role/RLS, version gate implementasyonu, gerçek PostgreSQL/SQL Server bağlantısı, Docker build/run, SCADA/DMS kataloğu, Wave 2/3, git commit/push.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (**39 suite / 462 test**; önceki 38/401 → +1 suite, +61 test), typecheck/lint/build temiz.

### Durum
Teslim anında `status: review` idi; AI1 teslimi onaylayarak `done` yaptı (güncel durum: `done`). `ensureSchemaProvisioned`'ın açık çağrıda FAILED/PROVISIONING'i yeniden sürmesi AI1 tarafından korunmuştur (otomatik retry değil); retry sahibi/limit/backoff/CLI-job tasarımı Q-DP04 kapsamında sonraki task'a bırakılmıştır.

---

# TASK-027.31: SCADA DMS source catalog

## Amaç

Yetkili SCADA/DMS kaynaklarını ve ölçüm tiplerini katalogla.

## Wave ve bağımlılık

TASK-027.5

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

## AI1 Onayı (2026-09-21)

TASK-027.31 kabul edildi ve `done` olarak kapatıldı. `ARCHIVED` satırının
`SCHEMA_ARCHIVED` ile reddedilmesi, koşullu durum geçişleri, fail-closed erişim,
secret hijyeni ve salt-okuma tanı sözleşmesi kabul edildi.

`FAILED`/`PROVISIONING` için mevcut açık `ensureSchemaProvisioned` çağrısının
korunması bu task kapsamında uygundur: bu otomatik retry veya reactivation job'ı
değildir ve tenant oluşturma akışındaki mevcut davranıştır. Retry sahibi, limit,
backoff ve operasyonel giriş noktası Q-DP04 kapsamında açık bırakılmıştır.

Q-DP01, Q-DP03'ün explicit reactivation ayrıntıları, Q-DP04 ve Q-DP10 kapanmamıştır.
SCADA/DMS kataloğu, data-plane/fan-out, Vardiya, gerçek PostgreSQL/Docker çalıştırması
ve git işlemleri bu task'ın kapsamı dışındadır.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
