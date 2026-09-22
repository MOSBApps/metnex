# Metnex SQL Server Read-only Adapter — Hedef Mimari

> **Durum: Discovery/mimari dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-9-sql-server-readonly-adapter-architecture.md` (EPIC-004,
> Wave 0, bağımlılık: TASK-027.5 — done). Bu belge `BOTC_SCADA_DMS_SOURCE_MAPPING.md` (kaynak
> envanteri), `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` §4 (SEC-DATA-002 allowlist ilkesi, özet
> düzey) ve `BOTC_MIP_TENANT_LOCATION_MAPPING.md`'yi (tenant-scope ilkeleri) **tamamlar, tekrar
> etmez**. Bu belgenin odağı: SCADA/DMS SQL Server erişimi için **somut, Metnex'in gerçek
> kod desenlerine dayanan** read-only adapter mimarisi. **Q-SC02 (hangi BOTC yolu referans
> alınacak) ve Q-M05/Q-SC03 (PostgreSQL cache mi canlı sorgu mu, dataset sözleşmesi) bu belgede
> kesinleştirilmemiştir** — görev talimatının açık kuralı.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

- **BOTC tarafı:** `BOTC_SCADA_DMS_SOURCE_MAPPING.md` §1/§2 (7 `DynamicDataSources` anahtarı,
  çapraz-DB `FromSqlRaw` bulgusu) ve `BOTC_ENTITY_DOMAIN_MAPPING.md` §3 (`QueryService`/
  `DataSourceService` davranışı) kaynak olarak kullanıldı, yeniden üretilmedi.
- **Metnex tarafı — gerçek kod desenleri (bu task için yeniden okundu):**
  - `apps/api/src/db/db.service.ts` — `pg.Pool` tabanlı bağlantı havuzu, sorgu enstrümantasyonu
    (her sorgu metni **literal değerler maskelenerek** — `'...'`→`?`, `$N`→`?`, sayılar→`?` —
    hash'lenip performans koleksiyonuna yazılıyor, gerçek parametre değerleri **hiç saklanmıyor**).
  - `apps/api/src/audit/platform-audit.service.ts` — gerçek audit log sözleşmesi
    (`actorId`/`actionCode`/`entityType`/`entityId`/`summary`/`metadata`) ve `scrubSecrets()`
    (parola/token/secret anahtarlarını otomatik `[REDACTED]` yapan yardımcı fonksiyon).
  - `apps/api/src/reporting/report-render.service.ts` — Metnex'in **var olan** timeout+iptal
    deseni (`AbortController` + `setTimeout(() => controller.abort(), timeoutMs)`) ve boyut
    sınırı deseni (`MAX_PAYLOAD_BYTES`, aşılırsa `BadRequestException`) — SCADA adapter'ının
    **aynı ilkeleri** izlemesi önerilir (yeni bir desen icat edilmedi).
  - `apps/api/src/platform/permission.guard.ts`, `tenant-scope/tenant-scope.service.ts` —
    önceki task'larda (TASK-027.4/027.7) zaten derinlemesine okunmuştu, burada yalnızca SCADA
    adapter'ının bu iki mekanizmaya **nasıl bağlanacağı** açısından referans alındı.

**Gerçek connection string, kullanıcı adı, parola veya secret bu belgede okunmamış/kopyalanmamıştır.
Canlı SQL Server'a hiçbir bağlantı kurulmamıştır. Gerçek veri satırı raporlanmamıştır.**

---

## 1. İki BOTC Erişim Yolunun Karşılaştırması (Q-SC02 — hâlâ karar bekliyor)

`BOTC_SCADA_DMS_SOURCE_MAPPING.md` §2'de belgelenen iki yol, mimari uygunluk açısından burada
**yeniden karşılaştırılmıştır** (hangisinin Wave 5'in işlevsel referansı olacağı **kesinleştirilmemiştir**):

| Kriter | Yol 1: `DynamicDataSources` + `QueryService` | Yol 2: `IsletmeRaporlariWindow` hardcoded `FromSqlRaw` |
|---|---|---|
| Kaynak keşfi | Dinamik (`INFORMATION_SCHEMA` çalışma zamanı sorgusu) | Statik (kod içine gömülü üç-parçalı tablo adları) |
| Güvenlik modeli | Varlık kontrolü (var mı yok mu), allowlist değil | Yok — doğrudan güvenilen sabit sorgu |
| Esneklik | Kullanıcı farklı tablo/kolon seçebilir (UI'dan) | Sabit, yalnızca 5 SCADA entity'si için |
| Metnex hedef mimarisiyle uyumu | **Kısmen** — dinamik keşif mekanizması admin-küratörlü allowlist'e **dönüştürülmeli** (mimari karar dokümanı §4) | **Kısmen** — sabit sorgu deseni allowlist'in "sabit, önceden onaylı kaynak listesi" ilkesine **daha yakın**, ama kod-gömülü olması (config-driven değil) Metnex'in admin-yönetilebilirlik hedefiyle **çelişir** |
| Çapraz-DB erişim | Her `DynamicDataSources` anahtarı **kendi** connection string'ine sahip (izole) | **Tek** `BOT_APP` connection'ı üzerinden çapraz-DB (`MOSEDAS.dbo.*` gibi) — geniş yetkili tek login |

**Sonuç:** Her iki yolun da Metnex'in hedef mimarisine **birebir taşınacak** bir modeli yok —
ikisi de kısmi uyumlu, kısmi uyumsuz. Bu belge, aşağıdaki §3–§9'daki mimariyi **her iki BOTC
yolundan bağımsız olarak, Metnex'in kendi ilkelerinden (SEC-DATA-001/002, Discovery §2.2/§20)**
türetmiştir — hangi BOTC yolunun "kaynak veri envanteri referansı" olarak kullanılacağı
(Q-SC02) ayrı bir karardır ve burada **kapatılmamıştır**.

---

## 2. Hedef Mimari İlkesi — Admin-Küratörlü Allowlist Modeli

`BOTC_MIGRATION_ARCHITECTURE_DECISION.md` §4'teki SEC-DATA-002 ilkesi burada **somutlaştırılmıştır**
(implementation değil, mimari tasarım):

| Seviye | Allowlist birimi | İlke |
|---|---|---|
| **Database** | Hangi SQL Server veritabanlarının (`MOSEDAS`, `MOSBIO_RAPORLAR`, `MOSBIO_TELEGRAM`, vb.) erişilebilir olduğu | Yalnızca admin tarafından **önceden onaylanmış** veritabanları listede yer alır; `INFORMATION_SCHEMA` ile dinamik keşif **yapılmaz** |
| **Schema** | Her veritabanı içinde hangi şemaların (`dbo` vb.) erişilebilir olduğu | Aynı ilke — sabit liste |
| **Table** | Hangi tabloların (`gt_endeksler`, `endeksler`, vb.) sorgulanabileceği | Aynı ilke; BOTC'nin `VisibilitySettings` UI-toggle modelinin **yerini alır** (`BOTC_ENTITY_DOMAIN_MAPPING.md` §5, `VisibilitySettings` migrate edilmez) |
| **Column** | Her tablo için hangi kolonların döndürülebileceği | `SELECT *` **yapılmaz** — yalnızca allowlist'teki kolonlar seçilir; bu, BOTC'nin `SELECT *`/`SELECT [col1],[col2]` karışık deseninden (`QueryService.RunQueryAsync`) kasıtlı bir sapmadır |
| **Sorgu/filtre** | Hangi filtre operatörlerinin (tarih aralığı, eşitlik) izinli olduğu | Serbest SQL **yasak** (SRS SEC-DATA-001) — yalnızca önceden tanımlı, parametreli sorgu şablonları çalıştırılabilir |

Her allowlist girdisi **admin tarafından, backend'de, önceden** tanımlanır — kullanıcıdan gelen
hiçbir database/schema/table/column/filtre değeri **doğrudan** bir SQL ifadesine dönüşmez (SRS
FR-015 ile birebir).

---

## 3. Read-only Erişim Gereksinimleri

| Gereksinim | Tasarım | Metnex precedent/gerekçe |
|---|---|---|
| **Ayrı read-only credential** | SCADA adapter, Metnex'in PostgreSQL bağlantısından (`db.service.ts`, `DATABASE_URL`) **tamamen ayrı**, yalnızca `SELECT` yetkisine sahip bir SQL Server login kullanır | BOTC'nin `IsletmeRaporlariWindow`'daki geniş-yetkili tek-login modeli (`BOTC_SCADA_DMS_SOURCE_MAPPING.md` §2) **taşınmaz** — bu doğrudan bir "taşınmaz" maddesidir |
| **Bağlantı izolasyonu** | SCADA connection pool, PostgreSQL `pg.Pool`'dan **ayrı bir havuz** olarak yönetilir (aynı `DbService` sınıfı içinde değil, ayrı bir modül) | Bir kaynaktaki sorun (yavaş SQL Server) diğerini (PostgreSQL, ana uygulama) etkilememeli |
| **SELECT-only kısıtı** | Hem SQL login yetkisi (DB seviyesi) hem uygulama seviyesi (yalnızca `SELECT` şablonları çalıştırılabilir, `INSERT`/`UPDATE`/`DELETE`/`EXEC` kod yolunda **hiç yok**) — **çift katman** | Discovery §2.2 ("SQL Server SCADA/DMS veritabanlarına runtime erişim yalnızca read-only olacaktır") ile birebir; tek katmana güvenmemek (yalnızca DB yetkisi veya yalnızca kod) savunma-derinliği ilkesidir |
| **Timeout** | Her sorgu için sabit bir üst zaman sınırı — Metnex'in var olan `report-render.service.ts` deseni (`AbortController` + `setTimeout(() => controller.abort(), timeoutMs)`) **aynı ilkeyle** SQL Server sorgularına uygulanır | Var olan, test edilmiş bir Metnex deseni — yeni bir mekanizma icat edilmedi |
| **Cancellation** | Timeout tetiklendiğinde veya istemci bağlantısı kesildiğinde sorgu **sunucu tarafında da** iptal edilir (SQL Server sürücüsünün `cancel()` yeteneği kullanılır) | Yarım kalan sorguların SQL Server tarafında kaynak tüketmeye devam etmesini önler |
| **Connection pool sınırları** | Havuz boyutu (`max`), boşta bekleme süresi (`idleTimeoutMillis`) gibi sınırlar **açıkça** tanımlanır — PostgreSQL `pg.Pool`'un zaten yaptığı gibi | SCADA kaynağının aşırı yüklenmesini önler, MİP root aggregation sırasında (birden fazla işletme kaynağına paralel sorgu, §6) havuz tükenmesi riskini sınırlar |
| **Sonuç satırı/kolon/boyut limitleri** | Her sorgu için maksimum satır sayısı ve maksimum yanıt boyutu (byte) **zorunlu** — `report-render.service.ts`'nin `MAX_PAYLOAD_BYTES` deseniyle **aynı ilke** | Discovery §20 ("export işlemleri ayrı permission ile sınırlandırılabilmeli", satır/timeout sınırı ihtiyacı zaten mimari karar dokümanı §4'te not edilmişti — burada somutlaştırıldı) |
| **Hata davranışı** | SQL Server hatası (bağlantı, syntax, yetki) kullanıcıya **ham hata mesajı olarak asla** döndürülmez — genel bir "kaynak şu anda erişilemez" mesajı + audit'e tam hata detayı (§8) | Ham SQL Server hata mesajları şema/tablo isimleri sızdırabilir (bilgi ifşası riski) |
| **Timeout/empty-result sözleşmesi** | Timeout → `504`/`GatewayTimeoutException`-benzeri kontrollü hata; sıfır satır → boş liste (`200`, hata değil) — BOTC'de bu ayrım kod tarafında **net değildi** | Kabul kriteri #3 |

---

## 4. Kullanıcı Girdisi Güvenliği ve SQL Injection

- **Kullanıcıdan gelen hiçbir database/schema/table/column/filtre değeri, tek başına erişim
  yetkisi olarak kabul edilmez** (SRS FR-015, SEC-DATA-001/002) — her istek, allowlist'e karşı
  **backend'de** doğrulanır, kullanıcı girdisi yalnızca allowlist'teki **önceden onaylı**
  seçeneklerden birini işaret edebilir (örn. bir `enum`/id, serbest string değil).
- **`QUOTENAME`'siz string interpolasyon yaklaşımı taşınmaz:** `QueryService.RunQueryAsync`'in
  `$"[{request.TableName}]"` deseni (Discovery R-006, mimari karar dokümanı §4 madde 1) —
  Metnex adapter'ı **yalnızca parametreli sorgular** (`sql.Request().input(...)` benzeri, sürücüye
  özgü parametre bağlama) kullanır, hiçbir tablo/kolon adı **runtime'da kullanıcı girdisinden
  string birleştirmeyle** oluşturulmaz — tablo/kolon adları yalnızca **allowlist'teki sabit
  string'lerden** seçilir.
- **`INFORMATION_SCHEMA` çalışma zamanı keşfi kullanılmaz** — §2'de belirtildiği gibi, keşif
  admin tarafından önceden yapılır, çalışma zamanında yalnızca allowlist okunur.

---

## 5. Tenant Scope Entegrasyonu

`apps/api/src/platform/tenant-scope/tenant-scope.service.ts`'nin **gerçek** `resolve()` mantığı
(TASK-027.4/027.5'te derinlemesine incelenmişti) burada SCADA adapter'ına şu şekilde bağlanır:

1. İstek, bir `tenantId` ile gelir (guard'lar tarafından zaten doğrulanmış, `TenantMembershipGuard`).
2. `TenantScopeService.resolve(tenantId)` çağrılır → `dataScopeTenantIds` (tek tenant veya,
   `canAggregateChildren=true` ise, tüm torun tenant'lar — `tenant_closure` üzerinden) döner.
3. SCADA adapter, **her** `dataScopeTenantIds` üyesi için allowlist'te **o tenant'a atanmış**
   kaynakları (database/table) bulur ve yalnızca bunları sorgular.
4. Tenant↔SCADA-kaynak eşlemesi (hangi tenant'ın hangi `DynamicDataSources`/database'e sahip
   olduğu) **allowlist'in bir parçasıdır** — bu eşlemenin kendisi Q-SC01 (GT/SG/Kömür Kazanı
   MOSEDAŞ mı MOSB mı) çözülmeden **tam olarak doldurulamaz**, burada yalnızca **mekanizma**
   tanımlanmıştır, veri **doldurulmamıştır**.

**Root tenant aggregation davranışı (kabul kriteri #6):** MİP `ROOT` tenant'ı
(`canAggregateChildren=true`) için adapter, `dataScopeTenantIds`'teki **her** işletme tenant'ının
(MOSB/MOSEDAŞ/MOSBİO) allowlist'te tanımlı kaynaklarını **ayrı ayrı** sorgular ve sonuçları
uygulama katmanında birleştirir (SQL Server tarafında birleşik bir sorgu **değil** — her tenant'ın
kaynağı kendi izole connection'ından okunur, §3 "bağlantı izolasyonu"). Bu, D-006'nın
"permission + `canAggregateChildren` + data scope birlikte" ilkesiyle birebir tutarlıdır.

---

## 6. Permission Guard İlişkisi (hazırlık)

`PermissionGuard`'ın gerçek çözümleme mantığı (TASK-027.7'de derinlemesine incelenmişti — yalnızca
`PLATFORM:` prefiksli izinler `systemRoles` üzerinden, diğerleri `tenantRolePermissions`
üzerinden çözülüyor) SCADA okuma izinleri için **aynen geçerli olacaktır**: bir
`SCADA:DASHBOARD:VIEW` benzeri (Q-M03'e bağlı kesin isim) izin kodu, tenant-scoped bir izin
olacağı için `userTenantRoleAssignments`→`tenantRoles`→`tenantRolePermissions` yoluyla çözülür.
**Bu belge yalnızca bu ilişkiyi hazırlık amaçlı belgeler** (görev talimatı: "belgelemeye hazırla")
— gerçek permission kod isimleri Q-M03'e bağlı, implementation burada üretilmemiştir.

---

## 7. Audit Kaydı Sözleşmesi

`apps/api/src/audit/platform-audit.service.ts`'nin **gerçek** `PlatformAuditLogInput` sözleşmesi
(`actorId`, `actionCode`, `entityType`, `entityId`, `summary`, `metadata`) SCADA sorgu audit'ine
şu şekilde eşlenir (mimari öneri, implementation değil):

| Audit alanı | SCADA sorgusu karşılığı |
|---|---|
| `actorId` | Sorguyu çalıştıran kullanıcının ID'si |
| `actionCode` | Örn. `SCADA:QUERY:EXECUTE` (Q-M03 formatıyla tutarlı) |
| `entityType` | Sorgulanan kaynak tipi (örn. `scada_source`) |
| `entityId` | Allowlist'teki kaynak kimliği (database+table, gerçek connection string değil) |
| `summary` | İnsan-okunabilir özet (örn. "GT endeks verisi sorgulandı, 2026-09-01–2026-09-17") |
| `metadata` | `tenantId`, sorgulanan tarih aralığı, dönen satır sayısı, süre (ms), timeout/hata durumu — **`scrubSecrets()` ile otomatik korunur**, hiçbir credential/connection string metadata'ya girmez |

Görev talimatının istediği 7 alan (kullanıcı, tenant, kaynak, tablo, zaman, sonuç/limit,
hata/timeout) yukarıdaki tabloda **tamamı karşılanmıştır**. Gerçek sorgu SQL metni, `db.service.ts`
deseniyle **aynı ilkeyle** (literal değerler maskelenerek) saklanabilir — ham parametre değerleri
audit kaydına **asla** yazılmaz.

**Yeni açık soru (Q-AD01, §11):** SCADA sorguları zaman-serisi/sık-tekrarlanan bir desen
olabileceğinden (her dashboard yenilemesi bir sorgu), genel `platform_audit_log` tablosuna mı
yazılacağı yoksa hacim/performans nedeniyle **ayrı bir audit tablosuna** mı yazılacağı bu belgede
**kesinleştirilmemiştir**.

---

## 8. `DynamicDataSources`/Hardcoded Adların Taşınmaması Gereken Yönleri

| BOTC öğesi | Neden doğrudan taşınmaz |
|---|---|
| `DynamicDataSources` config anahtarları (`gt_endeksler`, vb.) | Bunlar BOTC'nin **kendi** `appsettings.json` yapı biçimidir; Metnex'in allowlist'i kendi veri modelinde (muhtemelen PostgreSQL'de bir tablo, implementation kararı) tutulmalı — BOTC'nin config-dosyası deseni **birebir kopyalanmaz** |
| `ConfigProtector` ile şifrelenmiş connection string'ler | Sabit gömülü AES anahtarı zaten "taşınmaz" (mimari karar dokümanı §6); Metnex kendi secret-yönetim mekanizmasını (ortam değişkeni/secret store) kullanmalı |
| `IsletmeRaporlariWindow`'daki hardcoded üç-parçalı tablo adları (`MOSEDAS.dbo.gt_endeksler` vb.) | Bu adlar **kanıt** olarak değerlidir (§1, Q-SC01/Q-SC02) ama **doğrudan yeni bir runtime mekanizmasına gömülmez** — Metnex'in allowlist'i admin tarafından **yönetilebilir** (kod değişikliği gerektirmeden güncellenebilir) olmalı, BOTC'nin kod-gömülü deseni bu hedefle çelişir |

---

## 9. PostgreSQL Cache/Canlı-Sorgu Kararı — Kesinleştirilmedi

Görev talimatı gereği: bu belge **Q-M05** (SCADA canlı mı, read-model/cache mi) ve **Q-SC03**
(`ReportDatasetProvider` genişletilecek mi, ayrı sözleşme mi) sorularını **yeniden çözmemiştir**.
Yukarıdaki §2–§8'deki mimari (allowlist, read-only credential, timeout, audit) her iki senaryoda
(canlı sorgu **veya** periyodik cache) **aynı şekilde geçerlidir** — bu mimarinin canlı-sorgu/cache
kararından **bağımsız** olması kasıtlıdır (hangisi seçilirse seçilsin, güvenlik/audit katmanı
aynı kalır).

---

## 10. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu belge yalnızca SCADA/DMS read-only erişim mimarisini ele almıştır; Ticket/MaintenanceRecord/
FaultRecord (Wave 2) ve DÖF (Wave 3) için **hiçbir mapping veya implementation önerisi
üretilmemiştir** (D-007 ile tutarlı).

---

## 11. Yeni Açık Soru

Mevcut **Q-M05**, **Q-S03**, **Q-SC02**, **Q-SC03** bu task'ta **kapatılmamış**, aksine somut
mimari tasarımla (§1, §5, §9) **ilişkilendirilmiştir**. Bunun ötesinde
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye **1 yeni soru** append edildi:

- **Q-AD01** — SCADA sorgu audit kayıtları genel `platform_audit_log` tablosuna mı, yoksa
  hacim/performans nedeniyle ayrı bir audit tablosuna mı yazılacak (zaman-serisi/sık-tekrarlanan
  sorgu deseni nedeniyle)?

Özet tablosuna 1 yeni satır eklendi.

---

## 12. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 13. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı üretmemiştir** — Q-SC01/Q-SC02 (hangi kaynak/yol
  referans), Q-M05/Q-SC03 (cache/sözleşme), Q-M03 (permission adı) çözülmeden Wave 5
  implementation task'ları başlatılamaz.
- Allowlist'in **veri modeli** (hangi tabloda, hangi şemada tutulacağı) bu belgede
  **tasarlanmamıştır** — yalnızca kavramsal seviye (database/schema/table/column/sorgu) tanımlandı.
- Q-AD01 (audit hacim kararı) çözülmeden audit implementasyonu netleşemez.
- Gerçek secret/parola/connection string/veri satırı hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Canlı SQL Server'a
  hiçbir bağlantı kurulmadı. Git commit/push yapılmadı.
