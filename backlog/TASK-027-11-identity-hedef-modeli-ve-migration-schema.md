---
id: TASK-027.11
title: Identity hedef modeli ve migration schema
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.11-R1 (2026-09-17)

AI1 R1 düzeltmesini onayladı. Identity mapping completion, tenant membership
assignment ve runtime erişime hazır olma üç ayrı katman olarak tutarlı biçimde
tanımlandı. Tenant ataması çözülemeyen kayıtlarda `UNRESOLVED` ara durumu ve
sonraki reconciliation akışı açıklandı. `targetId` davranışı `COMPLETED` ve
`SKIPPED` için dolu, diğer durumlar için bağlama uygun olacak şekilde netleştirildi.
Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01/Q-ID01 değiştirilmedi; production/schema/
migration/seed değişmedi ve `./scripts/check.sh --skip-docker` PASS'tir.

TASK-027.11 ve TASK-027.11-R1 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

> **TASK-027.11-R1 düzeltmesi (2026-09-17):** AI1, ilk teslimde iki iç tutarsızlık tespit etti:
> (1) §7 (transaction sınırları) "User+tenantMembership+COMPLETED her zaman tek transaction"
> derken §8 (tenant membership zorunluluğu) "COMPLETED olsa bile tenant'sız erişilemez" diyordu —
> bu, `COMPLETED`+tenant'sız bir durumun hem imkansız hem mümkün olduğunu ima ediyordu.
> (2) §4.1 `targetId`'nin yalnızca `COMPLETED`'de dolu olduğunu söylerken, §5 `SKIPPED` kayıtların
> mevcut hedefi temsil ettiğini belirtiyordu — `targetId`'nin `SKIPPED`'de davranışı tanımsızdı.
>
> **Düzeltme:** `docs/migration/METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`'ye
> **üç-katmanlı tamamlanma modeli** eklendi (§8.1): (1) identity user mapping tamamlandı
> (`mappingStatus = COMPLETED` — yalnızca `users` satırı yazıldı), (2) tenant membership mapping
> tamamlandı (`tenantMembershipStatus = ASSIGNED` — yeni, ek açıklık alanı), (3) kullanıcı runtime
> erişime hazır (ikisi birlikte). §7'nin transaction tablosu bu modele göre yeniden yazıldı: tenant
> ataması o an çözülebiliyorsa identity+tenant aynı transaction'da, çözülemiyorsa yalnızca identity
> yazılır ve `tenantMembershipStatus` `UNRESOLVED` kalır (hata değil, beklenen ara durum). §4.1/§4.2/§5
> `targetId`'nin `COMPLETED` **ve** `SKIPPED`'in ikisinde de dolu olduğu, diğer durumlarda boş/korunmuş
> olduğu açıkça tanımlandı. Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01/Q-ID01 kararlarının hiçbiri
> değiştirilmedi/kapatılmadı. Hiçbir Drizzle şeması/migration/seed yazılmadı, PostgreSQL/SQL
> Server'a bağlanılmadı.

### Kaynak inceleme yöntemi

`apps/api/src/db/schema/platform.ts` yeniden, satır satır okunarak 11 identity tablosunun
güncel tanımı doğrulandı (`grep -n "^export const"` ile TASK-027.6'dan bu yana değişiklik
olmadığı teyit edildi). `BOTC_SOURCE_SCHEMA_INVENTORY.md`, `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`
ve `METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md` kaynak olarak kullanıldı (yeniden
üretilmedi). `apps/api/src/db/schema/enums.ts`'deki gerçek `CustomerSchemaStatus`
(`PROVISIONING`/`ACTIVE`/`FAILED`/`ARCHIVED`) 4-durumlu enum deseni, staging status yaşam
döngüsü tasarımına referans alındı.

### Teslimat

`docs/migration/METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`:

- **§1** 11 identity tablosunun güncel kod doğrulaması — görev talimatının listesiyle birebir eşleşti.
- **§2** BOTC entity → hedef tablo özeti (detay için önceki belgelere referans, tekrar üretilmedi).
- **§3** Legacy ID → Metnex text/UUID mapping yaklaşımı — staging tablosunun kendisi mapping
  görevini üstlenir (ayrı bir mapping tablosu önerilmedi).
- **§4** `migration_staging_identity` kavramsal tasarımı — 10 alan (legacy kimlik, kaynak/hedef
  entity tipi, hedef ID, migration run ID, mapping status, hata kodu/açıklaması, checksum,
  zaman damgaları), 6 durumlu `mappingStatus` yaşam döngüsü (`CustomerSchemaStatus` desenine
  paralel), `errorCode`'un standart dokümanın 4 hata kategorisiyle hizalanması.
- **§5** Idempotency ve tekrar çalıştırma davranışı.
- **§6** Aynı kaynak kaydının birden fazla hedefe eşlenmesini engelleme (benzersizlik kısıtı
  tasarımı) + UserPermission'ın çoklu-kaynak/tek-hedef istisna senaryosu netliği.
- **§7** Transaction sınırları — identity'ye özgü somutlaştırma.
- **§8** Tenant membership zorunluluğu korundu.
- **§9** `Sirket` tenant eşleme kaynağı olarak kullanılmadı, Q-M06'ya bağlandı.
- **§10** PasswordHash için gerçek değer taşımayan `passwordStrategy` durum modeli önerisi
  (`RESET_REQUIRED`/`ADMIN_ASSIGNED`/`PENDING_DECISION`).
- **§11** `authSessions` için staging kaydı/session transferi üretilmedi.
- **§12** Role modeli (Q-P01) ve UserPermission dönüşümü (Q-M04) kesinleştirilmedi.
- **§13** `VisibilitySettings` staging hedefi olarak karar bekliyor (Q-P02).

### Yeni açık soru (Q-ID01, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E/Q-T/Q-SC/Q-P/Q-PW/
Q-AD/Q-MG serisi **korunarak** 1 yeni soru eklendi: **Q-ID01** — staging tablosu hangi şemada
tutulacak ve retention politikası ne olacak (PO'ya raporlanır). Özet tablosuna 1 satır eklendi.

### Kapsam kriterleri karşılama

- Gerçek Metnex identity tabloları kaynak kodla doğrulandı (§1).
- BOTC entity → hedef alan eşlemesi açık (§2, önceki belgelere referansla).
- Staging alanları ve status yaşam döngüsü tanımlandı (§4).
- Legacy ID mapping ve idempotency kuralları bulunuyor (§3, §5).
- Transaction sınırları ve tenant membership zorunluluğu belirtildi (§7, §8).
- Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01 bağımlılıkları korundu (§9, §10, §12).
- Password/session verileri güvenli ele alındı — gerçek değer yok (§10, §11).
- Wave 2/3 kapsam dışı korundu (§14).
- Hiçbir Drizzle şeması/migration dosyası/seed üretilmedi.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değiştirilmedi.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

**R1 doğrulama (2026-09-17):** `./scripts/check.sh --skip-docker` yeniden çalıştırıldı →
**PASS** (yalnızca dokümantasyon düzeltmesi, kod/production/PostgreSQL/SQL Server/Docker/Git
değişikliği yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir Drizzle şeması, migration dosyası veya seed üretmedi** — yalnızca kavramsal
  tasarım sunuldu.
- Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01/Q-P02/Q-ID01 çözülmeden gerçek şemaya dönüştürme
  başlatılamaz.
- §8'deki tenant membership riski implementation aşamasında açıkça ele alınmalı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum

`status: done` — AI1, identity hedef modeli/migration staging schema tasarımını ve TASK-027.11-R1
iç tutarsızlık düzeltmesini inceleyip onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı —
TASK-027.11-R1" bölümü).

# TASK-027.11: Identity hedef modeli ve migration schema

## Amaç

Metnex identity hedef modelini ve migration staging şemasını tanımla.

## Wave ve bağımlılık

TASK-027.7

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
