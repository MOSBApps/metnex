---
id: TASK-027.10
title: Migration dry run idempotency rollback standard
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.10 (2026-09-17)

AI1 teslimi onayladı. Sekiz aşamalı migration yaşam döngüsü, dry-run çıktı
standardı, idempotency, backup/checksum, rollback seçenekleri, transaction
sınırları, doğrulama kapıları, hata kategorileri ve audit metadata standardı
Metnex'in gerçek kod desenleriyle uyumlu bulundu. Q-MG01/Q-MG02 append-only
korundu; hiçbir migration/rollback komutu çalıştırılmadı, Wave 2/Wave 3 kapsam
dışı bırakıldı ve `./scripts/check.sh --skip-docker` PASS'tir.

TASK-027.10 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

Metnex kod tabanındaki gerçek, var olan desenler temel alındı: `apps/api/src/tenant-scope/
customer-schema-registry.service.ts` (idempotent provisioning — durum makinesi, `onConflictDoUpdate`,
`FAILED`'ten yeniden deneme), `apps/api/src/platform/bootstrap.service.ts` (`db.transaction()`
sınırı örneği), `backup/openmas-pre-metnex-migration-20260917_072650.dump` + `.sha256` (bu
oturumda TASK-024.5'te fiilen üretilmiş gerçek backup+checksum deseni), `apps/api/src/audit/
platform-audit.service.ts` (TASK-027.9'da incelenen audit sözleşmesi, migration run metadata'sına
genişletildi).

### Teslimat

`docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`:

- **§1** 8 aşamalı migration yaşam döngüsü (preflight/backup/dry-run/approval gate/apply/
  verification/reconciliation/finalize-rollback) — approval gate'in zorunlu insan müdahale
  noktası olduğu vurgulandı.
- **§2** Dry-run çıktı standardı — 8 zorunlu alan (eklenecek/güncellenecek/atlanacak kayıt,
  çakışmalar, tenant/permission-role eşleme hataları, parola/reset gereksinimleri, kritik uyarılar).
- **§3** Idempotency kuralları — 4 gereksinim, `customer-schema-registry.service.ts` gerçek
  koduna dayandırıldı.
- **§4** Backup standardı — gerçek TASK-024.5 dump+checksum+isimlendirme deseni referans alındı.
- **§5** 4 rollback stratejisi (transaction rollback/kontrollü silme/backup restore/compensating
  migration) karşılaştırıldı — **hiçbiri varsayılan olarak seçilmedi**, hiçbir rollback komutu
  çalıştırılmadı.
- **§6** Transaction sınırları — `bootstrap.service.ts` deseni referans alınarak hazırlık
  amaçlı ilke tanımlandı, implementation üretilmedi.
- **§7** 5 doğrulama kapısı (tenant/role/permission/user/legacy-ID mapping), ilgili açık sorulara
  (Q-M06/Q-P01/Q-P04/Q-M03) bağlandı.
- **§8** 4 hata kategorisi (fatal/recoverable/warning/skipped) ve devam/durdurma politikası.
- **§9** Audit/migration run metadata standardı, gerçek `PlatformAuditLogInput` sözleşmesine eşlendi.
- **§10** Dry-run/apply çıktı karşılaştırılabilirliği.

### Yeni açık sorular (Q-MG01–Q-MG02, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E/Q-T/Q-SC/Q-P/Q-PW/
Q-AD serisi **korunarak** 2 yeni soru eklendi:

- **Q-MG01** — Approval gate hangi arayüzden verilecek (PO onayı gerekli).
- **Q-MG02** — Migration run metadata genel log'a mı, ayrı tabloya mı (PO'ya raporlanır).

Özet tablosuna 2 yeni satır eklendi, mevcut satırlar değiştirilmedi.

### Kapsam kriterleri karşılama

- Dry-run çıktısı ve approval gate standardı tanımlandı (§1, §2).
- Idempotency ve duplicate önleme kuralları açık (§3).
- Backup, checksum ve restore doğrulama adımları belgelendi (§4).
- Rollback seçenekleri ve riskleri karşılaştırıldı (§5).
- Tenant/role/permission/legacy ID doğrulama kapıları tanımlandı (§7).
- Fatal/recoverable/warning/skipped hata davranışları tanımlandı (§8).
- Audit ve migration run metadata standardı tanımlandı (§9).
- Gerçek secret/parola/hash/connection string hiçbir teslim dokümanına yazılmadı.
- Wave 2/3 kapsam dışı korundu (§11).
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değiştirilmedi.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı/script üretmedi** — standart, Wave 1/4/5'in
  entity-spesifik migration task'larında somutlaştırılmayı bekliyor.
- Q-MG01/Q-MG02 (approval gate mekanizması, migration run metadata konumu) ve §5.1'deki rollback
  strateji varsayılanı belirsizliği implementation başlamadan netleşmeli.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Hiçbir migration
  script'i çalıştırılmadı, hiçbir rollback komutu icra edilmedi. Git commit/push yapılmadı.

### Durum

`status: done` — AI1, migration dry-run/idempotency/rollback standardını ve Q-MG01–Q-MG02 açık
sorularını inceleyip onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.10" bölümü).

# TASK-027.10: Migration dry run idempotency rollback standard

## Amaç

Dry-run, idempotency, backup ve rollback standartlarını tanımla.

## Wave ve bağımlılık

TASK-027.1; TASK-027.6

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
