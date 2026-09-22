# BOTC → Metnex Migration Mapping

> **Durum: Discovery/mapping dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-1-botc-migration-mapping-ve-architecture-decision.md` (EPIC-004,
> Wave 0). Bu belge yalnızca BOTC kaynak koduna (`../BOTC`) ve `../BOTC/DISCOVERY.md` +
> `docs/requirements/DISCOVERY.md`/`SRS.md`'ye dayanır; gerçek secret/parola/connection string
> değeri içermez.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)
**Kaynak inceleme yöntemi:** `../BOTC` kaynak kodu (BOT/BOT.Data/BOT.Domain/BOT.Services)
doğrudan okundu — DbContext sınıfları, domain entity'leri, servis katmanı ve `appsettings.json`
**anahtar adları** (değerler değil) incelendi. **SQL Server'a bu ortamdan erişim yoktur** —
gerçek satır sayıları, tablo içerikleri veya şema doğrulaması yapılamamıştır; bu belgedeki tüm
tablo/kolon bilgileri kaynak kod (`DbSet`/`[Table]`/entity property'leri) ve
`../BOTC/DISCOVERY.md`'den alınmıştır.

---

## 1. Database Sınıflandırması

BOTC tek bir SQL Server örneğinde (`../BOTC/DISCOVERY.md` §2.3: `192.168.66.6,1433`) 9 veritabanı
kullanır. Aşağıdaki sınıflandırma kaynak kod (`BOT.Data/*.cs` DbContext'leri,
`BOT/appsettings.json` `ConnectionStrings`/`DynamicDataSources` anahtar adları) ve Discovery
§2.3/§3.2'ye dayanır.

| Veritabanı | Kategori | Erişim mekanizması (kaynak kod) | Metnex durumu |
|---|---|---|---|
| `BOT_APP` | **BOT_APP** — kullanıcı/rol/permission/uygulama domain verisi | `BotDbContext` (scoped EF Core) — `Tickets`, `Users`, `Roles`, `Permissions`, `UserPermissions`, `MaintenanceRecords`, `VisibilitySettings` + SCADA endeks tabloları (bkz. §3) | **Migrate** (kimlik/permission kısmı Wave 1; Ticket/MaintenanceRecord Wave 2 kapsam dışı) |
| `DOF_APP` | **DÖF database'i** | `DofDbContext` (`IDbContextFactory`) — `Users` (`DofUser`, `BOT_APP.Users`'dan **ayrı**, `BotUserId` FK ile senkronize), `DuzelticiFaaliyet` (`DofKaydi`), `Notifications` (`DofNotification`) | **Kapsam dışı** (Wave 3, bu programın kapsamında değil — D-007) |
| `VARDIYA_RAPORLARI` | **Vardiya database'i** | `VardiyaDbContext` (`IDbContextFactory`) — `mosbio`, `mosbenerji`, `komurkazani`, `mosbiokirimdepo`, `vardiyamuhendisi` tabloları (hepsi `VardiyaRaporuBase`'den türer) | **Migration adayı** (Wave 4, henüz onaylanmadı) |
| `VARDIYA_RAPORLARI_ARSIV` | **Vardiya arşiv database'i** | `ArsivVardiyaDbContext` (`IDbContextFactory`) — aynı 5 tablo şeması, `Arsiv*` prefix'li entity'ler | **Migration adayı** (Wave 4, henüz onaylanmadı) |
| `MOSBIO_RAPORLAR` | **SCADA/İşletme (MOSBİO)** | `DynamicDataSources` üzerinden `Microsoft.Data.SqlClient` ile dinamik sorgu (`QueryService`); `MosbioEndeks` entity'si `BotDbContext`/`DofDbContext` içinde de tanımlı (`endeksler` tablosu) | **Read-only** (Wave 5 önceliği) |
| `MOSBIO_TELEGRAM` | **Diğer/belirsiz** | Discovery'de yalnızca isim geçiyor; kod tabanında bu veritabanına özel bir DbContext/DbSet bulunamadı (Telegram bildirimi kod tarafında `TelegramOptions`/`TelegramService` ile HTTP API üzerinden çalışıyor, ayrı bir DB bağlantısı değil) | **Açık soru** — bkz. `BOTC_MIGRATION_OPEN_QUESTIONS.md` Q-M01 |
| `MOSB ENERJİ DB` | **SCADA/İşletme (MOSB Enerji)** | `DynamicDataSources`; `GtEndeks`/`SgEndeks` entity'leri (`GT_ENDEKS`/`SG_ENDEKS` tabloları, `IsletmeModelleri.cs`) bu kaynağa karşılık geliyor olabilir | **Read-only** (Wave 5 önceliği) |
| `KOMUR_RAPORLAR` | **SCADA/İşletme (Kömür Kazanı)** | `DynamicDataSources`; `KomurEndeks` entity'si (`IsletmeModelleri.cs`) | **Read-only** (Wave 5 önceliği) |
| `MOSEDAS` | **SCADA/İşletme (MOSEDAŞ)** | `DynamicDataSources` üzerinden; kod tabanında MOSEDAŞ'a özel bir entity/DbSet **bulunamadı** — bu veritabanı yalnızca Discovery §2.3'te isim olarak geçiyor | **Read-only (varsayılan sınıflandırma) — açık soru** — bkz. Q-M02 |

**DÖF ve Bakım/Arıza (`DOF_APP`, `BOT_APP.Tickets`/`MaintenanceRecords`) bu raporda açıkça
kapsam dışı işaretlenmiştir** (Wave 2/Wave 3, `docs/requirements/DISCOVERY.md` §4.2 ve §11.3/§11.4,
D-007 kararı).

---

## 2. Entity / Table Mapping

Yalnızca **migrate edilecek** (Wave 1 — kimlik) ve **read-only** (Wave 5 — SCADA/İşletme, öncelikli)
alanlar için hedef sahiplik belirtilmiştir. Wave 2/Wave 3 (Ticket, MaintenanceRecord, DÖF) ve Wave 4
(Vardiya) adayları tabloya dahil edilmiş ama **implementation kararı bu task'ta verilmemiştir**.

### 2.1 Kimlik / Kullanıcı (Wave 1 — sıradaki implementation)

| Kaynak (BOTC) | Kaynak alanları (gerçek entity property'leri) | Hedef Metnex modülü | Veri sahibi | Karar |
|---|---|---|---|---|
| `BOT_APP.Users` (`User.cs`) | `Id`, `Username`, `PasswordHash`, `FullName`, `IsActive`, `RoleId`, `Sirket`, `Email`, `CreatedDate`, `IsEmailVerified`, `VerificationCode`, `IsMaintenanceMember`, `IsElectricMember`, `IsMechanicMember`, `CanBeDofResponsible` | `apps/api/src/platform` — Metnex `users` tablosu | PostgreSQL | **Migrate** (yalnızca kimlik alanları: `Username`→`email`/login-id adayı, `FullName`, `IsActive`, `Email`, `IsEmailVerified`, `CreatedDate`; `IsMaintenanceMember`/`IsElectricMember`/`IsMechanicMember`/`CanBeDofResponsible` Wave 2/3'e özel bayraklar — migrate **edilmez**, bkz. §5) |
| `BOT_APP.Roles` (`Role.cs`) | `Id`, `Name`, `Description` | Metnex `system_roles`/`tenant_roles` | PostgreSQL | **Migrate (dönüştürülerek)** — BOTC'nin tek "özel" rolü `Admin` (kod içinde hardcoded, `AuthService` tüm `Permissions`'ı otomatik verir); bu örüntü Metnex'in **kanonik permission formatına** dönüştürülmeli, `Admin` adı birebir taşınmamalı |
| `BOT_APP.Permissions` (`Permission.cs`) | `Id`, `PermissionName` (unique), `Description` | Metnex permission kayıtları | PostgreSQL | **Migrate (dönüştürülerek)** — 16 adet `Can*` permission (bkz. §2.2) Metnex'in `MODULE:RESOURCE:ACTION` formatına eşlenecek (örnek eşleme öneriliyor, kesin isimler henüz onaylanmadı — açık soru Q-M03) |
| `BOT_APP.UserPermissions` (`UserPermission.cs`) | `Id`, `UserId`, `PermissionId` (ara tablo, `(UserId, PermissionId)` unique index) | Metnex kullanıcı-rol/permission atama tabloları | PostgreSQL | **Migrate (dönüştürülerek)** — BOTC'de kullanıcıya izinler **tek tek elle** atanıyor (rol bazlı varsayılan şablon yok, Discovery §7.5 T-001); Metnex'e geçişte rol→permission-set modeline mi, yoksa birebir kullanıcı-permission atamasına mı geçileceği açık soru (Q-M04) |

### 2.2 Permission Adı Eşleme Önerisi (kesinleşmemiş, karar Product Owner'a ait)

BOTC'nin 16 `Can*` izni (`../BOTC/DISCOVERY.md` §5.2) ile Metnex SRS'te örnek olarak verilen
permission formatı (`docs/requirements/SRS.md`, `docs/requirements/DISCOVERY.md` §5.1:
`SCADA:DASHBOARD:VIEW` tarzı) arasında **birebir zorunlu bir eşleme henüz onaylanmamıştır**.
Aşağıdaki tablo yalnızca **öneri** niteliğindedir:

| BOTC izni | Kapsam | Önerilen Metnex permission (taslak) | Wave |
|---|---|---|---|
| `CanCreateTicket` | Ticket oluşturma | — | Wave 2, kapsam dışı |
| `CanViewAllTickets` | Tüm ticket'ları görme | — | Wave 2, kapsam dışı |
| `CanViewOwnTickets` | Kendi ticket'larını görme | — | Wave 2, kapsam dışı |
| `CanViewReports` | Bakım raporları/dashboard | — | Wave 2, kapsam dışı |
| `CanCreateDof`, `CanCloseDof`, `CanApproveDof`, `CanViewDof`, `CanViewAllDof` | DÖF yaşam döngüsü | — | Wave 3, kapsam dışı |
| `CanManageShifts` | Vardiya rapor girme/güncelleme | `SHIFT:REPORT:UPDATE` (SRS örneği) | Wave 4, aday |
| `CanViewShiftReports` | Vardiya rapor listeleme | `SHIFT:REPORT:VIEW` (SRS örneği) | Wave 4, aday |
| `CanReceiveShiftReportEmail` | Vardiya e-posta bildirimi | Metnex notification/subscription modeli — permission değil, bildirim tercihi olabilir | Wave 4, aday |
| `CanViewDynamicDashboard` | Dinamik Dashboard (sorgu oluşturucu) | `SCADA:DASHBOARD:VIEW` (SRS örneği) | **Wave 5, öncelikli** |
| `CanViewHourlyReport` | Saatlik Tüketim Analizi | `REPORT:HOURLY_CONSUMPTION:VIEW` (SRS örneği) | **Wave 5, öncelikli** |
| `CanViewPlantReports` | İşletme Raporları | `REPORT:PLANT:VIEW` (SRS örneği) | **Wave 5, öncelikli** |
| `CanAccessSystemTools` | Sistem Araçları (aktif oturum, veri kaynağı yönetimi) | Metnex platform admin permission alanı (`SYSTEM_ADMIN` kapsamı) | Wave 1 (admin ekranları) |
| `CanManageUsers` | Kullanıcı yönetimi | Metnex `TENANT_ADMIN`/`SYSTEM_ADMIN` kapsamındaki mevcut kullanıcı yönetim permission'ları | Wave 1 |

**Ek kullanıcı bayrakları** (`IsElectricMember`, `IsMechanicMember`, `IsMaintenanceMember`,
`CanBeDofResponsible`) BOTC'de `Users` tablosunda **permission değil, düz alan** olarak
tutuluyor; bunların tamamı Wave 2/3'e (Ticket/DÖF) özeldir — Wave 1 migration'ına dahil
**edilmemelidir**.

### 2.3 SCADA/İşletme — Read-only (Wave 5 — öncelikli aday)

| Kaynak entity (`.cs`) | Kaynak tablo | Kaynak kolonlar (gerçek property'ler) | Muhtemel BOTC database | Hedef Metnex modülü | Veri sahibi | Karar |
|---|---|---|---|---|---|---|
| `GtEndeks` | (tablo adı kod içinde `ToTable` ile ayrıca belirtilmemiş, `DbSet<GtEndeks> GtEndeksler`) | `KAYIT_TARIHI` (Key), `KAYIT_SAATI`, `GT{1,2,3}_ELEKTRIK_URETIM_KWH`, `GT{1,2,3}_DOGALGAZ_TUKETIM_SM3`, `GT{1,2,3}_BUHAR_URETIM_TON` | `MOSB ENERJİ DB` (varsayım — Discovery §2.3 eşlemesi net değil) | Metnex SCADA read-only adapter + Reporting Foundation dataset | SQL Server (read-only) | **Read-only** — Metnex PostgreSQL'e **kopyalanmaz**, canlı/periyodik okunur (mekanizma Q-M05'te açık) |
| `SgEndeks` | `DbSet<SgEndeks> SgEndeksler` | `KAYIT_TARIHI` (Key), `KAYIT_SAATI`, `SG50_{1,2,3}_ELEKTRIK_URETIM_KWH`, `SG50_{1,2,3}_DOGALGAZ_TUKETIM_SM3`, `SG50_{1,2,3}_BUHAR_URETIM_TON` | `MOSB ENERJİ DB` (varsayım) | aynı | SQL Server (read-only) | **Read-only** |
| `KomurEndeks` | `DbSet<KomurEndeks> KomurEndeksler` | `KAYIT_TARIHI` (Key), `KAYIT_SAATI`, `KK1_BUHAR_DN250_TON`, `KK2_BUHAR_DN150_TON`, `KK1_KOMUR_TUK_TON`, `KK2_KOMUR_TUK_TON`, `SICAK_SU_BUHAR_TUK_TON`, `DEGAZOR_BUHAR_TUK_TON` | `KOMUR_RAPORLAR` (varsayım) | aynı | SQL Server (read-only) | **Read-only** |
| `MosbioEndeks` | `DbSet<MosbioEndeks>` (adı `BotDbContext`'te `MosbioEndeksler`, `DofDbContext`'te `Endeksler`, tablo adı muhtemelen `endeksler` — `QueryService.RunQueryAsync`'te özel işlem görüyor) | `KayitTarihi` (Key), `KayitSaati`, `Bar13BuharTedari_ton`, `Turbin{1,2}_Enerji_kWh`, `IcIhtiyacTrafo{1,2}_kWh`, `AnaBuharM1` | `MOSBIO_RAPORLAR` (varsayım) | aynı | SQL Server (read-only) | **Read-only** |
| `VardiyaPerformans` | `DbSet<VardiyaPerformans>` | `Tarih` (Key), `Vardiya_Saat_Araligi`, `MusteriVanaAclik_Yuzde_Toplam`, `MusteriVanaAcik_Suresi_Sn` | Belirsiz — `appsettings.json` `DynamicDataSources`'ta ayrı bir `VardiyaPerformans` anahtarı var | Metnex SCADA read-only adapter | SQL Server (read-only) | **Read-only** |
| `DynamicDataSources` genel mekanizması (`QueryService`, `DataSourceService`) | `appsettings.json` → `DynamicDataSources[]` (isim listesi: en az `endeksler`, `gt_endeksler`, `komur_endeksler`, `sg_endeksler`, `Saatlik_Ort_Veriler`, `MUSTERI_CEKIS_SAATLIK`, `VardiyaPerformans` — anahtar adları kod/config'ten doğrulandı, değerler görülmedi) | Tüm SCADA/işletme kaynakları | Metnex read-only SQL Server adapter + backend allowlist (SEC-DATA-002) | SQL Server (read-only) | **Read-only, güvenlik modeli değişecek** — BOTC'nin mevcut doğrulaması `INFORMATION_SCHEMA` üzerinden **var mı yok mu** kontrolüdür (dinamik varlık kontrolü), Metnex'in hedefi **admin-küratörlü sabit allowlist**'tir (bkz. `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` §4) — bu bir güvenlik **yükseltmesi**, birebir taşıma değil |

**Not — `MOSEDAS` ve `MOSBIO_TELEGRAM`:** Bu iki veritabanı için kod tabanında (BOT.Domain/BOT.Data)
özel bir entity/DbContext bulunamadı; yalnızca Discovery §2.3'teki isim listesinde geçiyorlar.
`MOSEDAS`'ın `DynamicDataSources` üzerinden dinamik sorgu ile erişilen bir kaynak olduğu
**varsayılıyor** (aynı mekanizma diğer SCADA kaynakları için doğrulandı) ama kesinleştirilmemiştir
— açık soru Q-M02. `MOSBIO_TELEGRAM`'ın gerçekten bir SQL Server veritabanı mı yoksa isimlendirme
karışıklığı mı olduğu (Telegram entegrasyonu kod tarafında HTTP API'dir, DB değil) açık soru Q-M01.

### 2.4 Vardiya Raporlama — Wave 4 adayı (implementation kararı bu task'ta verilmedi)

| Kaynak entity | Kaynak tablo | Ortak alanlar (`VardiyaRaporuBase`) | Lokasyon | Hedef Metnex modülü (aday) | Karar |
|---|---|---|---|---|---|
| `MosbioRapor` | `mosbio` | `Id`, `Vardiya`, `OperatorBotUserId`, `OperatorTamAdi`, `Operator2TamAdi`, `KayitTarihi`, `RaporNotlari`, `IsCompleted` | MOSBİO | Metnex domain modülü (Wave 4) | **Aday — implementation onayı bekleniyor** |
| `MosbEnerjiRapor` | `mosbenerji` | (aynı temel alanlar) | MOSB Enerji | aynı | **Aday** |
| `KomurKazaniRapor` | `komurkazani` | (aynı) | Kömür Kazanı | aynı | **Aday** |
| `MosbioKirimDepoRapor` | `mosbiokirimdepo` | (aynı) | MOSBİO Kırım-Depo | aynı | **Aday** |
| `VardiyaMuhendisiRapor` | `vardiyamuhendisi` | (aynı) | Santral (mühendis vardiyası) | aynı | **Aday** |
| `Arsiv*` (5 karşılık gelen entity) | Aynı 5 tablo, `VARDIYA_RAPORLARI_ARSIV` DB'sinde | Aynı şema (`ArsivVardiyaRaporuBase`) | Aynı 5 lokasyon | PostgreSQL archive/read model (aday) | **Aday** |

### 2.5 Kapsam dışı bırakılan alanlar (Wave 2/Wave 3, D-007)

| Kaynak entity | Kaynak tablo | Database | Neden kapsam dışı |
|---|---|---|---|
| `Ticket` | `Tickets` | `BOT_APP` | Wave 2 (Bakım/Arıza) — `docs/requirements/DISCOVERY.md` §4.2, §11.3 |
| `MaintenanceRecord` | `MaintenanceRecords` | `BOT_APP` | Wave 2 — aynı gerekçe |
| `FaultRecord` | (migration'da tablo var, `BotDbContext`'te `DbSet` **yok** — Discovery R-012'de "ölü kod olma ihtimali yüksek" olarak işaretli) | `BOT_APP` | Wave 2 kapsamı + potansiyel ölü kod, doğrulama gerektirir |
| `DofUser`, `DofKaydi`, `DofNotification` | `Users` (DOF_APP'e özel), `DuzelticiFaaliyet`, `Notifications` | `DOF_APP` | Wave 3 (DÖF) — D-007 |
| `VisibilitySetting` | `VisibilitySettings` | `BOT_APP` | BOTC'ye özel bir UI-görünürlük mekanizması; Metnex'in permission/data-scope modeliyle **doğrudan taşınmaz**, Wave 5 backend allowlist tasarımı bunun yerini alır (bkz. mimari karar dokümanı §4) |

---

## 3. Tenant / Scope Mapping

`docs/requirements/DISCOVERY.md` §2.3 ve §7.1 (D-005, D-006) ile birebir uyumlu:

```text
MİP customer root tenant
├── MOSB tenant       → BOTC "MOSB Enerji" verilerine karşılık gelir (GtEndeks/SgEndeks, muhtemelen MOSB ENERJİ DB)
├── MOSEDAŞ tenant     → BOTC "MOSEDAS" veritabanına karşılık gelir (kaynak entity doğrulanmadı — Q-M02)
└── MOSBİO tenant      → BOTC "MOSBIO_RAPORLAR" verilerine karşılık gelir (MosbioEndeks)
```

Kurallar (Discovery §2.3'ten, değiştirilmeden aktarılmıştır):

- MOSB, MOSEDAŞ ve MOSBİO yalnızca kendi tenant kapsamlarındaki SCADA/DMS verilerini görür.
- MİP root tenant, yetkili kullanıcılar için bağlı işletmelerin **aggregate** analizlerini
  görebilir (permission + `canAggregateChildren` + data scope birlikte değerlendirilir).
- Bir işletme tenant'ı **varsayılan olarak** diğer işletmelerin verisini göremez.
- Kullanıcıdan gelen tenant/database/schema/table seçimi **tek başına güvenlik kararı değildir**
  (SRS FR-015, SEC-DATA-001/002) — data scope backend'de çözülür.

**BOTC'de tenant kavramı yoktur** — BOTC tek şirket (MOSB Enerji/MOSBİO) için tasarlanmış tek-tenant
bir masaüstü uygulamasıdır; `Sirket` alanı (`User.Sirket`, `DofUser.Sirket`) serbest metin bir
alandır, yapısal bir tenant/işletme ayrımı **değildir**. Kömür Kazanı, GT/SG50, Santral gibi
"lokasyon" kavramları (vardiya tablolarında görülen) muhtemelen **tenant içi alt-lokasyon**
olarak modellenmelidir, ayrı tenant olarak değil — bu netleştirilmesi gereken bir açık sorudur
(Q-M06).

---

## 4. ID / FK Mapping İlkeleri

BOTC'nin tüm entity'leri `int` (identity/auto-increment) birincil anahtar kullanır (`User.Id`,
`Role.Id`, `Permission.Id`, `Ticket.Id`, `DofKaydi.ID`, vb. — istisna: SCADA endeks tabloları
`DateTime` alanını `[Key]` olarak kullanır, örn. `GtEndeks.KAYIT_TARIHI`). Metnex PostgreSQL
tarafı UUID/serial birincil anahtar kullanır (mevcut şema, `docs/domain/DOMAIN_MODEL.md`).

- Her migrate edilen tablo için **`legacy_id` (BOTC `int` Id) → Metnex `id` (UUID)** eşleme
  tablosu tutulmalıdır (kesin mekanizma açık soru, bkz. mimari karar dokümanı §5).
- Foreign key ilişkileri (`User.RoleId`, `UserPermission.UserId`/`PermissionId`,
  `DofUser.BotUserId` [DOF_APP→BOT_APP çapraz-DB FK, EF Core ile **değil** elle senkronize
  ediliyor — `AuthService.LoginAsync` içinde görülüyor]) migration sırasında bu mapping
  tablosu üzerinden çözülmelidir.
- SCADA endeks tablolarının `DateTime` birincil anahtarı Metnex tarafında **satır kimliği**
  olarak taşınmaz (read-only erişimde birincil anahtar kavramı SQL Server tarafında kalır).

---

## 5. Migration Önceliği (özet)

| Öncelik | Alan | Wave | Gerekçe |
|---|---|---|---|
| 1 | Kimlik/kullanıcı/rol/permission (yalnızca kimlik alanları) | Wave 1 | SRS §6.1: Wave 5 implementasyonundan önce zorunlu ön koşul |
| 2 (paralel/sonrasında) | SCADA/DMS read-only adapter (GtEndeks/SgEndeks/KomurEndeks/MosbioEndeks/VardiyaPerformans + genel `DynamicDataSources` mekanizması) | Wave 5 | "Metnex'in ilk ana iş modülü" (Discovery §11.6) |
| Aday, onay bekliyor | Vardiya raporlama + arşiv | Wave 4 | Discovery §11.5: "kapsam ve öncelik ayrıca kesinleştirilecektir" |
| Kapsam dışı | Ticket/MaintenanceRecord/FaultRecord | Wave 2 | D-007 |
| Kapsam dışı | DÖF (DofUser/DofKaydi/DofNotification) | Wave 3 | D-007 |

---

## 6. Açık Sorular (özet — tam liste `BOTC_MIGRATION_OPEN_QUESTIONS.md`)

Bu mapping dokümanında işaretlenen ve ayrı belgede detaylandırılan sorular: **Q-M01**
(`MOSBIO_TELEGRAM` gerçekten bir veritabanı mı), **Q-M02** (`MOSEDAS` kaynak entity/tablo
doğrulaması), **Q-M03** (BOTC `Can*` → Metnex permission adı birebir kesinleştirmesi), **Q-M04**
(rol-bazlı varsayılan permission şablonu mı, birebir kullanıcı ataması mı), **Q-M05** (SCADA
verisi canlı mı sorgulanacak yoksa PostgreSQL read-model/cache mi — SRS Q-008 ile aynı soru),
**Q-M06** (Kömür Kazanı/GT/SG50/Santral "lokasyon" kavramının tenant-içi modeli).
