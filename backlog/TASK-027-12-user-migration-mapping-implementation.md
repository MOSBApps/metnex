---
id: TASK-027.12
title: User migration mapping implementation
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI2 Teslim Raporu — Wave 1 User Migration Implementation (2026-09-17)

### Amaç

"TASK-027.12: Wave 1 User Migration Implementation" görev talimatı doğrultusunda, BOTC
kullanıcı/rol/permission/tenant-üyelik verisini Metnex identity modeline dönüştüren migration
implementation ve dry-run motoru inşa edildi.

### Teslimat

`apps/api/src/migration/botc-identity/` — framework-hafif bir TypeScript motoru (14 kaynak dosya +
6 `*.spec.ts` test dosyası, 25 test). Tam açıklama, kapsam maddesi eşlemesi, Q-ID01/Q-P02 koruma
gerekçesi ve bilerek üretilmeyen parçalar `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md`
§0'da detaylandırılmıştır — burada tekrar üretilmez.

Özet: kaynak adapter arayüzü (+ test fixture implementasyonu), legacy ID→UUID mapping, User mapping
(email/displayName/status/createdAt), Q-M03 permission kod eşlemesi (yalnızca onaylı 5 kod),
Q-M04 ortak rol şablonu kümeleme algoritması, Q-M06 onaylı tenant mapping tablosu (`Sirket`
**hiç okunmuyor**), duplicate/conflict deterministik çözümleme, `tenantMembershipStatus`
(ASSIGNED/UNRESOLVED), `passwordStrategy` (RESET_REQUIRED zorunlu + ADMIN_ASSIGNED ek bayrak),
8+ alanlı dry-run raporu, idempotent re-run, FAILED kayıt retry'i, audit-metadata şekli.

### Q-ID01 / Q-P02 koruması

Görev talimatının "Q-ID01 koruması" maddesi **tetiklenmedi**: fiziksel bir Drizzle şeması/migration
hiç üretilmedi — staging, yalnızca process ömrü boyunca yaşayan bir in-memory simülasyondur
(`InMemoryStagingStore`). Bu, Q-ID01'i (şema yerleşimi/retention) **çözmeden** kalan tüm kapsam
maddelerinin uygulanmasını sağladı; Q-ID01 hâlâ tamamen açıktır. Aynı şekilde Q-P02
(`VisibilitySettings`) bu implementasyonda hiç ele alınmadı.

### Kesinlikle yapılmayanlar (görev talimatına uygun)

Gerçek SQL Server bağlantısı, gerçek PostgreSQL apply (yalnızca in-memory `SimulatedTargetState`'e
yazılır), `authSessions` oluşturma, gerçek parola/hash/salt/token üretimi/loglaması, Wave 2/Wave 3
modüllerine dokunma, Docker çalıştırma, git commit/push — **hiçbiri yapılmadı**.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **25/25 PASS**.
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/kullanıcı verisi hiçbir dosyaya yazılmadı (tüm test fixture'ları sentetik).

### Kalan riskler / sonraki bağımlılık

- Q-ID01 (staging şema/retention), Q-P02 (`VisibilitySettings`), Q-T01/Q-SC01'in lokasyon-özel
  kısımları hâlâ açık.
- Gerçek SQL Server adapter'ı, gerçek PostgreSQL apply katmanı ve staging tablosunun fiziksel
  şeması ayrı implementation task'ları + AI1 onayı gerektirir.
- 11 BOTC `Can*` izni hâlâ onaylı bir hedef kod bekliyor (yalnızca 5'i eşlendi).
- Production kodu yalnızca yeni dosyalardan oluşuyor — mevcut hiçbir dosya değiştirilmedi.

### Durum (2026-09-17 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle implementation onaylandı: 6 suite/25 test geçti,
`git diff --check` başarılı, gerçek SQL Server/PostgreSQL bağlantısı/apply yapılmadığı, permission/
tenant/parola/in-memory sınırlarının onaylı kararlara uyduğu, Q-ID01/Q-P02/Q-T01/Q-SC01'in açık/
kapsam dışı kaldığı ve Wave 2/Wave 3'ün kapsam dışı korunduğu teyit edildi.

## TASK-027.12-R1 — Karar Kapılarının Kapatılması (2026-09-17)

AI1/Product Owner, aşağıdaki 6 karar kapısını TASK-027.12-R1 görev talimatıyla kapatmıştır:

| Kapı | Karar (özet) |
|---|---|
| Q-P01 | BOTC rolleri → `tenantRoles` (tüm roller, `Admin` dahil); `systemRoles` yalnızca platform yönetimi için |
| Q-M03 | Mevcut `MODULE:RESOURCE:ACTION` taslak eşlemesi kesinleşti |
| Q-M04 | Kullanıcı-başına-özel-rol yok; ortak permission set'lerinden tenant-kapsamlı rol şablonları |
| Q-M06 | `Sirket` kullanılmayacak; ayrı onaylı mapping tablosu, bilinen tenant'lar MOSB/MOSEDAŞ/MOSBİO, belirsiz lokasyonlar karar bekleyen kayıt olarak kalır |
| Q-A03 | BOTC hash/global salt taşınmayacak; zorunlu parola sıfırlama (`passwordStrategy = RESET_REQUIRED`) |
| Q-PW01 | Self-servis e-posta akışı yok; ilk aşamada admin-driven parola atama, self-servis akış ayrı bir task |

Tam karar kaydı (gerekçe, etkilenen task'lar, kalan riskler, rollback ihtiyacı) için
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki "Karar Kapanışları — Wave 1 Identity
(TASK-027.12-R1)" bölümüne bakınız. Kararlar şu belgelere işlendi: `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md`
(§2, §4), `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` (§2.2, §2.4, §3, §4, §6),
`BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` (§4, §6), `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`
(§2, §4.1, §9, §10, §12).

**Bu R1'de de implementation yapılmamıştır** — yalnızca kararlar dokümanlara işlendi. **6 kapının
tamamı artık kapalı**; TASK-027.12'nin implementation'ı, AI1'in bu R1'i ayrıca onaylamasıyla
başlatılabilir. `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` içinde Q-P02 (`VisibilitySettings`),
Q-ID01 (staging tablosu şema/retention) ve Q-T01/Q-SC01'in lokasyon-özel kısımları **hâlâ açıktır**
— bunlar TASK-027.12'nin (User migration) kapsamını doğrudan bloklamaz (Q-P02/Q-ID01 Wave 5/genel
implementation'a ait; Q-T01/Q-SC01'in çözülmemiş kısmı yalnızca belirsiz-lokasyonlu kullanıcıları
`tenantMembershipStatus = UNRESOLVED` durumunda tutar, bu beklenen bir ara durumdur).

Yeni bir açık soru üretilmedi.

`./scripts/check.sh --skip-docker` → **PASS** (yalnızca dokümantasyon değişikliği, kod/production/
PostgreSQL/SQL Server/Docker/Git değişikliği yok).

## AI2 Teslim Raporu (2026-09-17) — BLOCKER RAPORU, IMPLEMENTATION YAPILMADI

### Kontrol yöntemi

Görev talimatının kendi başlatma koşulu gereği, implementation'a geçmeden önce
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` baştan sona taranarak Q-P01, Q-M03, Q-M04,
Q-M06, Q-A03, Q-PW01'in güncel durumu doğrulandı (her sorunun "Önerilen karar" alanı ve olası bir
kapanış işareti aranarak). Ayrıca bu 6 sorunun önceki AI1 onaylarında (TASK-027.7/8/11-R1)
yalnızca dokümantasyon kalitesinin onaylandığı, sorunun kendisinin **kapatılmadığı**
`docs/opendevcon/PROGRESS_LOG.md` kayıtlarından teyit edildi.

### Kritik bulgu

**6 karar kapısının 6'sı da hâlâ açık.** Görev talimatının başlatma koşulu ("Q-P01, Q-M03, Q-M04,
Q-M06, Q-A03 ve Q-PW01 çözülmeden bu task implementation için ready değildir") **karşılanmamıştır**.
Bu nedenle görev talimatının kendi kuralına uyularak **hiçbir implementation üretilmemiştir** —
ne bir Drizzle şeması, ne migration/seed kodu, ne bir dry-run script'i, ne SQL Server bağlantısı.

### Teslimat

`docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` — **blocker raporu**:

- **§1** 6 karar kapısının güncel durum tablosu (hepsi "Açık", kaynak referanslarıyla).
- **§2** Ne hazır (önceki task'larda tasarlanmış, implementation'ı bekleyen) vs. ne yapılamadı
  (görev talimatının her kapsam maddesi için hangi kapının onu blokladığı açıkça eşlendi).
- **§3** PO'nun her kapıyı kapatmak için bakması gereken belge/bölüm haritası (kontrol listesi).
- **§4** Wave 2/3 kapsam dışı teyidi.

### Kapsam kriterleri karşılama

- Karar kapıları çözülmeden implementation yapılmadı (§1, kabul kriteri #1).
- Dry-run/legacy-ID/tenant-membership/password-session gereksinimleri (kabul kriteri #2–#5)
  **uygulanmadı** — bunlar zaten kapı açıkken uygulanamayacak maddelerdi, §2.2'de neden
  yapılamadıkları açıkça belgelendi.
- Duplicate/email çakışması kuralları (kabul kriteri #6) — implementation olmadığı için
  **üretilmedi**, bu da kapı-açık senaryosunun doğal sonucu.
- Wave 2/3 kapsam dışı korundu (§4).
- Gerçek secret/parola/hash/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu yalnızca açıkça onaylanan kapsamda değiştirilebilir kuralına uyuldu —
  **hiçbir kapsam onaylı olmadığı için hiçbir production kodu değiştirilmedi**.
- PostgreSQL apply/SQL Server erişimi/rollback için AI1 onayı gerekiyor kuralına uyuldu —
  **hiçbiri talep edilmedi/gerçekleştirilmedi**.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok — bu
belge yalnızca bir blocker raporudur).

### Kalan riskler / sonraki bağımlılık

- **Bu task hiçbir implementation üretmemiştir** — 6 karar kapısının tamamı PO tarafından
  kapatılmadan TASK-027.12 yeniden ele alınamaz.
- PO kısmi karar verirse (bazı kapılar kapansın, bazıları açık kalsın), kısmi implementation'ın
  başlayıp başlamayacağı **ayrı bir AI1 talimatı** gerektirir — bu belge yalnızca "hepsi açık"
  senaryosunu ele almıştır.
- Yeni bir açık soru üretilmedi — mevcut 6 sorunun durumu **doğrulandı**, değiştirilmedi.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum (2026-09-17 güncelleme — AI1 TASK-027.12-R1'i onayladı)

`status: ready` — blocker raporu geçerliliğini korur (o tarihte 6 karar kapısının tamamı açıktı ve
implementation doğru şekilde üretilmedi). AI1, TASK-027.12-R1 ile 6 karar kapısının tamamını
kapatmış ve bu task'ı implementation için `ready` durumuna almıştır (bkz. dosyanın başındaki
"AI1 Kararı — TASK-027.12-R1 Onayı" bölümü). Artık `blocked` değildir; implementation AI1'in bu
task için ayrıca vereceği bir sonraki görev talimatıyla başlatılabilir.

# TASK-027.12: User migration mapping implementation

## Amaç

Kaynak kullanıcılarını Metnex kullanıcı modeline dönüştür.

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

## AI1 Kararı — TASK-027.12-R1 Onayı (2026-09-17)

TASK-027.12-R1 onaylandı ve `done` olarak kapatıldı. Bu task implementation için
`ready` durumuna alındı. Uygulama; onaylanan tenant role/permission, tenant mapping
ve password kararlarına uymalıdır.

Q-T01/Q-SC01 nedeniyle çözülemeyen tekil lokasyonlarda kullanıcı erişime hazır kabul
edilmeyecek, `tenantMembershipStatus = UNRESOLVED` olarak raporlanacaktır. Q-P02 ve
Q-ID01 bu task'ın kapsamı dışındadır.

Canlı PostgreSQL apply, gerçek SQL Server bağlantısı, gerçek kullanıcı/parola verisi,
rollback veya secret kullanımı bu task içinde yapılmayacaktır; bunlar için ayrıca AI1
onayı gerekir. Wave 2/Wave 3 kapsam dışıdır.

## AI1 Final Onayı (2026-09-17)

TASK-027.12 teslimi onaylandı. In-memory staging ve simulated target sınırı korunmuş;
gerçek SQL Server/PostgreSQL bağlantısı, apply, secret/parola/hash aktarımı ve
`authSessions` yazımı yapılmamıştır. Q-M03 kapsamında yalnızca onaylı permission kodları
eşlenmiş, diğer permission'lar uydurulmadan raporlanmıştır. Q-M04 rol şablonu, Q-M06
harici tenant mapping, `UNRESOLVED` üyelik ve `RESET_REQUIRED` parola kararları doğru
uygulanmıştır.

`./scripts/check.sh --skip-docker` PASS ve 21 suite / 124 test kanıtı kabul edildi.
Q-ID01, Q-P02 ve Q-T01/Q-SC01 kapsam dışı/açık olarak korunmuştur. Task `done` durumuna
alınmıştır.
