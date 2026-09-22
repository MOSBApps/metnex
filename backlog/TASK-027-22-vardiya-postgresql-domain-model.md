---
id: TASK-027.22
title: Vardiya PostgreSQL Domain Model ve Karar Paketi
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **Başlık/kapsam notu:** Bu ID, orijinal 53-task batch'inden gelen "Vardiya PostgreSQL domain
> model — hedef modelleri **uygula**" placeholder'ıydı. AI1'in 2026-09-18 tarihli talimatıyla kapsam
> **uygulama değil, karar paketi/tasarım dokümanı** olarak yeniden tanımlandı (Drizzle schema,
> migration, seed yok). Orijinal placeholder içeriği en altta korunmuştur.

## AI2 Teslim Raporu — Vardiya PostgreSQL Domain Model ve Karar Paketi (2026-09-18)

Ana teslimat: `docs/migration/BOTC_VARDIYA_DOMAIN_MODEL_DECISION_PACKAGE.md` (yeni).

### Hedef domain modeli
ShiftReport aggregate (şema-nötr taslak): id, tenantId (nullable), locationCode, shiftCode,
operatorUserId (nullable), secondOperatorName, recordedAt, logbookDate, notes, status, scopeStatus,
legacySourceSystem/Table/legacyId, sourceChecksum, migrationRunId, createdAt/updatedAt. Talimattaki
**"performans alanları" kaynak kodda yok** — uydurulmadı (Q-V13).

### Tablo seçenekleri matrisi ve Q-V10 karar paketi
A (tek tablo) / B (5 tablo) / C (taban+detail) 9 kriterde karşılaştırıldı. AI2 önerisi **A**
(gerekçe: BOTC'nin 5 tablosu birebir aynı şema, izolasyon zaten `tenantId` tabanlı, en düşük
migration/API yüzeyi); risk ve geri dönüş maliyeti (A→C ucuz, A↔B pahalı) sunuldu.
**Karar açıktı (teslim anında); AI1/PO sonradan A seçti — bkz. aşağıdaki "AI1 Onay ve Q-V10 Kararı".**

### Alan/lifecycle mapping
Kolon kolon tablo (tip, null, dönüşüm, doğrulama, kanıt, belirsizlik) karar paketi §3'te.
Lifecycle: `IsCompleted` false→DRAFT, true→COMPLETED (kaynak kanıtlı); LOCKED/FAILED/ARCHIVED
**öneri** olarak ayrıldı (öneri: minimal DRAFT/COMPLETED/ARCHIVED; LOCKED servis kuralı, FAILED
migration sonucu) — Q-V04 açık.

### Tenant/location ve archive yaklaşımı
Hiçbir lokasyon Q-T01 kapanmadan `tenantId` almaz (`NULL` + `scopeStatus`); çözülmemiş satırlar
fail-closed erişime kapalı; tenant uydurulmadı. Archive: aynı tablo `ARCHIVED` vs ayrı tablo
seçenekleri sunuldu, Q-V02/Q-V06 uygulanmadı, TASK-027.26 bağımlılığı belirtildi.

### Timezone/duplicate/idempotency
Kaynak tz `[DOĞRULANAMADI]`, Q-V03 kapatılmadı (ham değer saklama + tz teyidi sonrası UTC önerisi).
Duplicate anahtarı `(legacySourceSystem, legacySourceTable, legacyId)`; aynı anahtar+aynı checksum
NOOP, farklı checksum CONFLICT (sessiz üzerine yazma yok); iç UUID checksum'a girmez.

### Permission/audit etkileri
`SHIFT:REPORT:VIEW/UPDATE` catalogue'da yok (grep doğrulandı), production'a eklenmedi;
`CanReceiveShiftReportEmail` kod karşılığı yok. Audit için `platform_audit_logs` yeniden kullanımı
önerildi; tenant kolonu olmaması Q-V12. Root aggregate yetkisi genişletilmedi (mevcut
`canAggregateChildren`/closure).

### Yeni mimari bulgu
DEC-0010: iş verisi müşteri-root data-plane şemasında olacak, Phase 5-9 uygulanmadı → tablo şema
yerleşimi belirsiz (Q-V11).

### Sonraki task bağımlılıkları
TASK-027.23–027.30 girdi/bloke eden soru tablosu karar paketi §12'de.

### Açık sorular
Q-V01–Q-V09 açık; Q-V10 AI1/PO kararıyla **A — tek `shift_reports` tablosu + `locationCode`** olarak
kapatıldı. Yeni Q-V11–Q-V19 append-only eklendi. Q-T01/Q-S03/Q-ID01/Q-P02 kapatılmadı.

### Güncellenen dokümanlar
Karar paketi (yeni), `BOTC_VARDIYA_METNEX_TARGET_MAPPING.md` §16, `BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md`
§10, `BOTC_MIGRATION_OPEN_QUESTIONS.md` (özet tablo + yeni bölüm). SRS değiştirilmedi (karar destekli
netleştirme gerekmedi).

### Teyit (yapılmayanlar)
Drizzle schema/migration/seed, PostgreSQL/SQL Server bağlantısı, gerçek BOTC verisi, API/service,
workflow, archive migration, email, UI, yeni tenant/lokasyon/permission kodu (production), Wave 2/3,
Docker, git commit/push — **hiçbiri yapılmadı**. `apps/` altında hiçbir dosya değişmedi.

### Doğrulama
`./scripts/check.sh --skip-docker` PASS (36 suite / 333 test, değişmedi; yalnızca dokümantasyon).

### Durum
`status: done` — AI1/PO kararıyla Q-V10 **A — tek `shift_reports` tablosu + `locationCode`** olarak
kapatılmıştır. Q-V01–Q-V09 ve Q-V11–Q-V19 açık kaldığından implementation taskları ilgili karar
kapılarına bağlı yürütülecektir.

## AI1 Onay ve Q-V10 Kararı — 2026-09-18

TASK-027.22 teslimatı kapsamına uygun bulunarak onaylandı ve `done` olarak kapatıldı.
Karar paketi, gerçek kaynak kanıtı ile taslak domain modeli ve A/B/C seçeneklerini yeterli
izlenebilirlikle sunmuştur; Drizzle schema, migration, seed, API, UI, DB bağlantısı veya
production kodu üretilmemiş olması kabul kriterlerine uygundur.

Q-V10 kararı: **A — tek `shift_reports` tablosu + `locationCode`**. Gerekçe; beş BOTC
tablosunun kod kanıtına göre ortak şemada olması, aynı tenant-scope sınırlarının geçerli olması,
tek migration/API/test yüzeyinin daha düşük olması ve lokasyona özel alan ihtiyacı doğarsa
A'dan C'ye additive evrimin mümkün olmasıdır. B seçeneği uygulanmayacaktır.

Bu karar, lokasyon tenant eşlemesini, data-plane şemasını, gerçek DDL'i, lifecycle ayrıntılarını,
timezone'u, archive politikasını veya permission kararlarını kapatmaz. Q-V01–Q-V09 ve Q-V11–Q-V19
ile Q-T01/Q-S03/Q-ID01/Q-P02 açık kalmıştır.

---

# TASK-027.22: Vardiya PostgreSQL domain model

## Amaç

Vardiya, lokasyon, durum ve arşiv hedef modellerini uygula.

## Wave ve bağımlılık

TASK-027.21

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
