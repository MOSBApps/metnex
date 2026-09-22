---
id: TASK-022.4
title: Jasper Render Service Deployment ve Internal Contract
status: done
srs_refs: [FEAT-007, FR-012, FR-013]
updated_at: 2026-09-17
parent_epic: EPIC-002
---

# TASK-022.4: Jasper Render Service Deployment ve Internal Contract

> **Durum: done (AI1 final onayı, 2026-09-17).** AI1'in bu task'ı `blocked`'a çektiği inceleme
> (2026-09-16), gerçek bir Jasper renderer image/source olmadan kanıtlanamayan yedi maddeyi
> listelemişti: gerçek `/render` endpoint'i, gerçek `/health` endpoint'i, internal network
> izolasyonu, renderer token doğrulamasının uçtan uca çalıştığı, non-root çalışma, CPU/memory
> limitleri, gerçek PDF/XLSX render çıktısı. TASK-022.5
> (`backlog/TASK-022-5-jasper-renderer-service.md`) bu renderer'ı gerçekten inşa etti
> (`services/jasper-renderer/`) ve yedi maddenin tamamını gerçek bir çalışan container'a karşı
> doğruladı; TASK-022.5-R1 (`backlog/TASK-022-5-R1-api-renderer-template-registry-alignment.md`)
> ardından API ve renderer'ın template allowlist'lerini hizalayıp gerçek bir
> API → ReportingService → ReportRenderService → renderer uçtan uca akışını (curl değil, gerçek
> kod yolu) doğruladı: gerçek PDF/XLSX çıktısı, `templatePath`'in hiç gönderilmediği, yanlış
> token/bilinmeyen template için kontrollü hata davranışı. Status önce `blocked` → `review`
> (2026-09-16), TASK-022.5-R1'in AI1 tarafından incelenip onaylanmasının ardından
> `review` → `done` olarak güncellendi (2026-09-17, AI1 talimatı). Detaylı kanıt:
> `backlog/TASK-022-5-jasper-renderer-service.md`, `backlog/TASK-022-5-R1-api-renderer-template-registry-alignment.md`.

## Mevcut Bulgu (Zorunlu Ön Kontrol)

Bu task'ın ilk adımı olarak repository'de mevcut bir Jasper renderer image/source/compose service
arandı:

- `find . -iname "Dockerfile*"` → yalnızca `apps/api/Dockerfile`, `apps/web/Dockerfile`.
- `grep -rli "jasper\|renderer" infra .github` → `infra/docker/*.yml` içinde ve
  `.github/workflows/pipeline.yml` içinde **hiçbir** `report-renderer`/`jasper` referansı yok.
- `infra/docker/docker-compose.{dev,test,swarm,infra,registry,dev-stack}.yml` incelendi — yalnızca
  `postgres`, `redis`, `minio`, `metnex-api`, `metnex-web`, `registry` servisleri tanımlı.

**Sonuç: repository'de gerçek bir Jasper renderer image/source/compose service bulunmuyor.**
Görev tanımındaki "Önemli sınır" gereği bu task, mevcut olmayan bir Jasper motoru/framework'ü
varsayarak üretmedi. Bunun yerine:

1. API adapter'ının (`ReportRenderService`) bu sözleşmeyle uyumlu hale getirilmesi (kod).
2. Renderer HTTP sözleşmesinin ve deployment wiring gereksinimlerinin belgelenmesi (dokümantasyon,
   gerçek bir compose service **eklenmeden**).
3. Adapter tarafında uygulanabilecek güvenlik sınırlarının (template allowlist, zorunlu token,
   payload/satır sınırları, runtime format doğrulaması) gerçek kod olarak eklenmesi.

yapıldı. Docker compose dosyalarına sahte bir `report-renderer` servisi **eklenmedi**.

## Gerçekleştirilen Değişiklikler

### 1. Renderer HTTP Contract (dokümantasyon)
`docs/runbooks/reporting-foundation.md` içine tam sözleşme eklendi: `POST /render` istek/yanıt
şeması (`artifactCode`, `templateId`, `format`, `rows`), başarı/hata yanıtları, `Content-Type`/
`Content-Disposition` beklentileri, `GET /health`, `Authorization: Bearer` zorunluluğu.

### 2. API Adapter Uyumu (kod)
- `ReportRenderInput.templatePath` → `templateId` olarak değiştirildi (`report-render.service.ts`).
  Artık **hiçbir filesystem path'i renderer'a gönderilmiyor**.
- Yeni `TemplateRegistryService` (`apps/api/src/reporting/templates/template-registry.ts`):
  - `templateId` yalnızca `^[a-z0-9-]{1,64}$` deseniyle kabul edilir (path traversal reddedilir).
  - Yalnızca `TEMPLATE_ALLOWLIST` içindeki id'ler çözümlenir (varsayılan: boş — hiçbir template
    ship edilmiyor, Demo Operations'ın jrxml'i TASK-022.3'te kaldırıldı).
  - Çözümlenen dosya içeriği gerçek JRXML sandbox kurallarına (yasaklı token listesi + 256KB boyut
    sınırı) karşı doğrulanır — önceki `sanitizeJrxml()` sahte/hardcoded literal kontrolü kaldırıldı.
  - Dosya okuma yalnızca `templates/` dizini içinde kalacak şekilde savunmalı olarak sınırlandı.
- `ReportingService.exportReport`: `artifact.templatePath` artık yalnızca "bu artifact template
  gerektirir" bayrağı olarak kullanılıyor; gerçek template `artifact.code.toLowerCase()` ile
  allowlist üzerinden çözümleniyor. Allowlist'te yoksa kontrollü `NotFoundException`.
- `REPORT_RENDER_INTERNAL_TOKEN` artık zorunlu: `REPORT_RENDER_ENDPOINT` set ama token yoksa API
  renderer'ı hiç çağırmadan `BadGatewayException` ile fail-closed olur.
- Render payload sınırları: satır sayısı ≤ 5000, serileştirilmiş boyut ≤ 10MB — aşımda
  `BadRequestException`, renderer'a istek gitmiyor.
- Runtime format doğrulaması: `exportReport`'a route param üzerinden gelen `format` artık
  `RENDERABLE_FORMATS` listesine karşı çalışma zamanında doğrulanıyor (TS union tipi route param
  için çalışma zamanında zorlanmıyordu).
- `buildReportFileName` sertleştirildi: `Content-Disposition` için güvenli olmayan karakterler
  temizleniyor (header injection'a karşı savunma).

### 3. Deployment Wiring (dokümantasyon, kod DEĞİL)
Gerçek renderer image/source bulunmadığı için `infra/docker/*.yml` dosyalarına **hiçbir servis
eklenmedi**. Bunun yerine:
- `docs/runbooks/reporting-foundation.md` → "Deployment Wiring Checklist" bölümü: port publish
  yasağı, internal network zorunluluğu, secret injection, non-root, resource limitleri, template/
  çıktı mount kontrolleri.
- `docs/runbooks/deployment.md` → yeni "## 19. Report Renderer (Henüz Provizyon Edilmedi)" bölümü:
  bulgunun özeti + bu repo'daki mevcut servislerle (metnex-api/metnex-web) birebir eşleşen
  kontrol listesi.
- `apps/api/.env.example` → `REPORT_RENDER_*` değişkenleri yorum satırı olarak (varsayılan devre
  dışı) eklendi.

### 4. JRXML Güvenlik Sınırı
Adapter tarafında uygulanabilen kısım (kod): allowlist + gerçek içerik sandbox kontrolü + boyut
sınırı (yukarıda). Renderer process'inin kendisinin uygulaması gereken kısım (SQL/JDBC engelleme,
arbitrary network erişimi engelleme, render-time timeout) dokümante edildi ama bu repo'da
uygulanamaz — çünkü uygulanacak bir renderer process'i yok (bulgu).

### 5. Testler
46 yeni/güncellenmiş reporting testi (toplam 5 suite):
- `template-registry.spec.ts` (yeni): benign içerik kabul, 10 farklı yasaklı JRXML token'ı
  reddedilir, oversized template reddedilir, path traversal (`../../etc/passwd`, URL-encoded,
  mutlak path) reddedilir, geçersiz karakter içeren id reddedilir, bilinmeyen (ama iyi biçimli)
  template id → `NotFoundException`.
- `report-render.service.spec.ts` (güncellendi): geçerli PDF/XLSX render, eksik token → fail-closed
  `BadGatewayException` (fetch hiç çağrılmıyor), `templateId` payload'da (`templatePath` yok),
  oversized satır sayısı → `BadRequestException`, oversized serileştirilmiş payload →
  `BadRequestException`, timeout/abort, health.
- `reporting.service.spec.ts` (güncellendi): geçersiz format → `BadRequestException`, allowlist'te
  olmayan template id → `NotFoundException`, Jasper çağrısında `templatePath` alanının hiç
  gönderilmediği doğrulaması, mevcut senaryolar (provider bulunamama, fail-closed, aynı dataset
  akışı) korundu.
- `report-render-network-boundary.spec.ts` (yeni, statik): `apps/web` kaynak kodunun
  `REPORT_RENDER_ENDPOINT`/`REPORT_RENDER_INTERNAL_TOKEN`/`report-renderer` referansı
  içermediğini, ve API tarafında bu env değişkenlerinin yalnızca `report-render.service.ts`'te
  okunduğunu doğrular ("API → renderer internal network erişimi" / "browser asla renderer'a
  doğrudan erişmez" invariant'ının statik karşılığı — gerçek network izolasyonu ancak gerçek
  compose deployment'ıyla doğrulanabilir).

## Değiştirilen/Eklenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `apps/api/src/reporting/templates/template-registry.ts` | Yeni — allowlist + JRXML sandbox + path traversal koruması |
| `apps/api/src/reporting/templates/template-registry.spec.ts` | Yeni |
| `apps/api/src/reporting/report-render-network-boundary.spec.ts` | Yeni — statik network-boundary testi |
| `apps/api/src/reporting/report-render.service.ts` | `templatePath`→`templateId`, zorunlu token, payload sınırları |
| `apps/api/src/reporting/report-render.service.spec.ts` | Güncellendi |
| `apps/api/src/reporting/reporting.service.ts` | `TemplateRegistryService` entegrasyonu, runtime format doğrulaması, sahte `sanitizeJrxml` kaldırıldı |
| `apps/api/src/reporting/reporting.service.spec.ts` | Güncellendi |
| `apps/api/src/reporting/reporting.module.ts` | `TemplateRegistryService` provider olarak eklendi |
| `apps/api/src/reporting/report-output.util.ts` | `buildReportFileName` sertleştirildi (safe filename) |
| `apps/api/.env.example` | `REPORT_RENDER_*` değişkenleri belgelendi (yorumlu, devre dışı) |
| `docs/runbooks/reporting-foundation.md` | Tam HTTP contract, template allowlist rehberi, deployment checklist |
| `docs/runbooks/deployment.md` | Yeni "## 19. Report Renderer (Henüz Provizyon Edilmedi)" bölümü |
| `docs/opendevcon/METNEX_STATE.md`, `docs/opendevcon/PROGRESS_LOG.md` | Güncellendi |

## Test Sonuçları

- `pnpm --filter api exec tsc --noEmit` → 0 hata
- `pnpm --filter api exec jest --runInBand` → **14 suite / 92 test geçti**
- `pnpm --filter web exec vitest run` → 5 suite / 37 test geçti (değişmedi)

## ./scripts/check.sh --skip-docker Sonucu

```
✓ audit
✓ typecheck
✓ lint
✓ test (api 92/92, web 37/37)
✓ build
⚠ Docker build atlandı (--skip-docker — kullanıcı kararı)

Tüm kontroller geçti — push için hazır ✓
```

## Kabul Kriterleri Karşılama

| Kriter | Durum |
|---|---|
| Mevcut Jasper renderer image/source keşfedildi ve raporlandı | ✅ — bulunamadı, yukarıda belgelendi |
| Renderer HTTP contract dokümante edildi | ✅ — `reporting-foundation.md` |
| API ile renderer contract uyumlu | ✅ — `templateId` sözleşmesi |
| API host filesystem path'i renderer'a aktarılmıyor | ✅ — `templatePath` asla gönderilmiyor |
| Template allowlist / templateId çözümlemesi mevcut | ✅ — `TemplateRegistryService` |
| Renderer dışarıya port publish etmiyor | ✅ **TASK-022.5'te çözüldü** — dev-stack/test/swarm compose dosyalarında `ports:` yok, statik doğrulandı |
| Internal token doğrulaması mevcut | ✅ **TASK-022.5'te çözüldü** — gerçek container'da curl ile doğrulandı (token yok/yanlış → 401, doğru → 200) |
| Health endpoint mevcut | ✅ **TASK-022.5'te çözüldü** — gerçek renderer `/health`'i curl ile doğrulandı |
| PDF/XLSX MIME type'ları doğru | ✅ **TASK-022.5'te çözüldü** — gerçek Jasper render çıktısı (`%PDF-`, ZIP/`PK` imzaları) curl ile doğrulandı |
| JRXML sandbox kuralları uygulanıyor | ✅ **TASK-022.5'te çözüldü** — renderer artık gerçekten var (`TemplateRegistry`/`JrxmlSandbox`), API ile aynı kural listesini uyguluyor |
| Timeout, payload ve resource sınırları tanımlı | ✅ **TASK-022.5'te çözüldü** — renderer'ın kendi timeout'u (Future.get), resource limitleri (compose `deploy.resources`) ve non-root (`docker exec whoami` doğrulandı) |
| Unit/static contract testleri geçiyor | ✅ — 46 reporting testi |
| `./scripts/check.sh --skip-docker` başarılı | ✅ |
| Reporting runbook ve deployment dokümanı güncellenmiş | ✅ |
| Backlog, METNEX_STATE.md ve PROGRESS_LOG.md güncellenmiş | ✅ |
| Git commit/push yapılmamış | ✅ |

## AI1 İnceleme Sonucu (2026-09-16)

AI1, API adapter uyumu, dokümantasyon ve testleri onayladı ancak task'ı **blocked** olarak
işaretledi: gerçek bir Jasper renderer image/source/Dockerfile/compose service olmadan aşağıdaki
kriterler kanıtlanamıyor — gerçek `/render` endpoint'i, gerçek `/health` endpoint'i, internal
network izolasyonu, uçtan uca token doğrulaması, non-root çalışma, CPU/memory limitleri, gerçek
PDF/XLSX render çıktısı. `status` bu doğrultuda `done`'dan `blocked`'a düzeltildi. AI2, dışarıdan
bir renderer image/source/teknik kaynağı sağlanana kadar bu task'ı yeniden açmayacak ve yeni bir
kod task'ına geçmeyecek.

## Kalan Riskler / Sonraki Adımlar

- Gerçek bir Jasper (veya eşdeğer) renderer'ın seçilmesi/inşa edilmesi ve compose dosyalarına
  gerçekten wire edilmesi ayrı bir task ve **AI1 onayı** gerektiriyor — bu task kapsamında
  yapılmadı (görev tanımındaki "Önemli sınır"). Task, bu artefact sağlandığında yeniden açılacak.
- "Renderer dışarıya port publish etmiyor", "non-root çalışıyor", "CPU/memory limitleri" gibi
  kriterler yalnızca gerçek bir compose service üzerinde doğrulanabilir; bu task'ta bunlar
  checklist/dokümantasyon olarak önceden tanımlandı, gerçek altyapı üzerinde doğrulanamadı.
- Renderer process'inin kendi içindeki SQL/JDBC engelleme, arbitrary network erişimi engelleme ve
  render-time timeout kontrolleri bu repo'da uygulanamaz (uygulanacak bir renderer yok) — sadece
  dokümante edildi, gelecekteki renderer implementasyonunun sorumluluğunda.
- Docker build kapısı bu ortamda doğrulanmadı (TASK-022.1-R1'den beri kullanıcı kararıyla atlanıyor).
