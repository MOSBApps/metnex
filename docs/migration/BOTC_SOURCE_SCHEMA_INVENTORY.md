# BOTC Kaynak Database ve Schema Envanteri

> **Durum: Discovery/envanter dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-2-botc-kaynak-database-schema-envanteri.md` (EPIC-004, Wave 0,
> bağımlılık: TASK-027.1 — done). Bu belge `BOTC_TO_METNEX_MAPPING.md`,
> `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` ve `BOTC_MIGRATION_OPEN_QUESTIONS.md`'yi
> **tamamlar**, tekrar etmez — mapping/mimari kararlar için o belgelere bakınız.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak Doğrulama İlkesi (bu belge boyunca geçerli)

Bu belgedeki her tablo/kolon bilgisi **iki kaynaktan biri** ile etiketlenmiştir:

- **[KOD]** — `../BOTC/BOT.Domain/*.cs` entity sınıflarından (`[Table]`, `[Key]`, `[Required]`,
  `[MaxLength]`, C# nullable reference type işaretleri) veya `../BOTC/BOT.Data/*.cs`
  `OnModelCreating` yapılandırmasından doğrudan okunmuştur.
- **[MIGRATION]** — `../BOTC/BOT.Data/Migrations/*.cs` dosyalarındaki gerçek `CreateTable`/
  `AlterColumn`/`CreateIndex`/`AddForeignKey` çağrılarından okunmuştur (yalnızca `BOT_APP`
  şeması için mevcuttur — DÖF ve Vardiya tabloları migration'la değil elle SQL ile
  oluşturulmuştur, D-011).

**SQL Server'a bu ortamdan erişim yoktur.** Gerçek satır sayısı, canlı şemanın kod/migration'la
birebir eşleşip eşleşmediği, veya `appsettings.json`'da adı geçen ama koda hiç yansımayan
veritabanlarının (`MOSEDAS`, `MOSBIO_TELEGRAM`) gerçek içeriği **doğrulanamamıştır**. Bu tür her
nokta açıkça **[DOĞRULANAMADI]** olarak işaretlenmiş ve `BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki
ilgili soruya bağlanmıştır.

---

## 0. Kritik Bulgu — Migration Geçmişi ile Mevcut Kod Arasında Doğrulanmış Sapma

Bu envanter sırasında `../BOTC/BOT.Data/Migrations/` dosyaları tek tek okunarak
`BotDbContextModelSnapshot.cs` (EF'in son bilinen migrasyonlanmış model durumu) ile
`BotDbContext.cs`'nin **güncel** `OnModelCreating` yapılandırması karşılaştırıldı. İki somut
sapma **koddan doğrudan kanıtlanmıştır** (varsayım değildir):

1. **`Roles` / `Role` tablo adı çelişkisi:** `AddExtraNoteAudit` migration'ı (`../BOTC/BOT.Data/Migrations/20251024083250_AddExtraNoteAudit.cs`)
   tabloyu `Roles` → `Role` (tekil) olarak yeniden adlandırıyor; `BotDbContextModelSnapshot.cs`
   bunu `b.ToTable("Role")` olarak doğruluyor. Ancak **güncel** `BotDbContext.cs`'nin
   `OnModelCreating`'i `e.ToTable("Roles")` (çoğul) yazıyor. Bu, ya (a) canlı veritabanında
   tablo tekrar `Roles`'a çevrilmiş, ya (b) kod son migration'dan sonra değiştirilip yeni bir
   migration hiç üretilmemiş, ya da (c) uygulama şu an bu tabloya erişemiyor anlamına gelebilir.
   **[DOĞRULANAMADI]** — bkz. açık soru Q-S01.
2. **`Permissions`, `UserPermissions`, `VisibilitySettings`, `MaintenanceRecords` ve tüm SCADA
   endeks tabloları (`GtEndeks`/`SgEndeks`/`KomurEndeks`/`MosbioEndeks`/`VardiyaPerformans`) hiçbir
   migration dosyasında `CreateTable` ile oluşturulmamıştır** — `BotDbContextModelSnapshot.cs`
   yalnızca `Role`, `Tickets`, `Users` tablolarını tanır. Üstelik `MaintenanceRecords` tablosu
   `AddExtraNoteAudit` migration'ının `Up()` adımında **açıkça `DropTable` ile silinmiş**, hiçbir
   sonraki migration'da yeniden oluşturulmamıştır — ama güncel `BotDbContext.cs` hâlâ
   `DbSet<MaintenanceRecord> MaintenanceRecords` ve bu tabloya yönelik tam `OnModelCreating`
   yapılandırması içeriyor. **[DOĞRULANAMADI]** — bu tabloların canlı veritabanında gerçekten var
   olup olmadığı, elle mi oluşturulduğu yoksa kodun mu güncel olmadığı bu ortamdan
   kanıtlanamaz — bkz. açık soru Q-S02.

Bu iki bulgu, Discovery'nin R-012 ("`FaultRecord` sınıfı namespace dışında, `BotDbContext`'te
`DbSet` yok ama migration'da tablo var — ölü kod olma ihtimali yüksek") ve Q-007 ("`FaultRecords`/
`TelegramSettings` hâlâ kullanılıyor mu?") bulgularıyla **aynı yönde** — BOTC'nin migration
disiplini `BOT_APP` içinde bile tutarsız. Bu envanter bu tutarsızlığı **çözmez**, yalnızca
kanıtlarıyla birlikte kaydeder.

---

## 1. DbContext Envanteri (4/4)

| DbContext | Dosya | Bağlı veritabanı (Discovery §2.3) | Yaşam döngüsü |
|---|---|---|---|
| `BotDbContext` | `BOT.Data/BotDbContext.cs` | `BOT_APP` | Scoped (`D-005`, Discovery §7.1) |
| `DofDbContext` | `BOT.Data/DofDbContext.cs` | `DOF_APP` | `IDbContextFactory<DofDbContext>` |
| `VardiyaDbContext` | `BOT.Data/VardiyaDbContext.cs` | `VARDIYA_RAPORLARI` | `IDbContextFactory<VardiyaDbContext>` |
| `ArsivVardiyaDbContext` | `BOT.Data/ArsivVardiyaDbContext.cs` | `VARDIYA_RAPORLARI_ARSIV` | `IDbContextFactory<ArsivVardiyaDbContext>` |

### 1.1 Tablo/Entity Sayım Özeti ve Yöntem (TASK-027.2-R1)

Aşağıdaki sayım, §2–§6'daki tablo bazlı envanterin **doğrudan toplanmasıyla** üretilmiştir;
hiçbir yeni entity/tablo/migration varsayılmamıştır. Her tablo, aşağıdaki **4 kategoriden
tam olarak birine** atanmıştır (kategoriler birbirini dışlar — bir tablo iki kategoride
sayılmaz):

- **Güncel DbSet + Migration'da da var** — hem `[MIGRATION]` `CreateTable` ile oluşturulmuş hem
  de güncel `OnModelCreating`'de `DbSet` olarak mevcut.
- **Migration-only** — bir migration'da `CreateTable` edilmiş ama güncel `DbSet`'te karşılığı
  yok (ör. `DropTable` edilmiş veya kod içinde artık referans edilmiyor).
- **Kodda olup migration'da olmayan (SCADA hariç)** — güncel `DbSet`'te var ama hiçbir migration
  dosyasında `CreateTable` edilmemiş, SCADA endeks tabloları dışındaki tablolar.
- **SCADA** — `GtEndeks`/`SgEndeks`/`KomurEndeks`/`MosbioEndeks`/`VardiyaPerformans` grubu
  entity'ler; bunlar da migration'da hiç `CreateTable` edilmemiştir (yani teknik olarak yukarıdaki
  kategoriyle aynı köktedir) ama Discovery/mapping dokümanlarındaki SCADA/DMS sınıflandırmasıyla
  tutarlı olması için ayrı bir sütunda raporlanmıştır.

`DofDbContext`, `VardiyaDbContext`, `ArsivVardiyaDbContext` için **hiçbir migration dosyası
mevcut değildir** (D-011, §4–§6) — bu nedenle bu üç context'in "Migration'da da var" ve
"Migration-only" sütunları yapısal olarak her zaman 0'dır; tüm tabloları "kodda olup
migration'da olmayan" veya "SCADA" kategorisine düşer.

| DbContext | Güncel DbSet + Migration'da da var | Migration-only | Kodda olup migration'da olmayan (SCADA hariç) | SCADA | Toplam |
|---|---|---|---|---|---|
| `BotDbContext` | 3 (`Users`, `Role`/`Roles`, `Tickets`) | 2 (`FaultRecords`, `TelegramSettings`) | 4 (`Permissions`, `UserPermissions`, `VisibilitySettings`, `MaintenanceRecords`) | 5 (`GtEndeks`, `SgEndeks`, `KomurEndeks`, `MosbioEndeks`, `VardiyaPerformans`) | **14** |
| `DofDbContext` | 0 | 0 | 3 (`DofUser`→`Users`, `DofKaydi`→`DuzelticiFaaliyet`, `DofNotification`→`Notifications`) | 4 (`GtEndeks`, `SgEndeks`, `KomurEndeks`, `MosbioEndeks`) | **7** |
| `VardiyaDbContext` | 0 | 0 | 5 (`VardiyaRaporuBase` + 4 alt sınıf tablo karşılığı) | 0 | **5** |
| `ArsivVardiyaDbContext` | 0 | 0 | 5 (5 arşiv tablo karşılığı) | 0 | **5** |
| **DbContext-tablo eşleşmesi toplamı** | **3** | **2** | **17** | **9** | **31** |

**Önemli metodolojik uyarı — "31" bir "distinct fiziksel tablo sayısı" değildir:** SCADA
entity'leri (`GtEndeks`/`SgEndeks`/`KomurEndeks`/`MosbioEndeks`) hem `BotDbContext`'te hem de
`DofDbContext`'te ayrı `DbSet` olarak tanımlıdır (§3, `DynamicDataSources`). Bu iki context'teki
DbSet'lerin **aynı fiziksel SQL Server tablolarına mı yoksa farklı tablolara mı** eşlendiği bu
ortamdan doğrulanamaz — bu doğrudan açık soru **Q-S04**'e bağlıdır. Bu nedenle 31 rakamı yalnızca
**"DbContext × tablo" eşleşme sayısı** olarak raporlanmıştır; context'ler arası olası tekrarları
tekilleştiren bir "distinct tablo" toplamı **kasıtlı olarak üretilmemiştir** (Kabul kriteri #7:
"yeni entity/tablo/migration varsayımı üretme" ilkesine uygun olarak, ispatsız bir dedup varsayımı
yapılmamıştır). Önceki teslimde geçen "22 tablo" rakamının hangi yöntemle üretildiği bu tekrar
sayımda yeniden kurulamamıştır ve **hatalıdır**; bu belge, backlog teslim raporu, `METNEX_STATE.md`
ve `PROGRESS_LOG.md` bundan sonra yalnızca yukarıdaki tabloyu referans alır.

---

## 2. `BotDbContext` (`BOT_APP`) — Tablo Bazlı Tam Envanter

### 2.1 `Users` [KOD + MIGRATION]

| Kolon | Tip [MIGRATION] | Nullable | Not |
|---|---|---|---|
| `Id` | `int`, Identity(1,1) | Hayır (PK) | `[MIGRATION]` `PK_Users` |
| `Username` | başlangıçta `nvarchar(50)`, `AddExtraNoteAudit`'te `nvarchar(max)`'e genişletildi | Hayır | `[MIGRATION]` `IX_Users_Username` **unique** (InitialCreate'te eklendi, AddExtraNoteAudit'te drop edilip AddTickets'in Down'ında tekrar eklendi — net son durum doğrulanamadı, [DOĞRULANAMADI]) |
| `PasswordHash` | `nvarchar(max)` | Evet — `[KOD]` `User.cs`: `string? PasswordHash` | — |
| `FullName` | başlangıçta `nvarchar(120)`, sonra `nvarchar(max)` | Hayır | — |
| `IsActive` | `bit` | Hayır | — |
| `RoleId` | `int` | Hayır | `[MIGRATION]` FK → `Roles`/`Role`.`Id`; delete behavior migration geçmişinde **`Restrict`den `Cascade`'e değişmiş** (`AddExtraNoteAudit`), ama `[KOD]` güncel `BotDbContext.OnModelCreating` `DeleteBehavior.Restrict` yazıyor — **çelişki, [DOĞRULANAMADI]**, bkz. §0 |
| `Sirket` | — (migration'da yok) | Evet — `[KOD]` `string? Sirket` | Migration geçmişinde bu kolon **hiç görünmüyor** — `[DOĞRULANAMADI]`, muhtemelen manuel `ALTER TABLE` ile eklendi |
| `Email` | — (migration'da yok) | Evet — `[KOD]` `string? Email` | Aynı durum — `[DOĞRULANAMADI]` |
| `CreatedDate` | — (migration'da yok) | Hayır — `[KOD]` `DateTime CreatedDate` | `[DOĞRULANAMADI]` |
| `IsEmailVerified` | — (migration'da yok) | Hayır — `[KOD]` `bool` | `[DOĞRULANAMADI]` |
| `VerificationCode` | — (migration'da yok) | Evet — `[KOD]` `string?` | `[DOĞRULANAMADI]` |
| `IsMaintenanceMember`, `IsElectricMember`, `IsMechanicMember`, `CanBeDofResponsible` | — (migration'da yok) | Hayır — `[KOD]` `bool` | `[DOĞRULANAMADI]`, Wave 2/3'e özel bayraklar |

**Not:** `Users.Sirket/Email/CreatedDate/IsEmailVerified/VerificationCode/Is*Member/CanBeDofResponsible`
alanlarının **hiçbiri** 4 migration dosyasının hiçbirinde `AddColumn` olarak görünmüyor —
tamamı ya migration disiplini dışında elle eklenmiş ya da `BotDbContextModelSnapshot.cs`
ile kod arasında ek bir sapma var. Bu, §0'daki genel bulgunun bir uzantısıdır.

### 2.2 `Role` / `Roles` [KOD + MIGRATION]

| Kolon | Tip [MIGRATION] | Nullable | Not |
|---|---|---|---|
| `Id` | `int`, Identity(1,1) | Hayır (PK) | `PK_Roles`→`PK_Role` (rename sonrası) |
| `Name` | `nvarchar(60)` → `nvarchar(max)` | Hayır | `[MIGRATION]` `IX_Roles_Name` unique (InitialCreate; `AddExtraNoteAudit`'te drop edildi, sonraki migration'da tekrar eklenmedi — **[DOĞRULANAMADI]**) |
| `Description` | `nvarchar(200)` → `nvarchar(max)` | Hayır | — |

Tablo adı çelişkisi için bkz. §0 madde 1.

### 2.3 `Permissions` [YALNIZCA KOD — migration'da yok, bkz. §0]

| Kolon | `[KOD]` tip | Nullable | Not |
|---|---|---|---|
| `Id` | `int` | Hayır (PK) | — |
| `PermissionName` | `string`, `[MaxLength(100)]`, `[Required]` | Hayır | `[KOD]` `BotDbContext.OnModelCreating`: `HasIndex(p => p.PermissionName).IsUnique()` |
| `Description` | `string`, `[MaxLength(250)]`, `[Required]` | Hayır | — |

### 2.4 `UserPermissions` [YALNIZCA KOD]

| Kolon | `[KOD]` tip | Nullable | Not |
|---|---|---|---|
| `Id` | `int` | Hayır (PK) | — |
| `UserId` | `int` | Hayır | FK → `Users.Id`, `DeleteBehavior.Cascade` `[KOD]` |
| `PermissionId` | `int` | Hayır | FK → `Permissions.Id`, `DeleteBehavior.Cascade` `[KOD]` |

`[KOD]` `HasIndex(up => new { up.UserId, up.PermissionId }).IsUnique()` — bir kullanıcıya aynı
izin birden fazla kez atanamaz.

### 2.5 `VisibilitySettings` [YALNIZCA KOD]

| Kolon | `[KOD]` tip | Nullable | Not |
|---|---|---|---|
| `Id` | `int` | Hayır (PK) | — |
| `DataSourceName` | `string`, `[MaxLength(150)]`, `[Required]` | Hayır | Serbest metin, `DynamicDataSources[].Name` ile eşleşmesi bekleniyor ama FK/enum kısıtı yok |
| `TableName` | `string`, `[MaxLength(150)]`, `[Required]` | Hayır | `"*"` özel değeri "tüm veritabanı gizli" anlamına geliyor (`[KOD]` yorum satırı) |
| `IsVisible` | `bool` | Hayır | — |

### 2.6 `Tickets` [KOD + MIGRATION, Wave 2 — kapsam dışı envanter]

Migration geçmişi bu tabloda ciddi bir şema değişikliği gösteriyor: `20251022_AddTickets.cs`
`Code` alanını `int` olarak, `Type`/`ExtraNote*` kolonları **olmadan** oluşturmuş;
`AddExtraNoteAudit` migration'ı bu tabloyu **tamamen drop edip** güncel şemayla (aşağıdaki
tablo) yeniden oluşturmuş. Güncel şema:

| Kolon | Tip [MIGRATION, AddExtraNoteAudit sonrası] | Nullable |
|---|---|---|
| `Id` | `int`, Identity | Hayır (PK) |
| `Code` | `nvarchar(20)` | Hayır |
| `Type` | `nvarchar(1)` | Hayır |
| `Title` | `nvarchar(200)` | Hayır |
| `Area` | `nvarchar(100)` | Hayır |
| `Description` | `nvarchar(max)` | Hayır |
| `OpenedByUserId` | `int` | Hayır |
| `OpenedByUserName` | `nvarchar(60)` | Evet |
| `OpenedAt` | `datetime2` | Hayır |
| `IsClosed` | `bit` | Hayır |
| `ClosedByUserId` | `int` | Evet |
| `ClosedByUserName` | `nvarchar(60)` | Evet |
| `ClosedAt` | `datetime2` | Evet |
| `WorkDescription` | `nvarchar(2000)` | Evet |
| `ExtraNote` | `nvarchar(2000)` | Evet |
| `ExtraNoteUpdatedByUserId` | `int` | Evet |
| `ExtraNoteUpdatedByUserName` | `nvarchar(60)` | Evet |
| `ExtraNoteUpdatedAt` | `datetime2` | Evet |

`[KOD]` `Ticket.cs`'de ayrıca migration'da **hiç görünmeyen** alanlar var: `Unit`, `Status`
(int), `NeedsElectric`, `NeedsMechanic`, `IsElectricClosed`, `ElectricStaff`, `ElectricNotes`,
`ElectricClosedAt`, `IsMechanicClosed`, `MechanicStaff`, `MechanicNotes`, `MechanicClosedAt`,
`ElectricMaterials`, `MechanicMaterials`, `Location` — bunlar da §0'daki genel sapmanın bir
parçası, migration'da `AddColumn` olarak izlenemiyor. **Wave 2 kapsamında olduğu için bu
tutarsızlık migration implementasyonuna konu değildir, yalnızca envanter amaçlı kaydedilmiştir.**

### 2.7 `MaintenanceRecords` [KOD, migration'da DROP edilmiş — bkz. §0]

| Kolon | `[KOD]` tip | Nullable |
|---|---|---|
| `Id` | `int` | Hayır (PK) |
| `MaintenanceCode` | `string` | Hayır |
| `Title` | `string` | Hayır |
| `Area` | `string` | Hayır |
| `Description` | `string` | Hayır |
| `CreatedBy` | `string` | Hayır |
| `CreatedAt` | `DateTime` | Hayır |
| `IsCompleted` | `bool` | Hayır |
| `CompletedBy` | `string?` | Evet |
| `CompletedAt` | `DateTime?` | Evet |
| `Notes` | `string?` | Evet |

Wave 2 kapsamında (kapsam dışı envanter). Tablonun canlı veritabanında gerçekten var olup
olmadığı **[DOĞRULANAMADI]** (§0 madde 2).

### 2.8 SCADA Endeks Tabloları (`BotDbContext` içinde tanımlı, `[YALNIZCA KOD]`)

| Entity | `DbSet` adı | `[Key]` | Diğer kolonlar (`[KOD]`) |
|---|---|---|---|
| `GtEndeks` | `GtEndeksler` | `KAYIT_TARIHI` (`DateTime`) | `KAYIT_SAATI` (`TimeSpan?`), `GT{1,2,3}_ELEKTRIK_URETIM_KWH` (`double?`), `GT{1,2,3}_DOGALGAZ_TUKETIM_SM3` (`double?`), `GT{1,2,3}_BUHAR_URETIM_TON` (`double?`) — toplam 10 kolon |
| `SgEndeks` | `SgEndeksler` | `KAYIT_TARIHI` | `KAYIT_SAATI`, `SG50_{1,2,3}_ELEKTRIK_URETIM_KWH`, `SG50_{1,2,3}_DOGALGAZ_TUKETIM_SM3`, `SG50_{1,2,3}_BUHAR_URETIM_TON` — toplam 10 kolon |
| `KomurEndeks` | `KomurEndeksler` | `KAYIT_TARIHI` | `KAYIT_SAATI`, `KK1_BUHAR_DN250_TON`, `KK2_BUHAR_DN150_TON`, `KK1_KOMUR_TUK_TON`, `KK2_KOMUR_TUK_TON`, `SICAK_SU_BUHAR_TUK_TON`, `DEGAZOR_BUHAR_TUK_TON` — toplam 7 kolon |
| `MosbioEndeks` | `MosbioEndeksler` (`BotDbContext`) / `Endeksler` (`DofDbContext`) | `KayitTarihi` | `KayitSaati`, `Bar13BuharTedari_ton`, `Turbin{1,2}_Enerji_kWh`, `IcIhtiyacTrafo{1,2}_kWh`, `AnaBuharM1` — toplam 6 kolon |
| `VardiyaPerformans` | `VardiyaPerformans` | `Tarih` | `Vardiya_Saat_Araligi` (`string`), `MusteriVanaAclik_Yuzde_Toplam` (`double?`), `MusteriVanaAcik_Suresi_Sn` (`int?`) |

**Önemli:** `[Key]` alanı `DateTime` tipinde olan bu tablolarda **ayrı bir auto-increment
primary key yoktur** — birincil anahtar doğrudan kayıt tarihidir. Bu, bu tabloların **her tarih
için tek kayıt** varsayımıyla tasarlandığını gösteriyor (saatlik kayıtlar `KAYIT_SAATI` alt
alanıyla ayrıştırılıyor, ayrı satırlar değil — tam davranış [DOĞRULANAMADI], `QueryService`'in
`endeksler` tablosu için özel `RaporID` sütunu kullanması bu varsayımla çelişebilir, bkz. §3).
Foreign key veya index bilgisi kod tarafında **tanımlanmamıştır** (yalnızca `[Key]`).

### 2.9 `[MIGRATION]`'da bulunan ama güncel `BotDbContext`'te karşılığı olmayan tablolar

| Tablo | Durum |
|---|---|
| `FaultRecords` | `InitialCreate`'te oluşturuldu, `AddExtraNoteAudit`'te drop edildi. `[KOD]`'da hâlâ `BOT.Domain.FaultRecord` sınıfı var (namespace **dışında** tanımlı — Discovery R-012) ama `BotDbContext`'te `DbSet` **yok**. Wave 2 kapsamı + potansiyel ölü kod (Discovery Q-007 ile aynı). |
| `TelegramSettings` | `InitialCreate`'te oluşturuldu, `AddExtraNoteAudit`'te drop edildi. `[KOD]`'da bu isimde bir entity sınıfı **bulunamadı** (Telegram entegrasyonu `TelegramOptions`/`TelegramService` ile config-tabanlı, DB tabanlı değil). Muhtemelen tamamen terk edilmiş — Discovery Q-007 ile aynı soru. |

---

## 3. `DynamicDataSources` Kaynakları (Ayrı Liste)

`[KOD]` `../BOTC/BOT/appsettings.json`'da `DynamicDataSources` bölümü altında tanımlanan isimler
(yalnızca **anahtar adları** görüldü, `grep -oE` ile — hiçbir `ConnectionString` değeri
okunmadı/kopyalanmadı):

| Anahtar adı (`Name`) | Muhtemel kaynak DB (Discovery §2.3 ile çapraz okuma, [DOĞRULANAMADI]) | Kod tarafında özel işlem var mı? |
|---|---|---|
| `endeksler` | `MOSBIO_RAPORLAR` (varsayım) | **Evet** — `QueryService.RunQueryAsync`, `TableName == "endeksler"` için özel `[RaporID], [KayitTarihi], [KayitSaati]` kolon seçimi uyguluyor (diğer kaynaklardan farklı davranış) |
| `gt_endeksler` | `MOSB ENERJİ DB` (varsayım) | Hayır, genel akış |
| `komur_endeksler` | `KOMUR_RAPORLAR` (varsayım) | Hayır |
| `sg_endeksler` | `MOSB ENERJİ DB` (varsayım) | Hayır |
| `Saatlik_Ort_Veriler` | Belirsiz | `TableDateMappings`'te örnek olarak geçiyor (Discovery F-007: `LogTime` tarih kolonu) |
| `MUSTERI_CEKIS_SAATLIK` | Belirsiz | Yalnızca isim listesinde |
| `VardiyaPerformans` | Belirsiz | `BotDbContext.VardiyaPerformans` DbSet'iyle aynı isim, ama bu bir `DynamicDataSources` anahtarı — ilişkisi doğrulanamadı |

**Not:** `DataSourceService` (`../BOTC/BOT.Services/DataSourceService.cs`) bu listeyi
`config.GetSection("DynamicDataSources").Get<List<DataSourceOption>>()` ile doğrudan okuyor;
her `DataSourceOption` yalnızca `Name` + `ConnectionString` içeriyor — **schema/database adı
kodda ayrıca saklanmıyor**, tamamen `ConnectionString` içine gömülü (bu ortamdan görülemedi).
Bu, hangi `Name`'in hangi fiziksel veritabanına bağlandığının **kesin olarak yalnızca canlı
config'ten** doğrulanabileceği anlamına gelir — `BOTC_MIGRATION_OPEN_QUESTIONS.md` Q-M01/Q-M02
ile doğrudan ilişkilidir.

---

## 4. `DofDbContext` (`DOF_APP`) — [YALNIZCA KOD, migration yok — D-011]

### 4.1 `Users` (DOF_APP'e özel, `DofUser.cs`, `[Table("Users")]`)

| Kolon | `[KOD]` tip/attribute | Nullable |
|---|---|---|
| `UserID` | `int`, `[Key]` | Hayır (PK) |
| `KullaniciAdiSoyadi` | `string`, `[Required]`, `[MaxLength(150)]` | Hayır |
| `Sirket` | `string?`, `[MaxLength(150)]` | Evet |
| `Email` | `string?`, `[MaxLength(150)]` | Evet |
| `UserRole` | `string`, `[Required]`, `[MaxLength(50)]` | Hayır |
| `SifreHash` | `string?`, `[MaxLength(256)]` | Evet |
| `CreatedDate` | `DateTime`, varsayılan `DateTime.Now` | Hayır |
| `BotUserId` | `int?` | Evet — `BOT_APP.Users.Id`'ye **uygulama-seviyesi** FK (EF Core ilişkisi değil, `AuthService` içinde elle `WHERE BotUserId = @id` sorgusuyla çözülüyor) |

`[KOD]` `DofDbContext.OnModelCreating`: `HasIndex(u => u.KullaniciAdiSoyadi).IsUnique()`,
`HasIndex(u => u.BotUserId)` (unique değil, arama amaçlı).

**Önemli:** Bu tablo `BOT_APP.Users`'tan **tamamen ayrı** bir `Users` tablosudur (farklı
veritabanında, farklı şema). Aynı isimde iki tablo olması migration mapping'inde kafa
karışıklığına yol açabilir — mapping dokümanında zaten "DOF_APP'e özel, ayrı" olarak
işaretlenmişti, burada tekrar teyit edilmiştir.

### 4.2 `DuzelticiFaaliyet` (`DofKaydi.cs`)

| Kolon | `[KOD]` tip/attribute | Nullable |
|---|---|---|
| `ID` | `int`, `[Key]` | Hayır (PK) |
| `DofTarihi` | `DateTime` | Hayır |
| `DofSayisi` | `string`, `[Required]`, `[MaxLength(20)]` | Hayır — `[KOD]` `DofDbContext.OnModelCreating`: `HasIndex(d => d.DofSayisi).IsUnique()` |
| `YapilacakFaaliyet` | `string?`, `[MaxLength(100)]` | Evet |
| `UygunsuzluguTespitEden` | `string`, `[Required]`, `[MaxLength(150)]` | Hayır |
| `FaaliyetSorumlusu` | `string`, `[Required]`, `[MaxLength(150)]` | Hayır |
| `UygunsuzlukKaynaklari` | `string?`, `[MaxLength(100)]` | Evet |
| `UygunsuzlukDetaylari` | `string?` | Evet |
| `KapanisTarihi` | `DateTime?` | Evet |
| `KapanisOnayi` | `string?`, `[MaxLength(50)]` | Evet |
| `DuzelticiFaaliyetAciklama` | `string?` | Evet |
| `KokSebep` | `string?` | Evet |
| `FaaliyetGerceklestirmeTarihi` | `DateTime?` | Evet |
| `FaaliyetSonucu` | `string?`, `[MaxLength(50)]` | Evet |
| `OnaylayanAdSoyad` | `string?`, `[MaxLength(150)]` | Evet |
| `IkinciDuzelticiFaaliyetAciklama` | `string?` | Evet |
| `Durum` | **`[NotMapped]`** — veritabanında yok, hesaplanan property (`KapanisTarihi`/`FaaliyetSonucu`'na göre "Açık"/"Onay Bekliyor"/`FaaliyetSonucu` değeri) | — |

Foreign key/relasyon kod tarafında tanımlanmamış (`DofUser` ile ilişki yalnızca
`FaaliyetSorumlusu`/`UygunsuzluguTespitEden` **serbest metin** alanları üzerinden, yapısal FK
değil — bu bir tasarım zayıflığı, migration'da bir ID-FK ilişkisi kurulması gerekebilir).

### 4.3 `Notifications` (`DofNotification.cs`)

| Kolon | `[KOD]` tip/attribute | Nullable |
|---|---|---|
| `NotificationID` | `int`, `[Key]` | Hayır (PK) |
| `RecipientUsername` | `string`, `[Required]`, `[MaxLength(150)]` | Hayır |
| `MessageContent` | `string`, `[Required]`, `[MaxLength(500)]` | Hayır |
| `DofNumber` | `string?`, `[MaxLength(20)]` | Evet |
| `IsRead` | `bool` | Hayır |
| `Timestamp` | `DateTime`, varsayılan `DateTime.Now` | Hayır |

### 4.4 `DofDbContext` içinde tekrar tanımlı SCADA DbSet'leri

`DofDbContext` de `GtEndeks`/`SgEndeks`/`KomurEndeks`/`MosbioEndeks` (bu context'te `Endeksler`
adıyla) için `DbSet` tanımlıyor — **`BotDbContext` ile aynı entity sınıflarını iki farklı
DbContext üzerinden expose ediyor**. Bu, iki context'in aynı fiziksel SQL Server kaynağına
(`DynamicDataSources` üzerinden değil, doğrudan EF ile) bağlandığı ya da bu DbSet'lerin
`DofDbContext`'te kullanılmayan/ölü kod olduğu anlamına gelebilir — **[DOĞRULANAMADI]**.

---

## 5. `VardiyaDbContext` (`VARDIYA_RAPORLARI`) — [YALNIZCA KOD, migration yok — D-011]

Tüm tablolar `VardiyaRaporuBase` abstract sınıfından türer, ortak kolonlar:

| Kolon | `[KOD]` tip/attribute | Nullable |
|---|---|---|
| `Id` | `int`, `[Key]`, `DatabaseGeneratedOption.Identity` | Hayır (PK) |
| `Vardiya` | `string`, `[Required]`, `[MaxLength(1)]` | Hayır |
| `OperatorBotUserId` | `int`, `[Required]` | Hayır — `BOT_APP.Users.Id`'ye **uygulama-seviyesi** referans (yapısal FK yok) |
| `OperatorTamAdi` | `string`, `[Required]`, `[MaxLength(150)]` | Hayır |
| `Operator2TamAdi` | `string?`, `[MaxLength(150)]` | Evet |
| `KayitTarihi` | `DateTime`, `[Required]` | Hayır |
| `RaporNotlari` | `string?` | Evet |
| `IsCompleted` | `bool`, varsayılan `false` | Hayır |

| Tablo adı [KOD `[Table(...)]`] | Entity sınıfı | Lokasyon |
|---|---|---|
| `mosbio` | `MosbioRapor` | MOSBİO |
| `mosbenerji` | `MosbEnerjiRapor` | MOSB Enerji |
| `komurkazani` | `KomurKazaniRapor` | Kömür Kazanı |
| `mosbiokirimdepo` | `MosbioKirimDepoRapor` | MOSBİO Kırım-Depo |
| `vardiyamuhendisi` | `VardiyaMuhendisiRapor` | Santral (vardiya mühendisi) |

Beş alt sınıfın **hiçbirinde ek kolon yoktur** (`VardiyaRaporuBase`'in dışında hiçbir property
eklenmemiş) — 5 tablo şema olarak birebir aynıdır, yalnızca isim/lokasyon farklıdır. Index/FK
bilgisi kod tarafında **tanımlanmamıştır**.

---

## 6. `ArsivVardiyaDbContext` (`VARDIYA_RAPORLARI_ARSIV`) — [YALNIZCA KOD, migration yok]

Aynı 5 lokasyon, `Arsiv*` prefix'li entity'ler (`ArsivMosbioRapor`, `ArsivMosbEnerjiRapor`,
`ArsivKomurKazaniRapor`, `ArsivMosbioKirimDepoRapor`, `ArsivVardiyaMuhendisiRapor`),
`ArsivVardiyaRaporuBase`'den türüyor. Bu envanter için `ArsivVardiyaRaporuBase.cs` dosyası ayrıca
okunmadı (görev kapsamında `VardiyaRaporuBase` ile "aynı şema" olduğu mapping dokümanı §2.4'te
zaten belirtilmişti); şema farkı varsa **[DOĞRULANAMADI]**, bu bir eksik değil, mapping
dokümanının kapsamıyla tutarlı bir sınırdır.

---

## 7. SCADA/DMS Kaynaklarının Database/Schema/Table Seviyesinde Sınıflandırması

| Database (Discovery §2.3) | Schema/Table (kod kanıtı) | Erişim mekanizması |
|---|---|---|
| `MOSB ENERJİ DB` | `GtEndeks`/`SgEndeks` (tablo adları migration'da yok, `[KOD]`'dan `DbSet` adları biliniyor) — **[DOĞRULANAMADI]** eşleme | `BotDbContext` DbSet + muhtemelen `DynamicDataSources` (`gt_endeksler`/`sg_endeksler`) |
| `KOMUR_RAPORLAR` | `KomurEndeks` | `BotDbContext` DbSet + `DynamicDataSources` (`komur_endeksler`) |
| `MOSBIO_RAPORLAR` | `MosbioEndeks` (tablo adı muhtemelen `endeksler`, `QueryService`'te özel işlem görüyor) | `BotDbContext`/`DofDbContext` DbSet + `DynamicDataSources` (`endeksler`) |
| `MOSEDAS` | **[DOĞRULANAMADI]** — kod tabanında karşılık yok | Muhtemelen `DynamicDataSources` üzerinden (Q-M02) |
| `MOSBIO_TELEGRAM` | **[DOĞRULANAMADI]** — kod tabanında bir DB bağlantısı olarak karşılık yok, Telegram entegrasyonu HTTP API'dir | Q-M01 |

Tüm bu kaynaklara erişim, EF Core `DbSet`'leri **veya** `QueryService`'in
`Microsoft.Data.SqlClient` ile `INFORMATION_SCHEMA` sorgulayan dinamik mekanizması üzerinden
olabilir — hangi entity'nin hangi yolla okunduğu koddan **kısmen** ayırt edilebiliyor
(`BotDbContext` DbSet'leri EF ile, `DynamicDashboardWindow`/`HourlyConsumptionWindow` akışları
`QueryService` ile) ama tam eşleme bu ortamdan doğrulanamaz.

---

## 8. Wave 2 / Wave 3 Kapsam Dışı Envanteri (yalnızca kayıt, implementation önerisi yok)

| Tablo/Entity | Database | Durum |
|---|---|---|
| `Tickets` (`Ticket.cs`) | `BOT_APP` | Wave 2 — bkz. §2.6 |
| `MaintenanceRecords` (`MaintenanceRecord.cs`) | `BOT_APP` | Wave 2 — bkz. §2.7, migration'da drop edilmiş |
| `FaultRecords` (`FaultRecord.cs`) | `BOT_APP` | Wave 2 — bkz. §2.9, muhtemel ölü kod |
| `Users` (DOF_APP, `DofUser.cs`) | `DOF_APP` | Wave 3 — bkz. §4.1 |
| `DuzelticiFaaliyet` (`DofKaydi.cs`) | `DOF_APP` | Wave 3 — bkz. §4.2 |
| `Notifications` (`DofNotification.cs`) | `DOF_APP` | Wave 3 — bkz. §4.3 |

Bu tablolar için **hiçbir migration mapping'i, ID/FK dönüşüm önerisi veya implementation kararı
üretilmemiştir** — yalnızca şema envanteri amacıyla kaydedilmiştir (D-007 kararına uygun).

---

## 9. Yeni Açık Sorular (bu envanterde tespit edildi)

| ID | Soru | Kaynak kanıt | Bloke ettiği | PO onayı |
|---|---|---|---|---|
| **Q-S01** | `Roles`/`Role` tablo adı ve `RoleId` FK delete-behavior'ı (`Restrict` vs `Cascade`) canlı veritabanında hangi durumda? | `AddExtraNoteAudit` migration'ı vs. güncel `BotDbContext.OnModelCreating` çelişkisi (§0 madde 1) | Wave 1 rol migration implementation'ı | Hayır (teknik doğrulama, DBA/IT-OT) |
| **Q-S02** | `Permissions`, `UserPermissions`, `VisibilitySettings`, `MaintenanceRecords` ve SCADA endeks tabloları canlı `BOT_APP`'te gerçekten var mı, hangi şema ile? | Migration geçmişinde hiç `CreateTable` edilmemiş / `MaintenanceRecords` açıkça drop edilmiş (§0 madde 2) | Wave 1 permission migration + Wave 2 envanterinin doğruluğu | Hayır (teknik doğrulama) |
| **Q-S03** | `DynamicDataSources` anahtarlarının (`endeksler`, `gt_endeksler`, `komur_endeksler`, `sg_endeksler`, `Saatlik_Ort_Veriler`, `MUSTERI_CEKIS_SAATLIK`, `VardiyaPerformans`) her biri hangi fiziksel database/schema'ya bağlanıyor? | `appsettings.json` `ConnectionString` değerleri bu ortamdan okunamadı (§3) | Wave 5 SCADA adapter kaynak-tenant eşlemesi | Hayır (teknik, ama Q-M01/Q-M02 ile birleşince PO'ya raporlanmalı) |
| **Q-S04** | `DofDbContext`'in kendi SCADA `DbSet`'leri (`GtEndeks` vb.) gerçekten kullanılıyor mu, yoksa `BotDbContext`'ten kopyalanmış ölü kod mu? | `DofDbContext.cs`'de bu DbSet'lerin hiçbir servis tarafından çağrıldığı bu envanterde doğrulanmadı (§4.4) | Migration implementasyonunda kaynak/hedef netliği | Hayır (teknik) |

Bu sorular `BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki mevcut listeye **eklenmiştir** (bkz. o
belgenin güncellenmiş sürümü); tekrar oraya kopyalanmamıştır, yalnızca çapraz referans
verilmiştir.

---

## Kaynak Referansları

- `../BOTC/BOT.Data/{BotDbContext,DofDbContext,VardiyaDbContext,ArsivVardiyaDbContext}.cs`
- `../BOTC/BOT.Data/Migrations/{20251020143559_InitialCreate,20251022_AddTickets,20251024083250_AddExtraNoteAudit,20251024085243_Sync_ExtraNoteAudit}.cs`
- `../BOTC/BOT.Data/Migrations/BotDbContextModelSnapshot.cs`
- `../BOTC/BOT.Domain/*.cs` (27 dosyanın tamamı — `User`, `Role`, `Permission`, `UserPermission`,
  `VisibilitySetting`, `Ticket`, `MaintenanceRecord`, `FaultRecord`, `DofUser`, `DofKaydi`,
  `DofNotification`, `VardiyaRaporuBase` + 5 alt sınıf, `IsletmeModelleri.cs` — 5 SCADA entity)
- `../BOTC/BOT.Services/{QueryService,DataSourceService}.cs`
- `../BOTC/BOT/appsettings.json` (yalnızca anahtar adları, `grep -oE` ile — değerler okunmadı)
- `../BOTC/DISCOVERY.md` (R-012, Q-007, D-011 çapraz referans)
- `docs/migration/BOTC_TO_METNEX_MAPPING.md`, `BOTC_MIGRATION_ARCHITECTURE_DECISION.md`,
  `BOTC_MIGRATION_OPEN_QUESTIONS.md` (TASK-027.1 teslimatları — bu belge onları tamamlar)
