---
id: TASK-027.42
title: Platform User-Admin Privilege Boundary Remediation
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te "Virtual column formula validator" Wave 5 placeholder'ıydı (`TASK-027-42-virtual-column-formula-validator.md`). AI1 talimatıyla kapsam **F4 — platform user-admin privilege boundary remediation** olarak yeniden tanımlandı; formül doğrulayıcı **yapılmadı**. Talimattaki dosya adı (`…platform-user-admin-privilege-boundary.md`) mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI1 Onay Kaydı (2026-09-21)

F4 kod düzeyinde kabul edilen kapsamda giderildi: actor'ın DB'den yeniden doğrulanması, sistem yöneticisi hedeflerinin korunması, global rol değişikliklerinin aktif sistem yöneticisi sınırı ve audit/credential güvenliği doğrulandı. TASK-027.42 `done` olarak onaylandı. Q-DP24 kalıcı yetki modeli, tenant-kapsamlı rol delegasyonu ve F6'nın kalan audit kapsamı sonraki karar/task kapsamına bırakıldı. Orijinal formula-validator placeholder'ı yapılmadı.

## AI2 Teslim Raporu (2026-09-21)

Gerçek DB/HTTP/MFA sağlayıcısı/Docker kullanılmadı; tüm kanıtlar mock'lu birim testlerdir; testlerdeki credential değerleri uydurma yer tutucudur.

### Actor/target kararı (geçici model — kalıcı karar Q-DP24'te açık)
`UserService.assertMayAdminister` (yeni, tek yetki noktası) — **actor her zaman veritabanından yeniden okunur** (token claim'i veya yalnızca route izni yetki vermez), **ACTIVE** olmalıdır ve:
1. **Hedef sistem yöneticisi ise** actor da ACTIVE sistem yöneticisi olmalı (yoksa 403, sebep `TARGET_IS_SYSTEM_ADMIN`).
2. **Global rol atama/geri alma** (`tenantId` null — `SYSTEM_ADMIN`'in tek kapsamı ve `PLATFORM:*` izinlerinin değerlendirildiği kapsam; kanıt: `PermissionGuard` `PLATFORM:` dalı `isNull(userSystemRoleAssignments.tenantId)` kullanır) yalnızca ACTIVE sistem yöneticisi tarafından yapılabilir (sebep `GLOBAL_ROLE_CHANGE_REQUIRES_SYSTEM_ADMIN`). Böylece actor kendine veya başkasına `SYSTEM_ADMIN` (ya da global `TENANT_ADMIN` gibi `PLATFORM:USER:*` taşıyan bir rol) veremez.
3. Actor bilinmiyor/aktif değil/`actorId` yok → 403 (`ACTOR_NOT_ACTIVE`), fail-closed.
Uygulandığı işlemler (yedi): `PATCH users/:id`, `POST users/:id/set-password`, `POST users/:id/deactivate`, `POST users/:id/roles`, `DELETE users/:id/roles/:assignmentId`, `POST users/:id/memberships`, `DELETE users/:id/memberships/:membershipId`. `POST platform/users` (oluşturma) hedef içermez, değişmedi; `impersonate` zaten `AuthService`'te actor'ı DB'den yeniden okuyup ACTIVE + sistem yöneticisi ister, dokunulmadı.
**Sistem yöneticisi actor'ın davranışı değişmedi:** sistem yöneticisi başka bir sistem yöneticisinin parolasını/adını değiştirebilir, deaktive edebilir (mevcut kendi-kendini ve son-yönetici korumaları aynen), `SYSTEM_ADMIN` verebilir/geri alabilir (son `SYSTEM_ADMIN` ataması geri alınamaz kuralı aynen). **Bu, "eş sistem yöneticileri birbirini yönetebilir" varsayımıdır — onaylı yetki modeli değildir → Q-DP24.**
**Hedef yok / yetkisiz ayrımı (kural 10):** hedef yoksa **404** (actor/audit/hash yok); hedef var ama actor ayrıcalıksız → **403** statik mesaj; ayrıcalık durumu 409 (ör. "zaten pasif") gibi başka bir yanıtla sızmaz (yetki reddi durum kontrolünden önce).

### Permission kodları
**Yeni permission kodu eklenmedi**; route izinleri aynen (`PLATFORM:USER:UPDATE|DEACTIVATE|ASSIGN_ROLE|REVOKE_ROLE|MANAGE_MEMBERSHIP`). "Onaylı yetki modeli" için kataloğda uygun bir kod yok → **Q-DP24 açık soru**; geçici sınır `isSystemAdmin` (DB'den doğrulanmış). Yeni route/bypass yok (14 route sabit, testli).

### Audit davranışı
- **Başarı (zorunlu, mutasyondan sonra, hata yayılır):** mevcut kodlar (`USER_UPDATED`, `USER_PASSWORD_RESET`, `USER_DEACTIVATED`, `SYSTEM_ROLE_GRANTED/REVOKED`, `TENANT_MEMBERSHIP_ADDED/REMOVED`) korunur; metadata'ya `result: 'SUCCESS'`, `targetUserId` ve (impersonation ise) `impersonatorUserId` eklendi (additif). Parola sıfırlama artık metadata da taşır.
- **Ret/hata (best-effort):** aynı eylem kodu + `result: 'DENIED'|'FAILED'` + statik `reason` (`TARGET_IS_SYSTEM_ADMIN`, `GLOBAL_ROLE_CHANGE_REQUIRES_SYSTEM_ADMIN`, `ACTOR_NOT_ACTIVE`, `SELF_CHANGE`, `ERROR`) + `targetUserId` (+ impersonator). Audit kesintisi ret/hatayı başarıya çevirmez. Metadata'da parola/hash/token/OTP yok (testli; `PlatformAuditService` ayrıca anahtar tabanlı scrub yapar).
- Girdi şekli doğrulama hataları (saf 400) ve hedef-yok 404 audit'lenmez.

### Sıralama (kural 6 — bilinçli yorum)
Sıra: route izni → **saf id/gövde şekli doğrulaması (I/O yok)** → hedef+actor okuma ve yetki → parola gücü/iş kuralları → hash → mutasyon → başarı audit'i. "Yetki kontrolü hash, DB mutasyonu ve audit başarı kaydından önce" tam olarak karşılanır (statik test yedi işlemde `assertMayAdminister`'in ilk etkiden önce olduğunu doğrular). Saf şekil doğrulaması yetkiden **önce** bırakıldı çünkü (i) `assignRole` için `roleId/tenantId` yorumlanmadan global-rol kuralı uygulanamaz, (ii) yetkisiz çağıran için 400/403 farkıyla "hedef sistem yöneticisi mi" oracle'ı oluşmaz, (iii) TASK-027.39 sözleşmesi ("geçersiz girdi DB'ye dokunmadan reddedilir") korunur. Kural 6'nın literal "input validation'dan da önce" okunuşu isteniyorsa AI1 belirtsin.

### Yanıtlar / impersonation
Yanıtlar `toPlatformUserView` whitelist'inden (R1) geçer; başarılı/reddedilen hiçbir çıktı `passwordHash`/parola/token/OTP/MFA secret içermez (testli). **Impersonation ek yetki vermez:** yetki oturum öznesinin DB satırına göre verilir (impersonator'a göre değil) — sıradan bir kullanıcı olarak impersonate edilen oturum sistem yöneticisi işlemlerinde reddedilir; audit'e `impersonatorUserId` yazılır; controller `request.user.impersonatorUserId`'i yedi mutasyona bağlam olarak iletir. Impersonation'ın kendisinin engellenmesi Q-DP22c'de açık, dokunulmadı.

### Değişen dosyalar
`apps/api/src/platform/user.service.ts` (helper + yedi işlem), `user.controller.ts` (impersonator bağlamı), yeni `platform-user-admin-privilege-boundary.spec.ts` (**34 test**); `authorization-audit-findings.spec.ts` (A7/A8 karakterizasyon testleri giderildiği için kaldırıldı), `customer-admin-authorization-remediation.spec.ts` (platform user testlerine actor seçimi eklendi). Dokümanlar: `BOTC_MIGRATION_OPEN_QUESTIONS.md`, `METNEX_STATE.md`, `PROGRESS_LOG.md`, ana denetim raporu §9.

### Testler / doğrulama
- **34 yeni test:** sıradan platform yöneticisi sistem yöneticisinin parolasını değiştiremez (hash/yazma yok, denial audit); sistem yöneticisi eşinin parolasını değiştirebilir (tek hash, yalnızca hash kolonu, audit credential'sız); sıradan hedefte mevcut yetenek korunur; self-change yasağı; bilinmeyen/pasif/kilitli/yok actor fail-closed; hedef yok 404; yazma hatası `FAILED` audit + yeniden fırlatma; audit kesintisi reddi değiştirmez; zayıf parola I/O'suz 400; yetkisiz actor `SYSTEM_ADMIN` veremez (kendine/başkasına; transaction/`isSystemAdmin` flip yok); global `TENANT_ADMIN` da reddedilir; tenant-kapsamlı atama mevcut davranış; sistem yöneticisi `SYSTEM_ADMIN` verir/geri alır, son-admin koruması; global rol geri alma reddi; update/deactivate/üyelik ekle-kaldır sistem yöneticisi hedefinde reddedilir ve durum sızmaz (409 yerine 403); tenant kullanıcılarının platform ayrıcalığı kazanamadığı (`PermissionGuard` global-atama kanıtı); impersonation ayrıcalık vermez ve audit'lenir; controller bağlamı; statik: yetki her etkiden önce, permission kataloğu/route sayısı sabit, helper'da bypass/claim yok.
- **Mutasyon kontrolleri (geri alındı):** hedef-sistem-yöneticisi kuralı devre dışı → 9, global-rol kuralı devre dışı → 3 test kırıldı.
- `pnpm --filter api exec tsc --noEmit`: temiz. `pnpm --filter api exec jest platform --runInBand`: **12 suite / 754 test PASS**. **`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **49 suite / 1346 test** (önceki 48/1314), web 8 dosya / 117 test.
- **Q-ENV01 workaround (açık):** yalnızca `check.sh` çalıştırması için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı.
- **Doğrulanamayanlar:** gerçek HTTP/DB/tarayıcı denemesi yok; mevcut web `system/users` payload'ları (`{displayName}`, `{password}`, `{roleId, tenantId|null}`, `{tenantId}`) aynen kabul edilir (imzalar/gövde şekilleri değişmedi) ama tarayıcıda denenmedi; gerçek ortamdaki mevcut rol/atama verisi (ör. gerçekte hangi kullanıcılar global rol taşıyor) incelenmedi.

### F4 kapanışı ve kalan riskler
F4 (sistem yöneticisi parolasının/ayrıcalığının ayrıcalıksız actor tarafından değiştirilebilmesi; `SYSTEM_ADMIN`'in actor kontrolsüz verilebilmesi; audit'in eksikliği) **kod düzeyinde giderildi** (kapanış AI1'de). Kalan/açık:
- **Q-DP24 (yeni):** kalıcı yetki modeli — kim `SYSTEM_ADMIN`/global rol verebilir (ayrı izin kodu? iki-yönetici onayı?), eş sistem yöneticileri birbirinin parolasını/MFA'sını/hesabını yönetebilir mi, "sahip olduğundan fazlasını veremez" (delegasyon üst sınırı) kuralı; bugün uygulanmıyor.
- **Artık risk:** `PLATFORM:USER:ASSIGN_ROLE` taşıyan ama sistem yöneticisi olmayan bir actor **tenant-kapsamlı** rolleri (ör. herhangi bir root için `TENANT_ADMIN`) kendine dahil herkese verebilir (mevcut davranış, route izniyle uyumlu; platform ayrıcalığı vermez ama müşteri-root yönetici yetkisi verir). Bugün bu izne yalnızca SYSTEM_ADMIN rolü sahip, risk latent.
- Sistem yöneticisi hesabının kendi üyeliği/silinmesi vb. diğer kombinasyonlar (ör. sistem yöneticisi kendi üyeliğini yönetmesi) değişmedi.
- F6'nın kalanı (saas/tenant/role/settings/perf audit), Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, gerçek ortam audit incelemesi/parola rotasyonu açık.

### Durum
`status: review` — nihai `done` AI1'de.

---

# TASK-027.42: Virtual column formula validator

## Amaç

Formula whitelist, limit ve güvenli doğrulamayı uygula.

## Wave ve bağımlılık

TASK-027.41

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
