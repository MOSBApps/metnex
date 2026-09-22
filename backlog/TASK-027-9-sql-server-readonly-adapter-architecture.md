---
id: TASK-027.9
title: SQL Server readonly adapter architecture
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.9 (2026-09-17)

AI1 teslimi onayladı. BOTC'nin iki SCADA erişim yolu karar verilmeden
karşılaştırıldı; admin-küratörlü allowlist, ayrı read-only credential/pool,
timeout/cancellation, sonuç limitleri, tenant scope/root aggregation, permission,
audit ve kontrollü hata sözleşmesi Metnex'in gerçek kod desenleriyle uyumlu
belgelendi. Q-AD01 append-only korundu; cache/canlı sorgu ve dataset sözleşmesi
kararları açık bırakıldı. Wave 2/Wave 3 kapsam dışı, canlı SQL Server'a bağlantı
yapılmadı ve `./scripts/check.sh --skip-docker` PASS'tir.

TASK-027.9 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

`BOTC_SCADA_DMS_SOURCE_MAPPING.md` ve `BOTC_ENTITY_DOMAIN_MAPPING.md` kaynak olarak kullanıldı
(yeniden üretilmedi). Bu task için ek olarak Metnex'in gerçek kod desenleri okundu:
`apps/api/src/db/db.service.ts` (`pg.Pool`, sorgu literal-maskeleme enstrümantasyonu),
`apps/api/src/audit/platform-audit.service.ts` (gerçek audit sözleşmesi + `scrubSecrets()`),
`apps/api/src/reporting/report-render.service.ts` (var olan `AbortController` timeout+iptal
deseni ve `MAX_PAYLOAD_BYTES` boyut sınırı deseni — SCADA adapter'ına aynı ilkeyle uygulandı,
yeni desen icat edilmedi).

### Teslimat

`docs/migration/METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md`:

- **§1** İki BOTC erişim yolu (DynamicDataSources+QueryService vs. hardcoded FromSqlRaw)
  mimari uygunluk açısından karşılaştırıldı — **hangisinin referans alınacağı (Q-SC02)
  kesinleştirilmedi**, her ikisinin de kısmi uyumlu/kısmi uyumsuz olduğu gösterildi.
- **§2** Admin-küratörlü allowlist modeli — database/schema/table/column/sorgu-filtre seviyeleri.
- **§3** Read-only erişim gereksinimleri tablo halinde: ayrı read-only credential, bağlantı
  izolasyonu, çift-katman SELECT-only kısıtı, timeout/cancellation (var olan `AbortController`
  deseniyle), connection pool sınırları, satır/kolon/boyut limitleri (var olan `MAX_PAYLOAD_BYTES`
  deseniyle), hata/timeout/empty-result sözleşmesi.
- **§4** Kullanıcı girdisi güvenliği — FR-015/SEC-DATA-001/002, `QUOTENAME`'siz BOTC yaklaşımının
  taşınmayacağının teyidi.
- **§5** Tenant scope entegrasyonu — `TenantScopeService.resolve()`/`canAggregateChildren` ile
  allowlist kesişimi, MİP root aggregation davranışı (her tenant'ın kaynağı izole sorgulanır).
- **§6** Permission guard ilişkisi — hazırlık amaçlı, implementation üretilmedi.
- **§7** Audit kaydı sözleşmesi — gerçek `PlatformAuditLogInput` alanlarına eşleme (7 gerekli
  alanın tamamı karşılandı).
- **§8** `DynamicDataSources`/hardcoded adların taşınmaması gereken yönleri.
- **§9** PostgreSQL cache/canlı-sorgu kararı — Q-M05/Q-SC03'e bağlı, kesinleştirilmedi.

### Yeni açık soru (Q-AD01, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E/Q-T/Q-SC/Q-P/Q-PW
serisi **korunarak** 1 yeni soru eklendi: **Q-AD01** — SCADA sorgu audit kayıtları genel
`platform_audit_log`'a mı, ayrı bir tabloya mı yazılacak (hacim/performans kararı). Özet tablosuna
1 satır eklendi, mevcut satırlar değiştirilmedi.

### Kapsam kriterleri karşılama

- İki BOTC erişim yolu açıkça karşılaştırıldı (§1).
- Read-only credential, allowlist, tenant scope ve permission sınırları belgelendi (§2, §3, §5, §6).
- Timeout, cancellation, limit, hata ve empty-result sözleşmeleri tanımlandı (§3).
- SQL injection ve kullanıcı girdisi güvenliği ele alındı (§4).
- Audit gereksinimleri belgelendi (§7).
- Root tenant aggregation davranışı açıklandı (§5).
- Q-M05, Q-S03, Q-SC02/Q-SC03 ile ilişkiler kuruldu (§1, §5, §9).
- Gerçek secret/parola/connection string/veri satırı yazılmadı.
- Wave 2/3 kapsam dışı korundu (§10).
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değiştirilmedi. Canlı SQL Server'a
  bağlanılmadı.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı üretmedi** — Q-SC01/Q-SC02, Q-M05/Q-SC03, Q-M03, Q-AD01
  çözülmeden Wave 5 implementation task'ları başlatılamaz.
- Allowlist'in veri modeli (hangi tabloda tutulacağı) bu belgede tasarlanmadı — yalnızca
  kavramsal seviye tanımlandı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum

`status: done` — AI1, SQL Server read-only adapter mimarisini ve Q-AD01 açık sorusunu inceleyip
onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.9" bölümü).

# TASK-027.9: SQL Server readonly adapter architecture

## Amaç

Read-only bağlantı, allowlist, scope, timeout ve hata sözleşmesini tanımla.

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

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
