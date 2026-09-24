# MFA Enforcement Route Matrisi ve Geçiş Planı

> Kaynak: TASK-027.48 (Q-DP22b/c kapanışı). Karar paketi:
> `docs/migration/METNEX_AUTHORIZATION_ENDPOINT_AUDIT_AND_MFA_POLICY_DECISION.md` §5–§6.
> Bu belge, o kararların **uygulandığı** somut route listesini ve geçiş stratejisini tutar.

## 1. Mekanizma özeti

- `MfaEnforcementGuard` (`apps/api/src/platform/guards/mfa-enforcement.guard.ts`) her controller'a
  `@UseGuards(..., MfaEnforcementGuard)` ile eklenir; gerçek zorlama yalnızca aynı controller/route
  `@RequireMfaSetupComplete()` decorator'ını taşıyorsa devreye girer (opt-in, fail-closed).
- Guard mantığı:
  1. Aktör `ACTIVE` değilse → 403 (`Hesap devre dışı`).
  2. `MfaRequirementService.isRequired` — tenant `tenantSecuritySettings.mfaRequired` veya
     kullanıcının herhangi bir `tenantRoles.requiresMfa` rolü — `false` ise → geçer.
  3. JWT'deki `mfaVerified: true` ise → geçer (login veya `mfa/challenge/verify` sırasında zaten
     MFA doğrulanmış).
  4. Kullanıcının `userMfaSettings.isEnabled` değilse → **403 `MFA_SETUP_REQUIRED`** (sadece MFA
     setup akışına yönlendirilir, hesap kilitlenmez).
  5. Etkinse ama oturum doğrulanmamışsa → **403 `MFA_SESSION_NOT_VERIFIED`** (yeniden giriş +
     challenge gerekir).
  6. Her ret, best-effort `MFA_ENFORCEMENT_DENIED` audit kaydı yazar (actor, reason, method, route
     — credential/secret yok).

## 2. Kapsam dışı bırakılan yüzey (bilinçli, MFA'yı çözen akışın kendisi)

| Route | Neden |
|---|---|
| `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` | Oturum öncesi/dışı — public |
| `GET /auth/me`, `GET/POST /platform/me/*` | Uygulama kabuğunun (layout, tenant seçimi) kendi kimlik bootstrap'i — MFA setup ekranı da bu kabuğun içinde render olur |
| `GET /auth/mfa/status`, `POST /auth/mfa/totp/{setup,verify-setup,disable}`, `POST /auth/mfa/recovery-codes/regenerate`, `POST /auth/mfa/challenge/verify` | MFA'nın kendisini kurma/doğrulama akışı — burası kapatılırsa kimse asla kurulumu tamamlayamaz |
| `POST /auth/mfa/admin/:userId/reset`, `GET/PATCH /auth/mfa/policy/:tenantId` | Kendi bespoke inline+service `isSystemAdmin` yetkilendirmesini taşır (Q-DP22a/b/c); jenerik guard'la aynı anda MFA'sız bir sistem yöneticisini de bloke ederdi — Q-DP22c(1)'in "geçici izin" tasarımıyla çelişir |
| `GET /health`, `GET/POST /platform/bootstrap*` | Zaten public, oturumsuz |

## 3. Kapsama alınan yüzey (enforcement aktif)

`@RequireMfaSetupComplete()` uygulanan tüm controller'lar — tam liste ve guard zinciri
`apps/api/src/platform/endpoint-authorization-inventory.spec.ts`'deki `SNAPSHOT` dizisinde
donmuş haldedir (bu dosya, herhangi bir endpoint'in guard'ı sessizce değiştiğinde kırılır).
Özet:

- `platform/permissions`, `platform/roles`, `platform/tenants`, `platform/users`,
  `platform/saas/*`, `customer-admin/*`
- `reports/*`
- `platform/settings/*`, `settings/smtp/*`, `settings/ai-provider/*`
- `admin/perf/*`
- `platform-audit-logs`
- `POST /auth/change-password`

## 4. Yetki modeli (Q-DP22 kararları)

| Karar | Sonuç |
|---|---|
| MFA policy'yi kim değiştirebilir (Q-DP22b) | Yalnızca `isSystemAdmin` (yeni izin kodu yok, geçici kural — Q-DP22a kalıcı model kararına kadar) |
| Policy route şekli | `GET/PATCH /auth/mfa/policy/:tenantId` — controller + service'te bağımsız fail-closed kontrol |
| Admin reset kalıcı izin kodu (Q-DP22c Q5) | Şimdilik `isSystemAdmin` kalır (§6 AI2 önerisi: (b) — Q-DP22a kararına kadar) |
| Admin reset `mfaVerified` şartı (Q-DP22c Q1) | Aktörün kendi MFA'sı etkinse zorunlu; etkin değilse geçici izin + audit uyarısı (`actorMfaBypassWarning`) |
| Admin reset self-reset (Q-DP22c Q2) | Yasak — zaten `SELF_CHANGE` reddiyle (TASK-027.47) korunuyordu, değişmedi |
| Admin reset impersonation (Q-DP22c Q3) | Yasak — zaten TASK-027.46'dan beri `IMPERSONATION` reddiyle korunuyordu, değişmedi |

## 5. Geçiş stratejisi — setup-required (kilitlenme yok)

Enforcement devreye girdiğinde MFA politikası kendisi için aktif olan ama henüz TOTP kurmamış bir
kullanıcı **kilitlenmez**: `MFA_SETUP_REQUIRED` yanıtı alır, web `apps/web/src/lib/api.ts` bu kodu
yakalayıp otomatik olarak `/app/settings/security` sayfasına yönlendirir (bkz. §7), kullanıcı orada
kurulumu tamamlayıp normal erişimine geri döner. Kademeli rollout veya admin-onaylı grace period
**uygulanmadı** — karar bu şekildeydi (bkz. AskUserQuestion kaydı, backlog task'ta özetlenmiştir).

## 6. Break-glass ile ilişki

MFA enforcement, break-glass kurtarma akışını (TASK-027.47-R1) hiçbir şekilde bypass etmez veya
onunla etkileşmez — break-glass, JWT-korumalı route'lardan tamamen ayrı, kendi token/ledger
mekanizmasıyla çalışır (`apps/api/src/platform/break-glass-recovery.service.ts`). MFA enforcement
guard'ı hiçbir normal endpoint için sessiz bir bypass üretmez; fail-closed'dır.

## 7. Web tarafı

- `apps/web/src/lib/api.ts`'deki merkezi `request()` fonksiyonu her 403 yanıtını
  `getMfaErrorGuidance` ile kontrol eder; `MFA_SETUP_REQUIRED` → `/app/settings/security`,
  `MFA_SESSION_NOT_VERIFIED` → `/login` yönlendirmesi yapar (döngüyü önlemek için zaten o
  sayfadaysa yönlendirmez).
- `apps/web/src/app/(app)/app/settings/security/page.tsx` — MFA durumu görüntüleme, TOTP kurulum
  (QR + manuel anahtar + kod doğrulama), kurtarma kodu gösterimi, devre dışı bırakma (parola+kod),
  kurtarma kodu yenileme.
- `apps/web/src/app/login/page.tsx` — login yanıtı `requiresMfa` taşıyorsa (kullanıcının MFA'sı
  zaten etkinse) ikinci adım: TOTP kodu veya kurtarma kodu ile `auth/mfa/challenge/verify`.
- API tarafında `POST auth/mfa/challenge/verify`, `POST auth/login` ile **aynı** httpOnly refresh
  cookie sözleşmesini kullanacak şekilde düzeltildi (önceden yalnızca body'de `refreshToken`
  döndürüyordu, cookie hiç set edilmiyordu — MFA ile giren bir kullanıcı sayfa yenilemesinde
  oturumunu kaybederdi).

## 8. Doğrulama

- `apps/api/src/platform/guards/mfa-enforcement.guard.spec.ts` — guard'ın kendi karar ağacı
  (aktif değil / gerekmiyor / mfaVerified / setup gerekli / session doğrulanmamış / audit
  best-effort).
- `apps/api/src/platform/endpoint-authorization-inventory.spec.ts` — 91 endpoint'in guard
  zincirini donduran snapshot; guard kaldırılırsa veya route'a sessizce eklenirse kırılır.
- `apps/api/src/platform/mfa-admin-reset-authorization.spec.ts`,
  `authorization-audit-findings.spec.ts`, `mfa-settings-perf-validation.spec.ts` — policy route
  ve admin reset kararlarının davranışsal testleri.
- `apps/api/src/platform/guards/mfa-enforcement-route-matrix.spec.ts` — bu belgenin §2/§3'te
  iddia ettiği "kilitlenme yok" özelliğini uçtan uca kanıtlıyor: aynı guard + aynı kullanıcı +
  aynı MFA durumu, korumalı bir route'u reddederken MFA setup akışını geçiriyor.
- Web: `apps/web/src/app/login/__tests__/page.spec.tsx` (MFA challenge adımı),
  `apps/web/src/app/(app)/app/settings/security/__tests__/page.spec.tsx` (kurulum/devre dışı
  bırakma/kurtarma kodu akışları), `apps/web/src/lib/__tests__/api-mfa-redirect.spec.ts` (merkezi
  403 yönlendirmesi).
- `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker`
  — tam gate (Q-ENV01 workaround'uyla, lint dahil) — bkz. backlog task teslim raporu.
