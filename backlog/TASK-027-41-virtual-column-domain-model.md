---
id: TASK-027.41
title: Authenticated Endpoint Authorization Audit ve MFA Policy Karar Paketi
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te "Virtual column domain model" Wave 5 placeholder'ıydı (`TASK-027-41-virtual-column-domain-model.md`). AI1 talimatıyla kapsam **authenticated endpoint authorization audit + MFA policy karar paketi** olarak yeniden tanımlandı; virtual column domain modeli **yapılmadı**. Talimattaki dosya adı mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI1 Onay Kaydı (2026-09-21)

Denetim ve karar paketi ile tespit edilen F1/F2/F3 açıklarının TASK-027.41-R1 ile giderildiği doğrulanmıştır. Ana task `done` olarak onaylandı. F4, F6'nın kalan kısmı, Q-DP22b/c, MFA enforcement, Q-DP21d ve gerçek ortam geçmiş audit incelemesi açık bırakılmıştır. Orijinal virtual-column placeholder kapsamı yapılmamıştır.

## AI2 Teslim Raporu (2026-09-21)

Ana rapor: `docs/migration/METNEX_AUTHORIZATION_ENDPOINT_AUDIT_AND_MFA_POLICY_DECISION.md` (90 endpoint envanteri, bulgular, MFA policy ve admin-reset karar paketleri). **Bu task denetim/karar task'ıdır: endpoint davranışı, yetki modeli, permission kataloğu değiştirilmedi; MFA policy route'ları erişilebilir kılınmadı; hiçbir bulgu düzeltilmedi.**

### 🔴 KRİTİK BULGULAR (düzeltilmedi — AI1/PO acil karar; ayrı remediation önerilir: TASK-027.41-R1)
- **F1 CRITICAL — customer-admin → hesap ele geçirme zinciri.** `POST customer-admin/users/:id/memberships` hedef *kullanıcıyı* kapsamsız arar (yalnızca `select users where id`), yani başka müşterinin/sistem yöneticisinin kullanıcısı saldırganın root'una üye yapılabilir; ardından `POST customer-admin/users/:id/set-password` kapsamlı lookup'ı geçer, `isSystemAdmin` hedefini dışlamaz, audit yazmaz → hedef hesabın parolası sıfırlanır. Ön koşul: bir root'ta `TENANT_ADMIN` + hedef kullanıcı UUID'si. Mock'lu karakterizasyon testleriyle kanıtlandı (A1–A3); gerçek ortamda yeniden üretilmedi.
- **F2 HIGH — `passwordHash` sızıntısı:** `PATCH customer-admin/users/:id` ve `POST customer-admin/users` ham `users` satırını döndürür (kapsamdaki başkalarının hash'i dahil; F1 ile kapsam platform geneline çıkar). **F3 MEDIUM:** `GET auth/me` çağıranın kendi hash'ini döndürür.
- **Güvenli minimal düzeltme önerisi (rapor §3.1/3.2):** hedefi `findCustomerScopedUser` ile çöz (404), customer-admin hedeflerinde `isSystemAdmin` reddet (403), parola sıfırlama/üye ekleme audit'i, yanıtlarda güvenli projeksiyon. Yeni permission/bypass gerekmez.
- Diğer: **F4 MEDIUM (latent)** platform kullanıcı yönetiminde hedef/actor ayrıcalık kuralı yok (sysadmin parola sıfırlama; SYSTEM_ADMIN atama actor kontrolsüz); **F5 MEDIUM** MFA policy ölü+yetkisiz; **F6 MEDIUM** saas/tenant/role/settings/perf mutasyonlarında audit yok (customer-admin parola sıfırlama dahil).

### Envanter (özet)
90 endpoint / 16 controller: **7 kasıtlı public**, **31 yalnızca-authn** (1 `auth/me`, 3 `platform/me`, 5 kendi-hesabı MFA, 1 audit + 10 perf + 8 platform-settings controller-içi `isSystemAdmin`, 1 MFA admin reset [R1: controller + servis DB yeniden okuma], 2 ölü MFA policy), **52 `@RequirePermission`** (hepsi `JwtAuthGuard + PermissionGuard` arkasında). Tam tablo (kimlik doğrulama, permission, tenant/root kapsamı, servis-içi yetki, actor/target, audit, yetkisiz sonuç, kanıt, risk, sonraki task) ana raporda §4.

### MFA policy (Q-DP22b) — karar paketi hazır, kapatılmadı
Mevcut durum kanıtlı: `policy` route'unda `:tenantId` yok → `tenantId` hep `undefined` → GET/PATCH her zaman `200 { mfaRequired:false }`, servis çağrılmaz; yalnızca `AuthGuard('jwt')`, yetki yok (erişilebilir kılınırsa herhangi bir oturumlu kullanıcı politika yazabilir). Ek bulgu: `MfaEnforcementGuard`/`@RequireMfaSetupComplete` **hiçbir endpoint'e uygulanmamış**, login yalnızca kullanıcının kendi MFA'sına bakar → tenant/rol MFA politikası bugün hiçbir zorlama üretmez. Seçenekler **A** (no-op) / **B** (`policy/:tenantId` + yetki) / **C** (kaldır) / **D** (header ile çöz) her biri için permission, tenant isolation, login/enforcement, audit, geri dönüş maliyeti, UI, Q-DP22b bağlantısı, AI2 önerisi ve **boş karar alanı** ana rapor §5'te. **Öneri:** şimdilik A; yetki modeli (Q-DP22a) + enforcement kararından sonra ayrı görevde D (veya B), politika istenmiyorsa C; önce authorization/kapsam/audit, sonra enforcement.

### MFA admin reset (Q-DP22c) — karar paketi hazır, kapatılmadı
`mfaVerified` zorunluluğu, sysadmin self-reset, impersonation oturumunda reset, gelecekte tenant-admin reset, ayrı permission kodu ve geçici `isSystemAdmin` sınırının süresi için seçenekler/riskler/öneriler ve boş karar alanı ana rapor §6'da. **Öneriler:** MFA'sı etkin adminler için `mfaVerified` zorunlu; self-reset yerine `totp/disable`; impersonation oturumlarında reset/parola/rol işlemleri reddedilsin; tenant-admin reset şimdilik yok (F1-R1 sonrası yeniden değerlendirilir); uzun vadede ayrı izin kodu (**uydurulmadı**), o zamana kadar sysadmin-only; geçici sınır Q-DP22a kararına kadar.

### Testler / doğrulama
- `apps/api/src/platform/endpoint-authorization-inventory.spec.ts` (yeni, **11 test**): tüm `*.controller.ts` dosyalarını statik ayrıştırır; 90 endpoint'in guard/permission yapısını **snapshot** olarak sabitler (yeni/değişen/silinen endpoint testi kırar); her endpoint PUBLIC allowlist / permission'lı / gerekçeli AUTHN-ONLY olmalı; permission'lı endpoint'ler `JwtAuthGuard+PermissionGuard` altında; tenant-ayar guard zinciri sıralı; controller-içi `isSystemAdmin` servis çağrısından önce; MFA self-only uçları özneyi oturumdan alır; ölü-route kümesi tam olarak iki policy route'u. **Mutasyon:** bir `@RequirePermission` kaldırılınca 2 test kırıldı; geri alındı.
- `apps/api/src/platform/authorization-audit-findings.spec.ts` (yeni, **16 test**): F1–F4 **karakterizasyon** (bugünkü açık davranışı sabitler — remediation bunları ters çevirecek/silecek), MFA policy no-op (Nest `path` metadata `'policy'`, servis çağrılmaz, izin dekoratörü yok, enforcement uygulanmamış), MFA admin reset R1 kontrolleri korunuyor, `platform-audit-logs` yetkisiz çağrıda servis/DB'ye gitmez, customer-admin scope kontrolü korunuyor. Mevcut R1 (`mfa-admin-reset-authorization.spec.ts`) ve perf/settings/validation testleri değişmedi ve geçiyor.
- **`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **47 suite / 1292 test** (önceki 45/1265), web 8 dosya / 117 test.
- **Q-ENV01 workaround (açık):** yalnızca bu çalıştırma için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı, kalıcı çözüm yapılmadı.
- Gerçek HTTP/DB/MFA sağlayıcısı/Docker kullanılmadı; gerçek secret/token/OTP/parola/hash/kullanıcı verisi/audit kaydı rapora yazılmadı (test değerleri uydurma yer tutucu).

### Yapılmayanlar / sınırlar
Bulguların düzeltilmesi, MFA policy'nin yeniden tasarımı/erişilebilir kılınması, yeni permission kodu, Q-DP22b/c kararlarının kapatılması, geniş authorization refactor'ı, global ValidationPipe, Q-DP17/04, data-plane, Vardiya, Wave 2/3, Docker, git commit/push. Bulgular gerçek ortamda yeniden üretilmedi; gerçek ortamda geçmiş kötüye kullanım incelemesi (özellikle audit'i olmayan customer-admin işlemleri için erişim/uygulama logları ve `MFA_ADMIN_RESET`) AI1/PO kararıdır.
`status: review` — nihai `done` AI1'de.

---

# TASK-027.41: Virtual column domain model

## Amaç

Kullanıcı/tenant sahiplikli sanal kolon modelini oluştur.

## Wave ve bağımlılık

TASK-027.1; TASK-027.6

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
