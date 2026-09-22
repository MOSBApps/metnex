# BOTC User/Role/Permission — Metnex Migration Karar Matrisi

> **Durum: Discovery/karar-matrisi dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-7-user-role-permission-migration-mapping.md` (EPIC-004, Wave 0,
> bağımlılık: TASK-027.6 — done). Bu belge `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`'yi
> **tamamlar, tekrar etmez** — o belge alan-alan hedef eşlemesini yaptı, bu belge **Q-P01/Q-M03/
> Q-M04/Q-M06 için karar seçeneklerini karşılaştırır**. **Hiçbir seçenek burada implementation
> kararı olarak uygulanmamıştır** — bu, görev talimatının açık kuralıdır: "Q-P01, Q-M03, Q-M04 ve
> Q-M06 henüz çözülmediyse hiçbir seçeneği kesin implementation kararı olarak uygulama."
>
> **TASK-027.12-R1 karar kapanışı (2026-09-17):** AI1/Product Owner, aşağıdaki karar matrisinde
> sunulan seçeneklerden **Q-P01 için Seçenek A** (tüm BOTC rolleri `tenantRoles`'a taşınır,
> `systemRoles` yalnızca platform yönetimi/Metnex'e özgü platform rolleri için kullanılır) ve
> **Q-M04 için Seçenek 2** (ortak permission-set'lerinden tenant-kapsamlı rol şablonu üretimi,
> kullanıcı-başına-özel-rol **kullanılmayacak**) kararlarını vermiştir. Tam karar kaydı, gerekçe,
> etkilenen task'lar, kalan riskler ve rollback ihtiyacı için `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`
> "Karar Kapanışları — Wave 1 Identity (TASK-027.12-R1)" bölümüne bakınız — bu belge o kararların
> **sonucunu** aşağıdaki ilgili bölümlerde işaretler, kapanış metnini burada tekrar üretmez.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

`BOTC_SOURCE_SCHEMA_INVENTORY.md`, `BOTC_ENTITY_DOMAIN_MAPPING.md` ve
`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`'deki bulgular kaynak olarak kullanıldı (yeniden
üretilmedi). Bu task için **ek olarak**, Metnex'in gerçek yetkilendirme çalışma zamanı kodu
satır satır okundu: `apps/api/src/platform/permission.guard.ts` (permission çözümleme mantığı —
`PLATFORM:` prefiksli izinler, `TENANT_ADMIN` kısayolu, `tenantRolePermissions` çözümlemesi) ve
`apps/api/src/platform/tenant-membership.guard.ts` (tenant üyeliği kontrolü). Bu okuma, Q-P01'in
3 seçeneğinin **gerçekten çalışıp çalışmayacağını** kod kanıtıyla değerlendirmeyi sağladı (bkz.
§2.3 — kritik bulgu).

**Gerçek parola, hash, salt, secret veya connection string bu belgeye yazılmamıştır.** Canlı
PostgreSQL/SQL Server'a hiçbir değişiklik yapılmamış, hiçbir üretim migration'ı veya seed verisi
üretilmemiştir.

---

## 1. Kapsam ve Sınırlar

Bu belge **yalnızca** aşağıdaki 4 açık sorunun karar seçeneklerini karşılaştırır; hiçbirini
**kapatmaz**:

| Soru | Konu |
|---|---|
| **Q-P01** | BOTC `Role`/`Permission` → Metnex `tenantRoles` mı, `systemRoles` mı, karışık mı? |
| **Q-M03** | BOTC `Can*` izin adları → Metnex `MODULE:RESOURCE:ACTION` permission catalogue kesin eşlemesi |
| **Q-M04** | `UserPermission` → rol-şablonu mu, kullanıcı-başına-özel-rol mü? |
| **Q-M06** | Tenant ataması (dolaylı olarak — Q-P01/Q-M04'ün her seçeneği tenant-scope'a farklı bağımlı) |

Wave 2 (Ticket/MaintenanceRecord/FaultRecord) ve Wave 3 (DÖF) bu belgede **hiç ele alınmamıştır**
(D-007 ile tutarlı).

---

## 2. Q-P01 — Rol Modeli Karar Matrisi

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17): Seçenek A onaylandı.** BOTC rolleri (`Admin`
> dahil) `tenantRoles`'a taşınacak; `systemRoles` yalnızca platform yönetimi ve Metnex'e özgü
> platform rolleri için kullanılacak. **Seçenek C seçilmediği için Q-P04 ("Admin rolü `TENANT_ADMIN`
> kısayolu mu, satır satır izin mi") artık geçersizdir (moot)** — bu koşul yalnızca Seçenek C
> seçilseydi devreye girerdi. Aşağıdaki karşılaştırma tablosu **kanıt/gerekçe kaydı olarak**
> korunmuştur, karar zaten verilmiştir.

### 2.1 Üç Seçenek

| Seçenek | Tanım |
|---|---|
| **A ✅ (seçildi)** | BOTC'nin tüm rolleri (`Admin` dahil) Metnex `tenantRoles`'a migrate edilir — her işletme tenant'ında (MOSB/MOSEDAŞ/MOSBİO) **ayrı kopyalanmış** rol satırları oluşur |
| **B** | BOTC'nin tüm rolleri Metnex `systemRoles`'a migrate edilir — platform-genel, tenant'tan bağımsız roller |
| **C** | BOTC `Admin` rolü → Metnex `systemRoles` (muhtemelen `TENANT_ADMIN` veya yeni bir sistem rolü), diğer roller → `tenantRoles` |

### 2.2 Karşılaştırma Tablosu

| Kriter | Seçenek A (hepsi tenantRoles) | Seçenek B (hepsi systemRoles) | Seçenek C (karışık) |
|---|---|---|---|
| **Tenant izolasyonu** | Güçlü — her rol `tenantId` FK ile bir tenant'a bağlı (`tenantRoles.tenantId`, composite FK `userTenantRoleAssignments.roleId+tenantId`), farklı tenant'lar farklı rol tanımları taşıyabilir | Zayıf/yanlış model — `systemRoles`'un tenant kavramı yok, `userSystemRoleAssignments.tenantId` **opsiyoneldir** (tek bir global tanım, tenant'a göre farklılaşamaz) — Discovery §2.3'ün "her işletme kendi kapsamı" ilkesiyle **gerilir** | Karma — `Admin` platform-genel davranır (ki BOTC'de zaten öyleydi, `AuthService.LoginAsync:93-100`), diğer roller tenant-izole kalır |
| **Root tenant aggregation** | `TenantScopeService.resolve()`'un `canAggregateChildren` mekanizmasıyla **doğal uyum** — MİP root kullanıcısı, kendi `ROOT` tenant'ındaki role/izinlerle çalışır, data-scope ayrı olarak `canAggregateChildren` ile genişler (`BOTC_MIP_TENANT_LOCATION_MAPPING.md` §4) | `PermissionGuard`'da `PLATFORM:` prefiksli izinler **tüm tenant'lar için aynı anda** geçerli olur — MİP root'a özgü bir "aggregate görünüm" değil, **her yerde geçerli global yetki** anlamına gelir; bu, D-006'nın "permission + canAggregateChildren + data scope birlikte" ilkesinden **farklı bir modeldir** | `Admin`/root-benzeri roller için B'nin, diğerleri için A'nın etkisi geçerli |
| **Permission guard uyumu (kritik kod kanıtı, §2.3)** | **Tam uyumlu** — `PermissionGuard`, `PLATFORM:` prefiksli olmayan her izin kodunu **yalnızca** `userTenantRoleAssignments`→`tenantRoles`→`tenantRolePermissions` üzerinden çözüyor (`permission.guard.ts:69-81`) | **Uyumsuz** — `PermissionGuard`, tenant-scoped (`PLATFORM:` prefiksli olmayan) bir izin kodunu `systemRoles`/`rolePermissions` üzerinden **hiç çözmüyor**; tek istisna `TENANT_ADMIN` adlı sistem rolünün **hardcoded kısayolu** (`permission.guard.ts:56-67`) — bu yalnızca "tüm izinlere otomatik erişim" içindir, BOTC'nin ayrıştırılmış (`CanViewDynamicDashboard`, `CanManageShifts` vb.) izinlerini **taşıyamaz** | `Admin`→`TENANT_ADMIN`-benzeri kısayol (uyumlu, ama yalnızca "hepsine izin ver" anlamında, ayrıştırılmış izin listesi taşımaz), diğer roller→`tenantRolePermissions` (uyumlu) |
| **Audit** | `apps/api/src/audit` modülü tenant-scope ile doğal çalışır (tenant bazlı audit sorgusu) | Global rol değişiklikleri audit edilebilir ama "hangi tenant etkilendi" sorusu doğrudan cevaplanamaz | Karma, `Admin` için global audit, diğerleri için tenant-scope audit |
| **Operasyonel efor (5 rol × 3 tenant senaryosu)** | Her tenant için rol **kopyalanmalı** (`tenantRoles.tenantId` her satırda ayrı) — MOSB/MOSEDAŞ/MOSBİO'nun her biri için ayrı `Operatör` rolü tanımı gerekir, senkronizasyon yükü | Rol tanımı **tek**, tenant'a göre çoğaltma gerekmez, ama izin çözümlemesi §2.3'teki uyumsuzluk nedeniyle **çalışmaz** | Yalnızca `Admin` tekil, diğerleri her tenant için kopyalanmalı — A'nın operasyonel yükünün büyük kısmı devam eder |

### 2.3 Kritik Kod Kanıtı — `PermissionGuard`'ın Gerçek Çözümleme Mantığı

`apps/api/src/platform/permission.guard.ts:30-86` incelendiğinde, bir izin kontrolünün
**yalnızca 3 yoldan biriyle** çözüldüğü görülüyor:

1. `user.isSystemAdmin === true` → her şeye izin (global superuser bayrağı, rol tablosuyla
   ilgisiz).
2. İzin kodu `PLATFORM:` ile başlıyorsa → `userSystemRoleAssignments` (yalnızca `tenantId IS NULL`
   satırları) + `rolePermissions` + `permissions` üzerinden çözülür.
3. Diğer tüm izin kodları (tenant-scoped) → önce `userSystemRoleAssignments`'ta `TENANT_ADMIN`
   adlı bir sistem rolü var mı diye **özel olarak** kontrol edilir (varsa otomatik izin); yoksa
   `userTenantRoleAssignments`→`tenantRoles`→`tenantRolePermissions` üzerinden çözülür.

**Sonuç:** BOTC'nin ayrıştırılmış (`Can*`) izinlerinin **hiçbiri**, bugünkü `PermissionGuard`
koduyla `systemRoles`/`rolePermissions` üzerinden **çözülemez** — bu yol yalnızca `PLATFORM:`
prefiksli (platform yönetimi) izinler ve `TENANT_ADMIN` adlı özel bir rolün "hepsine izin ver"
kısayolu için var. Bu, **Seçenek B'yi bugünkü guard koduyla teknik olarak çalışmaz** kılıyor
(guard kodu değiştirilmeden); **Seçenek A ve C'nin tenant-scope kısmı** ise mevcut kodla
**doğrudan uyumludur**. Bu bir **kanıt**, bir **karar** değildir — guard kodu da Wave 1
implementation'ının bir parçası olarak değiştirilebilir; bu belge yalnızca **bugünkü haliyle**
hangi seçeneğin ek kod değişikliği gerektirmeyeceğini göstermektedir.

### 2.4 Yeni Açık Soru — `Admin` İçin `TENANT_ADMIN` Kısayolu Kullanılmalı mı?

Seçenek C'de `Admin`'in `TENANT_ADMIN` kısayoluna eşlenmesi, BOTC'nin "Admin tüm izinlere sahip"
davranışını (`AuthService.LoginAsync:93-100`) doğru yansıtır, ama bu kısayol **ayrıştırılmış izin
listesi taşımaz** — yalnızca "bu tenant'ta her şeye izin ver" anlamına gelir. BOTC'de `Admin`
olmayan roller de zaman içinde yeni izinler kazanabilir/kaybedebilir; `TENANT_ADMIN` kısayolu bu
inceliği kaybeder. Bu **yeni açık soru Q-P04**'e bağlanmıştır (bkz. §7).

---

## 3. Q-M03 — Permission İsim Dönüşümü — Karar Kapandı

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — bu bölümde eksik işaretlenmişti, TASK-027.14
> tutarlılık düzeltmesi, 2026-09-18):** Mevcut `MODULE:RESOURCE:ACTION` taslak eşlemesi
> **kesindir**. Bu bölümün "karar bekleyen" ibaresi, TASK-027.12-R1'in Q-M03'ü kapattığı tarihte
> (bkz. bu dosyanın en üstündeki karar kapanışı notu ve
> `BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki "Karar Kapanışları — Wave 1 Identity" bölümü)
> güncellenmemiş, unutulmuş bir kalıntıdır — Q-M03'ün kendisi **daha önce kapanmıştı**, burada
> yeniden bir karar verilmemiştir, yalnızca bu bölümün metni gerçek durumla **uyumlu hâle
> getirilmiştir**. Onaylı 5 kod (`apps/api/src/migration/botc-identity/permission-mapping.ts`):
> `CanManageShifts`→`SHIFT:REPORT:UPDATE`, `CanViewShiftReports`→`SHIFT:REPORT:VIEW`,
> `CanViewDynamicDashboard`→`SCADA:DASHBOARD:VIEW`, `CanViewHourlyReport`→`REPORT:HOURLY_CONSUMPTION:VIEW`,
> `CanViewPlantReports`→`REPORT:PLANT:VIEW`. Kalan 12 BOTC izni (Wave 2/3 nedeniyle bilinçli
> beklemede olanlar dahil) **hâlâ eşlenmemiştir** — TASK-027.14'ün mapping coverage raporuna
> bakınız (`METNEX_USER_MIGRATION_IMPLEMENTATION.md` §0-B).

`BOTC_TO_METNEX_MAPPING.md` §2.2'deki taslak eşleme (16 `Can*` izni → `MODULE:RESOURCE:ACTION`
önerileri) bu belgede **tekrar üretilmemiştir** (kanıt kaydı olarak korunmuştur). Q-P01'in
seçilen sonucundan **bağımsız olarak**, hedef `permissions.code` sütunu serbest `TEXT` olduğu için
(`apps/api/src/db/schema/platform.ts:190-194`) herhangi bir isimlendirme kararı **yapısal bir
engelle karşılaşmamıştı** — bu artık teyit edilmiş bir sonuçtur.

---

## 4. Q-M04 — `UserPermission` Dönüşüm Seçenekleri

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17): Seçenek 2 onaylandı.** Kullanıcı başına özel rol
> **oluşturulmayacak**; ortak permission set'lerinden tenant-kapsamlı rol şablonları oluşturulacak.
> Bu karar, Q-M04'ün kapanmasıyla artık ele alınabilir hâle gelen **Q-P03**'ün (dönüşüm
> mekanizmasının hangi implementation task'ında ele alınacağı) planlanmasına da zemin hazırlar —
> Q-P03'ün kendisi bu R1'de kapatılmamıştır, yalnızca önkoşulu (Q-M04) çözülmüştür. Aşağıdaki
> karşılaştırma tablosu **kanıt/gerekçe kaydı olarak** korunmuştur, karar zaten verilmiştir.

### 4.1 Seçenek Karşılaştırması

| Kriter | Seçenek 1: Kullanıcı-başına-özel-rol | Seçenek 2: Ortak permission-set'lerinden rol şablonu ✅ (seçildi) |
|---|---|---|
| **Tanım** | Her BOTC kullanıcısının benzersiz `UserPermission` kombinasyonu için Metnex'te **kendine özel** bir `tenantRoles`/`systemRoles` satırı oluşturulur (1 kullanıcı = 1 rol) | BOTC'deki `UserPermission` kombinasyonları **gruplanır/kümelenir**; ortak kombinasyonlar tek bir paylaşılan role indirgenir (`Operatör`, `Admin`, vb.), kullanıcılar bu şablonlara atanır |
| **Veri kaybı riski** | Yok — birebir koruma | Var — iki kullanıcının **neredeyse aynı ama tam aynı olmayan** izin setleri tek bir şablona zorlanırsa (en geniş ortak küme veya en dar ortak küme seçimi) kayıp/fazlalık oluşabilir; bu **kabul edilebilir mi** PO kararı |
| **Operasyonel sürdürülebilirlik** | Düşük — BOTC'de zaten "rol-bazlı varsayılan şablon yok" (Discovery §7.5 T-001) sorunu **aynen taşınır**, her kullanıcı için ayrı rol yönetimi Metnex'in rol-bazlı modelinin **amacını** (izin yönetimini merkezi tutmak) zayıflatır | Yüksek — Metnex'in rol-bazlı yetkilendirme modeliyle **tutarlı**, gelecekteki izin değişiklikleri rol üzerinden merkezi yapılabilir |
| **Migration karmaşıklığı** | Düşük — doğrudan kopyalama, gruplama algoritması gerekmez | Yüksek — kombinasyonların analiz edilip gruplanması, "hangi ortak küme neye karşılık gelir" kararının verilmesi gerekir |
| **Kaynak kanıtı** | `UserService.SetUserPermissionsAsync` (`BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2) — BOTC bugün fiilen bu modeli (kullanıcı-bazlı elle atama) kullanıyor, Seçenek 1 bu davranışı **birebir yansıtır** | `BOTC_TO_METNEX_MAPPING.md` §2.2'deki önerilen permission-Wave eşlemesi (`CanManageShifts`→`SHIFT:REPORT:UPDATE` vb.) — bu tarz sabit, tekrar eden izin grupları BOTC'nin küçük kullanıcı tabanında (Discovery'den bilinen ölçek — `[DOĞRULANAMADI]`, canlı kullanıcı sayısı bu ortamdan görülemez) **muhtemelen** doğal kümeler oluşturuyor olabilir, ama bu **doğrulanmamış bir varsayımdır** |

**Bu belge her iki seçeneği de eşit ağırlıkta sunar, hiçbirini önermez** — görev talimatı gereği
Q-M04 **kesinleştirilmemiştir**.

---

## 5. Q-P03 — Dönüşüm Mekanizması Sorumluluğu (öneri, karar değil)

Görev talimatı: "dönüşüm mekanizmasının sorumluluğunu ve hangi ileriki implementation task'ında
ele alınacağını **öneri olarak** belirt; PO kararı olmadan uygulama yapma." Buna uygun olarak:

| Adım | Önerilen sorumluluk | Gerekçe |
|---|---|---|
| Q-P01/Q-M03/Q-M04 kararlarının verilmesi | Product Owner (mevcut açık soru süreci) | Bu 3 soru zaten PO onayı gerektiriyor olarak işaretli |
| Legacy ID eşleme tablosu şeması | Bir sonraki Wave 1 implementation task'ı (henüz numaralandırılmamış, `TASK-027-11`+ aralığında olması beklenir) | `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §5'te yalnızca ihtiyaç belgelendi, şema üretilmedi |
| `UserPermission`→rol dönüşüm script'i | Aynı implementation task'ı, kararlar netleştikten **sonra** | Karar öncesi script yazımı, kararın script'i şekillendirmesi gerektiği için **verimsiz** olur |

Bu bir **atama değil, önerilen sıralamadır** — hangi task numarasının bu işi üstleneceği AI1'in
backlog planlama yetkisindedir.

---

## 6. Tenant Ataması/Üyeliği — Üretilmedi (Q-M06/TASK-027.4'e Bağlı)

Görev talimatı gereği: bu belge **hiçbir `tenantMemberships` satırı önermemiş veya tenant ataması
kesinleştirmemiştir**. `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §2/§6'daki bulgu (`Sirket` güvenilir
kaynak değil) burada **aynen geçerlidir**. `apps/api/src/platform/tenant-membership.guard.ts`
incelemesi yalnızca şunu doğrulamıştır: Metnex'in çalışma zamanı, bir kullanıcının `tenantMemberships`
satırı olmayan bir tenant için işlem yapmasını **guard seviyesinde reddeder** — yani Wave 1
migration'ı, tenant ataması netleşmeden **çalışabilir bir sistem üretemez** (kullanıcılar hiçbir
tenant'a erişemez), bu risk §8'de tekrar not edilmiştir.

---

## 7. Korunan Belirsizlikler (değiştirilmedi)

- **Username/Email ayrımı** (`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.1) — bu belgede
  **yeniden çözülmemiştir**.
- **`IsEmailVerified`** hedefi — aynı şekilde korunmuştur.
- **`PasswordHash`** — yalnızca §8'de stratejik seçenekler tekrar özetlenmiştir, gerçek
  hash/parola okunmamış/kopyalanmamıştır.

---

## 8. Password/Session Güvenliği — Strateji Seçenekleri (yeniden üretim/reset)

`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.2/§9'daki bulgu (BOTC hash formatı — düz-metin
fallback + global salt — Metnex'in `scrypt` + per-user-salt formatına **birebir çevrilemez**)
burada **değiştirilmeden** korunmuştur. İki strateji seçeneği (implementation kararı değil, yalnızca
olası yönler):

| Strateji | Açıklama | Bağımlılık |
|---|---|---|
| Zorunlu parola sıfırlama | Migrate edilen her kullanıcı ilk girişte yeni parola belirlemeye zorlanır, eski `PasswordHash` hiç taşınmaz | **Q-A03**'e bağlı (zaten açık, PO onayı gerekli) |
| Geçici/opportunistic yükseltme | BOTC'nin kendi "düz-metin ile giriş yapınca hash'le" desenine benzer bir geçiş dönemi mekanizması | Bu strateji, BOTC'nin **taşınmaz** olarak işaretlenen düz-metin davranışına **çok yakın** olduğu için mimari karar dokümanı §6'daki ilkeyle **gerilir**; bu belge bu seçeneği **önermez**, yalnızca var olan bir alternatif olarak not eder |

Session tarafında: BOTC'nin bellek-içi `SessionService`'i Metnex'in `authSessions` (refresh-token
hash tabanlı) modeline **taşınmaz** (Q-E01 ile aynı konu, `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`
§8) — migration bu tabloya **hiçbir satır eklemez**, oturumlar yalnızca gerçek login zamanında
oluşur.

---

## 9. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu belge Ticket/MaintenanceRecord/FaultRecord (Wave 2) ve DÖF (Wave 3) için **hiçbir karar
seçeneği veya mapping üretmemiştir** (D-007 ile tutarlı) — yalnızca `User`/`Role`/`Permission`/
`UserPermission`'ın Wave 1'e özgü kısmı ele alınmıştır.

---

## 10. Yeni Açık Soru

Mevcut **Q-P01/Q-M03/Q-M04/Q-M06/Q-P03** bu task'ta **kapatılmamış**, aksine somut karar
seçenekleriyle (§2, §3, §4, §5) **detaylandırılmıştır**. Bunun ötesinde
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye **1 yeni soru** append edildi:

- **Q-P04** — `Admin` rolü Metnex'e migrate edilirken `TENANT_ADMIN` adlı hardcoded guard
  kısayolu mu kullanılacak (yalnızca "hepsine izin ver", ayrıştırılmış izin listesi taşımaz), yoksa
  `Admin`'in tüm izinleri açıkça `tenantRolePermissions`'a **satır satır** mı yazılacak (ayrıştırılmış,
  ama BOTC'nin "yeni izin eklenince Admin otomatik alır" davranışını kaybeder)?

Özet tablosuna 1 yeni satır eklendi.

---

## 11. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 12. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı üretmemiştir** — Q-P01/Q-M03/Q-M04/Q-M06/Q-P04 PO
  tarafından çözülmeden Wave 1 implementation task'ları başlatılamaz.
- Seçenek B'nin (§2) bugünkü `PermissionGuard` koduyla **teknik olarak çalışmayacağı** kanıtlandı
  — eğer PO Seçenek B'yi tercih ederse, bu, guard kodunda **ek bir implementation değişikliği**
  gerektirir; bu belge bu maliyeti **görünür kılmak** için raporlamıştır, kararı vermemiştir.
- Tenant ataması netleşmeden (`tenant-membership.guard.ts` kanıtı, §6) migrate edilen kullanıcılar
  **hiçbir tenant'a erişemez** — bu, Wave 1 cutover planlamasında bir risk olarak not edilmelidir.
- Gerçek secret/parola/hash/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.
