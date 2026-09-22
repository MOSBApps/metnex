# MİP Tenant / İşletme / Lokasyon Mapping

> **Durum: Discovery/mapping dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-4-mip-tenant-isletme-lokasyon-mapping.md` (EPIC-004, Wave 0,
> bağımlılık: TASK-027.3 — done). Bu belge `BOTC_TO_METNEX_MAPPING.md` §3 (Tenant/Scope Mapping,
> özet düzey) ve `BOTC_ENTITY_DOMAIN_MAPPING.md`'yi (entity/servis düzeyi) **tamamlar, tekrar
> etmez**. Bu belgenin odağı: MİP tenant hiyerarşisinin **gerçek Metnex `tenant-scope` şema/kod
> kanıtlarıyla** ve BOTC'nin gerçek `Sirket`/lokasyon kaynak kodu kanıtlarıyla eşleştirilmesi.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

- **BOTC tarafı:** `Sirket` alanının kullanıldığı **tüm** dosyalar (`grep -rn "\.Sirket\b"
  ../BOTC --include=*.cs`) taranarak her kullanım yeri doğrulandı; herhangi bir sorgu/`Where`/
  yetkilendirme filtresinde kullanılıp kullanılmadığı ayrıca **ayrı bir sorgu ile** teyit edildi
  (bulunamadı — bkz. §2). `VardiyaService.cs`/`ArsivVardiyaService.cs`'deki 5 sabit `lokasyon`
  string'i (`MOSBİO`, `MOSB ENERJİ`, `KÖMÜR KAZANI`, `MOSBİO KIRIM DEPO`, `SANTRAL`) ve
  `QueryService`/`DataSourceService`'in `DynamicDataSources` anahtarları (`BOTC_ENTITY_DOMAIN_MAPPING.md`
  §3'te zaten belgelenmişti, burada tenant-eşleme açısından yeniden değerlendirildi) incelendi.
- **Metnex tarafı:** `apps/api/src/tenant-scope/{tenant-scope.service.ts,tenant-closure.service.ts,
  customer-schema-registry.service.ts}` ve `apps/api/src/db/schema/{platform.ts,enums.ts,saas.ts}`
  **gerçek kod/şema** olarak okundu — `TenantType` enum'u (`PLATFORM_ROOT`/`ROOT`/`STANDARD`),
  `tenants` tablosunun `parentId`/`customerRootId`/`canEnterData`/`canAggregateChildren`
  kolonları ve `tenant_closure` (ata-torun kapanış tablosu, sınırsız derinlik destekler) **var
  olan, çalışan koddan** alındı — hiçbir alan/mekanizma varsayılmadı.
- `docs/requirements/DISCOVERY.md` §2.3 (Tenant ve Veri Kapsamı), §20 (Wave 5 güvenlik ek
  ilkeleri), §21 (Enerji Üretim/Buhar Arzı — işletmeler arası ilişki), karar kayıtları D-005/D-006
  ve `docs/requirements/SRS.md` (ROLE-001/002, FR-015, SEC-DATA-001/002) okundu.

**SQL Server'a bu ortamdan erişim yoktur** — bu belgedeki hiçbir satır canlı veri/şema iddiası
içermez; doğrulanamayan noktalar `[DOĞRULANAMADI]` işaretlidir.

---

## 1. MİP Root / İşletme Tenant Ayrımı

`docs/requirements/DISCOVERY.md` §2.3 ve D-005 kararı, Metnex'in **gerçek** `TenantType` enum'una
(`apps/api/src/db/schema/enums.ts:4` — `pgEnum('TenantType', ['PLATFORM_ROOT', 'ROOT', 'STANDARD'])`)
şu şekilde eşlenir:

| Kavram | Discovery/D-005 tanımı | Metnex `TenantType` (gerçek kod) | Karar |
|---|---|---|---|
| MİP customer root tenant | "MİP customer root tenant" — MOSB/MOSEDAŞ/MOSBİO'nun ortak üst kapsamı | `ROOT` (`tenants.type = 'ROOT'`, kendi `customerRootId`'si kendisidir — `tenant-scope.service.ts:52` bu alanın zorunlu olduğunu doğruluyor) | **Eşlenir** — yeni bir tenant tipi gerekmez, var olan `ROOT` tipi kullanılır |
| MOSB (MOSB Enerji) | D-005: "MOSB... bağlı işletme tenant'larıdır" | `STANDARD`, `parentId` → MİP `ROOT` tenant, `customerRootId` → aynı MİP `ROOT` | **Eşlenir** |
| MOSEDAŞ | D-005, aynı | `STANDARD`, aynı ebeveyn yapısı | **Eşlenir** |
| MOSBİO | D-005, aynı | `STANDARD`, aynı ebeveyn yapısı | **Eşlenir** |
| (Platform yöneticisi kapsamı) | Discovery §9, ROLE-001 `SYSTEM_ADMIN` | `PLATFORM_ROOT` — `tenant-scope.service.ts:48-50` bu tipin data-plane scope çözümlemesine **hiç girmediğini** (fail-closed) doğruluyor | Bu task'ın kapsamı dışı — MİP/işletme verisiyle **doğrudan ilişkili değil**, yalnızca platform yönetimi |

**Not — BOTC'de bu hiyerarşinin karşılığı yoktur:** BOTC tek-tenant bir masaüstü uygulamasıdır;
`Sirket` serbest metin alanı **yapısal bir tenant/root ayrımı değildir** (bkz. §2). Bu tablo
tamamen Discovery/D-005 kararına ve Metnex'in var olan koduna dayanır, BOTC kaynak kodundan
**türetilmemiştir**.

---

## 2. `Sirket` Alanı — Kaynak Kod Kanıtı ve Güvenilirlik Değerlendirmesi

### 2.1 Kullanım Yerleri (tam liste, `grep -rn "\.Sirket\b" ../BOTC` ile doğrulandı)

| Dosya | Kullanım |
|---|---|
| `BOT.Domain/User.cs:14` | `public string? Sirket { get; set; }` — nullable, serbest metin alan tanımı |
| `BOT.Domain/DofUser.cs:22` | Aynı alan, `DOF_APP.Users`'ta ayrıca tanımlı (Wave 3, kapsam dışı) |
| `BOT.Services/UserService.cs:58,81` | `CreateAsync`/`UpdateAsync` — parametre olarak alınıp doğrudan `User.Sirket`'e **hiçbir doğrulama/normalizasyon olmadan** atanıyor |
| `BOT/UserManagementWindow.xaml.cs:30,78,93,118,214` | Admin ekranında **serbest metin `TextBox`** (`txtSirket.Text`) — dropdown/select değil, önceden tanımlı bir liste yok |

### 2.2 Kritik Bulgu — `Sirket` Hiçbir Sorgu/Yetkilendirme Filtresinde Kullanılmıyor

Ayrı bir arama (`grep -rn "\.Sirket\b" ../BOTC --include=*.cs` sonuçlarının tamamı, filtre/`Where`/
yetkilendirme deseni aranarak) **hiçbir** `Where(... => x.Sirket == ...)`, `Include`, yetki
kontrolü veya veri-kapsamı filtresinde `Sirket` kullanımı **bulunamamıştır**. Alan yalnızca:

1. Admin formunda **serbest metin girişi** olarak toplanıyor,
2. `User`/`DofUser` tablosunda **saklanıyor**,
3. Hiçbir servis metodunda **okunup karar üretilmiyor** (yalnızca `UserManagementWindow`'da
   listeleme/görüntüleme amaçlı geri okunuyor).

### 2.3 Sonuç — `Sirket` Tek Başına Güvenilir Bir Tenant Eşleme Kaynağı **Değildir**

| Gerekçe | Kanıt |
|---|---|
| Yapısal değil, serbest metin | `TextBox`, önceden tanımlı liste/FK yok — yazım hatası, boşluk farkı, büyük/küçük harf tutarsızlığı riski |
| Zorunlu değil | `User.Sirket` nullable (`string?`) — boş bırakılabilir |
| Hiçbir erişim kararında kullanılmıyor | §2.2 — mevcut sistemde "Sirket = tenant" varsayımı **davranışsal olarak hiç doğrulanmamış** bir varsayım olurdu |
| Roller/izinler `Sirket`'ten bağımsız | `AuthService.LoginAsync`, izinleri yalnızca `Role`/`UserPermissions` üzerinden çözüyor, `Sirket`'e hiç bakmıyor (`BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2) |

**Karar:** `Sirket` alanı Wave 1 migration'ında **bilgi amaçlı referans** (serbest metin not) olarak
taşınabilir, ama Metnex tarafında bir kullanıcının hangi tenant'a (MOSB/MOSEDAŞ/MOSBİO) ait
olduğunu **belirleyen yapısal kaynak olarak kullanılamaz**. Gerçek tenant ataması migration
sırasında **ayrıca, elle veya bir eşleme tablosuyla** yapılmalıdır — bu doğrudan zaten açık olan
**Q-M06** ile aynı belirsizliktir, burada kaynak kod kanıtıyla **doğrulanmıştır**, çözülmemiştir.

---

## 3. BOTC Lokasyonları → Tenant / Tenant-İçi Scope / Ayrı Tesis Seçenekleri

BOTC'nin `VardiyaService.cs`/`ArsivVardiyaService.cs`'sinde sabit-kodlanmış (hardcoded switch-case,
serbest string, FK/enum değil) **5 lokasyon** vardır: `MOSBİO`, `MOSB ENERJİ`, `KÖMÜR KAZANI`,
`MOSBİO KIRIM DEPO`, `SANTRAL`. `docs/requirements/DISCOVERY.md` §21.1'deki "Bilinen üretim
kaynakları" tablosu, bu lokasyonların işletme-içi **varlık (asset) ilişkisini** şöyle gösteriyor:

```text
MOSB Enerji (işletme)
├── GT1, GT2, GT3   (doğalgaz → elektrik + buhar)
├── SG1, SG2, SG3   (doğalgaz → elektrik + buhar)
└── Kömür Kazanı    (kömür → buhar; yüksek basınç buhar — GT3 ile birlikte)

MOSBİO (ayrı işletme)
├── Biyokütle → buhar → elektrik
└── (gerektiğinde MOSB Enerji'ye buhar desteği verebilir — §21.2, işletmeler-arası ilişki)
```

Bu kanıta göre lokasyon → tenant eşleme **seçenekleri**:

| Lokasyon (BOTC) | Seçenek A: İşletme tenant'ının kendisi | Seçenek B: Tenant-içi scope (alt-varlık) | Seçenek C: Ayrı tesis/tenant | Kanıt/gerekçe |
|---|---|---|---|---|
| `MOSBİO` | **MOSBİO tenant'ı** | — | — | Discovery §21.1: MOSBİO ayrı işletme, kendi tenant'ı zaten var (D-005) |
| `MOSBİO KIRIM DEPO` | — | MOSBİO tenant'ı **içinde** alt-varlık/scope (aynı işletmenin bir tesisi) | Ayrı tenant (nadiren, eğer ayrı erişim/izin sınırı gerekiyorsa) | Discovery'de ayrı bir işletme olarak geçmiyor, yalnızca MOSBİO'nun bir "kırım-depo" tesisi gibi okunuyor — **[DOĞRULANAMADI]**, iş bilgisi teyidi gerekir |
| `MOSB ENERJİ` | **MOSB tenant'ının kendisi** (genel/varsayılan lokasyon) | — | — | Discovery §21.1: "MOSB Enerji" işletmesinin adı zaten `MOSB ENERJİ`; D-005'teki "MOSB" tenant'ına karşılık gelir |
| `KÖMÜR KAZANI` | — | MOSB Enerji tenant'ı **içinde** alt-varlık (§21.1 tablosunda GT/SG ile birlikte "MOSB Enerji" üretim kaynakları arasında listeleniyor) | — | Discovery §21.1 tablosu net — ayrı işletme değil, MOSB Enerji'nin bir üretim kaynağı |
| `SANTRAL` | — | MOSB Enerji tenant'ı **içinde** alt-varlık (muhtemelen GT/SG "santral" birimlerinin toplu adı) | — | `VardiyaMuhendisiRapor`/"Santral" adının GT/SG ile ilişkisi kod içinde açıkça belirtilmemiş — **[DOĞRULANAMADI]** |

**Sonuç — karar bekliyor:** 5 BOTC lokasyonundan **2'si (`MOSBİO`, `MOSB ENERJİ`) doğrudan işletme
tenant'ının kendisine karşılık geldiği makul güvenle söylenebilir** (Discovery §21.1 ile
doğrudan örtüşüyor). Diğer 3'ü (`KÖMÜR KAZANI`, `MOSBİO KIRIM DEPO`, `SANTRAL`) **tenant-içi
alt-varlık/scope** olması muhtemel ama bu **kesinleştirilmemiştir** — bu doğrudan **Q-M06**'nın
kapsamına girer, burada somut lokasyon-bazlı seçenekler olarak **detaylandırılmıştır**, çözülmemiştir.
Metnex'in `tenants` tablosu `parentId` ile **sınırsız derinlik** destekliyor (`tenant_closure`
kapanış tablosu, `apps/api/src/db/schema/platform.ts:15,34-45`) — yani "lokasyon = MOSB'un alt
tenant'ı" teknik olarak **mümkündür**, ama bunun bir tenant node'u mu yoksa yalnızca bir veri
alanı (`location`/`facility` kolonu) mı olacağı bir **ürün kararıdır**, bu task'ta verilmemiştir.

---

## 4. SCADA/DMS Kaynaklarının Tenant Görünürlük Modeli (hazırlık, implementation değil)

`BOTC_ENTITY_DOMAIN_MAPPING.md` §3'te belgelenen SCADA entity'leri (`GtEndeks`, `SgEndeks`,
`KomurEndeks`, `MosbioEndeks`, `VardiyaPerformans`) ve `DynamicDataSources` anahtarları
(`endeksler`, `gt_endeksler`, `komur_endeksler`, `sg_endeksler`, vb.) §3'teki lokasyon-tenant
eşlemesiyle **aynı belirsizliği** taşır:

| SCADA kaynağı | Muhtemel tenant (Discovery §21.1 ile çapraz okuma) | Kesinlik |
|---|---|---|
| `GtEndeks`, `SgEndeks` | MOSB tenant'ı (GT1-3/SG1-3, §21.1 tablosu MOSB Enerji altında) | Makul güvenle **MOSB**, ama fiziksel `DynamicDataSources` bağlantısı doğrulanmadı (**Q-S03**) |
| `KomurEndeks` | MOSB tenant'ı (Kömür Kazanı, aynı tabloda MOSB Enerji üretim kaynağı) | Makul güvenle **MOSB**, aynı gerekçeyle **Q-S03**'e bağlı |
| `MosbioEndeks` | MOSBİO tenant'ı | Makul güvenle **MOSBİO** (`DynamicDataSources` anahtarı `endeksler`, `QueryService`'te özel işlem görüyor), ama **Q-S03**'e bağlı |
| `VardiyaPerformans` | Belirsiz — ayrı bir `DynamicDataSources` anahtarı var ama hangi lokasyona/tenant'a ait olduğu kod tarafında **hiç belirtilmemiş** | **[DOĞRULANAMADI]**, Q-S03 |
| `MOSEDAS` (DB adı, kod tabanında entity karşılığı yok) | MOSEDAŞ tenant'ı (isim benzerliği dışında kanıt yok) | **[DOĞRULANAMADI]**, zaten **Q-M02** |

**MİP root tenant görünürlüğü:** Discovery §2.3/D-006 ve Metnex'in gerçek
`TenantScopeService.resolve()` mekanizması (`tenant-scope.service.ts:57-59`) birebir örtüşüyor —
`canAggregateChildren=true` olan bir `ROOT` tenant için `dataScopeTenantIds`,
`tenant_closure`'dan **tüm torun tenant ID'lerini** (MOSB+MOSEDAŞ+MOSBİO) döner; `false` ise
yalnızca kendi `tenantId`'si. Bu, D-006'nın ("permission + `canAggregateChildren` + data scope
birlikte değerlendirilir") **birebir çalışan karşılığıdır** — yeni bir mekanizma **icat edilmesine
gerek yoktur**, var olan `canAggregateChildren` alanı MİP root tenant için `true` olarak
ayarlanacaktır (implementation kararı, bu task'ta **verilmedi**).

SCADA/DMS adapter'ının bu `dataScopeTenantIds` listesini nasıl SQL Server sorgusuna (hangi
kaynak/tablo/şemaya) eşleyeceği — yani "tenant X için hangi `DynamicDataSources` anahtarı
sorgulanacak" eşlemesi — **Wave 5 implementation kararıdır**, bu belge yalnızca **hazırlık**
(görünürlük modelinin Metnex tarafındaki mevcut mekanizmayla uyumlu olduğunu göstermek) amaçlıdır,
implementation üretmez (görev kapsamı: "belgelemeye hazırla").

---

## 5. Tenant İzolasyonu, Root Analiz Yetkisi ve İşletme Erişim Sınırları

| Konu | Discovery/SRS/Metnex kod kanıtı | Sonuç |
|---|---|---|
| **Varsayılan izolasyon** | Discovery §2.3: "Bir şirket tenant'ı varsayılan olarak diğer şirketlerin verisini göremez" + `TenantScopeService.resolve()`: `canAggregateChildren=false` olan tenant için `dataScopeTenantIds = [tenantId]` (yalnızca kendisi) | MOSB/MOSEDAŞ/MOSBİO'nun her biri **varsayılan olarak yalnızca kendi verisini** görür — kod düzeyinde zaten garanti altında |
| **Root analiz yetkisi** | D-006: "permission + `canAggregateChildren` + data scope birlikte değerlendirilir"; SRS ROLE-002 `TENANT_ADMIN`: "Müşteri Kök Kiracı yöneticisi... kendi ağacında alt kiracılar... yönetir" | MİP root (`ROOT` tipi) kullanıcıları, **yalnızca** hem uygun permission'a hem de `canAggregateChildren=true` bayrağına sahipse MOSB/MOSEDAŞ/MOSBİO'nun **aggregate** (toplulaştırılmış) verisini görebilir — tek başına rol/tenant tipi **yeterli değildir** |
| **Kullanıcı girdisi güvenilmez** | SRS FR-015: "Kullanıcının gönderdiği database, schema, table veya column değeri tek başına erişim yetkisi olarak kabul edilmemelidir"; SEC-DATA-001/002 | BOTC'nin `Sirket`/lokasyon serbest metin girişleri Metnex'e taşınırken **hiçbir zaman** doğrudan bir tenant/erişim kararı üretmemeli — backend `dataScopeTenantIds` + allowlist zorunlu ara katman olmalı |
| **Permission etkisi** | `BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2: BOTC'de tenant/permission ayrımı yok, servis metodu kendi başına yetki kontrolü yapmıyor | Wave 1/4/5 implementation'ında her servis çağrısı Metnex'in var olan `permission.guard.ts` + `TenantScopeService.resolve()` ikilisinden **geçmek zorunda** — BOTC'nin "UI kontrol eder" modeli burada da taşınmaz |
| **PLATFORM_ROOT sınırı** | `tenant-scope.service.ts:48-50`: `PLATFORM_ROOT` tipi için data-plane scope **hiç çözülmez** (fail-closed, `ForbiddenException`) | MİP/işletme SCADA verisi `SYSTEM_ADMIN`/`PLATFORM_ROOT` kapsamına **karışmaz** — platform yönetimi ile MİP/işletme veri erişimi kod düzeyinde zaten **ayrı** |

---

## 6. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu belge, Discovery §21'deki "Wave 2/3 Dışı Gelecek Adayı" olarak işaretli üretim planlama/buhar
arzı iş süreçlerinden (§21.1–21.3) yalnızca **lokasyon/varlık ilişkisi** kanıtı olarak
yararlanmıştır; bu süreçlerin kendisi (üretim planlama, buhar arzı optimizasyonu) için **hiçbir
mapping veya implementation önerisi üretilmemiştir**. Ticket/MaintenanceRecord/FaultRecord (Wave 2)
ve DÖF (Wave 3) bu belgede hiç ele alınmamıştır (D-007 ile tutarlı).

---

## 7. Yeni Açık Sorular

Bu task, mevcut **Q-M06** (lokasyon→tenant modeli) ve **Q-S03** (`DynamicDataSources`
anahtarlarının fiziksel DB eşlemesi) sorularını **kapatmamış**, aksine somut lokasyon-bazlı
seçeneklerle (§3, §4) **detaylandırmıştır**. Bunların ötesinde **1 yeni soru** tespit edildi ve
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye **append** edildi:

- **Q-T01** — `MOSBİO KIRIM DEPO` ve `SANTRAL` lokasyonları ayrı tenant node'u (alt-tenant) olarak
  mı, yoksa yalnızca bir veri alanı (`location`/`facility` kolonu) olarak mı modellenecek?
  (Metnex `tenants.parentId` sınırsız derinlik desteklediği için her iki seçenek de teknik olarak
  mümkün — bu bir ürün/veri-modeli kararıdır.)

Diğer mevcut sorulara (Q-M01–Q-M06, Q-A01–Q-A03, Q-S01–Q-S04, Q-E01–Q-E04) **hiçbir değişiklik
yapılmadı**.

---

## 8. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/Docker/Git değişikliği yoktur).

## 9. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmemiştir** — lokasyon→tenant modeli (Q-M06,
  Q-T01) ve SCADA kaynak→tenant fiziksel eşlemesi (Q-S03) çözülmeden Wave 4/Wave 5 implementation
  planlaması yapılamaz.
- `Sirket` alanının Wave 1 migration'ında nasıl ele alınacağı (bilgi notu olarak mı taşınacak,
  yoksa tamamen bırakılıp yerine ayrı bir tenant-atama mekanizması mı kurulacak) Q-M06 ile
  birlikte PO kararı gerektirir.
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, Docker, Git history değişmedi. Git commit/push yapılmadı.

---

## 10. TASK-027.15 Doğrulama Notu (2026-09-18) — Q-T01/Q-SC01 Kapatılmadı

TASK-027.15 (Tenant Mapping Coverage and Assignment Governance Boundary),
`apps/api/src/migration/botc-identity/tenant-coverage.ts`'de bu belgenin §3'ündeki bilinen
belirsiz lokasyon kategorilerini (`MOSBİO KIRIM DEPO`, `SANTRAL`, `KÖMÜR KAZANI`, GT/SG fiziksel
kaynakları) **yalnızca statik, dokümantasyon amaçlı bir referans listesi** olarak yeniden üretti
(`KNOWN_PENDING_LOCATION_CATEGORIES`) — bu liste **hiçbir zaman** çalışma zamanında `Sirket` veya
başka bir kaynak alanına karşı sorgulanmaz (bunu yapmak Q-M06'nın "Sirket tenant kaynağı olarak
kullanılmaz" kuralını ihlal ederdi). Coverage raporu, bir kullanıcının hangi **spesifik** sebeple
`UNRESOLVED` olduğunu (`Sirket` değerine bakarak) **asla açıklamaz** — yalnızca toplam
`ASSIGNED`/`UNRESOLVED` sayılarını raporlar. **Q-T01 ve Q-S03 bu task'ta da kapatılmamıştır** —
her ikisi de hâlâ açıktır; bu task yalnızca mevcut belirsizliği doğru bir şekilde
`UNRESOLVED`/bekleyen kayıt olarak raporlayan bir coverage katmanı eklemiştir, karar vermemiştir.
