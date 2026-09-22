---
id: TASK-022.5
title: Maven Jasper Renderer Servisi ve Docker Deployment
status: done
srs_refs: [FEAT-007, FR-012, FR-013]
updated_at: 2026-09-16
parent_epic: EPIC-002
---

# TASK-022.5: Maven Jasper Renderer Servisi ve Docker Deployment

## Özet

TASK-022.4'ün blocked bırakıldığı nokta — gerçek bir Jasper renderer image/source/deployment'ının
olmaması — bu task ile çözüldü. `services/jasper-renderer/` altında bağımsız bir Maven/Spring Boot
3 (Java 21) servisi oluşturuldu; gerçek JasperReports motoru ile PDF/XLSX üretiyor, önceden
tanımlanmış HTTP sözleşmesini uyguluyor, Docker multi-stage image olarak build ediliyor ve
`./dev.sh` ile local'de otomatik ayağa kalkıyor. Deployment stack'lerine (dev-stack/test/swarm)
internal-network-only olarak wire edildi.

**Önemli:** Bu task'ta yeni bir teknoloji/motor eklenmedi — görev tanımının kendisi JasperReports
kullanan bir Maven/Java servisi istiyordu; bu, TASK-022.1/022.4'te zaten tasarlanmış olan
`templateId`/JRXML sandbox sözleşmesinin doğal karşılığı.

## Maven / Jasper Sürümleri (pinned, pom.xml)

| Bağımlılık | Sürüm |
|---|---|
| Java | 21 |
| Spring Boot (`spring-boot-dependencies` BOM) | 3.3.4 |
| JasperReports (`net.sf.jasperreports:jasperreports`) | 6.20.6 |
| ECJ (JRXML expression compiler, açıkça pinlendi) | 4.6.1 |

Hepsi `pom.xml`'de tam sürüm numarasıyla sabitlendi — aralık (`[...]`) veya `LATEST`/`RELEASE`
kullanılmadı.

## Servis Dizin Yapısı

```
services/jasper-renderer/
  pom.xml                     Maven build tanımı
  Dockerfile                  Multi-stage (maven:3.9-eclipse-temurin-21 → eclipse-temurin:21-jre-alpine)
  src/main/java/com/metnex/jasperrenderer/
    JasperRendererApplication.java
    config/RendererProperties.java        renderer.* config (token, timeout, limitler)
    web/RenderController.java             POST /render
    web/HealthController.java             GET /health
    web/dto/{RenderRequest,RenderRow,ErrorResponse}.java
    security/TokenAuthFilter.java         Bearer token, constant-time karşılaştırma (MessageDigest.isEqual)
    security/PayloadSizeFilter.java       Content-Length + stream-level payload sınırı
    security/LimitedServletInputStream.java
    security/RendererErrorResponses.java
    template/TemplateRegistry.java        allowlist + path traversal koruması
    template/JrxmlSandbox.java            yasaklı token kontrolü (standalone test edilebilir)
    render/JasperRenderService.java       fillReport + PDF/XLSX export, bounded timeout (Future.get)
    render/RenderedDocument.java
    exception/                            RendererException hiyerarşisi + GlobalExceptionHandler (JSON hatalar)
  src/main/resources/
    application.yml
    templates/default-report.jrxml        templateId=null iken kullanılan generic layout
    templates/sample-report.jrxml         allowlisted demonstration template ("sample-report")
  src/test/java/...                       36 test (aşağıda)
```

## Dockerfile ve Compose Değişiklikleri

- `services/jasper-renderer/Dockerfile`: multi-stage, Maven dependency cache (`--mount=type=cache`),
  runtime image'da build araçları yok, non-root `renderer` kullanıcısı, `EXPOSE 8088`,
  `HEALTHCHECK`, `JAVA_OPTS` ile ayarlanabilir JVM heap.
- `infra/docker/docker-compose.dev.yml`: `jasper-renderer` servisi eklendi — `build.context: ../..`
  (repo root), loopback-only `127.0.0.1:${JASPER_RENDERER_LOCAL_PORT:-8088}:8088` publish,
  healthcheck.
- `infra/docker/docker-compose.dev-stack.yml`, `docker-compose.test.yml`, `docker-compose.swarm.yml`:
  `jasper-renderer` servisi eklendi — **`ports:` yok** (internal-only), aynı overlay network'te
  `metnex-api` ile, `deploy.resources.limits`/`reservations`, healthcheck, restart policy, rolling
  update (`order: start-first`, `failure_action: rollback`). `metnex-api`'nin `environment:`
  bloğuna `REPORT_RENDER_ENDPOINT=http://jasper-renderer:8088/render`,
  `REPORT_RENDER_INTERNAL_TOKEN`, `REPORT_RENDER_TIMEOUT_MS` eklendi.
- `apps/api/.env.example`, `infra/docker/.env.example`: `REPORT_RENDER_*` değişkenleri güncel
  duruma göre belgelendi (yorumlu, `./dev.sh` otomatik yazıyor).

## ./dev.sh Değişiklikleri

- `--force-renderer-rebuild` bayrağı eklendi.
- Yeni "Jasper renderer" adımı: port seçimi (mevcut container'dan yeniden kullanım veya
  `DEV_PORT_BASE+6`'dan boş port), `REPORT_RENDER_INTERNAL_TOKEN` üretimi/persist (infra/docker/.env),
  image build (yalnızca yoksa veya `--force-renderer-rebuild`), compose ile başlatma (zaten
  çalışıyorsa yeniden başlatılmaz), healthcheck bekleme döngüsü.
- **Healthcheck geçmezse script `fail()` ile durur** (non-zero exit) — sessizce devam etmiyor.
- `apps/api/.env`'e `REPORT_RENDER_ENDPOINT`/`REPORT_RENDER_INTERNAL_TOKEN`/`REPORT_RENDER_TIMEOUT_MS`
  yazılıyor.
- `--status` modu renderer container/health durumunu da gösteriyor.
- Final özet bloğuna renderer URL + health durumu eklendi.

### ./dev.sh Çıktısı (gerçek çalıştırma, bu ortamda)

```
▶ Jasper renderer...
  Jasper renderer için boş port seçildi: 7506
  REPORT_RENDER_INTERNAL_TOKEN üretildi ve infra/docker/.env'e yazıldı
✓ Jasper renderer image mevcut, yeniden build edilmiyor (metnex-jasper-renderer:dev) — zorlamak için: ./dev.sh --force-renderer-rebuild
 Container metnex-jasper-renderer-dev Started
✓ Jasper renderer container başlatıldı

▶ Jasper renderer sağlık kontrolü...
.✓ Jasper renderer hazır

▶ Uygulama .env dosyaları yazılıyor...
✓ apps/api/.env yazıldı (PORT=3001, REPORT_RENDER_ENDPOINT=http://127.0.0.1:7506/render)
...
İnfra servisleri:
  Jasper renderer  →  http://127.0.0.1:7506  (health: healthy ✓)
```

İdempotency doğrulandı: ikinci `./dev.sh` çalıştırması image'ı yeniden build etmedi, container'ı
yeniden başlatmadı ("Jasper renderer container zaten çalışıyor, yeniden başlatılmıyor."), aynı
token'ı korudu. `./dev.sh --stop` renderer container'ını da diğerleriyle birlikte durdurup
kaldırdı. `./dev.sh --status` renderer health durumunu ayrı satırda gösterdi.

## Image Tag

- Local: `metnex-jasper-renderer:dev`
- Registry (deployment stack'leri, mevcut `metnex-api`/`metnex-web` konvansiyonuyla aynı):
  `127.0.0.1:5000/metnex-jasper-renderer:${TAG}`

## Healthcheck Sonucu

Gerçek Docker container'da doğrulandı:

```json
{"status":"UP","service":"jasper-renderer"}
```

Container `HEALTHCHECK` durumu: `healthy` (compose `docker compose ps` çıktısında da
`(healthy)` olarak görüldü).

## PDF/XLSX Gerçek Çıktı Doğrulaması

Gerçek çalışan container'a `curl` ile:

| Test | Sonuç |
|---|---|
| `POST /render` (PDF, templateId yok → default layout) | HTTP 200, `Content-Type: application/pdf`, gövde `%PDF-1.5` ile başlıyor (2585 byte, gerçek JasperReports çıktısı) |
| `POST /render` (XLSX) | HTTP 200, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, gövde `PK\x03\x04` (gerçek ZIP/OOXML, CSV değil) |
| `POST /render` (templateId=`sample-report`, allowlisted) | HTTP 200, gerçek PDF |
| `Content-Disposition` | `attachment; filename="sales_report.pdf"` / `.xlsx` — güvenli, sanitize edilmiş |

## Güvenlik Testleri

Gerçek container'a `curl` ile:

| Senaryo | Beklenen | Sonuç |
|---|---|---|
| Token yok | 401 `UNAUTHORIZED` | ✅ |
| Yanlış token | 401 `UNAUTHORIZED` | ✅ |
| Bilinmeyen (ama biçimi geçerli) templateId | 404 `TEMPLATE_NOT_FOUND` | ✅ |
| Path traversal templateId (`../../etc/passwd`) | 400 `INVALID_TEMPLATE_ID` | ✅ |
| Geçersiz format (`CSV`) | 400 `UNSUPPORTED_FORMAT` | ✅ |
| Non-root container | `docker exec ... whoami` → `renderer` (uid=100) | ✅ |

## Maven Test Sonuçları (36/36 geçti, container içinde `mvn test`)

- `JrxmlSandboxTest` (11 test): benign içerik kabul, 8 farklı yasaklı JRXML token'ı reddedilir
  (`java.sql`, `jdbc:`, `java.io.File`, `Runtime.getRuntime`, `ProcessBuilder`, `System.exit`,
  `java.net`, `<queryString`), oversized template reddedilir, sözleşmedeki her token tek tek
  doğrulanır.
- `TemplateRegistryTest` (10 test): 7 farklı path-traversal/geçersiz-karakter varyasyonu reddedilir,
  bilinmeyen (biçimi geçerli) templateId → `TemplateNotFoundException`, `sample-report` gerçekten
  compile edilir, built-in default template gerçekten compile edilir.
- `RenderControllerTest` (12 test): health (auth gerektirmez), **gerçek PDF render**, **gerçek XLSX
  render** (ZIP imzası doğrulanır), allowlisted template ile render, geçersiz format → 400, token
  yok/yanlış → 401, bilinmeyen template → 404, path traversal → 400, malformed request (eksik alan)
  → 400, malformed JSON → 400.
- `RenderControllerLimitsTest` (1 test): satır sayısı sınırı aşımı → 413.
- `RenderControllerPayloadSizeTest` (1 test): payload boyutu sınırı aşımı (stream-level, chunked
  transfer encoding ile Content-Length atlatılamıyor) → 413.
- `RenderControllerTimeoutTest` (1 test): `renderer.timeout-ms=1` ile gerçek render süresi aşılır →
  504 `RENDER_TIMEOUT`.

## API Entegrasyon Testleri (TASK-022.4'ten korunan, doğrulandı)

Bu task API tarafında (apps/api) kod değişikliği yapmadı — TASK-022.4'te eklenen aşağıdaki testler
zaten bu sözleşmeyi (artık gerçek bir renderer'a karşı da doğrulanan) tam olarak kapsıyor ve
değişmeden geçmeye devam ediyor:

- `report-render.service.spec.ts`: API → renderer başarılı render, eksik token → fail-closed,
  `templateId` gönderimi (`templatePath` yok), oversized payload/row reddi, timeout.
- `reporting.service.spec.ts`: API → renderer çağrısı (Jasper konfigüre edilince fallback yerine
  gerçek renderer kullanılıyor), renderer erişilemiyorsa fail-closed.
- `report-render-network-boundary.spec.ts`: `apps/web` kaynak kodunda
  `REPORT_RENDER_ENDPOINT`/`REPORT_RENDER_INTERNAL_TOKEN`/`report-renderer` referansı yok (statik
  doğrulama — browser asla renderer'a doğrudan erişemez).

## Dokümantasyon

Güncellenen dosyalar:
- `docs/runbooks/reporting-foundation.md` — "Jasper renderer service exists" güncellemesi, iki
  taraflı template allowlist rehberi, JRXML sandbox bölümü renderer tarafı gerçek garantilerle
  güncellendi, Deployment Wiring bölümü gerçek wiring tablosuyla değiştirildi, Smoke Checks'e
  gerçek curl komutları eklendi.
- `docs/runbooks/deployment.md` — "## 19. Report Renderer" bölümü gerçek implementasyonu
  yansıtacak şekilde yeniden yazıldı (dizin yapısı, dev.sh akışı, stack wiring tablosu, doğrulanan
  kontroller listesi).
- `docs/runbooks/local-development.md` — Local Bootstrap Akışı ve Port Bloğu bölümlerine Jasper
  renderer adımları eklendi.
- `docs/README.md` — reporting-foundation.md açıklaması ve DEC-0013 satırı güncellendi.
- `apps/api/.env.example`, `infra/docker/.env.example` — `REPORT_RENDER_*` belgelendi.
- `docs/decisions/DEC-0013-jasper-renderer-service.md` — yeni karar kaydı.

## ./scripts/check.sh --skip-docker Sonucu

```
✓ audit
✓ typecheck
✓ lint
✓ test (api 92/92, web 37/37 — değişmedi, bu task apps/api kodunu değiştirmedi)
✓ build
⚠ Docker build atlandı (--skip-docker — kullanıcı kararı)

Tüm kontroller geçti — push için hazır ✓
```

## Docker Kullanıldığında Ek Kanıt (bu ortamda Docker mevcuttu)

Bu ortamda Docker gerçekten kullanılabilir olduğu için (`docker info`/`docker pull` çalıştı,
Maven Central'a ağ erişimi doğrulandı), aşağıdakiler **gerçekten çalıştırılarak** doğrulandı, salt
statik/config-only değil:

- `docker build -f services/jasper-renderer/Dockerfile -t metnex-jasper-renderer:dev .` — başarılı.
- `docker run` ile container ayağa kaldırıldı, healthcheck `healthy` oldu.
- Gerçek `curl` ile `/health`, `/render` (PDF/XLSX/allowlisted template/hata senaryoları) test edildi.
- `docker exec ... whoami` → non-root doğrulandı.
- `docker compose -f docker-compose.dev.yml up -d jasper-renderer` ile compose üzerinden başlatıldı
  ve doğrulandı.
- `./dev.sh` iki kez çalıştırılarak tam akış (build-skip, start, healthcheck, .env yazımı,
  idempotency) uçtan uca doğrulandı; `./dev.sh --stop` ve `./dev.sh --status` da test edildi.
- `docker compose config` ile `dev-stack`/`test`/`swarm` compose dosyaları statik olarak
  doğrulandı (gerçek Swarm deploy'u bu ortamda yapılmadı — tek node yok, registry/secret altyapısı
  prod-only).

**Doğrulanamayan (gerçek Swarm/prod altyapısı gerektirir):** `docker stack deploy` ile gerçek
rolling update/rollback davranışı, gerçek CI image build+push (pipeline.yml güncellenmedi — bkz.
Kalan Riskler).

## Kabul Kriterleri Karşılama

| Kriter | Durum |
|---|---|
| Maven Jasper renderer servisi repository'ye eklendi | ✅ |
| pom.xml dependency sürümleri sabitlenmiş | ✅ |
| /render endpoint'i çalışıyor | ✅ (gerçek container'da doğrulandı) |
| /health endpoint'i çalışıyor | ✅ (gerçek container'da doğrulandı) |
| PDF ve XLSX gerçek olarak üretilebiliyor | ✅ (gerçek dosya imzaları doğrulandı) |
| Token zorunluluğu çalışıyor | ✅ |
| JRXML sandbox uygulanıyor | ✅ (renderer + API, ortak kural listesi) |
| Template allowlist çalışıyor | ✅ |
| Dockerfile multi-stage ve non-root | ✅ |
| Local compose renderer'ı başlatıyor | ✅ |
| ./dev.sh renderer image'ını build edip Docker'da çalıştırıyor | ✅ |
| ./dev.sh API env dosyasına doğru renderer endpoint/token yazıyor | ✅ |
| Dev renderer healthcheck başarılı olmadan script başarıyla tamamlanmıyor | ✅ (kod incelendi + davranış mantığı doğrulandı) |
| Deployment stack'lerinde renderer internal network üzerinde çalışıyor | ✅ (statik doğrulama — gerçek Swarm deploy yok) |
| Renderer host'a public port publish etmiyor | ✅ |
| Resource limitleri tanımlı | ✅ |
| API ve renderer entegrasyon testleri geçiyor | ✅ |
| ./scripts/check.sh --skip-docker başarılı | ✅ |
| Docker mevcut olduğunda ayrıca renderer image build ve smoke test kanıtı sunuluyor | ✅ |
| TASK-022.4 blokajını kaldırmaya yeterli kanıt hazırlanıyor | ✅ — bkz. aşağıda |
| Backlog, METNEX_STATE.md ve PROGRESS_LOG.md güncelleniyor | ✅ |
| Git commit/push yapılmıyor | ✅ |

## TASK-022.4 İçin Önerilen Yeni Status

**Önerilen: `review`** (AI2 tarafından `done`'a doğrudan çekilmedi — final karar AI1'e bırakıldı,
AI1'in kendi talimatı gereği).

Gerekçe: AI1'in TASK-022.4'te kanıtlanamadığını belirttiği tüm maddeler artık gerçek bir
container'a karşı doğrulandı:
- Gerçek `/render` endpoint'i — ✅ curl ile doğrulandı.
- Gerçek `/health` endpoint'i — ✅ curl ile doğrulandı.
- Internal network izolasyonu — ✅ statik olarak doğrulandı (`ports:` yok, aynı overlay network);
  gerçek Swarm ortamında çalışan bir deploy ile doğrulanmadı (bu ortamda tek node yok).
- Renderer token doğrulaması — ✅ gerçek container'a karşı doğrulandı.
- Non-root çalışma — ✅ `docker exec whoami` ile doğrulandı.
- CPU/memory limitleri — ✅ compose dosyalarında tanımlı; gerçek prod yükü altında doğrulanmadı.
- Gerçek PDF/XLSX render çıktısı — ✅ curl ile doğrulandı.

`review` önerisinin nedeni: internal network izolasyonu ve resource limitlerinin *gerçek* bir
Swarm cluster'ında (bu sandbox'ta mevcut değil) doğrulanmamış olması, ve CI'ın bu image'ı henüz
build/push etmemesi.

## Kalan Riskler / Sonraki Adımlar

- **CI entegrasyonu:** `.github/workflows/pipeline.yml` Jasper renderer image'ını build/push
  etmiyor (Node/pnpm-only pipeline). Ayrı bir task gerektirir.
- **Gerçek Swarm doğrulaması:** `docker stack deploy` ile gerçek rolling update/healthcheck/
  rollback davranışı bu sandbox'ta doğrulanamadı (tek node, registry/secret altyapısı yok).
- **Network-level sandbox eksikliği:** Renderer process'inin kendisi seccomp/SecurityManager ile
  sandbox'lanmıyor; yalnızca network placement (`ports:` yok, internal-only network) ile mitigate
  ediliyor. `docs/runbooks/reporting-foundation.md`'de "Known gap" olarak belgelendi.
- Docker build kapısı `./scripts/check.sh` içinde hâlâ `--skip-docker` ile atlanıyor
  (TASK-022.1-R1'den beri süregelen kullanıcı kararı) — bu task Jasper renderer image'ını
  `check.sh`'in dışında, ayrı olarak build/test etti.

> **Düzeltme (TASK-022.5-R1, 2026-09-17):** Bu task'ta renderer'ın kendi allowlist'ine eklenen
> `sample-report` templateId'si, API'nin `TemplateRegistryService`'ine eklenmemişti (API tarafı
> hâlâ boştu) — iki allowlist birbirinden habersizdi. Düzeltme ve gerçek uçtan uca kanıt:
> `backlog/TASK-022-5-R1-api-renderer-template-registry-alignment.md`.
