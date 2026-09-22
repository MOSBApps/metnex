# BOTC Entity/Repository/Service → Metnex Domain Mapping

> **Durum: Discovery/mapping dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-3-botc-entity-repository-domain-mapping.md` (EPIC-004, Wave 0,
> bağımlılık: TASK-027.2 + TASK-027.2-R1 — done). Bu belge `BOTC_TO_METNEX_MAPPING.md` (tablo/DB
> sınıflandırması), `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` (hedef mimari/güvenlik) ve
> `BOTC_SOURCE_SCHEMA_INVENTORY.md`'yi (kolon/PK/FK detayı) **tamamlar, tekrar etmez**. Bu belgenin
> odağı: her entity/servis davranışının **tek bir hedef Metnex domain sahibine** (veya açık "karar
> bekliyor" kategorisine) atanması ve repository/service **davranışlarının** (yalnızca veri
> şemasının değil) tenant/permission/audit etkileriyle belgelenmesi.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

`../BOTC` kaynak kodu, önceki iki task'ın (TASK-027.1, TASK-027.2) ötesinde **ek olarak** şu
dosyalar bu task için yeniden/derinlemesine okundu:

- `BOT.Services/{AuthService,UserService,UserAuthorizationService,SessionService,QueryService,
  DataSourceService,VardiyaService,ArsivVardiyaService}.cs` — tüm public metotlar tek tek okundu.
- `BOT.Services/{TicketService,DofService}.cs` — yalnızca **Wave 1 kimlik tablolarına
  (`Users`/`UserPermissions`/`Permissions`) yaptıkları çapraz-bağımlılık** tespiti amacıyla
  tarandı (kendileri Wave 2/3 kapsamındadır, bu belgede mapping'leri **üretilmemiştir**).
  `BOT/DataSourceManagementWindow.xaml.cs` — `VisibilitySettings`'in gerçek kullanım yeri
  (admin UI) doğrulandı.
- `apps/api/src/` gerçek dizin yapısı (`platform`, `reporting`, `tenant-scope`, `audit`,
  `settings`) ve `apps/api/src/platform/permission-catalogue.ts` — Metnex'in **hâlihazırda var
  olan** domain modülleri ve gerçek `MODULE:RESOURCE:ACTION` permission formatı örneği, hedef
  domain sahipliği atamalarında **var olmayan bir modül icat edilmeden** referans alındı.

**BOTC'de repository katmanı (Repository pattern) yoktur** — servis sınıfları (`AuthService`,
`UserService`, vb.) `BotDbContext`/`DofDbContext`/`VardiyaDbContext`/`ArsivVardiyaDbContext`'i
doğrudan constructor injection ile alıp LINQ sorgularını doğrudan çalıştırır. Bu belgede
"repository davranışı" ifadesi, BOTC'nin gerçek karşılığı olan **servis metotu** düzeyinde
belgelenmiştir; ayrı bir repository katmanı **varsayılmamıştır**.

**SQL Server'a bu ortamdan erişim yoktur** — bu belgedeki hiçbir satır canlı veri/şema iddiası
içermez; doğrulanamayan noktalar `[DOĞRULANAMADI]` olarak işaretlenmiştir.

---

## 0. Sınıflandırma İlkesi

Her BOTC entity/servis, aşağıdaki **hedef kategorilerden tam olarak birine** atanmıştır (birden
fazla kategoriye atanan öğe yoktur):

| Kategori | Anlamı |
|---|---|
| **Wave 1 — `platform` domain** | Kimlik/kullanıcı/rol/permission; Metnex'in var olan `apps/api/src/platform` modülüne karşılık gelir |
| **Wave 4 aday — yeni domain (henüz yok)** | Vardiya/arşiv; Metnex'te bugün karşılığı olan bir modül **yok** (Q-E03) |
| **Wave 5 aday — `reporting`/yeni domain (karar bekliyor)** | SCADA/DMS read-only; kısmen `apps/api/src/reporting/dataset` ile örtüşebilir ama kesinleşmedi (Q-E04) |
| **Kapsam dışı (Wave 2/3, mapping üretilmedi)** | Ticket/MaintenanceRecord/FaultRecord, DÖF — yalnızca referans amaçlı listelenir |
| **Taşınmaz / karşılığı yok** | BOTC'ye özgü, Metnex'in hedef modelinde doğrudan karşılığı olmayan veya güvenlik nedeniyle bilinçli olarak taşınmayacak davranışlar |

---

## 1. Wave 1 — Kimlik (`platform` domain)

### 1.1 Entity → Domain Ataması

| BOTC entity (kaynak) | Hedef Metnex domain sahibi | Veri sahibi | Karar |
|---|---|---|---|
| `User` (`BOT.Domain/User.cs`) | `apps/api/src/platform` (`user.domain.ts`, `user.service.ts`) | PostgreSQL | **Migrate** — yalnızca kimlik alanları (`Username`, `PasswordHash`→yeniden hash'lenecek, `FullName`, `IsActive`, `Email`, `IsEmailVerified`, `CreatedDate`, `RoleId`→permission ataması); `IsMaintenanceMember`/`IsElectricMember`/`IsMechanicMember`/`CanBeDofResponsible` Wave 2/3'e özel bayraklardır, **migrate edilmez** (TASK-027.1 §2.1 ile tutarlı) |
| `Role` (`BOT.Domain/Role.cs`) | `apps/api/src/platform` (`system-role.domain.ts`, `role.service.ts`) | PostgreSQL | **Migrate (dönüştürülerek)** — `Id`, `Name`, `Description`; BOTC'nin hardcoded `"Admin"` özel-rol davranışı (bkz. §2.1) birebir taşınmaz |
| `Permission` (`BOT.Domain/Permission.cs`) | `apps/api/src/platform` (`permission.domain.ts`, `permission-catalogue.ts`) | PostgreSQL | **Migrate (dönüştürülerek)** — `PermissionName`/`Description` → gerçek Metnex `ASSIGNABLE_CATALOGUE` formatına (`MODULE:RESOURCE:ACTION`, örn. `SETTINGS:GENERAL:VIEW`) eşlenecek; kesin isimler Q-M03'e bağlı |
| `UserPermission` (`BOT.Domain/UserPermission.cs`) | `apps/api/src/platform` (kullanıcı-permission atama tabloları) | PostgreSQL | **Migrate (dönüştürülerek)** — `(UserId, PermissionId)` unique ara tablo; rol-şablonu mı yoksa birebir atama mı olacağı Q-M04'e bağlı |

### 1.2 Servis Davranışı Envanteri (repository katmanı yerine geçen gerçek kod)

| BOTC servis metodu | Davranış | Tenant/permission etkisi | Metnex hedef karşılığı |
|---|---|---|---|
| `AuthService.LoginAsync` (`AuthService.cs:26-119`) | `Username`+`IsActive` ile tekil kullanıcı arar; hash **veya** düz-metin parola karşılaştırır (düz-metin eşleşirse **otomatik yükseltip** `DOF_APP.Users.SifreHash`'i de senkronize eder — çapraz-DB, EF FK değil); `Role.Name == "Admin"` ise **tüm** `Permissions` listesini döner, değilse yalnızca `UserPermissions` üzerinden atanmış izinleri döner | Tenant kavramı yok (BOTC tek-tenant); permission listesi login anında **tek seferlik** hesaplanıp `LoginResult`'a gömülür | `apps/api/src/platform/auth.service.ts` — Metnex'in JWT tabanlı auth akışı; **düz-metin parola fallback'i ve hardcoded `"Admin"`→tüm-izin kısayolu taşınmaz** (mimari karar dokümanı §6 ile tutarlı), permission'lar JWT claim/DB'den standart Metnex modeliyle çözülür |
| `AuthService.GetUserProfileAsync` | `Id`+`IsActive` ile kullanıcı arar, yalnızca `Username` döner (`RoleName` her zaman boş string — **ölü/eksik alan**, `[DOĞRULANAMADI]`) | — | `apps/api/src/platform/me.service.ts` — Metnex'in var olan "mevcut kullanıcı profili" uç noktası zaten daha eksiksiz; birebir port gerekmez |
| `SessionService.SetUser`/`Clear` (`SessionService.cs`) | Login sonrası `UserId`/`UserName`/`RoleName`/`Permissions` (HashSet) **bellek içinde** (in-process, tekil masaüstü oturumu) saklanır | Permission listesi **yalnızca login anında** dondurulur; oturum ortasında admin panelden izin değişirse kullanıcı yeniden login olana kadar **eski izinlerle** çalışır | **Doğrudan karşılığı yok** — Metnex çok-kullanıcılı/stateless HTTP API'dir (JWT + guard), sunucu tarafı in-memory oturum modeli mimari olarak uyumsuz; bkz. §3 ve **Q-E01** |
| `UserAuthorizationService.Can`/`IsAdmin` (`UserAuthorizationService.cs`) | **DB'ye hiç gitmez** — yalnızca `SessionService.Permissions` HashSet'ini ve `RoleName == "Admin"` string karşılaştırmasını kontrol eder | Yukarıdaki staleness riskini miras alır | `apps/api/src/platform/permission.guard.ts` — Metnex'in var olan guard'ı zaten farklı (request-scoped, DB/JWT tabanlı) bir modeldir; BOTC'nin in-memory kısayolu **taşınmaz** |
| `UserService.GetAllAsync`/`GetByIdAsync`/`CreateAsync`/`UpdateAsync`/`DeleteAsync` | Doğrudan `BotDbContext.Users` CRUD'u; `CreateAsync` boş şifreyle yalnızca bakım üyeleri (`isMaintenanceMember`) için rastgele GUID hash'i üretip izin verir (Wave 2'ye özel bir istisna) | Tenant scope yok; yetkilendirme çağıran UI katmanında (ayrı kontrol yok, servis metodu **kendi başına** yetki kontrolü yapmaz) | `apps/api/src/platform/user.service.ts` — Metnex'in var olan kullanıcı CRUD'u zaten tenant-scope + permission guard ile sarmalı; BOTC'nin "servis kendi başına yetki kontrolü yapmaz, UI kontrol eder" modeli **taşınmaz** — Metnex guard/tenant-scope katmanında zorunlu kalır |
| `UserService.GetRolesAsync`/`GetAllPermissionsAsync`/`SetUserPermissionsAsync`/`AddPermissionAsync` | Rol/permission listesi + kullanıcı-permission atama (tam `RemoveRange`+`AddRange` — **kısmi güncelleme yok**, her kayıtta tüm liste değiştirilir) | — | `apps/api/src/platform/role.service.ts` / `permission.controller.ts` |
| `UserService.GetEmailsByPermissionAsync`/`GetAdminEmailsAsync` | Permission adına veya `Role.Name == "Admin"`'e göre aktif kullanıcıların e-postalarını döner — **Wave 2/4 bildirim akışları tarafından çağrılır** (`VardiyaService.SendEmailNotification`, `TicketService`) | Users/Permissions Wave 1 verisine Wave 2/4 servislerinin **doğrudan bağımlılığı** — bkz. §5 ve **Q-E02** | Metnex'te bildirim alıcı listesi permission-catalogue üzerinden çözülecekse aynı model korunabilir; kesin mekanizma bu task'ın kapsamında **karar verilmedi** |

**Not — `IsElectricMember`/`IsMechanicMember`/`IsMaintenanceMember`/`CanBeDofResponsible`:**
Bu 4 alan `User` entity'sinde tutulsa da davranışsal olarak yalnızca Wave 2 (`Ticket`) tarafından
tüketilir (bkz. `TicketService.CreateTicketAsync` gibi çağrılar) — Wave 1 migration'ına
**dahil edilmemelidir** (TASK-027.1 §2.2 ile tutarlı, burada servis-davranışı kanıtıyla
**yeniden doğrulanmıştır**).

### 1.3 ID / FK / Audit / Tenant / Veri Sahipliği Etkileri

| Konu | BOTC davranışı | Metnex etkisi |
|---|---|---|
| **ID** | `User.Id`/`Role.Id`/`Permission.Id`/`UserPermission.Id` hepsi `int` identity | Metnex PostgreSQL şeması UUID/serial kullanıyor (`docs/domain/DOMAIN_MODEL.md`) — `legacy_id → id` eşleme tablosu gerekir (TASK-027.1 §4 ile aynı ilke) |
| **FK** | `User.RoleId` → `Roles.Id` (delete behavior migration geçmişinde çelişkili, bkz. Q-S01); `UserPermission.UserId`/`PermissionId` → `Cascade` `[KOD]` | Metnex tarafında FK delete-behavior'ı kanonik olarak yeniden tanımlanmalı, BOTC'nin çelişkili geçmişi **birebir taşınmaz** |
| **Çapraz-DB senkronizasyon** | `AuthService.LoginAsync`, parola yükseltirken `BOT_APP.Users` ve `DOF_APP.Users`'ı **elle** (`BotUserId` üzerinden, EF FK değil) senkronize eder | Metnex'te tek bir `users` tablosu olacağı için bu senkronizasyon **ihtiyacı ortadan kalkar** — ancak Wave 3 (DÖF) henüz migrate edilmediği sürece BOTC tarafında bu senkronizasyon **çalışmaya devam etmelidir** (kesim/cutover stratejisi Q-E02) |
| **Audit** | `User.CreatedDate` dışında audit alanı **yok** (`UpdatedAt`, `UpdatedBy`, soft-delete yok — `DeleteAsync` gerçek `DELETE`) | Metnex `apps/api/src/audit` modülü zaten var — Wave 1 migration'ı BOTC'nin audit eksikliğini **miras almamalı**, Metnex'in var olan audit log mekanizması kullanıcı/rol/permission değişikliklerine uygulanmalı |
| **Tenant** | BOTC'de tenant kavramı yok; `User.Sirket` serbest metin | Metnex `tenant-scope` modülü zorunlu — migrate edilen her `User` bir Metnex tenant'ına (MİP root veya MOSB/MOSEDAŞ/MOSBİO) atanmalı; bu atamanın kaynağı `Sirket` alanı **olamaz** (serbest metin, yapısal değil) — Q-M06 ile aynı belirsizlik |
| **Veri sahipliği** | Tüm kimlik verisi tek `BOT_APP` veritabanında, tek uygulama örneği | PostgreSQL `platform` şeması; salt-okunur SQL Server bağımlılığı **yok** (SCADA'nın aksine) |

---

## 2. Wave 4 Aday — Vardiya/Arşiv (henüz Metnex'te domain sahibi yok)

### 2.1 Entity → Domain Ataması

| BOTC entity | Hedef Metnex domain sahibi | Karar |
|---|---|---|
| `MosbioRapor`, `MosbEnerjiRapor`, `KomurKazaniRapor`, `MosbioKirimDepoRapor`, `VardiyaMuhendisiRapor` (`VardiyaRaporuBase` alt sınıfları) | **Karar bekliyor** — `apps/api/src/` altında bugün bir `shift`/`vardiya` modülü **yok** | **Aday, implementation onayı bekleniyor** (Q-E03) |
| `Arsiv*` (5 karşılık gelen entity, `ArsivVardiyaRaporuBase`) | Aynı, arşiv/salt-okunur geçmiş kayıt görünümü olarak | **Aday** |

### 2.2 Servis Davranışı Envanteri

| BOTC servis metodu | Davranış | Tenant/permission etkisi | Metnex etkisi |
|---|---|---|---|
| `VardiyaService.SaveReportAsync` | `lokasyon` (5 sabit string: `MOSBİO`/`MOSB ENERJİ`/`KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL`) parametresine göre **switch-case** ile doğru tabloya insert/update yapar; `operatorId`/`operatorFullName` **serbest parametre olarak** geçirilir, servis içinde oturum/permission kontrolü **yapılmaz** | Permission/tenant kontrolü yok — çağıran UI katmanına bırakılmış; `lokasyon` yapısal bir tenant/scope alanı değil, **serbest string switch** | Metnex tarafında `lokasyon` bir **tenant-içi alt-scope** (data-scope) alanına dönüştürülmeli (Q-M06 ile aynı belirsizlik), yetki kontrolü servis/guard katmanında **zorunlu** hale gelmeli — BOTC'nin "UI kontrol eder" modeli taşınmaz |
| `VardiyaService.GetReportListAsync` | 5 tabloyu ayrı ayrı sorgulayıp **uygulama tarafında** (`finalResult.AddRange` + `OrderByDescending`) birleştirir — SQL `UNION` değil | — | Performans/ölçek açısından Metnex tarafında tek bir tablo + `lokasyon` kolonu ile normalize edilmesi önerilir (implementation kararı, bu task'ta verilmedi) |
| `VardiyaService.SendEmailNotification` | `IsCompleted=true` olduğunda `UserService.GetEmailsByPermissionAsync("CanReceiveShiftReportEmail")` çağrısıyla Wave 1 `Permissions`/`Users` tablosuna bağımlı bildirim gönderir | Wave 1 verisine **doğrudan bağımlılık** (§1.2, Q-E02) | Metnex'te bildirim tercihi permission mi yoksa ayrı bir subscription modeli mi olacağı TASK-027.1 §2.2'de zaten açık soru (Q-M sürümü yok, mapping dokümanında not edilmişti) |
| `ArsivVardiyaService.SaveArchiveReportAsync` | `VardiyaService` ile birebir aynı switch-case deseni, ek olarak `DefterTarihi` (geçmişe dönük, elle girilen "defter tarihi") alanı taşır — **yalnızca insert**, update/delete metodu yok (arşiv "append-only" tasarlanmış) | — | Metnex tarafında arşiv modeli **append-only** olarak korunabilir (mevcut Metnex audit/immutable kayıt pratiğiyle uyumlu) |
| `ArsivVardiyaService.GetArchiveReportListAsync`/`GetArchiveReportByIdAsync` | `VardiyaService`'in okuma metotlarıyla aynı desen | — | — |

### 2.3 ID / FK / Audit / Tenant / Veri Sahipliği Etkileri

| Konu | BOTC davranışı | Metnex etkisi |
|---|---|---|
| **ID** | Her lokasyon tablosu kendi `int` identity PK'sine sahip (5 ayrı sayaç) | Metnex'te tek normalize tablo + UUID PK önerilir (implementation kararı bekliyor) |
| **FK** | `OperatorBotUserId` → `BOT_APP.Users.Id`'ye **uygulama-seviyesi** referans (EF FK tanımlanmamış, `[DOĞRULANAMADI]`) | Wave 1 migration'ı tamamlanmadan bu referans çözülemez — Wave 4, Wave 1'e **bağımlıdır** (zaten TASK-027.1 §5'te önceliklendirilmişti) |
| **Audit** | `KayitTarihi` (oluşturma) dışında audit alanı yok; `Arsiv*` tarafında ayrıca `DefterTarihi` (geçmişe dönük manuel tarih) var — bu iki tarih **karıştırılmamalı** | Metnex audit modülü `KayitTarihi`'ni `createdAt`'e, `DefterTarihi`'ni ayrı bir "olay tarihi" alanına eşlemeli |
| **Tenant** | `lokasyon` string'i tenant-içi scope adayı (Q-M06) | Wave 4 implementation'ı Q-M06 çözülmeden başlatılmamalı |
| **Veri sahipliği** | `VARDIYA_RAPORLARI` / `VARDIYA_RAPORLARI_ARSIV` — SQL Server, `BOT_APP`'ten ayrı veritabanı | PostgreSQL migration adayı (SQL Server'da salt-okunur kalmaz, Wave 5'in aksine) |

---

## 3. Wave 5 Aday — SCADA/DMS (karar bekliyor: `reporting` mi, yeni modül mü)

### 3.1 Entity → Domain Ataması

| BOTC entity | Hedef Metnex domain sahibi | Karar |
|---|---|---|
| `GtEndeks`, `SgEndeks`, `KomurEndeks`, `MosbioEndeks`, `VardiyaPerformans` (`IsletmeModelleri.cs`) | **Karar bekliyor** — `apps/api/src/reporting/dataset` ile kısmen örtüşür (dataset provider deseni zaten var) ama SCADA'ya özel bir adapter/modül henüz yok | **Read-only aday** (Q-E04) |

### 3.2 Servis Davranışı Envanteri

| BOTC servis metodu | Davranış | Tenant/permission etkisi | Metnex etkisi |
|---|---|---|---|
| `DataSourceService.GetDataSources`/`GetAllDataSources`/`GetConnectionString` | `appsettings.json` → `DynamicDataSources[]`'ı okuyup **hepsini olduğu gibi** döner; filtreleme yok, `ConfigProtector.Decrypt` ile connection string çözülür (sabit gömülü anahtar — mimari karar dokümanı §6'da zaten "taşınmaz" işaretli) | Kaynak filtreleme **hiç yok** — hangi kullanıcının hangi kaynağı görebileceği tamamen UI/`VisibilitySettings`'e bırakılmış | Metnex'in **admin-küratörlü sabit allowlist** modeli (SEC-DATA-002, mimari karar dokümanı §4) bunun yerini alır — birebir port **önerilmez** |
| `QueryService.GetTablesAsync` | `INFORMATION_SCHEMA.TABLES`'tan **canlı** tablo listesi çeker, `VisibilitySettings`'te `IsVisible=false` işaretlenenleri (admin gizlemişse) filtreler | Görünürlük kontrolü **tablo-seviyesi UI ayarı**, permission değil | Metnex allowlist backend'de admin tarafından **küratörlü** olacak (dinamik `INFORMATION_SCHEMA` keşfi değil) — mimari karar dokümanı §4 ile birebir tutarlı, burada servis-davranışı kanıtıyla **doğrulandı** |
| `QueryService.GetColumnsAsync` | `INFORMATION_SCHEMA.COLUMNS`'tan canlı kolon listesi; `tableName` yalnızca regex (`^[a-zA-Z0-9_]+$`) ile doğrulanıyor, **allowlist yok** | — | Aynı — Metnex tarafında kolon listesi de sabit allowlist'ten gelecek |
| `QueryService.RunQueryAsync` | `ValidateQueryInputs` ile tablo/kolon **varlığını** kontrol ettikten sonra SQL'i **string interpolasyonuyla** (`QUOTENAME` yok) kurup çalıştırır — SQL injection riski zaten mimari karar dokümanında (§4 madde 1, Discovery R-006) "taşınmaz" olarak işaretliydi, burada tam kod kanıtıyla **teyit edildi** (`$"[{request.TableName}]"` doğrudan enterpolasyon) | Tenant/permission kontrolü **yok** — yalnızca varlık kontrolü | Metnex read-only adapter'ı parametreli sorgu + admin-küratörlü allowlist ile **güvenlik yükseltmesi** yapacak (birebir port değil) |
| `VisibilitySetting` kullanımı (`DataSourceManagementWindow.xaml.cs`) | Admin ekranından `DataSourceName`+`TableName` bazlı görünürlük açma/kapama (`TableName == "*"` ise tüm data source gizlenir/gösterilir) | UI-seviyesi toggle, backend'de **zorlayıcı** bir güvenlik kontrolü değil (yalnızca `GetTablesAsync`'te listeden çıkarma) | **Taşınmaz** — Metnex'in admin-küratörlü allowlist modeli bu işlevi zaten daha güvenli şekilde (backend'de zorunlu) karşılar; `VisibilitySettings` tablosunun kendisi migrate edilmez (TASK-027.1 §2.5 ile tutarlı) |

### 3.3 ID / FK / Audit / Tenant / Veri Sahipliği Etkileri

| Konu | BOTC davranışı | Metnex etkisi |
|---|---|---|
| **ID** | SCADA entity'leri `DateTime` alanını `[Key]` olarak kullanır (ayrı auto-increment yok) | Metnex read-only erişimde satır kimliği **taşınmaz**, SQL Server tarafında kalır (TASK-027.1 §4 ile aynı ilke) |
| **FK** | Tanımlı değil (yalnızca `[Key]`) | — |
| **Audit** | Yok — bu tablolar salt-okunur harici veri kaynağı olarak kalacağı için Metnex tarafı yalnızca **erişim/sorgu audit'i** (kim, ne zaman, hangi tabloyu sorguladı) ekleyecek, kaynak veri audit'i BOTC/SCADA tarafının sorumluluğunda kalır |
| **Tenant** | Yok — `MosbioEndeks`/`GtEndeks` gibi entity'ler hangi tenant'a (MOSB/MOSEDAŞ/MOSBİO) ait olduğunu **yapısal olarak belirtmez**, yalnızca `DynamicDataSources` anahtar adından çıkarım yapılabiliyor (Q-M06, Q-S03) | Wave 5 implementation'ı bu tenant-kaynak eşlemesi netleşmeden başlatılamaz |
| **Veri sahipliği** | SQL Server, Metnex'e **kopyalanmaz** | Read-only adapter; PostgreSQL'e yazma **yok** |

---

## 4. Kapsam Dışı (Wave 2/Wave 3) — Yalnızca Referans, Mapping Üretilmedi

Aşağıdaki entity/servisler bu task'ta **hiçbir domain ataması veya implementation önerisi
almamıştır** (D-007 kararına uygun); yalnızca Wave 1 verisine olan bağımlılıkları not edilmiştir
(§1.2, §5):

| BOTC entity/servis | Database | Not |
|---|---|---|
| `Ticket`, `TicketService` | `BOT_APP` | Wave 2 — `Users`/`UserPermissions`/`Permissions`'a okuma bağımlılığı var (bildirim alıcı listesi) |
| `MaintenanceRecord` | `BOT_APP` | Wave 2 — migration'da drop edilmiş, `[DOĞRULANAMADI]` (Q-S02) |
| `FaultRecord` | `BOT_APP` | Wave 2, potansiyel ölü kod (Discovery R-012/Q-007) |
| `DofUser`, `DofKaydi`, `DofNotification`, `DofService` | `DOF_APP` | Wave 3 — `BOT_APP.Users`'a **FullName string eşlemesiyle** (yapısal FK değil) ve `BotUserId` ile bağımlı; `AuthService.LoginAsync` içinde çapraz-DB senkronizasyon var (§1.3) |

---

## 5. BOTC'de Karşılığı Bulunmayan veya Doğrudan Taşınmaması Gereken Davranışlar

| Davranış | Kaynak | Neden taşınmaz |
|---|---|---|
| Repository pattern | (yok — tüm `BOT.Services` sınıfları `DbContext`'i doğrudan kullanır) | BOTC'de bu katman hiç yok; Metnex'in kendi servis/repository ayrımı (varsa) bağımsız tasarlanmalı, BOTC'den bir "port edilecek repository" **yoktur** |
| Bellek-içi (in-memory) permission snapshot | `SessionService.cs`, `UserAuthorizationService.cs` | Metnex stateless HTTP API + JWT modeliyle mimari olarak uyumsuz; staleness riski taşır (Q-E01) |
| Düz-metin parola fallback + otomatik yükseltme | `AuthService.LoginAsync:51-83` | Mimari karar dokümanı §6'da zaten "taşınmaz" — burada tam kod kanıtıyla teyit edildi |
| Hardcoded `"Admin"` rolü → tüm-izin kısayolu | `AuthService.LoginAsync:93-100` | Metnex'in kanonik permission modeliyle uyumsuz; roller **veri** olmalı, kod içinde özel isim kontrolü olmamalı |
| `ConfigProtector` sabit gömülü AES anahtarı | `DataSourceService.cs:21`, `Options/*` | Mimari karar dokümanı §6, zaten "taşınmaz" — connection string şifreleme mekanizması Metnex'in secret yönetimiyle değiştirilecek |
| `INFORMATION_SCHEMA` canlı varlık kontrolü (allowlist yerine) | `QueryService.GetTablesAsync`/`GetColumnsAsync`/`ValidateQueryInputs` | Mimari karar dokümanı §4, admin-küratörlü sabit allowlist ile değiştirilecek |
| SQL string interpolasyonu (`QUOTENAME` yok) | `QueryService.RunQueryAsync:191-201` | SQL injection riski (Discovery R-006) — Metnex parametreli sorgu/allowlist kullanacak |
| `VisibilitySettings` UI-toggle görünürlük modeli | `VisibilitySetting.cs`, `DataSourceManagementWindow.xaml.cs` | Backend'de zorlayıcı değil; Metnex'in admin-küratörlü allowlist'i işlevini üstlenir, tablo migrate edilmez |
| Servis metodunun kendi başına yetki kontrolü yapmaması (kontrol UI'da) | `UserService`, `VardiyaService`, `ArsivVardiyaService` genelinde | Metnex'te permission/tenant-scope guard zorunlu katman; "UI kontrol eder" varsayımı taşınmaz |
| Çapraz-DB elle senkronizasyon (`BotUserId`) | `AuthService.LoginAsync:72-82`, `DofService.GetBotUserIdByFullNameAsync` | Metnex tek `users` tablosuna geçtiğinde ihtiyaç ortadan kalkar; geçiş döneminde (Wave 3 migrate edilmeden önce) BOTC tarafında bu senkronizasyon çalışmaya devam etmek zorunda kalabilir (Q-E02) |
| Uygulama-seviyesi (UNION olmayan) çoklu-tablo birleştirme | `VardiyaService.GetReportListAsync` | Performans deseni; Metnex normalize tek-tablo modeliyle değiştirilebilir (implementation kararı, bu task'ta verilmedi) |

---

## 6. Yeni Açık Sorular (append, mevcut Q-M/Q-A/Q-S serisi korunarak)

Bu task sırasında tespit edilen ve mevcut açık sorularla (Q-M01–Q-M06, Q-A01–Q-A03, Q-S01–Q-S04)
**örtüşmeyen** 4 yeni soru `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye **append** edildi:

- **Q-E01** — `SessionService`'in bellek-içi permission snapshot modeli Metnex'e taşınacak mı,
  yoksa her istekte taze kontrol mü yapılacak?
- **Q-E02** — Wave 2/3 (Ticket, DÖF) servisleri Wave 1 `Users`/`UserPermissions`'a bağımlı; Wave 1
  migration/cutover sırasında bu bağımlılık nasıl korunacak?
- **Q-E03** — Wave 4 (Vardiya/Arşiv) için Metnex tarafında yeni bir domain modülü mü açılacak?
- **Q-E04** — Wave 5 SCADA read-only adapter `reporting` modülü altına mı, ayrı bir modüle mi
  yerleşecek?

Detaylı gerekçe/kaynak/blokaj için `BOTC_MIGRATION_OPEN_QUESTIONS.md`'nin ilgili bölümüne bakınız.

---

## 7. Kapsam Dışı Teyidi

Wave 2 (Bakım/Arıza: `Ticket`, `MaintenanceRecord`, `FaultRecord`) ve Wave 3 (DÖF: `DofKaydi`,
`DofUser`, `DofNotification`) için bu belgede **hiçbir migration mapping'i, entity dönüşümü veya
implementation önerisi üretilmemiştir** — yalnızca §4'te referans amaçlı listelenmiş ve Wave 1
verisine olan bağımlılıkları not edilmiştir.

## 8. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/Docker/Git değişikliği yoktur).

## 9. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmemiştir** — Wave 1 implementation task'ları
  (`TASK-027-11`–`TASK-027-19`) hâlâ Q-M03/Q-M04/Q-A01/Q-A03 gibi PO onayı gerektiren sorular
  çözülmeden başlatılmamalıdır.
- Wave 4 ve Wave 5, kendi yeni açık soruları (Q-E03, Q-E04) dahil olmak üzere **modül yerleşimi
  netleşmeden** implementation planlamasına alınamaz.
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, Docker, Git history değişmedi. Git commit/push yapılmadı.
