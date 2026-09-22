# BOTC SCADA/DMS Source Mapping

> **Durum: Discovery/mapping dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-5-scada-dms-source-mapping.md` (EPIC-004, Wave 0, bağımlılık:
> TASK-027.4 — done). Bu belge `BOTC_TO_METNEX_MAPPING.md` §2.3 (SCADA/İşletme — özet düzey),
> `BOTC_ENTITY_DOMAIN_MAPPING.md` §3 (servis-davranışı düzeyi) ve
> `BOTC_MIP_TENANT_LOCATION_MAPPING.md`'yi (tenant/lokasyon ilkeleri) **tamamlar, tekrar etmez**.
> Bu belgenin odağı: 7 `DynamicDataSources` anahtarının ve 5 SCADA entity'sinin **kaynak kod
> kanıtıyla** tenant/işletme/lokasyon eşlemesi — önceki task'larda "varsayım" olarak işaretli
> bazı noktalar bu task'ta **yeni bulunan doğrudan kod kanıtıyla** güçlendirilmiştir (bkz. §2).

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

`../BOTC` kaynak kodu, önceki task'ların ötesinde şu dosyalar **yeniden ve derinlemesine**
tarandı:

- `BOT.Services/{DataSourceService,QueryService}.cs` — `DynamicDataSources` anahtarlarının
  okunma/kullanılma mekanizması (zaten `BOTC_ENTITY_DOMAIN_MAPPING.md` §3'te belgelenmişti, bu
  task'ta tenant-eşleme açısından yeniden değerlendirildi).
- `BOT.Domain/IsletmeModelleri.cs` — 5 SCADA entity'sinin tam alan listesi.
- `BOT.Data/{BotDbContext,DofDbContext}.cs` — SCADA `DbSet` tanımları ve (Q-S04 ile ilişkili)
  `DofDbContext`'teki kopya `DbSet`'lerin gerçekten hiçbir serviste kullanılmadığı **ayrı bir
  `grep` ile** teyit edildi.
- **`BOT/IsletmeRaporlariWindow.xaml.cs` — bu task'ta ilk kez taranan, kritik yeni kanıt içeren
  dosya** (bkz. §2): SCADA entity'lerinin `FromSqlRaw` ile **üç parçalı veritabanı adı**
  (`DATABASE.dbo.table`) kullanılarak doğrudan `BotDbContext`'in kendi SQL Server bağlantısı
  üzerinden **çapraz-veritabanı** sorgulandığı bulundu.
- `BOT/HourlyConsumptionWindow.xaml.cs` — `Saatlik_Ort_Veriler`/`MUSTERI_CEKIS_SAATLIK`/
  `VardiyaPerformans` anahtarlarının genel `DynamicDataSources` akışında nasıl ele alındığı
  doğrulandı (fiziksel DB kanıtı **bulunamadı**, bkz. §1.2).
- `BOT/DataSourceManagementWindow.xaml.cs` — `VisibilitySettings` ile `DynamicDataSources`
  listesinin admin ekranındaki ilişkisi (zaten `BOTC_ENTITY_DOMAIN_MAPPING.md` §3'te
  belgelenmişti).
- Metnex tarafında `apps/api/src/tenant-scope/tenant-scope.service.ts`,
  `apps/api/src/reporting/dataset/report-dataset.contract.ts` **gerçek kod** olarak referans
  alındı — var olmayan bir mekanizma icat edilmedi.

**`appsettings.json`'daki gerçek `ConnectionString` değerleri bu task'ta da okunmadı/kopyalanmadı**
— yalnızca anahtar adları ve `FromSqlRaw` string literal'leri (kod içinde sabit yazılı, secret
içermeyen üç-parçalı tablo adları) incelendi. **SQL Server'a bu ortamdan erişim yoktur** — bu
belgedeki hiçbir satır canlı veri/şema doğrulaması içermez; `FromSqlRaw` bulguları **[KOD]**
(kaynak kodda doğrudan yazılı literal) olarak işaretlenmiştir, **canlı doğrulama değildir**.

---

## 1. Yedi `DynamicDataSources` Anahtarı — Eksiksiz Liste ve Kod Kullanımı

### 1.1 Anahtar Listesi (`appsettings.json` → `DynamicDataSources[].Name`, yalnızca isimler)

`BOT.Services/DataSourceService.cs` bu listeyi `config.GetSection("DynamicDataSources").
Get<List<DataSourceOption>>()` ile okur; her `DataSourceOption` yalnızca `Name` + şifrelenmiş
`ConnectionString` içerir (`ConfigProtector.Decrypt` ile çözülür — sabit gömülü anahtar,
`BOTC_ENTITY_DOMAIN_MAPPING.md` §5'te zaten "taşınmaz" işaretli).

| # | Anahtar adı | Kod içinde geçtiği yer | Entity/tablo karşılığı |
|---|---|---|---|
| 1 | `endeksler` | `QueryService.cs:171` (`RunQueryAsync`'te özel kolon seçimi: `[RaporID],[KayitTarihi],[KayitSaati]`), `QueryService.cs:31` (`_translationMap`) | `MosbioEndeks` (bkz. §2 — `MOSBIO_RAPORLAR.dbo.endeksler`) |
| 2 | `gt_endeksler` | `DataSourceService` üzerinden genel akış, `QueryService`'te özel işlem yok | `GtEndeks` (bkz. §2 — `MOSEDAS.dbo.gt_endeksler`) |
| 3 | `komur_endeksler` | Aynı, genel akış | `KomurEndeks` (bkz. §2 — `MOSEDAS.dbo.komur_endeksler`) |
| 4 | `sg_endeksler` | Aynı, genel akış | `SgEndeks` (bkz. §2 — `MOSEDAS.dbo.sg_endeksler`) |
| 5 | `Saatlik_Ort_Veriler` | `HourlyConsumptionWindow.xaml.cs:170` — `GetDefaultValueTypeForTable`'da "Gerçek Değer" tipi olarak özel işaretleniyor | Yok — `BOT.Domain`'de karşılık gelen bir entity/`DbSet` **bulunamadı**, fiziksel DB kanıtı yok |
| 6 | `MUSTERI_CEKIS_SAATLIK` | `HourlyConsumptionWindow.xaml.cs:171` — aynı "Gerçek Değer" işaretlemesi | Yok — aynı durum |
| 7 | `VardiyaPerformans` | `HourlyConsumptionWindow.xaml.cs:172` (genel akış) **+ `IsletmeRaporlariWindow.xaml.cs:373`** (`FromSqlRaw` ile doğrudan) | `VardiyaPerformans` entity'si (bkz. §2 — `MOSBIO_TELEGRAM.dbo.VardiyaPerformans`) |

**Kabul kriteri #1 karşılandı:** 7 anahtarın tamamı yukarıda listelenmiştir, hiçbiri atlanmamıştır.

### 1.2 `Saatlik_Ort_Veriler` / `MUSTERI_CEKIS_SAATLIK` — Fiziksel Kaynak Doğrulanamadı

Bu iki anahtar için `BOT.Domain` altında **hiçbir karşılık gelen entity/`DbSet` yoktur** ve
`IsletmeRaporlariWindow.xaml.cs`'deki `FromSqlRaw` deseninde de (§2) bu iki anahtar **geçmiyor**.
Kod tabanında yalnızca `HourlyConsumptionWindow`'un genel `QueryService.GetTablesAsync`/
`RunQueryAsync` akışı üzerinden (dinamik `INFORMATION_SCHEMA` keşfiyle) erişildiği görülüyor —
hangi fiziksel veritabanına bağlandıkları **[DOĞRULANAMADI]** (Q-S03 kapsamında kalmaya devam
ediyor, bu iki anahtar için **yeni kanıt bulunamadı**).

---

## 2. Kritik Yeni Bulgu — Çapraz-Veritabanı `FromSqlRaw` Erişim Yolu

`IsletmeRaporlariWindow.xaml.cs:369-373`, `BotDbContext`'in **kendi** (`BOT_APP`'e bağlı) SQL
Server bağlantısını kullanarak **üç parçalı veritabanı adıyla** (`DATABASE.dbo.table`) doğrudan
`FromSqlRaw` sorguları çalıştırıyor — bu, `DynamicDataSources`/`DataSourceService` mekanizmasından
**tamamen ayrı, ikinci bir erişim yoludur**:

```csharp
// _db burada BotDbContext'tir (satır 27, 107) — DynamicDataSources DEĞİL
var gtRaw = await _db.Set<GtEndeks>().FromSqlRaw("SELECT * FROM MOSEDAS.dbo.gt_endeksler")...
var sgRaw = await _db.Set<SgEndeks>().FromSqlRaw("SELECT * FROM MOSEDAS.dbo.sg_endeksler")...
var kkRaw = await _db.Set<KomurEndeks>().FromSqlRaw("SELECT * FROM MOSEDAS.dbo.komur_endeksler")...
var mosbioRaw = await _db.Set<MosbioEndeks>().FromSqlRaw("SELECT * FROM MOSBIO_RAPORLAR.dbo.endeksler")...
var vardiyaRaw = await _db.Set<VardiyaPerformans>().FromSqlRaw("SELECT * FROM MOSBIO_TELEGRAM.dbo.VardiyaPerformans")...
```

### 2.1 Bu Bulgunun Sonuçları

| Sonuç | Açıklama |
|---|---|
| **Q-M01 kısmen çözüldü** | `MOSBIO_TELEGRAM` **gerçekten bir SQL Server veritabanıdır** ve içinde en az bir tablo (`VardiyaPerformans`) vardır — Discovery'nin yalnızca isim listesinde geçtiği, kod tabanında karşılık bulunamadığı iddiası artık **kısmen yanlıştır**. Q-M01 tam kapanmadı çünkü `MOSBIO_TELEGRAM`'ın Telegram bildirimiyle ilişkisi hâlâ açıklanmadı — yalnızca "gerçek bir DB mi" sorusu cevaplandı. |
| **`GtEndeks`/`SgEndeks`/`KomurEndeks` → `MOSEDAS` (güçlü [KOD] kanıtı, önceki "MOSB ENERJİ DB" varsayımını düzeltir** | `BOTC_TO_METNEX_MAPPING.md` §2.3, bu 3 entity'yi "`MOSB ENERJİ DB` (varsayım — Discovery §2.3 eşlemesi net değil)" olarak işaretlemişti. Bu task, doğrudan kod kanıtıyla (`FromSqlRaw` literal string) bu 3 entity'nin fiziksel olarak **`MOSEDAS`** veritabanında olduğunu gösteriyor. Bu, önceki dokümanın **düzeltilmesi gereken bir varsayımıydı** — ancak bu belge o dokümanı geriye dönük değiştirmez (append-only ilke), yalnızca burada **doğru kanıtı** sunar ve §4'te tenant eşlemesini buna göre yeniden değerlendirir. |
| **`MosbioEndeks` → `MOSBIO_RAPORLAR` (teyit edildi)** | Önceki "varsayım" durumundan **[KOD] kanıtlı** duruma yükseldi. |
| **`VardiyaPerformans` → `MOSBIO_TELEGRAM` (yeni, önceden hiç bilinmiyordu)** | Önceki dokümanlarda "Belirsiz" olarak işaretliydi; artık somut kod kanıtı var. |
| **İki bağımsız erişim mekanizması tespit edildi** | (A) `DynamicDataSources` + `QueryService` (dinamik `INFORMATION_SCHEMA` keşfi, admin-yapılandırılabilir) ve (B) `IsletmeRaporlariWindow`'a özel, **hardcoded** çapraz-veritabanı `FromSqlRaw`. Bu iki mekanizmanın **aynı verilere** (GT/SG/Kömür/Mosbio endeksleri) farklı yollardan eriştiği, tutarlılıklarının doğrulanmadığı görülüyor — yeni açık soru **Q-SC02**. |
| **`BOT_APP` SQL Server login'inin çapraz-DB erişimi olduğu ima ediliyor** | `FromSqlRaw`'ın çalışabilmesi için `BOT_APP` bağlantısında kullanılan SQL login'in `MOSEDAS`/`MOSBIO_RAPORLAR`/`MOSBIO_TELEGRAM`'a en azından `SELECT` yetkisi olması gerekir — bu, Metnex'in "admin-küratörlü sabit allowlist" hedefiyle **doğrudan çelişen** bir geniş-yetkili tek-login modelidir (mimari karar dokümanı §4/§6'daki güvenlik bulgularını **güçlendirir**, yeni bir taşınmazlık maddesi değildir, aynı kategoridedir). |

---

## 3. SCADA Entity'lerinin İşletme/Lokasyon Sınıflandırması

| Entity | Alanlar (`IsletmeModelleri.cs`) | Discovery §21.1 iş sınıflandırması | Fiziksel DB (§2, `[KOD]`) | Gerilim/not |
|---|---|---|---|---|
| `GtEndeks` | `KAYIT_TARIHI` (Key), `KAYIT_SAATI`, `GT{1,2,3}_ELEKTRIK_URETIM_KWH`, `GT{1,2,3}_DOGALGAZ_TUKETIM_SM3`, `GT{1,2,3}_BUHAR_URETIM_TON` | GT1-3: MOSB Enerji'nin doğalgaz→elektrik+buhar üretim üniteleri | `MOSEDAS.dbo.gt_endeksler` | **Gerilim:** iş sahipliği MOSB Enerji, fiziksel DB adı MOSEDAŞ'ı çağrıştırıyor — bkz. §4, Q-SC01 |
| `SgEndeks` | Aynı yapı, `SG50_{1,2,3}_*` | SG1-3: aynı, MOSB Enerji üretim üniteleri | `MOSEDAS.dbo.sg_endeksler` | Aynı gerilim |
| `KomurEndeks` | `KAYIT_TARIHI` (Key), `KAYIT_SAATI`, `KK{1,2}_BUHAR_*`, `KK{1,2}_KOMUR_TUK_TON`, `SICAK_SU_BUHAR_TUK_TON`, `DEGAZOR_BUHAR_TUK_TON` | Kömür Kazanı: MOSB Enerji'nin kömür→buhar üretim kaynağı (§21.1 tablosunda GT/SG ile birlikte) | `MOSEDAS.dbo.komur_endeksler` | Aynı gerilim |
| `MosbioEndeks` | `KayitTarihi` (Key), `KayitSaati`, `Bar13BuharTedari_ton`, `Turbin{1,2}_Enerji_kWh`, `IcIhtiyacTrafo{1,2}_kWh`, `AnaBuharM1` | MOSBİO: ayrı işletme, biyokütle→buhar/elektrik, gerektiğinde MOSB Enerji'ye buhar desteği | `MOSBIO_RAPORLAR.dbo.endeksler` | **Gerilim yok** — iş sahipliği (MOSBİO) ve fiziksel DB adı (`MOSBIO_RAPORLAR`) tutarlı |
| `VardiyaPerformans` | `Tarih` (Key), `Vardiya_Saat_Araligi`, `MusteriVanaAclik_Yuzde_Toplam`, `MusteriVanaAcik_Suresi_Sn` | Discovery'de doğrudan ele alınmamış; "müşteri vana açıklığı" ifadesi buhar dağıtımı/müşteri tüketimiyle ilişkili görünüyor | `MOSBIO_TELEGRAM.dbo.VardiyaPerformans` | **Belirsiz** — hem iş sahipliği hem `MOSBIO_TELEGRAM` adının anlamı netleşmemiş; Q-M01 ile ilişkili, tam çözülmedi |

---

## 4. Tenant Eşleme — Kanıtlı vs. Varsayımsal (Kabul Kriteri #3)

| Kaynak | MOSB | MOSEDAŞ | MOSBİO | Kesinlik derecesi |
|---|---|---|---|---|
| `GtEndeks`, `SgEndeks`, `KomurEndeks` | **İş sahipliği kanıtı** (Discovery §21.1: bu 3 kaynak MOSB Enerji'nin üretim varlıkları) | **Fiziksel DB adı kanıtı** (`MOSEDAS.dbo.*`, §2) | — | **Çelişkili kanıt — karar bekliyor.** İki kanıt kaynağı (iş süreci vs. veritabanı adı) farklı tenant'a işaret ediyor; hiçbiri diğerini geçersiz kılacak kadar güçlü değil. Kesin olarak yazılmıyor, bkz. **Q-SC01** |
| `MosbioEndeks` | — | — | **Hem iş sahipliği (Discovery §21.1) hem fiziksel DB adı (`MOSBIO_RAPORLAR`) aynı yönde** | **Yüksek güven — MOSBİO** olarak yazılabilir (iki bağımsız kanıt örtüşüyor) |
| `VardiyaPerformans` | — | — | — | **[DOĞRULANAMADI]** — `MOSBIO_TELEGRAM` adı MOSBİO'yu çağrıştırsa da, "Telegram" bileşeninin işlevi (bildirim mi, ayrı bir veri toplama sistemi mi) netleşmeden tenant ataması yapılamaz |
| `Saatlik_Ort_Veriler`, `MUSTERI_CEKIS_SAATLIK` | — | — | — | **[DOĞRULANAMADI]** — hiçbir fiziksel DB kanıtı yok (§1.2), tenant ataması yapılamaz |

**Not:** MOSEDAŞ'ın Discovery §21.1'de "enerji ticareti yapmaktadır" olarak tanımlanması,
GT/SG/Kömür Kazanı üretim verilerinin **ticaret/metering amacıyla** MOSEDAŞ'ın kendi veritabanında
tutulması ile **tutarlı bir açıklama olabilir** (üretim MOSB Enerji'nin, ama üretimin
faturalandığı/ticaretinin yapıldığı veri kümesi MOSEDAŞ'ta olabilir) — ancak bu **yorum**, kod
kanıtı **değildir**, bu nedenle kesin yazılmamıştır (kabul kriteri #3).

---

## 5. Tenant İçi Scope / Lokasyon İlişkisi

| Kaynak | Tenant içi granülerlik | Kanıt |
|---|---|---|
| `GtEndeks` | 3 ayrı ünite (GT1/GT2/GT3) **kolon bazında** aynı satırda tutuluyor (satır = tarih, kolonlar = ünite) — ayrı bir "ünite" boyutu/tablosu yok | `IsletmeModelleri.cs:10-18` |
| `SgEndeks` | Aynı desen, 3 ünite (SG50-1/2/3) | `IsletmeModelleri.cs:25-33` |
| `KomurEndeks` | 2 ünite (KK1/KK2) + ortak `SICAK_SU`/`DEGAZOR` alanları | `IsletmeModelleri.cs:40-45` |
| `MosbioEndeks` | 2 türbin (Turbin1/Turbin2) + 2 trafo, tek satırda | `IsletmeModelleri.cs:53-56` |
| `VardiyaPerformans` | Vardiya bazlı (`Vardiya_Saat_Araligi`), ünite/lokasyon ayrımı yok | `IsletmeModelleri.cs:63` |

**Sonuç:** BOTC'nin SCADA verisi ünite/ekipman bazında **ayrı satır/tablo değil, geniş (wide)
tek-tablo kolon** deseniyle tutuluyor. Metnex tarafında bu, tenant-içi bir "lokasyon/ünite" scope
boyutu (`BOTC_MIP_TENANT_LOCATION_MAPPING.md` §3'teki lokasyon tartışmasıyla aynı ilke) olarak mı
modelleneceği yoksa mevcut wide-tablo deseninin read-only adapter'da **olduğu gibi** mi
korunacağı **implementation kararıdır**, bu task'ta verilmemiştir.

---

## 6. Read-only / Permission / Audit / Root Aggregation Etkileri

| Konu | Bulgu | Metnex etkisi |
|---|---|---|
| **Read-only durumu** | Tüm 5 SCADA entity'si + `FromSqlRaw` sorguları yalnızca `SELECT` (`Where`/`ToListAsync`) — hiçbir `INSERT`/`UPDATE`/`DELETE` kod tabanında bulunamadı | Discovery §2.2 ("SQL Server SCADA/DMS veritabanlarına runtime erişim yalnızca read-only olacaktır") ile tutarlı; read-only kısıtı BOTC davranışıyla da **örtüşüyor**, yeni bir kısıtlama değil |
| **Permission ihtiyacı** | BOTC tarafında SCADA erişimi için ayrı bir permission kontrolü **servis seviyesinde yok** — yalnızca UI'da `CanViewDynamicDashboard`/`CanViewHourlyReport`/`CanViewPlantReports` permission'ları (BOTC_TO_METNEX_MAPPING.md §2.2) kontrol ediliyor, `QueryService`/`FromSqlRaw` çağrılarının kendisi yetkisiz çağrıya karşı **korumasız** | Metnex tarafında her SCADA read çağrısı `permission.guard.ts` + `TenantScopeService.resolve()`'dan geçmek **zorunda** kalmalı — BOTC'nin "yalnızca UI kontrol eder" modeli burada da taşınmaz (`BOTC_ENTITY_DOMAIN_MAPPING.md` §5 ile tutarlı) |
| **Audit gereksinimi** | BOTC'de SCADA sorgu erişimi için **hiçbir audit kaydı yok** (ne `QueryService.RunQueryAsync`'te ne `FromSqlRaw` çağrılarında log/audit çağrısı bulunamadı) | Discovery §20: "veri kaynağı yönetimi ve kritik konfigürasyon değişiklikleri audit edilebilir olmalıdır" — Metnex'in var olan `apps/api/src/audit` modülü Wave 5'te SCADA sorgu erişimine (kim, ne zaman, hangi kaynak/tablo) **uygulanmalı**, BOTC'nin audit'siz modeli miras alınmamalı |
| **Root tenant aggregation etkisi** | BOTC'de "root tenant" kavramı yok; tüm SCADA verisi tek uygulama örneğinden, ayrım olmadan erişiliyor | Metnex `TenantScopeService.resolve()` (`tenant-scope.service.ts:57-59`), `canAggregateChildren=true` olan MİP `ROOT` tenant için `dataScopeTenantIds`'i **tüm torun tenant'lara** (MOSB+MOSEDAŞ+MOSBİO) genişletir — SCADA adapter'ı bu listeyi kaynak seçiminde (hangi `DynamicDataSources`/DB'yi sorgulayacağını) kullanmalı; bu mekanizma zaten var, yalnızca SCADA'ya **henüz bağlanmadı** (implementation, Wave 5) |
| **Reporting dataset contract uyumu** | Metnex'in var olan `ReportDatasetProvider.loadDataset(tenantId, filters)` sözleşmesi (`report-dataset.contract.ts`) zaten **zorunlu `tenantId`** parametresi alıyor — SCADA provider'ı bu sözleşmeye uyarsa tenant-scope zorunluluğu otomatik sağlanır. Ancak mevcut `ReportDatasetRow` şekli (`no`/`label`/`occurredAt`/`status`/`quantity`/`unitPrice`/`amount`) finansal/rapor odaklı — SCADA'nın geniş (wide) zaman-serisi kolon yapısıyla (§5) **doğrudan uyumlu değil**, olası genişletme ihtiyacı **implementation kararıdır** (Q-SC03) |

---

## 7. PostgreSQL Migration Kararı — Kesinleştirilmedi

Bu task, SCADA/DMS kaynaklarının PostgreSQL'e migrate edilip edilmeyeceğini **kesinleştirmemiştir**
(görev kapsamı gereği). Mimari karar dokümanı (`BOTC_MIGRATION_ARCHITECTURE_DECISION.md` §4) ve
`BOTC_TO_METNEX_MAPPING.md` §2.3'teki "Read-only, PostgreSQL'e kopyalanmaz" kararı **korunmuştur**
— bu belge yalnızca hangi kaynağın hangi tenant'a/SQL Server DB'sine karşılık geldiğini
netleştirmiştir, veri taşıma yöntemi (canlı sorgu vs. periyodik read-model/cache) hâlâ **Q-M05**'e
bağlıdır (değiştirilmedi).

---

## 8. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu belge yalnızca SCADA/DMS kaynaklarını ele almıştır; Ticket/MaintenanceRecord/FaultRecord
(Wave 2) ve DÖF (Wave 3) için **hiçbir mapping veya implementation önerisi üretilmemiştir** —
bu kaynaklar SCADA ile ilişkisiz olduğu için bu task'ta hiç referans edilmemiştir (D-007 ile
tutarlı).

---

## 9. Yeni Açık Sorular

Mevcut **Q-S03** (`DynamicDataSources` anahtarlarının fiziksel DB eşlemesi) ve **Q-M06**
(lokasyon→tenant modeli) ile **Q-T01** (belirli lokasyonların tenant node'u mu veri alanı mı
olacağı) bu task'ta **kapatılmamış**, aksine §2/§3/§4'teki somut kod kanıtlarıyla
**güçlendirilmiştir**. Bunların ötesinde `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye
**3 yeni soru** (Q-SC serisi) **append** edildi:

- **Q-SC01** — `GtEndeks`/`SgEndeks`/`KomurEndeks` fiziksel olarak `MOSEDAS` veritabanında
  (`FromSqlRaw` kanıtı) ama Discovery §21.1 iş sınıflandırmasında MOSB Enerji'nin üretim
  varlıkları olarak listeleniyor. Bu veri MOSEDAŞ tenant'ına mı (DB sahipliği), MOSB tenant'ına mı
  (iş sahipliği) ait sayılacak, yoksa her iki tenant'ın da (farklı permission'larla) erişebileceği
  paylaşılan bir kaynak mı?
- **Q-SC02** — BOTC'de SCADA verisine **iki bağımsız erişim mekanizması** var (`DynamicDataSources`
  genel akışı ve `IsletmeRaporlariWindow`'a özel hardcoded `FromSqlRaw`). Wave 5 read-only
  adapter'ı hangisini temel alacak — ikisi aynı veriye mi erişiyor, yoksa aralarında fark var mı
  (canlı SQL Server erişimi olmadan doğrulanamaz)?
- **Q-SC03** — Metnex'in var olan `ReportDatasetProvider`/`ReportDatasetRow` sözleşmesi
  finansal/rapor odaklı bir satır şekli kullanıyor; SCADA'nın geniş (wide), zaman-serisi kolon
  yapısı bu sözleşmeye uydurulacak mı, yoksa SCADA için ayrı bir dataset sözleşmesi mi
  tanımlanacak?

Özet tablosuna 3 yeni satır eklendi, mevcut satırlar değiştirilmedi.

---

## 10. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 11. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmemiştir** — PostgreSQL migration/cache
  kararı (Q-M05), SCADA kaynak→tenant kesin eşlemesi (Q-S03, Q-SC01) ve erişim mekanizması
  netliği (Q-SC02) çözülmeden Wave 5 implementation planlaması yapılamaz.
- `IsletmeRaporlariWindow`'daki geniş-yetkili tek-login çapraz-DB erişim modelinin Metnex'in
  admin-küratörlü allowlist hedefiyle çelişmesi, Wave 5 güvenlik tasarımının **daha da net**
  bir "taşınmaz" maddesi olarak ele alınmasını gerektirir (mimari karar dokümanı §4/§6 ile
  tutarlı, yeni bir kategori değil, güçlendirilmiş kanıt).
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.
