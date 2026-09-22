# Metnex Vardiya (ShiftReport) API/Service Domain Boundary ve Scope Contract (TASK-027.24)

> **Durum: Şema-nötr kontrat dokümanı. Production kodu, Drizzle schema, migration, seed, permission
> catalogue kodu, endpoint implementasyonu YAZILMAMIŞTIR** (bkz. `METNEX_SHIFT_REPORT_API_SERVICE_BLOCKER.md`).
> Kontrattaki permission adları **sembolik yer tutucudur** (`⟨PERM_…⟩`); gerçek kod dizgisi değildir.
> Açık kararlar (Q-V07, V08, V11, V16, V18, V19, V20, V21, V22 ve ilgili diğerleri) bu belgede kapatılmamıştır;
> kontrat kararın bağlı olduğu noktaları açıkça `⟦Q-Vxx⟧` ile işaretler.

**Tarih:** 2026-09-19 · **Hazırlayan:** AI2
**Temel kararlar:** Q-V10 (AI1/PO) tek `shift_reports` tablosu + `locationCode`; TASK-027.22/23 karar paketleri.

**Kod kanıtları (okundu):** `tenant-scope/tenant-scope.service.ts` + `.spec.ts`,
`platform/tenant-membership.guard.ts`, `platform/permission.guard.ts`, `audit/platform-audit.service.ts`,
`db/schema/{platform,operations}.ts`.

---

## 0. Mevcut mekanizmalardan doğrulanan zemin (bu task'ta bulunan)

| # | Bulgu | Kanıt | Kontrata etkisi |
|---|---|---|---|
| F1 | `TenantScopeService` için **üretim kodunda henüz hiçbir tüketici yok** (yalnızca kendi modülü/spec) | `grep TenantScopeService` → yalnızca `tenant-scope/` | ShiftReport, data-plane scope'un **ilk gerçek tüketicisi** olur; repository katmanı `schemaName` ile çalışacak → Q-V11 doğrudan bloklayıcı |
| F2 | `resolve()` PLATFORM_ROOT/inactive/rootsuz/registry'siz durumlarda **fail-closed** ve ROOT/ara düğüm/yaprak kapsamlarını döndürür | `tenant-scope.service.spec.ts` (8 test: unknown, PLATFORM_ROOT, inactive, no customer root, no ACTIVE registry, ROOT tüm torunlar, reporting node, operating node) | §3 kurallarının **kanıtı mevcut**; yeni scope kodu gerekmez |
| F3 | `TenantMembershipGuard` ve `PermissionGuard` `isSystemAdmin` için **doğrudan `true`** döner | `tenant-membership.guard.ts:44`, `permission.guard.ts:32` | Guard geçse bile servis **her zaman** `resolve()` çağırmalı (§3-R8) |
| F4 | `PermissionGuard`, `TENANT_ADMIN` sistem rolü atamasına sahip kullanıcı için **belirli permission kodunu aramadan `true`** döner | `permission.guard.ts` (`tenantAdminAssignment` dalı) | Gelecek `⟦Q-V07⟧` permission'ı TENANT_ADMIN için fiilen örtük verilir; bu Vardiya'ya özgü bir yetki genişlemesi **değil**, mevcut davranış; TASK-027.30'da belgelenmeli/test edilmeli |
| F5 | `PermissionGuard` yetkiyi `x-tenant-id` başlığındaki tenant'ta değerlendirir ve **lokasyon farkında değildir** | `permission.guard.ts` | Lokasyon bazlı yetki mevcut mekanizmada yok → `⟦Q-V18⟧`, yeni permission üretilmedi |
| F6 | `PlatformAuditService.log()`: `actorId, actionCode, entityType, entityId, summary, metadata`; **tenant kolonu yok**, `metadata` `scrubSecrets`'ten geçer; tablo yoksa sessiz atlar, diğer hatalarda **fırlatır** | `platform-audit.service.ts:7-14,87-115` | §7; audit hatasının isteği düşürüp düşürmeyeceği `⟦Q-V24⟧` |
| F7 | Uygulamada **idempotency-key** kuralı yok (yalnızca migration motoru) | `grep -i idempotency` (migration hariç) boş | Etkileşimli create için anahtar mekanizması **yeni** bir karar → `⟦Q-V23⟧` |
| F8 | Vardiya için hiçbir tablo/şema yok; Drizzle schema bu task'ta yasak | `db/schema/*` | Repository yazılamaz → implementasyon yapısal olarak bloklu |

---

## 1. Ortak kontrat kuralları

- **Tenant kaynağı:** `X-Tenant-Id` başlığı **yalnızca hedef tenant adayıdır**; `TenantMembershipGuard`
  üyeliği doğrular, sonra servis `TenantScopeService.resolve(tenantId)` çağırır. Body/query'den gelen
  `tenantId`, `Sirket` veya operatör tenant'ı **asla** scope kaynağı değildir (FR-015, `Sirket` kuralı).
- **Permission:** endpoint başına sembolik gereksinim (§2). Gerçek kod Q-V07 kapanana kadar yoktur;
  bilinmeyen kodla `@RequirePermission` **kullanılmaz**.
- **Response zarfı:** mevcut API'lerin zarf/hata biçimini izler (Nest `HttpException` gövdesi); yeni zarf
  icat edilmedi. Hata kodu sütunu HTTP durumunu ve alan-düzeyi neden kodunu (öneri) verir.
- **Yanıt sızıntı kuralı:** bulunmayan kayıt ile başka tenant'a ait/erişilemeyen kayıt **aynı** 404'ü
  döner (varlık sızdırılmaz).
- Alan adları `TASK-027.22` §1'den; taslaktır.

## 2. Endpoint kontratları (şema-nötr)

Ortak yanıt alanları (`ShiftReportDto`): `id, tenantId, locationCode, shiftCode, operatorUserId|null,
secondOperatorName|null, recordedAt, notes|null, status, createdAt, updatedAt`.
`operatorNameSnapshot` `⟦Q-V15⟧`, `logbookDate` yalnızca arşiv (TASK-027.26/27) — bu kontratın dışında.
`scopeStatus`, `legacy*`, `sourceChecksum`, `migrationRunId` **API yanıtında yoktur** (iç alanlar).

### 2.1 Liste — `GET shift-reports`
| Öğe | Kontrat |
|---|---|
| İstek | query: `locationCode?`, `status?`, `from?`, `to?` (`recordedAt` aralığı), `page`, `pageSize` (üst sınır zorunlu) |
| Doğrulama | `locationCode` ∈ değer kümesi `⟦Q-V14/TASK-027.23 taslak⟧`; `status` ∈ etkin küme; `from ≤ to`; `pageSize ≤ üst sınır` |
| Scope | `resolve(X-Tenant-Id).dataScopeTenantIds`; sorgu `tenantId ∈ dataScopeTenantIds AND tenantId IS NOT NULL AND scopeStatus='RESOLVED'` (açık koşul, NULL mantığına güvenilmez) |
| Permission | ⟨PERM_SHIFT_REPORT_VIEW⟩ `⟦Q-V07⟧` |
| Yanıt | `{ items: ShiftReportDto[], page, pageSize, total }` |
| Boş durum | Kapsamda RESOLVED kayıt yoksa **200 + boş liste**; unresolved/conflict/NULL kayıtlar ayrıştırılıp **sayılmaz, ima edilmez** (varlık sızdırılmaz). Tenant'ın hiç RESOLVED mapping'i yoksa da 200 boş — hata değil |
| Hatalar | 400 doğrulama · 401 · 403 üyelik/permission/scope (`resolve()` reddi dahil) · 404 tenant bulunamadı (resolve) |
| Audit | Yok (okuma) — okuma audit'i istenirse ayrı karar |
| Idempotency | Doğal (GET) |
| Bloklayıcı | `⟦Q-V07⟧, ⟦Q-V11⟧, ⟦Q-V18⟧` (lokasyon filtresi tenant içi kısıt mı?) |

### 2.2 Detay — `GET shift-reports/:id`
| Öğe | Kontrat |
|---|---|
| Scope/koşul | Liste ile aynı koşul + `id`; koşulu sağlamayan her durum **404** |
| Permission | ⟨PERM_SHIFT_REPORT_VIEW⟩ |
| Yanıt | `ShiftReportDto` |
| Hatalar | 404 (yok / kapsam dışı / NULL / unresolved / conflict — ayırt edilemez) · 403 · 401 |
| Audit | Yok |

### 2.3 Oluşturma — `POST shift-reports`
| Öğe | Kontrat |
|---|---|
| İstek | `locationCode`, `shiftCode`, `secondOperatorName?`, `recordedAt`, `notes?`, `clientRequestId` `⟦Q-V23⟧` |
| Sunucu-türetilen | `tenantId` (mapping/scope'tan, **istekten alınmaz**), `operatorUserId` (oturumdaki kullanıcı — BOTC davranışı: `OperatorBotUserId` oturumdan), `status=DRAFT`, `scopeStatus` |
| Doğrulama | `locationCode` geçerli **ve** çağıran tenant'ın kapsamındaki bir RESOLVED mapping'e sahip; `shiftCode` değer kümesi `⟦Q-V14⟧`; `recordedAt` makul aralık; `notes` uzunluk sınırı (kaynakta yok → karar); `secondOperatorName` ≤150 |
| Scope | `resolve()` → **`canEnterData=true` zorunlu** yoksa 403 `SHIFT_TENANT_READ_ONLY`; hedef tenant, lokasyonun RESOLVED mapping'indeki tenant ile **birebir** eşleşmeli ve `dataScopeTenantIds` içinde olmalı |
| Permission | ⟨PERM_SHIFT_REPORT_CREATE veya UPDATE⟩ `⟦Q-V19⟧, ⟦Q-V07⟧` |
| Yanıt | 201 `ShiftReportDto` |
| Hatalar | 400 `SHIFT_INVALID_LOCATION` / doğrulama · 403 yetkisiz tenant / `SHIFT_TENANT_READ_ONLY` · 409 `SHIFT_LOCATION_UNRESOLVED` (mapping RESOLVED değil) · 409 `SHIFT_MAPPING_CONFLICT` · 409 `SHIFT_DUPLICATE_REQUEST` (aynı `clientRequestId`, farklı içerik) · 500 beklenmeyen |
| Audit | `SHIFT_REPORT_CREATED` (§7) |
| Idempotency | `⟦Q-V23⟧`: aynı `clientRequestId`+aynı içerik → mevcut kaydı 200 döner (yeni satır yok); aynı anahtar+farklı içerik → 409; **sessiz overwrite yok** |
| Bloklayıcı | `Q-V07, V11, V19, V20, V21, V23, V14, V24` |

### 2.4 Güncelleme — `PATCH shift-reports/:id`
| Öğe | Kontrat |
|---|---|
| İstek | değiştirilebilir alanlar: `shiftCode`, `secondOperatorName`, `notes`, `recordedAt?` (`⟦…⟧`); **`locationCode`, `tenantId`, `operatorUserId`, `status` istekten değiştirilemez** (tenant/lokasyon değişimi = reassignment `⟦Q-V22⟧`, ayrı süreç) |
| Koşul | Yalnızca `status=DRAFT`. **`COMPLETED` rapor güncelleme davranışı `⟦Q-V09⟧`'a bağlı:** öneri (karar değil) 409 `SHIFT_REPORT_COMPLETED`; kontrat bunu **kesinleştirmez** |
| Scope | Detay ile aynı okuma koşulu + `canEnterData=true` |
| Permission | ⟨PERM_SHIFT_REPORT_UPDATE⟩ `⟦Q-V07, Q-V19⟧` |
| Eşzamanlılık | Öneri: `updatedAt`/sürüm tabanlı iyimser kilit (BOTC'de yok) — `⟦karar⟧`; yoksa son-yazan-kazanır riski açıkça kabul edilmiş olmalı |
| Hatalar | 400 · 403 · 404 · 409 `SHIFT_REPORT_COMPLETED` `⟦Q-V09⟧` · 409 conflict sürüm |
| Audit | `SHIFT_REPORT_UPDATED` (değişen **alan adları**, değerler değil) |
| Idempotency | Aynı içerik → no-op 200 (`updatedAt` değişmez); sessiz overwrite yok |

### 2.5 Tamamlama — `POST shift-reports/:id/complete`
| Öğe | Kontrat |
|---|---|
| İstek | gövde yok (opsiyonel `expectedUpdatedAt`) |
| Geçiş | `DRAFT → COMPLETED` tek yön; `COMPLETED→DRAFT` (yeniden açma) kaynakta **yok** → kontrata dahil değil `⟦Q-V09 notu⟧` |
| Koşul | `status=DRAFT`; zaten `COMPLETED` ise **idempotent 200** (aynı sonuç) — kaynak davranışı: BOTC onay diyaloğu tek yönlü |
| Scope/Permission | Güncelleme ile aynı |
| Yan etki | **Email dağıtımı bu kontratın dışındadır** (TASK-027.28); `COMPLETED` geçişi yalnızca bir domain olayı yayma **noktasıdır** (implementasyon kararı 027.28'de) |
| Hatalar | 403 · 404 · 409 `SHIFT_REPORT_ALREADY_COMPLETED` (yalnızca `expectedUpdatedAt` uyuşmazlığında) |
| Audit | `SHIFT_REPORT_COMPLETED` (`fromStatus=DRAFT, toStatus=COMPLETED`) |

**Kontrat dışı (bu task):** silme (BOTC'de yok — kaynak envanteri), arşivleme (TASK-027.26/27), import/migrasyon
yazımı (TASK-027.26), mapping yönetimi ve unresolved kayıt yönetimi `⟦Q-V16⟧`, email, UI.

## 3. Tenant izolasyonu — zorunlu kurallar ve kanıt

| Kural | Kontrat | Mevcut kanıt / test yolu |
|---|---|---|
| R1 `tenantId IS NULL` görünmez | Tüm okuma/yazma sorgularında `tenantId IS NOT NULL` **açık** koşul | F2: `dataScopeTenantIds` yalnızca gerçek tenant ID'leri; servis-katmanı test TASK-027.24-impl/027.30'da |
| R2 `scopeStatus != RESOLVED` görünmez | Açık `scopeStatus='RESOLVED'` koşulu | Servis testi (impl sonrası) |
| R3 Conflict mapping erişim üretmez | Mapping CONFLICT ise ilgili satırlar R1/R2 ile düşer; oluşturma 409 | TASK-027.23 K3 |
| R4 Sorgu yalnızca `dataScopeTenantIds` | Repository imzası `tenantIds: string[]` alır; boş dizi → **boş sonuç** (asla filtresiz) | `resolve()` spec: operating node yalnızca kendini döndürür |
| R5 Root aggregation `canAggregateChildren`'ı aşamaz | Servis `dataScopeTenantIds`'ı olduğu gibi kullanır, genişletmez | F2: ROOT tüm torunlar; reporting node kendi+torunları; operating node yalnızca kendisi |
| R6 `canEnterData=false` yazamaz | Create/update/complete öncesi `resolve().canEnterData` kontrolü | `resolve()` çıktısında alan mevcut |
| R7 `Sirket` ile tenant çıkarımı yok | Hiçbir DTO/servis `Sirket` okumaz | Kod taraması (impl sonrası testte `grep` tabanlı) |
| R8 `isSystemAdmin` scope'u bypass edemez | Guard true dönse bile servis `resolve()` çağırır; `PLATFORM_ROOT` `resolve()`'da 403 → sistem yöneticisi de veri düzleminde okuyamaz; **özel bypass yazılmaz** | F3 + spec "rejects PLATFORM_ROOT" |
| R9 `PLATFORM_ROOT` mevcut sözleşme | Ek istisna yok | spec |
| R10 Lokasyon başına ek kısıt yok | Tenant içi tüm RESOLVED lokasyonlar görünür (BOTC davranışı) — **bu bir karar değil varsayılan-koruma; `⟦Q-V18⟧` açık** | F5 |

Sistem yöneticisi notu: `isSystemAdmin` kullanıcısı `X-Tenant-Id` olarak **normal bir tenant** verirse
guard geçer ve `resolve()` o tenant için başarılı olur → o tenant'ın kapsamındaki veriyi görür. Bu, mevcut
platformun davranışıdır (yeni bypass değil) ve TASK-027.30'da açıkça belgelenmelidir; `PLATFORM_ROOT`
tenant'ı verirse 403 alır.

## 4. Servis sınırları (kavramsal; kod yok)

| Bileşen | Sorumluluk | Yapmaz |
|---|---|---|
| `ShiftReportController` | Guard zinciri (JWT → `TenantMembershipGuard` → `PermissionGuard`), DTO doğrulama, HTTP eşleme | İş kuralı, tenant çözümü |
| `ShiftReportService` | Use-case orkestrasyonu: scope al → mapping doğrula → lifecycle → repository → audit | Scope mekanizması icat etmez |
| Scope adapter (`ShiftReportScopeService` **gerekmez**; ince yardımcı) | `TenantScopeService.resolve()` sonucunu R1–R6 koşullarına çevirir (`tenantIds`, `canEnterData`) | Yeni scope hesaplamaz, closure'a doğrudan dokunmaz |
| Mapping resolver | Lokasyon → RESOLVED tenant (TASK-027.23 sözleşmesi) | Mapping yazmaz/onaylamaz; kaynağı `⟦Q-V21⟧` |
| Lifecycle politikası | `DRAFT→COMPLETED` geçiş kuralı; `COMPLETED` güncelleme `⟦Q-V09⟧` | `LOCKED/FAILED/ARCHIVED` uygulamaz (`⟦Q-V04⟧`) |
| Repository | Yalnızca `tenantIds`+`RESOLVED` koşullu sorgu; şema hedefi `⟦Q-V11⟧` | Filtresiz sorgu sunmaz |
| Idempotency/checksum | Etkileşimli create: `clientRequestId` `⟦Q-V23⟧`; import: `(legacySourceSystem, legacySourceTable, legacyId)`+`sourceChecksum` (TASK-027.26) | Sessiz overwrite yapmaz |
| Audit çağrısı | `PlatformAuditService.log()` | Rapor notu/PII yazmaz |

## 5. Lifecycle

| Durum | Kaynak | Kontrat |
|---|---|---|
| `DRAFT` | `IsCompleted=false` (kanıtlı) | Oluşturma sonrası varsayılan; güncellenebilir |
| `COMPLETED` | `IsCompleted=true` (kanıtlı) | `complete` ile; sonraki güncelleme `⟦Q-V09⟧` |
| `LOCKED` | kaynakta yok | **Uygulanmaz** `⟦Q-V04/Q-V09⟧` |
| `FAILED` | kaynakta yok | **Uygulanmaz**; migration satır hatası ayrı kavram (migration raporu) — domain status'ü ile karıştırılmaz |
| `ARCHIVED` | ayrı arşiv DB | **Uygulanmaz**; TASK-027.26/27 |

## 6. Idempotency ve hata kontratı (durum matrisi)

| Durum | Sonuç | Kod | Not |
|---|---|---|---|
| Aynı `clientRequestId` + aynı içerik ile tekrar create | Mevcut kayıt döner, yeni satır yok, audit tekrarlanmaz | 200 | `⟦Q-V23⟧` |
| Aynı `clientRequestId`, farklı içerik | Reddedilir | 409 `SHIFT_DUPLICATE_REQUEST` | Sessiz overwrite yok |
| Import: aynı legacy anahtar + aynı checksum | NOOP | — (servis sonucu `NOOP`) | TASK-027.26; API yüzeyi değil |
| Import: aynı anahtar + farklı checksum | `CONFLICT_SOURCE_CHANGED`, yazılmaz | — | TASK-027.23 §9 |
| Tenant mapping conflict | Erişim yok, create 409 | 409 `SHIFT_MAPPING_CONFLICT` | R3 |
| Unresolved/Pending tenant | Create 409; liste/detay görmez | 409 / 404 | `SHIFT_LOCATION_UNRESOLVED` |
| Eksik operatör mapping (`operatorUserId` NULL) | **Etkileşimli create'te oluşamaz** (oturumdan gelir); import'ta NULL kabul + rapor | — | `⟦Q-V15⟧` snapshot |
| Geçersiz `locationCode` | Reddedilir | 400 `SHIFT_INVALID_LOCATION` | değer kümesi `⟦Q-V14⟧` |
| Yetkisiz tenant (üyelik/kapsam dışı) | Reddedilir | 403 | Guard + `resolve()` |
| `canEnterData=false` | Yazma reddedilir | 403 `SHIFT_TENANT_READ_ONLY` | R6 |
| `COMPLETED` rapora güncelleme | **Kontrat kesinleştirmez** | öneri 409 | `⟦Q-V09⟧` |
| Beklenmeyen DB/servis hatası | İç ayrıntı sızdırılmaz | 500 genel gövde | Audit hatası politikası `⟦Q-V24⟧` |

## 7. Audit tasarımı (`PlatformAuditLogInput` ile)

| Alan | Değer |
|---|---|
| `actorId` | oturum kullanıcısı |
| `entityType` | `SHIFT_REPORT` (öneri) |
| `entityId` | rapor `id` |
| `actionCode` | `SHIFT_REPORT_CREATED`, `SHIFT_REPORT_UPDATED`, `SHIFT_REPORT_COMPLETED` (öneri; audit kodu ≠ permission kodu, catalogue'a girmez) |
| `summary` | kısa sabit metin (ör. "Vardiya raporu oluşturuldu") — **rapor notu içermez** |
| `metadata` | `{ tenantId, locationCode, fromStatus?, toStatus?, changedFields?: string[] }` — `platform_audit_logs`'un tenant kolonu **yok** (**Q-V12** korunur), bu yüzden `tenantId` `metadata` içinde; `scrubSecrets` uygulanır |
| Yazılmaz | `notes`, `secondOperatorName`, parola/secret/token, e-posta, gereksiz kişisel veri |
| Hata politikası | `log()` tablo yoksa sessiz atlar, aksi hâlde fırlatır → işlem transaction'ı ile birlikte mi, best-effort mi `⟦Q-V24⟧` |

## 8. Karar kapılarının kontrata etkisi

Bkz. `METNEX_SHIFT_REPORT_API_SERVICE_BLOCKER.md` (her soru: etki, seçenekler, varsayım riski, gerekli karar,
karar sonrası dosya listesi). Kontrat, kapıları **kapatmaz**; yalnızca hangi noktada durduğunu gösterir.

## 9. Teyit
`apps/` altında dosya eklenmedi/değiştirilmedi; Drizzle schema/migration/seed, permission catalogue kodu,
tenant/mapping tablosu, gerçek DB/veri, UI, email, archive migration, Docker, git commit/push yok. Yeni permission,
tenant, slug, lokasyon uydurulmadı. Q-V07/V08/V11/V16/V18/V19/V20/V21/V22 kapatılmadı.
