---
id: TASK-027.49
title: Tenant-Role Delegation ve Tenant Permission Yönetimi
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-22
---

# TASK-027.49: Tenant-Role Delegation ve Tenant Permission Yönetimi

> **Kimlik notu:** Bu dosya bir başka süreç/oturum tarafından kısa bir placeholder'a
> indirgenmişti — aynı `TASK-027.49` kimliğinin önceden CSV/PNG export görevi tarafından
> kullanıldığı, o görevin `TASK-027.55`'e yeniden numaralandırıldığı not edilmişti (bkz.
> `backlog/TASK-027-55-csv-png-export.md` ve devamındaki `TASK-027-56..59`). Bu yeniden
> numaralandırma doğru ve korunmuştur. Ancak bu dosyanın kendisi bu adımda tüm teslim
> raporu içeriğini kaybetmişti (test sayıları, kararlar, mutasyon sonuçları, kapsam dışı
> maddeler) — aşağıda tam içerikle geri yüklendi.

## Zorunlu başlangıç kapısı doğrulaması

İmplementasyondan önce gerçek permission katalogu (`BUILTIN_PERMISSIONS`) ve `PermissionGuard`
çözümleme mantığı incelendi. Sonuç: tenant-role delegation için onaylı bir permission kodu **yoktu**
(`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'de tekrar tekrar "açık" olarak listelenmişti;
`docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` madde 8 zaten "yeni permission
+ ayrı task" kararını taşıyordu ama kod hiç yazılmamıştı). Task'ın kendi kuralı gereği kod
uydurulmadan, 10 karar sorusu Product Owner'a AskUserQuestion ile soruldu; kararlar alındıktan
sonra implementasyon başladı.

## Product Owner kararları

| Soru | Karar |
|---|---|
| Permission kodu | `TENANT:ROLE:VIEW` + `TENANT:ROLE:ASSIGN` + `TENANT:ROLE:REVOKE` (mevcut `PLATFORM:ROLE:*` deseniyle tutarlı) |
| Kim atayabilir | O customer root'ta `TENANT_ADMIN` olan actor + sistem yöneticisi |
| Kendine atama | İzin verilir, ceiling kontrolüyle sınırlı |
| Root vs child kapsamı | Yalnızca root düzeyi (child tenant'a özel rol yönetimi yok) |
| Son yönetici koruması | Gerekli — yeni `tenant_roles.isAdminRole` boolean kolonu ile işaretlenen rolün son ACTIVE ataması kaldırılamaz |

## Backend değişiklikleri

### Şema
- `apps/api/drizzle/migrations/0004_tenant_role_admin_flag.sql` (`drizzle-kit generate`,
  canlı DB'ye bağlanmadan): `tenant_roles.isAdminRole boolean not null default false`.

### Permission katalogu
- `domain/system-role.domain.ts`: `BUILTIN_PERMISSIONS` 30 → 33 (`TENANT:ROLE:VIEW/ASSIGN/REVOKE`
  eklendi). Hiçbir builtin rolün (`SYSTEM_ADMIN`/`TENANT_ADMIN`/`VIEWER`) permission listesine
  eklenmedi — `TENANT_ADMIN` zaten `PermissionGuard`'ın `tenantAdminAssignment` kısa devresiyle
  kendi root'unda örtük olarak her PLATFORM-dışı izni taşıyor (kod değişikliği gerekmedi).

### Ceiling modeli
- Yeni `domain/tenant-role-ceiling.domain.ts` — TASK-027.46'nın SYSTEM_ADMIN/TENANT_ADMIN modelini
  (`domain/privilege-ceiling.domain.ts`, değiştirilmedi) genişletmez, ayrı ve pure bir fonksiyon
  ailesi: `evaluateTenantRoleGrantCeiling` (targetRole ⊆ actorEffective, bilinmeyen/yanlış-tenant/
  inaktif rol fail-closed) ve `wouldRemoveLastTenantAdmin` (son yönetici floor'u).

### Servis ve controller
- Yeni `platform/tenant-role.service.ts`: `listRoles`, `listAssignableRoles`,
  `listUserAssignments`, `assignRole`, `revokeRole`. Her mutasyon: impersonation reddi → actor
  DB'den ACTIVE yeniden okuma → `CustomerAccessService.assertCustomerAdminScope` ile bağımsız
  scope teyidi (mevcut servis, yeniden kullanıldı, kopyalanmadı) → işleme-özel kural. Duplicate
  atama `onConflictDoNothing()` + boş `returning()` → 409 (race-safe, DB'nin gerçek unique
  constraint'i `user_tenant_role_assignments_userId_roleId_key` üzerinden).
- Yeni `platform/tenant-role.controller.ts`: `tenant-roles[/assignable|/users/:userId[/:assignmentId]]`,
  `X-Tenant-Id` header ile (mevcut `settings/*` controller deseniyle aynı). Guard zinciri:
  `JwtAuthGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard,
  MfaEnforcementGuard` + `@RequireMfaSetupComplete()` (TASK-027.48 enforcement kapsamına da girdi).
- `platform.module.ts`: yeni controller/servis kaydedildi.

## Bilinçli kapsam dışı

- **Tenant rolü oluşturma/düzenleme endpoint'i.** Task'ın kendi "Önerilen endpoint sözleşmesi"
  yalnızca listeleme/atama/kaldırmayı listiyordu — `tenant_roles` satırları (ve `isAdminRole`
  bayrağının set edilmesi) hâlâ ayrı bir mekanizma/task gerektiriyor. Bugün tablo boş olduğu için
  bu yüzey gerçek veriyle test edilemedi (yalnızca mock'lu testler).
- **Web UI.** Görev metninde (TASK-027.48'deki MFA setup ekranları gibi) açık bir UI talebi yoktu;
  yapılmadı.
- Global role / `SYSTEM_ADMIN` / `TENANT_ADMIN` sistem-rol ataması: bu yüzey yapısal olarak
  `system_roles`/`user_system_role_assignments`'a hiç dokunmuyor (yalnızca `tenant_roles`/
  `user_tenant_role_assignments`) — erişilemez, ek kod gerekmedi.

## Testler

- Yeni `domain/tenant-role-ceiling.domain.spec.ts` (13 test) — ceiling ve son-yönetici pure
  fonksiyonlarının karar ağacı.
- Yeni `platform/tenant-role.service.spec.ts` (30 test, AI1 review turundan sonraki 3 ek dahil) —
  impersonation/actor/scope zinciri,
  assign (TENANT_ADMIN başarı, self-assign, yetkisiz actor, cross-root role, unknown role/target,
  malformed id, duplicate→409, audit credential-free), revoke (başarı, unknown/foreign assignment,
  tenant isolation, last-admin floor, malformed id), yapısal kontroller (global/SYSTEM_ADMIN yolu
  yok, root aggregation dokunulmadı).
- Güncellenen `endpoint-authorization-inventory.spec.ts` (96 endpoint'lik yeni snapshot),
  `privilege-model-evidence.spec.ts` (E1: 33 katalog; E3 yeniden yazıldı — artık
  TenantRoleService'in tek yazıcı olduğunu ve yeni permission kodlarının kullanıldığını
  doğruluyor).

### Mutasyon kontrolleri (bizzat çalıştırılıp doğrulandı, geri alındı)

- Scope kontrolü (`assertCustomerAdminScope` çağrısı) kaldırılınca → **12 test kırıldı**.
- Impersonation reddi kaldırılınca → **2 test kırıldı**.
- Privilege ceiling karşılaştırması kaldırılınca (domain fonksiyonunda) → **2 test kırıldı**.
- Duplicate/idempotency kontrolü (`created.length === 0`) kaldırılınca → **1 test kırıldı**.
- Global role reddi / audit redaction: yapısal testlerle doğrulandı (bu yüzeyde ayrıca kaldırılacak
  tek bir "kontrol" yok — global yol yapısal olarak yok, redaksiyon `PlatformAuditService`'in
  mevcut `scrubSecrets`'ına dayanıyor, TASK-027.46/48'de zaten test edilmiş).

## Doğrulama

```bash
pnpm --filter api exec tsc --noEmit    # temiz
pnpm --filter api exec eslint "src/**/*.ts"    # temiz
pnpm --filter api exec jest --runInBand    # 57 suite / 1573 test PASS (ilk teslim; AI1 review sonrası bkz. aşağı)
```

Gerçek DB/HTTP kullanılmadı (tüm testler mock'lu). Migration `drizzle-kit generate` ile şema
snapshot diff'inden üretildi, gerçek/canlı bir veritabanına hiç uygulanmadı. `docs/domain/DB_META.md`
migration register'ına not eklendi. Git commit/push yapılmadı.

## AI1 review düzeltmeleri (2026-09-22, ikinci tur)

İlk teslim `review`'da tutuldu; iki teknik nokta düzeltme olarak istendi. İkisi de ele alındı:

1. **Son tenant yöneticisi kontrolü kullanıcı `status`'unu filtrelemiyordu.** Eski kod, aynı
   tenant'ta `isAdminRole=true` olan başka BİR atama var mı diye bakıyordu ama o atamanın sahibi
   kullanıcının `ACTIVE` olup olmadığını kontrol etmiyordu — pasif/kilitli bir kullanıcının
   ataması "hâlâ bir yönetici var" sanılıp gerçek son aktif yöneticinin kaldırılmasına izin
   verebilirdi. Düzeltme: `revokeRole` artık kilitli atamaların sahibi kullanıcıları ayrıca
   `users.status = 'ACTIVE'` ile sorguluyor, yalnızca aktif kullanıcıların ataması "hayatta kalan
   yönetici" sayılıyor.
2. **Kontrol ve silme arasında atomiklik yoktu (eşzamanlı revoke yarışı).** Düzeltme:
   `isAdminRole` yolunda tüm kontrol + silme artık **tek bir `db.transaction()` içinde**; o
   tenant'taki tüm `isAdminRole` atamaları `SELECT ... FOR UPDATE` ile kilitleniyor. Aynı
   tenant'ta paralel bir revoke aynı kilitli satır kümesini istediği için ikinci transaction ilki
   commit/rollback olana kadar bloke olur, güncel sayıyı görür — iki paralel revoke'un aynı anda
   "başka yönetici var" görüp son iki yöneticiyi birlikte kaldırması artık mümkün değil.
   Admin-flagged olmayan atamalar için transaction/kilit yükü eklenmedi (gereksiz).

**Doğrulama (bizzat çalıştırıldı):**
- Yeni test: pasif kullanıcının ataması "hayatta kalan yönetici" sayılmıyor (mock ile davranışsal).
- Yeni test: aktif kullanıcı sayısı doğru hesaplanıyor (`status='ACTIVE'` filtresi) — **statik
  kaynak kontrolü** olarak eklendi, çünkü mock veritabanı gerçek SQL WHERE cümlesini
  doğrulayamıyor (yalnızca önceden yapılandırılmış sonucu döndürüyor); bu, **bizzat mutasyon
  testiyle doğrulandı**: `eq(users.status, 'ACTIVE')` satırı kaldırılınca bu statik test kırıldı,
  geri eklenince tekrar geçti.
- Yeni test: son-yönetici kontrolü + silme aynı `db.transaction()` içinde ve kilitli sorgu
  `.for('update')` çağrıyor — **bizzat mutasyon testiyle doğrulandı**: `.for('update')` satırı
  kaldırılınca test kırıldı, geri eklenince tekrar geçti.
- Gerçek Postgres'te paralel iki revoke isteğinin gerçekten bloke olup yalnızca birinin
  başarılı olduğu **canlı bir smoke test ile doğrulanmadı** (TASK-027.47-R1'deki break-glass
  smoke testine benzer, geçici/izole bir Postgres container'ı gerektirir — bu turda
  çalıştırılmadı, kod incelemesi + mock'lu testler + FOR UPDATE'in Postgres'in standart
  serileştirme mekanizması olduğu bilgisine dayanıyor). İstenirse ayrı bir onayla eklenebilir.

`pnpm --filter api exec jest --runInBand` → **57 suite / 1573 test PASS** (30 tenant-role.service
testi, +3 bu turda); `NODE_PATH=... TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker` → tam
PASS (lint dahil).

## Durum

**`status: done` — AI1 tarafından teknik olarak onaylandı (2026-09-22).** Kapatılan kritik
noktalar: son tenant yöneticisi hesabında yalnızca `ACTIVE` kullanıcılar sayılıyor; kontrol ve
silme aynı transaction içinde; admin atamaları `FOR UPDATE` ile kilitleniyor; mutasyon testleri
düzeltmelerin gerçekten gerekli olduğunu kanıtlıyor; tam kalite kapısı PASS (API 57 suite / 1573
test, lint dahil). Canlı PostgreSQL paralel yarış testi kullanıcı kararıyla yapılmadı, belgelenmiş
açık risk olarak kabul edildi — `done` kararını engellemiyor. Git commit/push yapılmadı.
