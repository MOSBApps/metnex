# Metnex Identity Hedef Modeli ve Migration Staging Schema

> **Durum: Discovery/tasarım dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-11-identity-hedef-modeli-ve-migration-schema.md` (EPIC-004,
> Wave 0, bağımlılık: TASK-027.7 + TASK-027.10 — done). Bu belge `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`
> (alan-alan hedef eşlemesi), `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` (Q-P01/Q-M04 karar
> matrisi) ve `METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`'yi (genel standart)
> **tamamlar, tekrar etmez** — bu belgenin odağı: bu standardın **identity'ye özel somut staging
> şema tasarımı**. **Bu bir tasarım dokümanıdır** — hiçbir Drizzle şema dosyası, migration dosyası
> veya seed **yazılmamıştır**; hiçbir PostgreSQL/SQL Server bağlantısı kurulmamıştır. Q-P01/Q-M03/
> Q-M04/Q-M06/Q-A03/Q-PW01 **hiçbiri bu belgede çözülmemiştir**.
>
> **TASK-027.11-R1 düzeltmesi (2026-09-17):** AI1, ilk teslimde §7 (transaction sınırları) ile §8
> (tenant membership zorunluluğu) arasında bir iç tutarsızlık tespit etti — §7 "User+tenantMembership+
> COMPLETED her zaman tek transaction" derken §8 "COMPLETED olsa bile tenant'sız erişilemez"
> diyordu. Ayrıca §4.1'de `targetId`'nin yalnızca `COMPLETED`'de dolu olduğu yazılmıştı ama §5
> `SKIPPED` kayıtların mevcut hedefi temsil ettiğini belirtiyordu. Bu iki tutarsızlık §4.1, §4.2,
> §5, §7 ve §8'de **üç-katmanlı bir tamamlanma modeli** (identity user mapping / tenant membership
> mapping / runtime erişime hazır) ve `targetId`'nin `COMPLETED`+`SKIPPED` durumlarının **ikisinde
> de dolu olduğu** açık kuralıyla düzeltilmiştir. Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01/Q-ID01
> kararlarının hiçbiri değiştirilmemiş veya kapatılmamıştır.
>
> **TASK-027.12-R1 karar kapanışı (2026-09-17):** Q-P01 (`tenantRoles`), Q-M03 (mevcut
> `MODULE:RESOURCE:ACTION` taslağı kesinleşti), Q-M04 (ortak rol şablonu), Q-M06 (`Sirket`
> kullanılmaz, ayrı onaylı mapping tablosu, bilinen tenant'lar MOSB/MOSEDAŞ/MOSBİO), Q-A03
> (zorunlu parola sıfırlama) ve Q-PW01 (admin-driven manuel kanal) **kapandı**. Bu kararlar §2,
> §4.1, §10, §12'de **işaretlenmiştir** (hâlâ hiçbir Drizzle şeması/migration/seed üretilmemiştir
> — bu belge tasarım dokümanı olmaya devam eder). Tam karar kaydı için
> `BOTC_MIGRATION_OPEN_QUESTIONS.md`'deki karar kapanışına bakınız.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

`apps/api/src/db/schema/platform.ts` **yeniden, satır satır** okunarak 11 identity tablosunun
(görev talimatının listelediği tümü) güncel tanımı doğrulandı (`grep -n "^export const"` ile
tablo listesi teyit edildi — TASK-027.6'dan bu yana **hiçbir değişiklik yok**). `BOTC_SOURCE_SCHEMA_INVENTORY.md`
§2.1–2.5 (`User`/`Role`/`Permission`/`UserPermission`/`VisibilitySettings` alan listeleri),
`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` (alan sınıflandırması) ve
`METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md` §2/§3/§7/§9 (dry-run alanları,
idempotency kuralları, doğrulama kapıları, audit/run metadata) kaynak olarak kullanıldı, yeniden
üretilmedi. `apps/api/src/db/schema/enums.ts`'deki `CustomerSchemaStatus`
(`PROVISIONING`/`ACTIVE`/`FAILED`/`ARCHIVED`) **gerçek 4-durumlu enum örneği**, staging status
yaşam döngüsü tasarımına (§4.2) **desen olarak** referans alındı.

**Bu belgede hiçbir gerçek secret/parola/hash/salt/connection string yazılmamıştır. Hiçbir
Drizzle şema/migration dosyası üretilmemiş, canlı PostgreSQL/SQL Server'a bağlanılmamıştır.**

---

## 1. Metnex Identity Tabloları — Güncel Kod Doğrulaması (kabul kriteri #1)

| Tablo | Amaç (özet, `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §1'de zaten detaylandırılmıştı) |
|---|---|
| `users` | Tenant'tan bağımsız tekil kullanıcı kaydı |
| `tenants` | Tenant hiyerarşisi (`ROOT`/`STANDARD`/`PLATFORM_ROOT`) |
| `tenantMemberships` | Kullanıcı-tenant üyeliği |
| `tenantRoles` | Tenant-kapsamlı rol tanımı |
| `tenantRolePermissions` | Tenant-kapsamlı rol→izin ataması |
| `userTenantRoleAssignments` | Kullanıcı→tenant-rol ataması |
| `systemRoles` | Platform-kapsamlı rol tanımı |
| `permissions` | İzin katalog tablosu |
| `rolePermissions` | Sistem rolü→izin ataması |
| `userSystemRoleAssignments` | Kullanıcı→sistem-rol ataması |
| `authSessions` | Refresh-token tabanlı oturum (stateless HTTP) |

Bu 11 tablo, görev talimatının listelediği tümüyle **birebir eşleşiyor** — hiçbiri eksik değil,
hiçbiri varsayılmadı.

---

## 2. BOTC Entity → Metnex Hedef Alan Eşlemesi (özet, detay için önceki belgelere referans)

| BOTC entity | Hedef tablo(lar) | Detaylı alan eşlemesi |
|---|---|---|
| `User` | `users` + `tenantMemberships` | `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2 (4 kategori: taşınacak/yeniden-hash'lenecek/Wave2-3'e-özel/karar-bekleyen) |
| `Role` | **`tenantRoles`** (Q-P01 kapandı — TASK-027.12-R1) | `BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §2 |
| `Permission` | `permissions` + **`tenantRolePermissions.permissionCode`** (Q-M03 kapandı — mevcut `MODULE:RESOURCE:ACTION` taslağı kesinleşti) | Aynı belge §3 |
| `UserPermission` | **`userTenantRoleAssignments`** (Q-M04 kapandı — ortak rol şablonu yöntemi seçildi, kullanıcı-başına-özel-rol kullanılmayacak) | Aynı belge §4 |
| `VisibilitySettings` | **Karar bekliyor** — migrate edilip edilmeyeceği kesinleşmedi (Q-P02, bu R1'in kapsamında değil) | `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §7 |

Bu belge bu eşlemeleri **yeniden üretmez** — yalnızca §4'teki staging şemasının **hangi hedef
tabloları referans edeceğini** göstermek için özetlemiştir.

---

## 3. Legacy ID → Metnex Text/UUID Mapping Yaklaşımı

Metnex'in tüm identity tabloları `text` sütunda, uygulama tarafında `randomUUID()` ile üretilen
ID kullanıyor (`apps/api/src/db/id.ts`, `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §5'te zaten
belgelenmişti). BOTC'nin `int` identity ID'leri ile bu UUID'ler arasındaki eşleme, **staging
tablosunun kendisi** tarafından taşınır (ayrı bir "mapping tablosu" **değil** — §4'teki staging
şema **hem** ilerleme takibini **hem** legacy↔hedef eşlemesini tek yerde tutar, gereksiz
tekilleştirme önlenir):

- `sourceLegacyId` (BOTC `int`, metin olarak saklanır — farklı entity tipleri farklı ID uzayları
  kullandığı için tip-güvenli birleşik bir anahtar gerekir) + `sourceEntityType` **birlikte** BOTC
  kaydını benzersiz tanımlar.
- `targetId`, bu çiftin karşılığı olan Metnex `text`/UUID ID'sini tutar — **yalnızca bir kez**
  üretilir (staging kaydı `COMPLETED` olduğunda), sonraki her migration çalıştırması bu alanı
  **okur**, yeniden üretmez (idempotency, §5).

---

## 4. Staging Şema Tasarımı — `migration_staging_identity` (kavramsal, kod değil)

### 4.1 Alan Listesi (görev talimatının istediği 10 alan + gerekçe)

| Alan | Tip (kavramsal) | Amaç |
|---|---|---|
| `id` | text/UUID (staging kaydının kendi kimliği) | Staging kaydının birincil anahtarı — hedef entity ID'siyle **karıştırılmaz** |
| `sourceLegacyId` | text (BOTC `int`'in metin karşılığı) | Legacy kaynak kimliği |
| `sourceEntityType` | enum/text (`USER`/`ROLE`/`PERMISSION`/`USER_PERMISSION`/`VISIBILITY_SETTING`) | Kaynak entity tipi |
| `targetEntityType` | enum/text — **artık sabit değerlerle çözülebilir** (Q-P01/Q-M04 kapandı, TASK-027.12-R1): `USER`→`users`, `ROLE`/`PERMISSION`/`USER_PERMISSION`→`tenantRoles`/`tenantRolePermissions`/`userTenantRoleAssignments`; yalnızca `VISIBILITY_SETTING` için hâlâ nullable (`PENDING_DECISION`, Q-P02 açık) | Hedef entity tipi |
| `targetId` | text/UUID, **nullable** — **`COMPLETED` ve `SKIPPED` durumlarında dolu** (§4.2'deki net kural) | Hedef ID |
| `migrationRunId` | text/UUID | Bu staging kaydını üreten migration çalıştırması (`METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md` §9'daki run ID ile **aynı** kimlik alanı) |
| `mappingStatus` | enum (§4.2) | Yaşam döngüsü durumu — **yalnızca kendi hedef tablosuna yazımı** temsil eder (§8'de `USER` için netleştirilmiştir) |
| `errorCode` | text, nullable | Hata kategorisi kodu (§4.3, standart dokümanının §8'deki 4 kategorisiyle hizalı) |
| `errorDescription` | text, nullable | İnsan-okunabilir hata açıklaması — **gerçek secret/parola içeremez** (kural, kabul kriteri #8) |
| `sourceChecksum` | text (örn. sha256) | Kaynak kaydın **fingerprint'i** — idempotency'nin temeli (§5) |
| `createdAt` / `updatedAt` | timestamp | Oluşturulma/güncellenme zamanı |
| `tenantMembershipStatus` (yalnızca `sourceEntityType = USER` için anlamlı) | enum, `UNRESOLVED` \| `ASSIGNED`, varsayılan `UNRESOLVED` | **Ek açıklık alanı** (görev talimatının 10 alanına ek — R1 düzeltmesi) — `mappingStatus`'tan **bağımsız** olarak, kullanıcının tenant ataması yazılıp yazılmadığını izler; §8'de detaylandırılmıştır |

**Kabul kriteri #3 karşılandı:** 10 talep edilen alanın tamamı yukarıdaki tabloda karşılığını
bulmuştur (`legacy kaynak kimliği`→`sourceLegacyId`, `kaynak entity tipi`→`sourceEntityType`,
`hedef entity tipi`→`targetEntityType`, `hedef ID`→`targetId`, `migration run ID`→`migrationRunId`,
`mapping status`→`mappingStatus`, `hata kodu`→`errorCode`, `hata açıklaması`→`errorDescription`,
`kaynak checksum/fingerprint`→`sourceChecksum`, `oluşturulma/güncellenme zamanı`→
`createdAt`/`updatedAt`). `tenantMembershipStatus`, TASK-027.11-R1 düzeltmesiyle eklenen **ek bir
açıklık alanıdır** — 10 zorunlu alanın yerine geçmez, `mappingStatus`/`targetId` ile birlikte
okunmak üzere tasarlanmıştır (§8).

### 4.2 `mappingStatus` Yaşam Döngüsü (gerçek `CustomerSchemaStatus` deseninden esinlenilmiştir)

`apps/api/src/db/schema/enums.ts`'deki `CustomerSchemaStatus` (`PROVISIONING`/`ACTIVE`/`FAILED`/
`ARCHIVED`) **4-durumlu, retry-edilebilir** desenine benzer şekilde:

| Durum | Anlamı | `targetId` davranışı (R1 düzeltmesi) | Geçiş kuralı |
|---|---|---|---|
| `PENDING` | Dry-run tarafından tespit edildi, henüz apply edilmedi | **Boş** | Başlangıç durumu |
| `BLOCKED` | Doğrulama kapısı (§7, standart doküman) geçilemedi (örn. tenant ataması yok) | **Boş** — hedefte hiçbir kayıt oluşturulmadı | `PENDING`'den, kapı hatası tespit edildiğinde |
| `IN_PROGRESS` | Apply aşaması bu kayıt için çalışıyor | İlk yazımsa **boş**; bir `COMPLETED`/`SKIPPED` kaydın **güncellenmesi** ise önceki `targetId` **korunur** (henüz değişmez) | `PENDING`'den, apply başladığında |
| `COMPLETED` | Hedef kayıt, **kendi hedef tablosuna** (§2) başarıyla oluşturuldu/güncellendi | **Dolu** — bu veya önceki bir çalıştırmada yazılan değer | `IN_PROGRESS`'ten |
| `FAILED` | Apply sırasında hata oluştu, `errorCode`/`errorDescription` dolu | **Önceki değeri korur** — hiç yazılmadıysa boş kalır; bir güncelleme denemesi başarısız olduysa önceki `COMPLETED` değeri **değişmeden kalır** (kısmi/yarım targetId asla yazılmaz) | `IN_PROGRESS`'ten — **retry edilebilir** (`CustomerSchemaStatus.FAILED` ile aynı ilke) |
| `SKIPPED` | Kaynak zaten hedefte var ve `sourceChecksum` değişmemiş (idempotent no-op) | **Dolu** — önceki `COMPLETED` çalıştırmasından **kalan** `targetId` korunur (bkz. not aşağıda); **asla `null`'a düşmez** | `PENDING`'den, checksum karşılaştırmasında |

**R1 düzeltmesi — `SKIPPED` ve `targetId` (önceki teslimdeki tutarsızlık burada giderilmiştir):**
`SKIPPED`, tanımı gereği "hedefte **zaten karşılığı olan** bir kayıt" anlamına gelir — bu nedenle
`targetId` bu durumda **boş olamaz**. İki alt-senaryo:
1. Kayıt **daha önce bu staging tablosu üzerinden** `COMPLETED` olmuştu → `targetId` o kayıttan
   **doğrudan korunur**, yeniden hesaplanmaz.
2. Kayıt **ilk kez** işleniyor ama hedefte (örn. elle veya önceki bir manuel migration'dan) zaten
   bir karşılığı **bulunuyor** → bu durumda `SKIPPED`'e geçmeden önce `targetId`'nin **hedef
   tablodan sorgulanarak çözülmesi** gerekir (checksum eşleşmesi zaten bir eşleşen kayıt bulunduğunu
   varsayar) — `targetId` **`null` bırakılarak `SKIPPED` işaretlenemez**, bu durum tasarım
   kısıtıdır.

`COMPLETED` veya `SKIPPED` durumundaki bir kayıt, migration'ın **sonraki çalıştırmalarında**
dokunulmaz (idempotency, §5) — `CustomerSchemaRegistryService.ensureSchemaProvisioned()`'ın
`ACTIVE` satırda no-op dönmesiyle **aynı ilke**. Her iki durumda da `targetId` **doludur** — bu
ikisi arasındaki fark yalnızca "bu çalıştırmada mı yazıldı (`COMPLETED`) yoksa zaten var mıydı
(`SKIPPED`)" sorusudur, `targetId`'nin varlığı açısından **fark yoktur**.

**Not — `USER` entity tipi için `COMPLETED`'ın kapsamı sınırlıdır (bkz. §8):** Bir `USER` staging
kaydının `mappingStatus = COMPLETED` olması **yalnızca** `users` tablosuna satırın yazıldığı
anlamına gelir — kullanıcının bir tenant'a atandığını veya runtime'da erişime hazır olduğunu
**garanti etmez**. Bu ayrım §8'de tam olarak tanımlanmıştır.

### 4.3 `errorCode` — Standart Dokümanın 4 Kategorisiyle Hizalama

`METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md` §8'deki 4 hata kategorisi
(fatal/recoverable/warning/skipped) burada `errorCode` alanının **öneki** olarak yansıtılır (örn.
`FATAL_TENANT_UNRESOLVED`, `RECOVERABLE_INVALID_EMAIL`, `WARNING_EMPTY_SIRKET`) — kesin kod listesi
bu belgede **üretilmemiştir** (implementation kararı).

---

## 5. Idempotency ve Tekrar Çalıştırma Davranışı

| Kural | Staging şemasındaki karşılığı |
|---|---|
| Duplicate üretmeme | `(sourceEntityType, sourceLegacyId)` çifti üzerinde **benzersizlik kısıtı** — aynı BOTC kaydı için ikinci bir staging kaydı **oluşturulamaz** (§6) |
| Deterministik legacy ID mapping | `targetId`, `COMPLETED` durumuna geçişte **bir kez** yazılır; `SKIPPED` durumuna düşen kayıtlar bu değeri **korur** (§4.2 R1 düzeltmesi — `targetId` `COMPLETED`+`SKIPPED`'in ikisinde de doludur), sonraki okumalar bu alanı kullanır, yeniden üretmez |
| Tekrar çalıştırmada mevcut kayıtların davranışı | `sourceChecksum` karşılaştırması: checksum **değişmediyse** → `SKIPPED` (dry-run'da "atlanacak kayıt" sayacına girer); checksum **değiştiyse** → mevcut `COMPLETED` kaydı `PENDING`'e döner, hedef **güncellenir** (`UPDATE`, yeni `INSERT` değil) |
| Partial failure sonrası güvenli yeniden çalıştırma | `FAILED` durumundaki kayıtlar bir sonraki çalıştırmada **otomatik olarak yeniden denenir** (`IN_PROGRESS`'e geri döner); `COMPLETED`/`SKIPPED` kayıtlar **dokunulmaz** — `CustomerSchemaRegistryService`'in `FAILED`→retry deseniyle birebir aynı |

---

## 6. Aynı Kaynak Kaydının Birden Fazla Hedefe Eşlenmesini Engelleme

`(sourceEntityType, sourceLegacyId)` üzerindeki benzersizlik kısıtı (§5), bir BOTC kaydının
**yalnızca bir** staging kaydına (ve dolayısıyla yalnızca bir `targetId`'ye) sahip olmasını
**yapısal olarak** garanti eder. Bu, görev talimatının istediği "aynı kaynak kaydının birden fazla
hedefe eşlenmesini engelleyecek kural" gereksinimini karşılar — **implementation değil, tasarım
kısıtı olarak** burada belgelenmiştir.

**İstisna durumu (henüz karar bekliyor):** `UserPermission`'ın Q-M04 "kullanıcı-başına-özel-rol"
seçeneğinde, **birden fazla** BOTC `UserPermission` satırı (aynı kullanıcının farklı izinleri)
**tek bir** hedef `tenantRoles`/`systemRoles` kaydına toplanabilir — bu durumda `sourceEntityType`
= `USER_PERMISSION` için `(sourceLegacyId)` her zaman `UserPermission.Id` (BOTC'nin kendi ara
tablo satır ID'si) olacağından çakışma **oluşmaz**, ama **birden fazla staging kaydının aynı
`targetId`'yi paylaşması** mümkün hâle gelir (rol-şablonu senaryosunda da benzer) — bu, "her
kaynak kaydı tek bir hedefe" ilkesini **bozmaz** (her kaynak kaydı hâlâ tek bir hedefe eşlenir),
yalnızca **birden fazla kaynağın aynı hedefi paylaşabileceğini** gösterir; bu ayrım net tutulmuştur.

---

## 7. Transaction Sınırları

`METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md` §6'daki genel ilke burada identity'ye
özgü olarak somutlaştırılmıştır:

**R1 düzeltmesi:** Aşağıdaki tablo, önceki teslimdeki "User + tenantMembership + COMPLETED her
zaman tek transaction" ifadesini §8'deki üç-katmanlı durum modeliyle **tutarlı hale getirir** —
tenant ataması **o kayıt için** o an çözülebiliyorsa iki yazım aynı transaction'da birleşir,
çözülemiyorsa identity yazımı **bloklanmadan** ilerler ve tenant ataması ayrı bir adıma bırakılır.

| İşlem grubu | Transaction içinde mi? |
|---|---|
| Bir `User` kaydının `users` satırı yazımı + staging kaydının `mappingStatus = COMPLETED`'e güncellenmesi (identity user mapping) | **Evet, tek transaction** — `bootstrap.service.ts` deseniyle aynı ilke; bu, yalnızca **identity satırının kendisinin** atomik yazımıdır, tenant ataması **dahil değildir** (§8) |
| **Tenant ataması bu kayıt için o an çözülebiliyorsa:** ilgili `tenantMemberships` satırı + `tenantMembershipStatus = ASSIGNED` güncellemesi | **Evet, identity yazımıyla AYNI transaction içinde** — tenant biliniyorken ayırmanın faydası yok, atomiklik yarım kalan (identity var, tenant yok) bir ara durumu bu özel durumda **önler** |
| **Tenant ataması bu kayıt için o an çözülemiyorsa** (Q-M06'nın genel kararı verilmiş olsa bile, tekil bir kayıt için — örn. eksik/çelişkili kaynak veri — tenant hâlâ belirlenemeyebilir) | **Hayır — identity yazımı yukarıdaki gibi kendi transaction'ında tamamlanır**, `tenantMembershipStatus` `UNRESOLVED` kalır; `tenantMemberships` yazımı **ayrı, sonraki bir transaction'da** (reconciliation aşamasında, standart doküman §1 aşama 7) yapılır |
| Bir `Role`/`Permission` kaydının hedef tabloya yazımı + staging güncellemesi | **Evet, tek transaction** |
| Bir `UserPermission`/role-atama kaydının `userTenantRoleAssignments`/`userSystemRoleAssignments` satırı + staging güncellemesi | **Evet, tek transaction** — ayrıca bu kayıt, ilgili `User` staging kaydının `mappingStatus = COMPLETED` **VE** `tenantMembershipStatus = ASSIGNED` olduğu (yalnızca identity değil, runtime erişime hazır olduğu, §8) doğrulanmadan **başlatılmaz** — FK bütünlüğü (`userTenantRoleAssignments`'ın composite FK'sı, TASK-027.6 §1) bunu zaten dolaylı olarak zorluyor, burada açıkça **ön koşul** olarak belirtilmiştir |
| Farklı kullanıcılar arası (toplu işlem) | **Hayır, her kullanıcı kendi transaction'ında** — standart doküman §6 ile tutarlı |

---

## 8. Tenant Membership Zorunluluğu — Üç-Katmanlı Tamamlanma Modeli (R1 düzeltmesi)

**Önceki teslimdeki tutarsızlık:** §7'de "User + tenantMembership + COMPLETED tek transaction"
denirken, bu bölümde "User COMPLETED olsa bile tenant'sızsa erişemez" deniyordu — bu iki ifade
birlikte, `COMPLETED`+tenant'sız bir durumun **hem imkansız (§7) hem de mümkün (§8 eski hâli)**
olduğunu ima ediyordu. Bu belirsizlik burada **staging durum modelinin açıklığı olarak** (kabul
kriteri #2, implementation kararı değil) giderilmiştir.

### 8.1 Üç Ayrı Tamamlanma Katmanı

`USER` tipi bir staging kaydı için **üç farklı, birbirinden bağımsız izlenen** tamamlanma durumu
vardır:

| Katman | Alan | Anlamı |
|---|---|---|
| **1. Identity user mapping tamamlandı** | `mappingStatus = COMPLETED` | Yalnızca `users` tablosuna satır **yazıldı** (email/passwordHash-durumu/displayName vb., §2). Tenant'la **hiçbir ilgisi yoktur**. |
| **2. Tenant membership mapping tamamlandı** | `tenantMembershipStatus = ASSIGNED` | İlgili `tenantMemberships` satırı **yazıldı** — bu, o kayıt için tenant ataması **çözülebildiği zaman** gerçekleşir (Q-M06'nın genel kararı + o kayda özgü veri yeterliliği) |
| **3. Kullanıcı runtime erişime hazır** | `mappingStatus = COMPLETED` **VE** `tenantMembershipStatus = ASSIGNED` (ikisi birlikte) | `TenantMembershipGuard`'ın kullanıcının **herhangi bir işlem** yapabilmesi için aradığı ön koşul (`BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §6) — bu iki alan **ikisi de gerçekleşmeden** kullanıcı hiçbir tenant kapsamlı işlem yapamaz |

### 8.2 Çelişkinin Çözümü

Bu üç katmanla, önceki iki bölüm artık **tutarlıdır**:

- **§7'nin transaction kuralı:** identity yazımı (katman 1) **her zaman** kendi transaction'ında
  atomik tamamlanır. Tenant ataması **o an biliniyorsa**, katman 2 **aynı transaction'a eklenir**
  (verimlilik, gereksiz ayrım yok). Tenant ataması **o an bilinmiyorsa**, katman 1 yine de
  tamamlanır (`mappingStatus = COMPLETED`) ama katman 2 `UNRESOLVED` kalır — **bu, §7'de artık
  açıkça izin verilen bir durumdur**, çelişki değildir.
- **§8'in eski ifadesi düzeltildi:** "`User` `COMPLETED` olsa bile tenant'sızsa erişemez" ifadesi,
  **yalnızca katman-1 anlamındaki `COMPLETED`'i** kastediyordu ama bunu açıkça belirtmiyordu. Artık
  açık: **katman-1 `COMPLETED` olması, katman-3 (runtime erişime hazır) olmasını garanti etmez.**
  Bir kullanıcı katman-1'de `COMPLETED`, katman-2'de `UNRESOLVED` durumunda **süresiz kalabilir**
  (Q-M06 tamamen çözülene ve bu spesifik kayıt için tenant belirlenene kadar) — bu, `Sirket`'in
  güvenilmez olması nedeniyle (§9) **beklenen, geçici bir ara durumdur**, hata değildir.

### 8.3 Q-M06 İlişkisi (değiştirilmedi)

`apps/api/src/platform/tenant-membership.guard.ts`'nin gerçek davranışı
(`BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §6) burada **aynen korunmuştur**: `tenantMemberships`
satırı olmayan bir kullanıcı **hiçbir tenant'a erişemez**. Q-M06 çözülmeden bu üç katmanlı model
**değişmez** — Q-M06'nın çözümü, katman-2'nin **hangi kaynak alandan/mekanizmadan** doldurulacağını
belirler (`Sirket` değil, `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §3'teki lokasyon-tenant seçenek
tablosu), bu belge **o kararı vermez**, yalnızca staging modelinin bu belirsizliği **doğru
taşıyabildiğini** gösterir.

---

## 9. `Sirket` — Tenant Eşleme Kaynağı Olarak Kullanılmadı (korunmuştur)

`BOTC_MIP_TENANT_LOCATION_MAPPING.md` §2'nin bulgusu (Sirket serbest metin, hiçbir sorguda
kullanılmıyor) burada **değiştirilmeden** korunmuştur — staging şemasının hiçbir alanı `Sirket`'i
tenant ataması için **girdi olarak** kullanmaz.

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — Q-M06):** Tenant ataması, `tenantMembershipStatus`
> alanı (§8.1) üzerinden, **ayrı, onaylı bir mapping tablosu** ile çözülecektir — `Sirket` değil.
> Bilinen işletme tenant'ları **MOSB, MOSEDAŞ, MOSBİO**'dur; bu 3 tenant'a kesin olarak
> eşlenebilen kullanıcılar için `tenantMembershipStatus = ASSIGNED` yazılabilir.
> `KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL` gibi belirsiz lokasyonlara bağlı kullanıcılar için
> `tenantMembershipStatus` **`UNRESOLVED` kalmaya devam eder** (Q-T01 açık) — bu, §8.1'deki
> üç-katmanlı modelin **tam olarak öngördüğü** bir ara durumdur, yeni bir tasarım değişikliği
> gerektirmez.

---

## 10. PasswordHash — Status/Model Kararı Kapandı

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — Q-A03 + Q-PW01):** `passwordStrategy`'nin
> **varsayılan ve tek geçerli değeri artık `RESET_REQUIRED`'dur.** `ADMIN_ASSIGNED` değeri,
> Q-PW01'in onayladığı **iletişim kanalını** (admin-driven/manuel duyuru) temsil etmek üzere
> `RESET_REQUIRED` ile **birlikte** (alternatif değil, ek bir alt-bayrak olarak) kullanılabilir —
> ayrıntı implementation aşamasında netleşecektir, ama **hash'in hiçbir koşulda taşınmayacağı**
> (`RESET_REQUIRED`'ın temel anlamı) artık kesindir.

`BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §4'teki 3 stratejiye (zorunlu sıfırlama/ilk
girişte kontrollü oluşturma/geçici doğrulama+yükseltme) **paralel**, staging şemasının `User`
kayıtları için taşıyabileceği bir `passwordStrategy` alanı önerilmişti (gerçek değer değil,
yalnızca durum etiketi):

| Değer | Anlamı |
|---|---|
| `RESET_REQUIRED` | **✅ Seçildi (Strateji 1)** — hedef `users.passwordHash` **hiç yazılmaz**, kullanıcı zorunlu olarak yeni parola belirler |
| `ADMIN_ASSIGNED` | Strateji 2'nin kanal mekanizması — admin tarafından `setPassword` ile atanmış geçici bir parola var (staging bu **parolanın kendisini asla saklamaz**, yalnızca "atandı" durumunu tutar); `RESET_REQUIRED` ile **birlikte** kullanılır (Q-PW01'in onayladığı admin-driven iletişim kanalı) |
| `PENDING_DECISION` | **Artık kullanılmaz** — Q-A03/Q-PW01 kapandığı için bu durum yeni kayıtlarda oluşmaz |

**Bu belge hiçbir gerçek hash/parola/salt değeri taşımaz** — `passwordStrategy` yalnızca **hangi
sürecin izleneceğinin** kaydıdır, kabul kriteri #7/#8 ile tutarlıdır.

---

## 11. `authSessions` — Staging Kaydı veya Session Transferi Üretilmedi

Görev talimatı gereği açıkça teyit edilir: bu belge `authSessions` için **hiçbir staging kaydı
türü önermemiştir** ve BOTC'nin bellek-içi `SessionService` modelinin transferini **tasarlamamıştır**
(`BOTC_ENTITY_DOMAIN_MAPPING.md` §5, Q-E01, `BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §7
ile tutarlı) — `authSessions` migration'ın **hiçbir aşamasında** dokunulmayan bir tablodur.

---

## 12. Role Modeli ve UserPermission Dönüşümü — Karar Kapandı

> **KARAR KAPANDI (TASK-027.12-R1, 2026-09-17 — Q-P01 + Q-M04).**

`targetEntityType` alanının (§4.1) `Role`/`Permission`/`UserPermission` kaynak tipleri için
alacağı değer artık **sabittir: `tenantRoles`** (Q-P01, `systemRoles` **seçilmedi**). `UserPermission`
→hedef dönüşüm yöntemi de kesinleşmiştir: **ortak-şablon** (§6'daki Seçenek 2/B) — kullanıcı-başına-
özel-rol **kullanılmayacaktır**. Staging şeması bu kararları **doğrudan uygulayabilir** hâle
gelmiştir; yalnızca §6'daki gruplama/kümeleme **algoritmasının kendisi** (hangi izin
kombinasyonlarının hangi ortak şablona karşılık geleceği) hâlâ **implementation aşamasının**
konusudur — bu bir açık soru değil, bir **implementation detayıdır**.

**Not — Q-P03 artık ele alınabilir:** Q-M04'ün kapanmasıyla, `UserPermission` dönüşüm
mekanizmasının hangi implementation task'ında ele alınacağı sorusu (**Q-P03**, teknik, PO onayı
gerektirmiyordu) artık **planlanabilir** hâle gelmiştir — bu R1, Q-P03'ü kendisi **kapatmamıştır**,
yalnızca önkoşulunu gidermiştir.

---

## 13. `VisibilitySettings` — Staging Hedefi Olarak Karar Bekliyor

`VisibilitySettings`, `sourceEntityType` enum'unda bir seçenek olarak **yer alabilir** (§4.1), ama
bu, migrate edileceği anlamına **gelmez** — `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §7'deki
**Q-P02** (referans bilgisi mi, tamamen atlanacak mı) çözülmeden bu kaynak tipi için **hiçbir
staging kaydı üretilmeyecektir**. Bu belge yalnızca şemanın bu senaryoyu **barındırabileceğini**
gösterir, migration kararı vermez.

---

## 14. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu belge yalnızca `User`/`Role`/`Permission`/`UserPermission`/`VisibilitySettings` staging
tasarımını ele almıştır; Ticket/MaintenanceRecord/FaultRecord (Wave 2) ve DÖF (Wave 3) için
**hiçbir mapping veya staging tasarımı üretilmemiştir** (D-007 ile tutarlı).

---

## 15. Yeni Açık Soru

Mevcut **Q-P01, Q-M03, Q-M04, Q-M06, Q-A03, Q-PW01, Q-P02** bu task'ta **kapatılmamış**, aksine
somut staging tasarımıyla (§4, §9, §10, §12, §13) **ilişkilendirilmiştir**. Bunun ötesinde
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye **1 yeni soru** append edildi:

- **Q-ID01** — `migration_staging_identity` tablosu (§4) hangi PostgreSQL şemasında tutulacak
  (ayrı bir `migration` şeması mı, `public` mi) ve migration tamamlandıktan **sonra** bu staging
  verisi silinecek mi, yoksa audit/izlenebilirlik amacıyla **kalıcı olarak** mı saklanacak
  (retention kararı)?

Özet tablosuna 1 yeni satır eklendi.

---

## 16. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 17. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir Drizzle şeması, migration dosyası veya seed üretmemiştir** — yalnızca
  kavramsal staging tasarımı sunulmuştur.
- **TASK-027.12-R1 güncellemesi:** Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01 **kapandı** (2026-09-17).
  Geriye yalnızca **Q-P02** (`VisibilitySettings` taşınma kararı) ve **Q-ID01** (staging tablosunun
  şema/retention kararı) açık kalmıştır — bu tasarımın **gerçek Drizzle şemasına dönüştürülmesi**
  bu iki soru çözülmeden başlatılamaz.
- §8'deki tenant membership riski (bir `User` `COMPLETED` olsa bile tenant'sızsa erişemez) artık
  bir risk değil, §8.1'deki üç-katmanlı modelin **beklenen bir davranışıdır** — Q-T01 ile ilgili
  belirsiz lokasyonlar çözülene kadar bazı kullanıcılar kalıcı olarak `tenantMembershipStatus =
  UNRESOLVED` kalabilir, bu **implementation aşamasında izlenmelidir**.
- Gerçek secret/parola/hash/salt/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Canlı bağlantı
  kurulmadı. Git commit/push yapılmadı.
