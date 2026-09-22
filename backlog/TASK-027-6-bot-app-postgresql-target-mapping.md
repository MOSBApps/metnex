---
id: TASK-027.6
title: BOT APP PostgreSQL target mapping
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.6 (2026-09-17)

AI1 teslimi onayladı. Metnex'in tenant-kapsamlı `tenantRoles` ve platform-kapsamlı
`systemRoles` modelleri doğru biçimde tespit edildi; BOTC düz rol modelinin hedefi
Q-P01'e bırakıldı. User alanları, password/session güvenliği, tenant ataması,
legacy ID eşlemesi ve VisibilitySettings etkileri kanıtlarla belgelenmiştir.
Q-P01/Q-P02/Q-P03 append-only korunmuş, Wave 2/Wave 3 kapsam dışı bırakılmış ve
`./scripts/check.sh --skip-docker` PASS kabul edilmiştir.

TASK-027.6 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

`BOTC_SOURCE_SCHEMA_INVENTORY.md` §2.1–2.5 ve `BOTC_ENTITY_DOMAIN_MAPPING.md` §1 kaynak olarak
kullanıldı (yeniden üretilmedi). Metnex tarafında `apps/api/src/db/schema/{platform.ts,enums.ts}`
**gerçek Drizzle tablo tanımları** satır satır okundu (`users`, `tenants`, `tenantMemberships`,
`tenantRoles`/`tenantRolePermissions`/`userTenantRoleAssignments`, `systemRoles`/`permissions`/
`rolePermissions`/`userSystemRoleAssignments`, `authSessions`, `userMfaSettings`,
`tenantSecuritySettings`). `apps/api/src/platform/crypto.ts` (yalnızca hash **algoritması** —
`scrypt` + per-user random salt formatı, hiçbir gerçek değer okunmadı), `role.service.ts`
(`tenantRolePermissions.permissionCode`'un runtime doğrulaması) ve `apps/api/src/db/id.ts`
(`randomUUID()` tabanlı ID üretimi) okundu.

### Kritik yapısal bulgu

Metnex'in **iki ayrı rol modeli** olduğu tespit edildi: tenant-kapsamlı `tenantRoles` ve
platform-kapsamlı `systemRoles`. BOTC'nin tek düz `Role`/`Permission` modelinin bu ikisinden
hangisine eşleneceği **önceden hiç ele alınmamış** bir yapısal sorudur — yeni açık soru **Q-P01**.

### Teslimat

`docs/migration/BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md`:

- **§1** Metnex PostgreSQL hedef şeması gerçek kod özeti.
- **§2** `User` alan sınıflandırması — 4 kategori (taşınacak, yeniden hash'lenecek, Wave 2/3'e
  özel taşınmayacak, karar bekleyen — `Username`/`Email` ayrımı, `IsEmailVerified`, `Sirket`).
- **§3** `Role`/`Permission` — BOTC düz model vs. Metnex ikili model, yapısal karar bekliyor
  (Q-P01); `permission-catalogue.ts` formatıyla uyumluluk teyidi (engel yapısal değil, isimlendirme — Q-M03).
- **§4** `UserPermission` rol-temelli/birebir kararı **kesinleştirilmedi**, Q-M04'e bağlandı.
- **§5** Legacy ID/UUID mapping ihtiyacı — yalnızca belgelendi, implementation yapılmadı.
- **§6** Tenant ataması — `Sirket` güvenilir kaynak kabul edilmedi, Q-M06/TASK-027.4'e bağlandı.
- **§7** `VisibilitySettings` taşınma kararı — karar bekliyor olarak işaretlendi (Q-P02).
- **§8** Audit/tenant scope/permission/password/session etkileri tablo halinde.
- **§9** Düz-metin parola/global salt/gömülü AES anahtarının taşınmadığının teyidi.
- **§10** Wave 2/3 kapsam dışı teyidi.

### Yeni açık sorular (Q-P01–Q-P03, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E/Q-T/Q-SC serisi
**korunarak** 3 yeni soru eklendi:

- **Q-P01** — BOTC Role/Permission `tenantRoles` mı, `systemRoles` mı, karışık mı? (PO onayı gerekli)
- **Q-P02** — `VisibilitySettings` verisi migration'da referans mı, atlanacak mı? (PO onayı gerekli)
- **Q-P03** — `UserPermission` dönüşüm mekanizması hangi implementation task'ının sorumluluğunda? (Q-M04'e bağımlı, teknik)

Özet tablosuna 3 yeni satır eklendi, mevcut satırlar değiştirilmedi. Q-M03/Q-M04/Q-M06/Q-A03
içerikleri **değiştirilmedi**, yalnızca somut hedef şema kanıtlarıyla ilişkilendirildi.

### Kapsam kriterleri karşılama

- Her `User`/`Role`/`Permission`/`UserPermission`/`VisibilitySettings` alanı hedef PostgreSQL
  karşılığıyla veya "karar bekliyor" kategorisiyle eşlendi (§2–§4, §7).
- User/Role/Permission/UserPermission hedefleri gerçek Metnex şemasıyla ilişkilendirildi (§1–§4).
- Tenant ataması Q-M06 ve TASK-027.4 ile uyumlu (§6) — `Sirket` güvenilir kaynak kabul edilmedi.
- Password/session/security etkileri §8/§9'da açıkça belgelendi.
- Wave 2/3 kapsam dışı korundu (§10).
- Gerçek secret/parola/hash/connection string hiçbir teslim dokümanına yazılmadı — yalnızca
  algoritma adı (`scrypt`) ve format yapısı (`"salt:hash"`) incelendi.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değiştirilmedi.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmedi** — rol-modeli seçimi (Q-P01), permission
  adı kesinleşmesi (Q-M03), rol-şablonu/birebir atama kararı (Q-M04), tenant ataması (Q-M06)
  çözülmeden Wave 1 implementation task'ları (`TASK-027-11`–`TASK-027-19`) başlatılmamalı.
- `Username`/`Email` ayrımı ve `IsEmailVerified` hedefi netleşmeden `users` tablosuna veri yazımı
  planlanamaz.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum

`status: done` — AI1, BOT_APP PostgreSQL target mapping ve Q-P01–Q-P03 açık sorularını inceleyip
onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.6" bölümü).

# TASK-027.6: BOT APP PostgreSQL target mapping

## Amaç

BOT_APP verilerini PostgreSQL hedeflerine eşleştir.

## Wave ve bağımlılık

TASK-027.3

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
