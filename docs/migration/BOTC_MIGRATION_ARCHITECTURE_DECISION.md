# BOTC Migration Architecture Decision

> **Durum: Mimari karar dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-1-botc-migration-mapping-ve-architecture-decision.md` (EPIC-004,
> Wave 0). Bu belge `docs/requirements/DISCOVERY.md`, `docs/requirements/SRS.md` ve
> `BOTC_TO_METNEX_MAPPING.md` ile birlikte okunmalıdır; çelişki halinde Discovery/SRS esas alınır.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

---

## 1. Hedef Mimari

```text
Metnex Web Console (Next.js)
        ↓
Metnex API (NestJS)
        ↓
PostgreSQL — platform, tenant ve uygulama domain verileri (ICU tr-TR)
        ↓
Read-only SQL Server adapters — SCADA / DMS / işletme verileri
```

Bu, `docs/requirements/DISCOVERY.md` §2.2/§3.1'deki karardır — **yeni bir framework veya mimari
katman icat edilmemiştir**, mevcut Metnex stack'i (NestJS, Next.js, Drizzle ORM, PostgreSQL,
Redis, MinIO, Reporting Foundation/Jasper) BOTC'nin yerini alacak şekilde genişletilir.

## 2. BOTC'den Doğrudan Taşınmayacak Katmanlar

| BOTC katmanı | Neden taşınmaz | Yerini alan Metnex bileşeni |
|---|---|---|
| WPF UI (`BOT` projesi, 33 pencere, code-behind, MVVM kullanılmıyor — D-003) | Web tabanlı hedef mimari kararı (D-001, D-002 Discovery §7.1) | Next.js Web Console |
| `BOT.Services` (code-behind'a gömülü iş mantığı, `IAuthService`/`ISessionService`/vb.) | Davranış referansı olarak kullanılır, kod **port edilmez** — NestJS servis/modül sınırlarına yeniden yazılır | NestJS API modülleri (mevcut `apps/api/src/platform`, `apps/api/src/reporting` sınırları korunur) |
| `BOT.Data` (EF Core, 4 ayrı `DbContext`, `IDbContextFactory` deseni) | Hedef ORM Drizzle'dır; EF Core modelleri birebir taşınmaz | Drizzle şema/migration (mevcut `apps/api/drizzle`) |
| `ConfigProtector` (sabit AES anahtarlı config şifreleme — R-003) | Güvenlik riski olarak işaretli (kritik); Metnex zaten deployment secret/env değişkeni modeli kullanıyor | Mevcut Metnex secret/env yönetimi (bkz. `docs/security/APPLICATION_SECURITY_ARCHITECTURE.md`) |
| `%APPDATA%\BOT_APP\*.json` (VirtualColumns, HourlyPresets — istemci-yerel dosya) | SRS FR-060: rapor şablonları "yerel istemci dosyasına bağlı olmadan merkezi Metnex verisi olarak saklanmalı" | PostgreSQL'de kullanıcı/tenant'a bağlı şablon tablosu (implementation Wave 5'te tasarlanacak) |
| Tek-oturum zorlaması + 5 saniyelik DB nabız kontrolü (`Users.CurrentSessionId`, `UserLoginLogs`) | BOTC'ye özel bir desen; Metnex zaten JWT access/refresh token + `auth_sessions` tablosu kullanıyor (`docs/domain/DOMAIN_MODEL.md`) | Mevcut Metnex session/JWT modeli — **birebir port edilmez**, Wave 1'de değerlendirilecek açık bir tasarım sorusu (bkz. açık sorular Q-A01) |
| `VisibilitySettings` tablosu (admin'in tablo bazlı görünürlük anahtarı) | Ad-hoc bir UI-görünürlük mekanizması; Metnex'in permission + backend allowlist modeli aynı işlevi daha güçlü şekilde görür | SEC-DATA-002 backend allowlist (bkz. §4) |

## 3. PostgreSQL Migration Sınırı

- **Yalnızca `BOT_APP` uygulama verisi** (ve migration kararı Wave 4'te onaylanırsa Vardiya/Arşiv
  verisi) PostgreSQL'e taşınır. SQL Server, `BOT_APP` için runtime domain store olarak
  **kullanılmaya devam etmez** — bu D-003 kararıdır (Discovery §7.1).
- Wave 1 kapsamında PostgreSQL'e taşınacak somut alan: **kullanıcı kimlik alanları** (`Users`,
  `Roles`, `Permissions`, `UserPermissions` — yalnızca kimlik/permission'a ait kolonlar,
  `IsElectricMember`/`IsMechanicMember`/`IsMaintenanceMember`/`CanBeDofResponsible` gibi Wave 2/3'e
  özel bayraklar **migrate edilmez**, bkz. mapping dokümanı §2.1).
  - Wave 2/3 tabloları (`Tickets`, `MaintenanceRecords`, `DOF_APP.*`) PostgreSQL'e **hiç
    taşınmaz** (bu program kapsamında).
- SCADA endeks tabloları (`GtEndeks`/`SgEndeks`/`KomurEndeks`/`MosbioEndeks`/`VardiyaPerformans`)
  **PostgreSQL'e kopyalanmaz** — canlı SQL Server'da kalır, yalnızca read-only okunur (bkz. §4).
  Bir read-model/cache katmanı gerekip gerekmediği henüz kararlaştırılmamıştır (açık soru Q-M05,
  mapping dokümanında da işaretli — Discovery §7.3 Q-008 ile aynı konu).

## 4. SQL Server Read-Only Sınırı

BOTC'nin **mevcut** dinamik sorgu mekanizması (`QueryService.RunQueryAsync`,
`ValidateQueryInputs`) şu şekilde çalışır (kaynak kod doğrudan okunarak doğrulandı):

1. Kullanıcı bir `DataSourceName` + `TableName` + (opsiyonel) `SelectColumn` + `DateColumn`
   seçer.
2. `ValidateQueryInputs`, seçilen `TableName`'in **o an** `INFORMATION_SCHEMA.TABLES`
   sorgusunun döndürdüğü listede olup olmadığını kontrol eder (**dinamik varlık kontrolü**,
   sabit bir allowlist değil).
3. Kolon adı aynı şekilde `INFORMATION_SCHEMA.COLUMNS` ile "var mı" kontrolünden geçer; tarih
   kolonunun gerçekten tarih tipinde olması ayrıca doğrulanır.
4. SQL, tablo/kolon adları **string interpolasyonu** ile `[TableName]`/`[ColumnName]` olarak
   doğrudan sorguya yerleştirilir (yalnızca `@StartDate`/`@EndDate` parametreli); `QUOTENAME`
   veya eşdeğer bir kaçış mekanizması **yoktur** (Discovery R-006 ile birebir uyumlu bir bulgu).

**Bu, Metnex'in hedeflediği modelden zayıftır.** SRS FR-014–FR-017 ve SEC-DATA-001/002 açıkça
şunu gerektirir:

- Kullanıcıdan gelen database/schema/table/column değeri **tek başına** erişim kararı olamaz
  (FR-015) — BOTC'nin "her an INFORMATION_SCHEMA'da var mı" kontrolü bu ilkeyi karşılamaz,
  çünkü kaynağa **yeni bir tablo eklenirse** kullanıcı otomatik olarak erişebilir hale gelir.
- Kullanıcıya serbest SQL çalıştırma imkanı verilemez (SEC-DATA-001) — BOTC zaten serbest SQL
  vermiyor (yapılandırılmış query builder), ama tablo/kolon seçimi doğrulaması **allowlist**
  değil **varlık kontrolü** olduğu için prensip farklıdır.

**Mimari karar:** Metnex tarafında SQL Server erişimi şu ilkelerle yeniden inşa edilecektir
(BOTC kodu referans, birebir port değil):

1. Erişilebilir database/schema/table/column kümesi **backend'de admin tarafından küratörlü,
   sabit bir allowlist** olarak tutulur (BOTC'nin `VisibilitySettings`'inin yerini alır, ama
   "gizleme listesi" değil "izin verme listesi" mantığıyla — varsayılan **reddet**).
2. Tenant scope (MOSB/MOSEDAŞ/MOSBİO/MİP root aggregate) backend'de çözülür; kullanıcı hangi
   veri kaynağına eriştiğini seçebilir ama bu seçim yalnızca **kendi tenant'ının allowlist'i
   içinden** sunulur.
3. SQL Server'a `INSERT`/`UPDATE`/`DELETE` **hiçbir zaman** yapılmaz (FR-017) — BOTC zaten bunu
   yapmıyor (D-012, `bot_migrator` kullanıcısı yalnızca okuma amaçlı kullanılıyor görünüyor, ama
   kullanıcının gerçek SQL Server yetkisi bu ortamdan doğrulanamadı — açık soru Q-A02).
4. Timeout, satır ve export limitleri uygulanır (SRS/Discovery Q-011) — BOTC'de böyle bir sınır
   **görülmedi**, yeni bir güvenlik kontrolü olarak eklenmelidir.
5. Tablo/kolon adları SQL'e yerleştirilirken `QUOTENAME` (veya eşdeğer) ile kaçırılmalıdır —
   BOTC'nin R-006 riskini Metnex tarafında tekrar üretmemek için.

## 5. Tenant ve Permission Modeli

- Tenant hiyerarşisi: `MİP customer root → {MOSB, MOSEDAŞ, MOSBİO}` (Discovery §2.3, D-005) —
  bkz. mapping dokümanı §3. BOTC'de yapısal bir tenant modeli **yoktur**; bu hiyerarşi tamamen
  Metnex tarafında yeni kurulacaktır, BOTC'den "taşınacak" bir şey değildir.
- Permission modeli: BOTC'nin düz `Can*` string listesi + `Admin` özel-durumu (kod içinde
  hardcoded `if roleName == "Admin"` mantığı, `AuthService.LoginAsync`) Metnex'in
  `MODULE:RESOURCE:ACTION` formatına ve rol-permission-set modeline dönüştürülür (D-006, mapping
  dokümanı §2.2). **`Admin` adının veya BOTC'nin özel-durum mantığının birebir taşınması
  önerilmez** — Metnex'in zaten var olan `SYSTEM_ADMIN`/`TENANT_ADMIN` rol modeli kullanılmalıdır.
- Root aggregate erişimi: permission + `canAggregateChildren` + data scope **birlikte**
  değerlendirilir (D-006) — BOTC'de bu kavramın bir karşılığı yoktur (tek-tenant uygulama),
  tamamen yeni tasarlanacaktır.

## 6. Migration Güvenlik Modeli

BOTC kaynak kodunda doğrudan tespit edilen ve **hiçbirinin** Metnex'e taşınmaması gereken
davranışlar (Discovery R-001–R-004 ile birebir örtüşüyor, kod okunarak doğrulandı):

| BOTC davranışı (kod kanıtı) | Metnex kararı |
|---|---|
| `AuthService.LoginAsync`: hash eşleşmezse **düz metin parola karşılaştırması**na düşüyor, eşleşirse "fırsatçı" hash'liyor | **Taşınmaz.** Metnex tarafında düz metin parola kabul edilmeyecek; BOTC kullanıcıları için migration'da **zorunlu şifre sıfırlama** akışı kullanılacaktır (bkz. §8) |
| Tüm kullanıcılar için **tek global salt** (`Auth:PasswordSalt`, config'ten okunuyor) | **Taşınmaz.** Metnex kullanıcı başına salt/modern hash algoritması (mevcut Metnex auth altyapısı) kullanır; BOTC hash'leri **doğrudan içe aktarılamaz** |
| `ConfigProtector`: kod içine gömülü sabit AES anahtarı (`"BOT_App_2025_Secret_Key_32_Bytes"` — Discovery'de literal olarak belgelenmiş) | **Taşınmaz.** Metnex zaten ortam değişkeni/deployment secret modelini kullanıyor; herhangi bir BOTC secret'ı (SQL parolası, SMTP parolası, Telegram token'ı) **bu dokümana veya migration koduna asla yazılmaz**, yalnızca deployment-time secret injection ile taşınır |
| `bot_migrator` tek SQL kullanıcısı (Discovery R-005: "muhtemelen yüksek yetkili") | **Taşınmaz.** Metnex SQL Server adapter'ları için ayrı, **yalnızca okuma yetkili** bir SQL kullanıcısı kullanılmalıdır (kesin kullanıcı adı/yetki kapsamı açık soru Q-A02) |

**Kesin kural:** Bu migration'ın hiçbir aşamasında gerçek bir BOTC secret'ı, parolası veya
connection string'i herhangi bir Metnex dosyasına (doküman, kod, config) **yazılmayacaktır**.
Secret taşıma yasağı, migration implementasyon task'larının da açık bir kabul kriteri olmalıdır.

## 7. Idempotency / Dry-Run / Rollback Yaklaşımı

BOTC'nin kendi migration geçmişi yalnızca `BOT_APP` şemasını kapsar (`BOT.Data/Migrations/`, 3
gerçek migration + snapshot); DÖF ve Vardiya tabloları **elle SQL ile** oluşturulmuş (D-011) —
yani BOTC'nin kendisinde bile tutarlı bir migration disiplini yoktur. Metnex tarafında migration
implementasyonu için aşağıdaki ilkeler **karar olarak** belirlenmiştir (mekanizma detayları henüz
tasarlanmamıştır, açık sorular bkz. `BOTC_MIGRATION_OPEN_QUESTIONS.md`):

- **Idempotent:** Aynı migration script'i birden fazla kez çalıştırılabilmeli, ikinci çalıştırma
  veri **çoğaltmamalı** (upsert/kontrol mantığı gerekir — kesin strateji açık soru).
- **Dry-run modu:** Gerçek yazma yapılmadan, yalnızca ne kadar kayıt taşınacağı/hangi kayıtların
  çakışacağı raporlanabilmelidir.
- **Duplicate kayıt davranışı:** Kesinleşmedi — açık soru.
- **Eksik kaynak kayıt davranışı** (örn. `UserPermissions.PermissionId` referans verdiği
  `Permission` silinmişse): Kesinleşmedi — açık soru.
- **Migration sıralaması:** Roller → Permission'lar → Kullanıcılar → Kullanıcı-permission
  atamaları (FK bağımlılık sırası, `BotDbContext.OnModelCreating`'teki `HasForeignKey` ilişkileri
  ile uyumlu).
- **Backup/restore:** Migration'dan önce hedef PostgreSQL şemasının backup'ı alınmalı (Metnex'in
  zaten var olan `scripts/backup-db.sh` altyapısı kullanılabilir).
- **Rollback:** Idempotent migration + backup kombinasyonu ile; kesin rollback prosedürü
  implementasyon task'ında tasarlanacak.
- **Veri doğrulama / reconciliation:** Migration sonrası kaynak (SQL Server) ve hedef
  (PostgreSQL) arasında satır sayısı/örnek kayıt karşılaştırması yapılmalı — kesin yöntem açık
  soru.
- **Tarihsel veri başlangıç tarihi:** Kesinleşmedi (Discovery Q-006 ile aynı soru) — açık soru.

## 8. Password Reset / Secret Migration Kararı

- BOTC parola hash'leri (`PasswordHasher` — PBKDF2-SHA256, 100.000 iterasyon, **global salt**
  ile) Metnex'in hash algoritmasıyla **uyumlu değildir** ve global salt kullanımı zaten güvenlik
  riski olarak işaretlidir (R-004). Bu nedenle **gerçek kullanıcı parolaları migrate
  edilmeyecektir** (görev kapsamında da açıkça yasaklanmıştır).
- Önerilen yaklaşım (karar Product Owner onayına bağlı, açık soru Q-A03): migrate edilen her
  kullanıcı için Metnex tarafında **zorunlu parola sıfırlama** akışı tetiklenir (e-posta ile
  sıfırlama linki) — BOTC'deki `PasswordHash` alanı hiçbir biçimde Metnex `users` tablosuna
  kopyalanmaz.
- Secret migration (SQL/SMTP/Telegram credential'ları) tamamen **yasaktır** — bu credential'lar
  BOTC'nin kendi ortamına özeldir, Metnex tarafında yeniden, deployment-time secret olarak
  girilecektir; hiçbir migration script'i veya dokümanı bu değerleri okumaz/taşımaz.

## 9. Wave 1, Wave 4 ve Wave 5 İlişkisi

```text
Wave 0 (bu task dahil — mimari/mapping hazırlığı)
   ↓ (ön koşul)
Wave 1 (Kimlik/kullanıcı migration'ı)
   ↓ (SRS §6.1: Wave 5 implementasyonundan önce zorunlu ön koşul)
Wave 5 (Reporting/SCADA/DMS — Metnex'in ilk ana iş modülü)

Wave 4 (Vardiya/Arşiv) — Wave 1'den bağımsız ama ayrı onay gerektiren bir aday dal;
Wave 5 ile doğrudan bir bağımlılığı yoktur, paralel değerlendirilebilir.
```

- **Wave 1 → Wave 5 bağımlılığı kesindir** (SRS §6.1: "Wave 1 implementation'ı başlamadan önce
  aşağıdaki iki belge hazırlanmalıdır" — bu belgeler tamamlandı; "Wave 5 implementasyonundan önce
  zorunlu ön koşul" ifadesi Wave 1'in Wave 5'ten **önce** bitmesi gerektiğini gösteriyor, çünkü
  SCADA/DMS erişimi tenant-scope'lu kullanıcı/permission modeline dayanır).
- **Wave 4, Wave 1/Wave 5'in kesin ön koşulu değildir** ama pratikte kullanıcı/tenant modeli
  hazır olmadan Vardiya raporlarının "kim hangi lokasyonu görebilir" sorusu cevaplanamaz — bu
  nedenle **mantıksal olarak Wave 1'den sonra** ele alınması önerilir (kesin sıralama kararı
  Product Owner'a bırakılmıştır).

## 10. Wave 2 ve Wave 3 Kapsam Dışı Kararı

`docs/requirements/DISCOVERY.md` D-007 kararı ve §11.3/§11.4 ile birebir uyumlu: **Bakım/Arıza
(Wave 2) ve DÖF (Wave 3) bu geliştirme programının implementation kapsamında değildir.** Bu
kapsam dışı bırakma, bu mimari karar dokümanında da **teyit edilmiştir** — hiçbir migration
mapping'i, entity dönüşümü veya implementation önerisi bu iki alan için üretilmemiştir (mapping
dokümanı §2.5). İleride ele alınmaları ayrı bir Discovery/SRS ve açık Product Owner onayı
gerektirir.

---

## Kaynak Referansları

- `../BOTC/DISCOVERY.md` (tam okundu)
- `../BOTC/BOT.Data/{BotDbContext,DofDbContext,VardiyaDbContext,ArsivVardiyaDbContext}.cs`
- `../BOTC/BOT.Domain/*.cs` (27 dosyanın tamamı listelendi, kimlik/permission/SCADA/vardiya
  entity'leri detaylı okundu)
- `../BOTC/BOT.Services/{AuthService,UserAuthorizationService,QueryService,DataSourceService}.cs`
- `../BOTC/BOT.Services/Options/*.cs` (config şema anahtarları — değerler okunmadı)
- `../BOTC/BOT/appsettings.json` (yalnızca anahtar adları listelendi, `grep -oE` ile; hiçbir
  değer görüntülenmedi/kopyalanmadı)
- `docs/requirements/DISCOVERY.md` §1–§11 (Metnex tarafı, önceki oturumlarda hazırlanmış)
- `docs/requirements/SRS.md` §6, MOD-004/MOD-005 (FEAT-008 – FEAT-016)
