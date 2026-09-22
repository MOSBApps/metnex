---
id: TASK-027.40-R1
title: MFA Admin Reset Authorization Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

# TASK-027.40-R1: MFA Admin Reset Authorization Boundary

Parent: TASK-027.40 (status `review` kalır). Kaynak: Q-DP22 (kritik authorization açığı).

## AI2 Teslim Raporu (2026-09-21)

### Sorun (koddan doğrulandı)
`POST /api/v1/auth/mfa/admin/:userId/reset` yalnızca `AuthGuard('jwt')` ile korunuyordu: controller'da `@RequirePermission`/`isSystemAdmin`/tenant-scope yoktu, `MfaService.adminResetMfa` yetki denetlemiyordu, global `APP_GUARD` yok. Sonuç: oturum açmış herhangi bir kullanıcı başka birinin MFA'sını (secret + recovery code'lar) silebilirdi.

### Düzeltme (fail-closed, iki bağımsız katman)
1. **Controller** (`mfa.controller.ts`): `adminReset` — `request.user.isSystemAdmin` değilse 403 (`Bu endpoint yalnızca sistem yöneticilerine açıktır`), servis çağrısından ve girdi doğrulamasından **önce** (yetkisiz çağıran biçim oracle'ı alamaz).
2. **Servis** (`mfa.service.ts` → `adminResetMfa`): controller'dan bağımsız ikinci kontrol. Actor `users` tablosundan **yeniden okunur**; `ACTIVE` **ve** `isSystemAdmin` değilse 403 (`Bu işlem için yetkiniz bulunmuyor`). Böylece bayat/sahte bir claim, controller dışından bir çağrı veya yetkisi sonradan alınmış bir admin yetki veremez. Ardından hedef id biçimi (400) ve hedefin varlığı (404) doğrulanır; **yalnızca bundan sonra** `disableInternal` (MFA yazımı) ve audit çalışır. Geçersiz actor id'si DB'ye hiç gitmeden reddedilir.
- **Permission kararı:** izin kataloğunda (`BUILTIN_PERMISSIONS`) MFA'ya özgü kod yok ve yeni kod **uydurulmadı**. En yakın `PLATFORM:USER:UPDATE` genel bir izin (parola sıfırlama/impersonation da onun altında) ve MFA reset'e uygunluğu bir yetki-modeli kararı → **geçici kural: yalnızca `isSystemAdmin`** (Q-DP22a).
- **Tenant admin / normal kullanıcı reset yapamaz** (testli). **Tenant/root kapsamı:** endpoint yalnızca sistem yöneticisine açık olduğundan tenant kapsamlı bir çağıran kalmadı; system admin platform geneli yetkilidir (hedef başka tenant/root'ta olabilir — testle belgelendi). Tenant-kapsamlı yetki (ör. müşteri yöneticisinin kendi root'undaki kullanıcıyı resetlemesi) ayrı yetki-modeli kararıdır, uydurulmadı.
- **Audit:** yetkisiz istekte MFA yazımı **ve audit yok**; başarılı reset'te `MFA_ADMIN_RESET` kaydı `actorId` (yönetici) + `entityId`/`metadata.targetUserId` (hedef) ile korunur, metadata yalnızca `targetUserId` içerir — secret/OTP/recovery/token/parola yok (testli). Mesajlar statik.
- Diğer MFA uçları (`verifySetup`, `disableTotp`, `regenerateRecoveryCodes`) yalnızca çağıranın kendi hesabında çalışmaya devam eder (statik testli); MFA iş mantığı değişmedi.

### Policy uçları — ayrı rapor (DEĞİŞTİRİLMEDİ)
`GET/PATCH auth/mfa/policy` route'unda `:tenantId` yok → `tenantId` daima `undefined` → uçlar sabit `{ mfaRequired: false }` döner (200, no-op), `setTenantPolicy` erişilemez. Seçenekler: **(A)** olduğu gibi bırak (zararsız ölü uç; ama 200 döndüğü için yanıltıcı), **(B)** route'u `policy/:tenantId` yapıp erişilebilir kıl — bu durumda **önce** yetki modeli gerekir (yalnızca sistem yöneticisi mi, o root'un TENANT_ADMIN'i mi; tenant kapsamı doğrulaması; `tenantSecuritySettings` yazımı) ve `MfaRequirementService` bu ayarı tükettiği için **login davranışını değiştirir** (PO kararı), **(C)** kaldır. **Öneri: (B), ayrı bir görevde, yetki tasarımı kararından sonra;** o zamana kadar (A). Bugünkü haliyle uç bir yazma yapmadığından ek risk yaratmıyor, yetkisiz olduğu için erişilebilir hâle getirilirse aynı açığı yeniden doğurur (Q-DP22b).

### Kalan riskler / öneriler (AI1)
- **Geçmiş kötüye kullanım:** açık nedeniyle, gerçek ortamlarda audit'te `MFA_ADMIN_RESET` kayıtları actor'ları `isSystemAdmin` olmayan kullanıcılar için gözden geçirilmeli (bu task'ta DB'ye bağlanılmadı; denetim yapılmadı).
- Admin reset'in `mfaVerified` (MFA ile doğrulanmış oturum) gerektirmediği, sistem yöneticisinin **kendi** MFA'sını da resetleyebildiği ve impersonation oturumunda `request.user`'ın hedef kullanıcı olduğu (o hedef sysadmin ise yetki geçer) not edilir; bu task'ta değiştirilmedi (Q-DP22c).
- Benzer "yalnızca kimlik doğrulaması" desenli başka uç olup olmadığı sistematik bir tarama gerektirir (bu task yalnızca MFA'yı kapsadı).

### Testler / doğrulama
`apps/api/src/platform/mfa-admin-reset-authorization.spec.ts` (yeni, **25 test**): normal kullanıcı/tenant admin/`isSystemAdmin` alanı olmayan kullanıcı → 403 ve **hiç DB erişimi yok**; yetki reddi girdi doğrulamasından önce; servis tek başına çağrıldığında normal/tenant admin/INACTIVE/LOCKED/yok actor → 403, tek sorgu, **yazma ve audit yok**; bozuk actor id DB'siz reddedilir; bayat controller claim'i DB tarafından reddedilir; bilinmeyen hedef 404, bozuk hedef 400 (yazma/audit yok); yetkili sistem yöneticisi için mevcut davranış (settings temizlenir, recovery kodları silinir, `MFA_ADMIN_RESET` audit'i actor+target ile), başka tenant/root hedefi kabul; audit'te secret/OTP alanı yok; statik: `AuthGuard('jwt')` korunur, yetki kontrolü servis çağrısından/yazımdan/audit'ten önce, izin kataloğunda MFA kodu yok ve TENANT_ADMIN/PLATFORM_ROOT kısayolu yok. Önceki `mfa-settings-perf-validation.spec.ts` adminReset testleri sistem yöneticisi aktörüyle güncellendi.
**Mutasyon kontrolü:** controller kontrolü kaldırılınca 6, servis kontrolü kaldırılınca 11 test kırıldı; geri alındı.
**`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **45 suite / 1265 test** (önceki 44/1240), web 8 dosya / 117 test. **Q-ENV01 workaround (açık):** yalnızca bu çalıştırma için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı.
Gerçek HTTP/DB/MFA sağlayıcısı/Docker kullanılmadı; davranış mock'lu birim testlerle kanıtlandı.

### Durum
Q-DP22 kod düzeyinde giderildi (kapanış AI1'de; 22a permission modeli, 22b policy uçları, 22c oturum/self-reset ayrıntıları açık karar). TASK-027.40 ve bu R1 kaydı `status: done`.

## AI1 Onayı (2026-09-21)

R1 kabul edildi ve `done` olarak kapatıldı. MFA admin reset artık controller ve
service katmanında iki bağımsız fail-closed authorization kontrolüne sahip;
yalnızca ACTIVE system admin erişebilir. Yetkisiz çağrıda hedef doğrulama,
MFA yazımı ve audit çalışmıyor. Q-DP22a kod düzeyinde giderildi.

Q-DP22b (ölü policy route'larının akıbeti), Q-DP22c (mfaVerified, self-reset,
impersonation) ve gerçek ortamda geçmiş `MFA_ADMIN_RESET` audit incelemesi açık
kaldı. Gerçek HTTP/DB/MFA provider doğrulaması yapılmadı.
