---
id: TASK-027.45
title: Privilege Canonical Source, Drift Detection ve Admin Invariant
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te bir Wave 5 placeholder'ıydı (`Multi-series chart scale`). AI1 talimatıyla kapsam **privilege canonical source / drift / admin invariant (salt-okunur)** olarak yeniden tanımlandı; placeholder'ın işi **yapılmadı**. Talimattaki dosya adı (`…privilege-canonical-source-and-drift-detection.md`) mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI1 Onay Kaydı (2026-09-21)

Salt-okunur canonical kaynak, drift kategorileri ve admin invariant raporu kabul edildi. Enforcement yapılmaması ve gerçek DB bağlantısı kullanılmaması kapsamla uyumludur. TASK-027.45 `done` olarak onaylandı. Gerçek ortam raporlama yolu ve enforcement sonraki tasklara bırakıldı; orijinal chart placeholder'ı yapılmadı.

## AI2 Teslim Raporu (2026-09-21)

**Bu task yalnızca gerçeği raporlar: salt-okunur, enforcement YOK.** Erişim davranışı (PermissionGuard, AuthService, inline sistem-yöneticisi kontrolleri, `UserService`, MFA) **değişmedi**; `assignRole`/`revokeRole`, global `TENANT_ADMIN` yasağı, privilege tavanı, eş sistem yöneticisi kısıtı, break-glass ve MFA enforcement **uygulanmadı** (sırasıyla 027.46/027.47/027.48). Drift veya global `TENANT_ADMIN` bulunması otomatik düzeltme, role revoke, flag update veya erişim değişikliği **oluşturmaz**. Gerçek veritabanı bağlantısı **kullanılmadı**; tüm testler fixture/mock'tur.

### Uygulanan Q-DP24 kararları (kaynak: `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.2 karar 5 ve 9, §14.6 kapanış)
1. **Canonical kaynak = global (`tenantId` null) `SYSTEM_ADMIN` rol ataması;** `users.isSystemAdmin` türetilmiş/cache alanı; uyumsuzluk drift olarak yalnızca raporlanır.
2. **Yalnızca `ACTIVE` kullanıcı aktif sistem yöneticisi sayılır** (INACTIVE/LOCKED sayılmaz).
3. **Son yönetici sayımı canonical rol atamalarından** (ACTIVE kullanıcıların global SYSTEM_ADMIN atamaları); invariant: ≥ 1. "≥ 2 yönetici" politikası kararlaştırılmadığı için yalnızca bilgi alanı (`singleActiveSystemAdmin`).
4. **Global ve tenant-kapsamlı atamalar ayrı raporlanır** (`assignments.global` / `assignments.tenant`, tenant tipiyle).
5. **Mevcut global `TENANT_ADMIN` atamaları silinmez/değiştirilmez;** yalnızca `GLOBAL_TENANT_ADMIN` kaydıyla raporlanır. Eş sistem yöneticisi kuralı ve break-glass uygulanmadı (027.47).

### Yeni dosyalar (`apps/api/src/platform/privilege/`)
- `privilege-canonical.contract.ts` — canonical kaynak sözleşmesi (sabitler), drift kategorileri ve **statik neden kodları**.
- `privilege-snapshot.port.ts` — **SELECT-only** port sözleşmesi ve minimal snapshot modeli (yalnızca kimlik/durum/kapsam; e-posta, ad, hash, token yok).
- `privilege-report.domain.ts` — **saf, deterministik, DB'siz** analiz (`analyzePrivilegeSnapshot`) ve rapor tipleri.
- `privilege-snapshot.drizzle.ts` — yalnızca **4 SELECT** (users: id/status/isSystemAdmin; system_roles: id/name; assignments: id/userId/roleId/tenantId; tenants: id/type/status), credential kolonu yok; hiçbir route/job/CLI'a bağlı değil.
- `privilege-audit.service.ts` — `report()` dışında metodu olmayan salt-okunur servis (yalnızca **DRY_RUN**).
- `platform.module.ts` — yalnızca provider kaydı (`PRIVILEGE_SNAPSHOT_PORT` + `PrivilegeAuditService`); controller/route eklenmedi.

### Rapor modeli ve drift kategorileri
Rapor: `schemaVersion`, `mode: 'DRY_RUN'`, `effect: 'REPORT_ONLY'`, `canonicalSource`, `derivedCache`, `invariant` {aktif sistem yöneticisi sayısı, minimum, karşılandı mı, ihlal (`ZERO_ACTIVE_SYSTEM_ADMIN`), tek yönetici bilgisi, son yönetici kimlikleri}, `counts`, `driftByCategory`, `drift[]`, `assignments` (global/tenant), `roleSummary`. Zaman damgası **yok** (deterministik). Her kayıt yalnızca kimlik, kapsam, durum ve statik neden kodu taşır.
Kategoriler (hepsi destekli): `FLAG_ROLE_MATCH` (bayrak+rol uyumlu), `FLAG_WITHOUT_SYSTEM_ROLE`, `SYSTEM_ROLE_WITHOUT_FLAG`, `INACTIVE_SYSTEM_ADMIN`, `LOCKED_SYSTEM_ADMIN`, `GLOBAL_TENANT_ADMIN`, `MULTIPLE_ADMIN_COUNT_MISMATCH` (bugünkü iki guard sayımı ile canonical sayım birbirinden farklıysa; üç sayı raporlanır: revoke guard = tüm global SYSTEM_ADMIN atamaları, deactivate guard = ACTIVE bayraklı kullanıcı, canonical = ACTIVE rol sahibi), `UNKNOWN_ROLE_SCOPE` (tenant referansı yok; `SYSTEM_ADMIN` tenant-kapsamlı), `INVALID_TARGET_REFERENCE` (orphan kullanıcı/rol referansı). Sıralama: kategori sırası, sonra kimlik.

### Testler / doğrulama
- `privilege/privilege-report.spec.ts` (yeni, **32 test**): bayrak+rol uyumlu; bayrak var/rol yok; rol var/bayrak yok; tenant-kapsamlı SYSTEM_ADMIN canonical sayılmaz; pasif ve kilitli sistem yöneticisi (aktif sayıya girmez); birden fazla aktif, tek aktif ve **sıfır aktif** sistem yöneticisi; boş platform; guard-sayım uyuşmazlığı; global `TENANT_ADMIN` (rapor) ve tenant-kapsamlı `TENANT_ADMIN` (drift değil); global/tenant ayrımı ve tenant tipi; bilinmeyen tenant kapsamı; orphan kullanıcı/rol; aynı girdi → iki çalıştırmada bayt-özdeş rapor ve girdi sırasından bağımsızlık; rapor çıktısında credential/session/token/e-posta alanı ve değeri yok (düşmanca girdi ile); dondurulmuş girdiyle mutasyon yok; adapter yalnızca 4 SELECT ve credential kolonu seçmiyor; uçtan uca mock DB'de hiçbir insert/update/delete/transaction yok; statik sınır: domain/contract/port/service DB-ORM-ağ-dosya import etmez, adapter SELECT-only, bağlantı dizesi/yeni bağımlılık yok, adapter'ı yalnızca `platform.module.ts` import eder ve hiçbir controller raporu açmaz, PermissionGuard/UserService/AuthService/MFA/Role/Saas kodu privilege modüllerini kullanmaz, sözleşme yeni permission/rol eklemez.
- **Mutasyon kontrolü:** "aktif" tanımı gevşetilince (INACTIVE/LOCKED sayılsın) 4 test kırıldı; geri alındı.
- `pnpm --filter api exec tsc --noEmit`: temiz. `pnpm --filter api exec jest platform --runInBand`: **14 suite / 804 test PASS**. **`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **51 suite / 1396 test** (önceki 50/1364), web 8 dosya / 117 test.
- **Q-ENV01 workaround (açık):** yalnızca `check.sh` çalıştırması için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı.
- **Gerçek DB bağlantısı KULLANILMADI:** rapor hiçbir gerçek kullanıcı/rol verisinde çalıştırılmadı; gerçek ortam drift/global `TENANT_ADMIN`/sistem yöneticisi sayısı **[DOĞRULANAMADI]** — raporu gerçek ortamda çalıştırmak (bir çalıştırıcı/CLI veya endpoint) bu task'ın kapsamı dışında bırakıldı ve AI1 kararı/sonraki task gerektirir.

### Sınırlar ve açık kalanlar
- Rapor henüz hiçbir yerden çağrılmıyor (route/CLI/job yok; bilinçli — davranış değişmez); gerçek ortamda çalıştırma yolu AI1 kararı (027.46 öncesi ön kontrol olarak önerilir).
- Çalışma zamanı drift davranışı (fail-closed vb.) bu task'ta **yok** (yalnızca rapor); 027.46/.47'de karara bağlanır.
- Açık: 027.46 (global `TENANT_ADMIN` yasağı, privilege tavanı, impersonation'da privilege yasağı), 027.47 (eş yönetici parola/MFA + break-glass + rotasyon yolu), 027.48 (MFA), 027.49 (tenant-rol delegasyonu), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi.
- Yapılmayanlar: enforcement, otomatik düzeltme, gerçek DB, yeni permission/rol, MFA, tenant-role delegation, F6, Wave 2/3, Docker, git commit/push.
`status: review` — nihai `done` AI1'de.

---

# TASK-027.45: Multi-series chart scale

## Amaç

Çoklu seri, scale, label ve tooltip davranışlarını uygula.

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
