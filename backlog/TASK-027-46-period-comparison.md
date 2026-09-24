---
id: TASK-027.46
title: Role Assignment Privilege Ceiling ve Global TENANT_ADMIN Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-22
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te "Period comparison" Wave 5 placeholder'ıydı (`TASK-027-46-period-comparison.md`). AI1'in talimatıyla kapsam **Q-DP24 privilege enforcement (role assignment privilege ceiling + global `TENANT_ADMIN` sınırı + impersonation reddi)** olarak yeniden tanımlandı; period comparison işi **yapılmadı**. Talimattaki teslim dosyası adı (`TASK-027-46-role-assignment-privilege-ceiling.md`) ile mevcut placeholder dosya adı farklı olduğu için placeholder içeriği bu dosyanın altına, orijinal kayıt olarak taşındı; ikinci bir dosya açılmadı.

## AI1 Onay Kaydı (2026-09-22)

Privilege ceiling, yeni global `TENANT_ADMIN` atamasının fail-closed reddi ve impersonation privilege sınırı kabul edildi. Mevcut global atamaların otomatik silinmemesi doğru uygulamadır. TASK-027.46 `done` olarak onaylandı. Eş sistem yöneticisi kısıtı, rotasyon/break-glass, MFA ve tenant-role delegation sonraki tasklara bırakıldı; period comparison placeholder'ı yapılmadı.

## AI2 Teslim Raporu (2026-09-22)

### Kapsam ve önceki kararlarla ilişki
Bu task Q-DP24 kapanışının (TASK-027.44) ve salt-okunur temelin (TASK-027.45: canonical kaynak, drift raporu, invariant) üzerine **enforcement** ekler:
- Yeni global (`tenantId = null`) `TENANT_ADMIN` ataması reddedilir (mevcut atamalar **dokunulmadan** kalır, revoke edilebilir durumda).
- Actor kendi etkin izin kümesinden yüksek bir rol veremez ("privilege ceiling").
- Impersonation oturumu; rol verme/kaldırma, parola değiştirme, MFA admin reset, deaktivasyon, üyelik ekleme/kaldırma işlemlerini yapamaz.
- Eş sistem yöneticisi kısıtı **kasıtlı olarak** bu task'ta yok (TASK-027.47); MFA enforcement yok (TASK-027.48); tenant-role delegation yüzeyi açılmadı (TASK-027.49); yeni permission/rol eklenmedi.

### Değişen/yeni dosyalar
- **Yeni:** `apps/api/src/platform/domain/privilege-ceiling.domain.ts` — saf domain modeli. `resolveActorEffective`, `resolveGrantEffective`, `isWithinCeiling`, `evaluateRoleGrantCeiling`, `permits` (gerçek `PermissionGuard`'ın **aynı semantiğiyle**: `isSystemAdmin` bayrağı = her şey; `PLATFORM:*` yalnızca global atamalardan; tenant kapsamında yalnızca `TENANT_ADMIN` — ve yalnızca kendi **root**'unda — "PLATFORM dışı her şey" verir, diğer roller tenant kapsamında **inert**). Statik sabitler: `PRIVILEGE_DENIAL` (üç kod: `PRIVILEGE_CHANGE_DENIED`, `IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN`, `GLOBAL_TENANT_ADMIN_FORBIDDEN`).
- **Değişen (öz):** `apps/api/src/platform/user.service.ts` — `assertMayAdminister` yerine ayrıştırılmış adımlar: `requirePrivilegeActor` (impersonation reddi + actor'ın DB'den yeniden okunması + ACTIVE kontrolü), `assertTargetRules` (F4: sistem yöneticisi hedef, global rol değişikliği — TASK-027.42'den değişmedi), `assertWithinPrivilegeCeiling` (yeni: actor sistem yöneticisi değilse ceiling hesaplanır ve uygulanır). `assignRole`: `TENANT_ADMIN` + tenantId yoksa **DB'ye dokunmadan** reddedilir; tenant scope önce çözülür (bilinmeyen tenant artık FK hatası yerine 404); ceiling en son (role/tenant çözüldükten, `SYSTEM_ADMIN`+tenantId kontrolünden sonra, DB yazımından önce) uygulanır.
- **Değişen:** `apps/api/src/platform/user.controller.ts`, `saas.controller.ts` — `sessionContext(user)` yardımcı fonksiyonu artık `impersonatorUserId` yanında `impersonation` bayrağını da taşır.
- **Değişen:** `apps/api/src/platform/mfa.controller.ts`, `mfa.service.ts` — `adminResetMfa` çağrısına impersonation bağlamı eklendi; servis, herhangi bir DB okumasından **önce** impersonation oturumunu reddeder (best-effort `DENIED` audit + statik kod).
- **Değişen:** `apps/api/src/platform/saas.service.ts` — `setCustomerUserPassword` ve `addCustomerUserMembership`'e `assertNotImpersonated` (scope/target lookup'tan önce, statik kod, best-effort audit).
- **Yeni test:** `apps/api/src/platform/role-assignment-privilege-ceiling.spec.ts` (44 test) — ceiling modeli, gerçek `PermissionGuard` ile **parite testi**, servis entegrasyonu, fail-closed senaryolar, sıra/audit/determinizm, MFA impersonation.
- **Uyarlanan mevcut testler:** `platform-user-admin-privilege-boundary.spec.ts` (yeni check sırasına göre select kuyruğu düzeltildi; impersonation blokları eklendi — 44 test), `customer-admin-authorization-remediation.spec.ts` (impersonation testleri eklendi), `mfa-admin-reset-authorization.spec.ts`, `mfa-settings-perf-validation.spec.ts`, `privilege-model-evidence.spec.ts` (yardımcı fonksiyon adları güncellendi).

### Privilege ceiling — nasıl hesaplandı
`PermissionGuard`'ın gerçek SQL/mantık kalıbı birebir kopyalanmadan **aynı karar tablosu** saf fonksiyonlara taşındı:
- Actor'ın etkin izinleri: global atamalardaki rollerin `rolePermissions`'ından `PLATFORM:*` kodları + `TENANT_ADMIN` global atamasıysa (mevcut, silinmeyen) onun tuttuğu roller de aynı mantıkla + tenant kapsamındaki `TENANT_ADMIN` atamalarının **kendi root'u** olduğu tenant kümesi.
- Yeni rolün (hedefin) etkin izinleri: aynı fonksiyonla, atanacağı kapsam (`global` ya da belirli `tenant`) için hesaplanır. `SYSTEM_ADMIN` global atanırsa "her şey"; diğer roller global atanırsa yalnızca `PLATFORM:*` alt kümesi; `TENANT_ADMIN` yalnızca `ROOT`/`PLATFORM_ROOT` tipli bir tenant'ta (kendi root'u) anlamlıdır, `STANDARD` altta **inert**.
- Karşılaştırma: `targetEffective ⊆ actorEffective` (küme alt kümesi). Actor sistem yöneticisiyse (`isSystemAdmin`) her zaman geçer.
- Bilinmeyen izin kodu (`BUILTIN_PERMISSIONS` kataloğunda yoksa) veya bilinmeyen/geçersiz tenant tipi **fail-closed** reddedilir (`UNKNOWN_PERMISSION` / `UNKNOWN_SCOPE`).
- **Parite kanıtı:** `role-assignment-privilege-ceiling.spec.ts` içindeki "parity: the model agrees with the REAL PermissionGuard" bloğu, gerçek `PermissionGuard.canActivate`'i sahte bir DB ile 9 senaryo × 5 izin × 5 header tenant = **225 kombinasyonda** modelin `permits()` fonksiyonuyla karşılaştırır; hepsi eşleşir.

### Global `TENANT_ADMIN` sınırı — davranış
- `assignRole` içinde `role.name === 'TENANT_ADMIN' && !dto.tenantId` → **DB'ye hiç dokunmadan** (henüz `SELECT` yapılmamış rol/tenant/var olan atama sorgusu yok) `403 GLOBAL_TENANT_ADMIN_FORBIDDEN` — actor sistem yöneticisi olsa bile.
- Mevcut global `TENANT_ADMIN` atamaları **hiçbir kod yolunda** otomatik silinmez/değiştirilmez; `revokeRole` üzerinden **açıkça** talep edilirse (ve mevcut kurallar — son SYSTEM_ADMIN değil, target rules — izin verirse) geri alınabilir durumda bırakıldı.
- TASK-027.45'in salt-okunur raporu (`privilege-report.domain.ts`) bu task'ta **değişmedi**; mevcut global `TENANT_ADMIN` atamaları hâlâ `GLOBAL_TENANT_ADMIN` drift kategorisinde görünmeye devam ediyor (test: "the read-only privilege report of TASK-027.45 is untouched").

### Impersonation sınırı — davranış
- `UserService`'te yedi işlemin **altısı** (`update` hariç — yalnızca görünen ad değişikliği, kredensiyel/yetki değişikliği değil) impersonation oturumunda **hiçbir DB okuması yapılmadan** reddedilir; `update` impersonation'da çalışmaya devam eder (audit'te impersonator kaydıyla).
- `MfaService.adminResetMfa` ve `SaasService.setCustomerUserPassword` / `addCustomerUserMembership`, impersonation bayrağını/impersonator id'sini **ilk adımda** kontrol eder; scope/target sorgusu hiç çalışmaz.
- Reddetme: statik kod (`IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN`), hedef veya credential hakkında bilgi sızdırmaz (mesaj testlerle doğrulandı); best-effort `DENIED` audit (audit kesintisi reddi bozmaz — testli).
- `impersonation: true` veya `impersonatorUserId` alanlarından **yalnızca biri** set edilse bile fail-closed reddedilir.

### Yetki kontrolü sırası (talimattaki 10 adım)
1. Route permission guard (`PermissionGuard`, değişmedi) → 2. Saf input/ID doğrulaması (`validateAssignRole`, `validateId`, vb., değişmedi) → 3. Impersonation kontrolü (`requirePrivilegeActor` girişinde) → 4. Actor DB'den yeniden okunur → 5. Actor ACTIVE kontrolü → 6. Hedef/rol/scope çözümlemesi (kullanıcı, rol, tenant `SELECT`'leri; bilinmeyenler 404) → 7. `assertTargetRules` (sistem yöneticisi hedef / global rol) + global `TENANT_ADMIN` sınırı + `assertWithinPrivilegeCeiling` → 8. Parola doğrulaması (yalnızca `setPassword` — mevcut sırayla, hash'ten önce) → 9. DB mutasyonu → 10. Zorunlu başarı audit'i. Statik testlerle (`authorisation precedes every hash, mutation and success audit`) doğrulandı.

### Testler
- **Yeni:** `role-assignment-privilege-ceiling.spec.ts`, **44 test**: saf model (etkin izin hesaplama, tenant scope kuralları, bilinmeyen izin/scope fail-closed, alt küme karşılaştırma, determinizm), **PermissionGuard parite testi** (225 kombinasyon), global `TENANT_ADMIN` sınırı (normal actor ve sistem yöneticisi için reddedilir; mevcut atama silinmez, revoke edilebilir; tenant-kapsamlı `TENANT_ADMIN` hâlâ atanabilir; hiçbir kod yolu mevcut atamayı silmiyor — statik test), privilege ceiling (aynı root'un `TENANT_ADMIN`'i kendi root'una atar; başka root/inert atama reddedilir; inert roller serbest; `SYSTEM_ADMIN` non-admin'e asla; sistem yöneticisi için ceiling atlanır), fail-closed (bilinmeyen rol → 404, bilinmeyen tenant → 404, bilinmeyen tip → `UNKNOWN_SCOPE`, bilinmeyen izin kodu → `UNKNOWN_PERMISSION`), sıra/audit/determinizm (saf doğrulama önce, impersonation DB'siz reddeder, yetkisiz actor tek okuma sonrası jenerik ret — hedef/rol hakkında oracle yok, başarı audit'i zorunlu ve yutulmaz, ret audit'i best-effort, yanıt/audit'te credential yok, tekrarlanan girdi aynı kararı verir), MFA admin reset impersonation reddi, kapsam dışı davranışların (eş yönetici kısıtı, MFA enforcement, tenant-role delegation, yeni permission/route) **eklenmediğinin** statik kanıtı.
- **Uyarlanan:** `platform-user-admin-privilege-boundary.spec.ts` (44 test, yeni check sırasına göre select kuyrukları düzeltildi + 12 yeni impersonation testi), `customer-admin-authorization-remediation.spec.ts` (+8 impersonation testi), `mfa-admin-reset-authorization.spec.ts`, `mfa-settings-perf-validation.spec.ts`, `privilege-model-evidence.spec.ts`.
- **Mutasyon kontrolleri (üçü de geri alındı):**
  1. `assignRole` içindeki global `TENANT_ADMIN` reddi kapatıldı → 3 test kırıldı.
  2. `UserService.requirePrivilegeActor`'daki impersonation reddi kapatıldı → 10 test kırıldı.
  3. `MfaService.adminResetMfa`'daki impersonation reddi kapatıldı → 2 test kırıldı.
- **Doğrulama komutları (talimattaki üçü, sırasıyla):**
  - `pnpm --filter api exec tsc --noEmit` → **temiz** (exit 0).
  - `pnpm --filter api exec jest platform --runInBand` → **15 suite / 862 test PASS**.
  - `./scripts/check.sh --skip-docker` → **PASS (exit 0)**: API **52 suite / 1454 test** (önceki 51/1396), web 8 dosya / 117 test.
  - İlk `check.sh` koşusu, spec'imdeki gerçek bir lint hatası yakaladı (kullanılmayan `PASSWORD` sabiti); düzeltip yeniden çalıştırdım.
- **Q-ENV01 workaround (açık, değişmedi):** yalnızca bu `check.sh` çalıştırması için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, hiçbir kontrol atlanmadı.
- **Gerçek DB/HTTP/MFA sağlayıcısı kullanılmadı.** Tüm testler mock/fixture'dır; testlerdeki credential değerleri (`'Aa1-Placeholder-Pass'`, `'new-hash-placeholder'` vb.) uydurma yer tutuculardır.

### Kalan riskler ve TASK-027.47 bağımlılığı (açıkça)
- **Eş sistem yöneticisi kısıtı bilerek uygulanmadı** (madde 6): bugün hâlâ bir sistem yöneticisi başka bir sistem yöneticisini (parola, deaktivasyon, rol) yönetebiliyor — TASK-027.44 kapanış teyidi gereği bu, **parola rotasyonu veya onaylı break-glass yolu** olmadan production'da zorunlu kılınmayacak (§14.6). Bu task o teyidi bozmaz; mevcut davranış **korunmuştur** (statik test: "peer system administrators are still NOT restricted here").
- **Privilege ceiling'in pratik etkisi düşük olabilir:** bugün `PLATFORM:USER:ASSIGN_ROLE`/`PLATFORM:USER:REVOKE_ROLE` yalnızca `SYSTEM_ADMIN` yerleşik rolünde bulunduğundan (kanıt: TASK-027.43 §2 E5), `assignRole`/`revokeRole` route'una gerçek ortamda erişebilen **her actor bugün zaten sistem yöneticisidir** ve ceiling'i atlar (`actor.isSystemAdmin` → "her şey"). Ceiling, **özel bir rol** `ASSIGN_ROLE` izniyle oluşturulup sistem yöneticisi olmayan birine verilirse devreye girer — bugün bu senaryo `[DOĞRULANAMADI]` (gerçek ortam verisi kontrol edilmedi, TASK-027.45 sınırı aynen geçerli).
- **Tenant-kapsamlı `TENANT_ADMIN` atamasında ceiling'in gerçek dünya etkisi:** bir `TENANT_ADMIN` (root A) kendi root'una başka `TENANT_ADMIN` atayabilir (kendi seviyesinde); farklı bir root'a veya global olarak atayamaz. Bu, ürün akışlarını (müşteri yöneticisinin kendi ekibine yetki devri) kısıtlamaz ama henüz `[DOĞRULANAMADI]` — customer-admin yüzeyinde böyle bir UI/endpoint bugün **yok** (Q-DP24 kararı 8 / TASK-027.49).
- **`SYSTEM_ADMIN`+`tenantId` kombinasyonu** hâlâ ayrı, değişmemiş bir `BadRequestException` ile reddediliyor (`'SYSTEM_ADMIN rolü sadece global olarak atanabilir'`) — bu task'ın yeni `GLOBAL_TENANT_ADMIN_FORBIDDEN`/ceiling kodlarıyla karışmaz, sıra: önce global `TENANT_ADMIN` reddi, sonra bu, sonra ceiling.
- **Audit boşlukları (F6) bu task'ın kapsamı dışında** kaldı: `saas.service.ts`'teki diğer mutasyonlar (paket, tenant, provisioning) hâlâ audit'siz; yalnızca bu task'ın dokunduğu iki metot (`setCustomerUserPassword`, `addCustomerUserMembership`) zaten TASK-027.41-R1'den audit'liydi.
- **Sıradaki bağımlılık: TASK-027.47** — eş sistem yöneticisi yönetim kuralı, kimlik bilgisi rotasyon yolu ve break-glass/rollback prosedürü **birlikte** ele alınacak (Q-DP24 kapanış teyidi §14.6). O zamana kadar mevcut eş-yönetim davranışı bilerek korunuyor.
- Açık kalan diğer: TASK-027.48 (MFA enforcement), TASK-027.54 (tenant-role delegation), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi.

### Yapılmayanlar (talimat gereği kapsam dışı, teyit)
Eş sistem yöneticisi yönetim kuralı, self-servis parola değiştirme, break-glass implementasyonu, MFA enforcement/geçişi, tenant-role delegation, yeni permission catalogue kodu, mevcut global `TENANT_ADMIN` verisinin otomatik temizlenmesi, F6'nın tüm audit kapsamı, Wave 2/3, gerçek production verisi, Docker build/run, git commit/push — **hiçbiri yapılmadı.**

`status: review` — nihai `done` AI1'de.

---

# TASK-027.46: Period comparison

## Amaç

Ana ve karşılaştırma dönemlerini normalize ederek karşılaştır.

## Wave ve bağımlılık

TASK-027.37; TASK-027.40

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
