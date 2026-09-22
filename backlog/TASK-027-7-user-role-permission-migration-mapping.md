---
id: TASK-027.7
title: User role permission migration mapping
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.7 (2026-09-17)

AI1 teslimi onayladı. `PermissionGuard`'ın güncel çözümleme mantığı kaynak kodla
doğrulandı; tenant-scoped izinlerin `systemRoles` üzerinden çözülememesi Seçenek B
için teknik kısıt olarak, karar olarak değil, doğru biçimde belgelendi. Q-P01 için
üç seçenek, Q-M04 için iki dönüşüm seçeneği ve Q-P03 sorumluluk önerisi karar
vermeden sunulmuştur. Tenant üyeliği/ataması ve implementation yapılmamıştır.
Q-P04 append-only korunmuş, Wave 2/Wave 3 kapsam dışı bırakılmış ve
`./scripts/check.sh --skip-docker` PASS kabul edilmiştir.

TASK-027.7 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

`BOTC_SOURCE_SCHEMA_INVENTORY.md`, `BOTC_ENTITY_DOMAIN_MAPPING.md` ve
`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` kaynak olarak kullanıldı (yeniden üretilmedi). Bu
task için ek olarak Metnex'in gerçek yetkilendirme çalışma zamanı kodu satır satır okundu:
`apps/api/src/platform/permission.guard.ts` (permission çözümleme mantığı) ve
`apps/api/src/platform/tenant-membership.guard.ts` (tenant üyeliği kontrolü).

### Kritik kod kanıtı

`PermissionGuard`'ın gerçek çözümleme mantığı incelendiğinde, `PLATFORM:` prefiksli **olmayan**
hiçbir izin kodunun `systemRoles`/`rolePermissions` üzerinden çözülmediği görüldü — yalnızca
`userTenantRoleAssignments`→`tenantRoles`→`tenantRolePermissions` yolu veya `TENANT_ADMIN` adlı
hardcoded bir rol kısayolu var. Bu, **Q-P01 Seçenek B'yi (hepsi systemRoles) bugünkü guard
koduyla teknik olarak çalışmaz kılıyor** — bir kanıt, karar değil (guard kodu da Wave 1'in parçası
olarak değiştirilebilir).

### Teslimat

`docs/migration/BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md`:

- **§2** Q-P01 için 3 seçenek (A: hepsi tenantRoles, B: hepsi systemRoles, C: Admin→systemRoles
  diğerleri→tenantRoles) — tenant izolasyonu, root aggregation, permission guard uyumu (kritik
  kod kanıtı), audit, operasyonel efor karşılaştırması. **Hiçbiri implementation kararı olarak
  sunulmadı.**
- **§3** Q-M03 permission isim dönüşümü — karar bekleyen olarak korundu, kesinleştirilmedi.
- **§4** Q-M04 UserPermission dönüşüm seçenekleri (kullanıcı-başına-özel-rol vs. ortak-şablon) —
  eşit ağırlıkta karşılaştırıldı, hiçbiri önerilmedi.
- **§5** Q-P03 dönüşüm mekanizması sorumluluğu — **öneri** olarak sunuldu, atama yapılmadı.
- **§6** Tenant üyeliği/ataması — Q-M06/TASK-027.4'e bağlı, hiçbir `tenantMemberships` satırı
  üretilmedi/önerilmedi.
- **§7** Username/Email ayrımı ve IsEmailVerified belirsizliği korundu.
- **§8** PasswordHash için yalnızca yeniden-hash/reset strateji seçenekleri, gerçek değer yok.

### Yeni açık soru (Q-P04, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E/Q-T/Q-SC/Q-P serisi
**korunarak** 1 yeni soru eklendi: **Q-P04** — `Admin` rolü `TENANT_ADMIN` hardcoded kısayolu mu,
satır satır izin ataması mı (Q-P01 "C" seçilirse devreye girer, koşullu PO onayı). Özet tablosuna
1 satır eklendi, mevcut satırlar değiştirilmedi.

### Kapsam kriterleri karşılama

- Her karar seçeneği kaynak kanıtıyla ilişkilendirildi (§2.2 tablo, §2.3 kod kanıtı).
- Q-P01/Q-M03/Q-M04/Q-M06 bağımlılıkları açıkça gösterildi (§1 tablo, her bölüm başlığı).
- Hiçbir seçenek implementation kararı gibi sunulmadı — her bölümde "kesinleştirilmedi"/"karar
  bekliyor" ifadesi açıkça yer alıyor.
- Tenant izolasyonu ve root aggregation etkileri §2.2'de karşılaştırıldı.
- Password/session/permission güvenliği §8'de korundu, gerçek değer yazılmadı.
- Wave 2/3 kapsam dışı korundu (§9).
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değiştirilmedi.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı üretmedi** — Q-P01/Q-M03/Q-M04/Q-M06/Q-P04 PO tarafından
  çözülmeden Wave 1 implementation task'ları başlatılamaz.
- Seçenek B'nin bugünkü `PermissionGuard` koduyla çalışmayacağı kanıtlandı — PO bu seçeneği
  tercih ederse ek guard implementasyonu gerekir, bu maliyet görünür kılındı.
- Tenant ataması netleşmeden migrate edilen kullanıcılar hiçbir tenant'a erişemez
  (`tenant-membership.guard.ts` kanıtı) — Wave 1 cutover riski olarak not edildi.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum

`status: done` — AI1, User/Role/Permission migration karar matrisini ve Q-P04 açık sorusunu
inceleyip onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.7" bölümü).

# TASK-027.7: User role permission migration mapping

## Amaç

Legacy user, role ve permission’ları Metnex modeline eşleştir.

## Wave ve bağımlılık

TASK-027.6

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
