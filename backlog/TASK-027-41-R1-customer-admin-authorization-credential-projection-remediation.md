---
id: TASK-027.41-R1
title: Customer Admin Authorization ve Credential Projection Remediation
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

# TASK-027.41-R1: Customer Admin Authorization ve Credential Projection Remediation

## AI1 Onay Kaydı (2026-09-21)

F1 kritik hesap ele geçirme zinciri ile F2/F3 credential projection açıkları kabul edilen kapsamda giderilmiştir. Test kanıtı ve `check.sh --skip-docker` sonucu yeterlidir. R1 `done` olarak onaylandı. F4, F6'nın kalan kısmı, MFA kararları ve gerçek ortam audit incelemesi açık risk olarak korunur.

Parent: TASK-027.41 (status `review` kalır). Kaynak: Q-DP23 (F1 CRITICAL, F2 HIGH, F3 MEDIUM). Bu kayıt tamamlanmadan TASK-027.41 `done` yapılmaz.

## AI2 Teslim Raporu (2026-09-21)

Gerçek DB/HTTP/MFA sağlayıcısı/Docker kullanılmadı; tüm kanıtlar mock'lu birim testlerdir; testlerdeki credential değerleri uydurma yer tutucudur.

### 1. Yetki düzeltmeleri (F1) — `apps/api/src/platform/saas.service.ts`
- **`addCustomerUserMembership`:** hedef kullanıcı artık yalnızca **çağıranın aktif customer-root ağacında** (users ⨝ memberships ⨝ tenants, `findCustomerScopedUser`) aranır; başka root/tenant kullanıcısı **404** (kapsam dışı ile "yok" aynı yanıt); **sistem yöneticisi hedefi 403**. Önceki kapsamsız `select users where id` kaldırıldı. Hedef *tenant*'ın root'a ait olduğu doğrulaması (`assertTenantBelongsToCustomerRoot`) ve mükerrer üyelik 409'u korundu. Not: kökte hiç üyeliği olmayan bir kullanıcı artık bu yüzeyden eklenemez (yeni kullanıcı zaten `POST customer-admin/users` ile eklenir).
- **`setCustomerUserPassword`:** customer scope kontrolü korundu; hedef kapsam dışı → 404, **sistem yöneticisi → 403**, kendi parolası → 403 (yasak korundu); parola politikası (canonical) ve girdi doğrulaması aynen.
- **`updateCustomerUser`:** aynı `resolveManageableCustomerUser` ile kapsam + sistem yöneticisi reddi.
- Ortak helper `resolveManageableCustomerUser`: yalnızca *reddetmek* için `isSystemAdmin` okur; `TENANT_ADMIN`/`impersonation`/`PLATFORM_ROOT` bypass'ı **yok** (statik test). Mevcut permission kodları ve tenant scope modeli değişmedi; **yeni permission kodu yok**, route yok.

### 2. Response projection (F2, F3) — yeni `domain/user-projection.domain.ts` (whitelist)
- `toCustomerUserView` (id, email, displayName, status, createdAt, updatedAt — `isSystemAdmin` bilerek yok), `toPlatformUserView` (+`isSystemAdmin`), `toSessionUserView`. Kolon eklenirse yanlışlıkla sızmaz.
- **Customer-admin:** `POST customer-admin/users` ve `PATCH customer-admin/users/:id` artık ham `users` satırı değil `toCustomerUserView` döndürür.
- **`GET /auth/me`:** `toSessionUserView` (id, email, displayName, status, isSystemAdmin, mfaVerified, impersonation, impersonatorUserId, impersonatorEmail). Ek olarak defense-in-depth: `AuthService.validateJwtPayload` artık `passwordHash`'i request user'a **koymaz**.
- **🔴 Ek bulgu (kontrol gereği, düzeltildi): platform user endpoint'leri de sızdırıyordu.** `user.service.ts`'teki `toUserRow` gelen satırı **olduğu gibi** döndürüyordu; `GET platform/users` (liste), `GET platform/users/:id`, `POST`, `PATCH`, `deactivate` yanıtları `passwordHash` içeriyordu — **`PLATFORM:USER:VIEW` taşıyan herkes (VIEWER rolü dahil) tüm kullanıcıların hash'ini okuyabiliyordu.** `toUserRow = toPlatformUserView` (whitelist) ile düzeltildi; web'in kullandığı alanlar (id, email, displayName, isSystemAdmin, status, tarihler) korundu.

### 3. Audit (F6'nın ilgili kısmı) — `PlatformAuditService` `SaasService`'e eklendi
Actor, hedef, tenant/root ve sonuç (`SUCCESS`/`DENIED`/`FAILED` + statik `reason` kodu) ile: `CUSTOMER_USER_CREATED`, `CUSTOMER_USER_UPDATED` (önce/sonra displayName), `CUSTOMER_USER_PASSWORD_RESET` (başarı; ayrıca reddedilen: kapsam dışı / sistem yöneticisi / kendi parolası; yazım hatası: `FAILED`), `CUSTOMER_MEMBERSHIP_ADDED`, `CUSTOMER_MEMBERSHIP_ADD` reddi, `CUSTOMER_USER_UPDATE_DENIED`. **Metadata yalnızca kimlikler ve statik kod içerir; parola/hash/token/OTP yok** (testli; ayrıca `PlatformAuditService` anahtar tabanlı scrub yapar). Red/hata audit'i **best-effort**: audit kesintisi bir reddi başarıya çevirmez. Başarı audit'i mutasyondan sonra ve zorunludur (`user.service` ile aynı desen). **Impersonation:** oturum impersonation ise `impersonatorUserId` metadata'ya yazılır (actor = oturum öznesi); controller `request.user.impersonatorUserId`'i dört mutasyona bağlam olarak iletir. Impersonation herhangi bir ek erişim vermez ve engellenmez (karar Q-DP22c'de açık).
Audit'lenmeyenler (bilinçli sınır): girdi doğrulama hataları (kapsam bilinmeden, saf 400), yetki (scope/permission) reddi (zaten guard/scope aşamasında; root bilinmiyor) ve kapsam dışı işlemlerin geri kalanı (`customer-admin/tenants` oluşturma, `saas`/`tenant`/`role`/settings/perf mutasyonları) — **F6'nın geri kalanı ayrı audit görevidir.**

### 4. Testler
- `apps/api/src/platform/customer-admin-authorization-remediation.spec.ts` (yeni, **28 test**): başka root kullanıcısı için üyelik 404 + yazma yok + denial audit; scoped lookup kullanımı; sistem yöneticisi hedefi (membership/password/update) 403; kendi parola yasağı; başarı yolunda tek hash + yalnızca `passwordHash` güncellemesi + audit (actor/target/root/tenant/result); yazma hatasında `FAILED` audit; audit kesintisinde ret korunur; yetkisiz (scope) çağrıda lookup/hash/yazma/audit yok; zayıf parola 400 (yankı yok); update/create yanıtlarında credential alanı yok ve tam anahtar kümesi; platform user list/create/update/deactivate/detail sızıntısız ve UI alanları korunur; `/auth/me` projeksiyonu; `validateJwtPayload` hash'siz; impersonation (audit'te impersonator, ek erişim yok, sysadmin-impersonation da sysadmin hedefi yönetemez, controller bağlamı iletir); permission kodları katalogda, scope kontrolü lookup'tan önce, bypass yok.
- `authorization-audit-findings.spec.ts`: A1–A6 (artık giderildi) kaldırıldı ve yukarıdaki spec ile ters çevrildi; **A7/A8 (F4, latent) hâlâ olduğu gibi sabitli**; B testleri (MFA policy no-op vb.) değişmedi.
- Mevcut spec'ler yeni servis bağımlılığına (audit) göre güncellendi; TASK-027.40-R1, validation ve inventory testleri değişmeden geçiyor.
- **Mutasyon kontrolleri:** sistem yöneticisi reddi devre dışı → 6 test kırıldı; `toUserRow` ham satırı döndürsün → 2; `auth/me` ham kullanıcıyı döndürsün → 1; hepsi geri alındı (doğrulandı).
- **`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **48 suite / 1314 test** (önceki 47/1292), web 8 dosya / 117 test.
- **Q-ENV01 workaround (açık):** yalnızca bu çalıştırma için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı.

### 5. Kalan / açık (bu R1'in kapsamı dışında bırakıldı)
- **F4 (latent):** `POST platform/users/:id/set-password` sistem yöneticisi hedefini, `POST platform/users/:id/roles` global `SYSTEM_ADMIN` atamasını actor ayrıcalığı kontrol etmeden yapar (Q-DP22a ile karar).
- **F6'nın kalanı:** saas/tenant/role/settings/perf mutasyon audit'i.
- **Operasyonel:** açık kapanmadan önce oluşan kötüye kullanım için gerçek ortamda erişim/uygulama logları ve mevcut hash'lerin ifşa olabileceği varsayımıyla **parola rotasyonu/oturum iptali değerlendirmesi** AI1/PO kararıdır (DB'ye bağlanılmadı).
- Sistem yöneticilerinin müşteri-root üyeliği: sistem yöneticisi bir root'ta üye ise `listCustomerUsers`'ta görünmeye devam eder (yalnızca yönetilemez); gerekirse listeden çıkarma ayrı karar.
- Yanıt şekli değişti (`POST/PATCH customer-admin/users`); web tüketicileri (`app/admin/users`) yanıtın gövdesini kullanmıyor (listeyi yeniden yükler).
- Q-DP22b/c, Q-DP21d, MFA enforcement kararları **açık ve dokunulmadı**; Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill açık.

### Durum
F1/F2/F3 kod düzeyinde giderildi (kapanış AI1'de). TASK-027.41 ve bu R1 kaydı `status: review`.
