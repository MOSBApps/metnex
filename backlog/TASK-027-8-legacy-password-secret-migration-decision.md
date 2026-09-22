---
id: TASK-027.8
title: Legacy password secret migration decision
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.8 (2026-09-17)

AI1 teslimi onayladı. BOTC'de kullanıcı-başına-salt metodunun kullanılmadığı ve
üretimde global salt akışının sürdüğü kaynak kodla doğrulandı. Metnex'te self-servis
reset/e-posta doğrulama akışının bulunmadığı Q-PW01 ile kayıt altına alındı.
Üç parola geçiş stratejisi güvenlik/UX/operasyon/rollback açısından karşılaştırıldı;
hiçbiri seçilmedi. Düz metin parola, legacy hash, global salt, AES anahtarı ve
session/token verisinin taşınmaması kabul edildi. Wave 2/Wave 3 kapsam dışı ve
`./scripts/check.sh --skip-docker` PASS'tir.

TASK-027.8 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

`BOT.Services/PasswordHasher.cs` (tam dosya) ve `AuthService.cs`/`UserService.cs`'nin parola
çağrı noktaları yeniden okundu, hangi metotların fiilen çağrıldığı ayrı bir `grep` ile teyit
edildi. Metnex tarafında `apps/api/src/platform/crypto.ts`, `auth.service.ts`, `user.service.ts`
gerçek kod olarak okundu; ayrıca Metnex'in self-servis parola sıfırlama/e-posta doğrulama akışı
olup olmadığı `grep -rln "resetPassword|forgotPassword|password-reset|PasswordReset"` ile tüm
`apps/api/src`/`apps/web/src` üzerinde arandı.

### Kritik bulgular

1. **BOTC'de kullanıcı-başına-salt deseni kodlanmış ama hiç kullanılmamış** — `PasswordHasher.
   HashToBase64` (rastgele salt üretir) hiçbir yerden çağrılmıyor; üretimde hâlâ tek global salt
   (`HashWithSaltBase64` + `Auth:PasswordSalt`) kullanılıyor. Kod içi yorum ("ileride ... eklersen
   kullanırız") geliştiricilerin zayıflığın farkında olduğunu ama düzeltmediğini gösteriyor.
2. **Metnex'te bugün self-servis parola sıfırlama/e-posta doğrulama akışı yok** — yalnızca
   admin-driven `setPassword`/`createUser` (doğrudan parola atama) var. Bu, geçiş stratejilerinin
   kanal seçimini doğrudan etkiliyor (yeni açık soru Q-PW01).
3. **BOTC (PBKDF2-HMAC-SHA256, 100k iterasyon, global salt) ile Metnex (scrypt, per-user salt)
   formatları temelde uyumsuz** — birebir taşınamaz, önceki task'larda (`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`
   §2.2) verilen karar kod kanıtıyla ikinci kez teyit edildi.

### Teslimat

`docs/migration/BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md`:

- **§1** BOTC parola akışı — hash formatı, düz-metin fallback, global salt, otomatik yükseltme
  (dead-code `HashToBase64` bulgusu dahil).
- **§2** Metnex parola mekanizması — `scrypt`, per-user salt, admin-driven atama, self-servis
  akış eksikliği.
- **§3** Format uyumsuzluğu teyidi.
- **§4** 3 strateji karar matrisi (Zorunlu sıfırlama / İlk girişte kontrollü oluşturma / Geçici
  legacy doğrulama+yükseltme) — güvenlik/UX/operasyon/rollback açısından karşılaştırıldı, **hiçbiri
  seçilmedi**. Strateji 3'ün mimari karar dokümanının "auth zayıflıkları taşınmaz" ilkesiyle
  gerilim yarattığı **gözlem olarak** (karar değil) not edildi.
- **§5** Düz metin/eski hash/global salt/AES anahtarının **hiçbirinin taşınamayacağı** teyit edildi.
- **§6** Q-A03 ile 4 alt-boyut ilişkilendirildi (zorunlu sıfırlama, e-posta doğrulama, erişim
  blokajı, admin reset akışı).
- **§7** `authSessions`'a migration'da hiçbir satır yazılmayacağı, BOTC session snapshot modelinin
  taşınmadığı teyit edildi.
- **§8** Q-P01/Q-M04/Q-M06 çözülmeden implementation üretilmediği teyit edildi.

### Yeni açık soru (Q-PW01, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E/Q-T/Q-SC/Q-P serisi
**korunarak** 1 yeni soru eklendi: **Q-PW01** — geçici parola/reset bilgisi kullanıcıya hangi
kanaldan iletilecek (Strateji 1/2 seçilirse, e-posta altyapısı önkoşul mu). Özet tablosuna 1
satır eklendi, mevcut satırlar değiştirilmedi.

### Kapsam kriterleri karşılama

- BOTC ve Metnex parola formatları kaynak kodla karşılaştırıldı (§1, §2, §3).
- Üç geçiş stratejisi güvenlik/UX/operasyon/rollback açısından karşılaştırıldı (§4).
- Gerçek secret/parola/hash/salt/token yazılmadı — yalnızca algoritma adları ve iterasyon sayıları
  incelendi.
- Düz metin parola fallback'inin taşınmadığı §5'te açıkça korundu.
- Q-A03 ve ilgili authentication kararlarına §6'da bağlantı kuruldu.
- Session/token migration yapılmadı, `authSessions`'a hiçbir satır yazılmadı (§7).
- Wave 2/3 kapsam dışı korundu (§10).
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değiştirilmedi.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı üretmedi** — Q-A03 (3 strateji arasından seçim), Q-PW01
  (e-posta altyapısı önkoşulu) PO tarafından çözülmeden Wave 1 password migration implementasyonu
  başlatılamaz.
- Strateji 3'ün mimari karar dokümanıyla yarattığı gerilim görünür kılındı, çözülmedi.
- Q-P01/Q-M04/Q-M06 çözülmeden tam bir kullanıcı migration implementasyonu başlatılamaz.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. `authSessions`'a
  hiçbir satır yazılmadı. Git commit/push yapılmadı.

### Durum

`status: done` — AI1, legacy password/secret migration karar matrisini ve Q-PW01 açık sorusunu
inceleyip onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.8" bölümü).

# TASK-027.8: Legacy password secret migration decision

## Amaç

Password reset/hash ve secret migration kararlarını belgeleyin.

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
