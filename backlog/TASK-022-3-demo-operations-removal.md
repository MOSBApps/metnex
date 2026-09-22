---
id: TASK-022.3
title: Demo Operations Modülünü Projeden Kaldırma
status: done
srs_refs: [FEAT-006, FR-010, FR-011, FEAT-007, FR-012, FR-013]
updated_at: 2026-09-16
parent_epic: EPIC-002
---

# TASK-022.3: Demo Operations Modülünü Projeden Kaldırma

## Özet

Demo Operations modülü; backend, frontend, seed, entitlement, schema, artifact ve dokümantasyon
bağımlılıklarıyla birlikte projeden kaldırıldı. Reporting Foundation (report artifact registry,
dataset provider soyutlaması, Jasper render adapter) korunuyor ve artık demo'ya hiçbir doğrudan
veya dolaylı bağımlılığı yok. Karar kaydı: `docs/decisions/DEC-0012-demo-operations-removal.md`.

## Gerçekleştirilen Değişiklikler

### Backend
- `apps/api/src/demo-operations/` (module, controller, service, testler) tamamen silindi.
- `apps/api/src/db/schema/demo.ts` silindi; `reportArtifacts` tablosu yeni
  `apps/api/src/db/schema/reporting.ts` dosyasına taşındı, `demo_sample_definitions` /
  `demo_sample_transactions` tabloları schema'dan kaldırıldı.
- `app.module.ts`'den `DemoOperationsModule` importu kaldırıldı.

### Reporting
- `DemoTransactionsDatasetProvider` ve reporting modülündeki demo provider DI kaydı kaldırıldı.
  `REPORT_DATASET_PROVIDERS` artık boş bir dizi (varsayılan) — gelecekteki bir domain modülü kendi
  provider'ını kaydedecek.
- `ensureDemoReportArtifact()` ve `DEMO_SAMPLE_TRANSACTIONS` artifact auto-seed'i kaldırıldı.
- `ReportingService.renderDemoHtml` → `renderHtml`, `exportDemo` → `exportReport` olarak yeniden
  adlandırıldı; `DemoReportFilters` → `ReportFilters`. `ReportingModule`, `ReportRenderService`,
  genel `ReportArtifact` API'si ve renderer/health endpoint'i değişmeden korundu.

### Bootstrap / Entitlement
- `bootstrap.service.ts` içinden `ensureDemoSeedFromEnv()` ve çağırdığı her şey kaldırıldı:
  `AIS_ENABLE_DEMO_SEED`, Demo Tenant/Region/Operating Unit seed'i, demo admin kullanıcı, demo rol,
  `AIS_DEMO_PACKAGE`, demo permission seed'leri, demo definition/transaction seed'leri, demo report
  artifact seed'i, demo'ya özel schema provisioning çağrısı. Genel platform bootstrap
  (`bootstrapInitialAdmin`, env-gated system admin bootstrap, builtin role/permission seed) değişmedi.
- `DEMO:*` permission kodları `permission-catalogue.ts` ve `system-role.domain.ts`'den kaldırıldı.
  `REPORT:ARTIFACT:VIEW` / `REPORT:ARTIFACT:EXPORT` korundu.

### Frontend
- `/app/demo`, `/app/demo/definitions`, `/app/demo/transactions` route'ları silindi.
- `nav-config.ts`'den `DEMO_OPERATIONS` nav modülü (dashboard, definitions, transactions, demo
  report linki dahil) kaldırıldı; `console-shell.tsx`'teki demo breadcrumb bloğu kaldırıldı.
- `/app/reports/[id]/view` genel yüzeyi korundu: demo'ya özel `Definition` SearchableSelect
  filtresi ve `/api/v1/demo-operations/definitions` çağrısı kaldırıldı; artifact/provider
  bulunamadığında (HTTP 404) artık kontrollü bir empty state gösteriliyor.

### Database
- Eski migration dosyaları (`0000_initial_baseline.sql`, `0001_elite_boomerang.sql`) değiştirilmedi.
- Yeni forward migration: `apps/api/drizzle/migrations/0002_thick_earthquake.sql`
  (`drizzle-kit generate` ile üretildi, elle DML eklendi):
  - `DROP TABLE demo_sample_definitions CASCADE`
  - `DROP TABLE demo_sample_transactions CASCADE`
  - `DELETE FROM report_artifacts WHERE code = 'DEMO_SAMPLE_TRANSACTIONS'`
  - `DELETE FROM resource_packages WHERE code = 'AIS_DEMO_PACKAGE' AND NOT EXISTS (...)` — yalnızca
    hâlâ bir `customer_subscriptions` satırı tarafından referans alınmıyorsa siliniyor
    (`ON DELETE RESTRICT`); aktif bir demo tenant subscription'ı varsa paket satırı kasıtlı olarak
    yerinde bırakılıyor.

### Dokümantasyon
- `docs/domain/DOMAIN_MODEL.md`, `docs/domain/DB_META.md`, `docs/runbooks/reporting-foundation.md`,
  `docs/README.md`, `docs/AI_Governance/DEPRECATED_MODULES.md` güncellendi.
- `docs/decisions/DEC-0012-demo-operations-removal.md` oluşturuldu. `DEC-0008` (geçmiş karar kaydı)
  değiştirilmedi.
- `backlog/EPIC-002-demo-and-reporting.md` kapsam listesi demo kaldırma notuyla güncellendi (status
  değişmedi, zaten `done`).

## Migration Özeti

| Adım | Etki |
|---|---|
| `DROP TABLE demo_sample_definitions CASCADE` | Tablo ve bağımlı composite FK yok edilir — **veri kaybı, geri alınamaz** |
| `DROP TABLE demo_sample_transactions CASCADE` | Tablo yok edilir — **veri kaybı, geri alınamaz** |
| `DELETE FROM report_artifacts WHERE code = 'DEMO_SAMPLE_TRANSACTIONS'` | Idempotent, satır yoksa no-op |
| `DELETE FROM resource_packages WHERE code = 'AIS_DEMO_PACKAGE' AND NOT EXISTS (...)` | Idempotent; aktif abonelik varsa satır korunur (silinmez) |

**Belgelenmiş beklenen veri kaybı:** `AIS_ENABLE_DEMO_SEED=true` ile daha önce çalıştırılmış bir
ortamda oluşan Demo Tenant/Demo Region/Demo Operating Unit, demo admin kullanıcı, `Demo Operations
Admin` rolü ve bu tenant'ın customer-root data-plane schema'sı bu migration tarafından
**silinmiyor** — tenant/org verisinin yaşam döngüsü bir şema migration'ının kapsamı dışında. Böyle
bir ortamda demo tenant hâlâ mevcuttur; artık gerekmiyorsa platform tenant admin yüzeyinden elle
kaldırılmalıdır. Detay: `docs/AI_Governance/DEPRECATED_MODULES.md` → `Demo Operations` girdisi.

## Kalan Reporting Altyapısı

- `ReportingModule`, `ReportingService` (`renderHtml`/`exportReport`), `ReportingController`
  (`/api/v1/reports/*`, `renderer/health` dahil) — korunuyor.
- `ReportRenderService` (Jasper HTTP adapter, TASK-022.1) — korunuyor, bağımsız çalışıyor.
- `ReportDatasetProvider` / `ReportDatasetResolver` (TASK-022.2) — korunuyor; **varsayılan olarak
  hiçbir provider kayıtlı değil** (`REPORT_DATASET_PROVIDERS` boş dizi). Bir sonraki domain modülü
  kendi provider'ını `apps/api/src/reporting/reporting.module.ts` içinde bu token'a kaydedecek.
- `report_artifacts` tablosu ve genel `ReportArtifact` API sözleşmesi — korunuyor, varsayılan olarak
  boş.

## Authorization Etkisi

- Kaldırılan permission kodları: `DEMO:OPERATIONS:VIEW`, `DEMO:SAMPLE_DEFINITION:{VIEW,CREATE,UPDATE,DELETE}`,
  `DEMO:SAMPLE_TRANSACTION:{VIEW,CREATE,UPDATE,DELETE}` — hem `permission-catalogue.ts`
  (assignable catalogue) hem `system-role.domain.ts` (builtin permission listesi ve
  `SYSTEM_ADMIN`/`TENANT_ADMIN` builtin rol izin listeleri) içinden kaldırıldı.
- Korunan permission kodları: `REPORT:ARTIFACT:VIEW`, `REPORT:ARTIFACT:EXPORT` — reporting
  endpoint'lerindeki VIEW/EXPORT ayrımı (`reporting.controller.ts`) değişmeden korunuyor.
- Var olan `tenant_role_permissions` / `role_permissions` satırlarının kaldırılan `DEMO:*`
  kodlarına referans vermesi mümkündür (migration bunları temizlemiyor); bunlar artık katalogda
  olmayan bir koda işaret eden zararsız artık kayıtlardır.

## Test Sonuçları

- `pnpm --filter api exec jest --runInBand` → **12 suite / 68 test geçti** (önceki 14 suite'ten,
  `demo-operations.service.spec.ts` ve `demo-transactions-dataset.provider.spec.ts` silindiği için
  12'ye düştü; `tenant-isolation-schema.spec.ts`'teki demo'ya özel composite-FK örneği kaldırıldı,
  aynı invariant `platform.ts` örneğiyle hâlâ test ediliyor).
- `pnpm --filter web exec vitest run` → **5 suite / 37 test geçti**. `nav-config.spec.ts` demo
  modülüne bağımlı olmayan sentetik bir `SAMPLE_MODULE` fixture'ı ile yeniden yazıldı;
  `nav-storage.spec.ts`'teki opak test anahtarı `DEMO_OPERATIONS` → `SAMPLE_MODULE` olarak
  değiştirildi.

## ./scripts/check.sh --skip-docker Sonucu

```
✓ audit
✓ typecheck
✓ lint
✓ test (api 68/68, web 37/37)
✓ build (web route sayısı 27 → 24, /app/demo* route'ları kalktı)
⚠ Docker build atlandı (--skip-docker — kullanıcı kararı)

Tüm kontroller geçti — push için hazır ✓
```

## ODC State/Progress Güncellemeleri

- `docs/opendevcon/METNEX_STATE.md` notu bu task'a referans verecek şekilde güncellendi.
- `docs/opendevcon/PROGRESS_LOG.md`'e yeni append-only kayıt eklendi.
- `backlog/EPIC-002-demo-and-reporting.md` kapsam listesi güncellendi (status değişmedi).

## Kalan Riskler / Sonraki Adımlar

- `docs/requirements/SRS.md`, `docs/requirements/DISCOVERY.md`, `docs/project/METNEX_*.json`
  dosyaları hâlâ Demo Operations'a atıfta bulunuyor — bu task'ın "Güncellenecek" listesinde
  değillerdi, kasıtlı olarak dokunulmadı. Gelecekte bu dosyaları da senkronize etmek gerekebilir.
- `docs/domain/DB_META.md`'deki migration register bölümü zaten (bu task'tan önce de) Prisma
  isimlendirmesiyle yazılmış ve gerçek Drizzle migration dosyalarıyla (`0000_initial_baseline`,
  `0001_elite_boomerang`, `0002_thick_earthquake`) birebir eşleşmiyor — bu ön var olan bir
  tutarsızlık, bu task kapsamında sadece demo'ya özel satırlar düzeltildi ve gerçek migration'a
  açık bir not eklendi; tam Prisma→Drizzle numaralandırma uyumu ayrı bir işe bırakıldı.
- Bir önceki `AIS_ENABLE_DEMO_SEED=true` çalıştırmasından kalan demo tenant/kullanıcı/rol verisi
  (varsa) migration tarafından silinmedi — yukarıda belgelendi, manuel kaldırma gerekir.
- Reporting foundation artık varsayılan olarak provider'sız; bir sonraki gerçek domain modülü
  raporlama eklemek isterse kendi `ReportDatasetProvider`'ını kaydetmesi gerekiyor
  (`docs/runbooks/reporting-foundation.md`).
- Docker build kapısı bu ortamda doğrulanmadı (TASK-022.1-R1'den beri kullanıcı kararıyla atlanıyor).
