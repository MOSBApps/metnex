---
id: TASK-027.16
title: Password Reset Import and Admin Assignment Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **Başlık/kapsam notu (2026-09-18):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.16 — Password reset import flow` (status: `planned`) olarak oluşturulmuştu ve hiç
> başlatılmamıştı. AI1, aynı `TASK-027.16` kimliğini, yakın ama **daha dar bir kapsamla**
> ("Password Reset Import and Admin Assignment Boundary" — motorun mevcut parola-sözleşmesi
> doğrulaması/testi, self-servis akış eklenmesi **yasak**, gerçek migration/apply **yasak**)
> yeniden görevlendirdi. Dosya adı tarihi başlığı yansıtmaya devam ediyor (rename ayrı onay
> gerektirir); orijinal kapsam hiç uygulanmadığı için çakışma/veri kaybı riski yoktur.

## AI2 Teslim Raporu — Password Reset Import and Admin Assignment Boundary (2026-09-18)

### Amaç

BOTC kullanıcı migration çıktılarının Metnex parola güvenlik modeliyle (Q-A03 zorunlu sıfırlama,
Q-PW01 admin-driven atama) uyumlu olduğunu **motoru gereksiz yere değiştirmeden** doğrulamak.

### Teslimat

`apps/api/src/migration/botc-identity/password-boundary.ts` (yeni): `validatePasswordStrategyInvariant`
(RESET_REQUIRED zorunlu taban) + `scanForCredentialFields`/`assertNoCredentialFields` (genel amaçlı
credential-alan tarayıcı — rapor/audit-metadata/staging-record gibi herhangi bir nesnede
password/hash/salt/token/secret benzeri alan adı arar, yalnızca `passwordStrategy(ies)` durum
etiketlerini istisna tutar).

`password-boundary.spec.ts` (13 test) ve `password-governance.spec.ts` (18 test —
`MigrationRunService`'i kara kutu olarak ele alan): password strategy davranışı, admin assignment
kalıcılığı/idempotency, login/tenant-hazırlık güvenlik sözleşmesi, secret redaction (gerçek rapor/
audit-metadata/staging çıktıları üzerinde programatik tarama), auth session sınırı (statik dosya
taraması), self-servis akış kapsam dışı teyidi.

### Bulunan ve Düzeltilen Tutarsızlık

`migration-run.service.ts`'te bir gerçek davranış hatası bulundu: `passwordStrategies`, bir
kullanıcının **her** güncellemesinde (checksum değişikliği) sıfırdan yeniden hesaplanıyordu, o
çalıştırmanın `adminAssignedPasswordLegacyIds` kümesine bakarak — daha önce `ADMIN_ASSIGNED`
almış bir kullanıcı, sonraki bir çalıştırmada bu kümeye yeniden dahil edilmezse bayrağını
**sessizce kaybedebiliyordu** ("admin assignment durumu yanlışlıkla silinmemeli" gereksinimini
ihlal). Tek noktadan, minimal düzeltme: `ADMIN_ASSIGNED`, bir kez kaydedildikten sonra sonraki
çalıştırmalarda korunur (targetId'nin güncellemeler arasında korunma ilkesiyle aynı desen). Diğer
hiçbir motor dosyası değiştirilmedi.

### Password Strategy / Admin Assignment Davranışı

- Admin ataması olmayan kullanıcı → yalnızca `RESET_REQUIRED`.
- Admin tarafından geçici parola atanmış kullanıcı → `RESET_REQUIRED` + `ADMIN_ASSIGNED` (ek,
  asla yerine geçen değil).
- `RESET_REQUIRED` hiçbir koşulda kaldırılmıyor.
- `UNRESOLVED` tenant kullanıcıları, parola durumundan bağımsız olarak erişime hazır sayılmıyor
  (tenant membership hiç yazılmıyor).

### Secret Redaction Kanıtı

Gerçek `DryRunReport`, `buildAuditMetadata(...)` çıktısı ve `stagingStore.all()` üzerinde
`scanForCredentialFields()` çalıştırıldı — admin assignment ve simulated failure senaryoları
dahil, **sıfır** credential-benzeri alan bulundu (varsayım değil, programatik kanıt).

### Auth Session Sınırı / Self-servis Akış

Statik dosya taraması: `apps/api/src/migration/botc-identity/` altında `authSessions`,
`refreshTokenHash`, JWT, cookie, `resetPassword`, `verifyEmail`, SMS/bildirim provider'ına
**hiçbir referans yok**. `SimulatedTargetState`'in kendi şekli hiçbir session/cookie kavramı
içermiyor.

### Kesinlikle yapılmayanlar (görev talimatına uygun)

BOTC PasswordHash/global salt taşıma, legacy parola doğrulama fallback'i, gerçek parola/hash/salt/
token üretme, self-servis e-posta reset/email verification akışı, `authSessions` yazma, gerçek SQL
Server bağlantısı, gerçek PostgreSQL apply, Drizzle schema/migration/seed, Q-ID01/Q-P02/Q-T01/
Q-SC01 karara bağlama, Wave 2/Wave 3 kodu, Docker çalıştırma, git commit/push — **hiçbiri
yapılmadı**.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **135/135 test PASS** (14
  suite — önceki 109/109'dan; TASK-027.12/13/14/15'in testlerinden hiçbiri bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### Dokümantasyon güncellemeleri (görev kapsam madde 9)

- `docs/migration/BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` — yeni §13, Strateji 1'in
  implementation seviyesinde doğrulandığı ve bulunan tutarsızlığın düzeltildiği teyit edildi
  (Q-A03/Q-PW01 yeniden karara bağlanmadı).
- `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` — yeni §0-D.
- İlgili bir auth/security runbook'u güncellenmedi — bu task production auth koduna hiç
  dokunmuyor, yalnızca migration simülasyon modülünü kapsıyor; mevcut hiçbir runbook migration
  parola stratejisine referans vermiyordu (`grep` ile doğrulandı), bu nedenle güncelleme
  gerekmedi.

### Kalan riskler / sonraki bağımlılık

- Self-servis e-posta reset, email verification, SMS/dış bildirim provider'ı bilerek eklenmedi —
  ayrı, gelecekteki implementation task'larıdır.
- `authSessions`'a hâlâ hiçbir satır yazılmıyor — gerçek login/oturum akışı bu motorun kapsamı
  dışında kalmaya devam eder.
- Gerçek admin-driven parola atama akışının (Metnex'in var olan `setPassword` fonksiyonu)
  migration motoruyla entegrasyonu hâlâ ayrı bir implementation kararı gerektirir.
- Q-ID01, Q-P02, Q-T01, Q-SC01 hâlâ açık/kapsam dışı.
- Production kodu yalnızca yeni dosyalardan oluşuyor, tek istisna `migration-run.service.ts`'teki
  minimal düzeltme.

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle password reset import ve admin assignment sınırı
teslimi onaylandı (bkz. aşağıdaki "AI1 Final Onayı" bölümü).

## AI1 Final Onayı (2026-09-18)

TASK-027.16 teslimi onaylandı ve `done` olarak kapatıldı. `RESET_REQUIRED` zorunlu
tabanının korunduğu, `ADMIN_ASSIGNED` durumunun tekrar çalıştırmalarda kaybolmadığı ve
gerçek credential alanlarının rapor/audit/staging çıktılarında bulunmadığı doğrulandı.

Self-servis reset/email verification/session üretimi, gerçek parola/hash/secret kullanımı
ve gerçek DB apply yapılmamıştır. `./scripts/check.sh --skip-docker` PASS ve 29 suite /
234 test kanıtı kabul edildi.

---

# TASK-027.16 (orijinal, planned — hiç uygulanmadı): Password reset import flow

## Amaç

Güvenli password reset/import akışını uygula.

## Wave ve bağımlılık

TASK-027.8; TASK-027.11

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
