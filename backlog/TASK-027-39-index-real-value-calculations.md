---
id: TASK-027.39
title: Platform DTO Validation Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te "Index real value calculations" Wave 5 placeholder'ıydı (`TASK-027-39-index-real-value-calculations.md`). AI1 talimatıyla kapsam **Platform DTO Validation Boundary (Q-DP20)** olarak yeniden tanımlandı; index hesaplamaları **yapılmadı**. Talimattaki dosya adı mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI2 Teslim Raporu (2026-09-21)

### Yaklaşım
Yeni framework/dependency/global pipe **eklenmedi**. Mevcut `domain/*` desenine uygun tek saf modül: `apps/api/src/platform/domain/platform-input.domain.ts` (yalnızca `auth.domain`, `system-role.domain`, `user.domain` import eder; DB/log/audit/env yok). Her validator `{ valid, errors[] }` döner; mesajlar **statik** (girdi değeri/parola/hash hiçbir zaman mesaja girmez); nesne/dizi/NoSQL-operatörü (`{ $ne: null }`)/yanlış primitive tür reddedilir; bilinmeyen ekstra anahtarlar **okunmaz** (servisler yalnızca adlandırılmış alanları kullanır; `isSystemAdmin`/`type`/`status` gövdeden alınamaz — testli). Servis giriş noktalarında doğrulama **ilk satır**: DB sorgusu, scope/permission-servis çağrısı, transaction, hash ve audit'ten önce. Route izinleri (`@RequirePermission`) ve tenant scope kontrolleri **değişmedi**; yeni `isSystemAdmin`/`PLATFORM_ROOT`/`TENANT_ADMIN` bypass'ı yok.

### Kapsanan DTO/endpoint'ler (koddan çıkarıldı)
| Giriş | Kural özeti |
|---|---|
| `createPackage` | code: string, trim+upper, **yalnızca min 2** (mevcut servis davranışı; **format/üst sınır YOK** — R1); name: string, trim, **yalnızca min 2** (mevcut davranış; üst sınır YOK — R2); description: opsiyonel string, **üst sınır YOK** — R2; 4 limit: number, tam sayı, 0…2147483647 (DB `integer`) |
| `CustomerAdminCreateTenantDto` | name 2–100; slug opsiyonel string ≤100 ve normalize edilince boş olmamalı; `parentTenantId` id; `canEnterData/canAggregateChildren` yalnızca boolean; ad+slug ikisi de slug üretemiyorsa 400 (DB öncesi) |
| `CustomerAdminCreateUserDto` | email string ≤254 + `isValidEmail`; displayName 2–100; password **canonical `validatePasswordStrength`**; `tenantId` id |
| `AddMembershipDto` + `:id` param | `tenantId` zorunlu id; `targetUserId` id |
| Customer/platform user update (`displayName`) | opsiyonel string 2–100; gövde nesne olmalı; `:id` id |
| Customer/platform `set-password` | password canonical politika; `:id` id |
| Platform `CreateUserDto` | email/displayName/password (canonical) |
| `AssignRoleDto`, user `addMembership` | `roleId` zorunlu id; `tenantId` opsiyonel/`null` id; `SYSTEM_ADMIN` global-only kuralı serviste korunur |
| `CreateTenantDto` (generic) | ROOT sınırı **önce** (parentless → `ROOT_PROVISIONING_REQUIRED`, değişmedi); sonra tür/uzunluk/id/boolean; `type` okunmaz |
| `UpdateTenantDto`, `AddMemberDto` | name 2–100; `packageId` string\|null id; `userId` id; `:id` id |
| `CreateRoleDto`, `AssignPermissionDto` | tür korumaları + mevcut `validateRoleCreation`; `permissionCode` format `^[A-Z][A-Z0-9_]*(:[A-Z][A-Z0-9_]*){1,4}$` ≤100 (katalog varlığı DB'de 404 olarak korunur) |
| `SetActiveTenantDto` (`me`) | id doğrulaması, servisten önce |
| Login/Bootstrap gövdeleri | yalnızca tür/uzunluk koruması (email ≤254, parola ≤1024 login; bootstrap alanları string); kimlik doğrulama/politika mantığı ve mevcut statik hata kodları AuthService/BootstrapService'te aynen |
| Tenant/User list query | `q` string ≤100 (dizi `?q=a&q=b` artık 500 değil 400), `status` enum, `isSystemAdmin` `'true'\|'false'` |

`ProvisionCustomerDto` TASK-027.38'de yapıldı, dokunulmadı.

### Davranış korunumu (web isteklerine karşı kontrol edildi)
Web'in gönderdikleri (`tenantId: null`, boş `status`, serbest metin slug, `description: undefined`, paket limitleri number) kabul edilir. Serbest metin slug'lar servis tarafında normalize edildiği için **katı slug regex'i uygulanmadı** (aksi halde mevcut UX kırılırdı); yalnızca "normalize edilince boş olmamalı" denetlenir. Doğrulama artık scope kontrolünden önce çalıştığından **geçersiz girdide scope-dışı çağıran 403/404 yerine 400 alabilir** (izin guard'ı yine önce çalışır; bilgi sızdıran bir değer dönmez).

### Testler
`apps/api/src/platform/platform-dto-validation.spec.ts` (yeni, **278 test**): her DTO için eksik alan, boş/whitespace, yanlış primitive, dizi/nesne/NoSQL operatörü, uzunluk sınırı, geçersiz format/enum/id, geçersiz gövde (`null`, `undefined`, string, sayı, dizi) — hepsinde **hiç select/insert/update/delete/transaction/hash/audit/scope-servisi/kapanış/provizyon çağrısı olmadığı** doğrulanır; controller giriş noktaları (`setActiveTenant`, `login`, `bootstrap`) servisi çağırmadan reddeder; hata gövdesinde girdi/parola/hash/şema/DB ifadesi yok; geçerli girdide mevcut davranış (paket ekleme, kullanıcı oluşturma+audit'te parola yok, rol/izin akışı, scope reddi → yazma yok, yabancı tenant → 404 + yazma yok); generic ROOT yolu fail-closed; `isSystemAdmin/type/status` gövdeden okunmaz. Statik testler: global ValidationPipe/`useGlobalPipes`/`APP_PIPE` yok ve yeni bağımlılık yok; validator saf (izinli import listesi sabit); 17 servis giriş noktasında doğrulama ilk DB/servis erişiminden önce; controller izin dekoratörleri yerinde; credential loglanmıyor.
**Mutasyon kontrolü:** `UserService.create` ve `createPackage` doğrulaması geçici kapatıldı → 20 test kırıldı; geri alındı (dosyalar doğrulandı).
**`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **43 suite / 996 test (R1 sonrası; ilk teslim 992)** (önceki 42/714), web 8 dosya / 117 test. İlk gate koşusu spec'imdeki gerçek bir lint hatasını (kullanılmayan değişken) yakaladı; düzeltildi.
**Q-ENV01 workaround (açık):** gate yalnızca bu çalıştırma için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose` ile koştu; repo/env dosyası değişmedi, kontrol atlanmadı, kalıcı çözüm yapılmadı.

### Bulgular / kapsam dışı kalanlar (AI1 kararı)
1. **MFA DTO'ları (`dto/mfa.dto.ts`) `class-validator` dekoratörleri taşıyor ama uygulamada hiçbir `ValidationPipe` kayıtlı değil (`main.ts`/`app.module.ts`) → dekoratörler fiilen uygulanmıyor** (kod uzunluğu, `@IsBoolean` vb.). Bu düz interface değil ve auth/MFA yüzeyi olduğundan değiştirilmedi. (Not: `class-validator`/`class-transformer` zaten bağımlılık; "yeni framework eklenmedi" ifadesi bu task'ın eklemediği anlamındadır.) → **yeni Q-DP21.**
2. `settings/*` (`UpsertPlatformGeneralDto` vb.) ve `perf/perf-admin.controller.ts` gövdeleri `platform/` dizini dışında; bu task'ın "aynı platform modülü" kapsamına alınmadı → Q-DP21.
3. ~~Paket kodu regex/uzunluk kuralı~~ — **R1'de kaldırıldı** (kanıtsızdı); paket kodu formatı/üst sınırı açık AI1/PO kararı olarak bırakıldı (Q-DP21d), o zamana kadar validator mevcut geçerli davranışı daraltmaz.
4. Yalnızca gövde/parametre girişleri kapsandı; yalnızca `:id` alan bazı uçlar (`revokeRole`, `removeMembership`, `suspend/archive`, `deactivate`, `impersonate`) ve `X-Tenant-Id` header'ı bu task'ta id-format doğrulamasına alınmadı.
5. Doğrulama mock'lu birim testlerle kanıtlandı; gerçek DB/HTTP uçtan uca ve tarayıcı denemesi yok.

### R1 düzeltmesi (TASK-027.39-R1)
AI1 geri bildirimi: `createPackage.code` için `^[A-Z0-9][A-Z0-9_-]*$` ve 2–50 kuralı koddan kanıtlanmamıştı (web yer tutucusundan türetilmişti) ve mevcut geçerli kodları sessizce reddedebilirdi. **Seçenek 1 + 2 uygulandı:** regex ve üst sınır **kaldırıldı**; validator yalnızca tür, trim ve servisin zaten zorunlu kıldığı min 2 karakteri denetler (kolon sınırsız `text`; DB'ye bağlanılmadı, mevcut paket verisi varsayılmadı). Format/uzunluk kararı açık AI1/PO kararıdır (Q-DP21d). Testler: geçersiz listesinden format/50+ senaryoları çıkarıldı; `PRO PLUS`, `pro.plus`, `Başlangıç-1`, `a_b/c`, 120 karakterlik ve boşluk-kenarlı kodların **hâlâ kabul edildiği** ve `trim().toUpperCase()` ile yazıldığı 6 yeni test eklendi. Diğer validation çalışmasına dokunulmadı. Aynı türden **kanıtsız üst sınırlar** ayrıca not edilir (değiştirilmedi): paket `name` ≤100 ve `description` ≤500 (tenant/user validator'larındaki 100 sınırından türetildi, paket için koddan kanıtlı değil) — AI1 isterse aynı R1 mantığıyla kaldırılır.
**R1 doğrulaması:** platform-dto-validation.spec **282 test PASS**; `./scripts/check.sh --skip-docker` PASS (exit 0): API 43 suite / **996 test**, web 8 dosya / 117 test; Q-ENV01 workaround'u (`NODE_PATH` + `TURBO_ENV_MODE=loose`) aynen, değiştirilmedi. Q-DP21 (MFA/settings/perf) açık.

### R2 düzeltmesi (TASK-027.39-R2)
AI1 geri bildirimi: paket `name` ≤100 ve `description` ≤500 sınırları koddan/DB'den kanıtlı değildi (tenant/user alanlarından türetilmişti). **Kaldırıldı:** `name` için yalnızca tür, trim ve `createPackage`'in mevcut min-2 davranışı; `description` için yalnızca tür (opsiyonel string). Üst sınır kararı açık AI1/PO kararıdır (Q-DP21). R1'deki paket-kodu düzeltmesine, diğer DTO validator'larına (tenant/user/role vb. 100 sınırları dahil) ve Q-DP21/Q-ENV01 durumuna dokunulmadı. Testler: `name` 101 karakter ve `description` 501 karakter senaryoları geçersiz listesinden çıkarıldı; 300 karakterlik ad, 5000 karakterlik açıklama ve boşluk-kenarlı 2 karakterlik adın **kabul edildiği** 3 test ile boş/1 karakter/string olmayan ad ve string olmayan açıklamanın **hâlâ reddedildiği** 1 test eklendi.
**R2 doğrulaması:** platform-dto-validation.spec **284 test PASS**; `./scripts/check.sh --skip-docker` PASS (exit 0): API 43 suite / **998 test**, web 8 dosya / 117 test; Q-ENV01 workaround'u (`NODE_PATH` + `TURBO_ENV_MODE=loose`) aynen. Gerçek DB/HTTP ve tarayıcı denemesi yok.

### Durum
Q-DP20 kod düzeyinde giderildi (kapanış AI1'de); Q-DP21 açıldı. Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill açık. Yapılmayanlar: `ProvisionCustomerDto`, Q-DP17 atomiklik, FAILED ROOT retry, data-plane, Vardiya, Q-ENV01 kalıcı çözüm, DB rol/RLS, backfill, Wave 2/3, Docker, git commit/push.
`status: done` — Platform DTO Validation Boundary teslimi ve R1/R2 düzeltmeleri AI1 tarafından onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.39 kabul edildi ve `done` olarak kapatıldı. Platform giriş sınırları
DB/hash/transaction/audit/scope çağrılarından önce saf validator'larla korunuyor;
invalid input fail-closed reddediliyor. Canonical parola politikası korunmuş,
credential sızıntısı test edilmiş ve yeni framework/dependency/global pipe
eklenmemiştir.

R1 ile package code için kanıtsız format/üst sınır kaldırıldı. R2 ile package
name/description için kanıtsız üst sınırlar kaldırıldı; yalnızca mevcut domain
davranışı korunuyor. Bu format ve üst sınır kararları Q-DP21d kapsamında açık
AI1/PO kararı olarak kaldı.

Q-DP20 kod düzeyinde kapandı. Q-DP21 (MFA/settings/perf validation ve package
format/limit kararları), Q-DP17, Q-DP04, Q-ENV01 ve dev ROOT backfill açık kaldı.
Gerçek DB/HTTP/tarayıcı doğrulaması yapılmadı.

---

# TASK-027.39: Index real value calculations

## Amaç

Endeks, gerçek değer, ilk/son değer hesaplarını uygula.

## Wave ve bağımlılık

TASK-027.37; TASK-027.38

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
