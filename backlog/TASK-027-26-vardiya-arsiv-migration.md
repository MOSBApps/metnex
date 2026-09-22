---
id: TASK-027.26
title: Customer-Root Data-Plane Foundation ve Migration Fan-out Karar Paketi
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Vardiya arşiv migration" placeholder'ıydı. AI1'in 2026-09-21 talimatıyla kapsam
> **customer-root data-plane foundation ve fan-out karar paketi** olarak yeniden tanımlandı (TASK-027.25'te ortaya çıkan blocker).
> **Archive migration bu task'ta YAPILMADI** ve kapsam dışıdır; orijinal archive migration placeholder içeriği tarihi kayıt olarak en altta korunmuştur.
> Talimatın öngördüğü dosya adı (`TASK-027-26-vardiya-archive-migration.md`) ile mevcut dosya adı (`…-vardiya-arsiv-migration.md`) farklıydı;
> aynı ID için ikinci dosya açılmadı.

## AI2 Teslim Raporu (2026-09-21)

**Sonuç: karar paketi + fan-out standardı + readiness blocker; hiçbir kod/altyapı yazılmadı.**

Teslimatlar: `docs/migration/METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md`, `docs/migration/METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`,
`docs/migration/METNEX_DATA_PLANE_READINESS_BLOCKER.md`, `BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only), `docs/domain/DB_META.md` (yalnızca referans notu).

**Mevcut altyapı (kanıtlı):** provisioning yalnızca **boş schema** oluşturur (`ensureSchemaProvisioned`, tek çağıran `SaasService.createCustomerTenant`);
`pgSchema()`/dinamik schema **yok**; fan-out **yok**; registry↔fiziksel schema doğrulaması **yok**; `migrationVersion` yalnızca provisioning'de sabit `'0000_empty'`.

**Yeni bulgular:** D1 `ARCHIVED` registry satırı sessizce yeniden `ACTIVE` olur; D2 `FAILED` registry için otomatik retry yolu yok; D3 schema ayrıcalık değil isim alanı
sınırı (tek pool/rol); D4 `resolve()` closure↔customerRoot tutarlılığını doğrulamaz (sızıntı yok ama sessiz); D5 DEC-0010 §8 DEC-0011 ile eski; D6 Phase 7-9 tanımsız;
D7 `drizzle.config` içinde sabit varsayılan bağlantı bilgisi (değer kopyalanmadı); D8 ön-DEC-0010 tenant'larda closure/registry backfill yok.

**Karar paketleri (AI2 önerisi; karar AI1/PO):** Data-plane A/B/C/D (12 kriter) → öneri **C = DEC-0010'un yazılı tasarımı** (A ve B DEC-0010/DEC-0009 ile uyumsuz); sertleştirme H1–H3
(öneri H3 ile başla). Fan-out yaşam döngüsü (DISCOVER→…→ROLLBACK), schema/run kayıtları, hata/retry/rollback/sürüm-kayması/eşzamanlılık kuralları, insan onay noktaları, test planı.
Vardiya uygulanabilirlik sırası (8 adım) ve blocker R1–R12.

**Kapatılan sorular: yok.** Karar bekleyen (AÇIK): Q-V11, Q-V20, Q-V21, Q-ID01, Q-V25, Q-V16, Q-V12 + yeni Q-DP01–Q-DP07.
**Test:** yeni test/prod kodu eklenmedi — `pgSchema`/fan-out yok; mevcut kapsam (util spec 14, registry spec 6, scope spec 8) yeni üretim kodu olmadan genişletilemez; `ARCHIVED`
için test ya kusurlu davranışı sabitler ya başarısız test bırakır → önce karar (Q-DP03).

**Yapılmayanlar:** `pgSchema()`/dinamik schema, migration runner, `shift_reports` schema/repository/API, archive migration, tablo/tenant/seed/mapping, permission catalogue, UI, email,
gerçek PostgreSQL/SQL Server bağlantısı, Wave 2/3, Docker, git commit/push. `apps/` altında değişiklik yok; gerçek secret/connection string yazılmadı.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (36 suite / 333 test; yalnızca dokümantasyon değişti).

### Durum
`status: done` — karar/blocker paketi AI1 tarafından onaylanmıştır. Data-plane/fan-out
implementation'ı açık karar kapıları kapanana kadar başlatılmayacaktır.

## AI1 Onay — 2026-09-21

TASK-027.26 teslimatı yeniden tanımlanan customer-root data-plane foundation ve migration
fan-out karar paketi kapsamına uygun bulunarak onaylandı ve `done` olarak kapatıldı.
Provisioning'in yalnızca boş schema oluşturması, `pgSchema()`/fan-out eksikliği, ARCHIVED
yeniden aktivasyon riski, FAILED retry eksikliği, schema sınırının privilege sınırı olmaması,
closure tutarlılığı, eski DEC kapsamı ve varsayılan bağlantı bilgisi riskleri doğru biçimde
blocker olarak kaydedildi.

Q-V11, Q-V12, Q-V16, Q-V20, Q-V21, Q-V25, Q-ID01 ve Q-DP01–Q-DP07 açık kalmıştır.
AI2 önerileri uygulanmamış; `pgSchema()`, migration runner, schema, tablo, tenant, mapping,
API, archive migration ve production kodu oluşturulmamıştır. Q-V09 workflow kilitleme bu
task'ın kapsamına alınmamıştır.

---

# TASK-027.26: Vardiya arşiv migration

## Amaç

Tarihsel vardiya verisini idempotent arşive taşı.

## Wave ve bağımlılık

TASK-027.21; TASK-027.22

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
