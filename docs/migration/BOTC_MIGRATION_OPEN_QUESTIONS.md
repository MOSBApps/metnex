# BOTC Migration — Açık Sorular

> **Durum: Discovery/mapping dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-1-botc-migration-mapping-ve-architecture-decision.md` (done) ve
> `backlog/TASK-027-2-botc-kaynak-database-schema-envanteri.md`. Bu belge `BOTC_TO_METNEX_MAPPING.md`,
> `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` ve `BOTC_SOURCE_SCHEMA_INVENTORY.md`'de işaretlenen
> tüm açık soruları toplar; ayrıca `../BOTC/DISCOVERY.md` §7.3 (Q-001–Q-013) ve
> `docs/requirements/DISCOVERY.md` §7.3 (Q-001–Q-011) ile çakışan sorular tekrar üretilmemiş,
> kaynağına referans verilmiştir.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

---

## Bu Task'ta Yeni Tespit Edilen Sorular (Q-M / Q-A serisi)

### Q-M01 — `MOSBIO_TELEGRAM` gerçekten bir SQL Server veritabanı mı?

- **Soru:** `../BOTC/DISCOVERY.md` §2.3'teki 9 veritabanı listesinde `MOSBIO_TELEGRAM` geçiyor,
  ama kod tabanında (`BOT.Data`, `BOT.Domain`) bu isimde bir veritabanına özel DbContext/DbSet
  **bulunamadı**. Telegram entegrasyonu kod tarafında `TelegramOptions`/`TelegramService` ile HTTP
  API üzerinden çalışıyor (Bot API), bir SQL veritabanı bağlantısı değil.
- **Kaynak referansı:** `../BOTC/BOT.Services/Telegram/TelegramService.cs`,
  `../BOTC/BOT.Services/Options/TelegramOptions.cs`, `../BOTC/DISCOVERY.md` §2.3 satır 60.
- **Neden gerekli:** Database sınıflandırması (mapping dokümanı §1) bu kaynağı doğru
  kategorize edemiyor; "SQL Server DB" mi yoksa "isimlendirme kalıntısı/başka bir amaç" mı
  olduğu netleşmeden read-only adapter tasarımına dahil edilip edilmeyeceği bilinemez.
- **Hangi task'ı bloke ediyor:** Wave 5 SCADA/DMS read-only adapter kaynak listesi kesinleşmesi.
- **Önerilen karar:** BOTC paydaşına (IT/OT) sorulmalı; muhtemelen bu isim gerçek bir veritabanı
  değil, tarihsel/yanlış isimlendirme olabilir — SQL Server'a erişimle `sys.databases`
  sorgusuyla doğrulanabilir (bu ortamdan yapılamadı).
- **Product Owner onayı gerekli mi:** Hayır — teknik doğrulama sorusu, IT/OT paydaşı yeterli.

### Q-M02 — `MOSEDAS` veritabanının kaynak entity/tablo karşılığı nedir?

- **Soru:** `MOSEDAS` Discovery'de isim olarak geçiyor ve Metnex tarafında MOSEDAŞ tenant'ının
  kaynağı olarak **varsayılıyor**, ama kod tabanında bu veritabanına özel bir entity/DbSet
  bulunamadı — `GtEndeks`/`SgEndeks`/`KomurEndeks`/`MosbioEndeks` hiçbiri açıkça `MOSEDAS`'a
  atanmamış.
- **Kaynak referansı:** `../BOTC/DISCOVERY.md` §2.3, `../BOTC/BOT.Domain/IsletmeModelleri.cs`.
- **Neden gerekli:** MOSEDAŞ tenant'ının Wave 5'te hangi tablo(lar)ı read-only okuyacağı
  belirsiz; mapping dokümanı §2.3'te "varsayım" olarak işaretlenmiştir, gerçek değil.
- **Hangi task'ı bloke ediyor:** MOSEDAŞ tenant'ının SCADA/DMS read-only adapter tasarımı.
- **Önerilen karar:** SQL Server erişimiyle `MOSEDAS` veritabanının tablo listesi çıkarılmalı
  (`INFORMATION_SCHEMA.TABLES`) ve `appsettings.json` `DynamicDataSources` listesindeki hangi
  `Name` değerinin bu veritabanına karşılık geldiği doğrulanmalı.
- **Product Owner onayı gerekli mi:** Hayır — teknik doğrulama, ama sonuç tenant/data-scope
  tasarımını etkilediği için Wave 5 SRS detaylandırmasında Product Owner'a raporlanmalı.

### Q-M03 — BOTC `Can*` izinlerinin Metnex permission adlarına birebir kesin eşlemesi

- **Soru:** Mapping dokümanı §2.2'de sunulan eşleme tablosu yalnızca **öneri**dir (SRS'teki
  örnek permission adlarına dayanıyor). Kesin, onaylı bir isimlendirme sözleşmesi yoktur.
- **Kaynak referansı:** `../BOTC/DISCOVERY.md` §5.2, `docs/requirements/DISCOVERY.md` §5.1,
  `docs/requirements/SRS.md` MOD-004/MOD-005.
- **Neden gerekli:** Wave 1 implementation'ının permission migration script'i kesin hedef
  isimlere ihtiyaç duyar.
- **Hangi task'ı bloke ediyor:** Wave 1 — Permission migration implementation task'ı
  (`TASK-027-14-permission-migration-implementation.md`).
- **Önerilen karar:** Mapping dokümanı §2.2'deki taslak, AI1/Product Owner tarafından
  gözden geçirilip onaylanmalı veya değiştirilmeli.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-M04 — Rol-bazlı varsayılan permission şablonu mı, birebir kullanıcı ataması mı?

- **Soru:** BOTC'de her kullanıcıya izinler **tek tek elle** atanıyor (rol, yalnızca `Admin`
  özel-durumu dışında bir varsayılan izin seti taşımıyor — `../BOTC/DISCOVERY.md` §7.5 T-001'de
  bu durum paydaşa da açık soru olarak iletilmiş, henüz kapanmamış). Metnex'e geçişte rol →
  varsayılan permission-set modeline mi geçilecek, yoksa BOTC'nin birebir kullanıcı-permission
  atama deseni mi korunacak?
- **Kaynak referansı:** `../BOTC/BOT.Domain/UserPermission.cs`,
  `../BOTC/BOT.Services/AuthService.cs` (yetki çekme mantığı), `../BOTC/DISCOVERY.md` §7.5.
- **Neden gerekli:** Migration script'inin kullanıcı-permission ilişkisini nasıl dönüştüreceğini
  belirler; ayrıca bu, BOTC tarafında zaten **kapanmamış** bir iç soru (T-001), Metnex tarafına
  da miras kalıyor.
- **Hangi task'ı bloke ediyor:** Wave 1 — Rol ve permission migration implementation task'ları.
- **Önerilen karar:** Metnex'in mevcut rol-permission modeli (zaten `tenant_roles`/
  `tenant_role_permissions` yapısı var, bkz. `docs/domain/DOMAIN_MODEL.md`) kullanılması, BOTC
  kullanıcılarının fiili (canlı veritabanından çekilecek) izin setlerinin buna **eşlenerek**
  taşınması önerilir — ama bu bir tasarım kararıdır, tek taraflı verilmemiştir.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-M05 — SCADA verisi canlı mı sorgulanacak, yoksa PostgreSQL read-model/cache mi oluşturulacak?

- **Soru:** Mimari karar dokümanı §3'te SCADA verisinin PostgreSQL'e kopyalanmayacağı
  belirtiliyor, ama her isteğin doğrudan SQL Server'a mı gideceği, yoksa performans için bir ara
  cache/read-model katmanı mı olacağı kararlaştırılmamıştır.
- **Kaynak referansı:** Bu soru zaten `docs/requirements/DISCOVERY.md` §7.3 Q-008 ile
  **aynıdır** — burada yalnızca migration mapping bağlamında tekrar işaretlenmiştir, yeni bir
  soru değildir.
- **Neden gerekli:** SQL Server üzerindeki performans etkisi (Discovery R-006: "büyük dinamik
  sorgular API/SQL Server performansını etkileyebilir") ve Metnex API'nin timeout/limit
  tasarımı bu karara bağlıdır.
- **Hangi task'ı bloke ediyor:** Wave 5 — SCADA/DMS read-only adapter implementation task'ları.
- **Önerilen karar:** Yok — bu doküman bir öneri sunmuyor, açık soru olarak bırakılıyor.
- **Product Owner onayı gerekli mi:** **Evet** (zaten `docs/requirements/DISCOVERY.md`'de
  bekleyen bir soru).

### Q-M06 — Kömür Kazanı / GT / SG50 / Santral "lokasyon" kavramının tenant-içi modeli

- **Soru:** Vardiya raporlama tabloları (`mosbio`, `mosbenerji`, `komurkazani`,
  `mosbiokirimdepo`, `vardiyamuhendisi`) ve SCADA entity'leri (`GtEndeks`, `SgEndeks`,
  `KomurEndeks`) BOTC'de "lokasyon" bazlı ayrılmış görünüyor (Discovery §2.4: "MOSBİO, MOSB
  ENERJİ, KÖMÜR KAZANI, MOSBİO KIRIM DEPO, SANTRAL"). Bu 5 lokasyon Metnex'in
  `MİP → {MOSB, MOSEDAŞ, MOSBİO}` 3-seviyeli tenant modeliyle **birebir örtüşmüyor** — örn.
  "Kömür Kazanı" ve "Santral" hangi tenant'ın altında, ayrı bir alt-lokasyon mu yoksa MOSB'un bir
  parçası mı?
- **Kaynak referansı:** `../BOTC/DISCOVERY.md` §2.1, §4.1 (F-004), `../BOTC/BOT.Services/VardiyaService.cs`
  (switch blokları, Discovery D-009), `docs/requirements/DISCOVERY.md` §2.3.
- **Neden gerekli:** Tenant/scope mapping'inin (mapping dokümanı §3) doğru kurulabilmesi için
  şart; yanlış eşleme, bir işletmenin başka bir işletmenin verisini görmesine yol açabilir
  (güvenlik riski).
- **Hangi task'ı bloke ediyor:** Wave 4 (Vardiya) implementation'ı ve Wave 5'teki lokasyon bazlı
  SCADA veri kaynağı-tenant eşlemesi.
- **Önerilen karar:** Yok — paydaş (IT/OT, İşletme Müdürlüğü) teyidi gerektirir.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-A01 — Metnex JWT/session modeli BOTC'nin tek-oturum zorlamasını (5 saniyelik nabız) karşılayacak mı?

- **Soru:** BOTC'nin "aynı kullanıcı aynı anda yalnızca bir bilgisayarda oturum açabilir"
  kuralı (F-008, `Users.CurrentSessionId` + 5 saniyelik DB polling) bir iş kuralı olarak devam
  etmeli mi? Devam etmeliyse, Metnex'in mevcut JWT access/refresh token modeliyle (DB polling
  olmadan) nasıl karşılanacağı tasarlanmamıştır.
- **Kaynak referansı:** `../BOTC/BOT/App.xaml.cs`, `../BOTC/DISCOVERY.md` §6 F-008.
- **Neden gerekli:** Bu bir davranışsal iş kuralı mı yoksa BOTC'nin masaüstü-uygulama-özel bir
  kısıtlaması mı (lisans/donanım kontrolü amaçlı) belirsiz; web tabanlı Metnex'te aynı kullanıcı
  farklı sekmelerde/cihazlarda oturum açması normal bir davranıştır.
- **Hangi task'ı bloke ediyor:** Wave 1 — Session migration/implementation task'ı
  (`TASK-027-17-email-verification-session-migration.md`).
- **Önerilen karar:** Yok — bu doküman bir öneri sunmuyor, iş kuralının devam etmesi gerekip
  gerekmediği paydaştan teyit gerektiriyor.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-A02 — SQL Server read-only kullanıcı erişim modeli hazır mı?

- **Soru:** BOTC tüm veritabanlarına tek bir SQL kullanıcısıyla (`bot_migrator`) bağlanıyor,
  bu kullanıcının gerçek yetkileri (yalnızca `SELECT` mi, yoksa daha geniş mi) bu ortamdan
  doğrulanamadı. Metnex için ayrı, **kesinlikle salt-okunur** bir SQL Server kullanıcısı
  oluşturulmuş mu, yoksa bu hâlâ yapılacak bir iş mi?
- **Kaynak referansı:** `../BOTC/DISCOVERY.md` §2.3 (`bot_migrator`), R-005;
  `docs/requirements/DISCOVERY.md` §7.3 Q-003 ile **aynı soru** (orada zaten açık).
- **Neden gerekli:** Read-only adapter'ın güvenlik garantisi (SRS FR-017: INSERT/UPDATE/DELETE
  yapılmaz), yazma yetkisi olmayan bir DB kullanıcısıyla **teknik olarak** desteklenmelidir,
  yalnızca uygulama kodu disipliniyle değil.
- **Hangi task'ı bloke ediyor:** Wave 5 — SCADA/DMS read-only adapter deployment'ı.
- **Önerilen karar:** Yok — altyapı/DBA sorumluluğunda, bu ortamdan doğrulanamaz.
- **Product Owner onayı gerekli mi:** Hayır — teknik/operasyonel bir ön koşul, ama deployment
  planına girmesi gerekir.

### Q-A03 — Migrate edilen BOTC kullanıcıları için zorunlu parola sıfırlama akışı onaylı mı?

- **Soru:** Mimari karar dokümanı §8'de önerilen "migration sonrası zorunlu parola sıfırlama"
  yaklaşımı henüz Product Owner tarafından onaylanmamıştır — alternatif olarak "ilk girişte
  sıfırlama" veya "toplu e-posta ile davet" gibi başka akışlar da olabilir.
- **Kaynak referansı:** `../BOTC/DISCOVERY.md` §7.3 Q-002 ile ilişkili;
  `docs/requirements/DISCOVERY.md` §7.3 Q-007 ile **aynı soru**.
- **Neden gerekli:** Wave 1 kullanıcı migration implementation'ının UX/akış tasarımını
  belirler.
- **Hangi task'ı bloke ediyor:** `TASK-027-16-password-reset-import-flow.md`.
- **Önerilen karar:** Mimari karar dokümanı §8'deki öneri (zorunlu sıfırlama, hash asla
  kopyalanmaz) — onay bekliyor.
- **Product Owner onayı gerekli mi:** **Evet.**

---

## TASK-027.2'de Yeni Tespit Edilen Sorular (Q-S serisi — Kaynak Schema Envanteri)

### Q-S01 — `Roles`/`Role` tablo adı ve `RoleId` FK delete-behavior'ı canlı veritabanında hangi durumda?

- **Soru:** `../BOTC/BOT.Data/Migrations/20251024083250_AddExtraNoteAudit.cs` tabloyu
  `Roles` → `Role` (tekil) olarak yeniden adlandırıp `RoleId` FK'sini `Restrict`'ten
  `Cascade`'e çevirmiş; `BotDbContextModelSnapshot.cs` bunu doğruluyor. Ama **güncel**
  `BotDbContext.cs`'nin `OnModelCreating`'i `e.ToTable("Roles")` (çoğul) ve
  `DeleteBehavior.Restrict` yazıyor — migration geçmişiyle **doğrudan çelişiyor**.
- **Kaynak referansı:** `docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md` §0 madde 1, §2.2.
- **Neden gerekli:** Wave 1 rol migration'ının kaynak tablo adını doğru okuması gerekir; yanlış
  isimle migration script'i kaynağa hiç bağlanamaz veya yanlış tabloyu okur.
- **Hangi task'ı bloke ediyor:** Wave 1 rol migration implementation task'ı
  (`TASK-027-13-role-migration-implementation.md`).
- **Önerilen karar:** Yok — yalnızca canlı SQL Server'a erişimle (`sys.tables` sorgusu)
  doğrulanabilir, bu ortamdan yapılamaz.
- **Product Owner onayı gerekli mi:** Hayır — teknik doğrulama (DBA/IT-OT).

### Q-S02 — `Permissions`, `UserPermissions`, `VisibilitySettings`, `MaintenanceRecords` ve SCADA endeks tabloları canlı `BOT_APP`'te gerçekten var mı?

- **Soru:** Bu tabloların hiçbiri migration geçmişinde `CreateTable` ile oluşturulmamış;
  `MaintenanceRecords` migration'da açıkça `DropTable` edilmiş ama güncel kod hâlâ bu tabloya
  map ediyor. Canlı veritabanında bu tablolar gerçekten var mı, hangi şema ile?
- **Kaynak referansı:** `docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md` §0 madde 2, §2.3–§2.8.
- **Neden gerekli:** Permission/UserPermission migration'ının kaynak şeması bu tabloların gerçek
  yapısına bağımlıdır; varsayılan kolon tipleri (`[KOD]`'dan çıkarılan) canlı DB ile farklı
  olabilir.
- **Hangi task'ı bloke ediyor:** Wave 1 permission migration
  (`TASK-027-14-permission-migration-implementation.md`), Wave 2 envanterinin doğruluğu.
- **Önerilen karar:** Yok — canlı SQL Server erişimi gerektirir.
- **Product Owner onayı gerekli mi:** Hayır — teknik doğrulama.

### Q-S03 — `DynamicDataSources` anahtarlarının her biri hangi fiziksel database/schema'ya bağlanıyor?

- **Soru:** `appsettings.json`'daki 7 `DynamicDataSources` anahtarının (`endeksler`,
  `gt_endeksler`, `komur_endeksler`, `sg_endeksler`, `Saatlik_Ort_Veriler`,
  `MUSTERI_CEKIS_SAATLIK`, `VardiyaPerformans`) her biri hangi veritabanı/şemaya bağlanıyor?
  `ConnectionString` değerleri bu ortamdan okunamadı.
- **Kaynak referansı:** `docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md` §3.
- **Neden gerekli:** Wave 5 SCADA adapter'ının kaynak-tenant eşlemesinin doğru kurulması için
  şart; Q-M01/Q-M02 ile aynı belirsizliğin somut, config-seviyesi hâli.
- **Hangi task'ı bloke ediyor:** Wave 5 SCADA/DMS read-only adapter implementation'ı.
- **Önerilen karar:** Yok — canlı config/SQL Server erişimi gerektirir.
- **Product Owner onayı gerekli mi:** Hayır (teknik), ama Q-M01/Q-M02 ile birleşince Wave 5
  kapsam netleştirmesinde PO'ya raporlanmalı.

### Q-S04 — `DofDbContext`'in kendi SCADA `DbSet`'leri gerçekten kullanılıyor mu?

- **Soru:** `DofDbContext`, `BotDbContext` ile aynı SCADA entity'lerini (`GtEndeks`, `SgEndeks`,
  `KomurEndeks`, `MosbioEndeks`→`Endeksler`) tekrar tanımlıyor. Bu DbSet'ler gerçekten bir
  servis tarafından çağrılıyor mu, yoksa kopyalanmış ölü kod mu?
- **Kaynak referansı:** `docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md` §4.4.
- **Neden gerekli:** Migration implementasyonunda hangi DbContext'in "gerçek kaynak" olduğunun
  netleşmesi gerekir; iki context aynı veriyi farklı bağlantı dizeleriyle okuyorsa tutarsızlık
  riski var.
- **Hangi task'ı bloke ediyor:** Wave 5 SCADA adapter kaynak netliği.
- **Önerilen karar:** Yok — kod tabanında ek arama (servis çağrı grafiği) veya paydaş teyidi
  gerektirir.
- **Product Owner onayı gerekli mi:** Hayır — teknik doğrulama.

---

## TASK-027.3'te Yeni Tespit Edilen Sorular (Q-E serisi)

### Q-E01 — `SessionService`'in bellek-içi permission snapshot modeli Metnex'e taşınacak mı?

- **Soru:** BOTC `UserAuthorizationService.Can()` DB'ye hiç gitmez, yalnızca login anında
  `SessionService`'e yüklenen `Permissions` `HashSet`'ini kontrol eder. Kullanıcının izinleri
  oturum ortasında (admin panelden) değiştirilirse, kullanıcı yeniden login olana kadar **eski
  izinlerle** çalışmaya devam eder. Metnex bu davranışı (performans amacıyla) taşıyacak mı, yoksa
  her istekte DB/JWT tabanlı taze kontrol mü yapacak?
- **Kaynak referansı:** `docs/migration/BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2 (`SessionService.cs`,
  `UserAuthorizationService.cs`).
- **Neden gerekli:** Wave 1 permission guard implementasyonunun request-time tazelik garantisini
  belirler; mevcut Metnex JWT/guard modeliyle tutarlılık gerektirir.
- **Hangi task'ı bloke ediyor:** Wave 1 permission guard implementation task'ları.
- **Önerilen karar:** Yok — güvenlik/UX trade-off kararı, teknik doğrulama değil.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-E02 — Wave 2/3 servisleri Wave 1 kimlik tablolarına bağımlı; migration/cutover sırasında bu bağımlılık nasıl korunacak?

- **Soru:** `TicketService` (bildirim alıcı listesi için `Users`/`UserPermissions`/`Permissions`)
  ve `DofService` (`Users.FullName` string eşlemesi + `BotUserId`) kapsam dışı olsalar da Wave 1
  kimlik tablolarına **canlı sorgu** atıyor. Wave 1 migration'ı yapıldığında bu kapsam dışı BOTC
  modülleri (Ticket/DÖF) hâlâ eski `BOT_APP.Users`'a mı bağlı kalacak, yoksa bir şekilde
  senkronize mi edilecek?
- **Kaynak referansı:** `docs/migration/BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2, §4, §5
  (`TicketService.cs`, `DofService.cs`).
- **Neden gerekli:** Wave 1 migration/cutover stratejisinin BOTC'nin kapsam dışı modüllerini
  bozmaması gerekiyorsa paralel çalışma/senkronizasyon stratejisi netleşmelidir.
- **Hangi task'ı bloke ediyor:** Wave 1 migration cutover stratejisi.
- **Önerilen karar:** Yok — Product Owner'ın Wave 2/3'ün migration sırasında ne kadar süre BOTC
  tarafında canlı kalacağına dair kararına bağlı.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-E03 — Wave 4 (Vardiya/Arşiv) için Metnex tarafında yeni bir domain modülü mü açılacak?

- **Soru:** `apps/api/src/` altında bugün `platform`/`reporting`/`tenant-scope`/`audit`/`settings`
  modülleri var, ama Vardiya/Arşiv'e karşılık gelen bir modül **yok**. Wave 4 onaylanırsa yeni bir
  `shift`/`vardiya` modülü mü açılacak, yoksa mevcut bir modülün altına mı alınacak?
- **Kaynak referansı:** `docs/migration/BOTC_ENTITY_DOMAIN_MAPPING.md` §2 (`apps/api/src/`
  dizin yapısı, `VardiyaService.cs`/`ArsivVardiyaService.cs`).
- **Neden gerekli:** Wave 4 implementation task'larının modül sınırlarını ve dosya yerleşimini
  netleştirir.
- **Hangi task'ı bloke ediyor:** Wave 4 implementation planlaması.
- **Önerilen karar:** Yok — mimari/organizasyonel karar.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-E04 — Wave 5 SCADA read-only adapter hangi modülün altına yerleşecek?

- **Soru:** Mevcut `apps/api/src/reporting/dataset` modülü (dataset provider deseni) SCADA
  read-only adapter'ını mı barındıracak, yoksa ayrı bir modül mü açılacak?
- **Kaynak referansı:** `docs/migration/BOTC_ENTITY_DOMAIN_MAPPING.md` §3
  (`apps/api/src/reporting/dataset`, `QueryService.cs`, `DataSourceService.cs`).
- **Neden gerekli:** `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` §4'te tanımlanan hedef mimarinin
  somut modül yerleşimini netleştirir.
- **Hangi task'ı bloke ediyor:** Wave 5 implementation planlaması.
- **Önerilen karar:** Yok — mimari/organizasyonel karar.
- **Product Owner onayı gerekli mi:** **Evet.**

---

## TASK-027.4'te Yeni Tespit Edilen Sorular (Q-T serisi — Tenant/Lokasyon)

### Q-T01 — `MOSBİO KIRIM DEPO` ve `SANTRAL` lokasyonları ayrı tenant node'u mu, yoksa veri alanı mı?

- **Soru:** BOTC'deki 5 vardiya lokasyonundan `MOSBİO` ve `MOSB ENERJİ`'nin doğrudan işletme
  tenant'ının kendisine (D-005) karşılık geldiği makul güvenle söylenebiliyor. `KÖMÜR KAZANI`
  (Discovery §21.1 tablosunda MOSB Enerji'nin bir üretim kaynağı olarak listeleniyor) tenant-içi
  alt-varlık olması muhtemel. Ancak `MOSBİO KIRIM DEPO` ve `SANTRAL` için bu ilişki kod veya
  Discovery'de **açıkça belirtilmemiş**. Bunlar Metnex `tenants` tablosunda ayrı bir alt-tenant
  node'u (`parentId` ile MOSB/MOSBİO'ya bağlı) olarak mı, yoksa yalnızca bir `location`/`facility`
  veri alanı olarak mı modellenecek?
- **Kaynak referansı:** `docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md` §3
  (`VardiyaService.cs`/`ArsivVardiyaService.cs` lokasyon switch-case'i,
  `docs/requirements/DISCOVERY.md` §21.1).
- **Neden gerekli:** Metnex `tenants.parentId` sınırsız derinlik destekliyor (`tenant_closure`
  kapanış tablosu) — her iki seçenek de teknik olarak mümkün, bu bir ürün/veri-modeli kararıdır.
- **Hangi task'ı bloke ediyor:** Wave 4 (Vardiya/Arşiv) veri modeli tasarımı; Q-M06 ile birlikte
  değerlendirilmelidir.
- **Önerilen karar:** Yok — Product Owner kararı.
- **Product Owner onayı gerekli mi:** **Evet.**

---

## TASK-027.5'te Yeni Tespit Edilen Sorular (Q-SC serisi — SCADA/DMS Source Mapping)

### Q-SC01 — `GtEndeks`/`SgEndeks`/`KomurEndeks` MOSEDAŞ mı MOSB Enerji tenant'ına mı ait?

- **Soru:** `IsletmeRaporlariWindow.xaml.cs:369-371`'deki `FromSqlRaw` sorguları, `GtEndeks`/
  `SgEndeks`/`KomurEndeks`'in fiziksel olarak `MOSEDAS` veritabanında olduğunu gösteriyor. Ancak
  `docs/requirements/DISCOVERY.md` §21.1, GT1-3/SG1-3/Kömür Kazanı'nı MOSB Enerji'nin üretim
  varlıkları olarak listeliyor. Bu veri tenant ataması açısından MOSEDAŞ'a mı (veritabanı
  sahipliği), MOSB'a mı (iş/varlık sahipliği) ait sayılacak, yoksa her iki tenant'ın da (farklı
  permission'larla) erişebileceği paylaşılan bir kaynak mı olacak?
- **Kaynak referansı:** `docs/migration/BOTC_SCADA_DMS_SOURCE_MAPPING.md` §2, §3, §4
  (`IsletmeRaporlariWindow.xaml.cs`, `docs/requirements/DISCOVERY.md` §21.1).
- **Neden gerekli:** Wave 5 SCADA adapter'ının tenant-scope kaynak seçimi bu ayrıma bağımlı;
  yanlış tenant ataması MOSB veya MOSEDAŞ kullanıcılarına yanlış/eksik veri gösterebilir.
- **Hangi task'ı bloke ediyor:** Wave 5 SCADA adapter tenant-kaynak eşleme implementasyonu.
- **Önerilen karar:** Yok — iş süreci teyidi (Product Owner/işletme paydaşı) gerektirir.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-SC02 — SCADA verisine iki bağımsız erişim mekanizması var; hangisi Wave 5'in temeli olacak?

- **Soru:** BOTC'de SCADA verisine (A) `DynamicDataSources` + `QueryService` genel akışı ve (B)
  `IsletmeRaporlariWindow`'a özel hardcoded çapraz-veritabanı `FromSqlRaw` sorguları olmak üzere
  **iki bağımsız yol** bulundu. Bu ikisi aynı veriye mi erişiyor, aralarında fark var mı, ve Wave 5
  read-only adapter'ı hangisini temel alacak?
- **Kaynak referansı:** `docs/migration/BOTC_SCADA_DMS_SOURCE_MAPPING.md` §2.
- **Neden gerekli:** İki mekanizmanın tutarsızlığı (ör. farklı filtre/agregasyon davranışı) Wave 5
  implementasyonuna yanlış kaynak seçtirebilir.
- **Hangi task'ı bloke ediyor:** Wave 5 SCADA adapter implementasyonu.
- **Önerilen karar:** Yok — canlı SQL Server erişimi veya paydaş teyidi gerektirir.
- **Product Owner onayı gerekli mi:** Hayır (teknik doğrulama).

### Q-SC03 — SCADA verisi için `ReportDatasetProvider` sözleşmesi genişletilecek mi, ayrı sözleşme mi tanımlanacak?

- **Soru:** Metnex'in var olan `ReportDatasetProvider`/`ReportDatasetRow` sözleşmesi
  (`apps/api/src/reporting/dataset/report-dataset.contract.ts`) finansal/rapor odaklı bir satır
  şekli (`no`/`label`/`occurredAt`/`status`/`quantity`/`unitPrice`/`amount`) kullanıyor. SCADA'nın
  geniş (wide), zaman-serisi kolon yapısı (§5) bu sözleşmeye mi uydurulacak, yoksa SCADA için ayrı
  bir dataset sözleşmesi mi tanımlanacak?
- **Kaynak referansı:** `docs/migration/BOTC_SCADA_DMS_SOURCE_MAPPING.md` §6,
  `apps/api/src/reporting/dataset/report-dataset.contract.ts`.
- **Neden gerekli:** Wave 5 implementasyonunun reporting foundation ile nasıl entegre olacağını
  belirler.
- **Hangi task'ı bloke ediyor:** Wave 5 implementation planlaması.
- **Önerilen karar:** Yok — mimari karar.
- **Product Owner onayı gerekli mi:** Hayır (teknik/mimari karar, ama Wave 5 kapsam netleştirmesinde raporlanmalı).

---

## TASK-027.6'da Yeni Tespit Edilen Sorular (Q-P serisi — BOT_APP PostgreSQL Target Mapping)

### Q-P01 — BOTC `Role`/`Permission` Metnex `tenantRoles` mı, `systemRoles` mı, yoksa karışık mı?

- **Soru:** Metnex'in gerçek PostgreSQL şeması iki ayrı rol modeli sunuyor: tenant-kapsamlı
  `tenantRoles`/`tenantRolePermissions`/`userTenantRoleAssignments` ve platform-kapsamlı
  `systemRoles`/`permissions`/`rolePermissions`/`userSystemRoleAssignments`. BOTC'nin tenant
  kavramı olmayan tek düz `Role`/`Permission` modeli bu ikisinden hangisine (veya `Admin`→
  `systemRoles`, diğerleri→`tenantRoles` gibi bir karışıma) eşlenecek?
- **Kaynak referansı:** `docs/migration/BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §1, §3
  (`apps/api/src/db/schema/platform.ts`).
- **Neden gerekli:** Wave 1 rol/permission migration implementasyonunun hedef tablo seçimini
  belirler; yanlış seçim rol atamalarının tenant izolasyonunu bozabilir.
- **Hangi task'ı bloke ediyor:** Wave 1 rol/permission migration implementasyonu.
- **Önerilen karar:** Yok — mimari/PO kararı.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-P02 — `VisibilitySettings` verisi migration sırasında referans olarak mı sunulacak, atlanacak mı?

- **Soru:** `VisibilitySettings`'in Metnex'in admin-küratörlü allowlist mimarisine **doğrudan
  taşınmayacağı** zaten kararlaştırılmıştı. Ancak BOTC'deki mevcut gizleme verisi (hangi
  `DataSourceName`/`TableName` kombinasyonu gizli) yeni allowlist'i elle kurarken admin'e **bir
  kerelik referans bilgisi** olarak mı sunulacak, yoksa tamamen mi atlanacak?
- **Kaynak referansı:** `docs/migration/BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §7.
- **Neden gerekli:** Wave 5 allowlist kurulum sürecinin BOTC'nin mevcut gizleme kararlarından
  yararlanıp yararlanmayacağını belirler.
- **Hangi task'ı bloke ediyor:** Wave 5 allowlist ilk kurulum task'ı.
- **Önerilen karar:** Yok — operasyonel/PO kararı.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-P03 — `UserPermission`'ın rol-modeline dönüştürülme mekanizması hangi task'ın sorumluluğunda?

- **Soru:** Q-M04 (rol-şablonu mu, birebir atama mı) çözüldükten sonra, BOTC `UserPermission`
  satırlarının seçilen Metnex rol-modeline (`tenantRolePermissions`+`userTenantRoleAssignments`
  veya `rolePermissions`+`userSystemRoleAssignments`) **dönüştürülme mekanizması** (elle mi,
  script ile mi, hangi implementation task'ı kapsamında) henüz atanmamış.
- **Kaynak referansı:** `docs/migration/BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §4, §5.
- **Neden gerekli:** Wave 1 implementation task planlamasının kapsam netliği için gerekli.
- **Hangi task'ı bloke ediyor:** Wave 1 implementation task ayrıştırması (`TASK-027-11`–`19`).
- **Önerilen karar:** Yok — Q-M04 çözüldükten sonra planlama kararı.
- **Product Owner onayı gerekli mi:** Hayır (teknik planlama, Q-M04'e bağımlı).

---

## TASK-027.7'de Yeni Tespit Edilen Soru (Q-P04 — User/Role/Permission Migration Karar Matrisi)

### Q-P04 — `Admin` rolü `TENANT_ADMIN` hardcoded kısayolu mu, satır satır izin ataması mı?

- **Soru:** BOTC'nin `Admin` rolü (`AuthService.LoginAsync:93-100`, tüm izinlere otomatik sahip)
  Metnex'e taşınırken `PermissionGuard`'ın `TENANT_ADMIN` adlı sistem rolüne özel hardcoded
  kısayolu (`permission.guard.ts:56-67`, "bu tenant'ta her şeye izin ver") mu kullanılacak, yoksa
  `Admin`'in o anki tüm izinleri `tenantRolePermissions`'a **açıkça satır satır** mı yazılacak?
  İlki BOTC'nin "yeni izin eklenince Admin otomatik alır" davranışını korur ama ayrıştırılmış izin
  listesi taşımaz; ikincisi ayrıştırılmış ama BOTC'nin otomatik-kapsama davranışını kaybeder.
- **Kaynak referansı:** `docs/migration/BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §2.4
  (`apps/api/src/platform/permission.guard.ts`).
- **Neden gerekli:** Wave 1 rol migration implementasyonunun `Admin` rolü için seçeceği somut
  veri modelini belirler; Q-P01'in "C" seçeneği (karışık model) seçilirse bu soru **doğrudan
  devreye girer**.
- **Hangi task'ı bloke ediyor:** Wave 1 rol/permission migration implementasyonu (Q-P01 "C"
  seçilirse).
- **Önerilen karar:** Yok — mimari/PO kararı, Q-P01'in sonucuna bağımlı.
- **Product Owner onayı gerekli mi:** **Evet** (Q-P01 "C" seçilirse).

---

## TASK-027.8'de Yeni Tespit Edilen Soru (Q-PW01 — Legacy Password/Secret Migration Decision)

### Q-PW01 — Geçici parola/reset bilgisi kullanıcıya hangi kanaldan ulaştırılacak?

- **Soru:** Metnex'in bugün self-servis e-posta tabanlı parola sıfırlama/doğrulama akışı
  **yoktur** (`grep -rln "resetPassword|forgotPassword|password-reset|PasswordReset"` tüm
  `apps/api/src`/`apps/web/src` üzerinde sıfır sonuç verdi; yalnızca admin-driven `setPassword`
  fonksiyonu var). Q-A03'ün Strateji 1 (zorunlu sıfırlama) veya Strateji 2 (ilk girişte kontrollü
  parola) seçenekleri seçilirse, geçici parola/reset bilgisi kullanıcıya **hangi kanaldan**
  ulaştırılacak — yeni bir e-posta altyapısı **önce inşa edilerek**, yoksa yalnızca admin
  sözlü/manuel iletimiyle mi?
- **Kaynak referansı:** `docs/migration/BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §2, §6.
- **Neden gerekli:** Wave 1 migration'ının bir e-posta altyapısı implementasyonunu önkoşul olarak
  gerektirip gerektirmediğini belirler; bu, migration'ın kapsamını ve süresini doğrudan etkiler.
- **Hangi task'ı bloke ediyor:** Wave 1 password migration implementasyonu.
- **Önerilen karar:** Yok — Q-A03'ün sonucuna bağımlı, operasyonel/PO kararı.
- **Product Owner onayı gerekli mi:** **Evet.**

---

## TASK-027.9'da Yeni Tespit Edilen Soru (Q-AD01 — SQL Server Read-only Adapter Architecture)

### Q-AD01 — SCADA sorgu audit kayıtları genel audit log'a mı, ayrı bir tabloya mı yazılacak?

- **Soru:** SCADA/DMS okuma sorguları zaman-serisi/sık-tekrarlanan bir desen olabilir (her
  dashboard yenilemesi potansiyel bir sorgu). Bu sorguların audit kaydı Metnex'in var olan genel
  `platform_audit_log` tablosuna mı yazılacak, yoksa hacim/performans nedeniyle **ayrı, SCADA'ya
  özel bir audit tablosuna** mı yazılacak?
- **Kaynak referansı:** `docs/migration/METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md` §7
  (`apps/api/src/audit/platform-audit.service.ts`).
- **Neden gerekli:** Audit implementasyonunun veri modelini ve genel audit log'un performansını
  etkiler; yanlış seçim genel audit sorgularını yavaşlatabilir veya SCADA audit hacmini kaybettirebilir.
- **Hangi task'ı bloke ediyor:** Wave 5 SCADA adapter audit implementasyonu.
- **Önerilen karar:** Yok — mimari/operasyonel karar.
- **Product Owner onayı gerekli mi:** Hayır (teknik/mimari, ama PO'ya raporlanmalı).

---

## TASK-027.10'da Yeni Tespit Edilen Sorular (Q-MG serisi — Migration Dry-run/Idempotency/Rollback Standard)

### Q-MG01 — Approval gate kim tarafından, hangi arayüzden verilecek?

- **Soru:** Migration yaşam döngüsünün "approval gate" aşaması (dry-run raporunun insan
  tarafından onaylanması) **hangi mekanizmayla** gerçekleşecek — CLI onayı, admin panel butonu,
  yoksa yalnızca `PROGRESS_LOG.md`'ye yazılı onay mı?
- **Kaynak referansı:** `docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`
  §1 (aşama 4).
- **Neden gerekli:** Wave 1/4/5 implementation task'larının approval akışını somutlaştırması için
  gerekli.
- **Hangi task'ı bloke ediyor:** Wave 1 migration implementation (ilk somut migration script'i).
- **Önerilen karar:** Yok — operasyonel/PO kararı.
- **Product Owner onayı gerekli mi:** **Evet.**

### Q-MG02 — Migration run metadata'sı genel audit log'a mı, ayrı bir tabloya mı yazılacak?

- **Soru:** Migration run metadata'sı (dry-run raporları, backup referansları, başlangıç/bitiş
  zamanı) genel `platform_audit_log`'a mı, yoksa (Q-AD01 ile benzer bir hacim gerekçesiyle) ayrı
  bir `migration_runs` tablosuna mı yazılacak?
- **Kaynak referansı:** `docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`
  §9.
- **Neden gerekli:** Audit/migration implementasyonunun veri modelini belirler.
- **Hangi task'ı bloke ediyor:** Wave 1 migration implementation.
- **Önerilen karar:** Yok — mimari/operasyonel karar.
- **Product Owner onayı gerekli mi:** Hayır (teknik/mimari, PO'ya raporlanmalı).

---

## TASK-027.11'de Yeni Tespit Edilen Soru (Q-ID01 — Identity Hedef Modeli ve Migration Staging Schema)

### Q-ID01 — Staging tablosu hangi şemada tutulacak ve retention politikası ne olacak?

- **Soru:** `migration_staging_identity` tablosu (kavramsal tasarım) hangi PostgreSQL şemasında
  tutulacak (ayrı bir `migration` şeması mı, `public` mi) ve migration tamamlandıktan **sonra**
  bu staging verisi silinecek mi, yoksa audit/izlenebilirlik amacıyla **kalıcı olarak** mı
  saklanacak?
- **Kaynak referansı:** `docs/migration/METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`
  §4.
- **Neden gerekli:** Staging tasarımının gerçek Drizzle şemasına dönüştürülmesi için şema
  yerleşimi ve saklama süresi netleşmelidir.
- **Hangi task'ı bloke ediyor:** Wave 1 identity migration implementasyonu (staging şemasının
  gerçek koda dönüştürülmesi).
- **Önerilen karar:** Yok — mimari/operasyonel karar.
- **Product Owner onayı gerekli mi:** Hayır (teknik/mimari, PO'ya raporlanmalı).

---

## Zaten Açık Olan, Bu Task'ta Tekrar Üretilmeyen Sorular (yalnızca referans)

Aşağıdaki sorular hem `../BOTC/DISCOVERY.md` hem `docs/requirements/DISCOVERY.md`'de zaten
kayıtlı ve açıktır; bu task onları **kapatmamıştır**, yalnızca migration mapping'i bu sorulara
bağımlı olduğu için burada listelenmiştir:

| Kaynak | ID | Soru (özet) | Bu migration task'ıyla ilişkisi |
|---|---|---|---|
| `../BOTC/DISCOVERY.md` §7.3 | Q-001 | `appsettings.json` içindeki canlı secret'lar hâlâ geçerli mi? | Migration implementation'ı başlamadan önce bu secret'ların döndürülmüş olması **ön koşuldur** |
| `../BOTC/DISCOVERY.md` §7.3 | Q-002 | Veritabanında hâlâ düz metin parolalı kullanıcı var mı? | Q-A03 ile doğrudan ilişkili |
| `../BOTC/DISCOVERY.md` §7.3 | Q-007 | `FaultRecords`/`TelegramSettings` hâlâ kullanılıyor mu? | Mapping dokümanı §2.5'te "potansiyel ölü kod" olarak işaretlendi, migration kapsamına alınmadı |
| `../BOTC/DISCOVERY.md` §7.3 | Q-010 | Yedekleme/DR planı var mı? | Mimari karar dokümanı §7 (backup/restore ilkesi) buna bağımlı |
| `../BOTC/DISCOVERY.md` §7.3 | Q-011 | ISO denetim izi zorunluluğu var mı? | Wave 1/4 audit tasarımını etkiler |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-001 | MİP root tenant altında kesin tenant ağacı/işletme kodları nedir? | Q-M06 ile doğrudan ilişkili |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-002 | İşletme verileri SQL Server'da hangi seviyede ayrılıyor? | Q-M02 ile doğrudan ilişkili |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-004 | MİP root tenant hangi kullanıcılar için aggregate yetkisine sahip olacak? | Q-M04 ile ilişkili |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-005 | İlk migration'a Vardiya/Arşiv dahil mi? | Wave 4 önceliği, bu dokümanda "aday, onaylanmadı" olarak işlendi |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-006 | `BOT_APP`'te hangi tablolar migrate edilecek, tarihsel veri başlangıç tarihi nedir? | Mapping dokümanı §2.1/§5, mimari karar dokümanı §7'de kısmen ele alındı, tarih kesinleşmedi |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-009 | Kanonik çıktı formatları (saatlik/işletme raporları) nedir? | Wave 5 implementation'ını etkiler, bu task kapsamı dışı |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-010 | Hangi SMTP/Telegram bildirimleri Metnex MVP'sine taşınacak? | Mapping dokümanı §1'de `MOSBIO_TELEGRAM` belirsizliğiyle (Q-M01) kısmen örtüşüyor |
| `docs/requirements/DISCOVERY.md` §7.3 | Q-011 | SCADA/DMS sorguları için timeout/satır/export sınırı nedir? | Mimari karar dokümanı §4 madde 4'te "yeni bir güvenlik kontrolü olarak eklenmeli" denildi, kesin sayılar yok |

---

## Özet Tablo — Yeni Sorular

| ID | Soru (kısa) | Bloke ettiği task | PO onayı |
|---|---|---|---|
| Q-M01 | `MOSBIO_TELEGRAM` gerçek bir DB mi? | Wave 5 kaynak listesi | Hayır (teknik) |
| Q-M02 | `MOSEDAS` kaynak entity/tablo doğrulaması | Wave 5 MOSEDAŞ adapter | Hayır (teknik, PO'ya raporlanır) |
| Q-M03 | `Can*` → Metnex permission adı kesinleşmesi | Wave 1 permission migration | **Evet** |
| Q-M04 | Rol-şablonu mu, birebir atama mı? | Wave 1 rol/permission migration | **Evet** |
| Q-M05 | SCADA canlı mı, read-model/cache mi? | Wave 5 adapter implementation | **Evet** (zaten açık) |
| Q-M06 | Lokasyon → tenant modeli | Wave 4 + Wave 5 lokasyon eşlemesi | **Evet** |
| Q-A01 | Tek-oturum zorlaması Metnex'e taşınacak mı? | Wave 1 session migration | **Evet** |
| Q-A02 | SQL Server read-only kullanıcı hazır mı? | Wave 5 deployment | Hayır (operasyonel) |
| Q-A03 | Zorunlu parola sıfırlama akışı onaylı mı? | Wave 1 password reset task'ı | **Evet** |
| Q-S01 | `Roles`/`Role` tablo adı + FK delete-behavior çelişkisi | Wave 1 rol migration | Hayır (teknik) |
| Q-S02 | Permissions/UserPermissions/VisibilitySettings/MaintenanceRecords/SCADA tabloları canlı DB'de var mı? | Wave 1 permission migration | Hayır (teknik) |
| Q-S03 | `DynamicDataSources` anahtarları hangi fiziksel DB'ye bağlanıyor? | Wave 5 adapter implementation | Hayır (teknik, PO'ya raporlanır) |
| Q-S04 | `DofDbContext`'in SCADA DbSet'leri kullanılıyor mu? | Wave 5 kaynak netliği | Hayır (teknik) |
| Q-E01 | Bellek-içi permission snapshot modeli taşınacak mı? | Wave 1 permission guard | **Evet** |
| Q-E02 | Wave 2/3 servisleri Wave 1 kimliğine bağımlı — cutover'da nasıl korunacak? | Wave 1 migration cutover | **Evet** |
| Q-E03 | Wave 4 için yeni domain modülü mü açılacak? | Wave 4 implementation planlaması | **Evet** |
| Q-E04 | Wave 5 SCADA adapter hangi modüle yerleşecek? | Wave 5 implementation planlaması | **Evet** |
| Q-T01 | `MOSBİO KIRIM DEPO`/`SANTRAL` ayrı tenant node'u mu, veri alanı mı? | Wave 4 veri modeli tasarımı | **Evet** |
| Q-SC01 | GT/SG/Kömür endeksleri MOSEDAŞ mı MOSB tenant'ına mı ait? | Wave 5 tenant-kaynak eşleme | **Evet** |
| Q-SC02 | İki bağımsız SCADA erişim mekanizması — hangisi temel alınacak? | Wave 5 adapter implementasyonu | Hayır (teknik) |
| Q-SC03 | SCADA için ReportDatasetProvider genişletilecek mi, ayrı sözleşme mi? | Wave 5 implementation planlaması | Hayır (mimari, PO'ya raporlanır) |
| Q-P01 | BOTC Role/Permission tenantRoles mı, systemRoles mı? | Wave 1 rol/permission migration | **Evet** |
| Q-P02 | VisibilitySettings verisi referans mı, atlanacak mı? | Wave 5 allowlist ilk kurulumu | **Evet** |
| Q-P03 | UserPermission dönüşüm mekanizması hangi task'ta? | Wave 1 implementation task ayrıştırması | Hayır (Q-M04'e bağımlı) |
| Q-P04 | Admin rolü TENANT_ADMIN kısayolu mu, satır satır izin mi? | Wave 1 rol/permission migration (Q-P01 "C" ise) | **Evet** (koşullu) |
| Q-PW01 | Geçici parola/reset bilgisi hangi kanaldan iletilecek? | Wave 1 password migration implementasyonu | **Evet** |
| Q-AD01 | SCADA sorgu audit kayıtları genel log'a mı, ayrı tabloya mı? | Wave 5 SCADA adapter audit implementasyonu | Hayır (PO'ya raporlanır) |
| Q-MG01 | Approval gate hangi arayüzden verilecek? | Wave 1 migration implementation | **Evet** |
| Q-MG02 | Migration run metadata genel log'a mı, ayrı tabloya mı? | Wave 1 migration implementation | Hayır (PO'ya raporlanır) |
| Q-ID01 | Staging tablosu hangi şemada, retention politikası ne? | Wave 1 identity migration implementasyonu | Hayır (PO'ya raporlanır) |
| Q-V01 | Vardiya lokasyon sahipliği (`KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL`) | Wave 4 Vardiya tenant mapping (TASK-027.23) | **Evet** |
| Q-V02 | Vardiya arşiv retention süresi | Wave 4 arşiv migration (TASK-027.26) | **Evet** |
| Q-V03 | Vardiya `KayitTarihi`/`DefterTarihi` timezone dönüşümü | Wave 4 domain model (TASK-027.22) | **Evet** |
| Q-V04 | `LOCKED`/`FAILED`/`ARCHIVED` hedef modele dahil mi | Wave 4 domain model (TASK-027.22) | **Evet** |
| Q-V05 | Vardiya email hata/provider kararı | Wave 4 email distribution (TASK-027.28) | **Evet** |
| Q-V06 | Vardiya legacy duplicate stratejisi | Wave 4 arşiv migration (TASK-027.26) | **Evet** |
| Q-V07 | `SHIFT:REPORT:*` catalogue eklenmesi + `CanReceiveShiftReportEmail` kod karşılığı | Wave 4 API/servis (TASK-027.24) | **Evet** |
| Q-V08 | Canlı/arşiv permission ayrımı | Wave 4 API/servis (TASK-027.24) | **Evet** |
| Q-V09 | Sunucu-taraflı tamamlanma kilidi | Wave 4 workflow kilitleme (TASK-027.25) | **Evet** |
| Q-V10 | Tek tablo mu, 5 ayrı tablo mu (BOTC lokasyon-tablo deseni) | Wave 4 domain model (TASK-027.22) | **Evet** |
| Q-V11 | Vardiya tablosu `public` mi müşteri-root data-plane şemasında mı (DEC-0010 Phase 5 henüz yok) | Wave 4 domain model/API (TASK-027.22/24) | **Evet** |
| Q-V12 | Vardiya audit'inde tenant izi (`platform_audit_logs` tenant kolonu yok, `metadata`) | Wave 4 API/audit (TASK-027.24/30) | **Evet** |
| Q-V13 | Gerçek SQL Server DDL doğrulaması; Vardiya'da "performans/ölçüm alanı" var mı | Wave 4 domain model (TASK-027.22/26) | **Evet** |
| Q-V14 | `shiftCode` değer kümesi ve uzunluk (canlı 1, arşiv 50) | Wave 4 domain model (TASK-027.22/23) | **Evet** |
| Q-V15 | `OperatorTamAdi` snapshot olarak taşınacak mı | Wave 4 domain model/migration (TASK-027.22/26) | **Evet** |
| Q-V16 | Çözülmemiş (`tenantId NULL`) Vardiya satırlarını kim görür/atar | Wave 4 lokasyon mapping (TASK-027.23) | **Evet** |
| Q-V17 | Tenant çözülemeyen kayıt yazılsın mı (erişime kapalı) yoksa hiç yazılmasın mı | Wave 4 arşiv migration (TASK-027.26) | **Evet** |
| Q-V18 | Tenant-içi lokasyon bazlı görünürlük kısıtı gerekir mi | Wave 4 API (TASK-027.24) | **Evet** |
| Q-V19 | `SHIFT:REPORT:CREATE`/`UPDATE` ayrımı gerekir mi (BOTC `CanManageShifts` tek) | Wave 4 API (TASK-027.24) | **Evet** |

> **Not:** Q-P01, Q-M03, Q-M04, Q-M06, Q-A03 ve Q-PW01 **kapanmıştır** (TASK-027.12-R1,
> 2026-09-17) — tam karar kaydı için aşağıdaki "Karar Kapanışları — Wave 1 Identity
> (TASK-027.12-R1)" bölümüne bakınız. Bu satır yukarıdaki tabloyu **düzenlemeden**, yalnızca
> tablonun sonuna eklenmiştir (append-only).

---

## Karar Kapanışları — Wave 1 Identity (TASK-027.12-R1)

> AI1/Product Owner, TASK-027.12 (User Migration Mapping Implementation) öncesinde bloke olan 6
> karar kapısını (Q-P01, Q-M03, Q-M04, Q-M06, Q-A03, Q-PW01) TASK-027.12-R1 görev talimatıyla
> kapatmıştır (2026-09-17). Bu bölüm her kararı **karar / gerekçe / etkilenen implementation
> task'ları / kalan riskler / rollback ihtiyacı** kalıbıyla kaydeder. Yukarıdaki soruların
> **orijinal metni değiştirilmemiştir** — bu, append-only bir kapanış kaydıdır.

### Q-P01 Kapandı — Role Modeli

- **Karar:** BOTC rolleri (`Admin` dahil) Metnex `tenantRoles`'a taşınacaktır. `systemRoles`
  yalnızca platform yönetimi ve Metnex'e özgü platform rolleri için kullanılacaktır — BOTC
  kaynaklı hiçbir rol `systemRoles`'a taşınmayacaktır (Seçenek A, `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md`
  §2.1).
- **Gerekçe:** Metnex'in gerçek `PermissionGuard` kodu (TASK-027.7'de kanıtlandı), `PLATFORM:`
  prefiksli olmayan hiçbir izin kodunun `systemRoles` üzerinden çözülmediğini gösteriyor —
  Seçenek B/C'nin `systemRoles` kısmı ek guard implementasyonu gerektirirdi. Seçenek A, mevcut
  koda **hiçbir değişiklik yapmadan** çalışır ve Discovery'nin tenant izolasyon ilkesiyle (§2.3)
  tam örtüşür.
- **Etkilenen implementation task'ları:** Wave 1 rol/permission migration implementasyonu
  (henüz numaralandırılmamış, `TASK-027-11`+ aralığında beklenir); `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`
  §4.1/§12 (staging `targetEntityType` artık `tenantRoles` olarak sabit).
- **Kalan riskler:** **Q-P04 artık moot** — yalnızca Q-P01 "C" seçilseydi devreye girerdi, Seçenek
  A seçildiği için bu soru bir daha gündeme gelmeyecektir (kapatılmadı, yalnızca geçersiz hâle
  geldi). Platform-seviyesi (`systemRoles`) rollerin hangi kullanıcılara atanacağı (muhtemelen
  hiçbirine, BOTC'de bu kavram yok) implementation sırasında netleştirilmelidir.
- **Rollback/geri dönüş ihtiyacı:** Yok — henüz hiçbir veri/şema yazılmadı. İleride implementation
  sırasında yanlış hedef seçilirse, ilgili staging kayıtları `FAILED`/`BLOCKED` işaretlenip
  standart dokümanın (`METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`) retry
  mekanizmasıyla yeniden işlenebilir.

### Q-M03 Kapandı — Permission İsimleri

- **Karar:** Mevcut `BOTC_TO_METNEX_MAPPING.md` §2.2'deki taslak `MODULE:RESOURCE:ACTION`
  eşlemesi **kesin** olarak kullanılacaktır. İsimler `permission-catalogue.ts` formatıyla uyumlu
  olacak ve implementation öncesi son mapping dokümanında (bu R1 ile güncellenen belgeler)
  listelenecektir.
- **Gerekçe:** Taslak zaten gerçek `ASSIGNABLE_CATALOGUE` formatına uygun tasarlanmıştı
  (TASK-027.1); yeniden icat etmenin faydası yok, hedef `permissions.code` sütunu serbest `TEXT`
  olduğu için yapısal bir engel de yoktu (yalnızca isimlendirme kararıydı).
- **Etkilenen implementation task'ları:** Wave 1 permission migration implementasyonu;
  `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §3.2.
- **Kalan riskler:** Taslağın "son" (implementation-hazır, tam liste) hâli henüz **üretilmedi** —
  bu R1 taslağı kesin karar olarak işaretler, ama 16 `Can*` izninin tamamının nihai kod-hazır
  listesi implementation task'ının kapsamındadır.
- **Rollback/geri dönüş ihtiyacı:** Yok — yalnızca isimlendirme kararı, geri dönüşü pratikte
  gerektirmeyecek kadar düşük risklidir (izin kodları herhangi bir zamanda yeniden adlandırılabilir).

### Q-M04 Kapandı — UserPermission Dönüşümü

- **Karar:** Kullanıcı başına özel rol **oluşturulmayacaktır**; ortak permission set'lerinden
  tenant-kapsamlı rol şablonları oluşturulacaktır (Seçenek B/2, `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md`
  §4.1).
- **Gerekçe:** Metnex'in rol-bazlı yetkilendirme modeliyle tutarlı; BOTC'nin "rol-bazlı varsayılan
  şablon yok" sorununu (Discovery §7.5 T-001) miras almamak için bilinçli bir tasarım kararı;
  gelecekteki izin değişiklikleri rol üzerinden merkezi yapılabilir hâle gelir.
- **Etkilenen implementation task'ları:** `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`
  §4.1/§12 (`UserPermission`→hedef dönüşüm artık "ortak şablon" yönünde ilerler); **Q-P03 artık
  planlanabilir** (dönüşüm mekanizmasının hangi implementation task'ında ele alınacağı — Q-P03'ün
  kendisi bu R1'de kapatılmamıştır, yalnızca önkoşulu çözülmüştür).
- **Kalan riskler:** İzin kombinasyonlarının **gruplanma/kümeleme algoritması** henüz
  kesinleşmedi — iki kullanıcının neredeyse aynı ama tam aynı olmayan izin setleri tek bir
  şablona zorlanırsa veri kaybı/fazlalık riski (`BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md`
  §4.1'deki "Veri kaybı riski" satırı) hâlâ geçerli — implementation sırasında somut bir kümeleme
  yöntemi tasarlanmalıdır.
- **Rollback/geri dönüş ihtiyacı:** Yok — henüz veri yazılmadı.

### Q-M06 Kapandı — Tenant Ataması

- **Karar:** `Sirket` alanı tenant kaynağı olarak **kullanılmayacaktır**. Tenant ataması, **ayrı,
  onaylı bir mapping tablosu** üzerinden yapılacaktır. Bilinen işletme tenant'ları: **MOSB,
  MOSEDAŞ, MOSBİO**. Belirsiz lokasyonlar (`KÖMÜR KAZANI`, `MOSBİO KIRIM DEPO`, `SANTRAL`) ayrıca
  **karar bekleyen kayıt** olarak tutulacaktır.
- **Gerekçe:** `Sirket` serbest metin, hiçbir sorgu/yetkilendirme kararında kullanılmadığı kod
  kanıtıyla gösterilmişti (`BOTC_MIP_TENANT_LOCATION_MAPPING.md` §2) — güvenilmez. Ayrı bir
  mapping tablosu, `migration_staging_identity`'nin (TASK-027.11) zaten desteklediği
  `tenantMembershipStatus = UNRESOLVED` ara durumuyla doğal olarak uyumludur.
- **Etkilenen implementation task'ları:** `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`
  §8/§9 (tenant ataması mekanizması); Wave 1 tenant ataması implementation task'ı; Wave 4
  (Vardiya) lokasyon-tenant kararı için hâlâ ayrı bir adım gerekiyor.
- **Kalan riskler:** **Bu karar Q-T01'i (ve dolaylı olarak Q-SC01'i) tam olarak kapatmamıştır** —
  yalnızca genel mekanizmayı (ayrı onaylı mapping tablosu) ve 3 bilinen tenant'ı onaylamıştır.
  Belirsiz lokasyonlara bağlı kullanıcılar migration sırasında `tenantMembershipStatus =
  UNRESOLVED` durumunda kalabilir — bu beklenen bir davranıştır (§8.1 üç-katmanlı model), ama
  bu kullanıcıların ne zaman/nasıl çözüleceği (Q-T01) hâlâ açıktır. Mapping tablosunun kendi
  şeması/verisi bu R1'de **üretilmemiştir** (yalnızca kararın kendisi kayıt altına alınmıştır).
- **Rollback/geri dönüş ihtiyacı:** Yok — henüz veri/şema üretilmedi.

### Q-A03 Kapandı — Password Migration

- **Karar:** BOTC `PasswordHash` veya global salt **taşınmayacaktır**. Tüm migrate edilen
  kullanıcılar zorunlu parola sıfırlama/yeniden parola oluşturma akışına tabi olacaktır (Strateji
  1, `BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §4.1) — `passwordStrategy =
  RESET_REQUIRED`.
- **Gerekçe:** Format uyumsuzluğu (BOTC PBKDF2-HMAC-SHA256+global-salt vs. Metnex
  scrypt+per-user-salt) zaten kod kanıtıyla kanıtlanmıştı — birebir taşıma matematiksel olarak
  mümkün değil. Zorunlu sıfırlama, mimari karar dokümanının "auth zayıflıkları taşınmaz"
  ilkesiyle en yüksek uyumu sağlıyor (Strateji 3'ün eski-doğrulama-yolu riskinden kaçınıyor).
- **Etkilenen implementation task'ları:** Wave 1 password migration implementasyonu (`TASK-027-16-password-reset-import-flow.md`
  ile ilişkili); `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.2; `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`
  §10.
- **Kalan riskler:** Strateji 1'in kullanıcı deneyimi kesintisi (her kullanıcı migration sonrası
  erişemez) operasyonel bir risktir — Q-PW01'in kapanmasıyla (aşağıda) bu risk **admin-driven
  manuel kanalla** kısmen azaltılmıştır, ama büyük kullanıcı sayısında ölçeklenebilirlik hâlâ bir
  operasyonel endişedir.
- **Rollback/geri dönüş ihtiyacı:** Yok — henüz implementation yok. İleride yanlışlıkla eski hash
  taşınırsa (kurallara aykırı bir senaryo), `METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`
  §5'teki backup restore stratejisi kullanılabilir.

### Q-PW01 Kapandı — Parola İletişim Kanalı

- **Karar:** Self-servis e-posta reset akışı henüz bulunmadığından, ilk migration aşamasında
  **admin-driven parola atama** (Metnex'in var olan `setPassword` fonksiyonu) kullanılacaktır.
  Self-servis e-posta reset akışı **ayrı bir implementation task'ı** olacaktır (bu R1'in
  kapsamında üretilmemiştir).
- **Gerekçe:** Metnex'te bugün gerçek bir self-servis akış yok (kod taramasıyla kanıtlandı,
  TASK-027.8); yeni bir e-posta altyapısı inşa etmek Wave 1'in kapsamını genişletirdi,
  admin-driven atama var olan kodla **hemen** kullanılabilir.
- **Etkilenen implementation task'ları:** Wave 1 password migration implementasyonu
  (admin-driven akışı kullanacak); gelecekte ayrı bir "self-servis parola reset" implementation
  task'ı (henüz numaralandırılmamış).
- **Kalan riskler:** Admin-driven atamanın operasyonel ölçeklenebilirliği (kullanıcı sayısı
  arttıkça admin'in elle atama yükü) — "zorunlu sıfırlama (Q-A03) + admin-driven ilk atama
  (Q-PW01)" akışının somut kullanıcı deneyimi (kullanıcı geçici parolayı nasıl öğrenir, ne zaman
  değiştirmeye zorlanır) implementation sırasında netleştirilmelidir.
- **Rollback/geri dönüş ihtiyacı:** Yok.

---

## Q-M03 Kapsam Doğrulaması — TASK-027.14 (2026-09-18)

TASK-027.14 (Permission Mapping Coverage and Governance Boundary), Q-M03'ün **karar içeriğini
değiştirmeden** kapsamını doğruladı: onaylı 5 `Can*`→`MODULE:RESOURCE:ACTION` eşlemesi
(`apps/api/src/migration/botc-identity/permission-mapping.ts`) değişmeden korundu, yeni kod
**icat edilmedi**. Mapping coverage raporu (bkz.
`docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` §0-B) 12 BOTC izninin hâlâ eşlenmediğini
(9'u Wave 2/3 nedeniyle bilinçli olarak beklemede, 3'ü Wave 1/4 kapsamında henüz kod ataması
yapılmamış) ve gerçek Metnex `permission-catalogue.ts`'teki (`ASSIGNABLE_CATALOGUE`) 10 kodun
**hiçbirinin** BOTC'den gelmediğini doğruladı — bu iki katalog şu an tamamen ayrık, bu **yeni bir
bulgu değil**, Q-M03'ün zaten "kesin isimler henüz onaylanmadı" bulgusunun sayısal teyididir. Bu
task Q-M03'ü **kapatmadı** — kapsamı yalnızca test/rapor düzeyinde doğruladı, kesinleştirmedi.

---

## Q-M06/Q-T01/Q-S03 Kapsam Doğrulaması — TASK-027.15 (2026-09-18)

TASK-027.15 (Tenant Mapping Coverage and Assignment Governance Boundary), Q-M06'nın **mekanizma
kararını değiştirmeden** kapsamını doğruladı: `tenant-mapping.ts`/`tenant-mapping-adapter.ts`
değişmeden korundu; `Sirket` alanının motorun hiçbir yerinde okunmadığı, hem statik dosya
taramasıyla (`tenant-governance.spec.ts`) hem de davranışsal bir testle (bir kullanıcının
`Sirket`'i bilinen bir tenant adıyla örtüşse bile yalnızca onaylı mapping tablosunun karar
verdiği) doğrulandı. Yeni bir tenant slug'ı, tenant ağacı veya root-aggregate yetkisi **icat
edilmedi** — `TenantScopeService`/`canAggregateChildren`'a hiçbir referans eklenmediği statik
olarak doğrulandı. **Q-T01 ve Q-S03 bu task'ta da kapatılmamıştır**, kapsam dışı kalmaya devam
eder — bilinen belirsiz lokasyon kategorileri (`MOSBİO KIRIM DEPO`/`SANTRAL`/`KÖMÜR KAZANI`/GT-SG)
yalnızca statik bir dokümantasyon referansı olarak coverage raporuna eklendi, karar verilmedi
(bkz. `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §10).

---

## Wave 4 Vardiya — Yeni Açık Sorular (TASK-027.21, 2026-09-18)

TASK-027.21 (Vardiya SRS ve Migration Mapping), `../BOTC`'nin Vardiya/Arşiv Vardiya kaynak kodunu
(`BOT.Domain/{VardiyaRaporuBase,ArsivVardiyaRaporuBase}.cs` ve 5 lokasyon entity'si,
`BOT.Services/{VardiyaService,ArsivVardiyaService}.cs`) satır satır inceleyerek 10 yeni soru
tespit etti — tam gerekçe ve kod kanıtı için `docs/migration/BOTC_VARDIYA_METNEX_TARGET_MAPPING.md`
§11'e bakınız, burada yalnızca özet listelenmiştir:

- **Q-V01** — Vardiya lokasyon sahipliği: `KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL` hangi
  tenant'a ait olacak? (Q-T01'in Vardiya'ya özgü somutlaşması) | **PO onayı gerekir**
- **Q-V02** — Arşiv retention süresi ne olacak? | **PO onayı gerekir**
- **Q-V03** — `KayitTarihi`/`DefterTarihi` saat dilimi dönüşümü nasıl yapılacak? | **PO onayı
  gerekir**
- **Q-V04** — `LOCKED`/`FAILED`/`ARCHIVED` (kaynakta doğrudan karşılığı olmayan önerilen
  durumlar) hedef modele dahil edilecek mi? | **PO onayı gerekir**
- **Q-V05** — Email dağıtımında hata sessizce yutulmaya devam mı edecek; hangi email/SMTP
  provider kullanılacak? | **PO onayı gerekir**
- **Q-V06** — Legacy kayıtların duplicate stratejisi Wave 1'in `sourceChecksum` deseniyle mi,
  yoksa Vardiya'ya özgü ek bir kuralla mı ele alınacak? | **PO onayı gerekir**
- **Q-V07** — `SHIFT:REPORT:UPDATE`/`SHIFT:REPORT:VIEW` gerçek `permission-catalogue.ts`'e ne
  zaman eklenecek; `CanReceiveShiftReportEmail`'in hedef kod karşılığı nedir? | **PO onayı
  gerekir**
- **Q-V08** — `CanManageShifts`/`CanViewShiftReports` canlı+arşiv için aynı mı kalacak, yoksa
  ayrıştırılacak mı? | **PO onayı gerekir**
- **Q-V09** — BOTC'de yalnızca UI-seviyesinde uygulanan "tamamlanmış rapor kilidi"
  (kaynak: `VardiyaService.SaveReportAsync`'in `IsCompleted` kontrolü olmadan güncelleme yapması)
  Metnex'te sunucu-taraflı olarak da zorunlu kılınacak mı? | **PO onayı gerekir** (öneri: evet)
- **Q-V10** — BOTC'nin 5 ayrı tablosu Metnex'te tek tabloya (lokasyon kolonuyla) mı yoksa 5 ayrı
  tabloya mı dönüştürülecek? | **PO onayı gerekir**

**Kritik bulgu (karar değil, koddan doğrulandı):** Vardiya/Arşiv Vardiya için **hiçbir EF Core
migration dosyası yok** — 5 fiziksel tablo (`vardiyamuhendisi`/`mosbenerji`/`mosbio`/`komurkazani`/
`mosbiokirimdepo`) migration sistemi dışında oluşturulmuş olmalı; gerçek SQL Server şeması bu
ortamdan `[DOĞRULANAMADI]`. Ayrıca: Vardiya modülünde `MOSEDAŞ`'a hiçbir kod referansı yok (görev
talimatının listelediği 7 lokasyondan yalnızca 5'i Vardiya'da gerçekten var); "GT/SG fiziksel
kaynakları" Vardiya raporu değil, ayrı bir SCADA (Wave 5) kavramıdır.

Bu task Q-T01/Q-S03/Q-ID01/Q-P02'yi **kapatmamıştır** — yalnızca Q-T01'in Vardiya'ya özgü
somutlaşması olarak Q-V01'i eklemiştir.

Özet tablosuna 10 yeni satır eklendi.

---

---

## Wave 4 Vardiya — Domain Model Karar Paketi Soruları (TASK-027.22, 2026-09-18)

Tam gerekçe: `docs/migration/BOTC_VARDIYA_DOMAIN_MODEL_DECISION_PACKAGE.md`. **Hiçbiri kapatılmadı;
Q-V01–Q-V10 açık kalır. Q-V10 için AI2 önerisi (Seçenek A) yalnızca öneridir, karar PO/AI1'indir.**

- **Q-V11** — DEC-0010'a göre iş verisi müşteri-root data-plane şemasında olacak, Phase 5-9 henüz
  uygulanmadı (`DB_META.md`). Vardiya tablosu `public`'te mi, data-plane şemasında mı? | **PO/AI1**
- **Q-V12** — `platform_audit_logs` tenant kolonu taşımıyor; Vardiya audit'inde tenant bilgisi
  `metadata`'da mı tutulacak, yoksa tenant kolonu mu eklenecek? | **PO/AI1**
- **Q-V13** — Vardiya DbContext'lerinin migration'ı yok; gerçek DDL alınmalı. Ayrıca task talimatındaki
  "performans alanları" kaynak kodda yok — var mı? | **PO (DDL erişimi)**
- **Q-V14** — `shiftCode` değer kümesi nedir; canlı `MaxLength(1)` vs arşiv `MaxLength(50)` neden? | **PO**
- **Q-V15** — `OperatorTamAdi` denormalize snapshot olarak taşınsın mı (önceki mapping "taşınmaz"
  demişti; operatörü çözülemeyen kayıtlar için yeniden değerlendirme)? | **PO**
- **Q-V16** — `tenantId NULL`/`scopeStatus≠RESOLVED` satırlarını kim yönetir (yeni root yetkisi icat edilmedi)? | **PO**
- **Q-V17** — Tenant çözülemeyen kayıtlar yazılıp erişime mi kapatılsın, yoksa hiç yazılmasın mı? | **PO/AI1**
- **Q-V18** — Aynı tenant'ın birden çok lokasyonunda lokasyon bazlı görünürlük kısıtı gerekir mi? | **PO**
- **Q-V19** — `CanManageShifts` tek permission'ı Metnex'te `CREATE`/`UPDATE` olarak ayrışsın mı? | **PO**
- **Ek notlar (Q-V03/Q-V09):** `DefterTarihi` takvim günü mü zaman damgası mı; `COMPLETED` raporun
  yeniden açılması (`COMPLETED→DRAFT`) kaynakta yok, gerekir mi?

### Q-V10 Karar Kapanışı — 2026-09-18

Q-V10, AI1/PO kararıyla **A — tek `shift_reports` tablosu + `locationCode`** olarak kapatıldı.
Gerekçe: beş BOTC tablosu kod kanıtına göre ortak şemadadır; ayrı tablolar fiziksel tenant
izolasyonu sağlamaz; A daha düşük migration/API/test yüzeyi sunar ve lokasyona özel alan ihtiyacı
doğarsa C'ye additive evrim mümkündür. B seçeneği uygulanmayacaktır.

Bu kapanış üretim şeması, migration veya seed kararı değildir. Q-V01–Q-V09 ve Q-V11–Q-V19,
Q-T01/Q-S03/Q-ID01/Q-P02 açık kalır.

---

## Wave 4 Vardiya — Lokasyon–Tenant Mapping Karar Paketi Soruları (TASK-027.23, 2026-09-19)

Tam kanıt/seçenek: `docs/migration/BOTC_VARDIYA_LOCATION_TENANT_MAPPING_DECISION_PACKAGE.md`.
**Q-T01, Q-V01, Q-S03, Q-V16, Q-V18 (ve diğer açık sorular) kapatılmadı**; AI2 yalnızca öneri sundu
(belirsiz lokasyonlarda `tenantId=NULL` + `PENDING_APPROVAL/UNRESOLVED`; unresolved yönetimi için
yeni yetki icat edilmeden mapping düzeltme + yeniden çözümleme; lokasyon bazlı permission üretilmedi).

- **Q-V20** — MOSB/MOSBİO/MOSEDAŞ tenant kayıtları hedef ortamda mevcut mu (`apps/` içinde seed/
  bootstrap bulunamadı; slug'lar yalnızca Wave 1 migration motorunda sabit)? Mapping onayından önce
  tenant oluşturma kimin/hangi task'ın işi? | **PO/AI1**
- **Q-V21** — Lokasyon→tenant mapping kayıtları nerede tutulacak (konfigürasyon, `public` control-plane
  tablosu, data-plane şeması — Q-V11'e bağlı) ve onay hangi audit ile izlenecek? | **PO/AI1**
- **Q-V22** — `effectiveFrom`'un geçmiş kayıtlara etkisi; `RESOLVED` satırın sonradan başka tenant'a
  taşınması (reassignment) politikası ve `supersedes` ilişkisi gerekli mi? | **PO/AI1**
- **Ek bulgu (karar değil):** `isSystemAdmin` hem `TenantMembershipGuard` hem `PermissionGuard`'ı
  geçer (`tenant-membership.guard.ts:44`, `permission.guard.ts:32`); ancak `TenantScopeService.resolve()`
  `PLATFORM_ROOT` için 403 verdiğinden veri düzlemi okuması bu yoldan açılmaz — TASK-027.30'da test edilmeli.

---

## Wave 4 Vardiya — API/Service Contract Soruları (TASK-027.24, 2026-09-19)

Kanıt/etki: `docs/migration/METNEX_SHIFT_REPORT_API_SERVICE_CONTRACT.md` ve `..._BLOCKER.md`. **Q-V07, Q-V08,
Q-V11, Q-V16, Q-V18, Q-V19, Q-V20, Q-V21, Q-V22 (ve diğer açık sorular) kapatılmadı;** production API/service
implementasyonu bu kapılar ve şema yokluğu nedeniyle **bloklu**.

- **Q-V23** — Etkileşimli create için idempotency anahtarı (`clientRequestId`) mekanizması: uygulamada mevcut
  bir idempotency-key kuralı yok (yalnızca migration motoru), BOTC'de de yok. Anahtar var mı, kapsamı/ömrü nedir? | **PO/AI1**
- **Q-V24** — Audit hata politikası: `PlatformAuditService.log()` tablo yoksa sessiz atlar, diğer hatalarda
  fırlatır. Vardiya işleminde audit yazımı başarısızsa işlem geri alınsın mı (aynı transaction) yoksa best-effort mi? | **PO/AI1**
- **Ek bulgular (karar değil):** (1) `TenantScopeService`'in üretim kodunda henüz tüketicisi yok — ShiftReport
  ilk data-plane tüketicisi olur (Q-V11 doğrudan etkiler). (2) `PermissionGuard`, `TENANT_ADMIN` sistem rolü
  olan kullanıcıya belirli permission kodunu aramadan izin verir; gelecekteki Vardiya permission'ları için de
  geçerli (TASK-027.30'da belgelenmeli). (3) `@RequirePermission` verilmeyen endpoint guard'ta `true` döner
  (fail-open) — Vardiya endpoint'leri permission kodu olmadan yayınlanmamalı.

---

## Wave 4 Vardiya — PostgreSQL Schema Placement Karar Paketi Soruları (TASK-027.25, 2026-09-21)

Tam kanıt/matris: `docs/migration/METNEX_SHIFT_REPORT_POSTGRES_SCHEMA_DECISION_PACKAGE.md` ve `..._SCHEMA_BLOCKER.md`.
**Bu task hiçbir soruyu kapatmadı.** Q-V11, Q-V20, Q-V21, Q-ID01, Q-V12 için karar matrisi ve AI2 önerisi sunuldu; nihai
seçim **AI1/PO'dadır** (durum: AÇIK — karar bekleniyor). Q-V10 (tek tablo) korunmuştur.

AI2 önerileri (karar değil): Q-V11 → C (iş verisi data-plane, metadata `public`; Phase 5 altyapısı ön koşul); Q-V21 → `public`
mapping tablosu, tenant `tenantId` FK ile bağlı; Q-ID01 → düzleme göre staging (identity `public`, Vardiya payload data-plane),
ledger kalıcı/payload kısa ömürlü, süre PO; Q-V12 → `metadata.tenantId` şimdi, tenant kolonu ihtiyaç doğarsa ayrı additive migration;
Q-V20 → repodan cevaplanamaz `[DOĞRULANAMADI]`, apply öncesi preflight + `BLOCKED` kuralı, tenant oluşturulmaz.

- **Q-V25 (yeni)** — Wave 1'in mantıksal tenant anahtarları (`MOSB`/`MOSEDAS`/`MOSBIO`) gerçek tenant kimliğiyle nasıl bağlanacak?
  Gerçek tenant oluşturma slug'ı küçük harfe çevirir ve alt tenant slug'ını ebeveyn önekiyle birleştirir (`composeTenantSlug`), yani
  `tenantSlug='MOSB'` hiçbir gerçek slug'la eşleşmez. Bağlama `tenantId` ile mi, slug konvansiyonu ile mi, ayrı bir logical-key
  tablosu ile mi? | **PO/AI1**
- **Bulgu F1 (karar bekliyor; Q-V17 ile birlikte)** — TASK-027.22 taslağı `tenantId`'yi nullable bırakmıştı; `DB_META.md` Tenant
  Isolation Standard madde 1 her tenant-owned tabloda `tenantId NOT NULL` ister. AI2 önerisi: `tenantId NOT NULL`, çözülmemiş/
  pending/conflict satırlar staging'de kalır, `shift_reports`'a yalnızca RESOLVED satır terfi eder (Q-V17'yi kapatmaz).
- **Bulgu F2** — Data-plane altyapısı yok (`DATA_PLANE_SCHEMA_VERSION='0000_empty'`, `pgSchema` kullanımı yok, fan-out runner yok);
  ShiftReport ilk data-plane tüketicisi olur ve DEC-0010 Phase 5'i tetikler.
- **Bulgu F5** — `PLATFORM_ROOT` `resolve()`'da 403 aldığından data-plane'deki mapping/staging/unresolved kayıtlarını doğrudan
  yönetemez; mapping'in yeri Q-V16 (unresolved yönetimi) ile operasyonel olarak çakışır.

---

## Data-Plane Foundation ve Migration Fan-out Soruları (TASK-027.26, 2026-09-21)

Kanıt/matris: `docs/migration/METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md`, `..._MIGRATION_FANOUT_STANDARD.md`,
`..._DATA_PLANE_READINESS_BLOCKER.md`. **Bu task hiçbir soruyu kapatmadı.** Q-V11, Q-V20, Q-V21, Q-ID01, Q-V25, Q-V16, Q-V12 için data-plane
perspektifinden durum ve AI2 önerisi sunuldu (Q-V11 → Seçenek C = DEC-0010'un yazılı tasarımı; Q-V21 → `public` mapping/ledger; Q-V16 → yeni bypass
yok, mapping düzeltme + yeniden çözümleme; Q-V12 → `metadata.tenantId`); nihai karar **AI1/PO'dadır** (hepsi AÇIK).

- **Q-DP01** — Sürüm geçidi ve provisioning tutarlılığı: schema bekleyen data-plane migration'ın gerisinde kalırsa müşterinin data-plane
  endpoint'leri fail-closed olsun mu (`resolve()` davranışı değişir)? Yeni müşteri boş schema (`0000_empty`) ile `ACTIVE` olmalı mı, yoksa tüm mevcut
  data-plane migration'ları uygulandıktan sonra mı? | **AI1/PO**
- **Q-DP02** — Fan-out tetikleyici ve yetkisi: deploy pipeline adımı, yönetici CLI veya başlangıç? Hangi kimlik çalıştırır (yeni yetki icat edilmeden)?
  Canary/eşik/retry sayısı/timeout değerleri? | **AI1/PO**
- **Q-DP03** — (D1) `ensureSchemaProvisioned` `ARCHIVED` registry satırını sessizce yeniden `ACTIVE` yapıyor; kasıtlı mı, düzeltilecek mi, sahibi kim? | **AI1**
- **Q-DP04** — (D2) `FAILED` registry için otomatik retry sahibi (job/endpoint/CLI); bugün tek çağıran tenant oluşturma akışı | **AI1/PO**
- **Q-DP05** — Sertleştirme: schema ayrıcalık sınırı değil (tek DB rolü/pool). Müşteri-başına rol (`SET LOCAL ROLE`) veya RLS (DEC-0010 §12 ertelemişti)
  ne zaman? Başlangıç yalnızca uygulama katmanı disiplini (`schemaName` yalnızca `resolve()`'dan + statik test) mi? | **PO/AI1**
- **Q-DP06** — DEC-0010 metin güncellemesi (§8 "Prisma control-plane" ifadesi DEC-0011 ile eski) ve Phase 5-9 kapsam tanımı (Phase 7-9 belgesiz) | **AI1**
- **Q-DP07** — `apps/api/drizzle.config.ts` varsayılan bağlantı bilgisi kod içinde sabit (değer bu belgelere kopyalanmadı); üretim/CI'da `DATABASE_URL`
  zorunlu kılınsın mı? | **AI1**
- **Ek bulgu D4 (karar değil):** `TenantScopeService.resolve()` closure ↔ `customerRootId` tutarlılığını doğrulamıyor; schema-per-customer altında veri
  sızdırmaz ama tutarsız veri sessiz kalır (guard önerisi, yeni scope mekanizması değil).

---

## Data-Plane Karar Kapıları Kapanış Paketi (TASK-027.27, 2026-09-21)

Karar matrisleri ve AI2 önerileri: `docs/migration/METNEX_DATA_PLANE_DECISION_GATE_CLOSURE_PACKAGE.md` (Karar Formu §14: **"AI1/PO KARARI" sütunu boş**);
remediation planı: `docs/migration/METNEX_DATA_PLANE_REGISTRY_HARDENING_PLAN.md`. **Bu task hiçbir soruyu kapatmadı.** Kapı durumları — hepsi **AÇIK, AI1/PO kararı bekliyor**:
Q-V11 (AI2 önerisi C), Q-V20 (salt-okuma preflight + BLOCKED), Q-V21 (`public` mapping tablosu), Q-V25 (`externalKey`→`tenantId` onaylı mapping; büyük harfli/ebeveynsiz anahtar slug gibi kullanılmaz),
Q-ID01 (düzleme göre ayrım; süreler PO), Q-DP01 (ayrı sürüm geçidi, `resolve()` sözleşmesi korunur), Q-DP02 (ayrı migration job yürütür; pipeline ince adım; ilk üretim run'ları manuel onay; startup yok;
runner yetkisi `isSystemAdmin`/PLATFORM_ROOT değildir), Q-DP03 (explicit reactivation, `ensureSchemaProvisioned` ARCHIVED'ı reddeder), Q-DP04 (platform operasyonu, önce manuel CLI; limit/backoff PO),
Q-DP05 (H1 + DB hijyeni; H2 ayrı karar; **yeniden adlandırma:** H1 uygulama, H2 müşteri-başına rol, H3 uygulama+RLS), Q-DP06 (Phase 5-9 tablosu + DEC amendment taslağı), Q-DP07 (production'da fallback reddi, geliştirmede loopback+non-production).

Yeni bulgu ve soru:
- **D9 / Q-DP08 (yeni)** — `pipeline.yml` deploy adımı `node apps/api/dist/migrate.js` çağırıyor; `apps/api/src`'de kaynak, `apps/api/dist`'te dosya yok, `Dockerfile` üretmiyor
  (pipeline çalıştırılmadığından çalışma zamanı sonucu `[DOĞRULANAMADI]`). Control-plane migration'ın üretimde uygulanma mekanizması nedir; tek doğru giriş noktası (programatik migrator) ve
  sahibi kim? | **AI1**
- **D10** — `PROVISIONING` durumunda takılma (upsert sonrası, DDL öncesi çökme): zaman aşımı eşiği **PO kararı gerekli** (sayı uydurulmadı); retry aracına dahil (Q-DP04).
- **Q-DP07 kapsam genişlemesi:** sabit varsayılan bağlantı bilgisi yalnızca `drizzle.config.ts`'de değil `apps/api/scripts/check-db.js`'de de var (değer kopyalanmadı).
- **DEC çelişkileri (Q-DP06):** DEC-0010 "Phase 5-9" ↔ DEC-0011 "Phase 5-7"; fan-out DEC-0010 §9'da Phase 5, talimat taslağında Phase 7; DEC-0010 §8/Consequences (Prisma/iki ORM) ve §12 RLS gerekçesi eski;
  DEC-0011 `demo.ts` referansı DEC-0012 ile eski; Phase 7-9 içeriği belgesiz. **DEC dosyaları değiştirilmedi.**

---

## Migration Entrypoint, Pipeline Tetikleme ve Bağlantı Güvenliği (TASK-027.28, 2026-09-21)

Belgeler: `docs/migration/METNEX_MIGRATION_ENTRYPOINT_PROVENANCE.md`, `METNEX_PIPELINE_MIGRATION_TRIGGER_DECISION_PACKAGE.md`, `METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md` (karar formları **boş**).
**Bu task Q-DP02, Q-DP07, Q-DP08'i kapatmadı; üçü de AÇIK, AI1/PO kararı bekliyor.**

**Q-DP08 (provenance bulguları, karar değil):** `dist/migrate.js` kaynaksız, `dist`'te yok, `Dockerfile` üretmiyor, image'da bulunmaz; Prisma kalıntısı olduğuna dair kanıt **yok** — runbook §7 onu `packages/db/migrations/*.sql` +
`platform._migration_log` kullanan özel bir SQL çalıştırıcı olarak anlatıyor (`packages/` dizini ve tablo mevcut değil; `extract-db-meta.sh`, `recreate-db-with-icu.sh`, `DB-METADATA-TEMPLATE.md` aynı eski düzene atıf yapıyor);
dönemi `[DOĞRULANAMADI]` (depoda hiç commit yok). Pipeline deploy adımı `set -euo pipefail` altında olduğundan migration satırı başarısız olup **deploy'un durması** beklenir (sessiz gerilik değil; çalıştırma/run geçmişi `[DOĞRULANAMADI]`).
**TASK-027.27 R8 düzeltmesi:** "üretim şeması geride kalır" senaryosu pipeline yolunda oluşmaz (deploy durur), yalnızca pipeline dışı elle deploy'da geçerlidir. AI2 önerisi (karar değil): programatik Drizzle migrator giriş noktası
(`src/migrate.ts` → `dist/migrate.js`, drizzle-kit ile **aynı** takip tablosu `drizzle.__drizzle_migrations`); **oluşturulmadı**. Karar: hedef giriş noktası (drizzle-kit image'da mı / programatik migrator), runbook güncellemesi.

**Q-DP02 (tetikleme ve yetki; AI2 önerisi):** startup migration yok (kalıcı); control-plane için ayrı pipeline migration işi + onay kapısı (O5) + migrator giriş noktası; data-plane için ayrı fan-out runner (O6) elle/onaylı;
acil için manuel CLI (O4); runner kimliği migration'a özel DB kimliği — `isSystemAdmin`/PLATFORM_ROOT/`TENANT_ADMIN` runner yetkisi **değildir**. Sayısal parametreler **PO kararı gerekli** (sayı uydurulmadı).
Control-plane/data-plane/fan-out/identity/Vardiya/arşiv migration türleri ayrı giriş noktaları olmalı (parametresiz çalıştırma hiçbir şey yapmaz).

**Q-DP07 (bağlantı politikası; AI2 önerisi):** production'da fallback tamamen yasak + fail-fast; geliştirmede yalnızca `NODE_ENV≠production` **ve** loopback, tek paylaşılan yardımcıda; kaynaktaki sabit dize kaldırılsın; `db.service.ts` fail-fast; pipeline'da geçişli/`--env-file`
ve dar kapsamlı secret; ayrı migration/uygulama DB kimliği; `.dockerignore`. Gerçek bağlantı değerleri hiçbir belgeye yazılmadı.

**Yeni bulgular (karar bekliyor):**
- **P6** — Pipeline `concurrency` `cancel-in-progress: true`: çalışan deploy/migration adımı yeni push ile iptal edilebilir; migration işi için env başına `cancel-in-progress: false` grup önerisi.
- **S1–S6** — sabit bağlantı dizesi iki dosyada (gitleaks yakalar mı `[DOĞRULANAMADI]`); `DATABASE_URL` eksikse `db.service.ts`'te `pg` kütüphane varsayılanlarına düşme ihtimali; pipeline `source` ile geniş secret + argv genişletmesi;
  `.dockerignore` yok (yerel build bağlamında `.env`); ortak DB kimliği (DDL yetkili uygulama).
- **P1–P5** — runbook §6-7 ve `DB-METADATA-TEMPLATE.md` eski çalıştırıcıyı anlatıyor; `recreate-db-with-icu.sh` var olmayan `platform._migration_log`'u okuyor; `dev.sh` her çalıştırmada `db:generate` çağırıyor; CI'da migration artifact doğrulaması yok.

---

## Migration ve Runtime DB Bağlantı Güvenliği — Uygulama (TASK-027.29, 2026-09-21)

**Q-DP07:** AI1 bu task'ın talimatında kararı verdi (`DATABASE_URL` her ortamda zorunlu, sabit fallback yok, fail-fast, gerçek değer loglanmaz/raporlanmaz; geliştirmede de zorunlu, sessiz localhost/default yok) ve AI2 bunu **uyguladı**
(`drizzle.config.ts`, `scripts/check-db.js`, `src/db/db.service.ts`, `src/db/database-url.ts`, pipeline env aktarımı, `.dockerignore`, 38 test). **Durum: uygulandı, kapanış onayı AI1'de** (AI2 kendi başına kapatmadı).
Eski öneri P-2 (geliştirmede loopback istisnası) AI1 kararıyla **geçersiz**.

**Q-DP02 ve Q-DP08 AÇIK, kapatılmadı.** Migration entrypoint'i oluşturulmadı; `dist/migrate.js` üretilmedi; pipeline'daki `node apps/api/dist/migrate.js` çağrısı olduğu gibi duruyor (hedef dosya yok — pipeline migration adımı başarısız olmaya devam eder, deploy durur).
Yalnızca **secret aktarım yöntemi** değişti (allowlist + özel env-file); tetikleme modeli, giriş noktası, onay kapısı, `concurrency` (P6) ve ayrı migration DB kimliği kararları bekliyor.

**Yeni:** **Q-DP09** — `--env-file` değeri argv/süreç listesi/workflow loglarından çıkarır ama migration container'ının `Config.Env`'i `docker inspect`'te görünür; `docker stack deploy` interpolasyonu değerleri servis tanımına yazar (mevcut tasarım).
Dosya-bağlama (`*_FILE`) deseni + uygulama desteği ve Docker secrets kullanımı istenir mi? Ayrıca sunucudaki `.env` biçimi (`KEY=VALUE`, kabuk genişletmesi yok) `[DOĞRULANAMADI]` — ilk dev deploy'unda doğrulanmalı. | **AI1/PO**
**Ayrı migration DB kimliği** (Q-DP05/Q-DP02 ile): belgelendi (`METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md` §9), **oluşturulmadı**; önerilen env adı `MIGRATION_DATABASE_URL` henüz hiçbir kod tarafından okunmuyor.

### Q-DP07 Karar Kapanışı — 2026-09-21

Q-DP07, AI1 kararıyla kapatıldı ve TASK-027.29'da uygulandı: `DATABASE_URL` her ortamda
zorunludur; sabit bağlantı fallback'i yoktur; eksik/hatalı değer fail-fast olur; gerçek değer
loglanmaz veya raporlanmaz. Geliştirmede de sessiz localhost/default fallback kullanılmaz.
Q-DP02 ve Q-DP08 açık kalır; Q-DP09 yeni açık risk olarak izlenir.

---

## Control-Plane Migration Entrypoint ve Pipeline Migration Job — Uygulama (TASK-027.30, 2026-09-21)

**Q-DP08 (kaynaksız `dist/migrate.js`):** AI2 çözümü uyguladı — `apps/api/src/migrate.ts` gerçek kaynak, `nest build` `apps/api/dist/migrate.js` üretiyor (doğrulandı), Dockerfile build aşamasında artifact'i zorunlu kılıyor, pipeline çağrısı artık gerçek artifact'e eşleniyor
(30 test). **Durum: uygulandı — kapanış AI1 onayına bağlı** (AI2 kendi başına kapatmadı). Gerçek migration/Docker build/run çalıştırılmadı.

**Q-DP02 (tetikleme/yetki):** **Control-plane kısmı uygulandı** (ayrı `migrate` işi, prod Environment onayı, env başına `cancel-in-progress: false` grubu, startup migration yok, kullanıcı yetkisiyle ilişkisiz, DB advisory lock). **Açık kalan kısımlar:**
(a) data-plane fan-out tetikleyicisi/yetkisi (ayrı runner, insan onaylı, canary), (b) sayısal parametreler (canary boyutu, hata eşiği, retry sayısı, timeout — PO), (c) ayrı migration DB kimliği (`MIGRATION_DATABASE_URL`, hiçbir kod tarafından okunmuyor).
Bu nedenle Q-DP02'nin **tamamının** kapatılması AI1 kararıdır; AI2 önerisi: control-plane kapsamı kapatılıp (a)–(c) ayrı soru(lar)a devredilsin.

**Q-DP09 AÇIK (değişmedi):** `--env-file` değeri `docker inspect` (container `Config.Env`) üzerinden görünür kalır; `docker stack deploy` interpolasyonu değerleri servis tanımına yazar. `*_FILE`/Docker secrets desteği bu task'ta uygulanmadı.

**Dikkat gerektiren yan etkiler (karar/bilgi):** (1) workflow düzeyindeki `cancel-in-progress` yalnızca PR'lar için `true` (P6 giderildi; push'lar artık kuyruğa girer); (2) `migrate` ve `deploy` işleri aynı Environment'ı kullandığından prod'da **onay iki kez** istenir;
(3) `.env` biçim varsayımı (`KEY=VALUE`) ve pipeline'ın runner'da çalıştırılamaması `[DOĞRULANAMADI]` (TASK-027.29'dan devreden) — **ilk dev deploy'unda doğrulanmalı**; (4) runbook `deployment.md` §6-7 ve `DB-METADATA-TEMPLATE.md` eski çalıştırıcıyı hâlâ anlatıyor (doküman borcu).

### Q-DP08 Karar Kapanışı — 2026-09-21

Q-DP08, TASK-027.30 ile kapatıldı: `apps/api/src/migrate.ts` gerçek control-plane
entrypoint'idir; `nest build` `apps/api/dist/migrate.js` üretir; Dockerfile artifact'i
build aşamasında zorunlu kılar ve pipeline migration job'ı artifact'i DB erişiminden önce
doğrular. Eski kaynaksız çağrı artık gerçek build çıktısına eşlenmiştir.

Q-DP02 yalnızca control-plane kapsamı için uygulanmıştır; data-plane fan-out tetikleyicisi,
yetkisi, sayısal parametreleri ve ayrı migration DB kimliği açık kalır. Q-DP09 açık kalır.

---

## Customer Schema Registry State Safety — Uygulama Sınırı (TASK-027.31, 2026-09-21)

**Q-DP03 (ARCHIVED reactivation) — uygulama sınırı:** AI1 kararıyla `ensureSchemaProvisioned` `ARCHIVED` satırı **reddeder** (`SCHEMA_ARCHIVED`), DDL çalıştırmaz, satır yazmaz; ikinci katmanda geçiş doğrulayıcısı `ARCHIVED→PROVISIONING`'i de reddeder. **Açık reactivation akışı uygulanmadı** — onaylayan, audit ve rollback
kararı hâlâ açık (ayrı gelecek task). Q-DP03'ün "sessiz yeniden aktivasyon" kısmı giderildi; kapanış kararı AI1'de.

**Q-DP04 (FAILED retry) — uygulama sınırı:** `FAILED`/`PROVISIONING` erişime **kapalı** ve hiçbir okuma yolu terfi ettirmez (test kanıtlı). **Retry sahibi, limit, backoff, otomatik job/CLI uygulanmadı.** `lastError`/log artık DB metni içermez. **AÇIK — AI1 kararı gereken nokta:**
`ensureSchemaProvisioned`'ın *açık çağrıda* `FAILED`/`PROVISIONING` satırı idempotent yeniden sürmesi (DEC-0010 §4, mevcut davranış) korundu (otomatik değildir; tek çağıranı tenant oluşturma). Bu yol, fiilen "elle retry" sayılabilir; **reddedilsin mi, yoksa Q-DP04'ün retry mekanizması gelene kadar korunsun mu?**

**Q-DP01 (sürüm geçidi):** AÇIK, uygulanmadı; yalnızca tanı sözleşmesinde "ACTIVE + sürüm bilinmiyor → VERSION_GATE_BLOCKER". **Q-DP10 (yeni):** Registry tanısı için salt-okuma `RegistryPhysicalSchemaProbe` implementasyonu (fiziksel schema varlığı sorgusu), stale `PROVISIONING` eşiği (çağıran verir; sayı PO) ve
tanının hangi süreçte (izleme/preflight/CLI) çalışacağı — hepsi açık.
**Bildirim (davranış değişikliği):** provisioning başarısızlığında dış hata artık `InternalServerErrorException({ code: 'SCHEMA_PROVISIONING_FAILED' })`; `lastError` biçimi `Error [SQLSTATE]: schema provisioning failed`.

---

## Data-Plane Foundation ve pgSchema Sözleşmesi (TASK-027.32, 2026-09-21)

Belge: `docs/migration/METNEX_DATA_PLANE_FOUNDATION_CONTRACT.md`. **Q-DP01, Q-DP03, Q-DP04, Q-DP09 kapatılmadı**; etkileri:
- **Q-DP01 (sürüm geçidi) AÇIK:** runner'da yalnızca *migration sıralama ön koşulu* var (registry sürümü taban/zincir üyesi olmalı, aksi `VERSION_GATE_BLOCKER`); uygulama erişim yolunda çalışma zamanı sürüm geçidi **uygulanmadı** (`dataPlaneSchemaFor` sürüme bakmaz).
- **Q-DP03 (ARCHIVED reactivation) AÇIK:** ARCHIVED runner'da bloklanır; reactivation akışı yok.
- **Q-DP04 (FAILED retry) AÇIK:** FAILED/PROVISIONING runner'da bloklanır; retry sahibi/limit/backoff/job/CLI yok.
- **Q-DP09 (secret dosyası/`docker inspect`) AÇIK:** bu task'ta secret/bağlantı yok; çözüm uygulanmadı.
- **Q-DP02 (data-plane kısmı) AÇIK:** çok müşterili fan-out tetikleyicisi/yetkisi, sayısal parametreler ve ayrı migration DB kimliği uygulanmadı; runner sözleşmesi yalnızca açık tek customer-root ile çalışır ve hiçbir yetki (kullanıcı/rol) girdisi kabul etmez.
**Yeni:** **Q-DP11** — gerçek port implementasyonları (registry `get`/`compareAndSetVersion`, ledger, advisory lock, executor, fiziksel schema probe): ledger'ın yeri (Q-ID01 ile bağlı), kilit granülaritesi (root başına mı, ayrıca global mi), executor'ın transaction sınırı ve fan-out standardındaki VERIFY aşamasının (uygulanan sürümün nesne doğrulaması) nerede modelleneceği — bugün sözleşmede yok, sürüm her migration sonrası CAS ile ilerliyor. | **AI1/PO**
**Q-DP12** — data-plane migration tanımlarının kaynağı/konumu (kod içi liste mi, ayrı klasör mü; control-plane `drizzle/migrations`'tan ayrı olmalı), checksum politikası ve **customer-root id'nin UUID zorunluluğunun** teyidi (bugün tenant id'leri `generateId()` UUID'dir; UUID dışı id'ler runner'da reddedilir). | **AI1**

---

## Data-Plane Port, Ledger ve Migration Kaynağı Karar Paketi (TASK-027.33, 2026-09-21)

Belge: `docs/migration/METNEX_DATA_PLANE_PORT_AND_LEDGER_DECISION_PACKAGE.md` (12 konu; her biri için kanıt, seçenekler, güvenlik/izolasyon/operasyon etkisi, geri dönüş maliyeti, AI2 önerisi ve **boş AI1/PO KARARI** alanı). **Bu task hiçbir soruyu kapatmadı; hiçbir kod/tablo/migration oluşturulmadı.**

**Q-DP11 alt kararları (hepsi AÇIK, AI2 önerisi karar değildir):** (a) registry portu → B: migration kimliğiyle ince repository, koşullu tek `UPDATE`, status yazımı yok; (b) fiziksel probe → `pg_namespace` parametreli, yalnızca runner/tanı; (c) advisory lock → root başına oturum kilidi + fan-out global kilidi, iki-int anahtar;
(d) ledger yeri → **bölünmüş:** uygulanmış-takip customer schema'da (DDL ile aynı transaction'da), run ledger `public`'te; (e) retention/PII → sabit alan allowlist'i, serbest metin yok, takip kalıcı, run ledger süresi PO (sayı yok); (f) executor tx → migration başına tek transaction (DDL+takip); (g) VERIFY → ayrı salt-okuma stage, CAS'tan önce.
**Q-DP12 alt kararları (AÇIK):** (a) kaynak → `apps/api/drizzle/data-plane/*.sql` + tek yer tutucu (control-plane'den ayrı); (b) checksum → LF-normalize sha256 + commit'li manifest testi + `.gitattributes`, uygulanmış sürüm değişmez, düzeltme = yeni sürüm; (c) UUID → katı UUID + hedef ortamda salt-okuma preflight.
**Q-ID01 ilişkisi:** kayıt sınıfları ayrıştırıldı (1 uygulanmış-takip, 2 run ledger, 3 identity staging, 4 Vardiya payload staging/legacy ledger); bu paket yalnızca 1–2'yi karara sunar, **3–4 (Q-ID01) kapatılmadı ve etkilenmedi**.
**Q-DP02 (data-plane fan-out) etkisi:** sürücü ayrı bileşen (registry'den `ACTIVE` root'ları keşfeder, her root için runner'ı açık root ile çağırır); F2 pipeline işi (+CLI acil) önerisi; ilk data-plane migration'ı gelene kadar ölü adım olacağından o migration ile birlikte planlanmalı; canary/eşik/retry/timeout **PO kararı gerekli**.
**Q-DP05 ilişkisi:** kimlik ayrımı (I3 hedef) rol/GRANT tasarımı gerektirir — Q-DP05 açık kalır.
**Sözleşme etkisi:** `recordApplied`'ın executor transaction'ına taşınması ve VERIFY için `verifier` portu/`VERIFY_FAILED` (karar sonrası; şimdi değiştirilmedi).

**Yeni:** **Q-DP13** — customer schema sahipliği ve provizyon kimliği (`CREATE SCHEMA` bugün uygulama kimliğiyle; ayrı migration kimliği için schema'lar kim tarafından oluşturulacak/sahiplenecek, `ALTER OWNER`/GRANT gerekir mi). | **AI1/PO**
**Q-DP14** — Hedef ortam teyidi `[DOĞRULANAMADI]`: production PostgreSQL sürümü (`to_regnamespace` için ≥ 9.5), bağlantı havuzlayıcı var mı (transaction-pooling oturum kilidi/`SET LOCAL` ile uyumsuz), `infra/docker/init-db.sql`'deki eski şablon schema'larının (`platform`, `shared`, `customer_root`) amacı ve `cust_*` adlandırmasıyla çakışma/kullanım durumu. | **AI1/PO (DB erişimi olan sahip)**
**Ek bulgular (karar değil):** drizzle migrator hash'i normalizasyonsuz `sha256(dosya)` ve repoda `.gitattributes` yok (CRLF/LF farkı sahte checksum uyuşmazlığı); Dockerfile `drizzle/` klasörünü bütün olarak kopyaladığından `drizzle/data-plane/` ek değişiklik olmadan image'a girer ve control-plane migrator'a karışmaz; `DbService` tek uygulama havuzu olduğundan migration kimliğiyle çalışacak portlar ayrı havuz ister.

---

## Data-Plane Hedef Ortam Readiness Evidence (TASK-027.34, 2026-09-21)

Belge: `docs/migration/METNEX_DATA_PLANE_TARGET_ENVIRONMENT_READINESS.md`. **Yalnızca yerel dev PostgreSQL'den salt-okuma kanıt** (production'a bağlanılmadı); **hiçbir soru kapatılmadı**.

- **Q-DP14 — KISMEN KANITLANDI, AÇIK (prod kısmı):** dev PG **16.15**; dev'de **doğrudan bağlantı** (tek backend PID, PgBouncer/pooler repoda ve compose'da yok); `platform`/`shared`/`customer_root` schema'ları **var ama tamamen boş** (0 ilişki, 0 fonksiyon) ve kodda **kullanılmıyor**
  (yalnızca `scripts/db/recreate-db-with-icu.sh`'de var olmayan `platform._migration_log` referansı); `init-db.sql` dev **ve** infra compose'unda `docker-entrypoint-initdb.d`'ye bağlı. **Production sürümü/pooler/eski schema içeriği `[DOĞRULANAMADI]`.**
- **Q-DP13 — AÇIK:** dev'de tek rol `metnex` (superuser+`BYPASSRLS`, DB sahibi); tüm non-system schema'lar ona ait, `public` `pg_database_owner`; **customer schema yok** → customer schema sahipliği gözlenemedi (çıkarım: provizyon uygulama rolüyle → `metnex`). Sahiplik değiştirilmedi.
- **Q-DP12 — AÇIK:** dev tenant id'leri **2/2 UUID** (n=2, düşük güven); üretici gerçek ROOT id'si için uyumlu `cust_…` adı üretiyor; UUID dışı id yok. Prod preflight'ı gerekli.
- **Q-DP11 — AÇIK:** `pg_namespace`/`pg_roles` PUBLIC SELECT, advisory-lock fonksiyonları PUBLIC EXECUTE, `to_regnamespace` mevcut → probe/lock için ek yetki gerekmez (dev). `information_schema.schemata` görünümü yetkiye göre süzer (görünüm tanımı kanıtlı) → probe için uygun değil; düşük yetkili rolde ampirik doğrulama `[DOĞRULANAMADI]` (rol oluşturmak yasak).
- **Q-DP05 — AÇIK:** tek rol superuser+`BYPASSRLS` → RLS bu rolle etkisiz; kimlik ayrımı için rol oluşturma gerekir (yapılmadı). **Q-ID01 — AÇIK:** etkilenmedi (`drizzle` schema'sı control-plane migration takibine ait, data-plane takibi orada tutulmamalı).

**Yeni:** **Q-DP15** — ROOT tenant oluşturma yolları tutarsız: `TenantService.create` (admin API, `parentId` yoksa `type='ROOT'`) registry/schema **provizyonu çağırmıyor**; yalnızca `SaasService.createCustomerTenant` çağırıyor. Dev'de tek ROOT tenant'ın registry satırı ve schema'sı **yok** (`customer_schema_registry` 0 satır) → o root data-plane'de sessizce fail-closed.
Hangi yol izlenmeli (tek yol/zorunlu provizyon/`FAILED`-benzeri görünür durum)? ROOT'un dev'de hangi yolla oluşturulduğu `[DOĞRULANAMADI]`. | **AI1/PO**
**Q-DP16** — Eski `init-db.sql` schema'ları (`platform`, `shared`, `customer_root`) ve `platform._migration_log` referanslı script'in akıbeti (koru/temizle/güncelle); prod içeriği `[DOĞRULANAMADI]`. | **AI1/PO**
**Ek bulgular (karar değil):** `lock_timeout`/`statement_timeout`/`idle_in_transaction_session_timeout` = 0 (sınırsız) → runner kendi zaman aşımlarını ayarlamalı (sayılar PO); `drizzle` schema'sında 3 uygulanmış migration (repodaki 3 dosya).

---

## ROOT Tenant Provisioning Consistency (TASK-027.35, 2026-09-21)

**Q-DP15 — kod düzeyinde giderildi (kapanış AI1 onayına bağlı):** `TenantService.create` artık `parentId` olmadan hiçbir ROOT açmaz; `ROOT_PROVISIONING_REQUIRED` (400, statik mesaj) ile DB'ye dokunmadan reddeder ve ROOT dalı koddan kaldırıldı. Tek ROOT ataması `SaasService.provisionCustomer`'dadır
(`POST platform/saas/customers/provision`), provizyon (`ensureSchemaProvisioned`) tenant transaction'ından sonra çağrılır ve sonuç yalnızca başarıda döner. Delege **edilmedi**: resmi akış paket + yönetici + abonelik ister, generic istek yalnızca `name`/`slug` taşır. Çocuk/STANDARD oluşturma korundu. 26 test.
**Adlandırma düzeltmesi:** önceki belgelerde (TASK-027.26/34 dahil) `ensureSchemaProvisioned`'ın çağıranı `SaasService.createCustomerTenant` diye anılmıştı; doğru metot **`provisionCustomer`**'dır (`createCustomerTenant` müşteri yöneticisinin STANDARD alt tenant açtığı metottur, ROOT oluşturmaz). Bu satır önceki referansların düzeltmesidir; eski belge metinleri tarihsel kayıt olarak değiştirilmedi.
**Yeni Q-DP17:** (a) resmi akış DEC-0010 §10 gereği iki adımlı — provizyon başarısızsa ROOT (yönetici/abonelik dahil) `FAILED` registry ile kalır, istek hata döner, aynı istek tekrarlanınca e-posta/slug çakışması (409) alır ve `FAILED` ROOT'u iyileştirecek yol yoktur (Q-DP04); atomik yapı (provizyonu aynı transaction'a almak/telafi silmesi) DEC-0010 §10'u değiştirir — karar? (b) `apps/web/.../system/tenants/page.tsx` "Tenant oluştur" formu (`{name, slug}` → generic API) artık daima `ROOT_PROVISIONING_REQUIRED` alır: form kaldırılsın mı, müşteri provizyon akışına mı yönlendirilsin? (c) dev'deki registry'siz mevcut ROOT için backfill/provizyon kararı (Q-V20/D8). | **AI1/PO**

---

## Platform Tenant UI ROOT Provisioning Boundary (TASK-027.36, 2026-09-21)

**Q-DP17(b) — UI düzeyinde giderildi (kapanış AI1 onayına bağlı):** `system/tenants` formu artık yalnızca alt tenant (zorunlu üst tenant seçimi; gövde `{parentId, name, slug?}`, `type`/yetenek alanı yok) oluşturur; `ROOT_PROVISIONING_REQUIRED` teknik olmayan mesajla, bilinmeyen hatalar güvenli fallback ile gösterilir. Backend değişmedi. **Q-DP17(a) ve (c), Q-DP04 açık.**
**Yeni Q-DP18 — müşteri (ROOT) provizyonu için web ekranı yok:** `POST platform/saas/customers/provision` (`PLATFORM:CUSTOMER:PROVISION`) çağıran hiçbir UI yok; bu yüzden "provisioning ekranına yönlendir" seçeneği uygulanamadı ve sahte CTA eklenmedi. `/system` kartının yanıltıcı "provisioning başlat" metni düzeltildi. Ekran gerekli mi (paket, yönetici e-posta/şifre/ad; şifre politikası)? | **AI1/PO**
**Yeni Q-ENV01 — web lint çalışmıyor (önceden var):** `eslint-plugin-react-hooks` `apps/web`'den çözümlenemiyor (isolated linker, `publicHoistPattern: []`); `check.sh` web lint'i turbo cache replay'i ile geçiyordu, kaynak değişince ortaya çıktı. Bu task'ta yalnızca çalıştırma-başına `NODE_PATH` + `TURBO_ENV_MODE=loose` ile doğrulandı; kalıcı çözüm (web devDependency veya public-hoist) bağımlılık düzenini değiştirir → karar. | **AI1**
**UI çalışma zamanında doğrulanmadı** (tarayıcı/backend+DB yok; tip/lint/test/build ile doğrulandı). Kapatılan soru yok.

---

## Customer ROOT Provisioning UI (TASK-027.37, 2026-09-21)

**Q-DP18 — kod düzeyinde karşılandı (kapanış AI1 onayına bağlı):** `system/tenants` sayfasına "Müşteri Provision Et" modalı eklendi; `POST platform/saas/customers/provision` DTO'suyla birebir (`companyName`, `companySlug?`, `packageId`, `adminEmail`, `adminDisplayName`, `adminPassword`, `notes?`), paketler API'den, `type`/yetenek alanı yok, parola yalnızca form state'inde (başarıda/kapanışta temizlenir), hatalar statik ve güvenli. **Q-DP17 UI'da gizlenmedi:** provizyon hatasında "müşteri kaydı oluşmuş olabilir" uyarısı gösterilir, aynı bilgilerle tekrar denenmemesi söylenir; UI'dan FAILED ROOT retry/iyileştirme yoktur. Q-DP17(a)(c), Q-DP04 açık.
**Yeni Q-DP19 — provision DTO/parola politikası backend'de doğrulanmıyor:** `ProvisionCustomerDto` yalnızca TypeScript `interface`; ValidationPipe yok; `hashPassword` politika uygulamıyor (yalnızca paket/e-posta/slug varlık kontrolleri). Frontend'deki 12 karakter + tekrar kuralı geçici AI2 varsayımıdır; nihai parola politikası ve backend doğrulama (sınıf-tabanlı DTO/pipe) kararı gerekli. | **AI1/PO**
Ek: başarılı yanıtta schema durumu alanı yok (201 = provizyon başarılı); Q-ENV01 açık (gate geçici workaround ile koşuldu); UI tarayıcıda doğrulanmadı. Kapatılan soru yok.

---

## Customer Provisioning Backend Validation (TASK-027.38, 2026-09-21)

**Q-DP19 — kod düzeyinde giderildi (kapanış AI1 onayına bağlı):** `SaasService.provisionCustomer` girişte `validateProvisionCustomerInput` (saf domain doğrulayıcı) çalıştırır; geçersiz girdide DB'ye hiç dokunulmaz (select/insert/transaction/hash/`ensureSchemaProvisioned` yok), 400 + statik mesajlar (girdi/parola/hash/şema/DB bilgisi yok). Parola politikası **canonical `validatePasswordStrength`** (8–128, büyük+küçük+rakam); TASK-027.37'deki geçici frontend "12 karakter" kuralı kaldırıldı, web aynası (`password-policy.ts`) API validator'ıyla mesaj düzeyinde parite testiyle korunur. Q-DP17/ARCHIVED/generic-ROOT davranışı değişmedi. 88 API + 16 web testi.
**Yeni Q-DP20 — DTO doğrulaması sistemik değil:** `createPackage`, `CustomerAdminCreateTenantDto`, `CustomerAdminCreateUserDto`, `AddMembershipDto` vb. hâlâ düz interface (ValidationPipe yok); yalnızca ilgili servis içi ad-hoc kontroller var. Global `ValidationPipe`/class-validator (yeni bağımlılık) mi, endpoint-endpoint domain doğrulayıcı mı? | **AI1/PO**
Açık: Q-DP17(a)(c), Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill. Kapatılan soru yok.

---

## Platform DTO Validation Boundary (TASK-027.39, 2026-09-21)

**Q-DP20 — kod düzeyinde giderildi (kapanış AI1 onayına bağlı):** platform modülündeki düz interface DTO'ları (`createPackage`, customer-admin tenant/user/membership/update/set-password, platform user create/update/set-password/assign-role/membership, tenant create/update/add-member, role create/assign-permission, `me/active-tenant`, login/bootstrap tür koruması, tenant/user list query) saf `platform-input.domain.ts` validator'larıyla, servis girişinde DB/hash/transaction/audit öncesi doğrulanır; statik mesajlar, nesne/dizi/NoSQL girdileri reddedilir, parola canonical `validatePasswordStrength`. Yeni framework/dependency yok. Generic ROOT fail-closed, izinler ve tenant scope değişmedi. 278 test.
**Yeni Q-DP21 — doğrulama kapsamı ve uygulama boşlukları:** (a) `dto/mfa.dto.ts` `class-validator` dekoratörleri taşıyor ama **hiçbir global ValidationPipe kayıtlı değil** → dekoratörler uygulanmıyor; MFA (auth) yüzeyi bu task'ta değiştirilmedi; (b) `settings/*` ve `perf/*` gövdeleri `platform/` dışında, doğrulanmadı; (c) `revokeRole/removeMembership/suspend/archive/deactivate/impersonate` gibi yalnızca `:id` alan uçlar ve `X-Tenant-Id` header'ı id-format doğrulamasına alınmadı; (d) paket kodu formatı (`^[A-Z0-9][A-Z0-9_-]*$`) konservatif varsayım, PO teyidi gerekli. | **AI1/PO**
Ek: doğrulama scope kontrolünden önce çalıştığı için geçersiz girdide scope-dışı çağıran 400 alır (izin guard'ı yine önce). Açık: Q-DP17(a)(c), Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill. Kapatılan soru yok.

**R1 (TASK-027.39-R1, 2026-09-21):** Q-DP21(d) düzeltildi — `createPackage.code` için kanıtsız regex ve 2–50 sınırı **kaldırıldı**; validator yalnızca tür/trim/min 2 (mevcut servis davranışı) uygular, paket kodu formatı/üst sınırı **açık AI1/PO kararıdır** ve mevcut paket verisi DB'ye bağlanılmadan varsayılmadı. Not: paket `name` ≤100 ve `description` ≤500 sınırları da koddan kanıtlı değil (tenant/user validator'larından türetildi), değiştirilmedi. Q-DP21 (a)(b)(c) (MFA/settings/perf/`:id`-only uçlar) açık; Q-ENV01 workaround'u aynen.

**R2 (TASK-027.39-R2, 2026-09-21):** `createPackage` için paket `name` ≤100 ve `description` ≤500 sınırları (kanıtsızdı) kaldırıldı; validator tür/trim/mevcut min-2 (name) uygular. Paket alanı üst sınırları (code/name/description) açık AI1/PO kararıdır (Q-DP21d kapsamında). Q-DP21 ve Q-ENV01 açık.

---

## MFA / Settings / Perf Input Validation (TASK-027.40, 2026-09-21)

**Q-DP21 (a)(b)(c) — kod düzeyinde giderildi (kapanış AI1 onayına bağlı):** MFA gövdeleri (DTO dekoratörleri `ValidationPipe` olmadığı için hiç çalışmıyordu; sözleşme saf validator'a taşındı), platform/tenant settings upsert gövdeleri, tenant settings `X-Tenant-Id` biçimi (I/O'suz `TenantHeaderFormatGuard`, JwtAuthGuard sonrası, DB'li guard'lardan önce) ve perf query/path/body girdileri controller sınırında doğrulanır; yetkisiz çağrı doğrulamadan önce 403 alır; yeni framework/dependency/global pipe yok; 242 test. Yalnızca kodda/şemada/UI'da kanıtlı kurallar uygulandı.
**Q-DP21d (genişletildi) — kanıtsız kural kararları açık:** ayar alanlarında maks. uzunluk, e-posta/URL biçimi, `port` aralığı, `providerType` enum'u; perf'te `from<=to`, `route` uzunluğu, `statusCode` aralığı, `slowRequestThresholdMs` alt/üst sınırı (UI `min=100` yalnızca UI); paket format/limit (TASK-027.39). Testler bu değerlerin kabul edildiğini sabitler. `reporting/*` ve diğer `X-Tenant-Id` tüketicilerinde biçim doğrulaması yok. | **AI1/PO**
**Yeni Q-DP22 — MFA yetki boşluğu (GÜVENLİK, YÜKSEK ÖNCELİK, DEĞİŞTİRİLMEDİ):** `POST auth/mfa/admin/:userId/reset` yalnızca `AuthGuard('jwt')` ile korunuyor; controller'da `@RequirePermission`/`isSystemAdmin`/scope kontrolü yok, `MfaService.adminResetMfa` yetki denetlemiyor, global `APP_GUARD` yok → koda göre oturum açmış herhangi bir kullanıcı başka bir kullanıcının MFA'sını kapatabilir. Ayrıca `GET/PATCH auth/mfa/policy` route'unda `:tenantId` parametresi yok → uçlar sabit `{ mfaRequired: false }` döner, `setTenantPolicy` hiç çalışmaz (ölü uç; erişilebilir kılınırsa aynı yetki boşluğu). Bu task "MFA iş mantığı/mevcut davranış değişmesin" dediği için yalnızca `:userId` biçim doğrulaması eklendi. Yetki modeli (hangi izin/rol; tenant-scope), ölü policy uçlarının akıbeti ve mevcut MFA reset'lerinin denetimi kararı gerekli; gerçek HTTP ile yeniden üretilmedi (kod okuması). | **AI1/PO — acil**
Açık: Q-DP17(a)(c), Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill. Kapatılan soru yok.

**R1 (TASK-027.40-R1, 2026-09-21) — Q-DP22 kod düzeyinde giderildi (kapanış AI1 onayına bağlı):** `POST auth/mfa/admin/:userId/reset` artık fail-closed: controller'da `isSystemAdmin` (yetki reddi girdi doğrulamasından önce) ve `MfaService.adminResetMfa` içinde controller'dan bağımsız ikinci kontrol — actor DB'den yeniden okunur, `ACTIVE` + `isSystemAdmin` değilse 403; ardından hedef doğrulaması (400/404); yazma ve audit yalnızca bundan sonra. Tenant admin/normal kullanıcı reset edemez; yetkisiz istekte MFA yazımı ve audit yok; audit'te actor+target korunur, secret/OTP yok. Yeni permission kodu uydurulmadı (izin kataloğunda MFA kodu yok) → geçici kural yalnızca `isSystemAdmin`. 25 test; mutasyon kontrolü ile kanıtlı.
**Açık alt kararlar:** **Q-DP22a** — kalıcı permission modeli (yeni MFA-reset izni mi, mevcut `PLATFORM:USER:UPDATE` mi, müşteri yöneticisinin kendi root'undaki kullanıcıyı resetlemesi gerekli mi); **Q-DP22b** — `auth/mfa/policy` uçları ölü (`:tenantId` route'u yok): (A) olduğu gibi, (B) route'u düzeltip erişilebilir kıl (önce yetki tasarımı; `MfaRequirementService` bu ayarı tükettiği için login davranışı değişir → PO), (C) kaldır; öneri: yetki tasarımından sonra ayrı görevde (B), o zamana kadar (A); **Q-DP22c** — admin reset'in `mfaVerified` istememesi, sysadmin'in kendi MFA'sını resetleyebilmesi, impersonation oturumunda `request.user`'ın hedef olması. **Geçmiş kötüye kullanım denetimi:** gerçek ortamlarda `MFA_ADMIN_RESET` audit kayıtlarında `isSystemAdmin` olmayan actor'lar aranmalı (DB'ye bağlanılmadı). Benzer "yalnızca kimlik doğrulaması" desenli başka uçlar için sistematik tarama önerilir. Q-ENV01 workaround'u aynen; gerçek HTTP/DB denemesi yok.

---

## Authenticated Endpoint Authorization Audit (TASK-027.41, 2026-09-21)

Belge: `docs/migration/METNEX_AUTHORIZATION_ENDPOINT_AUDIT_AND_MFA_POLICY_DECISION.md`. Denetim/karar task'ı: **hiçbir davranış değiştirilmedi, hiçbir soru kapatılmadı.** 90 endpoint envanteri statik testle sabitlendi.
**Yeni Q-DP23 — KRİTİK/YÜKSEK yetki bulguları (düzeltilmedi, karakterizasyon testli; gerçek ortamda yeniden üretilmedi):** **F1 CRITICAL** customer-admin hesap ele geçirme zinciri (`customer-admin/users/:id/memberships` hedef kullanıcıyı kapsamsız arar + `set-password` `isSystemAdmin` hedefini dışlamaz ve audit yazmaz; ön koşul: bir root'ta TENANT_ADMIN + hedef UUID); **F2 HIGH** `customer-admin/users` yanıtlarında `passwordHash` sızıntısı; **F3 MEDIUM** `GET auth/me` kendi hash'ini döndürür; **F4 MEDIUM (latent)** platform kullanıcı yönetiminde hedef/actor ayrıcalık kuralı yok (sysadmin parola sıfırlama, SYSTEM_ADMIN atama); **F6 MEDIUM** saas/tenant/role/settings/perf mutasyonlarında audit yok. **Öneri: ayrı, acil TASK-027.41-R1 remediation** (hedefi kapsamlı çöz + sysadmin hedef reddi + audit + güvenli projeksiyon; yeni permission/bypass yok) — AI1/PO onayı ve numaralandırma kararı bekliyor. Gerçek ortamda geçmiş kötüye kullanım incelemesi (audit'siz işlemler için erişim/uygulama logları) AI1/PO kararı.
**Q-DP22b — karar paketi hazır (kapatılmadı):** `auth/mfa/policy` route'unda `:tenantId` yok → hep 200 `{mfaRequired:false}`, yetkisiz ve ölü; ek olarak `MfaEnforcementGuard`/`@RequireMfaSetupComplete` hiçbir endpoint'e uygulanmamış, login yalnızca kullanıcının kendi MFA'sına bakar → tenant/rol MFA politikası bugün zorlama üretmez. Seçenekler A/B/C/D + AI2 önerisi (şimdilik A; yetki+enforcement kararından sonra D/B; istenmiyorsa C) ve boş karar alanı raporda §5. **Q-DP22c — karar paketi hazır (kapatılmadı):** mfaVerified, self-reset, impersonation, tenant-admin reset, permission kodu, geçici sınırın süresi; raporda §6.
Açık: Q-DP22a (kalıcı permission modeli; F4 ile birlikte), Q-DP21d, Q-DP17, Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill.

**R1 (TASK-027.41-R1, 2026-09-21) — Q-DP23 F1/F2/F3 kod düzeyinde giderildi (kapanış AI1 onayına bağlı; TASK-027.41 ve R1 `review`):** customer-admin `memberships`/`set-password`/`PATCH users/:id` hedefi yalnızca çağıranın aktif customer-root ağacında aranır (404) ve sistem yöneticisi hedefi reddedilir (403); kendi parolasını değiştirme yasağı korundu; customer-admin create/update yanıtları ve `GET auth/me` whitelist projeksiyonu döndürür (`validateJwtPayload` artık hash taşımaz); customer-admin kullanıcı oluşturma/güncelleme/parola sıfırlama/üyelik ekleme (ve reddi) actor, hedef, tenant/root, sonuç ve impersonator ile audit'lenir, credential yok. **Ek bulgu (düzeltildi):** `platform/users` yanıtları (liste/detay/create/update/deactivate) `PLATFORM:USER:VIEW` sahiplerine (VIEWER dahil) tüm kullanıcıların `passwordHash`'ini sızdırıyordu (`toUserRow` satırı olduğu gibi döndürüyordu). Yeni permission/bypass/route yok. 28 test + mutasyon kontrolleri.
**Hâlâ açık:** **Q-DP23-F4** (platform user-admin: sistem yöneticisi hedefinin parola sıfırlanması ve `SYSTEM_ADMIN` atamasında actor ayrıcalık kuralı yok; Q-DP22a ile), **F6'nın kalanı** (saas/tenant/role/settings/perf audit), **operasyonel:** gerçek ortamda geçmiş kötüye kullanım incelemesi ve olası hash ifşası için parola rotasyonu/oturum iptali değerlendirmesi (AI1/PO; DB'ye bağlanılmadı). Q-DP22b/c, Q-DP21d, MFA enforcement kararları açık ve dokunulmadı. Q-ENV01 workaround'u aynen.

---

## Platform User-Admin Privilege Boundary (TASK-027.42, 2026-09-21)

**Q-DP23-F4 — kod düzeyinde giderildi (kapanış AI1 onayına bağlı):** `platform/users` yedi mutasyonu (`PATCH users/:id`, `set-password`, `deactivate`, `roles` ekle/kaldır, `memberships` ekle/kaldır) actor'ı DB'den yeniden okuyan (`ACTIVE`) tek yetki noktasına (`assertMayAdminister`) bağlandı: sistem yöneticisi hedefi yalnızca ACTIVE sistem yöneticisi tarafından yönetilebilir; **global** rol atama/geri alma (`tenantId` null — `SYSTEM_ADMIN`'in tek kapsamı ve `PLATFORM:*` izinlerinin değerlendirildiği kapsam) yalnızca sistem yöneticisi tarafından yapılabilir; impersonation ek yetki vermez (oturum öznesinin DB satırı esastır; audit'e `impersonatorUserId`); başarı audit'i zorunlu, ret/hata audit'i best-effort (`result` + statik `reason`); yanıtlar güvenli görünüm; yeni permission/route/bypass yok; 34 test + mutasyon kontrolleri.
**Yeni Q-DP24 — kalıcı yetki modeli (AI1/PO; geçici kural `isSystemAdmin` [DB'den doğrulanmış]):** (a) kim `SYSTEM_ADMIN`/global rol verebilir — ayrı izin kodu (katalogda yok, uydurulmadı), iki-yönetici onayı?; (b) eş sistem yöneticileri birbirinin parolasını/hesabını yönetebilir mi (bugün evet; self ve son-yönetici korumaları var); (c) "sahip olduğundan fazlasını veremez" delegasyon üst sınırı (uygulanmıyor); (d) **artık risk:** `PLATFORM:USER:ASSIGN_ROLE` sahibi ama sistem yöneticisi olmayan actor tenant-kapsamlı rolleri (ör. herhangi bir root için `TENANT_ADMIN`) kendine/başkasına verebilir (bugün bu izin yalnızca SYSTEM_ADMIN rolünde, latent); (e) doğrulama sırası yorumu: saf şekil doğrulaması yetkiden önce (oracle önleme, `assignRole` için gerekli, TASK-027.39 sözleşmesi) — kural 6'nın literal okunuşu isteniyorsa belirtilmeli.
Açık: F6'nın kalanı (saas/tenant/role/settings/perf audit), Q-DP22a/b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill, gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi. Gerçek HTTP/DB denemesi yok.

---

## Platform Privilege Model ve Tenant Role Delegation Karar Paketi (TASK-027.43, 2026-09-21)

Belge: `docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md`. **Karar/kanıt paketi: production authorization kodu, permission kataloğu, rol ve veri değiştirilmedi; Q-DP24 KAPATILMADI** (nihai karar AI1/Product Owner). Kanıtlar `privilege-model-evidence.spec.ts` (18 statik test) ile sabitlendi.
**Q-DP24 — karar paketi hazır:** kanıtlı yapısal gerçekler: (1) üç yetki temsili (`users.isSystemAdmin` bayrağı, `SYSTEM_ADMIN` ataması, global `tenantId` null atamalar) ve iki farklı son-yönetici sayımı; (2) tenant-rol tabloları yalnızca okunur — tenant-rol yönetim yüzeyi yok, fiili tenant yetkisi root'taki `TENANT_ADMIN` sistem rolüdür ve müşteri yöneticisi rol veremez; (3) `TENANT_ADMIN` tenant kapsamında her şeyi verir, aynı rol global atanırsa `PLATFORM:USER/TENANT` yazma izinlerini açar (yanlış yapılandırma riski); (4) delegasyon üst sınırı yok (latent); (5) `assignRole` tenant tipi/rol anlamlılığı doğrulamaz; (6) `SETTINGS:*` katalog boşluğu; (7) impersonation'da ayrıcalık kısıtı yok. Seçenekler **A** (mevcut geçici model) / **B** (üst ayrıcalık sınırı) / **C** (ayrı privilege yönetim modeli) sekiz kriterle karşılaştırıldı; alt kararlar a–j (kim verir/alır, eş-yönetim, delegasyon tavanı, tenant-rol atama, global↔tenant sınırı, bayrak↔rol ikiliği, son-yönetici koruması, impersonation, katalog boşluğu); actor/target ve impersonation matrisleri, audit/metadata sözleşmesi, implementation görev listesi (T1–T9), rollback/geçiş planı ve **boş PO karar alanları** belgede.
**AI2 önerisi (karar değil):** kademeli — A'yı zemin al ve kanıtlı boşlukları kapat (tenant tip/rol listesi doğrulaması, bayrak↔rol invariant, tek son-yönetici tanımı, ≥2 admin uyarısı); B'nin çekirdeğini uygula (delegasyon tavanı, MFA'lı oturum, impersonation'da ayrıcalık işlemi ve sysadmin impersonation yasağı); C'yi yalnızca ikinci sistem yöneticisi zorunlu olursa veya müşteri tenant-rol delegasyonu ürün gereksinimi doğarsa aç.
**[DOĞRULANAMADI]:** gerçek ortamdaki sistem yöneticisi sayısı, global `TENANT_ADMIN`/özel rol atamaları, bayrak↔rol drift'i (salt-okunur ön kontroller belge §11'de, çalıştırılmadı); `PackageFeatureGuard` kodda yok; bildirim altyapısı.
Açık: Q-DP24 (karar bekliyor), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill, gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi.

---

## Q-DP24 Karar Kapanış Formu (TASK-027.44, 2026-09-21)

**Q-DP24 KAPATILMADI — AI1/PO kararı BEKLİYOR.** TASK-027.44 yalnızca AI2 **önerisini** iletti ("Product Owner onayı olmadan bağlayıcı kabul edilmez"); onaylı karar iletilmediği için `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14'te 10 maddenin "AI1/PO kararı" sütunları BOŞ, öneriler "AI2 önerisi" olarak işlendi; production kodu, rol modeli ve permission kataloğu değiştirilmedi.
**AI2 önerisi (özet; bağlayıcı değil):** (1) `SYSTEM_ADMIN` verme/kaldırma yalnızca ACTIVE sistem yöneticisi (027.42'de uygulı); (2) eş sistem yöneticisi yönetimi: kimlik bilgisi/rol işlemlerinde yasak **ancak containment (deaktivasyon) serbest** veya onay mekanizması gelene kadar ertelenir; (3) actor sahip olduğundan yüksek privilege veremez (verilen rolün izin kümesi ⊆ actor'ın etkin izin kümesi; `SYSTEM_ADMIN` yalnızca sistem yöneticisi); (4) `tenantId` null = platform, dolu = tenant; birbirine dönüştürülemez; tenant-kapsamlı atama yalnızca ROOT + `TENANT_ADMIN`; (5) global `TENANT_ADMIN` yasak (kodda tüm işlevsel kullanım tenant-kapsamlı; mevcut global atamalar kaldırılabilmeli, otomatik silme yok); (6) tenant-rol delegasyonu için yeni permission (katalog onayı önce; kod uydurulmadı) ve ayrı task; (7) canonical kaynak = `SYSTEM_ADMIN` global rol ataması, bayrak türetilmiş + drift kontrolü (önce servis invariant'ı); (8) tek son-yönetici modeli (canonical kaynağa göre ACTIVE sayısı ≥ 1, revoke/deactivate aynı fonksiyon, ≥2 yönetici uyarısı); (9) impersonation oturumunda privilege/güvenlik işlemleri yasak ve sistem yöneticisi impersonate edilemez; (10) global privilege değişikliğinde MFA ayrı security task'ı (önce `mfaVerified` semantiği ve MFA'sız admin geçişi; şimdi zorunlu kılmak kilitlenme yaratır), ikinci onay yalnızca onay mekanizması ve ≥2 yönetici varsa.
**AI2'nin sınama notu:** talimat önerisindeki "sistem yöneticileri birbirini yönetemez; istisna → ikinci onay" onay mekanizması olmadan ele geçirilmiş eş hesabı deaktive etme/sıfırlama yeteneğini yok eder (yalnızca env break-glass kalır); bu bilinçli bir sapma olarak §14.1'de işaretlendi ve PO'nun açık seçimini bekliyor.
**Önerilen implementation görevleri (numaraları AI1 atar; hepsi karar bekliyor):** 027.45 canonical kaynak + son-yönetici invariant'ı + drift kontrolü; 027.46 `assignRole` sertleştirmesi (global `TENANT_ADMIN` yasağı, tenant kapsamı, delegasyon tavanı, impersonation yasağı); 027.47 eş yönetimi + ikinci onay tasarımı; 027.48 global privilege değişikliklerinde MFA (Q-DP22b/c ile); 027.49 tenant-rol delegasyonu (yeni permission, katalog onayı önce); öncül: gerçek ortam salt-okunur ön kontrolü.
Açık: Q-DP24 (karar bekliyor), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill; gerçek ortam verisi `[DOĞRULANAMADI]`.

**Güncelleme (TASK-027.44, AI1 karar seti, 2026-09-21) — Q-DP24 kararları KAYDA ALINDI (kapanış AI1'in `done` onayıyla; implementation BAŞLATILMADI):** AI1 10 maddelik seti iletti (AI2 kararı kendi adına vermedi; `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.2/§5 dolduruldu): (1) `SYSTEM_ADMIN` verme/kaldırma yalnızca aktif `SYSTEM_ADMIN`; (2) eş sistem yöneticileri parola/rol işlemlerinde birbirini yönetemez, deactivation/containment serbest; (3) global `TENANT_ADMIN` yasak, mevcut atamalar otomatik silinmeden salt-okunur ön kontrolde raporlanır; (4) actor, sahip olduğundan yüksek etkin izin kümesine sahip rol veremez; (5) canonical kaynak `SYSTEM_ADMIN` rol ataması, `isSystemAdmin` türetilmiş/cache + drift kontrolü; (6) impersonation'da privilege değişikliği yasak; (7) MFA ayrı karar ve geçiş task'ından önce zorunlu değil; (8) tenant-role delegation yeni permission + ayrı task; (9) son yönetici = canonical role atamalarına göre tek invariant; (10) global privilege işlemlerinde audit zorunlu, rollback ve break-glass ayrı task. Sıradaki görev: TASK-027.45.
**AI2 teknik teyit noktaları (kararı değiştirmez; belge §14.5):** **(A) ⚠️ Karar 2'nin doğrulanmış sonucu:** kodda self-servis parola değiştirme yolu yok ve platform yüzeyinde kendi parolayı değiştirmek yasak → eş yönetici sıfırlaması da kalkınca sistem yöneticisi parolası için **hiçbir API yolu kalmaz** (yalnızca DB/env break-glass); olası hash ifşası için parola rotasyonu sistem yöneticileri için uygulanamaz olur. AI2 önerisi: eş-yönetim kısıtı (027.47) bir kimlik bilgisi rotasyon yoluyla (self-servis değiştirme / onaylı break-glass) birlikte veya sonra yayına alınsın — AI1 teyidi bekliyor. (B) drift'te çalışma zamanı davranışı ve "ACTIVE" tanımı (027.45); (C) "etkin izin kümesi" `PermissionGuard` semantiğiyle (027.46); (D) global↔tenant sınırı kısmen açık: "tenant-kapsamlı atamada yalnızca ROOT+`TENANT_ADMIN`" ve "scope dönüştürme yasağı" AI1 setinde yok; (E) karar 3 yalnızca yeni atamaları engeller; (F) "privilege değişikliği" işlem kümesi ve "sistem yöneticisi impersonate edilemez" (setde yok, Q-DP22c); (G) MFA admin reset eşlere karşı yasak varsayımı; (H) break-glass/rollback 027.47'ye kadar yalnızca env bootstrap.
**Kararlaştırılmayan/açık:** ikinci onay (benimsenmedi), ≥ 2 yönetici politikası, `SETTINGS:*` katalog boşluğu, shadow-mode/geçiş penceresi. **Önerilen implementation görevleri (hiçbiri başlatılmadı; numaralar AI1'in):** 027.45 ön kontrol raporu + canonical kaynak + tek son-yönetici invariant'ı + drift; 027.46 `assignRole` sertleştirmesi (global `TENANT_ADMIN` yasağı, privilege tavanı, impersonation yasağı); 027.47 eş yönetimi + kimlik bilgisi rotasyon yolu + break-glass/rollback; 027.48 MFA geçişi; 027.49 tenant-rol delegasyonu (yeni permission, katalog onayı önce).
Açık: F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill; gerçek ortam verisi `[DOĞRULANAMADI]`.

**Q-DP24 KAPANDI (AI1 teyidi, 2026-09-21; TASK-027.44 `done` AI1'de):** AI1 §14.5 teyit noktalarını yanıtladı ve kapanış kararını tamamlandı ilan etti. Bağlayıcı sınırlar: (1) eş sistem yöneticisi kısıtı, parola rotasyonu veya onaylı break-glass yolu hazır olmadan production'da zorunlu olmayacak; (2) mevcut davranış TASK-027.47 uygulanana kadar korunacak; (3) TASK-027.45 yalnızca salt-okunur ön kontrol + canonical kaynak + drift + son-yönetici invariant'ı, **enforcement yok**; (4) TASK-027.46 global `TENANT_ADMIN` yasağı + privilege tavanı, mevcut atamalar otomatik silinmez; (5) eş yönetici parola/MFA işlemleri ve break-glass TASK-027.47'de birlikte. Sıradaki görev TASK-027.45. Karar kaydı: `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.2/§14.5/§14.6. **Açık kalan alt konular:** ikinci onay, ≥ 2 yönetici politikası, `SETTINGS:*` katalog boşluğu, shadow-mode/geçiş penceresi, tenant-kapsamlı atamada ROOT+`TENANT_ADMIN`/scope dönüştürme yasağı (027.46'da teyit), sistem yöneticisi impersonate yasağı (Q-DP22c). Diğer açık: F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill.

---

## Privilege Canonical Source, Drift Detection ve Admin Invariant (TASK-027.45, 2026-09-21)

Q-DP24 kapanış kararının (§14.2 karar 5 ve 9; §14.6) **salt-okunur** temeli uygulandı — **enforcement yok, erişim davranışı değişmedi, gerçek DB kullanılmadı.** `apps/api/src/platform/privilege/`: canonical kaynak = global `SYSTEM_ADMIN` rol ataması, `users.isSystemAdmin` türetilmiş/cache; yalnızca ACTIVE aktif sayılır; son yönetici canonical atamalardan (invariant ≥ 1; "≥ 2" politikası kararlaştırılmadığı için yalnızca bilgi alanı); global ve tenant atamalar ayrı raporlanır; dokuz drift kategorisi (`FLAG_ROLE_MATCH`, `FLAG_WITHOUT_SYSTEM_ROLE`, `SYSTEM_ROLE_WITHOUT_FLAG`, `INACTIVE_SYSTEM_ADMIN`, `LOCKED_SYSTEM_ADMIN`, `GLOBAL_TENANT_ADMIN`, `MULTIPLE_ADMIN_COUNT_MISMATCH`, `UNKNOWN_ROLE_SCOPE`, `INVALID_TARGET_REFERENCE`); çıktı deterministik, yalnızca kimlik/kapsam/durum/statik neden kodu (credential yok); adapter yalnızca 4 SELECT ve hiçbir route/CLI/job'a bağlı değil; mevcut global `TENANT_ADMIN` atamaları silinmez/değiştirilmez, yalnızca raporlanır. 32 test + mutasyon kontrolü.
**Gözlem (raporlanabilir, düzeltilmedi):** bugünkü iki son-yönetici guard'ı farklı şey sayar (revoke: tüm global SYSTEM_ADMIN atamaları; deactivate: ACTIVE bayraklı kullanıcı); rapor bu farkı `MULTIPLE_ADMIN_COUNT_MISMATCH` olarak üç sayıyla gösterir. Tek invariant'ın **uygulanması** ve çalışma zamanı drift davranışı (fail-closed vb.) bu task'ta yoktur (027.46/.47).
**[DOĞRULANAMADI]:** gerçek ortamdaki drift, global `TENANT_ADMIN` atamaları ve sistem yöneticisi sayısı — rapor gerçek DB'de çalıştırılmadı; çalıştırma yolu (CLI/endpoint/job) AI1 kararıdır.
Açık: 027.46 (global `TENANT_ADMIN` yasağı + privilege tavanı + impersonation'da privilege yasağı), 027.47 (eş yönetici parola/MFA + break-glass + rotasyon yolu), 027.48 (MFA), 027.49 (tenant-rol delegasyonu), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01 (gate geçici workaround ile koştu), dev ROOT backfill.

---

## Role Assignment Privilege Ceiling ve Global TENANT_ADMIN Boundary (TASK-027.46, 2026-09-22)

Q-DP24 kararlarından **madde 3 (privilege ceiling), 5 kısmen (global `TENANT_ADMIN` yasağı), 6 (impersonation'da privilege değişikliği yasağı)** **enforcement** olarak uygulandı — kararların kalanı bilerek dışarıda bırakıldı: **eş sistem yöneticisi kısıtı (karar 2) TASK-027.47'ye kadar UYGULANMADI** (§14.6 madde 2 teyidi gereği), MFA/ikinci onay (karar 7/10) TASK-027.48/.47'de.
**Yeni:** `apps/api/src/platform/domain/privilege-ceiling.domain.ts` — gerçek `PermissionGuard`'ın aynı karar tablosunu (bayrak = her şey; `PLATFORM:*` yalnızca global atamalardan; `TENANT_ADMIN` yalnızca kendi root'unda "PLATFORM dışı her şey", diğer roller tenant kapsamında inert) saf fonksiyonlara taşıyan model; 225 kombinasyonluk parite testiyle gerçek guard'a karşı doğrulandı. `UserService`'in yedi işlemi (`update/setPassword/deactivate/assignRole/revokeRole/addMembership/removeMembership`), `MfaService.adminResetMfa`, `SaasService.setCustomerUserPassword/addCustomerUserMembership` bu modeli ve impersonation reddini kullanır.
**Global `TENANT_ADMIN`:** yeni atama (`tenantId` null) **her actor için** (sistem yöneticisi dahil) DB'ye dokunmadan reddedilir (`GLOBAL_TENANT_ADMIN_FORBIDDEN`); **mevcut atamalar hiçbir kod yolunda otomatik silinmez/değiştirilmez**, yalnızca açık `revokeRole` çağrısıyla kaldırılabilir durumda kalır; TASK-027.45'in salt-okunur raporu bu atamaları hâlâ `GLOBAL_TENANT_ADMIN` olarak listeler (değişmedi).
**Privilege ceiling:** `targetEffective ⊆ actorEffective`; bilinmeyen izin kodu veya tenant tipi fail-closed (`UNKNOWN_PERMISSION`/`UNKNOWN_SCOPE`). Sistem yöneticisi olmayan actor kendi etkin izin kümesini aşan bir rol veremez; sistem yöneticisi ceiling'i atlar.
**Impersonation:** `UserService`'in altı işlemi (görünen-ad güncellemesi hariç), `MfaService.adminResetMfa`, customer-admin parola/üyelik işlemleri impersonation oturumunda **hiçbir DB okuması yapılmadan** statik kodla (`IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN`) reddedilir; best-effort `DENIED` audit; `impersonation`/`impersonatorUserId` alanlarından yalnızca biri set edilse bile fail-closed.
**Doğrulama:** 44 yeni test + mevcut privilege/authorization spec'lerinin uyarlanması; 3 mutasyon kontrolü (global `TENANT_ADMIN` reddi, `UserService` impersonation reddi, `MfaService` impersonation reddi kapatılınca sırasıyla 3/10/2 test kırıldı, geri alındı). `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 15 suite / 862 test; `./scripts/check.sh --skip-docker` PASS (API 52 suite / 1454 test, web 8 dosya / 117 test) — Q-ENV01 nedeniyle `NODE_PATH` + `TURBO_ENV_MODE=loose` ile. Gerçek DB/HTTP/MFA sağlayıcısı kullanılmadı.
**AI1 teyidi bekleyen açık teknik noktalar (§14.5-D, F, kodda uygulandı ama resmi karar değil):** tenant-kapsamlı atamanın yalnızca `ROOT`/`PLATFORM_ROOT` tipli tenant'ta anlamlı olması (`STANDARD`'da inert) modele işlendi ama Q-DP24 setinde açıkça teyit edilmedi; "sistem yöneticisi impersonate edilemez" (Q-DP22c) uygulanmadı — impersonation'ın kendisi hâlâ mümkün, yalnızca privilege işlemleri reddediliyor.
**Pratik etki notu (gerçek ortam [DOĞRULANAMADI]):** bugün `PLATFORM:USER:ASSIGN_ROLE`/`REVOKE_ROLE` yalnızca `SYSTEM_ADMIN` yerleşik rolünde olduğundan, bu route'a erişebilen her actor zaten sistem yöneticisidir ve ceiling'i atlar; ceiling, özel bir rolle bu izin sistem-yöneticisi-olmayan birine verilirse devreye girer — gerçek ortamda böyle bir rol var mı denetlenmedi.
Açık: TASK-027.47 (eş sistem yöneticisi kısıtı + kimlik bilgisi rotasyon yolu + break-glass/rollback — **birlikte**), TASK-027.48 (MFA enforcement), TASK-027.49 (tenant-rol delegasyonu), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi.

---

## Eş Sistem Yöneticisi Yönetimi, Credential Rotation ve Break-Glass (TASK-027.47, 2026-09-22)

Q-DP24 kapanışının **madde 2 (Model B: eş sistem yöneticisi kısıtı), madde 1 (self-servis parola rotasyonu — madde 2'nin ön koşulu) ve madde 4'ün kalan kısmı (break-glass kurtarma)** uygulandı. **Madde 7 ve 10 (genel MFA enforcement, ikinci onay) bu task'ın kapsamı dışında bırakıldı** (TASK-027.48'e).
**Model B (eş yönetici kısıtı):** `setPassword`/`assignRole`/`revokeRole`/`adminResetMfa` artık hedef sistem yöneticisiyse **actor da sistem yöneticisi olsa bile** statik kodla (`PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED`) reddediliyor; deaktivasyon (containment) kasıtlı olarak dokunulmadı, sistem yöneticileri birbirini hâlâ deaktive edebiliyor. **Bilinen sonuç:** bu artık hiçbir peer actor'ın bir sistem yöneticisinin global `SYSTEM_ADMIN` atamasını `revokeRole` ile geri alamayacağı anlamına geliyor — resmi demotion artık yalnızca break-glass veya gelecekteki ayrı bir görevle mümkün; mevcut son-yönetici sayım koruması kod tabanında kaldı (bayrak↔rol drift'i için ikinci savunma katmanı, TASK-027.45).
**Self-servis kimlik bilgisi rotasyonu:** yeni `POST auth/change-password` — her ACTIVE kullanıcıya açık (yalnızca sistem yöneticilerine değil), hedef alanı yok (yapısal olarak yalnızca kendi hesabını değiştirebilir), canonical parola politikası servis katmanında da yeniden doğrulanıyor. Başarılı rotasyonda hedefin tüm aktif `authSessions` iptal ediliyor (aynı karar `UserService.setPassword`'un yönetici-başlatan yoluna da eklendi); **erişim jetonu (JWT) anında iptal edilemiyor** (denylist altyapısı yok) — en fazla `JWT_EXPIRES_IN` (varsayılan 15dk) kadar bir maruziyet penceresi **bilinçli, belgelenmiş kalan risktir**.
**Break-glass kurtarma:** yeni `apps/api/src/platform/break-glass/` — servis **kasıtlı olarak `@Injectable()` değil ve `platform.module.ts`'de listeli değil** (Nest DI/route'tan erişilemez, statik testle kanıtlı); bağımsız CLI girişi `migrate.ts` desenini taklit ediyor. Yalnızca hiçbir ACTIVE sistem yöneticisi kalmadığında (TASK-027.45'in canonical raporuyla hesaplanır) çalışıyor; hedefin zaten canonical `SYSTEM_ADMIN` atamasına sahip olması şart (yeni ayrıcalık üretilmiyor). Varsayılan olarak KAPALI (`BREAK_GLASS_RECOVERY_TOKEN` ayarlı değilse tamamen devre dışı); token karşılaştırması `timingSafeEqual`; her sonuç `eventId` ile audit'leniyor; başarılı kurtarma sonrası ikinci deneme doğal olarak reddediliyor (ayrı tek-kullanımlık ledger gerekmiyor).
**Yapılmayan/blocker olarak raporlanan (talimat kuralına uygun):** break-glass için **hız sınırlama altyapısı yok** — süreçler-arası durum tutan bir hız sınırlayıcı bu task'ın kapsamında güvenli şekilde kurulamadığı için implementasyon yerine operasyonel açık madde olarak bırakıldı (§14.10).
**Doğrulama:** 36 yeni test (`system-admin-credential-rotation-and-break-glass.spec.ts`) + mevcut F4/boundary spec'i güncellendi; **4 zorunlu mutasyon kontrolü** (eş-yönetici kısıtı → 4 test, break-glass token kontrolü → 7 test, audit credential redaksiyonu → 1 test, son-yönetici koruması → 1 test kırıldı; hepsi geri alındı). `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 16 suite / 898 test; **`./scripts/check.sh --skip-docker` PASS (exit 0)** — API **53 suite / 1490 test**, web 8 dosya / 117 test. Gerçek DB/HTTP/MFA sağlayıcısı/production secret **kullanılmadı**; break-glass gerçek ortamda hiç çalıştırılmadı.
**Gerçek ortam için kalan operasyonel adımlar (Ops/AI1/PO):** `BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması, break-glass çalıştırma runbook'u, hız sınırlama/izleme kurulumu, `JWT_EXPIRES_IN` maruziyet penceresi kararı, geçmiş kötüye kullanım incelemesi (audit kayıtları — DB'ye bağlanılmadı), formal `SYSTEM_ADMIN` demotion yolu tasarımı (§14.10'da tam liste).
Açık: TASK-027.48 (MFA enforcement, madde 7/10), TASK-027.49 (tenant-rol delegasyonu), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, formal SYSTEM_ADMIN demotion yolu.

---

## Break-Glass Güvenlik Sertleştirmesi ve Credential Rotation Review (TASK-027.47-R1, 2026-09-22)

**AI1, TASK-027.47 teslimini `done` olarak onaylamadı** — `review` durumunda tutarak dört kapanış engeli bildirdi: (1) break-glass hız sınırlama altyapısı yok (brute-force/kötüye kullanıma açık); (2) break-glass gerçek DB/HTTP ortamında doğrulanmadı; (3) peer demotion tamamen engelleniyor, ele geçirilmiş bir sistem yöneticisi için yalnızca break-glass kalıyor; (4) self-servis parola değişiminde session/audit davranışı ayrıca kanıtlanmalı. TASK-027.47-R1 bu dört maddeyi ele aldı.
**Kod tarafında kapatılanlar:**
- **Kalıcı hız sınırlama:** yeni `break_glass_attempts` singleton tablosu, `SELECT ... FOR UPDATE` transaction'la atomik artırılıyor — sahte/bellek-içi değil, gerçek Postgres altyapısı (varsayılan: 15dk/5 deneme, env ile yapılandırılabilir); başarılı VE başarısız her deneme (yanlış token dahil) sayılıyor.
- **Kalıcı tek-kullanımlık defter:** yeni `break_glass_recovery_events` tablosu, `tokenHash` üzerinde UNIQUE kısıt; claim, credential yazma işlemiyle aynı transaction içinde `INSERT ... ON CONFLICT DO NOTHING` ile yapılıyor — "paralel iki çağrıdan yalnızca biri başarılı olur" garantisinin tek kaynağı budur (Postgres'in kendi unique-constraint serileştirmesi). Token artık kalıcı tek kullanımlık: başarılı tüketimden sonra (kurtarılan yönetici sonradan deaktive edilse bile) aynı token bir daha kabul edilmiyor.
- **Opsiyonel açık süre sınırı:** `BREAK_GLASS_TOKEN_EXPIRES_AT`; süresi geçmiş veya bozuk tarih fail-closed reddediliyor.
- **Durum modeli:** `AVAILABLE | USED | EXPIRED | RATE_LIMITED | INVALID | BLOCKED | FAILED`.
- **Self-servis parola değişiminde eksik olan tek gerçek boşluk kapatıldı:** impersonation oturumu artık kendi parolasını dahi değiştiremiyor (`PRIVILEGE_DENIAL.IMPERSONATION`, `AuthController`'dan `@CurrentUser()` ile — body'den değil — iletiliyor).
**Kod dışı, operasyonel doküman kararı olarak ele alınan:** peer demotion için mevcut yolların (deaktivasyon/containment → audit inceleme → yalnızca break-glass ile formal rollback) prosedürü `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.11'de belgelendi; **resmi bir demotion permission/akışı bu task'ta eklenmedi** — yeni bir bypass icat edilmedi, bilinçli sınır olarak kaldı.
**Yapılmayan (kural gereği açıkça raporlanmıştır):** kontrollü yerel DB smoke test (gerçek Postgres'e karşı break-glass'ın paralel claim yarışını çalıştırmak) **bu teslimde yapılmadı** — bu, geçici de olsa bir Docker container başlatmayı gerektirdiği için oturumun standart kurallarına (production'a bağlanılmayacak, Docker container'ları izinsiz başlatılmayacak) uyularak **AI1/kullanıcının açık onayı bekleniyor**; onaylanırsa adımlar §14.11'de önerildi.
**Doğrulama:** `system-admin-credential-rotation-and-break-glass.spec.ts` 36 → 56 test (yeni senaryolar: expired/malformed-expiry/future-expiry token, rate-limit eşiği/pencere sıfırlama, ledger-tabanlı tek-kullanım — admin-count'tan bağımsız, claim'in tek karşılıklı-dışlama noktası, impersonation self-servis reddi + controller iletimi + genişletilmiş statik mutasyon kontrolleri). **5 mutasyon kontrolü** manuel çalıştırıldı, dosyalar geri yüklendi: tek-kullanım kontrolü kaldırılınca 2, hız sınırlama kısa-devre edilince 17, audit'e yeni parola sızdırılınca 1, break-glass oturum iptali kaldırılınca 1 test kırıldı. `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 16 suite / 909 test; `pnpm --filter api exec jest src/db --runInBand` 2 suite / 40 test. `./scripts/check.sh --skip-docker` sonucu ayrıca raporlanacak (bu girdi teslim sırasında koşuyordu — bkz. PROGRESS_LOG.md). Gerçek DB/HTTP/MFA sağlayıcısı/production secret kullanılmadı; break-glass gerçek ortamda hâlâ hiç çalıştırılmadı (onay bekleyen madde).
Açık: kontrollü yerel DB smoke test onayı (AI1/kullanıcı kararı bekliyor), TASK-027.48 (MFA enforcement), TASK-027.49 (tenant-rol delegasyonu), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, formal SYSTEM_ADMIN demotion yolu (kod değişikliği gerektirir, henüz tasarlanmadı), `BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması ve runbook onayı.

**Güncelleme (TASK-027.47-R1, 2026-09-22) — kontrollü yerel DB smoke test TAMAMLANDI (kullanıcı onayıyla):** yukarıdaki "yapılmadı, onay bekliyor" maddesi kapatıldı. Kullanıcı onayı alındıktan sonra izole, tek seferlik, kalıcı volume'suz bir Postgres container'ı (`docker run --rm`) başlatıldı; `DATABASE_URL` yalnızca bu geçici container'a işaret etti (production'a hiç bağlanılmadı); tüm migration'lar (0000–0003) derlenmiş `dist/migrate.js` ile uygulandı; break-glass servisi gerçek `PlatformAuditService` ile birlikte örneklenip 15 senaryo elle tetiklendi — **15/15 geçti**, en önemlisi **gerçek eşzamanlı iki `recover()` çağrısının** aynı token üzerinde yarıştığı senaryoda yalnızca birinin başarılı olduğu, kaybeden çağrının `TOKEN_ALREADY_USED` ile reddedildiği doğrulandı (bu, mock'larla kanıtlanamayan tek senaryoydu). Audit tablosunda hiçbir credential bulunmadı. Container `docker stop` ile durduruldu (`--rm` ile otomatik silindi), kalıcı volume hiç oluşmadı. Tam sonuçlar `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.11'de.
Açık: TASK-027.48 (MFA enforcement), TASK-027.49 (tenant-rol delegasyonu), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, formal SYSTEM_ADMIN demotion yolu (kod değişikliği gerektirir, henüz tasarlanmadı), `BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması ve runbook onayı (operasyonel, Ops/AI1/PO kararı).

---

## MFA Policy Activation ve Enforcement Geçişi — Q-DP22b/c KAPANDI (TASK-027.48, 2026-09-22)

Karar paketleri (`METNEX_AUTHORIZATION_ENDPOINT_AUDIT_AND_MFA_POLICY_DECISION.md` §5–§6) Product
Owner tarafından kapatıldı ve uygulandı. **Q-DP22b:** MFA policy route'ları `GET/PATCH
auth/mfa/policy/:tenantId` olarak düzeltildi, `isSystemAdmin`-only yetki eklendi (controller +
service'te bağımsız fail-closed kontrol), `MFA_POLICY_UPDATED` audit'i eklendi. **Q-DP22c:** admin
MFA reset (`POST auth/mfa/admin/:userId/reset`) için tek yeni kural eklendi — aktörün kendi MFA'sı
etkinse mevcut oturumun `mfaVerified` olması zorunlu (aksi halde 403 + `ACTOR_MFA_NOT_VERIFIED`
audit'i); MFA'sı etkin olmayan aktör için geçici izin + `actorMfaBypassWarning` audit uyarısı
kaydedilir. Self-reset ve impersonation reddi zaten TASK-027.46/47'den beri kod seviyesinde
uygulanıyordu, bu task'ta değiştirilmedi (yalnızca teyit edildi).

**Enforcement wiring (kullanıcı kararıyla, yalnızca hazırlık değil gerçek aktivasyon):**
`MfaEnforcementGuard` + `@RequireMfaSetupComplete()`, `docs/runbooks/MFA_ENFORCEMENT_ROUTE_MATRIX.md`'de
listelenen tüm korumalı controller'lara uygulandı (platform/roles/tenants/users/saas,
customer-admin, reports, platform/settings, tenant settings, admin/perf, platform-audit-logs,
auth/change-password). MFA akışının kendisi, kimlik bootstrap'i (`auth/me`, `platform/me/*`) ve
login/logout **bilinçli olarak muaf** tutuldu — aksi halde hiç kimse MFA kurulumunu
tamamlayamazdı.

**Kritik bulgu ve kapatılması — web'de MFA setup UI hiç yoktu:** implementasyona başlamadan önce
`totp/setup`/`totp/verify-setup`/`mfa/status`'ı çağıran hiçbir web bileşeni bulunmadığı, ayrıca
login'in `requiresMfa` yanıtını hiç ele almadığı tespit edildi — bu haliyle enforcement açılsaydı
gerçek bir kilitlenme (task'ın kendi kritik güvenlik kuralının ihlali) olurdu. Kullanıcı "MFA'yı
komple geliştir" kararıyla kapsamı genişletti: `apps/web/src/app/(app)/app/settings/security/page.tsx`
(TOTP kurulum/QR/kurtarma kodu/devre dışı bırakma/yenileme) ve login sayfasının MFA challenge
adımı (TOTP veya kurtarma kodu) eklendi; `apps/web/src/lib/api.ts` merkezi `request()` artık
`MFA_SETUP_REQUIRED`/`MFA_SESSION_NOT_VERIFIED` 403'lerini yakalayıp otomatik yönlendiriyor.

**Yan bulgu (kod düzeltmesi):** `POST auth/mfa/challenge/verify` yalnızca body'de
`{accessToken, refreshToken}` döndürüyordu, httpOnly refresh cookie'sini hiç set etmiyordu — login
ile aynı sözleşmeye getirildi (`POST auth/login`'in kullandığı cookie kodu `auth.controller.ts`'ten
export edilip paylaşıldı), aksi halde MFA ile giren bir kullanıcı sayfa yenilemesinde oturumunu
kaybederdi.

**Geçiş stratejisi:** setup-required (kullanıcı kararı) — kademeli rollout veya grace period
uygulanmadı; MFA'sı gerekli ama kurulu olmayan kullanıcı yalnızca MFA setup akışına yönlendirilir,
kilitlenmez.

**Doğrulama:** yeni `apps/api/src/platform/guards/mfa-enforcement.guard.spec.ts` (10 test, guard'ın
kendi karar ağacı); `endpoint-authorization-inventory.spec.ts` snapshot'ı 91 endpoint'e güncellendi
(guard sessizce kaldırılır/eklenirse kırılır); `mfa-admin-reset-authorization.spec.ts`,
`authorization-audit-findings.spec.ts`, `mfa-settings-perf-validation.spec.ts`,
`platform-user-admin-privilege-boundary.spec.ts`, `platform-dto-validation.spec.ts` güncellendi.
`pnpm --filter api exec jest --runInBand` → **54 suite / 1520 test PASS**;
`pnpm --filter api exec eslint "src/**/*.ts"` temiz; `pnpm --filter web exec tsc --noEmit` temiz;
`pnpm --filter web run test` (vitest) → 8 dosya / 117 test PASS; `pnpm run build` → api + web
PASS. `./scripts/check.sh --skip-docker` lint adımı apps/web'in önceden var olan
`eslint-plugin-react-hooks` çözümleme sorunuyla (TASK-027-36'da kayıtlı, bu task'tan bağımsız)
durdu — audit/typecheck adımları PASS, kalan adımlar yukarıdaki gibi elle doğrulandı. Gerçek
DB/HTTP/MFA sağlayıcısı kullanılmadı; enforcement gerçek ortamda henüz hiç çalıştırılmadı. Git
commit/push yapılmadı.

Açık: Q-DP22a (kalıcı permission modeli), TASK-027.49 (tenant-rol delegasyonu), F6'nın kalan audit
kapsamı, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, formal SYSTEM_ADMIN demotion yolu,
`BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması ve runbook onayı.

## Task ID Normalizasyonu — 2026-09-22

`TASK-027.49` tenant-role delegation kimliği olarak korunmuştur. Aynı kimliği
kullanan export placeholder'ları kaldırılmış, Wave 5 grafik/export zinciri
`TASK-027.54`–`TASK-027.59` aralığına normalize edilmiştir.
Önceki tarihsel kayıtlar append-only kuralı gereği değiştirilmedi.

---

## Tenant-Role Delegation ve Tenant Permission Yönetimi — Q-DP24 madde 8 KAPANDI (TASK-027.49, 2026-09-22)

Task'ın kendi "zorunlu başlangıç kapısı" gereği implementasyondan önce gerçek permission
katalogu ve `PermissionGuard` çözümleme mantığı incelendi: **tenant-role delegation için onaylı
bir permission kodu yoktu** (`TENANT:ROLE:*` katalogda yoktu; bu belgede tekrar tekrar "açık"
olarak listelenmişti — bkz. yukarıdaki tüm "Açık:" satırları). Task kuralı gereği kod
uydurulmadı; 10 karar sorusu Product Owner'a AskUserQuestion ile soruldu, kararlar alındıktan
sonra implementasyon başladı.

**Kararlar (Product Owner):** permission kodları `TENANT:ROLE:VIEW`/`ASSIGN`/`REVOKE` (mevcut
`PLATFORM:ROLE:*` deseniyle tutarlı, üç ayrı kod); atama yetkisi o customer root'un
`TENANT_ADMIN`'i + sistem yöneticisi (gerçek delegasyon — `assertCustomerAdminScope` yeniden
kullanıldı); kendine atama izinli (yalnızca ceiling ile sınırlı); tenant rolleri yalnızca
customer root düzeyinde (child tenant'a özel rol yönetimi yok); rol kaldırma için "son tenant
yöneticisi" invariant'ı **gerekli** — yeni `tenant_roles.isAdminRole` boolean kolonu (migration
`0004_tenant_role_admin_flag.sql`) ile işaretlenen rolün bir tenant'taki son ACTIVE ataması
kaldırılamaz.

**Uygulama:** yeni `apps/api/src/platform/tenant-role.{controller,service}.ts`,
`domain/tenant-role-ceiling.domain.ts` (SYSTEM_ADMIN/TENANT_ADMIN ceiling modelinden ayrı, pure
fonksiyon — TASK-027.46'nın `privilege-ceiling.domain.ts`'i değiştirilmedi). Route:
`tenant-roles[/assignable|/users/:userId[/:assignmentId]]`, `X-Tenant-Id` header ile (mevcut
`settings/*` deseni), tam guard zinciri + TASK-027.48 MFA enforcement kapsamına da eklendi. Her
mutasyon impersonation reddi → actor DB'den ACTIVE yeniden okuma → `assertCustomerAdminScope` ile
bağımsız scope teyidi → işleme-özel kural sırasıyla fail-closed. Duplicate atama, DB'nin gerçek
unique constraint'i (`user_tenant_role_assignments_userId_roleId_key`) üzerinden
`onConflictDoNothing()` ile race-safe şekilde 409'a çevriliyor (uygulama-seviyesi check-then-insert
değil).

**Bilinçli kapsam dışı:** tenant rolü oluşturma/düzenleme endpoint'i (task'ın kendi sözleşmesi
yalnızca listeleme/atama/kaldırmayı istiyordu — `tenant_roles` satırları hâlâ ayrı bir
mekanizmayla oluşturulmalı); web UI (task metninde MFA'daki gibi açık bir UI talebi yoktu, ikisi
de ayrı follow-up olabilir); Global role/SYSTEM_ADMIN/TENANT_ADMIN sistem-rol ataması (bu yüzey
yalnızca `tenant_roles`/`user_tenant_role_assignments` tablolarına dokunuyor, `system_roles`/
`user_system_role_assignments` hiç dokunulmadı — yapısal olarak erişilemez).

**Doğrulama:** yeni `tenant-role-ceiling.domain.spec.ts` (13 test), `tenant-role.service.spec.ts`
(27 test) + `endpoint-authorization-inventory.spec.ts`/`privilege-model-evidence.spec.ts`
güncellendi (E1: 30→33 katalog; E3 "tenant roles have no management surface" artık "tenant-role
management surface" olarak yeniden yazıldı — TenantRoleService'in tek yazıcı olduğunu doğruluyor).
**4 mutasyon kontrolü bizzat çalıştırılıp doğrulandı ve geri alındı:** scope kontrolü kaldırılınca
12 test, impersonation reddi kaldırılınca 2 test, privilege ceiling kaldırılınca 2 test, duplicate/
idempotency kontrolü kaldırılınca 1 test kırıldı. `pnpm --filter api exec jest --runInBand` → **57
suite / 1570 test PASS**; api eslint/tsc temiz. Gerçek DB/HTTP kullanılmadı (tüm testler mock'lu);
migration `drizzle-kit generate` ile üretildi, gerçek ortama uygulanmadı. Git commit/push
yapılmadı.

Açık: F6'nın kalan audit kapsamı, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, formal
SYSTEM_ADMIN demotion yolu, `BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması ve runbook onayı,
tenant rolü oluşturma/düzenleme endpoint'i (bu task'ın bilinçli kapsam dışı bıraktığı, ayrı bir
follow-up gerektiren madde).

---

## Tenant-Role Delegation — AI1 review düzeltmeleri (TASK-027.49, ikinci tur, 2026-09-22)

TASK-027.49'un ilk teslimi AI1 tarafından `review`'da tutuldu; genel mimari doğru bulundu ama iki
teknik nokta düzeltme olarak istendi: (1) son-tenant-yöneticisi sayımı kullanıcının `status`'unu
filtrelemiyordu — pasif/kilitli bir kullanıcının `isAdminRole` ataması "hâlâ bir yönetici var"
sanılabiliyordu; (2) kontrol ile silme arasında atomiklik yoktu — paralel iki revoke isteği aynı
anda kontrolü geçip son iki yöneticiyi birlikte kaldırabilirdi.

**Düzeltmeler:** `revokeRole`'daki son-yönetici sayımı artık kilitli atamaların sahibi
kullanıcıları ayrıca `users.status = 'ACTIVE'` ile sorguluyor. `isAdminRole` yolunda tüm kontrol +
silme artık tek bir `db.transaction()` içinde; tenant'taki tüm `isAdminRole` atamaları
`SELECT ... FOR UPDATE` ile kilitleniyor (break-glass'ın TASK-027.47'de kurduğu aynı desen).
Admin-flagged olmayan revoke'lar için transaction/kilit yükü eklenmedi.

**Doğrulama:** 3 yeni test (pasif kullanıcı sayılmıyor, `status='ACTIVE'` filtresinin statik
kontrolü, transaction+FOR UPDATE'in statik+davranışsal kontrolü). 2 mutasyon kontrolü bizzat
çalıştırılıp doğrulandı ve geri alındı: `eq(users.status,...)` kaldırılınca 1 statik test,
`.for('update')` kaldırılınca 1 test kırıldı. `pnpm --filter api exec jest --runInBand` → **57
suite / 1573 test PASS**; `NODE_PATH=... TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker`
→ tam PASS (lint dahil).

**Açık kalan (bilinçli, onay bekliyor):** gerçek Postgres'te paralel iki revoke isteğinin
gerçekten serileştiği canlı bir smoke test (TASK-027.47-R1'deki break-glass smoke testine benzer,
geçici/izole bir Postgres container'ı gerektirir) bu turda çalıştırılmadı — istenirse ayrı bir
kullanıcı onayıyla eklenebilir.

Açık: F6'nın kalan audit kapsamı, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, formal
SYSTEM_ADMIN demotion yolu, `BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması ve runbook onayı,
tenant rolü oluşturma/düzenleme endpoint'i, gerçek Postgres paralel-revoke smoke testi onayı.
