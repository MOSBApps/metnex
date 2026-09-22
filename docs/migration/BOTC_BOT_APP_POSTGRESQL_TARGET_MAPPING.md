# BOTC `BOT_APP` → Metnex PostgreSQL Target Mapping

> **Durum: Discovery/mapping dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-6-bot-app-postgresql-target-mapping.md` (EPIC-004, Wave 0,
> bağımlılık: TASK-027.3 — done). Bu belge `BOTC_SOURCE_SCHEMA_INVENTORY.md` (kolon/PK/FK
> kanıtı), `BOTC_ENTITY_DOMAIN_MAPPING.md` (servis-davranışı), `BOTC_MIP_TENANT_LOCATION_MAPPING.md`
> (tenant ilkeleri) ve `BOTC_TO_METNEX_MAPPING.md` §2.1/§2.2'yi (özet düzey permission önerisi)
> **tamamlar, tekrar etmez**. Bu belgenin odağı: `User`/`Role`/`Permission`/`UserPermission`/
> `VisibilitySettings`'in **Metnex'in gerçek PostgreSQL şemasındaki** (Drizzle tablo tanımları)
> somut hedef karşılıklarıyla alan-alan eşlenmesi.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

- **BOTC tarafı:** `BOTC_SOURCE_SCHEMA_INVENTORY.md` §2.1–2.5 (`User`/`Role`/`Permission`/
  `UserPermission`/`VisibilitySettings`'in tam kolon/PK/FK listesi, `[KOD]`/`[MIGRATION]`/
  `[DOĞRULANAMADI]` etiketleriyle) ve `BOTC_ENTITY_DOMAIN_MAPPING.md` §1 (servis davranışı) kaynak
  olarak kullanıldı — bu iki belgedeki bilgiler **yeniden üretilmedi**, doğrudan referans verildi.
- **Metnex tarafı:** `apps/api/src/db/schema/{platform.ts,enums.ts}` **gerçek Drizzle tablo
  tanımları** olarak satır satır okundu (`users`, `tenants`, `tenantMemberships`, `tenantRoles`,
  `tenantRolePermissions`, `userTenantRoleAssignments`, `systemRoles`, `permissions`,
  `rolePermissions`, `userSystemRoleAssignments`, `authSessions`, `userMfaSettings`,
  `tenantSecuritySettings`). `apps/api/src/platform/crypto.ts` (parola hash **algoritması**,
  `scrypt` + per-user random salt — **değer değil, yalnızca algoritma/format** okundu),
  `apps/api/src/platform/role.service.ts` (`tenantRolePermissions.permissionCode`'un `permissions`
  tablosuna karşı runtime doğrulaması), `apps/api/src/platform/permission-catalogue.ts`
  (`ASSIGNABLE_CATALOGUE`, gerçek `MODULE:RESOURCE:ACTION` formatı) ve `apps/api/src/db/id.ts`
  (`generateId` — `randomUUID()`, native PG `UUID` tipi değil, `text` sütunda saklanan UUID
  string'i) okundu. **Hiçbir mekanizma varsayılmadı.**

**Gerçek parola, hash, salt, secret veya connection string bu belgeye yazılmamıştır** — yalnızca
algoritma adları (`scrypt`) ve kolon/format yapıları (örn. `"salt:hash"` string deseni) incelenmiş,
hiçbir gerçek değer kopyalanmamıştır. **Canlı PostgreSQL veya SQL Server'a hiçbir değişiklik
yapılmamıştır, hiçbir veri satırı bu dokümana kopyalanmamıştır.**

---

## 1. Metnex PostgreSQL Hedef Şeması — Gerçek Kod Özeti

| Tablo (`apps/api/src/db/schema/platform.ts`) | Amaç |
|---|---|
| `users` | `id` (text, app-side `randomUUID()`), `email`, `passwordHash`, `displayName`, `isSystemAdmin`, `status` (`ACTIVE`/`INACTIVE`/`LOCKED`) — tek, tenant'tan bağımsız kullanıcı kaydı |
| `tenants` / `tenantMemberships` | Tenant hiyerarşisi (bkz. `BOTC_MIP_TENANT_LOCATION_MAPPING.md`) ve kullanıcı-tenant üyeliği (`isActive`) |
| `tenantRoles` / `tenantRolePermissions` / `userTenantRoleAssignments` | **Tenant-kapsamlı** roller — her `tenantRoles` satırı bir tenant'a ait (`tenantId` FK), izinleri `tenantRolePermissions.permissionCode` (serbest `text`, FK değil ama `role.service.ts`'de `permissions.code`'a karşı **runtime'da doğrulanıyor**) üzerinden tutuluyor; `userTenantRoleAssignments` bir kullanıcıyı belirli bir tenant'taki role'e bağlar (composite FK: rol tenant'a ait olmalı) |
| `systemRoles` / `permissions` / `rolePermissions` / `userSystemRoleAssignments` | **Platform/global roller** (`SYSTEM_ADMIN` gibi, SRS ROLE-001) — `permissions` gerçek bir katalog tablosu, `rolePermissions` gerçek FK ile bağlı; `userSystemRoleAssignments.tenantId` **opsiyonel** (global veya tenant-scoped sistem rolü olabilir) |
| `authSessions` | `refreshTokenHash` (JWT refresh token'ın hash'i, düz token değil), `expiresAt`, `isRevoked` — **stateless/request-scoped** oturum modeli, BOTC'nin bellek-içi `SessionService`'inin **doğrudan karşılığı değildir** (`BOTC_ENTITY_DOMAIN_MAPPING.md` §5, Q-E01 ile aynı konu) |
| `userMfaSettings` / `userMfaRecoveryCodes` | TOTP tabanlı MFA — BOTC'de **hiç karşılığı yok** |
| `tenantSecuritySettings` | Tenant bazlı `mfaRequired` bayrağı — BOTC'de karşılığı yok |

**Kritik yapısal gözlem:** Metnex'in **iki ayrı rol modeli** vardır — tenant-kapsamlı `tenantRoles`
ve platform-kapsamlı `systemRoles`. BOTC'nin **tek, düz `Role` tablosu** (tenant kavramı olmayan)
bu ikisinden **hangisine** eşleneceği önceden karar verilmemiş bir yapısal sorudur (bkz. §4, yeni
açık soru **Q-P01**).

---

## 2. `User` Alan Sınıflandırması

Kaynak: `BOTC_SOURCE_SCHEMA_INVENTORY.md` §2.1 (tam kolon listesi). Metnex hedefi: `users` tablosu
(`apps/api/src/db/schema/platform.ts:73-89`).

### 2.1 Taşınacak Kimlik Alanları

| BOTC alanı | Metnex hedefi | Not |
|---|---|---|
| `Username` | `users.email` (adaylık) | `[DOĞRULANAMADI]` — BOTC `Username`'in her zaman e-posta formatında olduğu doğrulanmadı; Metnex `email` `NOT NULL UNIQUE` gerektiriyor, BOTC `Username`'in bu kısıtı karşılayıp karşılamadığı canlı veri olmadan bilinemez |
| `FullName` | `users.displayName` | Doğrudan eşlenir, dönüşüm gerekmez |
| `IsActive` | `users.status` (`ACTIVE`/`INACTIVE`/`LOCKED`) | Boolean→enum dönüşümü: `IsActive=true`→`ACTIVE`, `IsActive=false`→`INACTIVE` (varsayılan eşleme, `LOCKED` durumunun BOTC'de karşılığı yok) |
| `Email` | (ayrıca) `users.email`'in kendisi olabilir, ya da BOTC `Username`≠`Email` ise ayrı bir alan gerekebilir | `[DOĞRULANAMADI]` — BOTC'de `Username` ve `Email` **ayrı** alanlar (`User.cs:12,17`); Metnex `users` tablosunda tek bir `email` alanı var, hangisinin bu alana taşınacağı netleşmedi |
| `CreatedDate` | `users.createdAt` | Doğrudan eşlenir |
| `IsEmailVerified` | Metnex `users` şemasında **doğrudan karşılığı yok** | Karar bekliyor — bilgi amaçlı taşınabilir (yeni kolon gerektirir) ya da bırakılabilir |

### 2.2 Yeniden Üretilecek / Yeniden Hash'lenecek Alanlar

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — Q-A03/Q-PW01):** `PasswordHash` **hiçbir
> koşulda taşınmayacak**. Tüm migrate edilen kullanıcılar zorunlu parola sıfırlama akışına
> (`passwordStrategy = RESET_REQUIRED`, bkz. `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`
> §10) tabi olacak. Self-servis e-posta reset akışı henüz olmadığından, ilk migration aşamasında
> bu duyuru **admin-driven/manuel kanaldan** yapılacak — ayrıntı için
> `BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md`'deki karar kapanışına bakınız.

| BOTC alanı | Durum | Gerekçe |
|---|---|---|
| `PasswordHash` | **Birebir taşınamaz, yeniden hash'lenmeli** | BOTC: hash **veya düz metin** (`AuthService.LoginAsync:44-54`, `[DOĞRULANAMADI]` hangi kullanıcıların hâlâ düz metin olduğu), global `Auth:PasswordSalt` config değeri. Metnex: `crypto.ts` — `scrypt` + **kullanıcı başına rastgele salt** (`"salt:hash"` formatı, `randomBytes(16)`). İki format **temelde uyumsuz**; BOTC hash'i Metnex formatına **çeviremez** (farklı algoritma + farklı salt şeması). Zaten `BOTC_ENTITY_DOMAIN_MAPPING.md` §5'te "düz-metin parola fallback taşınmaz" olarak işaretliydi, burada **hash formatı uyumsuzluğu da** somut kanıtla teyit edildi |
| `VerificationCode` | Yeniden üretilecek (varsa) | Metnex `users` şemasında karşılığı yok; e-posta doğrulama akışı Metnex'in kendi mekanizmasıyla (varsa) yeniden başlatılmalı |

### 2.3 Wave 2/3'e Özel, Taşınmayacak Alanlar

| BOTC alanı | Neden taşınmaz |
|---|---|
| `IsMaintenanceMember`, `IsElectricMember`, `IsMechanicMember` | Yalnızca `TicketService`/Wave 2 tarafından tüketiliyor (`BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2) |
| `CanBeDofResponsible` | Yalnızca DÖF/Wave 3'e özel |

### 2.4 Karar Bekleyen Alanlar

> **KISMİ KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — Q-M06):** `Sirket`'in tenant ataması için
> **kullanılmayacağı** artık kesindir — tenant ataması **ayrı, onaylı bir mapping tablosu**
> üzerinden yapılacak (bilinen tenant'lar: MOSB, MOSEDAŞ, MOSBİO). `Sirket`'in bilgi amaçlı bir
> not olarak taşınıp taşınmayacağı (saklama kararı) hâlâ **implementation detayıdır**, ama
> **tenant kaynağı olarak** rolü kapanmıştır. `Username`/`Email` ayrımı ve `IsEmailVerified` bu
> R1'in kapsamındaki 6 sorudan hiçbirine dahil değildir — **değiştirilmeden açık kalmıştır**.

| BOTC alanı | Belirsizlik |
|---|---|
| `Sirket` | **Tenant kaynağı olarak kapandı (Q-M06 — kullanılmayacak)** — yalnızca bilgi amaçlı serbest metin notu olarak taşınıp taşınmayacağı implementation kararı olarak açık |
| `Username` vs `Email` ayrımı | **Açık** — §2.1'de belirtildi, bu R1'in kapsamında değil |
| `IsEmailVerified` | **Açık** — §2.1'de belirtildi, bu R1'in kapsamında değil |

**Kabul kriteri #1 karşılandı:** Her `User` alanı yukarıdaki 4 kategoriden birine atanmıştır,
hiçbiri kategorisiz bırakılmamıştır.

---

## 3. `Role` / `Permission` Eşlemesi — Karar Kapandı

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — Q-P01/Q-M03):** BOTC `Role` → Metnex
> `tenantRoles` (tüm roller, `Admin` dahil). `systemRoles` yalnızca platform yönetimi/Metnex'e
> özgü platform rolleri için kullanılacak, BOTC kaynaklı hiçbir rol `systemRoles`'a taşınmayacak.
> BOTC `Permission` → mevcut `BOTC_TO_METNEX_MAPPING.md` §2.2'deki taslak `MODULE:RESOURCE:ACTION`
> eşlemesi **kesin** olarak kullanılacak, `permission-catalogue.ts` formatıyla uyumlu tutulacak.
> Tam gerekçe/kaynak için `BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki karar kapanışına bakınız.

### 3.1 BOTC'nin Düz Model vs. Metnex'in İkili Rol Modeli (kanıt kaydı olarak korunmuştur)

BOTC'nin `Role` (`Id`, `Name`, `Description`) ve `Permission` (`Id`, `PermissionName`,
`Description`) tabloları **tenant kavramı olmayan, tek düz bir model**. Metnex'te iki ayrı hedef
var (§1):

| Metnex hedefi | Uygunluk | Gerekçe |
|---|---|---|
| `tenantRoles` + `tenantRolePermissions` | **✅ Seçildi** | BOTC rolleri tenant-içi (işletme-bazlı) kavramlar olsaydı uygun olurdu, ama BOTC'de tenant kavramı **yok** — her rol tüm sistem için tanımlı |
| `systemRoles` + `rolePermissions` | Elenen | BOTC'nin `Admin` rolü (`AuthService.LoginAsync:93-100`, hardcoded, tüm izinlere otomatik sahip) kavramsal olarak SRS ROLE-001 `SYSTEM_ADMIN`'e benziyor, ama BOTC'nin **diğer** rolleri (Admin olmayanlar) tenant-scope'suz bir platform rolü olarak modellenmesi **Discovery'nin tenant izolasyon ilkesiyle** (§2.3) gerilir |

**Sonuç — karar kapandı (Q-P01, TASK-027.12-R1):** BOTC `Role`/`Permission`, tüm roller `Admin`
dahil olmak üzere `tenantRoles`'a eşlenecektir; `systemRoles` yalnızca platform yönetimi için
ayrılmıştır.

### 3.2 Gerçek Permission Catalogue Formatıyla Karşılaştırma

`apps/api/src/platform/permission-catalogue.ts`'deki `ASSIGNABLE_CATALOGUE`, gerçek
`MODULE:RESOURCE:ACTION` formatını gösteriyor (örn. `SETTINGS:GENERAL:VIEW`,
`REPORT:ARTIFACT:VIEW`). BOTC'nin 16 `Can*` iznini (`BOTC_TO_METNEX_MAPPING.md` §2.2'de zaten
önerilmiş taslak eşleme) bu formata dönüştürme işi **Q-M03**'ün kapsamındadır — bu belge o
eşlemeyi **tekrar üretmez**, yalnızca hedef tablo yapısının (`permissions.code` `TEXT UNIQUE`,
`role.service.ts`'de runtime doğrulama) taslak eşlemeyle **uyumlu** olduğunu teyit eder: hedef
`code` sütunu serbest `TEXT` olduğu için `MODULE:RESOURCE:ACTION` formatındaki herhangi bir string
teknik olarak sorunsuz saklanabilir — engel yapısal değil, **isimlendirme kararı** (Q-M03).

---

## 4. `UserPermission` — Karar Kapandı (Q-M04)

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17):** Seçenek B (aşağıda) onaylandı — kullanıcı
> başına özel rol **oluşturulmayacak**; BOTC'deki izin kombinasyonları gruplanarak **ortak
> tenant-kapsamlı rol şablonlarına** dönüştürülecek. Tam gerekçe için
> `BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki karar kapanışına bakınız.

BOTC `UserPermission` ara tablosu (`UserId`, `PermissionId`, unique çift) kullanıcıya izinleri
**tek tek elle** atıyor (`UserService.SetUserPermissionsAsync` — `BOTC_ENTITY_DOMAIN_MAPPING.md`
§1.2), rol-bazlı varsayılan şablon **yok**. Metnex'in hedef modeli ise **rol üzerinden** izin
tutuyor (`tenantRolePermissions`/`rolePermissions` — kullanıcıya değil, **role** bağlı izin
listesi; kullanıcı `userTenantRoleAssignments`/`userSystemRoleAssignments` ile role atanıyor).

İki seçenek karşılaştırılmıştı (kanıt kaydı olarak korunmuştur):

| Seçenek | Açıklama | Sonuç |
|---|---|---|
| A | Her BOTC kullanıcısının benzersiz izin kombinasyonu için **kendine özel bir rol** oluşturulur (1 kullanıcı = 1 rol, `UserPermission` satırları o role'ün `tenantRolePermissions`/`rolePermissions` satırlarına dönüşür) | Elenen |
| B | BOTC'deki izin kombinasyonları **gruplanarak** ortak rol şablonlarına (`Admin`, `Operatör`, vb.) indirgenir, kullanıcılar bu şablonlara atanır | **✅ Seçildi** |

Her iki seçenek de yapısal olarak Metnex şemasıyla **uyumluydu** (`userTenantRoleAssignments`
bir kullanıcının **birden fazla** role atanmasına izin veriyor — `uniqueIndex` yalnızca aynı
(kullanıcı, rol, tenant) ikilisinin tekrarını engelliyor); Seçenek B, Metnex'in rol-bazlı
yetkilendirme modeliyle tutarlılığı nedeniyle **onaylanmıştır** (Q-M04, TASK-027.12-R1).

---

## 5. Legacy ID / UUID Mapping İhtiyacı (yalnızca belgeleme, implementation yok)

| Konu | BOTC | Metnex | İhtiyaç |
|---|---|---|---|
| `User.Id`, `Role.Id`, `Permission.Id`, `UserPermission.Id` | `int` identity | `users.id`/`tenantRoles.id`/`permissions.id` vb. — `text` sütun, uygulama tarafında `randomUUID()` (native PG `UUID` tipi **değil**, ama fonksiyonel olarak UUID string'i) | Her migrate edilen kayıt için **`legacy_id (int) → id (text/UUID)`** eşleme tablosu gerekir — FK'ların (`User.RoleId`, `UserPermission.UserId`/`PermissionId`) migration sırasında bu eşleme üzerinden çözülmesi gerekir (`BOTC_TO_METNEX_MAPPING.md` §4 ile aynı ilke, burada somut hedef kolonlarla teyit edildi) |

**Bu belge yalnızca ihtiyacı belgeler** — eşleme tablosunun şeması, saklama yeri veya
migration script'i bu task'ta **üretilmemiştir** (görev talimatı: "implementation yapma").

---

## 6. Tenant Ataması — Karar Kapandı (Q-M06)

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17):** `Sirket` tenant kaynağı olarak **kesin olarak
> kullanılmayacak**. Tenant ataması, **ayrı, onaylı bir mapping tablosu** üzerinden yapılacak.
> Bilinen işletme tenant'ları: **MOSB, MOSEDAŞ, MOSBİO**. `KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/
> `SANTRAL` gibi belirsiz lokasyonlar (bkz. Q-T01, `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §3) bu
> mapping tablosunda **ayrıca karar bekleyen kayıt olarak** tutulacak — bu R1, tenant atama
> **mekanizmasını** ve 3 ana işletme tenant'ını onaylamıştır, her spesifik lokasyonun nihai
> ataması **tam olarak kapanmamıştır** (Q-T01/Q-SC01 hâlâ açık).

`BOTC_MIP_TENANT_LOCATION_MAPPING.md` §2'nin bulgusu burada **aynen korunmuştur**: `Sirket`
alanı hiçbir sorgu/yetkilendirme kararında kullanılmadığı için (serbest metin, `nullable`) migrate
edilen bir `User`'ın hangi Metnex tenant'ına (`tenantMemberships` satırı) atanacağına **tek başına
karar veremez**. Bu bulgu artık yalnızca bir gözlem değil, **resmi karardır** (Q-M06 kapandı) —
tenant ataması, `Sirket` yerine yukarıdaki onaylı mapping tablosu üzerinden çözülecektir. Q-T01
ile ilgili belirsiz lokasyonların nihai ataması **ayrı bir implementation adımı** gerektirir.

---

## 7. `VisibilitySettings` — Taşınma Kararı Bekliyor

| Konu | BOTC | Metnex hedef mimarisi |
|---|---|---|
| Mekanizma | `DataSourceName`+`TableName` bazlı **UI-toggle** (admin ekranından açma/kapama), backend'de zorlayıcı değil — yalnızca `QueryService.GetTablesAsync`'te listeden filtreleme (`BOTC_ENTITY_DOMAIN_MAPPING.md` §3, §5) | **Admin-küratörlü sabit allowlist** (SEC-DATA-002, mimari karar dokümanı §4) — backend'de **zorunlu** bir kontrol, UI-toggle değil |
| Veri modeli | `VisibilitySettings` tablosu (`DataSourceName`, `TableName`, `IsVisible`) | Metnex'in mevcut PostgreSQL şemasında (`platform.ts`) SCADA/DMS allowlist'e karşılık gelen bir tablo **henüz yok** (Wave 5 implementation'ı gerektirir) |

**Karar bekliyor (yeni açık soru Q-P02):** Önceki task'larda (`BOTC_TO_METNEX_MAPPING.md` §2.5,
`BOTC_ENTITY_DOMAIN_MAPPING.md` §5) `VisibilitySettings`'in **doğrudan taşınmayacağı**
(allowlist'in yerini alacağı) belirtilmişti. Bu task, görev talimatı gereği bu kararı **yeniden
açık olarak işaretler**: `VisibilitySettings`'teki **mevcut veri** (hangi kaynak/tablo gizlenmiş)
migration sırasında admin'e **bir kerelik referans bilgisi** olarak mı sunulacak (yeni allowlist'i
elle kurarken yardımcı olması için), yoksa tamamen **atlanacak mı** — bu, verinin kendisinin
taşınıp taşınmayacağından **ayrı bir karar** olduğu için netleştirilmemiştir.

---

## 8. Audit, Tenant Scope, Permission, Password, Session Etkileri

| Konu | BOTC | Metnex hedefi | Etki |
|---|---|---|---|
| **Audit** | `User.CreatedDate` dışında audit yok, `DeleteAsync` gerçek `DELETE` (`BOTC_ENTITY_DOMAIN_MAPPING.md` §1.3) | `apps/api/src/audit` modülü mevcut | Wave 1 migration'ı kullanıcı/rol/permission değişikliklerini Metnex'in var olan audit modülüne kaydetmeli — BOTC'nin audit'siz modeli miras alınmamalı |
| **Tenant scope** | Yok (`Sirket` güvenilmez, §6) | `tenantMemberships` + `TenantScopeService.resolve()` | Migrate edilen her `User` için en az bir `tenantMemberships` satırı **oluşturulmalı** — kaynağı Q-M06/TASK-027.4'e bağlı, implementasyon bu task'ta değil |
| **Permission** | Kullanıcı-bazlı elle atama, `UserAuthorizationService` DB'ye gitmeden bellek-içi kontrol (`BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2, Q-E01) | Rol-bazlı (`tenantRolePermissions`/`rolePermissions`), `permission.guard.ts` request-scoped kontrol | BOTC'nin modeli Metnex'e **birebir taşınamaz** — hem model (kullanıcı-bazlı→rol-bazlı) hem kontrol zamanlaması (login-anı-snapshot→her-istek) değişir |
| **Password** | Hash veya düz metin, global salt, otomatik yükseltme (`AuthService.LoginAsync`) | `scrypt` + kullanıcı-bazlı salt (`crypto.ts`) | §2.2'de detaylandırıldı — **yeniden hash'lenmeli**, birebir taşınamaz |
| **Session** | Bellek-içi (`SessionService`, tek masaüstü oturumu) | `authSessions` (refresh token hash, `expiresAt`, `isRevoked` — stateless HTTP API modeli) | BOTC'nin oturum modeli **taşınmaz** (Q-E01 ile aynı konu) — Metnex'in var olan JWT/refresh-token modeli kullanılacak, migration bu modele **yeni kayıt eklemez** (oturumlar login-time'da oluşur, migration-time'da değil) |

---

## 9. BOTC Güvenlik Zayıflıklarının Taşınmadığının Teyidi

Görev talimatı gereği açıkça teyit edilir: **düz metin parola fallback'i, global `Auth:PasswordSalt`
yaklaşımı ve `ConfigProtector`'ın gömülü AES anahtarı bu belgede Metnex'e taşınacak bir davranış
olarak önerilmemiştir** — bunlar `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` §6 ve
`BOTC_ENTITY_DOMAIN_MAPPING.md` §5'te zaten "taşınmaz" olarak işaretliydi; bu belge yalnızca
Metnex'in **gerçek** `scrypt` + per-user-salt mekanizmasının bu üç BOTC davranışının **hiçbirini**
içermediğini kod kanıtıyla (§2.2, `crypto.ts`) teyit etmiştir.

---

## 10. Wave 2/Wave 3 Kapsam Dışı Teyidi

`IsMaintenanceMember`/`IsElectricMember`/`IsMechanicMember`/`CanBeDofResponsible` alanları dışında
(§2.3, yalnızca "taşınmaz" olarak sınıflandırıldılar) bu belge Ticket/MaintenanceRecord/
FaultRecord (Wave 2) veya DÖF (Wave 3) için **hiçbir mapping veya implementation önerisi
üretmemiştir** (D-007 ile tutarlı).

---

## 11. Yeni Açık Sorular

Mevcut **Q-M03** (permission adı eşlemesi), **Q-M04** (rol-şablonu vs. birebir atama), **Q-M06**
(tenant ataması), **Q-A03** (zorunlu parola sıfırlama) bu task'ta **kapatılmamış**, aksine somut
hedef şema kanıtlarıyla (§3, §4, §6) **ilişkilendirilmiştir**. Bunların ötesinde
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye **3 yeni soru** (Q-P serisi) **append**
edildi:

- **Q-P01** — BOTC `Role`/`Permission` Metnex'in `tenantRoles` (tenant-kapsamlı) mı, `systemRoles`
  (platform-kapsamlı) mı, yoksa ikisinin bir karışımı mı olarak migrate edilecek?
- **Q-P02** — `VisibilitySettings`'teki mevcut veri (hangi SCADA kaynağı/tablo gizli) migration
  sırasında admin'e referans bilgisi olarak mı sunulacak, yoksa tamamen mi atlanacak?
- **Q-P03** — `UserPermission`'ın Metnex rol-modeline (Q-M04'ün seçeceği yönteme göre) dönüştürülme
  **mekanizması** (elle mi, script ile mi) hangi implementation task'ının sorumluluğunda olacak?

Özet tablosuna 3 yeni satır eklendi, mevcut satırlar değiştirilmedi.

---

## 12. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 13. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmemiştir** — rol-modeli seçimi (Q-P01),
  permission adı kesinleşmesi (Q-M03), rol-şablonu/birebir atama kararı (Q-M04), tenant ataması
  (Q-M06) çözülmeden Wave 1 implementation task'ları (`TASK-027-11`–`TASK-027-19`)
  başlatılmamalıdır.
- `Username`/`Email` ayrımı ve `IsEmailVerified` alanının hedefi (§2.1, §2.4) netleşmeden `users`
  tablosuna veri yazımı planlanamaz.
- Gerçek secret/parola/hash/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.
