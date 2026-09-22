---
id: TASK-022.5-R1
title: API/Renderer Template Registry Eşleştirmesi
status: done
srs_refs: [FEAT-007, FR-012, FR-013]
updated_at: 2026-09-17
parent_epic: EPIC-002
---

# TASK-022.5-R1: API/Renderer Template Registry Eşleştirmesi

## Bulunan Sorun

TASK-022.5'te renderer'ın kendi `TemplateRegistry`'sine (`services/jasper-renderer/.../template/TemplateRegistry.java`)
`sample-report` allowlist girdisi eklenmişti, ama **API tarafının** `TemplateRegistryService`'i
(`apps/api/src/reporting/templates/template-registry.ts`) hâlâ boş allowlist ile bırakılmıştı
(TASK-022.4'ten kalan, o zaman doğru olan varsayılan). Sonuç: `templatePath` set edilmiş bir
artifact export edilmeye çalışıldığında API kendi allowlist'inde hiçbir templateId bulamadığı için
`NotFoundException` ile başarısız oluyordu — renderer'ın `sample-report`'u desteklemesi hiç
önemli değildi, çünkü istek renderer'a hiç ulaşmıyordu. İki allowlist birbirinden habersizdi.

## Yapılan Düzeltme

- `apps/api/src/reporting/templates/sample-report.jrxml` eklendi — renderer'ın
  `services/jasper-renderer/.../templates/sample-report.jrxml` dosyasının birebir kopyası (aynı
  template, iki bağımsız serviste tutuluyor; API içeriği yalnızca kendi sandbox kontrolü için
  okur, renderer'a hiçbir zaman göndermez).
- API'nin `TEMPLATE_ALLOWLIST`'ine `'sample-report': 'sample-report.jrxml'` eklendi — artık
  renderer'ın allowlist'iyle **aynı templateId**'yi tanıyor.
- `template-registry.ts`'deki yorum, iki allowlist'in senkron tutulması gerektiğini açıkça
  belirtecek şekilde güncellendi.

## Testler

### Yeni/güncellenen unit testler
- `template-registry.spec.ts`: `sample-report`'un artık `has()`/`resolve()` ile başarıyla
  çözüldüğü doğrulandı (önceden yalnızca "bulunamadı" senaryoları test ediliyordu).
- `reporting.service.spec.ts`: `ALLOWLISTED_TEMPLATED_ARTIFACT` (`code: 'SAMPLE-REPORT'`) fixture'ı
  eklendi; `exportReport`'un (mocked fetch ile) renderer'a `templateId: 'sample-report'`
  gönderdiği ve `templatePath` alanının **hiç bulunmadığı** doğrulandı.

### Yeni: gerçek API → renderer entegrasyon testi (mocked değil)

`apps/api/src/reporting/reporting.jasper-integration.spec.ts` — **doğrudan renderer'a curl atmak
yerine gerçek `ReportingController`/`ReportingService`/`ReportRenderService` çağrı zincirini**
(POST `/reports/:code/export/:format` bir HTTP isteğinin çalıştıracağı tam kod yolu) gerçek,
o an çalışan renderer container'ına karşı çalıştırıyor:

- Gerçek PDF export (`%PDF-` imzası doğrulandı).
- Gerçek XLSX export (`PK`/ZIP imzası doğrulandı).
- `templatePath`'in renderer'a hiç gönderilmediği + `templateId: 'sample-report'`'un gönderildiği
  — gerçek `fetch`'i sarmalayıp giden JSON body'yi yakalayarak doğrulandı.
- Renderer'ın allowlist'inde olmayan bir template → API tarafında kontrollü 404 (gerçek ağ
  round-trip'i öncesi API kendi allowlist'inde reddediyor).
- Yanlış internal token → gerçek ağ üzerinden 502 (fail-closed, token doğrulamasının uçtan uca
  çalıştığının kanıtı).

**Yeni bir demo domain/modül eklenmedi:** test fixture'ları (`ALLOWLISTED_ARTIFACT`,
`FixtureDatasetProvider`) tamamen spec dosyasının içinde tanımlı, `reporting.module.ts`'e veya
başka bir production dosyasına kaydedilmedi.

**Bu test, renderer gerçekten erişilebilir değilse (`REPORT_RENDER_ENDPOINT` yoksa veya health
check başarısız olursa) sessizce atlanır** (`console.warn` ile) — CI/başka ortamlarda build'i
kırmaz; mevcut mocked testler (`report-render.service.spec.ts`, `reporting.service.spec.ts`)
sözleşmeyi zaten renderer olmadan da kapsıyor. Bu ortamda renderer gerçekten çalıştığı için test
gerçekten renderer'a karşı çalıştırıldı ve doğrulandı — bir defa renderer container'ın beklenmedik
şekilde durduğu görüldü (muhtemelen sandbox kaynak kısıtı), `./dev.sh` ile yeniden başlatılıp test
tekrar çalıştırılarak gerçek geçiş kanıtlandı.

## Sonuçlar

- `pnpm --filter api exec jest --runInBand` → **15 suite / 99 test geçti** (önceki 14/92'den: +1
  yeni suite [`reporting.jasper-integration.spec.ts`, 5 test], +1 `template-registry.spec.ts`e,
  +1 `reporting.service.spec.ts`'e).
- Maven testleri (`mvn test`, container içinde): **36/36 geçti** — bu task Java kodunu
  değiştirmedi, sadece API tarafını renderer'la hizaladı; regresyon yok.
- `./scripts/check.sh --skip-docker` → **PASS** (audit, typecheck, lint, test [api 99/99, web
  37/37], build).

## Kabul Kriterleri Karşılama

| Kriter | Durum |
|---|---|
| API ve renderer aynı allowlisted templateId için uyumlu | ✅ — `sample-report` her iki tarafta da |
| Template kullanan artifact API üzerinden gerçek PDF üretebiliyor | ✅ — gerçek entegrasyon testiyle doğrulandı |
| Template kullanan artifact API üzerinden gerçek XLSX üretebiliyor | ✅ — gerçek entegrasyon testiyle doğrulandı |
| API → renderer akışında token doğrulaması çalışıyor | ✅ — yanlış token → gerçek 502, gerçek ağ üzerinden |
| templatePath request payload'ında bulunmuyor | ✅ — gerçek giden body yakalanıp doğrulandı |
| Bilinmeyen template ID kontrollü biçimde reddediliyor | ✅ — API tarafında 404 (unit + gerçek entegrasyon) |
| Path traversal reddediliyor | ✅ — mevcut `template-registry.spec.ts` testleri (değişmedi) |
| Maven testleri başarılı | ✅ — 36/36 |
| API reporting testleri başarılı | ✅ — 99/99 |
| `./scripts/check.sh --skip-docker` başarılı | ✅ |
| Backlog, METNEX_STATE.md ve PROGRESS_LOG.md güncel | ✅ |
| TASK-022.4 status'u review olarak korunuyor | ✅ — değiştirilmedi |
| Git commit/push yapılmıyor | ✅ |

## Değiştirilen/Eklenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `apps/api/src/reporting/templates/sample-report.jrxml` | Yeni — renderer'ın template'inin kopyası |
| `apps/api/src/reporting/templates/template-registry.ts` | `TEMPLATE_ALLOWLIST`'e `sample-report` eklendi |
| `apps/api/src/reporting/templates/template-registry.spec.ts` | Pozitif çözümleme testi eklendi |
| `apps/api/src/reporting/reporting.service.spec.ts` | `ALLOWLISTED_TEMPLATED_ARTIFACT` + hizalama testi eklendi |
| `apps/api/src/reporting/reporting.jasper-integration.spec.ts` | Yeni — gerçek API→renderer entegrasyon testi |
| `backlog/TASK-022-5-R1-api-renderer-template-registry-alignment.md` | Yeni |
| `docs/opendevcon/METNEX_STATE.md`, `docs/opendevcon/PROGRESS_LOG.md` | Güncellendi |

## Kalan Riskler

- Gerçek entegrasyon testi, renderer erişilemezse sessizce atlanıyor — bu, CI'da renderer hiç
  ayağa kaldırılmadığı sürece bu spesifik testin hiç çalışmadığı, yalnızca mocked testlerin
  çalıştığı anlamına gelir. Renderer'ı CI'da (Docker Compose service olarak) ayağa kaldırmak ayrı
  bir iş — TASK-022.4/022.5'te de not edilen CI entegrasyonu boşluğuyla aynı kapsam.
