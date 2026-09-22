---
id: TASK-027.13
title: Wave 1 Identity Migration Engine Integration Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

> **Başlık/kapsam notu (2026-09-17):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.13 — Role migration implementation` (status: `planned`) olarak oluşturulmuştu ve
> hiç başlatılmamıştı. AI1, aynı `TASK-027.13` kimliğini **farklı bir başlık ve kapsamla**
> ("Wave 1 Identity Migration Engine Integration Boundary") yeniden görevlendirdi. Dosya adı
> (`TASK-027-13-role-migration-implementation.md`) tarihi/orijinal başlığı yansıtmaya devam
> ediyor — bu, kayıt bütünlüğü için bilerek değiştirilmedi (rename, ayrı bir onay gerektirir).
> Frontmatter `title` ve içerik AI1'in yeni talimatını yansıtır; orijinal "Role migration
> implementation" kapsamı hiç uygulanmadığı için bir çakışma/veri kaybı riski yoktur.

## AI2 Teslim Raporu — Wave 1 Identity Migration Engine Integration Boundary (2026-09-17)

### Amaç

TASK-027.12'nin ürettiği in-memory identity migration motorunun giriş/çıkış sözleşmesini
sabitlemek, `BotcIdentitySourceAdapter` ve onaylı tenant mapping adapter sınırlarını netleştirmek,
source-snapshot preflight validation eklemek ve tüm bunu motoru **yeniden yazmadan** entegrasyon
testleriyle doğrulamak.

### Teslimat

`apps/api/src/migration/botc-identity/` altına 4 yeni dosya eklendi (TASK-027.12'nin 9 mevcut
dosyasının **hiçbiri değiştirilmedi**):

| Dosya | Sorumluluk |
|---|---|
| `source-validation.ts` | Preflight validation — boş/duplicate legacy ID, orphan role/permission/user referansı, geçersiz tenant slug, çakışan tenant mapping, eksik zorunlu alan (8 kural) |
| `tenant-mapping-adapter.ts` | `ApprovedTenantMappingAdapter` port'u + in-memory implementasyonu (Q-M06'nın onaylı dış mapping tablosu sınırını `BotcIdentitySourceAdapter` ile aynı desende ifade eder) |
| `source-validation.spec.ts` | 10 test — preflight kurallarının deterministik doğrulaması |
| `integration-boundary.spec.ts` | 16 test — motoru kara kutu olarak ele alan entegrasyon sözleşmesi testleri (bkz. aşağıdaki eşleme) |

Tam entegrasyon sözleşmesi, adapter sınırları, preflight kuralları ve gelecekteki gerçek adapter
bağlantısı planı `docs/migration/METNEX_IDENTITY_MIGRATION_ENGINE_INTEGRATION_BOUNDARY.md`'de
detaylandırılmıştır — burada tekrar üretilmez.

### Görev kapsam maddesi → test grubu eşlemesi

| Kapsam maddesi | Karşılandı |
|---|---|
| 1. Giriş/çıkış sözleşmesini belgele/sabitle | ✅ Entegrasyon boundary dokümanı §3 |
| 2. Adapter sınırlarını doğrula | ✅ `tenant-mapping-adapter.ts` + "source/tenant adapter ports" testleri |
| 3. Source snapshot validation (8 kural) | ✅ `source-validation.ts` + `source-validation.spec.ts` (10 test) |
| 4. Deterministik giriş/çıkış | ✅ "frozen input/output contract" test grubu |
| 5. DRY_RUN/APPLY ayrımı | ✅ "DRY_RUN vs APPLY separation" test grubu |
| 6. 9 çıktı artefaktı | ✅ "the 9 required output artifacts" testi |
| 7. Idempotency/retry | ✅ "idempotency and retry (contract-level)" test grubu |
| 8. Permission mapping korunumu (yalnızca 5 onaylı kod) | ✅ "permission mapping is preserved" test grubu |
| 9. Tenant mapping korunumu (`Sirket` okunmaz, UNRESOLVED erişim almaz) | ✅ "tenant mapping is preserved" testi |
| 10. Parola davranışı korunumu | ✅ "password behavior is preserved" testi |
| 11. Fixture gözden geçirmesi | ✅ Tüm `*.spec.ts` dosyaları incelendi — gerçek BOTC verisi yok, değişiklik gerekmedi |
| 12. Runbook/migration dokümanı güncellemesi | ✅ `METNEX_IDENTITY_MIGRATION_ENGINE_INTEGRATION_BOUNDARY.md` (yeni) |

### Kesinlikle yapılmayanlar (görev talimatına uygun)

Yeni Drizzle schema/migration, Q-ID01 karara bağlama, gerçek PostgreSQL apply, gerçek SQL Server
bağlantısı, gerçek BOTC verisi okuma, gerçek parola/hash/salt/token/secret kullanımı, `authSessions`
yazımı, `VisibilitySettings` migration'ı, Wave 2/Wave 3 kodu, Docker çalıştırma, git commit/push —
**hiçbiri yapılmadı**. `integration-boundary.spec.ts`'teki "no real connections" test grubu bunu
statik dosya taramasıyla (yorum satırları hariç) ayrıca doğrular.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **51/51 test PASS**
  (8 suite: mevcut 6 + yeni `source-validation.spec.ts` + `integration-boundary.spec.ts`; önceki
  25/25'ten 51/51'e çıktı, TASK-027.12'nin 25 testinin **hiçbiri değişmedi/bozulmadı**).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### Kalan riskler / sonraki bağımlılık

- Q-ID01, Q-P02, Q-T01/Q-SC01'in lokasyon-özel kısımları hâlâ açık/kapsam dışı.
- Preflight validation (`validateSourceSnapshot`) motor tarafından otomatik çağrılmıyor — bunu
  çağırmak, motoru çağıran tarafın (henüz üretilmemiş bir CLI/task runner) sorumluluğundadır; bu
  kasıtlıdır (motoru "yeniden yazmama" kuralının doğal sonucu).
- Gerçek SQL Server adapter'ı, gerçek tenant mapping adapter'ı ve gerçek PostgreSQL apply katmanı
  hâlâ üretilmedi — entegrasyon dokümanı §8'deki 5 adım ayrı task'lar + AI1 onayı gerektirir.
- Production kodu yalnızca yeni dosyalardan oluşuyor — TASK-027.12'nin 9 mevcut dosyası
  değiştirilmedi.

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle entegrasyon sınırı teslimi onaylandı (bkz. aşağıdaki
"AI1 Final Onayı" bölümü).

## AI1 Final Onayı (2026-09-18)

TASK-027.13 teslimi onaylandı ve `done` olarak kapatıldı. TASK-027.12 motorunun
değiştirilmediği, preflight validation kurallarının deterministik olduğu, adapter
sınırlarının yalnızca port/in-memory düzeyinde kaldığı ve gerçek SQL Server/PostgreSQL
bağlantısı kurulmadığı doğrulandı.

`./scripts/check.sh --skip-docker` PASS ile 23 suite / 150 test kanıtı kabul edildi.
Q-ID01, Q-P02 ve Q-T01/Q-SC01 açık/kapsam dışı korunmuştur. Eski Role migration
başlığı tarihsel kayıt olarak korunmuş, yeni entegrasyon sınırıyla karıştırılmamıştır.

---

# TASK-027.13 (orijinal, planned — hiç uygulanmadı): Role migration implementation

## Amaç

Kaynak rolleri Metnex role modeline dönüştür.

## Wave ve bağımlılık

TASK-027.11

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
