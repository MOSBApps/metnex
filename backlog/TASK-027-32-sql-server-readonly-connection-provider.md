---
id: TASK-027.32
title: Metnex Data-Plane Foundation ve pgSchema Sözleşmesi
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "SQL Server readonly connection provider" (Wave 5) placeholder'ıydı. AI1'in talimatıyla kapsam **data-plane foundation ve pgSchema sözleşmesi** olarak yeniden tanımlandı;
> **SQL Server readonly connection provider bu task'ta yapılmadı** (Wave 5). Orijinal placeholder en altta tarihi kayıt olarak korunmuştur. Talimatta dosya adı verilmemişti; aynı ID'nin mevcut dosyası güncellendi.

## AI2 Teslim Raporu (2026-09-21)

**Uygulama task'ı — sözleşme + saf/port-tabanlı çekirdek + testler. Gerçek PostgreSQL bağlantısı, gerçek port implementasyonu, production migration/apply, Vardiya tablosu, HTTP/CLI/job/startup bağlantısı yok.**

### Değişen / eklenen dosyalar
| Dosya | Değişiklik |
|---|---|
| `apps/api/src/tenant-scope/schema-name.util.ts` | Merkezi identifier yardımcıları genişletildi: `isCustomerSchemaName`/`assertCustomerSchemaName` (tam `cust_<slug>_<8hex>` biçimi; `public`/`information_schema`/`pg_*`/`drizzle` reddi; hata değeri yankılamaz), `schemaNameMatchesCustomerRoot` (isim parmak izi root id'sinden türemiş mi); mevcut fonksiyonlar değişmedi |
| `apps/api/src/data-plane/data-plane-schema.ts` (yeni) | Kod tabanında **`pgSchema()` çağrılan tek yer**: `createDataPlaneSchema`, `dataPlaneSchemaFor(scope)` |
| `apps/api/src/data-plane/data-plane-version.ts` (yeni) | Versiyon sözleşmesi (taban `0000_empty`, `NNNN_ad`, kesin artan zincir, sha256 checksum, `pendingMigrations`) |
| `apps/api/src/data-plane/data-plane-migration.contract.ts` (yeni) | İstek/çıktı tipleri, portlar (tenants/registry/physical/lock/ledger/executor), advisory-lock anahtarı (`metnex:data-plane-migration:<root>`) |
| `apps/api/src/data-plane/data-plane-migration.orchestrator.ts` (yeni) | Port-tabanlı çekirdek `runDataPlaneMigration` — **hiçbir yerden çağrılmaz** |
| `apps/api/src/data-plane/data-plane-foundation.spec.ts` (yeni) | 138 test |
| `docs/migration/METNEX_DATA_PLANE_FOUNDATION_CONTRACT.md` (yeni) | Sözleşme açıklaması |
| `docs/migration/METNEX_DATA_PLANE_READINESS_BLOCKER.md`, `…FANOUT_STANDARD.md`, `BOTC_MIGRATION_OPEN_QUESTIONS.md` | Güncelleme notları (append-only) |

### Data-plane kontratı (özet)
- **pgSchema/identifier:** ad yalnızca `resolve()`/registry'den gelir ve her kullanımdan önce doğrulanır; tablolar `schema.table()` ile şema-nitelikli; `search_path` hiçbir production dosyasında yok; DDL enterpolasyonu yalnızca `quoteIdentifier` ile (statik testler).
- **Runner girdisi:** `{ customerRootTenantId (UUID), mode: DRY_RUN|APPLY, runId }` — hepsi zorunlu, varsayılan yok; wildcard/`all`/liste/ad/boşluk ve **fazladan anahtar** (`isSystemAdmin`, `role`, `tenantIds`…) reddedilir; parametresiz çağrı reddedilir ve hiçbir port çağrılmaz. Kimlik/rol/tenant-scope girdisi yoktur.
- **Kabul kapıları (fail-closed):** tenant ROOT+ACTIVE; registry satırı bu root'a ait; schema adı biçimi ve **root parmak izi**; registry ACTIVE; fiziksel schema var; sürüm zincirde. `ARCHIVED`/`FAILED`/`PROVISIONING`/`SCHEMA_MISSING`/`VERSION_GATE_BLOCKER`/… → hiçbir yazma yok (iki mod için test).
- **DRY_RUN** kilit/ledger/executor/sürüm yazımı yapmaz. **APPLY:** root başına advisory lock → kilit altında yeniden kabul → checksum ön kontrolü → migration başına executor (pgSchema handle) + ledger + sürüm CAS → kilit her koşulda bırakılır. **Idempotency:** ikinci APPLY `NOOP`, ledger tekrarı yok, farklı checksum bloklanır; CAS kaybı sonraki çalıştırmada kayıt atlanarak toparlanır.
- **Registry portunda status değiştiren işlem yok** (yalnızca `get`, `compareAndSetVersion`).
- **Control-plane ayrımı:** data-plane dosyaları `drizzle/migrations`, migrator, `drizzle-kit`, `pg`, `DATABASE_URL`, Nest, HTTP, tenant scope, guard, rol içermez; `migrate.ts` data-plane'e değinmez; hiçbir modül/provider/controller/startup kancası/script/Dockerfile/pipeline data-plane'e referans vermez (testler).

### Güvenlik ve fail-closed testleri (138)
Identifier reddi (hostile/`public`/kısa hex/64+ karakter/tırnak/noktalı virgül) ve değer yankılamama; root↔schema eşleşmesi; pgSchema handle şema-nitelikli (`getTableConfig`); `pgSchema()` tek dosyada, `search_path` yok, DDL enterpolasyonu yalnızca `quoteIdentifier`; versiyon biçimi/sıra/zincir/bekleyen hesabı; 22 geçersiz istek şekli; 19 bloklama durumu × iki mod → sıfır yazma; kilit altında TOCTOU (arşivlenen satır migrate edilmez); DRY_RUN sıfır yazma ve APPLY ile plan uyumu; sıralı uygulama, kilit al/bırak, idempotent tekrar, CAS kaybından toparlanma, checksum uyuşmazlığı, eşzamanlı çalışma (kilit alınamayan bırakmaz), executor hatası (ilerleme korunur, kilit bırakılır, hata metni/secret/schema adı çıktıda yok); yalnızca istenen root'a dokunma; sınır/bağlantısızlık statik testleri.
**Mutasyon kontrolü:** dry-run erken dönüşü, kilit sonrası yeniden kabul, tanı kapısı ve checksum ön kontrolü tek tek kaldırılınca testler başarısız oldu (2/1/19/1), sonra geri alındı.

### Açık kalan Q-DP soruları (hiçbiri kapatılmadı; etkileri sözleşme belgesi §7)
- **Q-DP01:** runner'da yalnızca *migration sıralama ön koşulu* var; uygulama erişim yolunda çalışma zamanı sürüm geçidi yok (`dataPlaneSchemaFor` sürüme bakmaz).
- **Q-DP03:** ARCHIVED runner'da bloklanır; reactivation yok. **Q-DP04:** FAILED/PROVISIONING bloklanır; retry/limit/backoff/job/CLI yok. **Q-DP09:** secret/bağlantı yok; çözüm uygulanmadı.
- **Q-DP02 (data-plane kısmı):** çok müşterili fan-out tetikleyicisi/yetkisi, sayısal parametreler, ayrı migration DB kimliği uygulanmadı.
- **Yeni Q-DP11:** gerçek port implementasyonları (registry/ledger/lock/executor/physical probe), ledger yeri (Q-ID01), kilit granülaritesi, executor transaction sınırı ve **fan-out standardındaki VERIFY aşamasının sözleşmede olmaması** (sürüm her migration sonrası CAS ile ilerliyor).
- **Yeni Q-DP12:** data-plane migration tanımlarının kaynağı/konumu, checksum politikası ve **customer-root id UUID zorunluluğunun** teyidi (UUID dışı id'ler reddedilir).

### AI1'in bilmesi gerekenler
1. **Port-tabanlı orkestrasyon çekirdeği** talimattaki "yalnızca port/interface/kontrat" ifadesini biraz aşıyor: kabul kriterleri (dry-run kalıcı state üretmez, idempotency, sürüm uyuşmazlığı işlem öncesi engel, parametresiz reddi) davranış testi gerektirdiğinden saf orkestrasyon kodu yazıldı. Gerçek portlar yok, hiçbir yerden çağrılmaz, wiring yok (statik testle kilitli); istenirse yalnızca sözleşme bırakılıp çekirdek çıkarılabilir.
2. **Runner UUID zorunlu:** `customerRootTenantId` UUID olmalı (ad/`all`/wildcard reddi için en net kural); UUID dışı tenant id'leri fail-closed reddedilir (Q-DP12).
3. Sürüm her migration sonrası (VERIFY yokken) CAS ile ilerler; fan-out standardındaki "VERIFY sonrası FINALIZE" henüz modellenmedi (Q-DP11).
4. Testler bellek-içi sahte portlarla; gerçek PostgreSQL semantiği (advisory lock, transaction, gerçek `pgSchema` sorguları) `[DOĞRULANAMADI]`.

**Yapılmayanlar:** Vardiya schema/table/migration/seed/repository/API/UI, gerçek production migration/apply, gerçek PostgreSQL/SQL Server bağlantısı, fan-out job, retry job/CLI, ARCHIVED reactivation, DB role/RLS, tenant oluşturma/seed, `search_path`, ham identifier interpolation, secret dosyası çözümü, SQL Server readonly provider (Wave 5), Wave 2/3, Docker, git commit/push.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (**40 suite / 600 test**; önceki 39/462 → +1 suite, +138 test), typecheck/lint/build temiz.

### Durum
`status: done` — AI1 incelemesiyle data-plane foundation ve `pgSchema` sözleşmesi onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.32 kabul edildi ve `done` olarak kapatıldı. Merkezi schema identifier
doğrulaması, tek noktadan `pgSchema()` kullanımı, `search_path` yasağı,
fail-closed admission kapıları, DRY_RUN/APPLY ayrımı, advisory lock, checksum
kontrolü ve idempotency sözleşmesi kabul edildi.

Saf port-tabanlı orchestrator, gerçek port/wiring veya runtime migration değildir;
bu sınır korunmuştur. Gerçek PostgreSQL semantiği, fiziksel probe, ledger/lock/
executor implementasyonları ve fan-out uygulanmamıştır.

Q-DP01, Q-DP02 data-plane ayrıntıları, Q-DP03, Q-DP04, Q-DP09, Q-DP11 ve Q-DP12
açık kalmıştır. Vardiya, SQL Server provider, Wave 2/3, Docker ve git işlemleri
bu task'ın kapsamı dışındadır.

---

# TASK-027.32: SQL Server readonly connection provider

## Amaç

SQL Server read-only provider katmanını uygula.

## Wave ve bağımlılık

TASK-027.9; TASK-027.31

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
