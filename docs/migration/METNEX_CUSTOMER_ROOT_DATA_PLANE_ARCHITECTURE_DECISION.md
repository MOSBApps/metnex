# Customer-Root Data-Plane Foundation — Mimari Karar Paketi (TASK-027.26)

> **Durum: Karar/tasarım paketi. `pgSchema()`, dinamik schema erişimi, migration runner, `shift_reports` schema'sı,
> tablo, tenant, mapping kaydı veya gerçek DB bağlantısı YAZILMAMIŞTIR.** AI2 hiçbir soruyu kapatmaz; öneriler
> AI1/PO seçimi yapılana kadar bağlayıcı değildir. DEC-0010'un "Phase 5-9 pending review before implementation" durumu
> korunur — bu belge o inceleme için girdi hazırlar, onun yerine geçmez.

**Tarih:** 2026-09-21 · **Hazırlayan:** AI2
**Eşlik eden belgeler:** `METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`, `METNEX_DATA_PLANE_READINESS_BLOCKER.md`

**Okunan kanıtlar:** `DEC-0009/0010/0011`, `docs/domain/DB_META.md`, `db/schema/platform.ts` (`customerSchemaRegistry`,
`tenantClosure`), `db/{db.service,db.module}.ts`, `tenant-scope/{customer-schema-registry.service,tenant-scope.service,
tenant-closure.service,schema-name.util,tenant-scope.constants}.ts` + spec'ler, `platform/saas.service.ts`, `apps/api/drizzle.config.ts`,
`apps/api/package.json`, `drizzle/migrations/*`, `drizzle-orm/migrator.d.ts`, `scripts/{backup-db,restore-db}.sh` (adları), TASK-027.22–25 paketleri.

---

## 1. Mevcut altyapı envanteri (kanıtlı)

| Soru | Cevap | Kanıt |
|---|---|---|
| Schema provisioning mevcut mu? | **Evet, yalnızca boş schema oluşturma.** `ensureSchemaProvisioned` registry satırını `PROVISIONING` yazar, `CREATE SCHEMA IF NOT EXISTS` çalıştırır, `ACTIVE`/`FAILED` işaretler. Schema içine **tablo oluşturulmaz** | `customer-schema-registry.service.ts:20-83` |
| Tek çağıran? | **Evet:** yalnızca `SaasService.createCustomerTenant` (tenant satırı commit edildikten **sonra**, transaction dışında) | `saas.service.ts:310` (grep: başka çağıran yok) |
| `pgSchema()` / dinamik schema erişimi? | **Yok.** Repoda kullanım yok. `DbService` tek `Pool` + `drizzle(pool, { schema })`; tüm tablolar `public` | grep `pgSchema` boş; `db.service.ts:14-18` |
| Migration fan-out? | **Yok.** Yalnızca `drizzle-kit generate/migrate` (`drizzle.config.ts` tek `out: ./drizzle/migrations`, tek schema); `dev.sh` `pnpm --filter api db:migrate` çağırır; data-plane runner yok | `package.json:14-15`, `drizzle.config.ts`, `dev.sh:504` |
| Registry ↔ fiziksel schema doğrulaması? | **Yok.** `information_schema`/`pg_namespace` sorgusu yok; `getActiveRegistry` yalnızca registry satırının `ACTIVE` olduğuna bakar. Fiziksel schema silinse/oluşmasa da `resolve()` başarılı döner | grep boş; `getActiveRegistry` |
| `migrationVersion` izlenmesi? | Yalnızca provisioning anında sabit `'0000_empty'` yazılır; sonradan hiçbir mekanizma güncellemez/doğrulamaz | `tenant-scope.constants.ts` |
| Durum izleme (`ACTIVE/FAILED/PROVISIONING/ARCHIVED`) | Kolon + `lastError`; **izleme/alarm/dashboard yok**; DEC-0010: "failure mode to monitor" ama izleyici yok | `platform.ts` registry, DEC-0010 §Consequences |
| Root/customer-root ayrımı | `tenants.type` (`PLATFORM_ROOT/ROOT/STANDARD`), `customerRootId`; `resolve()` PLATFORM_ROOT → 403, registry'yi `tenant.customerRootId` ile bulur; `tenant_closure` self+ata satırları | `tenant-scope.service.ts`, `tenant-closure.service.ts` |
| Migration failure retry/rollback? | Provisioning: **retry var** (FAILED satır yeniden denenir, idempotent). Data-plane migration: **hiç yok** (tasarım DEC-0010 §9: "designed, not built") | spec: "retries a FAILED registry row" |

### 1.1 Bu task'ta bulunan riskler/bulgular

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| **D1** | **`ARCHIVED` registry satırı sessizce yeniden `ACTIVE` olur.** `ensureSchemaProvisioned` yalnızca `ACTIVE`'i erken döndürür; `ARCHIVED` satır upsert → `PROVISIONING` → `CREATE SCHEMA IF NOT EXISTS` → `ACTIVE`. Arşivlenmiş bir müşteri schema'sı yanlışlıkla canlanabilir. Spec'te `ARCHIVED` senaryosu yok | `customer-schema-registry.service.ts:35-63`, spec başlıkları | Mevcut (Phase 1-4) davranış hatası; data-plane'e iş verisi girmeden düzeltilmeli → Q-DP03 |
| **D2** | **`FAILED` registry için otomatik retry yolu yok.** Tek çağıran tenant oluşturma akışı; başarısız provisioning'de isteğin kendisi hata döner ama tenant kalır ve kimse `ensureSchemaProvisioned`'ı yeniden çağırmaz (job/endpoint/CLI yok) | `saas.service.ts:310`, grep | Müşteri-root tenant var, data-plane erişilemez (fail-closed) ve kendiliğinden iyileşmez → Q-DP04 |
| **D3** | **Schema bir isim alanı sınırıdır, ayrıcalık sınırı değil.** Tek `Pool`, tek DB rolü; cross-customer izolasyon `pgSchema(schemaName)`'i **doğru** kurmaya bağlı. Yanlış/karıştırılmış `schemaName` başka müşterinin verisini okur | `db.service.ts` (tek `DATABASE_URL` pool) | Güvenlik sınırı **uygulama katmanı** doğruluğuna dayanır → §4 sertleştirme seçenekleri, Q-DP05 |
| **D4** | **`resolve()` closure tutarlılığını doğrulamıyor.** `getDescendantTenantIds` `customerRootTenantId` filtrelemez; `tenants.customerRootId` ↔ `tenant_closure.customerRootTenantId` tutarlılığı kontrol edilmez. Schema-per-customer altında başka müşterinin tenant ID'leri bu schema'da satır bulamayacağından veri sızıntısı **oluşmaz** (schema birincil sınır), ama tutarsız veri sessiz kalır | `tenant-closure.service.ts:43-49`, `tenant-scope.service.ts` | Test/guard önerisi (§5); yeni scope mekanizması **değil** |
| **D5** | **DEC-0010 metni kısmen eski.** DEC-0010 §8 "Prisma control-plane'de kalır, Drizzle yalnızca data-plane" der; DEC-0011 (full Drizzle) bunu geçersiz kıldı ve kod tamamen Drizzle | `DEC-0010 §8`, `DEC-0011`, kod | "İki ORM" sonucu artık geçerli değil; Phase 5 incelemesinde DEC-0010 metni güncellenmeli → Q-DP06 |
| **D6** | **Phase 7-9 tanımsız.** DEC-0010 yalnızca Phase 5 (data-plane Drizzle) ve 6 (settings inheritance) içeriğini tarif eder; `DB_META.md` 5-9'u "data-plane move, settings inheritance, reporting adaptation" diye özetler. Phase 7-9'un kapsamı belgelenmemiş | `DEC-0010`, `DB_META.md:365` | "Phase 5-9 hazır" ifadesi ölçülemez → kapsam AI1 tanımı gerekir (Q-DP06) |
| **D7** | **Repo'da geliştirme varsayılan bağlantı bilgisi sabit yazılı** (`drizzle.config.ts` `defaultDbUrl`). Değer bu belgeye **kopyalanmadı** | `drizzle.config.ts:5` | Güvenlik hijyeni bulgusu; production'da `DATABASE_URL` zorunlu kılınmalı mı → Q-DP07 |
| **D8** | **Ön-DEC-0010 tenant'lar için closure/registry backfill yok** ("Tenants created before this migration do not get backfilled") | `DEC-0010 §Consequences` | Mevcut ortamda eski tenant'lar `resolve()`'da fail-closed → Q-V20'yi güçlendirir |

---

## 2. Data-plane mimari seçenekleri

Tanımlar: **A** her customer-root için ayrı schema (schema **içinde** tenant ayrımı yok — yalnızca müşteri sınırı) ·
**B** tek `public` schema + `tenantId` filtreleri (DEC-0009 baseline) · **C** customer-root schema **+** schema içinde
`tenantId` filtreleri (**DEC-0010'un yazılı tasarımı**) · **D** geçiş dönemi hibriti (önce B, sonra C).

| Kriter | A | B | C (DEC-0010) | D |
|---|---|---|---|---|
| Cross-customer isolation | Güçlü (schema sınırı; ayrıcalık değil, D3) | Zayıf (yalnızca `tenantId` disiplini) | Güçlü (A ile aynı) | Geçişte zayıf, sonra güçlü |
| Intra-customer isolation | **Yok** (MOSB/MOSBİO/MOSEDAŞ aynı tabloda ayrımsız) → DEC-0009 md.1 ve D-005 ile **uyumsuz** | `tenantId` filtresi | `tenantId NOT NULL` + filtre + closure scope | Geçişte B, sonra C |
| `TenantScopeService` entegrasyonu | `schemaName` kullanır, `dataScopeTenantIds` kullanmaz → aggregation/child scope çalışmaz | `dataScopeTenantIds` yeter, `schemaName` boşta | İkisini de kullanır (tasarlanan yol) | İki yol |
| Root aggregation | Anlamsız (ayrım yok) | `canAggregateChildren`+closure | `canAggregateChildren`+closure, tek schema içinde | Karışık |
| Migration fan-out | Gerekli (fan-out runner) | Gerekmez (tek migration) | Gerekli | İki mekanizma |
| Rollback | Schema başına karmaşık | Tek (mevcut) | Schema başına; forward-fix/backup ağırlıklı | En zor |
| Backup/restore | `pg_dump -n <schema>` ile müşteri bazlı mümkün | Tüm-DB (mevcut `backup-db.sh`); müşteri bazlı çıkarım zor | A ile aynı; müşteri bazlı restore **avantajı** | Karışık |
| Test harness | Çok-şemalı harness gerekir | En kolay | Çok-şemalı harness gerekir | En zor |
| Connection/pool maliyeti | Tek pool (schema `pgSchema` ile nitelenir) → düşük; `search_path` kullanılmazsa bağlantı başına maliyet yok | Düşük | Düşük | Düşük |
| `PLATFORM_ROOT` operasyonları | Data-plane'e **erişemez** (F5, mevcut `resolve()` 403) | Tablo `public` — platform operatörü SQL ile görebilir; uygulama yolunda `resolve()` yine 403 | A ile aynı | — |
| Audit/observability | Schema başına gözlem gerekir | Tek yer | Schema başına + `tenantId` | — |
| Tenant provisioning ilişkisi | İki adımlı (tenant → schema), D2 | Etkisiz | İki adımlı, D2 | — |
| **DEC-0010 uyumu** | **Uyumsuz** (§5: intra-customer `tenantId`/closure kaybolur; DEC-0009 md.1) | **Uyumsuz** (DEC-0010'un reddettiği baseline; §2 iş tabloları data-plane'e) | **Uyumlu** | Yalnızca geçici sapma |

**Uyumsuzluk notu:** A, DEC-0010 §5-7'nin hiyerarşik scope tasarımını bozduğu; B, DEC-0010'un kapattığı cross-customer riski açık
bıraktığı için uyumsuzdur. D yalnızca **yazılı çıkış kriteriyle** savunulabilir.

### 2.1 AI2 önerisi (karar değil): **C** — DEC-0010'un mevcut tasarımı
Gerekçe: cross-customer sınırı schema'ya iner; intra-customer ayrım DEC-0009 standardıyla korunur (`tenantId NOT NULL`, lider index);
`TenantScopeService` iki çıktısını da (`schemaName`, `dataScopeTenantIds`) kullanır; müşteri bazlı backup/restore mümkün; connection
maliyeti artmaz. **Riskler:** fan-out ve harness altyapısı yok (§1); schema ayrıcalık sınırı değil (D3); Phase 5-9 tanımsız kısımlar
(D6). **Geri dönüş:** C→B iş verisi henüz yokken **ucuz**, veri varken yüksek → **karar iş verisi yazılmadan önce verilmeli**.
**Sertleştirme seçenekleri (karar değil):** H1 müşteri-başına DB rolü + `SET LOCAL ROLE` (D3'ü ayrıcalık sınırına çevirir, pool/rol yönetimi
maliyeti; DEC-0010 §12 RLS/`SET LOCAL` ile birlikte değerlendirilmeli), H2 RLS (DEC-0010 ertelemiş), H3 yalnızca uygulama katmanı disiplini +
`schemaName`'in **yalnızca** `resolve()` çıktısından alınması + statik test. AI2 önerisi: **başlangıçta H3, H1'i ayrı karar olarak aç**.

**Karar için gereken:** AI1/PO — Phase 5-9 kapsam tanımı, C onayı, H1/H2 zamanlaması. **Durum: AÇIK.**

---

## 3. İlgili açık sorular — karar paketi konumları (hiçbiri kapatılmadı)

| Soru | Bu paketten çıkan durum | AI2 önerisi (karar değil) |
|---|---|---|
| **Q-V11** iş verisi data-plane'de mi | Seçenek C (bu belge) TASK-027.25'in "C iş verisi data-plane + metadata public"ı ile tutarlı; **ön koşul** fan-out/harness/registry doğrulama (§6 blocker) | Data-plane; altyapı Vardiya'dan **önce** |
| **Q-V20** tenant + registry mevcut mu | Repodan cevaplanamaz `[DOĞRULANAMADI]`. ROOT tenant `createCustomerTenant` ile yaratılırsa registry provizyonu tetiklenir (D2: başarısızlıkta FAILED kalabilir); pre-DEC-0010 tenant'larda closure/registry backfill yok (D8) | Apply öncesi salt-okuma preflight (registry `ACTIVE` **ve fiziksel schema var**, closure tutarlı) — `BLOCKED` kuralı |
| **Q-V21** mapping/control-plane metadata | Mapping `public` control-plane'de (PLATFORM_ROOT yönetebilir, F5) — TASK-027.25 M2 ile tutarlı | `public` mapping tablosu |
| **Q-ID01** staging ve ledger | Ledger (PII'siz, kalıcı) `public`; payload staging data-plane (iş verisi düzlemi). **Fan-out run ledger'ı** (§ fan-out standardı) control-plane `public`'te olmalı: platform operatörü görebilmeli | Düzleme göre ayrım |
| **Q-V25** mantıksal anahtar → `tenantId` | Data-plane kapsamı `tenantId` ile çalıştığından mapping `tenantId` FK'ye dayanmalı; slug bilgi amaçlı | `tenantId` ile bağla |
| **Q-V16** unresolved yönetimi | Data-plane'de unresolved satır tutulmaz (N1: staging'de; staging de data-plane) → yönetim aracı **schema içeriğine erişim** ister, PLATFORM_ROOT'un erişimi yok (mevcut `resolve()` değişmez, yeni bypass yazılmaz) | Yönetim yalnızca **mapping düzeltme + yeniden çözümleme** (yeni yetki yok); veri incelemesi gerekiyorsa müşteri-root yöneticisi yolu ayrı karar |
| **Q-V12** audit tenant scope | Audit `public` tek sink (F7); data-plane audit tablosu PLATFORM_ROOT denetimini engeller | `metadata.tenantId` (+ gerekirse additive kolon) |

## 4. Güvenlik sınırı — kural karşılıkları

| Kural | Karşılık |
|---|---|
| Schema adı kullanıcı girdisinden alınmaz | `schemaName` yalnızca registry satırından (`resolve()` çıktısı) gelir; hiçbir DTO/param/header schema adı taşımaz |
| `schema-name.util` allowlist | `isSafeSchemaIdentifier` (`^[a-z_][a-z0-9_]{0,62}$`) her `pgSchema()`/DDL çağrısından **önce** zorunlu; `quoteIdentifier` yalnızca ham DDL'de. Mevcut spec 14 senaryo (hostile input dahil) bunu kanıtlıyor |
| `pgSchema()` yalnızca doğrulanmış adla | Tek fabrika fonksiyonu (gelecek) `resolve()` sonucu + `isSafeSchemaIdentifier` kontrolü olmadan tablo nesnesi üretmez; başka yerde `pgSchema` kullanımı statik test ile yasak |
| Scope çözülmeden data-plane sorgusu yok | Fabrika `TenantScopeResult`'ı **parametre olarak** ister (tip düzeyinde zorunlu); ham `tenantId`/`schemaName` alan overload yok |
| PLATFORM_ROOT yeni bypass yok | `resolve()` değişmez; data-plane fabrikası PLATFORM_ROOT için ayrı yol açmaz |
| `isSystemAdmin` ≠ data-plane erişimi | Guard true dönse de fabrika `resolve()` sonucu ister (kontrat R8) |
| Customer-root sınırı ≠ tenant scope sınırı | **İki ayrı katman:** (1) schema = customer-root sınırı (`resolve().schemaName`), (2) `tenantId IN dataScopeTenantIds` = müşteri **içi** kapsam. Biri diğerinin yerine geçmez; ikisi de zorunlu |
| Mapping/unresolved erişim üretmez | N1 (TASK-027.25 §2.2) + K1–K12 |
| Secret/connection string yazılmaz | D7 değeri kopyalanmadı; bu belgede yalnız kod yolu ve bulgu var |

## 5. Test stratejisi (uygulama yok; harness sonrası)

Mevcut saf/unit kapsam: `schema-name.util.spec.ts` (14 senaryo: hostile input, uzunluk, güvenli-doğrulama, quote), `customer-schema-registry.service.spec.ts`
(6: yok, non-ROOT, ACTIVE no-op, başarı, FAILED retry, `CREATE SCHEMA` hatasında FAILED), `tenant-scope.service.spec.ts` (8). Bu belge **yeni test/prod kodu eklemedi**:
fan-out/`pgSchema` henüz yok, mevcut kapsam yeni bir üretim kodu olmadan genişletilemez; `ARCHIVED` (D1) için test yazmak ya kusurlu mevcut davranışı sabitler ya da
başarısız test bırakır — ikisi de yanlış; önce karar (Q-DP03).

| Senaryo | Katman | Mevcut kapsam | Boşluk/plan |
|---|---|---|---|
| Registry yok | saf/in-memory | `resolve()` spec ("no ACTIVE registry") | Var |
| Registry `ACTIVE` değil (`PROVISIONING/FAILED/ARCHIVED`) | saf | `resolve()` yalnızca "ACTIVE yok" | Durum başına ayrı test (özellikle `ARCHIVED`) |
| Schema adı geçersiz | saf | util spec | Fabrika (gelecek) için: geçersiz ad → fırlat, sorgu yok |
| Customer-root bulunamıyor | saf | `resolve()` spec | Var |
| Tenant closure hatalı/tutarsız | saf | Yok (D4) | Closure ↔ `customerRootId` tutarlılık testi/guard önerisi |
| Tek schema migration'ı başarısız | in-memory fake runner | Yok | Fan-out standardı §5 |
| Birden fazla schema başarısız | in-memory | Yok | Global status/halt politikası testi |
| Retry | in-memory | Provisioning retry var | Fan-out retry, idempotent no-op |
| Idempotent tekrar | in-memory | Provisioning idempotent var | `APPLIED` schema'da NOOP |
| Checksum değişikliği | in-memory | Yok | Uygulanmış migration dosyası değişince `CHECKSUM_MISMATCH` (uygulanmaz) |
| Cross-customer schema erişim denemesi | **gerçek PG gerekir** | Yok | Çok-şemalı integration harness: müşteri A `resolve()` sonucu ile B tablosuna erişilemez |
| PLATFORM_ROOT | saf | `resolve()` spec | Fabrika PLATFORM_ROOT'ta fırlatır |
| `isSystemAdmin` bypass | saf/controller | Yok (Vardiya-öncesi) | TASK-027.30 girdisi |
| Tenant scope ↔ customer-root uyuşmazlığı | saf | Yok (D4) | `dataScopeTenantIds` içindeki her tenant aynı customer root'a ait mi doğrulaması (yeni guard önerisi, yeni mekanizma değil) |

Gerçek DB entegrasyon testi **bu task'ta açılmadı**; ayrı harness task'ının kapsamıdır.

## 6. Vardiya entegrasyon sırası (öneri)
1 data-plane foundation kararı (bu paket, AI1/PO) → 2 registry doğrulama (fiziksel schema, D1/D2 düzeltmeleri) → 3 fan-out migration runner →
4 per-schema test harness → 5 control-plane mapping/ledger → 6 Vardiya schema → 7 Vardiya repository → 8 Vardiya API/service.
Ayrıntı, bağımlılık ve dosya listesi: `METNEX_DATA_PLANE_READINESS_BLOCKER.md`.

## 7. Teyit
`apps/` altında dosya eklenmedi/değiştirilmedi; `pgSchema()`/dinamik schema/migration runner/`shift_reports` schema/tablo/tenant/mapping/seed, gerçek
PostgreSQL/SQL Server bağlantısı, API/UI/email/archive migration/permission catalogue, Wave 2/3, Docker, git commit/push yok. Gerçek tenant/secret/
connection string yazılmadı. Kapatılan soru yok; Q-V11/V12/V16/V20/V21/V25/ID01 karar bekliyor.
