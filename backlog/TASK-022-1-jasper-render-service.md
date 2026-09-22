---
id: TASK-022.1
title: Genel Jasper Render Servisi
status: done
srs_refs: [FEAT-007, FR-013]
updated_at: 2026-09-16
parent_epic: EPIC-002
---

# TASK-022.1: Genel Jasper Render Servisi

## Özet

Mevcut Jasper HTTP çağrısı, demo'ya özel `ReportingService` mantığından ayrılarak
bağımsız ve tekrar kullanılabilir bir render servisi/adapter'ı (`ReportRenderService`)
haline getirildi. Demo kaldırma ve `ReportArtifact`/demo dataset provider silme bu
task'ın kapsamı dışındadır (bkz. TASK-022.2).

## Gerçekleştirilen Değişiklikler

- Jasper HTTP çağrısı `ReportingService`'ten çıkarılıp ayrı bir `ReportRenderService`
  adapter'ına taşındı. `ReportingService` içinde artık doğrudan `fetch` çağrısı yok.
- `ReportRenderService`:
  - `REPORT_RENDER_ENDPOINT` üzerinden çağrı yapar.
  - `REPORT_RENDER_INTERNAL_TOKEN` varsa `Authorization: Bearer` gönderir.
  - `REPORT_RENDER_TIMEOUT_MS` ile `AbortController` tabanlı timeout uygular.
  - Renderer HTTP hata döndürürse `BadGatewayException` üretir.
  - Renderer erişilemezse (bağlantı hatası/timeout) sessiz fallback yapmaz —
    endpoint yapılandırılmışsa fail-closed davranır.
  - `isConfigured()` ve `getHealth()` ile renderer durumunu dışa açar.
- PDF/XLSX MIME type ve dosya adı üretimi `report-output.util.ts` içinde
  merkezileştirildi; hem Jasper yolu hem de mevcut in-process fallback aynı
  yardımcı fonksiyonları kullanıyor.
- `GET /api/v1/reports/renderer/health` endpoint'i aynı rotada korundu, mantığı
  `ReportRenderService.getHealth()`'e devredildi.
- Browser'ın renderer endpoint'ine doğrudan erişmediği değişmedi (çağrı yalnızca
  API katmanından yapılıyor).
- Renderer servisi tenant/authorization kararı vermiyor; bu kararlar API
  katmanında (controller guard'ları) kalmaya devam ediyor.

## Değiştirilen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `apps/api/src/reporting/report-render.service.ts` | Yeni — Jasper render adapter'ı |
| `apps/api/src/reporting/report-output.util.ts` | Yeni — merkezi MIME type / dosya adı yardımcıları |
| `apps/api/src/reporting/report-render.service.spec.ts` | Yeni — adapter'a özel testler |
| `apps/api/src/reporting/reporting.service.ts` | `renderViaJasper`/doğrudan `fetch` kaldırıldı; `ReportRenderService` enjekte edildi |
| `apps/api/src/reporting/reporting.controller.ts` | `renderer/health` artık `ReportRenderService.getHealth()`'i kullanıyor |
| `apps/api/src/reporting/reporting.module.ts` | `ReportRenderService` provider olarak eklendi |
| `apps/api/src/reporting/reporting.service.spec.ts` | Test builder'a `ReportRenderService` enjeksiyonu eklendi |
| `docs/opendevcon/METNEX_STATE.md` | Durum notu güncellendi |
| `docs/opendevcon/PROGRESS_LOG.md` | Yeni append-only kayıt eklendi |

## Test ve Kalite Kanıtı

- `pnpm --filter api exec tsc --noEmit` → 0 hata
- `pnpm --filter api exec jest reporting --runInBand` → 2 suite / 17 test geçti
  - `report-render.service.spec.ts`: isConfigured/getHealth (FALLBACK/CONFIGURED),
    endpoint yokken BadGatewayException, internal token ile/olmadan Authorization
    header davranışı, HTTP 4xx/5xx → BadGatewayException, bağlantı hatasında
    fail-closed, `REPORT_RENDER_TIMEOUT_MS` ile AbortController tabanlı timeout
    (fake timers), content-type fallback ve renderer-provided content-type.
  - `reporting.service.spec.ts`: mevcut senaryolar gerçek `ReportRenderService`
    ile birlikte geçti (Jasper çağrısının yapılması, renderer erişilemezse
    sessiz fallback yapılmaması).

## Docker Kapısı Notu

Bu ortamda Docker kullanılamadığından, kullanıcı kararıyla Docker build adımı
`./scripts/check.sh` çağrısında `--skip-docker` bayrağıyla devre dışı bırakıldı.
Docker build adımının düzeltilmesi/etkinleştirilmesi bu task'ın kapsamında
değildir.

## ./scripts/check.sh --skip-docker Sonucu

```
✓ audit
✓ typecheck
✓ lint
✓ test (api 68/68, web 37/37)
✓ build
⚠ Docker build atlandı (--skip-docker veya Docker yok)

Tüm kontroller geçti — push için hazır ✓
```

## Kalan Riskler / Sonraki Adımlar

- TASK-022.2 — Reporting Dataset Provider Abstraction kapsamında demo'ya özel
  dataset provider ayrıştırması ele alınacak.
- Docker build kapısı bu ortamda doğrulanmadı (kullanıcı kararıyla atlandı).
