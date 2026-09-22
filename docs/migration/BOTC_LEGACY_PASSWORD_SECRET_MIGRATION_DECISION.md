# BOTC Legacy Password/Secret — Metnex Geçiş Stratejisi Karar Matrisi

> **Durum: Discovery/karar-matrisi dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-8-legacy-password-secret-migration-decision.md` (EPIC-004,
> Wave 0, bağımlılık: TASK-027.7 — done). Bu belge `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`
> §2.2/§8/§9 ve `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §8'i **tamamlar, tekrar etmez** —
> o belgeler password/session konusunu özet düzeyde ele almıştı, bu belge **yalnızca** parola/secret
> geçiş stratejisine odaklanan bir karar matrisi üretir. **Hiçbir strateji burada implementation
> kararı olarak seçilmemiştir.**
>
> **TASK-027.12-R1 karar kapanışı (2026-09-17):** Q-A03 ve Q-PW01 kapandı — **Strateji 1 (Zorunlu
> Parola Sıfırlama) + admin-driven/manuel iletişim kanalı** onaylandı, Strateji 3 reddedildi. Tam
> karar/gerekçe için §4/§6'ya ve `BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki karar kapanışına bakınız.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

- **BOTC tarafı:** `BOT.Services/PasswordHasher.cs` (tam dosya, tüm 4 public metot) ve
  `BOT.Services/AuthService.cs`/`UserService.cs`'nin parola ile ilgili çağrı noktaları **yeniden**
  okundu — bu kez hangi metotların **fiilen çağrıldığı** ayrı bir `grep` ile doğrulandı (aşağıda
  kritik bulgu).
- **Metnex tarafı:** `apps/api/src/platform/crypto.ts` (hash algoritması), `auth.service.ts`
  (`verifyPassword` çağrısı), `user.service.ts` (`hashNewPassword`, `setPassword`,
  `validatePasswordStrength` — admin-driven parola atama akışı) **gerçek kod** olarak okundu.
  Ayrıca Metnex'in bugün **self-servis parola sıfırlama veya e-posta doğrulama akışı olup
  olmadığı** `grep -rln "resetPassword|forgotPassword|password-reset|PasswordReset"` ile tüm
  `apps/api/src` ve `apps/web/src` üzerinde arandı (bulgu: **yok**, bkz. §3.3).
- `apps/api/src/db/schema/platform.ts` — `authSessions` tablosu (refresh-token-hash tabanlı,
  BOTC'nin bellek-içi oturum modelinden farklı) yeniden referans alındı.

**Bu belgede hiçbir gerçek parola, hash, salt, token veya secret değeri okunmamış, raporlanmamış
veya kopyalanmamıştır** — yalnızca algoritma adları, iterasyon sayıları ve kod akışı (hangi
metodun ne zaman çağrıldığı) incelenmiştir. **Canlı PostgreSQL/SQL Server'a hiçbir değişiklik
yapılmamış, `authSessions` tablosuna hiçbir satır yazılmamıştır.**

---

## 1. BOTC Parola Akışı — Kaynak Kod Kanıtı

### 1.1 Hash Formatı

`PasswordHasher.cs` **4 public metot** içerir:

| Metot | Salt kaynağı | Algoritma | Fiilen çağrılıyor mu? |
|---|---|---|---|
| `HashToBase64(password, out saltBase64)` | **Rastgele, çağrı başına üretilen** 16 byte salt (`RandomNumberGenerator.GetBytes`) | PBKDF2-HMAC-SHA256, 100.000 iterasyon, 32 byte çıktı, Base64 | **Hayır — hiçbir yerde çağrılmıyor** (kod içi yorum: *"ileride kullanıcı-özel salt kolonu eklersen kullanırız"*) |
| `HashWithSaltBase64(password, saltBase64)` | **Dışarıdan verilen** salt — tüm çağrı noktalarında `_config["Auth:PasswordSalt"]` (tek, global config değeri) | Aynı (PBKDF2-HMAC-SHA256, 100k, 32 byte) | **Evet** — `AuthService.LoginAsync:66`, `UserService.CreateAsync:45,49`, `UserService.ResetPasswordAsync:100` |
| `VerifyFromBase64(password, hashBase64, saltBase64)` | Aynı global salt | Aynı, `CryptographicOperations.FixedTimeEquals` ile sabit-zamanlı karşılaştırma | **Evet** — `AuthService.LoginAsync:46` |
| `IsBase64String(s)` | — | Format kontrolü (hash mi düz metin mi ayrımı için) | Evet — `AuthService.LoginAsync:44` |

**Kritik bulgu:** BOTC geliştiricileri **kullanıcı-başına-salt** desenini kodlamış (`HashToBase64`)
ama **hiç kullanıma almamışlar** — üretimde hâlâ tek, global salt (`HashWithSaltBase64`)
kullanılıyor. Bu, geliştiricilerin zayıflığın **farkında olduğunu ama düzeltmediğini** gösteren
somut bir kod kanıtı (yorum satırı: *"ileride ... eklersen"*).

### 1.2 Düz Metin Parola Fallback'i

`AuthService.LoginAsync:41-54` (`BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2/§5'te zaten belgelenmişti,
burada yeniden teyit edilmiştir): önce hash olarak doğrulanır, tutmazsa **düz metin karşılaştırma**
(`string.Equals(u.PasswordHash, password, StringComparison.Ordinal)`) denenir. Bu, `PasswordHash`
sütununda **hem hash'lenmiş hem düz metin** değerlerin bir arada bulunabileceği anlamına gelir —
hangi kullanıcıların hangi durumda olduğu bu ortamdan **[DOĞRULANAMADI]**.

### 1.3 Otomatik Hash Yükseltme

Düz metin eşleşirse (`AuthService.LoginAsync:62-82`), sistem **otomatik olarak** yeni hash'i
üretip `BOT_APP.Users` ve (çapraz-DB, elle) `DOF_APP.Users`'a yazıyor. Bu, kullanıcı deneyimini
kesintiye uğratmadan güvenliği kademeli iyileştiren bir desendir, ama **global salt sorununu
çözmez** — yeni hash yine aynı global salt ile üretilir (`HashWithSaltBase64`, §1.1).

---

## 2. Metnex Parola Mekanizması — Gerçek Kod

| Konu | Metnex (`crypto.ts`, `auth.service.ts`, `user.service.ts`) |
|---|---|
| **Algoritma** | Node `crypto.scrypt`, 64 byte türetilmiş anahtar |
| **Salt** | **Kullanıcı başına rastgele** (`randomBytes(16)`), hash ile birlikte `"salt:hash"` formatında tek sütunda saklanıyor |
| **Karşılaştırma** | `timingSafeEqual` — sabit-zamanlı, BOTC'nin `FixedTimeEquals`'ıyla **aynı güvenlik ilkesi** |
| **Düz metin fallback** | **Yok** — `verifyPassword` yalnızca `"salt:hash"` formatını kabul eder, format uymazsa `false` döner (`crypto.ts:12-14`) |
| **Parola oluşturma/atama** | `user.service.ts`: `createUser` admin'den doğrudan `dto.password` alır (`validatePasswordStrength` ile güç kontrolü), `setPassword(id, password, requestingUserId)` — **admin-driven doğrudan atama**, e-posta linki değil |
| **Self-servis sıfırlama/e-posta doğrulama** | **Bulunamadı** — `grep -rln "resetPassword\|forgotPassword\|password-reset\|PasswordReset"` tüm `apps/api/src`/`apps/web/src` üzerinde **sıfır sonuç** verdi. Metnex bugün yalnızca **admin-driven** parola atama/değiştirme akışına sahip, self-servis "parolamı unuttum" e-posta akışı **henüz implementasyonda yok** — bu, §5'teki strateji seçeneklerini **doğrudan etkiler** (yeni bulgu, bkz. §7) |

---

## 3. Format Uyumsuzluğu — `PasswordHash` Birebir Taşınamaz (teyit)

| Boyut | BOTC | Metnex | Uyumluluk |
|---|---|---|---|
| Algoritma | PBKDF2-HMAC-SHA256 | scrypt | **Uyumsuz** — farklı türetme fonksiyonu |
| Salt şeması | Tek, global (config) | Kullanıcı başına rastgele | **Uyumsuz** — BOTC hash'i Metnex'in beklediği salt yapısını hiç içermiyor |
| Depolama formatı | Ayrı `PasswordHash` sütunu, salt config'te | `"salt:hash"` tek string, sütunda birlikte | **Uyumsuz** |
| Düz metin varlığı | Bazı kullanıcılarda muhtemel (§1.2, `[DOĞRULANAMADI]`) | Desteklenmiyor | **Taşınamaz** |

**Sonuç:** `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.2'deki "birebir taşınamaz, yeniden
hash'lenmeli" kararı burada **kod kanıtıyla ikinci kez teyit edilmiştir** — bu üç boyutun
**hiçbiri** basit bir dönüştürme fonksiyonuyla köprülenemez (algoritma matematiksel olarak
tersine çevrilemez, salt şeması yapısal olarak farklı).

---

## 4. Üç Geçiş Stratejisi — Karar Matrisi

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — Q-A03 + Q-PW01):** **Strateji 1 (Zorunlu Parola
> Sıfırlama) onaylandı** — BOTC `PasswordHash`/global salt **hiçbir koşulda taşınmayacak**, tüm
> migrate edilen kullanıcılar zorunlu parola sıfırlama/yeniden oluşturma akışına tabi olacak
> (`passwordStrategy = RESET_REQUIRED`). **Strateji 3 kesin olarak reddedildi** (eski doğrulama
> yolunun sisteme girmesi ilkeyle gerilir). **İletişim kanalı (Q-PW01):** Strateji 1'in §4.1'de
> belirttiği "(b) admin'in her kullanıcı için `setPassword` çağırması" seçeneği kullanılacak —
> Metnex'te self-servis e-posta reset akışı henüz olmadığından, ilk migration aşamasında
> kullanıcıya migration/parola-belirleme bilgisi **admin-driven/manuel** kanaldan duyurulacak.
> Self-servis e-posta reset akışı **ayrı bir implementation task'ı** olarak ele alınacak, bu
> R1'in kapsamında değildir. Strateji 2'nin "teşvik edilir, zorla değil" çerçevesi **seçilmemiştir**
> — sıfırlama **zorunludur** (Strateji 1'in sertliği korunur), yalnızca kullanıcıya ulaşım kanalı
> Strateji 2'nin admin-driven mekanizmasını kullanır.

### 4.1 Strateji 1 — Zorunlu Parola Sıfırlama ✅ (seçildi — kanıt kaydı olarak korunmuştur)

Migrate edilen her kullanıcı için `passwordHash` **hiç taşınmaz**; kullanıcı ilk girişte (veya
migration sonrası ilk erişim denemesinde) parola belirlemeye zorlanır.

| Boyut | Değerlendirme |
|---|---|
| **Güvenlik** | **En yüksek** — BOTC'nin zayıf/olası-düz-metin hash'lerinin hiçbiri sisteme girmez, sıfırdan güçlü parola politikası (`validatePasswordStrength`) uygulanır |
| **Kullanıcı deneyimi** | Kesintili — her kullanıcı migration sonrası **erişemez**, bir kanal üzerinden (e-posta, admin, vb.) yeni parola almalı |
| **Operasyon** | Metnex'te **self-servis e-posta akışı olmadığı için** (§2) bu strateji ya (a) yeni bir e-posta-tabanlı reset akışının **önce inşa edilmesini** ya da (b) admin'in her kullanıcı için `setPassword` çağırmasını (manuel, ölçeklenmez) gerektirir |
| **Rollback** | Kolay — hiçbir eski veri yazılmadığı için geri alma riski yok, yalnızca kullanıcı erişimi yeniden düzenlenir |

### 4.2 Strateji 2 — İlk Girişte Kontrollü Parola Oluşturma (kanalı kısmen kullanılıyor, kendisi seçilmedi)

Migration sırasında her kullanıcıya **admin tarafından** (veya otomatik, geçici) bir başlangıç
parolası `setPassword` ile atanır; kullanıcı ilk girişte bunu değiştirmeye **yönlendirilir** (zorla
değil, ama teşvik edilir) — Strateji 1'in "hiç erişemez" sertliğini yumuşatan bir ara yol.

| Boyut | Değerlendirme |
|---|---|
| **Güvenlik** | Yüksek — Strateji 1 ile aynı hash kalitesi, ama geçici parolanın **iletim kanalı** (nasıl kullanıcıya ulaştırılacağı) yeni bir risk yüzeyi oluşturur |
| **Kullanıcı deneyimi** | Strateji 1'den daha yumuşak — kullanıcı en azından bir yolla giriş yapabilir |
| **Operasyon** | Metnex'in var olan `setPassword(id, password, requestingUserId)` fonksiyonu **doğrudan kullanılabilir** — ek implementasyon gerektirmez (§2), yalnızca geçici parolaların **güvenli iletim** mekanizması (nasıl kullanıcıya bildirileceği) belirlenmeli |
| **Rollback** | Kolay, Strateji 1 ile aynı |

### 4.3 Strateji 3 — Geçici Legacy Doğrulama ve Güvenli Hash'e Yükseltme (reddedildi)

BOTC'nin kendi "giriş anında doğrula, tutarsa yükselt" desenine (§1.3) **benzer** bir geçiş
dönemi: eski `PasswordHash`+salt **geçici olarak** (bir dönüşüm katmanında, PBKDF2 doğrulama
mantığıyla) saklanır, kullanıcı ilk girişte eski parolasıyla doğrulanır, başarılıysa **anında**
Metnex'in `scrypt` formatına yükseltilir ve eski hash silinir.

| Boyut | Değerlendirme |
|---|---|
| **Güvenlik** | **En düşük** — bu, BOTC'nin eski PBKDF2+global-salt hash'lerinin **bir süreliğine de olsa** Metnex sistemine (doğrulama mantığıyla birlikte) taşınmasını gerektirir; mimari karar dokümanının "düz metin fallback'i taşınmaz" ilkesiyle **doğrudan gerilir** — düz metin olmasa da, **zayıf/eski bir doğrulama yolunun** sisteme girmesi aynı kategori risktir |
| **Kullanıcı deneyimi** | **En iyi** — kullanıcı hiçbir ek adım olmadan eski parolasıyla giriş yapabilir |
| **Operasyon** | Ek implementasyon gerektirir — Metnex'in `verifyPassword`'ünün yanına **geçici bir PBKDF2 doğrulama yolu** eklenmesi gerekir (yeni saldırı yüzeyi, geçiş penceresi kapatılmazsa kalıcı risk) |
| **Rollback** | **Zor** — geçiş penceresi açıkken bazı kullanıcılar zaten yükseltilmiş, bazıları hâlâ eski formatta olabilir; kısmi geri alma karmaşık |

**Bu belgenin değerlendirmesi (karar değil, gerekçeli gözlem):** Strateji 3, mimari karar
dokümanının §6'daki "BOTC'nin auth zayıflıkları taşınmaz" ilkesiyle **en fazla gerilim yaratan**
seçenektir çünkü geçici de olsa eski doğrulama mantığının sisteme girmesini gerektirir. Bu
gözlem bir **karar değildir** — nihai seçim PO'ya aittir (Q-A03).

---

## 5. Düz Metin / Eski Hash / Global Salt — Taşınabilirlik Değerlendirmesi

| Öğe | Taşınabilir mi? | Gerekçe |
|---|---|---|
| Düz metin parolalar | **Hayır, kesinlikle** | Mimari karar dokümanı §6, hiçbir koşulda istisna yok |
| Eski PBKDF2 hash'leri (salt olmadan) | **Hayır** | Metnex `verifyPassword` formatı (`"salt:hash"`) tanımıyor, anlamsız veri olur |
| Global `Auth:PasswordSalt` değeri | **Hayır** | Metnex'in per-user-salt modeliyle **kavramsal olarak uyumsuz** — global bir salt'ı taşımanın hiçbir faydası yok, yalnızca gereksiz secret taşıma riski yaratır |
| `ConfigProtector`'ın gömülü AES anahtarı | **Hayır** | Mimari karar dokümanı §6, `BOTC_ENTITY_DOMAIN_MAPPING.md` §5 — zaten "taşınmaz" |

**Bu belge, mimari kararın "düz metin parola fallback'i taşınmaz" ilkesini hiçbir istisna
önermeden korumuştur** (kabul kriteri #4).

---

## 6. Q-A03 İlişkilendirmesi — Karar Kapandı

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17).**

Q-A03 ("zorunlu parola sıfırlama akışı onaylı mı?") bu belgenin §4'teki 3 stratejisiyle doğrudan
örtüşüyor. Görev talimatının istediği 4 alt-boyut ve **nihai karar**:

| Alt-boyut | İlişki / Karar |
|---|---|
| İlk girişte zorunlu parola sıfırlama | **Onaylandı** — Strateji 1 ile birebir aynı konu, `passwordStrategy = RESET_REQUIRED` |
| E-posta doğrulama | Metnex'te bugün yok (§2) — **Q-PW01 kapandı:** geçici parola/reset bilgisi **admin-driven/manuel** kanaldan iletilecek, self-servis e-posta akışı ayrı bir implementation task'ı |
| Kullanıcı erişimini bloke etme | **Onaylandı** — kullanıcı parola belirlemeden giremez (Strateji 1'in doğal sonucu) |
| Destek/admin reset akışı | Metnex'in var olan `setPassword` fonksiyonu (§2) **kullanılacak** — ek implementasyon gerekmiyor, operasyonel süreç (hangi admin, hangi kanaldan) implementation aşamasında netleştirilecek |

Q-A03 ve Q-PW01 **kapanmıştır** — nihai karar: zorunlu sıfırlama (Strateji 1) + admin-driven
manuel iletişim kanalı (Strateji 2'nin kanal mekanizması, Strateji 1'in zorunluluğuyla).

---

## 7. Session/Token — Migration'da Hiçbir Satır Yazılmaz (teyit)

Görev talimatı gereği açıkça teyit edilir: bu belge `authSessions` tablosuna **hiçbir migration
zamanlı satır yazılmasını önermemiştir**. BOTC'nin bellek-içi `SessionService` modeli (login-anı
permission snapshot) Metnex'e **taşınmaz** (`BOTC_ENTITY_DOMAIN_MAPPING.md` §5, Q-E01,
`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §8 ile tutarlı — burada tekrar edilmemiştir).
`authSessions`, yalnızca gerçek kullanıcı login'i olduğunda (migration sonrası, kullanıcının
kendi eylemiyle) satır alır — migration script'inin sorumluluğunda **değildir**.

---

## 8. Q-P01/Q-M04/Q-M06 Bağımlılığı — Implementation Üretilmedi (teyit)

Görev talimatı gereği: bu belge kullanıcı/rol migration implementasyonu **üretmemiştir**.
`BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md`'de zaten açık bırakılan Q-P01 (rol modeli),
Q-M04 (rol-şablonu/birebir atama) ve Q-M06 (tenant ataması) bu belgede **yeniden çözülmemiştir**
— parola/secret stratejisi bu üç sorudan **bağımsız olarak** değerlendirilebilir (bir kullanıcının
parolasının nasıl taşınacağı, hangi role/tenant'a atanacağından **ayrı bir karardır**), ama nihai
migration implementasyonu her ikisinin de çözülmesini gerektirir.

---

## 9. Yeni Açık Soru

Mevcut **Q-A03** bu task'ta **kapatılmamış**, aksine 3 somut stratejiyle (§4) **detaylandırılmıştır**.
Bunun ötesinde `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye **1 yeni soru** append edildi:

- **Q-PW01** — Metnex'in bugün self-servis e-posta tabanlı parola sıfırlama/doğrulama akışı
  **yoktur** (§2, kod taramasıyla doğrulandı). Strateji 1/2 (§4.1/4.2) seçilirse, geçici
  parola/reset bilgisi kullanıcıya **hangi kanaldan** (e-posta akışı önce inşa edilerek, yoksa
  yalnızca admin sözlü/manuel iletimiyle) ulaştırılacak — bu, Wave 1 migration'ının bir
  **e-posta altyapısı implementasyonunu önkoşul olarak gerektirip gerektirmediğini** belirler.

Özet tablosuna 1 yeni satır eklendi.

---

## 10. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu belge yalnızca `User.PasswordHash`/session/secret konusunu ele almıştır; Ticket/
MaintenanceRecord/FaultRecord (Wave 2) ve DÖF (Wave 3) için **hiçbir mapping veya implementation
önerisi üretilmemiştir** (D-007 ile tutarlı).

---

## 11. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 12. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı üretmemiştir** — Q-A03 (3 strateji arasından seçim),
  Q-PW01 (e-posta altyapısı önkoşulu) PO tarafından çözülmeden Wave 1 password migration
  implementasyonu başlatılamaz.
- Strateji 3'ün (§4.3) mimari karar dokümanının "auth zayıflıkları taşınmaz" ilkesiyle gerilim
  yarattığı **görünür kılınmıştır** — PO bu stratejiyi seçerse, bu gerilimin nasıl çözüleceği
  (örn. geçiş penceresinin süresi, ek güvenlik kontrolleri) ayrıca ele alınmalıdır.
- Q-P01/Q-M04/Q-M06 çözülmeden, parola stratejisi kararlaştırılsa bile **tam bir kullanıcı
  migration implementasyonu** başlatılamaz (§8).
- Gerçek secret/parola/hash/salt/token/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. `authSessions`
  tablosuna hiçbir satır yazılmadı. Git commit/push yapılmadı.

---

## 13. TASK-027.16 Doğrulama Notu (2026-09-18) — Password Reset Import ve Admin Assignment Sınırı

TASK-027.16 (Password Reset Import and Admin Assignment Boundary), Strateji 1'in (§4.1, zorunlu
sıfırlama) implementation motorundaki (`apps/api/src/migration/botc-identity/`) somutlaşmasını
**kararı değiştirmeden** doğruladı ve genişletti:

- `passwordStrategy` sözleşmesi (`RESET_REQUIRED` zorunlu taban, `ADMIN_ASSIGNED` yalnızca ek
  bayrak) 135 testle doğrulandı; `password-boundary.ts` (`validatePasswordStrategyInvariant`) bu
  değişmezi programatik olarak kontrol edilebilir hâle getirdi.
- **Gerçek bulgu (implementation seviyesinde düzeltilen bir tutarsızlık):** `MigrationRunService`,
  bir kullanıcının kaydı güncellendiğinde (checksum değişikliği) `ADMIN_ASSIGNED` bayrağını,
  çağıranın o çalıştırmada `adminAssignedPasswordLegacyIds` kümesine o kullanıcıyı yeniden dahil
  etmemesi durumunda **sessizce kaybedebiliyordu**. Bu, "admin ataması kullanıcıyı reset
  zorunluluğundan çıkarmamalı" ilkesini ihlal etmiyordu (RESET_REQUIRED her zaman korunuyordu) ama
  "admin assignment durumu yanlışlıkla silinmemeli" gereksinimini ihlal ediyordu — düzeltildi:
  `ADMIN_ASSIGNED` artık, bir kez kaydedildikten sonra, sonraki çalıştırmalarda yeniden
  belirtilmese bile korunur (targetId'nin güncellemeler arasında korunma ilkesiyle aynı desen).
- Secret redaction: gerçek `DryRunReport`/audit metadata/staging record çıktıları üzerinde
  programatik bir credential-scanner (`scanForCredentialFields`) çalıştırılarak **hiçbir**
  password/hash/salt/token/secret alanı bulunmadığı kanıtlandı (yalnızca `passwordStrategy(ies)`
  durum etiketleri, ki bunlar credential değildir).
- `authSessions`/session/cookie/JWT'ye hiçbir referans olmadığı statik dosya taramasıyla yeniden
  doğrulandı.

Bu task **Q-A03/Q-PW01'i yeniden karara bağlamadı** — yalnızca zaten seçilmiş Strateji 1'in
implementation'daki doğruluğunu test etti ve bir implementation-seviyesi tutarsızlığı düzeltti.
