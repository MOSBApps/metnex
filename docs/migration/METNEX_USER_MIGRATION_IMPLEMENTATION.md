# Metnex User Migration Implementation

> **Durum güncellemesi (2026-09-17, "Wave 1 User Migration Implementation" görev talimatı):**
> AI1, TASK-027.12-R1 ile 6 karar kapısının (Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01) tamamını
> kapatmış ve bu task'ı implementation için `ready` durumuna almıştır. Bu görev talimatıyla
> **implementation gerçekten üretilmiştir** — §0 bu implementasyonu anlatır. §1'den itibaren
> **orijinal blocker raporu** (2026-09-17, gates henüz açıkken yazılmış) **değiştirilmeden, tarihi
> kanıt kaydı olarak korunmuştur** — o tarihte doğruydu, artık geçerli değildir (gates artık kapalı).

**Tarih (implementation):** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

---

## 0. Implementation Özeti (bu güncelleme)

### 0.1 Ne inşa edildi

`apps/api/src/migration/botc-identity/` altında, BOTC kullanıcı/rol/permission/tenant-üyelik
verisini Metnex identity modeline dönüştüren, framework-hafif bir TypeScript motoru eklendi:

| Dosya | Sorumluluk |
|---|---|
| `types.ts` | Kaynak/staging/rapor tipleri (design doc'un §4.1 alan listesiyle birebir) |
| `checksum.util.ts` | Deterministik `sha256` fingerprint (idempotency temeli) |
| `staging-store.ts` | `migration_staging_identity`'nin **in-memory simülasyonu** (bkz. §0.3 — Q-ID01) |
| `tenant-mapping.ts` | Q-M06 kararının uygulanması — `Sirket` **hiç okunmaz**, tenant ataması yalnızca çağıranın verdiği onaylı dış mapping tablosundan çözülür |
| `permission-mapping.ts` | Q-M03 kararının uygulanması — yalnızca `BOTC_TO_METNEX_MAPPING.md` §2.2'de zaten somut kodu olan 5 izin eşlenir, geri kalanı **uydurulmadan** "eşlenemedi" olarak raporlanır |
| `source-adapter.ts` | Salt-okunur kaynak port arayüzü + test/fixture amaçlı in-memory implementasyon (gerçek SQL Server adapter'ı **bilerek üretilmedi**, bkz. §0.4) |
| `role-template.service.ts` | Q-M04 kararının uygulanması — kullanıcılar efektif (mapped) izin setlerine göre kümelenip ortak `tenantRoles` şablonlarına atanır |
| `duplicate-detection.ts` | Duplicate user/role ve çelişen tenant ataması tespiti — en küçük `legacyId` deterministik kazanan olarak seçilir |
| `simulated-target.ts` | `users`/`tenantMemberships`/`tenantRoles`/`tenantRolePermissions`/`userTenantRoleAssignments`'ın **in-memory simülasyonu** (gerçek PostgreSQL değil, bkz. §0.4) |
| `audit-metadata.ts` | `platform-audit.service.ts` sözleşmesiyle uyumlu run-metadata şekli (gerçek `platform_audit_log`'a **yazılmaz**) |
| `migration-run.service.ts` | Orkestratör — dry-run + apply (yalnızca simüle target'a), idempotency, retry, tenant-membership/permission mapping'i birleştirir |
| `index.ts` | Barrel export |

25 unit/integration testi (`*.spec.ts`, aynı dizin) — tümü fixture/sentetik veriyle, **gerçek BOTC
verisi kullanılmadan**.

### 0.2 Kapsam maddelerinin karşılanması

| Görev talimatı maddesi | Karşılandı mı | Not |
|---|---|---|
| 1. Source adapter tasarımı | Kısmi — arayüz + in-memory fixture adapter var, **gerçek SQL Server implementasyonu yok** (bilerek, bkz. §0.4) |
| 2. Legacy ID → UUID mapping | ✅ `StagingRecord.targetId`, `crypto.randomUUID()`, checksum bazlı idempotency |
| 3. User mapping (Username/FullName/Active/CreatedDate/Email) | ✅ `migration-run.service.ts` — email `Email` alanından, yoksa `Username`'den türetilir; `@` içermiyorsa doğrulama kapısı `BLOCKED` üretir (Username'in her zaman e-posta formatında olduğu doğrulanmamıştı, `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.1) |
| 4. Role/permission mapping | ✅ `permission-mapping.ts` + `role-template.service.ts` |
| 5. Ortak permission set'lerinden rol şablonu | ✅ `RoleTemplateService.buildTemplates()` — deterministik kümeleme, `role-template.service.spec.ts` |
| 6. Onaylı tenant mapping tablosu | ✅ `tenant-mapping.ts` — `Sirket` hiç okunmaz, yalnızca dışarıdan verilen `ApprovedTenantAssignmentEntry[]` kullanılır |
| 7. Çözülemeyen tenant → erişime hazır göstermeden raporla | ✅ `unresolvedRecords` + `tenantMembershipStatus = UNRESOLVED`, `targetState.tenantMembershipsByUserId`'e **hiç yazılmaz** |
| 8. `tenantMembershipStatus` (ASSIGNED/UNRESOLVED) | ✅ |
| 9. `passwordStrategy` (RESET_REQUIRED/ADMIN_ASSIGNED) | ✅ Her oluşturulan kullanıcı `RESET_REQUIRED` alır; `ADMIN_ASSIGNED` opsiyonel ek bayrak (`adminAssignedPasswordLegacyIds`) — gerçek parola/hash **hiçbir zaman** üretilmez/saklanmaz |
| 10. Duplicate/conflict deterministik ele alma | ✅ `duplicate-detection.ts` |
| 11. Dry-run çıktısı (8+ alan) | ✅ `DryRunReport` — toplam kayıt, oluşturulacak/güncellenecek/atlanacak kullanıcı, çakışmalar, rol/permission değişiklikleri, tenant sonuçları, unresolved kayıtlar, hata/uyarılar, parola stratejisi özeti |
| 12. Idempotent tekrar çalıştırma | ✅ `migration-run.service.spec.ts` — "idempotent re-run" testi: ikinci `APPLY` aynı `targetId`'leri korur, sıfır duplicate, checksum değişmeyen kayıtlar `SKIPPED` |
| 13. Audit metadata / run correlation | ✅ `audit-metadata.ts` — gerçek `PlatformAuditService`'e **yazılmaz**, yalnızca şekil üretilir (bkz. §0.4) |
| 14. Başarısız kayıtların retry'lenebilirliği | ✅ `simulateFailureLegacyIds` test hook'u + "retries a FAILED record" testi — `FAILED` durumundaki kayıt bir sonraki çalıştırmada otomatik yeniden denenir, kısmi `targetId` asla yazılmaz |
| 15. Unit/integration testleri | ✅ 25 test, 6 dosya, tüm senaryolar (dry-run/apply/idempotency/retry/duplicate/unresolved) kapsanıyor |

### 0.3 Q-ID01 Koruması — Nasıl Uygulandı

Görev talimatı açıkça şunu istiyordu: *"`migration_staging_identity` için fiziksel Drizzle
schema/migration oluşturulması staging şeması ve retention kararı gerektiriyorsa implementation'ı
durdur ve blocker raporu ver."* **Bu koşul tetiklenmedi** çünkü hiçbir fiziksel Drizzle şeması
veya migration dosyası **üretilmedi** — `staging-store.ts`'deki `InMemoryStagingStore`, tasarım
dokümanının (§4) alan listesini **birebir** uygulayan ama yalnızca process ömrü boyunca yaşayan,
hiçbir zaman PostgreSQL'e yazılmayan bir simülasyondur. Bu, Q-ID01'i (şema yerleşimi: ayrı
`migration` şeması mı `public` mi; retention: migration sonrası silinir mi kalıcı mı) **çözmeden**
bu görevin geri kalan tüm kapsam maddelerini uygulamayı mümkün kıldı. **Q-ID01 hâlâ tamamen
açıktır** — bu implementasyon onu kapatmaz, yalnızca bypass eder. Gerçek bir Drizzle
şeması/migration'ın yazılması **ayrı bir task ve ayrı bir AI1 kararı** gerektirir.

Aynı gerekçeyle Q-P02 (`VisibilitySettings`) bu implementasyonda **hiç ele alınmamıştır** — ne
`BotcSourceEntityType`'da bir `VISIBILITY_SETTING` işleyicisi, ne staging kaydı, ne target satırı
üretildi.

### 0.4 Bilerek Üretilmeyen Parçalar (görevin güvenlik/çalışma sınırları gereği)

- **Gerçek SQL Server adapter'ı** — `source-adapter.ts`, arayüzü tanımlar ve yalnızca test
  amaçlı `InMemoryBotcIdentitySourceAdapter`'ı içerir. `METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md`'ye
  göre gerçek bir adapter yazmak canlı bir SQL Server bağlantısı **gerektirir** — bu görevde
  açıkça yasak.
- **Gerçek PostgreSQL yazımı** — `MigrationRunService.run({mode: 'APPLY'})`, yalnızca
  `SimulatedTargetState`'e (in-memory) yazar. Gerçek Drizzle `db.insert(...)` çağrısı **hiçbir
  yerde yoktur**. Bu, hem "PostgreSQL'e gerçek apply yapma" kuralına hem de Q-ID01'in henüz
  çözülmemiş olmasına uyumludur.
- **`authSessions`** — kod tabanında bu tabloya hiçbir referans/import yoktur (`grep -rn
  "authSessions" apps/api/src/migration` → 0 sonuç); `simulated-target.ts`'in kendi şekli de bu
  kavramı **hiç içermez** (`migration-run.service.spec.ts`'te doğrudan test edildi).
- **`PlatformAuditService` çağrısı** — `audit-metadata.ts` yalnızca o servisin beklediği veri
  şeklini üretir, servisin kendisini import etmez veya çağırmaz — gerçek `platform_audit_log`
  tablosuna hiçbir satır yazılmaz.
- **Gerçek parola/hash/salt/token** — `passwordStrategy` yalnızca bir durum etiketidir
  (`RESET_REQUIRED`/`ADMIN_ASSIGNED`); hiçbir yerde gerçek bir hash veya parola string'i
  üretilmez, saklanmaz veya loglanmaz.

### 0.5 Doğrulama (implementation)

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **25/25 test PASS** (6 test
  dosyası: `checksum.util`, `tenant-mapping`, `permission-mapping`, `duplicate-detection`,
  `role-template.service`, `migration-run.service`).
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda ayrıca belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı — tüm
  test fixture'ları sentetiktir (`op1@example.com` gibi örnek değerler).
- Docker çalıştırılmadı, SQL Server'a bağlanılmadı, PostgreSQL'e gerçek apply yapılmadı,
  `authSessions` oluşturulmadı, Wave 2/Wave 3 modüllerine dokunulmadı, git commit/push yapılmadı.

### 0.6 Kalan Riskler / Sonraki Bağımlılık (implementation)

- **Q-ID01 çözülmeden** bu motorun gerçek bir PostgreSQL staging tablosuna bağlanması mümkün
  değildir — bir sonraki implementation adımı önce bu kararı gerektirir.
- **Gerçek bir SQL Server adapter'ı** yazılmadan bu motor gerçek BOTC verisiyle çalıştırılamaz —
  `METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md`'nin somutlaştırılması ayrı bir task'tır.
- **Gerçek PostgreSQL apply'ı** (Drizzle `db.insert`/`db.transaction` ile) yazılmadan bu motorun
  ürettiği plan hiçbir zaman gerçek kullanıcı oluşturmaz — bu da ayrı, AI1 onayı gerektiren bir
  adımdır (canlı DB yazımı, TASK-027.12'nin kendi güvenlik sınırları gereği bu task'ta yasaktı).
- Q-P02 (`VisibilitySettings`) ve Q-T01/Q-SC01'in lokasyon-özel kısımları **hâlâ açıktır** —
  belirsiz lokasyonlu kullanıcılar `tenantMembershipStatus = UNRESOLVED` kalmaya devam eder, bu
  motorun kendisi tarafından doğru şekilde raporlanır ama çözülmez.
- 11 BOTC `Can*` izninin (5'i hariç) hâlâ onaylı bir `MODULE:RESOURCE:ACTION` kodu yok —
  `permission-mapping.spec.ts` bu izinlerin `null` döndüğünü doğrular; gerçek apply'da bu
  kullanıcılar için ilgili izinler **hiç yazılmaz**, yalnızca uyarı olarak raporlanır.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi (yeni kod yalnızca yeni
  dosyalardan oluşuyor, mevcut hiçbir dosya değiştirilmedi). Git commit/push yapılmadı.

---

## 0-B. Permission Mapping Coverage (TASK-027.14, 2026-09-18)

> TASK-027.14, TASK-027.12/027.13'ün motorunu **değiştirmeden** permission mapping sözleşmesinin
> kapsamını doğruladı, değişmezlik testleri ve bir coverage raporu ekledi. Yeni bir permission kodu
> **icat edilmedi**, production `permission-catalogue.ts` **değiştirilmedi**.

### 0-B.1 Coverage Sonucu

`apps/api/src/migration/botc-identity/permission-coverage.ts` (yeni), `BOTC_TO_METNEX_MAPPING.md`
§2.2'de belgelenen 17 BOTC `Can*` izninin tamamını referans alarak şu sonucu üretir
(`computePermissionMappingCoverage`, `permission-coverage.spec.ts` ile doğrulandı):

| Kategori | Sayı | Örnekler |
|---|---|---|
| Onaylı (Q-M03, değişmedi) | 5 | `CanManageShifts`→`SHIFT:REPORT:UPDATE`, `CanViewShiftReports`→`SHIFT:REPORT:VIEW`, `CanViewDynamicDashboard`→`SCADA:DASHBOARD:VIEW`, `CanViewHourlyReport`→`REPORT:HOURLY_CONSUMPTION:VIEW`, `CanViewPlantReports`→`REPORT:PLANT:VIEW` |
| Wave 2 nedeniyle bilinçli beklemede | 4 | `CanCreateTicket`, `CanViewAllTickets`, `CanViewOwnTickets`, `CanViewReports` |
| Wave 3 nedeniyle bilinçli beklemede | 5 | `CanCreateDof`, `CanCloseDof`, `CanApproveDof`, `CanViewDof`, `CanViewAllDof` |
| Wave 1/4 kapsamında ama hâlâ kod ataması yok (UNMAPPED) | 3 | `CanAccessSystemTools`, `CanManageUsers`, `CanReceiveShiftReportEmail` |

**Yeni bulgu (gerçek koddan doğrulandı, karar değildir):** `apps/api/src/platform/permission-catalogue.ts`'teki
gerçek `ASSIGNABLE_CATALOGUE`'un 10 kodu (`SETTINGS:*`, `CUSTOMER:ADMIN:*`, `REPORT:ARTIFACT:*`)
ile yukarıdaki 5 onaylı BOTC-kaynaklı kodun **hiçbir kesişimi yok** — bu iki katalog şu an tamamen
ayrık. Ayrıca `grep -rn "permission-catalogue" apps/api/src` ile doğrulandı: `ASSIGNABLE_CATALOGUE`
şu an **hiçbir production dosyasında import edilmiyor/kullanılmıyor** (kendi tanım dosyası hariç) —
yani onaylı 5 BOTC kodunun gerçek migration apply'ında `tenantRolePermissions.permissionCode`'a
yazılabilmesi için, bu kodların önce gerçek `permissions`/`ASSIGNABLE_CATALOGUE`'a **eklenmesi
gerekecektir** (bu task'ın kapsamı dışında — "Permission catalogue production değişikliği"
kesinlikle yasaktı). Bu, gelecekteki gerçek apply implementation'ı için **yeni bir ön koşul
riski** olarak not edilmiştir, bir karar değildir.

### 0-B.2 UserPermission / Role Template Etkisi

`permission-governance.spec.ts` (yeni) doğruladı: eşlenen bir `UserPermission` grant'i
`COMPLETED` staging kaydı alır ve `targetId`'si onu tüketen role template'in ID'sine işaret eder;
eşlenemeyen bir grant `BLOCKED` staging kaydı alır (`targetId = null`, `errorCode =
RECOVERABLE_UNMAPPED_PERMISSION`) ve **hiçbir zaman** bir role template'in `permissionCodes`
listesine girmez — yalnızca "hangi grant'ler eşlenemedi" olarak `report.errorsAndWarnings`'a
yansır. Yalnızca eşlenemeyen izinleri olan bir kullanıcı yine de bir kimlik satırı ve boş-izinli
bir role template alır (§8.1'deki katman-1 tamamlanma modeliyle tutarlı) — **hiçbir zaman**
uydurma bir erişim izni almaz.

### 0-B.3 Determinizm Kanıtı

`role-template.service.spec.ts`'e eklenen 3 yeni test: izin sırası template ID'sini değiştirmiyor,
aynı iznin iki kez verilmesi (duplicate grant) template'te tekrarlanan kod üretmiyor, eşlenemeyen
bir grant'in eklenmesi/çıkarılması mapped-permission imzasını **değiştirmiyor**.
`permission-mapping.spec.ts`'e eklenen 4 yeni test: onaylı map'in tam olarak 5 kayıt içerdiği,
`mapPermissionCode`'un saf/deterministik olduğu, kısmi/büyük-küçük-harf eşleşmesi yapılmadığı.

### 0-B.4 Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **76/76 test PASS** (10 suite
  — önceki 51/51'den; TASK-027.12/13'ün 51 testinin hiçbiri değişmedi/bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda ayrıca belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### 0-B.5 Kalan Riskler / Sonraki Bağımlılık

- 12 BOTC izni hâlâ eşlenmemiş (9'u Wave 2/3 nedeniyle bilinçli beklemede, 3'ü Wave 1/4 kapsamında
  ama henüz kod ataması bekliyor) — yeni PO kararı gerektirir, bu task hiçbirini kapatmadı.
- Onaylı 5 kod, gerçek `permission-catalogue.ts`'e henüz **eklenmedi** — gerçek apply
  implementasyonu bu adımı önce gerektirecektir (§0-B.1).
- Q-ID01, Q-P02, Q-T01/Q-SC01 hâlâ açık/kapsam dışı; bu task hiçbirine dokunmadı.
- Production kodu yalnızca yeni dosyalardan oluşuyor; TASK-027.12/13'ün mevcut dosyaları
  değiştirilmedi. Gerçek SQL Server/PostgreSQL bağlantısı veya apply yapılmadı. Git commit/push
  yapılmadı.

---

## 0-C. Tenant Mapping Coverage and Assignment Governance Boundary (TASK-027.15, 2026-09-18)

> **TASK-027.15-R1 güvenlik düzeltmesi (2026-09-18):** AI1, ilk teslimde kritik bir tutarsızlık
> tespit etti: `detectConflictingTenantAssignments()` bir çakışmayı `FATAL_CONFLICTING_TENANT_ASSIGNMENT`
> olarak raporlarken, aynı zamanda çakışan ilk kaydı `resolved` map'inde tutuyordu — bu da
> `MigrationRunService`'in (ve `computeTenantMappingCoverage`'ın) çakışan kullanıcıya **yine de**
> bir `tenantMemberships` satırı/`ASSIGNED` durumu yazmasına yol açıyordu. Yani bir çakışma hem
> FATAL olarak raporlanıyor hem de erişim üretiyordu — kabul kriteriyle ("conflict kayıtları
> erişim üretmeden raporlanmalı") doğrudan çelişen bir güvenlik açığıydı. Düzeltme:
> `duplicate-detection.ts`'teki `detectConflictingTenantAssignments()`, çakışan kullanıcıyı
> `resolved`'dan **tamamen çıkaracak** şekilde değiştirildi — deterministik "ilk kayıt" seçimi
> artık yalnızca hangi değerin fatal hata metninde anılacağını belirler, hiçbir zaman gerçek bir
> atama değeri olarak kullanılmaz. `MigrationRunService`/`computeTenantMappingCoverage`'ın
> **hiçbiri değiştirilmedi** — düzeltme tek bir paylaşılan fonksiyonda yapıldığı için her iki
> tüketici de otomatik olarak doğru (erişim-vermeyen) davranışa kavuştu. Aşağıdaki §0-C.2/§0-C.4
> metni düzeltilmiş davranışı yansıtacak şekilde güncellenmiştir; TASK-027.15'in orijinal
> teslimindeki yanlış açıklama burada **artık geçerli değildir**.

> TASK-027.15, `tenant-mapping.ts`/`tenant-mapping-adapter.ts`'i **değiştirmeden** tenant mapping
> sözleşmesinin güvenliğini doğruladı, `source-validation.ts`'e 3 yeni kural ekledi ve bir tenant
> coverage raporu (`tenant-coverage.ts`) üretti. Yeni bir tenant, tenant slug'ı veya root-aggregate
> yetkisi **icat edilmedi**; Q-T01/Q-S03 **kapatılmadı**.

### 0-C.1 Teslimat

`apps/api/src/migration/botc-identity/tenant-coverage.ts` (yeni): `buildTenantMappingReportEntry`
(sabit 7 alanlı rapor şekli: sourceLegacyUserId, tenantSlug, status, errorCode, description,
migrationRunId, retryable) + `computeTenantMappingCoverage` (toplam/mapping-tablosunda-olan/
ASSIGNED/UNRESOLVED/conflict/orphan-mapping/tenant-bazlı sayım + bilinen belirsiz lokasyon
kategorilerinin **statik** referansı — `Sirket`'e hiç bakmaz).

`source-validation.ts`'e 3 yeni kural eklendi (mevcut 8 kural değişmedi): boş tenant slug
(`FATAL_EMPTY_TENANT_SLUG`, `null`'dan — geçerli/henüz-çözülmemiş — ayrı), orphan tenant mapping
kaydı (`RECOVERABLE_ORPHAN_TENANT_MAPPING_ENTRY` — kaynakta olmayan kullanıcıya mapping), tam
duplicate mapping satırı (`WARNING_DUPLICATE_TENANT_MAPPING_ROW`).

### 0-C.2 Tenant Coverage Sonucu (örnek fixture, gerçek veri değil)

`tenant-coverage.spec.ts`/`tenant-governance.spec.ts`'te doğrulanan davranış: mapping tablosunda
geçerli bir tenant'a sahip kullanıcı `ASSIGNED`, tablo dışı/tenantSlug `null` olan kullanıcı
`UNRESOLVED`, çakışan (aynı kullanıcı için iki farklı slug) girdi **hiçbir değere çözülmez** —
kullanıcı `UNRESOLVED` sayılır, `tenantMembershipsByUserId`'e hiç yazılmaz, çakışma
`report.errorsAndWarnings`'a `FATAL_CONFLICTING_TENANT_ASSIGNMENT` olarak yansır (R1 düzeltmesi;
önceki teslimde yanlışlıkla "ilk kayda çözülür" deniyordu). `ASSIGNED`/`UNRESOLVED` dağılımı ve
tenant bazlı sayım, verilen kaynak/tablo çiftine göre `computeTenantMappingCoverage`'ın
çıktısıdır — bu doküman sabit bir sayı iddia etmez (gerçek kullanıcı sayısı bu ortamdan
bilinemez).

### 0-C.3 Sirket ve Root Tenant Teyidi

`tenant-governance.spec.ts`: (a) bir kullanıcının `Sirket`'i bilinen bir tenant adıyla (`MOSB
Enerji`) örtüşse bile, yalnızca onaylı mapping tablosunun verdiği karar (`MOSBIO`) kullanılır —
`Sirket` motorun hiçbir yerinde okunmaz; (b) statik dosya taraması, `apps/api/src/migration/botc-identity/`
altındaki hiçbir dosyanın `TenantScopeService`/`canAggregateChildren`/`tenant-scope`'a referans
vermediğini doğrular — root tenant aggregate yetkisi bu task'ta **genişletilmedi, dokunulmadı**;
(c) üretilen `tenantMemberships` satırı yalnızca `{ userId, tenantSlug }` alanlarını taşır, hiçbir
aggregate/root-scope bayrağı içermez.

### 0-C.4 Idempotency Kanıtı

`tenant-governance.spec.ts`: aynı onaylı tablo ile ikinci `APPLY` duplicate tenant membership
üretmez; çözülmemiş bir çakışma tekrar çalıştırmalarda da erişim üretmez (R1 düzeltmesi — hiçbir
çalıştırmada hiçbir değere çözülmez, `tenantMembershipsByUserId`'e hiç yazılmaz); bir kullanıcı
ilk çalıştırmada `UNRESOLVED` iken, onaylı tablo
**sonraki bir çalıştırmada** güncellenirse (harici bir PO/admin kararıyla) motor bunu **hiçbir
özel retry mekanizması gerekmeden** otomatik olarak `ASSIGNED`'e çözer (`resolveTenantAssignment`
her çalıştırmada tabloyu yeniden okur, önbelleklemez); kaynak kullanıcı kaydı değişse (checksum
farklılaşsa) bile tenant durumu deterministik yeniden değerlendirilir, ikinci bir membership satırı
oluşturulmaz.

### 0-C.5 Doğrulama (R1 düzeltmesiyle güncel)

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **109/109 test PASS** (12
  suite — R1 düzeltmesi öncesi 102/102'den; 4 mevcut test, düzeltilmiş güvenli davranışı
  doğrulayacak şekilde güncellendi (bkz. §0-C-R1), 7 yeni test eklendi).
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda ayrıca belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### 0-C.6 Kalan Riskler / Sonraki Bağımlılık

- Q-T01 ve Q-S03 **kapatılmadı** — `MOSBİO KIRIM DEPO`/`SANTRAL`/`KÖMÜR KAZANI`/GT-SG fiziksel
  kaynaklarının hangi tenant'a ait olduğu hâlâ karar bekliyor; bu kullanıcılar/kaynaklar kalıcı
  olarak `UNRESOLVED` kalabilir.
- Q-ID01 ve Q-P02 hâlâ açık/kapsam dışı; bu task hiçbirine dokunmadı.
- Root tenant/MİP aggregate erişimi (`canAggregateChildren`) bu task'ta **hiç ele alınmadı** —
  gerçek implementasyon aşamasında ayrıca tasarlanmalıdır (`TenantScopeService`'in var olan
  mekanizması referans alınacaktır, bu task onu bypass etmedi ama genişletmedi de).
- Production kodu yalnızca yeni/genişletilmiş dosyalardan oluşuyor; `migration-run.service.ts`,
  `tenant-mapping.ts`, `tenant-mapping-adapter.ts` değiştirilmedi. **İstisna (R1):**
  `duplicate-detection.ts`'teki `detectConflictingTenantAssignments()`'ın çakışma-çözümleme
  mantığı, §0-C-R1'de açıklanan güvenlik düzeltmesi için değiştirildi — bu, TASK-027.12'nin
  9 orijinal dosyasından biri olmakla birlikte, düzeltmenin gerekliliği R1 görev talimatında
  açıkça onaylanmıştır ("gereksiz yere değiştirme" kuralı istisnası). Gerçek SQL Server/PostgreSQL
  bağlantısı veya apply yapılmadı. Git commit/push yapılmadı.

---

## 0-D. Password Reset Import and Admin Assignment Boundary (TASK-027.16, 2026-09-18)

> TASK-027.16, Strateji 1'in (zorunlu parola sıfırlama, Q-A03/Q-PW01) motordaki uygulanışını
> doğruladı, `password-boundary.ts`'i (yeni) ekledi ve `migration-run.service.ts`'te bir
> implementation-seviyesi tutarsızlığı düzeltti (§0-D.2). Self-servis akış **eklenmedi**;
> `authSessions` **hiç yazılmadı**.

### 0-D.1 Teslimat

`apps/api/src/migration/botc-identity/password-boundary.ts` (yeni): `validatePasswordStrategyInvariant`
(RESET_REQUIRED her zaman zorunlu taban) + `scanForCredentialFields`/`assertNoCredentialFields`
(rapor/audit-metadata/staging-record gibi herhangi bir nesnede credential-benzeri alan adı arayan
genel amaçlı, salt-okunur bir tarayıcı — `passwordStrategy(ies)`/`passwordStrategySummary` durum
etiketleri bilinçli olarak istisna tutulur, gerçek credential değildir).

`password-boundary.spec.ts` (13 test) ve `password-governance.spec.ts` (18 test — `MigrationRunService`'i
kara kutu olarak ele alan): password strategy davranışı, admin assignment kalıcılığı/idempotency,
login/tenant-hazırlık güvenlik sözleşmesi, secret redaction (gerçek rapor/audit-metadata/staging
çıktıları üzerinde), auth session sınırı (statik dosya taraması), self-servis akış kapsam dışı
teyidi.

### 0-D.2 Bulunan ve Düzeltilen Tutarsızlık

`migration-run.service.ts`'te (`run()` metodu, USER işleme döngüsü) `passwordStrategies` dizisi,
bir kullanıcının **her** `COMPLETED` geçişinde (hem ilk oluşturma hem de checksum-değişikliği
güncellemesi) **sıfırdan** yeniden hesaplanıyordu, yalnızca o çalıştırmanın
`adminAssignedPasswordLegacyIds` kümesine bakarak. Bu, bir kullanıcı daha önce
`ADMIN_ASSIGNED` almışsa ve sonraki bir çalıştırmada (o kullanıcının kaydı güncellenirken) çağıran
taraf o kullanıcıyı `adminAssignedPasswordLegacyIds`'e **yeniden dahil etmezse**, `ADMIN_ASSIGNED`
bayrağının **sessizce kaybolmasına** yol açabiliyordu — "admin assignment durumu yanlışlıkla
silinmemeli" gereksinimini ihlal eden gerçek bir davranış (test edilip doğrulandı, varsayım değil).

**Düzeltme (minimal, tek nokta):** `passwordStrategies` hesaplanırken artık `targetClone.usersByLegacyId`'deki
**önceki** kayıt da kontrol edilir — `ADMIN_ASSIGNED` bir kez kaydedildikten sonra, sonraki bir
çalıştırmada yeniden belirtilmese bile **korunur**. Bu, motorun zaten `targetId` için kullandığı
"güncellemeler arasında koru" ilkesiyle birebir aynı desendir. `RESET_REQUIRED` davranışı
etkilenmedi (zaten her zaman ekleniyordu). Diğer hiçbir motor dosyası değiştirilmedi.

### 0-D.3 Secret Redaction Kanıtı

`password-governance.spec.ts`, gerçek `MigrationRunService.run()` çağrılarından üretilen tam
`DryRunReport`, `buildAuditMetadata(...)` çıktısı ve `stagingStore.all()` üzerinde
`scanForCredentialFields()`'i çalıştırır — admin assignment ve hatalar (simulated failure) dahil
edilmiş senaryolarda bile **sıfır** credential-benzeri alan bulunduğu doğrulanmıştır (varsayım
değil, programatik tarama).

### 0-D.4 Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **135/135 test PASS** (14
  suite — önceki 109/109'dan; TASK-027.12/13/14/15'in testlerinden hiçbiri bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda ayrıca belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### 0-D.5 Kalan Riskler / Sonraki Bağımlılık

- Self-servis e-posta reset akışı, email verification, SMS/dış bildirim provider'ı bu task'ta
  **bilerek eklenmedi** — bunlar ayrı, gelecekteki implementation task'larıdır.
- `authSessions`'a hâlâ hiçbir satır yazılmıyor — gerçek login/oturum akışı bu motorun kapsamı
  dışındadır ve öyle kalmaya devam eder.
- Q-ID01, Q-P02, Q-T01, Q-SC01 hâlâ açık/kapsam dışı; bu task hiçbirine dokunmadı.
- Gerçek admin-driven parola atama akışının (Metnex'in var olan `setPassword` fonksiyonu)
  migration motoruyla nasıl entegre edileceği hâlâ ayrı bir implementation kararı gerektirir —
  bu task yalnızca motorun **durum etiketini** (`ADMIN_ASSIGNED`) doğru taşıdığını garanti eder,
  gerçek parola atama akışının kendisini üretmez.
- Production kodu yalnızca yeni dosyalardan oluşuyor, tek istisna `migration-run.service.ts`'teki
  minimal düzeltme (§0-D.2). Gerçek SQL Server/PostgreSQL bağlantısı veya apply yapılmadı. Git
  commit/push yapılmadı.

---

## 0-F. Identity Migration CLI Dry-Run (TASK-027.18, 2026-09-18)

Motoru (TASK-027.12–027.17, hiçbiri değiştirilmeden) sentetik/in-memory fixture'larla çalıştıran
gerçek, çalıştırılabilir bir dry-run CLI'ı eklendi (`apps/api/src/migration/botc-identity/cli/`,
`node dist/migration/botc-identity/cli/dry-run-cli-entry.js`). **`--apply` seçeneği yoktur** —
gerçek bir PostgreSQL/SQL Server apply'ı yapısal olarak imkânsızdır. Tam kullanım, giriş/çıkış
sözleşmesi, 8-aşamalı çalışma sırası, exit code matrisi (0/1/2), sentetik fixture senaryoları ve
determinism kanıtı için ayrı bir belge oluşturuldu:
`docs/migration/METNEX_IDENTITY_MIGRATION_CLI_DRY_RUN.md`. CLI gerçekten derlenip (`pnpm build`)
gerçek bir `node` process'i olarak çalıştırılarak 3 exit code da (0/1/2) fiilen doğrulandı — bu bir
varsayım değil, bu ortamda kanıtlanmış bir sonuçtur.

---

## 0-G. Identity Migration Execution Reconciliation (TASK-027.19, 2026-09-18)

İki dry-run çıktısını (`ReconciliationInputSnapshot`) karşılaştırıp `MATCHED`/`CHANGED`/`BLOCKED`/
`UNRESOLVED`/`INVALID_INPUT` olarak sınıflandıran, saf ve test edilebilir bir reconciliation
çekirdeği eklendi (`apps/api/src/migration/botc-identity/reconciliation.ts`) — motorun/CLI'ın
mevcut hiçbir dosyası değiştirilmedi. Bir conflict/fatal issue varsa **hiçbir per-user diff
denenmez** (yanıltıcı "tüm kullanıcılar silindi" raporunu önlemek için) — conflict kullanıcıları
hiçbir zaman `MATCHED` görünmez. Session/credential-benzeri bir alan bulunursa sonuç zorla
`BLOCKED` olur, gerçek değer hiçbir zaman rapora yazılmaz. Ayrı bir CLI (`reconcile-cli-entry.ts`,
`--apply` yok) eklendi ve gerçekten derlenip çalıştırılarak doğrulandı. Tam detay:
`docs/migration/METNEX_IDENTITY_MIGRATION_RECONCILIATION.md`.

---

## 0-H. Identity Security and Tenant Isolation Tests (TASK-027.20, 2026-09-18)

Motorun/CLI'ın/reconciliation'ın (TASK-027.12–027.19) mevcut hiçbir dosyası değiştirilmeden, 9
kategoriyi (tenant izolasyonu, conflict güvenliği, permission izolasyonu, root tenant/aggregate,
parola güvenliği, session/email güvenliği, dry-run güvenliği, reconciliation güvenliği, statik
dependency sınırı) tek bir dosyada konsolide eden 33 yeni test eklendi
(`security-tenant-isolation.spec.ts`). **Kritik bulgu:** `cli/` alt dizini önceki hiçbir statik
taramada (özyinelemesiz `readdirSync`) hiç kapsanmamıştı — yeni özyinelemeli bir tarayıcı bu
boşluğu kapattı ve `cli/`'nin gerçekten tarandığını kanıtlayan bir sanity-check testiyle
doğruladı; sonuç temiz. Tam matris ve kanıtlar: `docs/migration/METNEX_IDENTITY_SECURITY_TEST_MATRIX.md`.

---

# Metnex User Migration Implementation — Orijinal Blocker Raporu (2026-09-17, tarihi kayıt)

> **Bu bölümden itibaren orijinal blocker raporu değiştirilmeden korunmuştur** — o tarihte 6
> karar kapısının tamamı açıktı, bu nedenle hiçbir implementation üretilmemişti. TASK-027.12-R1
> ile bu kapılar kapandıktan sonra §0'daki implementation üretilmiştir.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kontrol Yöntemi

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` **baştan sona** taranarak Q-P01, Q-M03, Q-M04,
Q-M06, Q-A03, Q-PW01'in her birinin **güncel durumu** doğrulandı — her sorunun kendi "Önerilen
karar" alanı ve olası bir "kapandı/onaylandı/çözüldü" işareti aranarak (`grep`) kontrol edildi.
**Hiçbir sorunun çözüldüğüne dair bir işaret bulunamadı.** Ayrıca bu 6 sorunun daha önceki AI1
onaylarında (TASK-027.7, TASK-027.8, TASK-027.11-R1) **yalnızca dokümantasyonun kalitesinin
onaylandığı, sorunun kendisinin kapatılmadığı** önceki PROGRESS_LOG.md kayıtlarından teyit edildi
(örn. TASK-027.7 onayı: *"Q-P01 seçenekleri karar verilmeden karşılaştırıldı"*).

---

## 1. Karar Kapıları — Güncel Durum (kabul kriteri #1)

| Kapı | Soru (özet) | Durum | Kaynak |
|---|---|---|---|
| **Q-P01** | BOTC `Role`/`Permission` → `tenantRoles` mı, `systemRoles` mı, karışık mı? | **Açık** — 3 seçenek karşılaştırıldı (`BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §2), hiçbiri seçilmedi | `BOTC_MIGRATION_OPEN_QUESTIONS.md` (Q-P serisi) |
| **Q-M03** | BOTC `Can*` izinleri → Metnex `MODULE:RESOURCE:ACTION` kesin isim eşlemesi | **Açık** — yalnızca taslak öneri var (`BOTC_TO_METNEX_MAPPING.md` §2.2), PO onayı bekleniyor | Aynı belge (Q-M serisi) |
| **Q-M04** | Rol-şablonu mu, birebir kullanıcı-permission ataması mı? | **Açık** — 2 seçenek karşılaştırıldı, hiçbiri seçilmedi | Aynı belge |
| **Q-M06** | 5 BOTC lokasyonu/`Sirket` → tenant ataması nasıl çözülecek? | **Açık** — yalnızca `MOSBİO`/`MOSB ENERJİ` için makul güven var, geri kalanı belirsiz | Aynı belge |
| **Q-A03** | Zorunlu parola sıfırlama akışı onaylı mı? | **Açık** — 3 strateji karşılaştırıldı (`BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §4), hiçbiri seçilmedi | Aynı belge |
| **Q-PW01** | Geçici parola/reset bilgisi hangi kanaldan iletilecek? | **Açık** — Metnex'te self-servis e-posta akışı yok, kanal kararı bekleniyor | Aynı belge (Q-PW serisi) |

**Sonuç: 6 kapının 6'sı da açık.** Görev talimatının başlatma koşulu **karşılanmamıştır** —
bu nedenle bu task, **hiçbir implementation üretmeden**, yalnızca bu blocker raporunu ve aşağıdaki
"hazır-ama-uygulanmamış" tasarım taslağını (§2) teslim eder.

---

## 2. Ne Hazır, Ne Değil

### 2.1 Zaten Hazır Olan (önceki task'larda tasarlanmış, implementation'ı bekleyen)

| Konu | Kaynak | Durum |
|---|---|---|
| Alan-alan `User` eşlemesi (taşınacak/yeniden-hash'lenecek/taşınmayacak/karar-bekleyen) | `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2 | Tasarım tamam, **Q-M06/Q-A03'e bağlı alanlar** (§2.4'teki `Sirket`, §2.2'deki `PasswordHash`) hâlâ karar bekliyor |
| Staging şema tasarımı (`migration_staging_identity`, üç-katmanlı tamamlanma modeli) | `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md` (R1 ile düzeltilmiş) | Tasarım tamam, **implementation edilmedi** (görev talimatı zaten TASK-027.11'de bunu yasaklamıştı) |
| Dry-run/idempotency/rollback standardı (8 aşama, dry-run alanları, hata kategorileri) | `METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md` | Tasarım tamam, entity-spesifik (User) somutlaştırması **bu task'ın** işiydi ama kapı açık olduğu için **yapılamadı** |
| Parola stratejisi seçenekleri (3 strateji) | `BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §4 | Seçenekler hazır, **hiçbiri seçilmedi** (Q-A03) |

### 2.2 Bu Task Kapsamında Yapılamayanlar (görev talimatının kapsam maddeleri, kapı açık olduğu için bloklu)

| Görev talimatı maddesi | Neden yapılamadı |
|---|---|
| "Username/Email kararını uygulanmış PO kararı doğrultusunda kullan" | Bu alanda **hiçbir PO kararı yok** (`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.1'de hâlâ "karar bekliyor") |
| "Tenant üyeliğini yalnızca onaylanmış tenant mapping'e göre oluştur" | Q-M06 açık — onaylanmış bir tenant mapping **yok** |
| "Role/permission atamalarını yalnızca Q-P01/Q-M03/Q-M04 kararları kesinleşmişse uygula" | Üçü de açık |
| "Password migration yalnızca Q-A03/Q-PW01 ile onaylanan stratejiye göre yapılmalıdır" | İkisi de açık |
| "Legacy ID → Metnex ID mapping'i TASK-027.11 staging standardına göre idempotent tasarla" | Tasarım zaten TASK-027.11'de yapıldı (§2.1); **gerçek implementation** (Drizzle şeması/kod) hiçbir kapı çözülmeden başlatılamaz |
| "Dry-run, approval gate, apply, verification ve reconciliation akışlarını TASK-027.10 standardına göre kullan" | Akışın **kendisi** implementation gerektirir — kapı açıkken üretilmez |

**Kabul kriteri #9 ile tutarlı:** "Production kodu yalnızca açıkça onaylanan kapsamda
değiştirilebilir" — kapı açıkken **hiçbir kapsam onaylanmamış** olduğu için **hiçbir production
kodu değiştirilmemiştir.**

---

## 3. Bu Task'ın Gerçek Teslimatı — Karar Kapılarının Kapatılması İçin Kontrol Listesi

Görev talimatı bir blocker raporu istediği için, bu belgenin somut teslimatı **implementation
değil, PO'nun her kapıyı kapatmak için ihtiyaç duyduğu bilginin nerede olduğunun net bir
haritasıdır**:

| Kapı | Kapatmak için PO'nun bakması gereken belge/bölüm |
|---|---|
| Q-P01 | `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §2 (3 seçenek, karşılaştırma tablosu) |
| Q-M03 | `BOTC_TO_METNEX_MAPPING.md` §2.2 (taslak permission adı eşlemesi) |
| Q-M04 | `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §4 (2 seçenek) |
| Q-M06 | `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §3 (lokasyon-tenant seçenek tablosu) |
| Q-A03 | `BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §4 (3 strateji) |
| Q-PW01 | Aynı belge §6 (kanal seçenekleri) |

Bu 6 kapının **her biri PO onayı gerektirir** (özet tablo, `BOTC_MIGRATION_OPEN_QUESTIONS.md`
sonunda) — hiçbiri "teknik doğrulama" kategorisinde değildir, bu nedenle AI2 tek başına
kapatamaz.

---

## 4. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu blocker raporu Ticket/MaintenanceRecord/FaultRecord (Wave 2) veya DÖF (Wave 3) için hiçbir
mapping/implementation önerisi içermez (D-007 ile tutarlı) — zaten görev kapsamı bunları
içermiyordu.

---

## 5. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır. **Kod değişikliği yok** —
bu belge yalnızca bir blocker raporu olduğu için `check.sh`'ın PASS vermesi beklenir (regresyon
riski sıfırdır, hiçbir dosya production kodunda değişmedi).

## 6. Kalan Riskler / Sonraki Bağımlılık

- **Bu task hiçbir implementation üretmemiştir** — 6 karar kapısının **tamamı** PO tarafından
  kapatılmadan TASK-027.12 yeniden ele alınamaz.
- PO bu 6 karardan **bazılarını** kapatıp bazılarını açık bırakırsa (örn. yalnızca Q-P01+Q-M06
  kapansa), bu task'ın **kısmi implementation'a** başlayıp başlayamayacağı ayrı bir karardır —
  bu belge şu an **hepsi kapalı** senaryosunu ele almıştır, kısmi senaryo için AI1'in yeni bir
  talimat vermesi gerekir.
- Gerçek secret/parola/hash/salt/token/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Canlı SQL Server'a
  bağlanılmadı. Hiçbir migration/apply/rollback çalıştırılmadı. Git commit/push yapılmadı.
