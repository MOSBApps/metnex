---
id: TASK-027.40
title: MFA, Settings ve Perf Input Validation Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te "Analysis statistics" Wave 5 placeholder'ıydı (`TASK-027-40-analysis-statistics.md`). AI1 talimatıyla kapsam **MFA/Settings/Perf input validation boundary (Q-DP21)** olarak yeniden tanımlandı; analiz istatistikleri **yapılmadı**. Talimattaki dosya adı mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI2 Teslim Raporu (2026-09-21)

> ⚠️ **KRİTİK BULGU (bu task'ın kapsamı dışında, DEĞİŞTİRİLMEDİ — AI1 acil karar): `POST /api/v1/auth/mfa/admin/:userId/reset` yalnızca `AuthGuard('jwt')` ile korunuyor; controller'da `@RequirePermission`/`isSystemAdmin`/tenant-scope kontrolü yok, `MfaService.adminResetMfa` de yetki denetlemiyor ve global `APP_GUARD` yok.** Kodu okuyan sonuç: oturum açmış **herhangi bir kullanıcı**, başka herhangi bir kullanıcının MFA'sını kapatabilir (`disableInternal(targetUserId)`). Bu task'ın kuralı ("MFA iş mantığı/mevcut davranış değişmesin", "yeni bypass/yetki eklenmesin") gereği düzeltmedim; yalnızca `:userId` biçim doğrulaması eklendi. Ayrıca `GET/PATCH auth/mfa/policy` route'unda `:tenantId` parametresi yok → `tenantId` daima `undefined` → uçlar sabit `{ mfaRequired: false }` döner ve `setTenantPolicy` hiç çalışmaz (ölü uç); erişilebilir hâle getirilirse aynı yetki boşluğu geçerli. → **yeni Q-DP22 (güvenlik, yüksek öncelik).** Gerçek HTTP/DB ile yeniden üretilmedi; bulgu kod okumasına dayanır.

### Kök neden: dekoratörler neden etkisizdi
`dto/mfa.dto.ts` `class-validator` dekoratörleri taşıyor ama `main.ts`/`app.module.ts`'de `ValidationPipe`/`APP_PIPE` yok (statik testle kanıtlı) → Nest gövdeyi düz nesne olarak geçiriyordu, dekoratörler hiç çalışmadı. Çözüm: aynı sözleşme **saf domain validator'a taşındı ve controller sınırında çağrılıyor**; dekoratörlere güvenilmiyor, global pipe eklenmedi (dekoratörler zararsız kalıyor).

### Yeni dosyalar
- `apps/api/src/platform/domain/mfa-input.domain.ts` — MFA gövdeleri.
- `apps/api/src/settings/settings-input.domain.ts` — settings upsert gövdeleri + `X-Tenant-Id` biçimi.
- `apps/api/src/perf/perf-input.domain.ts` — perf query/path/body.
- `apps/api/src/platform/guards/tenant-header-format.guard.ts` — yalnızca format denetimi yapan, I/O'suz guard.
- Değişen: `mfa.controller.ts`, `dto/mfa.dto.ts` (recovery regex tek kaynağa alındı), `platform-settings.controller.ts`, `tenant-settings-smtp.controller.ts`, `tenant-settings-ai.controller.ts`, `perf-admin.controller.ts`, `platform-input.domain.ts` (`INT4_MAX` export).
Yeni dependency/framework yok; yalnızca saf validator'lar.

### Uygulanan kurallar ve kanıt kaynakları
| Alan | Kural | Kanıt |
|---|---|---|
| MFA `code` (verify-setup, disable, regenerate, challenge) | string, tam 6 karakter | DTO `@Length(6,6)` + mesaj |
| `recoveryCode` | `RECOVERY_CODE_PATTERN` | DTO `@Matches` (tek kaynak) |
| `challengeToken`, disable `password` | boş olmayan string | DTO `@IsString` (+ boş değer 401'e düşerdi) |
| Challenge | `recoveryCode` varsa pattern, yoksa `code` zorunlu | DTO `@ValidateIf` semantiği + servis (`recoveryCode ? … : code ? … : false`) |
| `mfaRequired` | yalnızca boolean | DTO `@IsBoolean` |
| `:userId`, `:tenantId`, `:id`, tenant `X-Tenant-Id`, perf `tenantId` | platform id biçimi (`[A-Za-z0-9_-]`, ≤100) | TASK-027.39'da kabul edilen `isValidId` |
| Settings tür kuralları | metin alanları string (bazılarında `null` = temizle), boolean'lar boolean, `port` tam sayı/`null` | servis kodu (`.trim()`, `\|\| null`), `port` = DB `integer` (int4 aralığı) |
| Perf `limit/offset/statusCode` | rakam dizisi ≤10 hane, ≤ int4 | controller `parseInt` + DB `integer`; mevcut kelepçe/varsayılanlar (50/200, 30/100) **aynen** |
| Perf `from/to` | `new Date()` ile ayrıştırılabilir | controller `new Date(from)` |
| Perf `queryHash` | `^[0-9a-f]{16}$` | `db.service`: sha256 hex `.slice(0,16)` |
| Perf settings PATCH | `slowRequestThresholdMs` tam sayı (int4), `dbTraceEnabled` boolean | DB `integer`/`boolean` |
Boş string sorgu parametreleri "yok" sayılır (controller zaten öyle davranıyordu).

### Sıralama ve bilgi sızıntısı
Validasyon `platform/settings` ve `perf` controller'larında mevcut `requireSystemAdmin`/`assertSystemAdmin` **sonrasında** çalışır (yetkisiz kullanıcı yine 403 alır, statik + çalışma testli). Tenant settings'te `X-Tenant-Id` biçimi, DB'ye giden `TenantMembershipGuard`/`PermissionGuard`'dan **önce** `TenantHeaderFormatGuard` ile (JwtAuthGuard'dan sonra) doğrulanır; guard hiçbir şey vermez (bypass yok, I/O yok), header yetki olarak kabul edilmez. MFA'da mevcut `AuthGuard('jwt')` sonrası controller girişinde doğrulanır; herkese açık `challenge/verify` da doğrulanır.

### Kanıtsız olduğu için UYGULANMAYANLAR (açık karar → Q-DP21)
Ayarlarda maksimum uzunluk, e-posta/URL biçimi, `port` aralığı (1–65535), `providerType` enum'u; perf'te `from<=to`, `route` uzunluğu, `statusCode` aralığı, `slowRequestThresholdMs` alt/üst sınırı (UI `min=100` yalnızca UI'da); challenge token uzunluğu. Testler bu değerlerin **kabul edildiğini** açıkça sabitler (daraltma yok).

### Testler
`apps/api/src/platform/mfa-settings-perf-validation.spec.ts` (yeni, **242 test**): eksik/boş/yanlış tür/dizi/nesne/NoSQL (`{ $ne: null }`)/biçim/boolean/enum-benzeri/geçersiz limit-offset-tarih/geçersiz `:id`/eksik-geçersiz `X-Tenant-Id` senaryoları — gerçek handler'lar düz nesneyle çağrılır (dekoratör/pipe yok), hepsinde **MFA/servis/diagnostics/settings çağrısı yapılmaz**; hata gövdelerinde OTP/recovery/token/parola/API anahtarı/host değeri yok; yetkisiz (admin olmayan) çağrı yine 403 ve doğrulamadan önce; geçerli UI payload'ları (SMTP, general, AI, `null` ile temizleme, perf `limit=50/30`, settings PATCH) değişmeden servise ulaşır; kelepçe/varsayılan davranışı korunur; kanıtsız kuralların kabul edildiği sabitlenir. Statik: global `ValidationPipe` yok, yeni validation dependency yok, validator'lar saf ve yalnızca kardeş modül import eder, 16 handler'da doğrulama ilk servis çağrısından önce, sistem-yöneticisi kontrolü doğrulamadan önce, credential loglanmıyor, bypass yok, guard sıralaması (`JwtAuthGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard`).
**Mutasyon kontrolü:** MFA/perf/platform-settings controller doğrulamaları geçici kapatıldı → 182 test kırıldı; geri alındı (doğrulandı).
**`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **44 suite / 1240 test** (önceki 43/998), web 8 dosya / 117 test.
**Q-ENV01 workaround (açık):** yalnızca bu çalıştırma için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı, kalıcı çözüm yapılmadı.

### Sınırlar
Mock'lu birim testlerle kanıtlandı; gerçek HTTP/DB/MFA sağlayıcısı ve tarayıcı denemesi yok. Perf'te `from`/`to` gibi bazı geçersiz girdiler daha önce 500 ile sonuçlanıyordu, artık 400 — bu bir davranış düzeltmesidir. `reporting/*` ve `X-Tenant-Id` kullanan diğer controller'lar bu task'ın kapsamı dışında kaldı (`requireTenantId` var oluş kontrolü dışında biçim doğrulaması yok) → Q-DP21.

### R1 güncellemesi
AI1 geri bildirimiyle Q-DP22 (MFA admin-reset yetki açığı) ayrı kayıtta düzeltildi: `backlog/TASK-027-40-R1-mfa-admin-reset-authorization-boundary.md` (status `review`). Bu dosyadaki "değiştirilmedi" ifadesi ilk teslim anını anlatır; güncel durum R1 kaydındadır. TASK-027.40 status `review` kalır.

### Durum
Q-DP21'in MFA/settings/perf kısmı kod düzeyinde giderildi (kapanış AI1'de); **yeni Q-DP22 (MFA admin-reset yetki boşluğu, ölü policy uçları) yüksek öncelikli açık.** Q-DP21d (paket format/limit) ve kanıtsız kural kararları, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill açık. Yapılmayanlar: MFA iş mantığı/yetki değişikliği, global pipe kararı, password reset/e-posta doğrulama, Q-DP17/04, data-plane, Vardiya, Wave 2/3, Docker, git commit/push.
`status: done` — MFA/Settings/Perf input validation ve R1 authorization düzeltmesi AI1 tarafından onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.40 ve TASK-027.40-R1 kabul edildi. MFA/settings/perf girişleri saf
validator'larla doğrulanıyor; MFA admin reset açığı controller ve service'te
iki katmanlı fail-closed system-admin kontrolüyle kapatıldı.

Q-DP21 kod düzeyinde, Q-DP22a kod düzeyinde giderildi. Q-DP22b/c, Q-DP21d,
Q-DP17, Q-DP04, Q-ENV01 ve dev ROOT backfill açık kaldı. Gerçek HTTP/DB/MFA
provider ve tarayıcı doğrulaması yapılmadı.

---

# TASK-027.40: Analysis statistics

## Amaç

Toplam, minimum, maksimum ve null davranışlarını uygula.

## Wave ve bağımlılık

TASK-027.39

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
