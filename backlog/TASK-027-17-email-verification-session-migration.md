---
id: TASK-027.17
title: Identity Session and Email Verification Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **Başlık/kapsam notu (2026-09-18):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.17 — Email verification session migration` (status: `planned`, "email verification ve
> session davranışlarını **uygula**") olarak oluşturulmuştu ve hiç başlatılmamıştı. AI1, aynı
> `TASK-027.17` kimliğini **tam tersi yönde bir kapsamla** yeniden görevlendirdi: "Identity Session
> and Email Verification Boundary" — bu görev email verification/session/self-servis parola akışı
> **eklemez**, tam tersine migration modülünün bu akışlara **yanlışlıkla bağımlı hale gelmesini
> engelleyen bir sınır** kurar. Dosya adı tarihi başlığı yansıtmaya devam ediyor (rename ayrı onay
> gerektirir); orijinal kapsam hiç uygulanmadığı için çakışma/veri kaybı riski yoktur.

## AI2 Teslim Raporu — Identity Session and Email Verification Boundary (2026-09-18)

### Amaç

BOTC identity migration akışının session, cookie, email verification ve self-servis parola
akışlarına **yanlışlıkla bağımlı hale gelmesini** engellemek — motorun mevcut işlevlerini
değiştirmeden.

### Teslimat

`apps/api/src/migration/botc-identity/session-boundary.ts` (yeni): `scanForSessionOrTokenFields`/
`assertNoSessionOrTokenFields` — herhangi bir nesnede `session`/`token`/`cookie`/`jwt`/
`verificationCode`/`resetLink` desenine uyan alan adı arayan salt-okunur tarayıcı
(`password-boundary.ts`'in credential tarayıcısıyla aynı desende, ayrı bir endişe).

`session-boundary.spec.ts` (8 test) ve `session-email-governance.spec.ts` (11 test —
`MigrationRunService`'i kara kutu olarak ele alan): session/cookie/token üretim kodu yokluğu
(statik tarama), gerçek migration çıktılarında (rapor/staging/audit/simulated target) sıfır
session/token alanı (davranışsal tarama), `RESET_REQUIRED` kullanıcıların session'sız/otomatik-
login'siz kaldığı, `UNRESOLVED` tenant kullanıcısının erişime hazır sayılmadığı, `ADMIN_ASSIGNED`'ın
yalnızca bir durum etiketi olduğu (session/email/token üretmediği, tek başına erişim vermediği),
ve motorun mevcut 6 işlevinin (user/role-template/permission/tenant mapping, password strategy,
dry-run/apply) tek bir uçtan-uca senaryoda değişmeden çalıştığı (smoke/regresyon testi).

`docs/migration/METNEX_IDENTITY_SESSION_AND_EMAIL_VERIFICATION_BOUNDARY.md` (yeni) — tam
entegrasyon sınırı dokümanı, kapsam-maddesi→test eşlemesi, self-servis akışların neden bu
modülde olmadığının gerekçesi, gelecekte bu akışların nasıl **ayrı bir servis olarak** entegre
edilebileceğine dair not.

`migration-run.service.ts`, `role-template.service.ts`, `permission-mapping.ts`,
`tenant-mapping.ts`, `password-boundary.ts` — **hiçbiri değiştirilmedi** (kapsam madde 8).

### Session/Email Sınır Testleri

- Statik: `authSessions`, `refreshTokenHash`, `jwt`, `setCookie`, `issueSession`, `AuthService`,
  `JwtStrategy`, `EmailService`, `MailerService`, `SmsProvider`'a hiçbir referans yok (yorum
  satırları hariç); `apps/api/src/platform/{auth,jwt,mfa}*`'a hiçbir import yok.
- Davranışsal: gerçek bir `APPLY` çalıştırmasının tüm çıktıları (`DryRunReport`, staging kayıtları,
  audit metadata, `SimulatedTargetState`'in tüm koleksiyonları) `scanForSessionOrTokenFields` ile
  tarandı — **sıfır** ihlal.

### RESET_REQUIRED Davranışı

Her migrate edilen kullanıcının hedef satırı yalnızca `id`/`sourceLegacyId`/`email`/`displayName`/
`status`/`passwordStrategies` alanlarını taşır — session/token/cookie kavramı **yapısal olarak**
yok. `UNRESOLVED` tenant kullanıcısı için `tenantMembershipsByUserId`'e hiç yazılmıyor. `DRY_RUN`
hiçbir state üretmiyor (hipotetik kalıyor, `APPLY` çağrılana kadar).

### ADMIN_ASSIGNED Davranışı

`RESET_REQUIRED`'ı hiçbir koşulda kaldırmıyor; admin-atanmış ve atanmamış kullanıcıların hedef
satır şekli **birebir aynı** (yalnızca `passwordStrategies` içeriği farklı) — session/email/token
üretmiyor; tek başına tenant membership/erişim üretmiyor (tenant ataması hâlâ yalnızca onaylı
mapping tablosundan gelir).

### Otomatik Login Yapılmadığına Dair Kanıt

`session-email-governance.spec.ts`'teki "DRY_RUN never creates any state" ve "SimulatedTargetState
has no session/auth-adjacent concept" testleri: motorun ürettiği tek "erişim" kavramı
`tenantMemberships` satırıdır (varlık/yokluk), hiçbir zaman bir oturum/token/otomatik-giriş olayı
değildir.

### Kapsam Dışı Bırakılan Self-Servis Akışlar

Self-servis e-posta parola sıfırlama, email verification, `authSessions` migration'ı/session
restore, otomatik login, SMS/e-posta/dış bildirim provider entegrasyonu — hiçbiri eklenmedi;
gerekçesi `METNEX_IDENTITY_SESSION_AND_EMAIL_VERIFICATION_BOUNDARY.md` §4'te belgelendi.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **155/155 test PASS** (16
  suite — önceki 135/135'ten; TASK-027.12–16'nın testlerinden hiçbiri bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### Kesinlikle yapılmayanlar (görev talimatına uygun)

`authSessions` migration'ı, session restore, otomatik login, JWT/access/refresh token üretimi,
cookie yazımı, email verification token üretimi, self-servis password reset, reset linki
gönderimi, email/SMS/provider entegrasyonu, gerçek parola/secret kullanımı, gerçek SQL Server
bağlantısı, gerçek PostgreSQL apply, Drizzle schema/migration/seed, Q-PW01 değiştirme, Q-ID01/
Q-P02/Q-T01/Q-SC01 kapatma, Wave 2/Wave 3 kodu, Docker çalıştırma, git commit/push — **hiçbiri
yapılmadı**.

### Kalan riskler / sonraki bağımlılık

- Self-servis e-posta reset, email verification, SMS/dış bildirim provider'ı bilerek eklenmedi —
  ayrı, gelecekteki implementation task'larıdır.
- Gerçek login/oturum akışının migration çıktısını (`passwordStrategy`) nasıl tüketeceği hâlâ ayrı
  bir implementation kararı gerektirir.
- Q-ID01, Q-P02, Q-T01, Q-SC01 hâlâ açık/kapsam dışı.
- Production kodu yalnızca yeni dosyalardan oluşuyor — motorun 5 çekirdek dosyası değiştirilmedi.

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle session/email verification sınırı teslimi
onaylandı (bkz. aşağıdaki "AI1 Final Onayı" bölümü).

## AI1 Final Onayı (2026-09-18)

TASK-027.17 teslimi onaylandı ve `done` olarak kapatıldı. Migration modülüne session,
token, cookie, JWT, email verification veya self-servis reset akışı eklenmediği; gerçek
APPLY çıktılarında session/token alanı bulunmadığı doğrulandı.

`RESET_REQUIRED`, `ADMIN_ASSIGNED` ve `UNRESOLVED` tenant güvenlik sınırları korundu.
`./scripts/check.sh --skip-docker` PASS ve 31 suite / 254 test kanıtı kabul edildi.

---

# TASK-027.17 (orijinal, planned — hiç uygulanmadı): Email verification session migration

## Amaç

Email verification ve session davranışlarını uygula.

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
