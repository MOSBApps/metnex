---
id: TASK-027.43
title: Platform Privilege Model ve Tenant Role Delegation Karar Paketi
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te bir Wave 5 placeholder'ıydı (`Virtual column dependency resolution`). AI1'in talimatıyla kapsam **Q-DP24 karar paketi** olarak yeniden tanımlandı; placeholder'ın orijinal işi **yapılmadı**. Talimattaki dosya adı (`…platform-privilege-model-decision.md`) mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI1 Onay Kaydı (2026-09-21)

Q-DP24 karar/kanıt paketi, mevcut yetki temsillerini ve A/B/C seçeneklerini yeterli kanıtla ortaya koymuştur. TASK-027.43 `done` olarak onaylandı. Q-DP24'ün nihai Product Owner kararı, production authorization implementasyonu, tenant role delegation ve F6 audit işleri bu task kapsamında kapatılmamıştır.

## AI2 Teslim Raporu (2026-09-21)

Ana belge: `docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md`. **Karar ve kanıt paketidir; production authorization kodu, permission kataloğu, rol veya veri DEĞİŞTİRİLMEDİ; Q-DP24 KAPATILMADI — nihai karar AI1/Product Owner'ındır.** Gerçek DB/HTTP/kullanıcı/rol verisi kullanılmadı; yeni permission veya rol uydurulmadı (ihtiyaç yalnızca tarif edildi).

### Kanıtla ortaya çıkan yapısal gerçekler (belge §2–§3)
1. **Üç yetki temsili:** `users.isSystemAdmin` bayrağı (guard'ı kısa devre yapar), `SYSTEM_ADMIN` rol ataması (bayrakla yalnızca `assignRole`/`revokeRole`/bootstrap eliyle senkron) ve global (`tenantId` null) atamalar (`PLATFORM:*`'ın tek kaynağı). **İki son-yönetici koruması farklı şeyi sayar** (revoke: SYSTEM_ADMIN atama sayısı; deactivate: ACTIVE bayraklı kullanıcı).
2. **Tenant-rol yönetim yüzeyi yok:** `tenant_roles`/`tenant_role_permissions`/`user_tenant_role_assignments` yalnızca okunur; fiilen çalışan tenant yetkisi `TENANT_ADMIN` **sistem rolünün** root'ta atanmasıdır. Müşteri yöneticisi rol veremez.
3. **`TENANT_ADMIN` tenant kapsamında "her şey"dir** (guard rolün izin listesine bakmaz; diğer sistem rolleri tenant kapsamında etkisiz); **aynı rol global atanırsa** izin listesi (`PLATFORM:USER:CREATE/UPDATE`, `PLATFORM:TENANT:CREATE/UPDATE`, …) geçerli olur → yanlışlıkla global `TENANT_ADMIN` platform yazma izinleri açar.
4. Özel role **herhangi** katalog izni verilebilir (delegasyon üst sınırı yok) — bugün latent çünkü ilgili izinlerin tek sahibi SYSTEM_ADMIN.
5. `assignRole` tenant tipini doğrulamaz (PLATFORM_ROOT/alt tenant için anlamsız `TENANT_ADMIN` ataması kabul edilir); `listAssignableRoles` SYSTEM_ADMIN dahil tüm rolleri döndürür.
6. Katalog boşluğu: tenant ayar uçlarının `SETTINGS:SMTP:*`/`SETTINGS:AI_PROVIDER:*` kodları katalogda yok.
7. `TenantScopeService` rollerden bağımsızdır; impersonation token'ı hedefin bayrağını ve `mfaVerified: true` taşır, ayrıcalık kısıtı yok (Q-DP22c).
`[DOĞRULANAMADI]`: gerçek ortamdaki sistem yöneticisi sayısı, global `TENANT_ADMIN`/özel rol atamaları, bayrak↔rol drift'i; `PackageFeatureGuard` kodda yok; bildirim altyapısı.

### Zorunlu çıktılar (belgede)
1. Q-DP24 karar matrisi (a–j, seçenekler + AI2 önerisi + boş karar alanı) — §5
2. Global rol ve tenant rolü ayrım tablosu — §3
3. Actor/target privilege matrisi (SA/PA/TA/U/IMP × işlemler; bugün, B, C) — §6
4. Impersonation davranış matrisi (i1/i2/i3) — §7
5. Sistem yöneticisi koruma seçenekleri — §8
6. Audit olayları ve zorunlu metadata sözleşmesi — §9
7. Karar sonrası implementation görev listesi (T1–T9, dosyalar, bağımlılıklar) — §10
8. Rollback ve mevcut kullanıcı geçiş planı (salt-okunur ön kontroller, shadow modu, otomatik veri değişikliği yok) — §11
9. Açık riskler ve PO karar alanları — §12
Seçenekler A/B/C; tenant izolasyonu, root tenant etkisi, PermissionGuard uyumu, audit, impersonation, geri dönüş maliyeti, operasyonel uygulanabilirlik ve mevcut veriye etki kriterleriyle karşılaştırıldı (§4).

### AI2 önerisi (karar AI1/PO'da)
Kademeli: **(1)** A'yı bugünkü kalıcı zemin kabul et ve kanıtlı boşlukları kapat (assignRole tenant tip/rol listesi doğrulaması f3, bayrak↔rol invariant + tek son-yönetici tanımı g2/h2 + ≥2 admin uyarısı h4); **(2)** B'nin çekirdeğini uygula: delegasyon üst sınırı (d2+d3), `SYSTEM_ADMIN`/global rol ve eş-yönetimi için MFA'lı oturum (a2, c3), impersonation'da ayrıcalık işlemleri ve sysadmin impersonation yasağı (i2); **(3)** C'yi (ayrı izin/servis/iki aşamalı onay) yalnızca ikinci sistem yöneticisi zorunlu hâle gelirse veya müşteri tenant-rol delegasyonu ürün gereksinimi olursa aç; e2 (müşteri yöneticisi kendi root'unda `TENANT_ADMIN`) talep doğarsa F1 sertleştirmesi bittiği için güvenli.

### Test / doğrulama
- **Kod değişikliği yok;** tek eklenen dosya salt-okunur kanıt testi: `apps/api/src/platform/privilege-model-evidence.spec.ts` (**18 test**, statik) — katalog/rol içeriği, `PermissionGuard` çözümleme mantığı, tenant-rol tablolarının yazılmadığı, customer-admin'de rol endpoint'i olmadığı, `assignRole` doğrulama eksikleri, bayrak↔rol senkronu ve iki son-yönetici sayımı, `assertMayAdminister` yedi işlem, özel role izin verme tavansızlığı, `TenantScopeService`'in rol bağımsızlığı, impersonation token modeli. Bir olgu değişirse test kırılır ve paket güncellenmelidir.
- `pnpm --filter api exec tsc --noEmit`: temiz. `pnpm --filter api exec jest platform --runInBand`: **13 suite / 772 test PASS**. **`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **50 suite / 1364 test** (önceki 49/1346), web 8 dosya / 117 test.
- **Q-ENV01 workaround (açık):** yalnızca `check.sh` çalıştırması için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı.
- Gerçek DB/HTTP denemesi yok; gerçek ortam ön kontrolleri (belge §11) AI1/Ops'ta.

### Açık kalanlar
Q-DP24 (karar bekliyor), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi. Yapılmayanlar: production authorization kodu, yeni permission/rol, gerçek `SYSTEM_ADMIN` ataması, DB/HTTP, veri değişikliği, MFA policy/enforcement, F6'nın tamamı, Wave 2/3, Docker, git commit/push.
`status: review` — nihai karar/`done` AI1'de.

---

# TASK-027.43: Virtual column dependency resolution

## Amaç

Sanal kolon bağımlılıklarını cycle/depth korumasıyla çözümle.

## Wave ve bağımlılık

TASK-027.42

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
