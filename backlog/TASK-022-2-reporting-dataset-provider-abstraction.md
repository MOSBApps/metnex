---
id: TASK-022.2
title: Reporting Dataset Provider Abstraction
status: done
srs_refs: [FEAT-007, FR-012, FR-013]
updated_at: 2026-09-16
parent_epic: EPIC-002
---

# TASK-022.2: Reporting Dataset Provider Abstraction

## Özet

Reporting katmanı, herhangi bir domain modülüne — özellikle `DemoOperationsService`'e
— doğrudan bağlı olmaktan çıkarıldı. `ReportingService` artık dataset erişimini bir
`ReportDatasetProvider` sözleşmesi ve `ReportDatasetResolver` üzerinden yapıyor. Demo
Operations bu task kapsamında kaldırılmadı; mevcut demo provider'ı geçici bir uyumluluk
(compat) provider'ı olarak korundu.

## Gerçekleştirilen Değişiklikler

- `ReportDatasetProvider<TFilters>` sözleşmesi tanımlandı: `supports(artifactCode)` ve
  `loadDataset(tenantId, filters): Promise<ReportDataset>`.
- Domain-agnostic `ReportDataset` / `ReportDatasetRow` şekli tanımlandı (`no`, `label`,
  `occurredAt`, `status`, `quantity`, `unitPrice`, `amount`) — reporting core artık hiçbir
  domain entity alanına (`transactionNo`, `definitionId` vb.) bağımlı değil.
- Artifact code üzerinden çözümleme yapan `ReportDatasetResolver` eklendi; eşleşen
  provider yoksa kontrollü `NotFoundException` üretiyor.
- `DemoTransactionsDatasetProvider` eklendi — Demo Operations verisine yalnızca
  `DemoOperationsService` üzerinden erişiyor (tablo erişimi yok), `tenantId` boşsa
  `BadRequestException` fırlatıyor, açıkça geçici/uyumluluk provider'ı olarak
  belgelendi.
- `REPORT_DATASET_PROVIDERS` DI token'ı ile provider listesi Nest modülünde
  factory üzerinden sağlanıyor — demo provider dışarıdan (başka bir module
  override'ı ile) değiştirilebilir/genişletilebilir yapıda.
- `ReportingService.renderDemoHtml` ve `exportDemo` artık aynı akışı kullanıyor:
  `getArtifact` → `datasetResolver.resolve(artifact.code)` → `provider.loadDataset(tenantId, filters)`.
  HTML preview ve PDF/XLSX export aynı `ReportDataset` çıktısından üretiliyor.
- Jasper renderer'a gönderilen `rows` payload'ı da artık domain-agnostic
  `ReportDatasetRow[]` şeklinde.

## Değiştirilen/Eklenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `apps/api/src/reporting/dataset/report-dataset.contract.ts` | Yeni — `ReportDataset`, `ReportDatasetRow`, `ReportDatasetProvider` sözleşmesi, `REPORT_DATASET_PROVIDERS` token |
| `apps/api/src/reporting/dataset/report-dataset.resolver.ts` | Yeni — artifact code → provider çözümleyici |
| `apps/api/src/reporting/dataset/demo-transactions-dataset.provider.ts` | Yeni — geçici Demo Operations uyumluluk provider'ı |
| `apps/api/src/reporting/dataset/report-dataset.resolver.spec.ts` | Yeni — provider bulunması/bulunamaması testleri |
| `apps/api/src/reporting/dataset/demo-transactions-dataset.provider.spec.ts` | Yeni — tenant zorunluluğu, mapping, tenant aktarımı testleri |
| `apps/api/src/reporting/reporting.service.ts` | `DemoOperationsService` bağımlılığı kaldırıldı; `ReportDatasetResolver` üzerinden dataset erişimi |
| `apps/api/src/reporting/reporting.module.ts` | `ReportDatasetResolver`, `DemoTransactionsDatasetProvider`, `REPORT_DATASET_PROVIDERS` factory eklendi |
| `apps/api/src/reporting/reporting.service.spec.ts` | Resolver/provider stub'larıyla yeniden yazıldı; tenant aktarımı ve aynı akış testleri eklendi |
| `docs/opendevcon/METNEX_STATE.md` | Durum notu güncellendi |
| `docs/opendevcon/PROGRESS_LOG.md` | Yeni append-only kayıt eklendi |

## Test Sonuçları

`pnpm --filter api exec jest reporting --runInBand` → 4 suite / 27 test geçti:

- `report-dataset.resolver.spec.ts`: provider bulunması (code eşleşmesi), provider
  bulunamayınca `NotFoundException`.
- `demo-transactions-dataset.provider.spec.ts`: `supports()` doğruluğu, `tenantId`
  olmadan `BadRequestException` (ve `DemoOperationsService`'in hiç çağrılmadığı),
  tenant/filtrenin `DemoOperationsService.listTransactions`'a aynen aktarıldığı,
  domain satırlarının generic `ReportDatasetRow` şekline eşlendiği.
- `reporting.service.spec.ts`: resolver'ın artifact code ile çağrıldığı, tenantId'nin
  provider'a aktarıldığı, HTML preview ve export'un aynı provider akışını kullandığı,
  provider bulunamayan artifact'te kontrollü hata, XLSX/Jasper/fail-closed senaryoları
  (TASK-022.1'den korunan davranış).
- `report-render.service.spec.ts`: değişmedi, aynen geçti.

## ./scripts/check.sh --skip-docker Sonucu

```
✓ audit
✓ typecheck
✓ lint
✓ test (api 78/78, web 37/37)
✓ build
⚠ Docker build atlandı (--skip-docker veya Docker yok — kullanıcı kararı)

Tüm kontroller geçti — push için hazır ✓
```

## Mimari Kısıtlara Uyum

- Demo Operations kaldırılmadı; `DemoTransactionsDatasetProvider` geçici
  uyumluluk provider'ı olarak korundu.
- Database şema değişikliği yapılmadı.
- `ReportArtifact` modeli değişmedi.
- Authorization/tenant scope kontrolleri gevşetilmedi; `tenantId` provider'a
  her çağrıda açıkça aktarılıyor ve boşsa reddediliyor.
- Provider, Demo Operations tablolarına doğrudan erişmiyor; yalnızca
  `DemoOperationsService` üzerinden.
- Reporting core (`ReportingService`, HTML/PDF/XLSX üretimi) artık domain
  entity alanlarına değil, generic `ReportDatasetRow` alanlarına bağımlı.
- Yeni bağımsız bir domain modülü oluşturulmadı; provider/resolver mevcut
  `reporting` modülü altında.

## Kalan Riskler / Sonraki Adımlar

- Demo Operations ve `DemoTransactionsDatasetProvider`'ın kaldırılması ayrı bir
  task'a bırakıldı (Demo kaldırma bu task'ın kapsamında değildi).
- Docker build kapısı bu ortamda doğrulanmadı (kullanıcı kararıyla atlandı,
  TASK-022.1-R1'de belgelendi).
