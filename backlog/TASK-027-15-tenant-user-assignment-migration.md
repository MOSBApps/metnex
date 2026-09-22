---
id: TASK-027.15
title: Tenant Mapping Coverage and Assignment Governance Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **TASK-027.15-R1 düzeltmesi (2026-09-18):** AI1, bu tesliminin bir kritik tutarsızlık
> içerdiğini tespit etti: çakışan (`conflict`) tenant mapping kayıtları `FATAL` olarak
> raporlanmasına rağmen `MigrationRunService` çakışan kullanıcıya yine de bir tenant membership
> yazıyordu — kabul kriteriyle ("conflict kayıtları erişim üretmeden raporlanmalı") çelişen bir
> güvenlik açığı. Bu **onaylanmamıştır**, `status: review` kalır. Düzeltme
> `backlog/TASK-027-15-R1-tenant-conflict-access-gate-correction.md`'de teslim edilmiştir —
> aşağıdaki rapor, o düzeltme öncesindeki **orijinal (hatalı davranışı içeren) teslimin tarihi
> kaydıdır**, değiştirilmemiştir. Güncel/doğru davranış ve güncel test sayısı (109/109) için R1
> dosyasına ve `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` §0-C-R1'e bakınız.

> **Başlık/kapsam notu (2026-09-18):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.15 — Tenant user assignment migration` (status: `planned`) olarak oluşturulmuştu ve
> hiç başlatılmamıştı. AI1, aynı `TASK-027.15` kimliğini, yakın ama **daha dar bir kapsamla**
> ("Tenant Mapping Coverage and Assignment Governance Boundary" — kapsam doğrulama/coverage raporu,
> yeni tenant/lokasyon kararı üretimi veya gerçek migration/apply **yasak**, Q-T01/Q-S03
> **kapatılamaz**) yeniden görevlendirdi. Dosya adı tarihi başlığı yansıtmaya devam ediyor (rename
> ayrı onay gerektirir); orijinal kapsam hiç uygulanmadığı için çakışma/veri kaybı riski yoktur.

## AI2 Teslim Raporu — Tenant Mapping Coverage and Assignment Governance Boundary (2026-09-18)

### Amaç

TASK-027.12–14'ün ürettiği tenant mapping ve identity migration sözleşmesinin güvenliğini
**motoru değiştirmeden** doğrulamak; onaylı tenant mapping tablosu, çakışmalar, unresolved
kayıtlar ve tenant membership çıktılarının deterministik olmasını sağlamak.

### Teslimat

`apps/api/src/migration/botc-identity/` altına 1 yeni dosya + 2 yeni test dosyası eklendi,
`source-validation.ts`'e 3 yeni kural eklendi (mevcut 8 kural değişmedi); `tenant-mapping.ts`,
`tenant-mapping-adapter.ts`, `migration-run.service.ts` **hiçbiri değiştirilmedi**:

| Dosya | Değişiklik |
|---|---|
| `tenant-coverage.ts` (yeni) | `buildTenantMappingReportEntry` (sabit 7 alanlı rapor şekli) + `computeTenantMappingCoverage` (toplam/mapping-tablosunda/ASSIGNED/UNRESOLVED/conflict/orphan/tenant-bazlı + statik bilinen-belirsiz-lokasyon referansı) |
| `tenant-coverage.spec.ts` (yeni) | 10 test |
| `source-validation.ts` | +3 kural: boş tenant slug (`FATAL_EMPTY_TENANT_SLUG`), orphan tenant mapping kaydı (`RECOVERABLE_ORPHAN_TENANT_MAPPING_ENTRY`), tam duplicate mapping satırı (`WARNING_DUPLICATE_TENANT_MAPPING_ROW`) |
| `source-validation.spec.ts` | +4 test |
| `tenant-governance.spec.ts` (yeni) | 11 test — ASSIGNED/UNRESOLVED/conflict davranışı, `Sirket`'in hiç okunmadığı, idempotency (duplicate yok, gecikmeli çözülen mapping yeniden işlenebilir, checksum değişikliği güvenli), root tenant/aggregate genişletilmediği |
| `index.ts` | yalnızca yeni barrel export satırı |

### Tenant Coverage / Dağılım

Coverage raporu (`computeTenantMappingCoverage`) verilen kaynak+tablo çiftine göre şu alanları
üretir: `totalSourceUsers`, `usersInMappingTable`, `assignedUsers`, `unresolvedUsers`,
`conflictRecords`, `orphanMappingRecords`, `usersByTenant` (MOSB/MOSEDAS/MOSBIO), ve statik
`knownPendingLocationCategories`. Test fixture'larındaki örnek dağılım
`tenant-coverage.spec.ts`/`tenant-governance.spec.ts`'te doğrulanmıştır — gerçek BOTC kullanıcı
sayısı bu ortamdan bilinmediği için sabit bir üretim rakamı iddia edilmemiştir.

### Validation Kuralları (item 2)

`source-validation.ts`'in önceki 8 kuralı (boş/duplicate legacy ID, orphan role/permission/user,
geçersiz tenant slug, çakışan tenant mapping, eksik zorunlu alan) korunarak 3 yeni kural eklendi.
Toplam 11 kural, hepsi deterministik ve `source-validation.spec.ts` ile test edilmiştir.

### Root Tenant / Aggregate Etkisi (item 7)

`apps/api/src/migration/botc-identity/` altında hiçbir dosyanın `TenantScopeService`,
`canAggregateChildren` veya `tenant-scope`'a referans vermediği statik dosya taramasıyla
doğrulandı — root tenant aggregate yetkisi bu task'ta **genişletilmedi**. Üretilen
`tenantMemberships` satırı yalnızca `{ userId, tenantSlug }` alanlarını taşır.

### Kesinlikle yapılmayanlar (görev talimatına uygun)

`Sirket`'i tenant kaynağı olarak kullanma, yeni tenant oluşturma, yeni tenant slug/ağaç kararı,
Q-T01/Q-S03 kapatma, root tenant aggregate yetkisi verme, gerçek SQL Server bağlantısı, gerçek
PostgreSQL apply, Drizzle schema/migration/seed, gerçek BOTC verisi/secret, `authSessions` yazımı,
Wave 2/Wave 3 kodu, Docker çalıştırma, git commit/push — **hiçbiri yapılmadı**.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **102/102 test PASS** (12
  suite — önceki 76/76'dan; TASK-027.12/13/14'ün testlerinin hiçbiri değişmedi/bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### Dokümantasyon güncellemeleri (görev kapsam madde 8)

- `docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md` — yeni §10, Q-T01/Q-S03'ün kapatılmadığı
  açıkça teyit edildi.
- `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` — append-only kapsam-doğrulama notu.
- `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` — yeni §0-C (coverage raporu, Sirket/
  root-tenant teyidi, idempotency kanıtı).

### Kalan riskler / sonraki bağımlılık

- Q-T01 ve Q-S03 **kapatılmadı** — bilinen belirsiz lokasyonlara bağlı kullanıcılar kalıcı olarak
  `UNRESOLVED` kalabilir.
- Q-ID01 ve Q-P02 hâlâ açık/kapsam dışı.
- Root tenant/MİP aggregate erişimi bu task'ta hiç ele alınmadı — gerçek implementasyon aşamasında
  `TenantScopeService`'in var olan mekanizmasıyla ayrıca tasarlanmalıdır.
- Production kodu yalnızca yeni/genişletilmiş dosyalardan oluşuyor; TASK-027.12/13/14'ün mevcut
  motor dosyaları değiştirilmedi.

### Durum

`status: review` — kapsam doğrulandı, testler geçti; nihai `done` kararı AI1'e bırakılmıştır.

### Durum (2026-09-18 güncelleme — AI1 kritik bir tutarsızlık tespit etti, onaylanmadı)

AI1, çakışan tenant mapping kayıtlarının hem `FATAL` raporlanıp hem de erişim ürettiğini tespit
etti. Düzeltme `TASK-027.15-R1` ile teslim edildi (bkz.
`backlog/TASK-027-15-R1-tenant-conflict-access-gate-correction.md`).

### Durum (2026-09-18 ikinci güncelleme — AI1 R1'i onayladı)

`status: done` — AI1, TASK-027.15-R1 güvenlik düzeltmesini onayladı ve bu ana kaydı da `done`
olarak kapattı. Conflict kullanıcılarının `resolved` map'inden çıkarıldığı, conflict durumunda
tenant membership/runtime erişim oluşmadığı ve düzeltilmiş mapping ile sonraki çalıştırmada tek
geçerli membership oluştuğu doğrulandı. `./scripts/check.sh --skip-docker` PASS; 27 suite / 208
test kabul edildi. Q-T01, Q-S03, Q-ID01, Q-P02 ve Wave 2/3 kapsam dışı kaldı.

---

# TASK-027.15 (orijinal, planned — hiç uygulanmadı): Tenant user assignment migration

## Amaç

Kullanıcı-tenant ve lokasyon ilişkilerini migrate et.

## Wave ve bağımlılık

TASK-027.12; TASK-027.13; TASK-027.14

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

## AI1 Final Onayı (2026-09-18)

TASK-027.15 ve TASK-027.15-R1 birlikte onaylandı. R1 ile conflict kayıtlarının erişim
üretmesi engellendi; conflict kullanıcıları `UNRESOLVED` kalıyor ve membership almıyor.
Bu düzeltme sonrasında ana task `done` durumuna alındı. Üstteki R1 uyarısı tarihsel ilk
teslim kaydını açıklamaktadır; güncel karar R1 teslimidir.
