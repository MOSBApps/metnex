---
id: TASK-027.14
title: Permission Mapping Coverage and Governance Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **Başlık/kapsam notu (2026-09-18):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.14 — Permission migration implementation` (status: `planned`) olarak oluşturulmuştu ve
> hiç başlatılmamıştı. AI1, aynı `TASK-027.14` kimliğini, yakın ama **daha dar bir kapsamla**
> ("Permission Mapping Coverage and Governance Boundary" — kapsam doğrulama/değişmezlik testi,
> yeni permission kodu üretimi veya gerçek migration/apply **yasak**) yeniden görevlendirdi. Dosya
> adı tarihi başlığı yansıtmaya devam ediyor (rename ayrı onay gerektirir); orijinal kapsam hiç
> uygulanmadığı için çakışma/veri kaybı riski yoktur.

## AI2 Teslim Raporu — Permission Mapping Coverage and Governance Boundary (2026-09-18)

### Amaç

TASK-027.12/13'ün ürettiği BOTC → Metnex permission mapping sözleşmesinin kapsamını **motoru
değiştirmeden** doğrulamak, onaylanmamış permission üretimini engellemek ve unmapped permission
kayıtlarının kontrollü raporlanmasını sağlamak.

### Teslimat

`apps/api/src/migration/botc-identity/` altına 1 yeni dosya + 1 yeni test dosyası eklendi, 3
mevcut test dosyası genişletildi (mevcut hiçbir üretim/motor dosyası değiştirilmedi):

| Dosya | Değişiklik |
|---|---|
| `permission-coverage.ts` (yeni) | `buildUnmappedPermissionReportEntry` (sabit 6 alanlı unmapped permission rapor şekli: legacy ID/name, errorCode, description, migrationRunId, retryable) + `computePermissionMappingCoverage` (onaylı/unmapped/Wave2-3-beklemede/gerçek-katalogda-olmayan karşılaştırması, gerçek `permission-catalogue.ts`'i salt-okunur içe aktarır) |
| `permission-coverage.spec.ts` (yeni) | 10 test |
| `permission-mapping.spec.ts` | +4 test — onaylı map'in tam 5 kayıt olduğu, deterministik/saf fonksiyon, kısmi/case-insensitive eşleşme yapılmadığı |
| `role-template.service.spec.ts` | +3 test — izin sırası bağımsızlığı, duplicate grant idempotency, unmapped grant'in template imzasını değiştirmediği |
| `permission-governance.spec.ts` (yeni) | 8 test — permission staging durumları (`COMPLETED`/`BLOCKED`, deterministik), UserPermission erişim-güvenliği (eşlenemeyen grant asla role template'e veya erişime dönüşmez) |
| `index.ts` | yalnızca yeni barrel export satırı |

### Mapping Coverage Sonucu

| Kategori | Sayı |
|---|---|
| Onaylı (değişmedi) | 5 |
| Wave 2 nedeniyle bilinçli beklemede | 4 |
| Wave 3 nedeniyle bilinçli beklemede | 5 |
| Wave 1/4 kapsamında, kod ataması yok | 3 |

**Bulgu (karar değil, gerçek koddan doğrulandı):** Gerçek `apps/api/src/platform/permission-catalogue.ts`
(`ASSIGNABLE_CATALOGUE`, 10 kod) ile 5 onaylı BOTC kodu arasında **hiç kesişim yok**; ayrıca
`ASSIGNABLE_CATALOGUE` şu an hiçbir production dosyasında kullanılmıyor. Detay ve etkilenen
dokümanlar `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` §0-B'de.

### Kesinlikle yapılmayanlar (görev talimatına uygun)

Yeni permission kodu ekleme, permission catalogue production değişikliği, gerçek SQL Server
bağlantısı, gerçek PostgreSQL apply, Drizzle schema/migration/seed, gerçek BOTC verisi, gerçek
secret/parola/hash/connection string, Q-P02/Q-ID01/Q-T01/Q-SC01 karara bağlama, Wave 2/Wave 3 kodu,
Docker çalıştırma, git commit/push — **hiçbiri yapılmadı**.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **76/76 test PASS** (10 suite
  — önceki 51/51'den; TASK-027.12/13'ün mevcut testlerinin hiçbiri değişmedi/bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### Dokümantasyon güncellemeleri (görev kapsam madde 8)

- `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` — append-only Q-M03 kapsam doğrulama notu.
- `docs/migration/BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §3 — tutarlılık düzeltmesi:
  bu bölüm TASK-027.12-R1'in Q-M03 kapanışını yansıtmıyordu (hâlâ "karar bekleyen" yazıyordu),
  gerçek durumla uyumlu hâle getirildi (**yeni bir karar değil**, unutulmuş bir güncelleme).
- `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` — yeni §0-B (coverage raporu).

### Kalan riskler / sonraki bağımlılık

- 12 BOTC izni hâlâ eşlenmemiş — yeni PO kararı gerektirir, bu task hiçbirini kapatmadı.
- Onaylı 5 kod gerçek `permission-catalogue.ts`'e henüz eklenmedi — gerçek apply implementasyonu
  bu adımı önce gerektirecektir.
- Q-ID01, Q-P02, Q-T01/Q-SC01 hâlâ açık/kapsam dışı.
- Production kodu yalnızca yeni dosyalardan oluşuyor; TASK-027.12/13'ün mevcut dosyaları
  değiştirilmedi.

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle permission mapping coverage teslimi onaylandı (bkz.
aşağıdaki "AI1 Final Onayı" bölümü).

## AI1 Final Onayı (2026-09-18)

TASK-027.14 teslimi onaylandı ve `done` olarak kapatıldı. Coverage katmanının yalnızca
okuma yaptığı, onaylı 5 permission mapping'ini değiştirmediği, yeni kod üretmediği ve
unmapped permission/UserPermission kayıtlarını erişim üretmeden `BLOCKED` olarak raporladığı
doğrulandı.

`ASSIGNABLE_CATALOGUE` ile onaylı BOTC kodları arasındaki kesişimsizlik gerçek bir apply
ön koşulu olarak kayda alınmıştır; bu task içinde production catalogue veya permission
modeli değiştirilmemiştir. `./scripts/check.sh --skip-docker` PASS ve 25 suite / 175 test
kanıtı kabul edildi. Q-ID01, Q-P02, Q-T01/Q-SC01 ve Wave 2/Wave 3 kapsam dışıdır.

---

# TASK-027.14 (orijinal, planned — hiç uygulanmadı): Permission migration implementation

## Amaç

Legacy permission’ları kanonik permission kodlarına dönüştür.

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
