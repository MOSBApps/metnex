---
id: TASK-027.38
title: Customer Provisioning Backend Validation ve Parola Policy Hardening
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te "Daily analysis engine" Wave 5 placeholder'ıydı (`TASK-027-38-daily-analysis-engine.md`). AI1 talimatıyla kapsam **Q-DP19 backend validation/parola policy hardening** olarak yeniden tanımlandı; günlük analiz motoru **yapılmadı**. Talimattaki dosya adı mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI2 Teslim Raporu (2026-09-21)

### Canonical parola politikası (koddan okundu)
`validatePasswordStrength` (`domain/auth.domain.ts`): **min 8, max 128, ≥1 büyük, ≥1 küçük, ≥1 rakam** (Türkçe statik mesajlar). Yeni/farklı politika uydurulmadı; `UserService`, `BootstrapService`, `SaasService` müşteri yönetici parola sıfırlama zaten bunu kullanıyor. **Önceki TASK-027.37'deki frontend'in geçici "12 karakter" kuralı canonical'dan farklıydı** (daha katı ama büyük/küçük/rakam yoktu) → kaldırıldı ve canonical kurala eşitlendi.

### Backend değişiklikleri
- Yeni `apps/api/src/platform/domain/customer-provision.domain.ts` (saf, DB/log/audit'siz; mevcut `domain/*` desenine uygun; yeni framework/ValidationPipe eklenmedi): `validateProvisionCustomerInput(input)` — tip denetimi (gövde nesne mi, alanlar string mi; NoSQL-benzeri `{ $ne }` gibi nesneler reddedilir), `companyName` 2–100 (trim), `companySlug` (varsa) `^[a-z0-9]+(-[a-z0-9]+)*$` ≤63, `packageId` zorunlu ≤100, `adminEmail` zorunlu ≤254 + mevcut `isValidEmail`, `adminDisplayName` 2–100, `adminPassword` zorunlu + **yalnızca `validatePasswordStrength`**, `notes` (varsa) ≤1000. Mesajlar statik; hiçbir girdi değeri (parola/e-posta/slug) mesaja girmez.
- `SaasService.provisionCustomer` en başında doğrular; geçersizse `BadRequestException(errors[])` — **hiçbir select/insert/update/transaction/hash/closure/`ensureSchemaProvisioned` yapılmaz**. Slug: verilmemişse ad → mevcut `slugify`; türetilen slug boş/geçersizse yine DB'ye dokunmadan 400. `packageId` sorguda `trim()` ile kullanılır (bulunamayan/pasif paket mevcut 404'ü korunur).
- **Değişmeyenler:** `TenantService.create` ROOT sınırı, `ROOT_PROVISIONING_REQUIRED`, `SCHEMA_ARCHIVED`/`SCHEMA_PROVISIONING_FAILED`/Q-DP17 davranışı, tek `ensureSchemaProvisioned` çağrısı, retry/reactivation yok, route izni (`PLATFORM:CUSTOMER:PROVISION`), yanıt şekli (`customerRootTenant`, `tenantAdmin`, `subscription`; credential alanı yok). Parola loglanmaz/exception/audit'e girmez.

### Frontend senkronizasyonu
`apps/web/src/lib/password-policy.ts` (yeni; canonical politikanın aynası, aynı sınırlar ve mesajlar) → `customer-provision.ts` yalnızca bunu kullanır; ad/yönetici adı 2–100, slug ≤63, e-posta ≤254, not ≤1000 sınırları backend'le eşitlendi; modalda parola kuralı ipucu metni eklendi. Backend yine nihai otoritedir.
**Parite kanıtı:** `password-policy.spec.ts` web aynasını API'nin gerçek `validatePasswordStrength` fonksiyonuyla (göreli import) 14 girdilik matriste **mesaj düzeyinde** karşılaştırır ve form doğrulamasının aynı hükmü verdiğini doğrular → politikalar ayrışırsa test kırılır.

### Testler
- `apps/api/src/platform/customer-provision-validation.spec.ts` (yeni, **88 test**): eksik/boşluk/yanlış tipli alanlar, geçersiz e-posta/slug, uzunluk sınırları, geçersiz/bulunmayan/pasif paket, parola 7/8/128/129 sınırları ve büyük/küçük/rakam eksikliği; geçersiz girdide **hiç DB erişimi/hash/closure/`ensureSchemaProvisioned` yok** (her geçersiz senaryo için); hata gövdesinde parola/hash/şema/DB/connection yok; geçerli girdide mevcut akış (tek hash, tek transaction, provizyon sonra); yanıtta credential yok; Q-DP17/ARCHIVED tek deneme; generic ROOT endpoint'i hâlâ `ROOT_PROVISIONING_REQUIRED`; route izni ve tek `ensureSchemaProvisioned`; doğrulayıcı saf modül.
- **Mutasyon kontrolü:** doğrulama satırı geçici olarak devre dışı bırakıldı → 27 test kırıldı; geri alındı (dosya orijinal, doğrulandı).
- `pnpm --filter web exec vitest run`: **8 dosya / 117 test PASS** (önceki 7/100). API: **42 suite / 714 test PASS** (önceki 41/626). **`./scripts/check.sh --skip-docker`: PASS (exit 0)**.
- **Q-ENV01 workaround (açık):** gate yalnızca bu çalıştırma için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose` ile koştu; repo/env dosyası değişmedi, kontrol atlanmadı; kalıcı çözüm yapılmadı.

### Dikkat / sınırlar
- Doğrulama mock'lu birim testlerle kanıtlandı; **gerçek DB/HTTP uçtan uca denenmedi** (DB/Docker kullanılmadı) ve tarayıcı denemesi yok.
- Yalnızca `provisionCustomer` sertleştirildi. Diğer `SaasService` DTO'ları (`createPackage`, `CustomerAdminCreateTenantDto`, `CustomerAdminCreateUserDto`, `AddMembershipDto`) da düz interface; **sistemik çözüm (global ValidationPipe/class-validator) AI1 kararı — yeni Q-DP20.** (Not: `createCustomerUser` mevcut haliyle parola politikasını zaten uyguluyor.)
- Web'de bir 400 yanıtının yalnızca ilk mesajı gösterilir (mevcut `api.ts` davranışı); tüm hatalar API'de dizi olarak döner.
- Aynı e-posta/slug çakışması kontrolleri (409) ve yarış koşulları değişmedi (DB benzersizlik kısıtı/Q-DP17 kapsamı).

### Durum
Q-DP19 kod düzeyinde giderildi (kapanış AI1'de). Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill açık. Kapsam dışı kalanlar yapılmadı: Q-DP17 atomiklik, FAILED ROOT retry, data-plane, Vardiya, DB rol/RLS, backfill, Wave 2/3, Docker, git commit/push.
`status: done` — backend provisioning validation teslimi AI1 tarafından onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.38 kabul edildi ve `done` olarak kapatıldı. `provisionCustomer` artık
DB transaction/hash/provisioning öncesinde saf backend doğrulaması yapıyor;
geçersiz input DB'ye dokunmadan reddediliyor. Mevcut canonical parola politikası
API ve web arasında senkronlandı; credential sızıntısı ve response alanları test edildi.

Q-DP19 kod düzeyinde giderildi. Q-DP20 (diğer interface DTO'ları için sistemik
validation stratejisi), Q-DP17, Q-DP04, Q-ENV01 ve dev ROOT backfill açık kaldı.
Gerçek DB/HTTP ve tarayıcı doğrulaması yapılmadı; onay test tabanlıdır.

---

# TASK-027.38: Daily analysis engine

## Amaç

Günlük çözünürlük hesaplamasını uygula.

## Wave ve bağımlılık

TASK-027.37

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
