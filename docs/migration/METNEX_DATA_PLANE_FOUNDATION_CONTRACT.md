# Data-Plane Foundation ve pgSchema Sözleşmesi (TASK-027.32)

> **Durum: Sözleşme + saf/port-tabanlı çekirdek + testler. Gerçek PostgreSQL bağlantısı, gerçek port implementasyonu, production migration, Vardiya tablosu, HTTP/CLI/job/startup bağlantısı YOK.**
> Q-DP01, Q-DP03, Q-DP04, Q-DP09 **kapatılmadı** ve implementation kararı gibi gösterilmedi (etkileri §7'de). **Tarih:** 2026-09-21 · **Hazırlayan:** AI2
> Zemin: `METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md` (Seçenek C, DEC-0010), `METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`, TASK-027.31 registry durum güvenliği.

## 1. Kod haritası (`apps/api/src`)

| Dosya | Rol |
|---|---|
| `tenant-scope/schema-name.util.ts` (genişletildi) | **Merkezi** identifier yardımcıları: `generateCustomerSchemaName`, `isSafeSchemaIdentifier`, `quoteIdentifier` (mevcut) + yeni `isCustomerSchemaName` / `assertCustomerSchemaName` (tam `cust_<slug>_<8hex>` biçimi; `public`, `information_schema`, `pg_*`, `drizzle` vb. reddedilir; hata mesajı değeri yankılamaz) ve `schemaNameMatchesCustomerRoot` (isim parmak izi bu customer-root tenant id'sinden mi türedi) |
| `data-plane/data-plane-schema.ts` | **Kod tabanında `pgSchema()` çağrılan tek yer.** `createDataPlaneSchema(name)` (yalnızca doğrulanmış customer schema adı) ve `dataPlaneSchemaFor(scope)` (çözümlenmiş scope + root↔schema eşleşmesi) |
| `data-plane/data-plane-version.ts` | Versiyon sözleşmesi: `DATA_PLANE_BASE_VERSION` (= mevcut `0000_empty`), biçim `NNNN_ad`, sıralama, migration zinciri doğrulaması (checksum sha256-hex, kesin artan), `pendingMigrations` |
| `data-plane/data-plane-migration.contract.ts` | İstek/çıktı tipleri, **portlar** (tenants, registry, physical, lock, ledger, executor), kilit anahtarı |
| `data-plane/data-plane-migration.orchestrator.ts` | Port-tabanlı çekirdek `runDataPlaneMigration(request, chain, ports)` — hiçbir yerden çağrılmaz |
| `data-plane/data-plane-foundation.spec.ts` | 138 test (gerçek DB yok; portlar bellek-içi sahte) |

## 2. `pgSchema()` ve identifier sözleşmesi
- Schema adı **asla** kullanıcı/istek girdisinden gelmez; kaynak `resolve()` çıktısı veya registry satırıdır ve her kullanımdan önce `assertCustomerSchemaName` geçer.
- `pgSchema()` yalnızca `data-plane-schema.ts`'te (statik test: tüm production kaynağında tek çağıran). Tablolar `schema.table(...)` ile **şema-nitelikli** tanımlanır (test: `getTableConfig(table).schema === schemaName`).
- **`search_path` hiçbir production dosyasında yok** (statik test). DDL metnine girdi enterpolasyonu yalnızca `quoteIdentifier(...)` üzerinden (statik test `tenant-scope/` ve `data-plane/` için: DDL anahtar sözcüğü içeren her şablon literalindeki her `${…}` `quoteIdentifier(` ile başlamalı).
- `dataPlaneSchemaFor(scope)` bir **scope nesnesi** ister; ham ad kabul etmez; schema başka customer-root'a aitse fırlatır.

## 3. Customer-root ↔ tenant-root doğrulama sözleşmesi
Bir data-plane işlemi ancak şunların **hepsi** doğruysa ilerler: tenant `type = ROOT` **ve** `status = ACTIVE`; registry satırı `customerRootTenantId` = istenen root; `schemaName` `cust_…_<8hex>` biçiminde; **isim parmak izi bu root'un id'sinden türemiş** (`SCHEMA_ROOT_MISMATCH`); registry `ACTIVE`; fiziksel schema var; sürüm bilinen. `PLATFORM_ROOT`/`STANDARD`/pasif tenant `TENANT_NOT_ACTIVE_ROOT` ile bloklanır.

## 4. Versiyon sözleşmesi
Biçim `^\d{4}_[a-z][a-z0-9_]{0,48}$`; taban `0000_empty`; zincir kesin artan ve tabandan sonra; her migration sha256-hex checksum taşır. **Runner ön koşulu:** registry sürümü tabandır veya zincirdeki bir sürümdür — aksi `VERSION_GATE_BLOCKER` (işlem/kilit öncesi); zincirin başındaysa `NOOP`. Bu, **migration sıralama korumasıdır**; uygulama çalışma zamanı sürüm geçidi (Q-DP01, `resolve()`/erişim engeli) **uygulanmadı**.

## 5. Runner sözleşmesi (yalnızca port + saf çekirdek)
- **Girdi:** `{ customerRootTenantId, mode: 'DRY_RUN'|'APPLY', runId }` — hepsi **zorunlu**, varsayılan yok; `customerRootTenantId` **UUID** (tenant id'leri `generateId()` UUID'dir; ad, `*`, `all`, liste, boşluk reddedilir); **fazladan anahtar** (`all`, `tenantIds`, `isSystemAdmin`, `role`…) reddedilir → kimlik/rol/tenant scope girdisi yoktur. Parametresiz çağrı `REJECTED` (hiçbir port çağrılmaz).
- **Sıra:** doğrulama → zincir doğrulaması → salt-okuma kabul (`tenants`, `registry`, `physical`, sürüm) → `NOOP`/`DRY_RUN` burada biter → `APPLY`: **advisory lock** (root başına, ad alanı `metnex:data-plane-migration:` — control-plane kilidinden ayrı) → **kilit altında yeniden kabul** (TOCTOU) → ledger checksum ön kontrolü (`CHECKSUM_MISMATCH`, yazmadan) → migration başına: `executor.apply({ schema: pgSchema handle, … })`, `ledger.recordApplied`, `registry.compareAndSetVersion(beklenen→yeni)` → kilit her koşulda bırakılır (yalnızca alınmışsa).
- **DRY_RUN:** kilit/ledger/executor/sürüm yazımı **yok** (test kanıtlı).
- **Idempotency:** ledger `(customerRootTenantId, version)` benzersiz; ledger'da kayıtlı sürüm yeniden çalıştırılmaz (`skipped`), ikinci `APPLY` `NOOP`; ledger'da farklı checksum → bloklanır, üzerine yazılmaz; CAS başarısızsa (`VERSION_CONFLICT`) sonraki çalıştırma kaydı atlayıp sürümü ilerletir.
- **Status:** `registry` portunda **status değiştiren işlem yoktur** (yalnızca `get` ve `compareAndSetVersion`) → runner ARCHIVED/FAILED/PROVISIONING'i düzeltemez/aktifleştiremez.
- **Fail-closed:** `ARCHIVED`, `FAILED`, `PROVISIONING`, `SCHEMA_MISSING`, `VERSION_GATE_BLOCKER`, `REGISTRY_MISSING`, `REGISTRY_INCONSISTENT`, `SCHEMA_ROOT_MISMATCH`, `TENANT_NOT_ACTIVE_ROOT`, `INVALID_MIGRATION_CHAIN`, `CONCURRENT_RUN` → **hiçbir yazma yok** (her ikisi mod için test). Çıktılar schema adı, hata metni, bağlantı bilgisi içermez.
- **Control-plane ayrımı:** data-plane dosyaları `drizzle/migrations`, migrator, `drizzle-kit`, `pg`, `DATABASE_URL`, Nest, HTTP, tenant scope, guard veya rol kavramı içermez; `migrate.ts` (control-plane entrypoint) data-plane'e hiç değinmez (testler).
- **Bağlantısızlık:** modül/provider/controller/startup kancası/CLI/pipeline/Dockerfile/`package.json` script'i data-plane'e referans vermez; başka hiçbir production dosyası `data-plane/`'i import etmez (testler).

## 6. Bu task'ta olmayanlar (bilinçli)
Gerçek port implementasyonları (registry/ledger/lock/executor/physical probe), data-plane migration dosyaları/klasörü, tetikleyici (CLI/job/pipeline), fan-out (çok müşterili), `resolve()`/erişim yolunda sürüm geçidi, Vardiya schema/tablo, DB role/RLS, gerçek PostgreSQL testi.

## 7. Açık kararların etkisi (hiçbiri kapatılmadı)
| Soru | Bu task'ta durum / etki |
|---|---|
| **Q-DP01** sürüm geçidi | **Açık.** Yalnızca runner'ın *migration sıralama* ön koşulu var; uygulama erişim yolunda sürüm kontrolü **yok** (`dataPlaneSchemaFor` sürüme bakmaz). Yeni müşterinin `0000_empty` ile `ACTIVE` olması ve `ACTIVE` = "head'e ulaşmış" kuralı değişmedi |
| **Q-DP03** ARCHIVED reactivation | **Açık.** `ARCHIVED` runner'da bloklanır; reactivation akışı yok (TASK-027.31 `SCHEMA_ARCHIVED` ile tutarlı) |
| **Q-DP04** FAILED retry | **Açık.** `FAILED`/`PROVISIONING` runner'da bloklanır; retry/limit/backoff/job/CLI yok |
| **Q-DP09** secret dosyası/`docker inspect` | **Açık.** Bu task'ta secret/bağlantı yok; çözüm uygulanmadı |
Yeni: **Q-DP11** (gerçek port implementasyonları: registry/ledger/lock/executor/physical probe — ledger'ın yeri Q-ID01 ile bağlı; kilit granülaritesi: root başına mı global de mi) ve **Q-DP12** (data-plane migration tanımlarının kaynağı/konumu ve checksum politikası; customer-root id'nin UUID zorunluluğunun teyidi).

## 8. Teyit
Gerçek PostgreSQL/SQL Server bağlantısı, Docker, secret, Vardiya tablosu, tenant oluşturma/seed, retry/reactivation, DB role/RLS, git commit/push yapılmadı. `PLATFORM_ROOT`/`isSystemAdmin`/`TENANT_ADMIN` hiçbir yerde yetki olarak kullanılmadı.
