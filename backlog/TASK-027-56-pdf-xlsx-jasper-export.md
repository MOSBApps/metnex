---
id: TASK-027.56
title: PDF/XLSX Jasper Export
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
related: [TASK-027.54, TASK-027.54-R2, TASK-027.55]
updated_at: 2026-09-23
---

# TASK-027.56: PDF/XLSX Jasper Export

## Amaç

Reporting analiz ekranındaki aktif filtrelenmiş verinin PDF ve XLSX olarak dışa
aktarılmasını sağlamak — mevcut Jasper renderer sözleşmesi, `ReportRenderService`
ve fallback export mekanizması üzerinden.

## Teslim notu (2026-09-23, AI2)

### Keşif

`ReportingController`'da `GET /reports/:code/export/:format` (PDF/XLSX) zaten
mevcuttu — `REPORT:ARTIFACT:EXPORT` permission, aynı `JwtAuthGuard`/
`PermissionGuard`/`MfaEnforcementGuard` zinciri, `q`/`status` filtreleri.
`ReportingService.exportReport` de zaten Jasper-configured/fallback ayrımını,
template allowlist çözümlemesini ve güvenli dosya adı üretimini (
`buildReportFileName`) yapıyordu. `ReportRenderService` (adapter) de zaten
timeout/abort, payload limitleri, token/endpoint zorunluluğu ve 4xx/5xx→502
dönüşümünü içeriyordu (`report-render.service.spec.ts`, önceki task'lardan).
**Yeni bir export endpoint'i oluşturulmadı** — bu task tamamen mevcut
sözleşmenin üstüne: (a) analiz ekranına PDF/XLSX butonları ekledi, (b) dev
fixture artifact'ının bu sözleşmeyi gerçekten kullanabilmesi için küçük,
additive backend ayarlamaları yaptı.

### Backend değişiklikleri (additive, mevcut sözleşme korunarak)

1. **`DEV_FIXTURE_ARTIFACT.supportedOutputFormats`**: `[]` → `['PDF', 'XLSX']`.
   Önceden fixture hiçbir formatı desteklemiyordu (`exportReport` her zaman
   400 "format desteklenmiyor" dönerdi) — bu, ekrandaki export butonlarının bu
   ortamda gerçek uçtan uca test edilebilmesini engelliyordu. Fixture hâlâ
   tamamen bellek-içi (DB'ye hiç yazılmıyor); yalnızca bu metadata alanı
   değişti.
2. **Dev fixture export etiket satırı** (`buildDevFixtureExportLabelRow`,
   `dev-fixture-dataset.provider.ts`'e eklendi): `exportReport`, fixture
   aktifken dataset satırlarının başına, ekranda gösterilenle aynı
   "Geliştirme simülasyon verisi" metnini taşıyan sentetik bir satır
   ekliyor — hem Jasper'a giden `rows` payload'ına hem fallback PDF/XLSX
   üretimine. **Neden bu yöntem:** JRXML template değişikliği ve Jasper Java
   kodu değişikliği bu task'ta açıkça kapsam dışı; mevcut Jasper generic
   template'inin gönderilen her satırı olduğu gibi tabloladığı **gerçek
   çalışan dev Jasper container'ına karşı doğrulandı** (bkz. altta) — bu
   yüzden ekstra bir satır, template'e hiç dokunmadan, hem Jasper hem fallback
   çıktısında etiketi görünür kılıyor.
3. **Fallback PDF satır formatı küçük bir düzeltme aldı**: önceden
   `${row.no} ${row.status} ${row.amount}` idi — `row.label` hiç
   kullanılmıyordu, yani sentetik etiket satırının asıl metni ("Geliştirme
   simülasyon verisi") fallback PDF'te **hiç görünmeyecekti** (yalnızca boş
   no + "INFO" + "0" görünürdü). `${row.no} ${row.label} ${row.status}
   ${row.amount}` olarak düzeltildi — fallback XLSX zaten `row.label`
   kullanıyordu, o yönde değişiklik yok.

Hiçbiri: yeni endpoint, yeni permission kodu, yeni demo domain/provider/seed,
JRXML/Jasper Java değişikliği içermiyor.

### Gerçek Jasper container testi (mevcut, zaten çalışan ortam — yeni Docker build/run yok)

Uygulamaya geçmeden önce, bu ortamda zaten ayakta olan `metnex-jasper-renderer-dev`
container'ına doğrudan curl ile iki hipotez doğrulandı:
1. `templateId: null` (fixture'ın `templatePath` alanı yok, dolayısıyla
   `exportReport` hiç templateId üretmiyor) — renderer'ın kendi
   varsayılan/generic template'i bunu sorunsuz işliyor, gerçek `%PDF-1.5` ve
   `PK\x03\x04` (XLSX/ZIP) çıktısı üretiyor.
2. `rows` dizisine eklenen ekstra bir satırın `label` alanı, renderer'ın
   ürettiği gerçek (FlateDecode sıkıştırmalı) PDF içerik akışında **görünür
   metin olarak** çıkıyor (decompress edilip doğrulandı).

Bu iki bulgu, yukarıdaki §2 ve §3'teki tasarım kararlarının temelini
oluşturuyor ve artık kalıcı bir test olarak da kod tabanında (
`reporting.jasper-integration.spec.ts`, aşağıda) yer alıyor.

### Frontend — analiz ekranına PDF/XLSX butonları

`report-analysis-client.tsx`: CSV/PNG butonlarının yanına "PDF indir"/"XLSX
indir" eklendi (aynı toolbar, tablo/grafik bölümünde).
- **Backend'den gelen dosya**: CSV/PNG'nin aksine (client-side üretim), PDF/
  XLSX bytes'ı ve dosya adı backend'den geliyor — mevcut `tenantApiDownload`
  helper'ı (Content-Disposition'dan dosya adını okuyan, zaten
  `report-viewer-client.tsx`'te kullanılan) yeniden kullanıldı.
- **Aktif filtreler** (`q`, `status`) query param olarak export isteğine
  ekleniyor.
- **Çift export koruması**: TASK-027.55 R1'in `export-guard.ts` (React/DOM'dan
  bağımsız single-flight kilit) **aynen yeniden kullanıldı** — PDF ve XLSX
  için ayrı guard instance'ları, birbirini bloklamıyor.
- **Loading/disabled**: `exportingPdf`/`exportingXlsx` state'leri; veri yokken
  (rows boş) butonlar hiç render edilmiyor.
- **Güvenli hata mesajları**: 401/403 → yetki mesajı, 404 → artifact
  bulunamadı, 502/5xx → sunucu tarafı sorun mesajı, diğerleri → genel mesaj;
  hiçbirinde ham backend hatası/SQL/schema/token bilgisi yok.
- **Tenant değişimi**: mevcut `load()` akışı zaten `data`'yı temizleyip
  yeniden yüklüyor (TASK-027.54'ten miras) — PDF/XLSX butonları bu sırada
  `!data` nedeniyle kayboluyor, eski tenant verisiyle export mümkün değil.
- **Simülasyon etiketi**: ekran rozeti zaten TASK-027.55'te var; PDF/XLSX'in
  kendi bayt içeriğindeki etiket garantisi backend'de (§2), gerçek Jasper
  container'ına karşı test edildi (yukarıda).

### Testler

**Backend (yeni: 35 + 6 = 41 testin 20'si net yeni bu task için):**
- `reporting.service.spec.ts` → yeni `ReportingService.exportReport` bloğu
  (önceden bu metodun mock seviyeli doğrudan testi yoktu): format doğrulama,
  404/inactive artifact, `supportedOutputFormats` reddi, filtre aktarımı,
  tenant izolasyonu (2 test), Jasper-configured/fallback ayrımı (renderer
  çağrılıyor/çağrılmıyor), fallback PDF `%PDF-` magic number, fallback XLSX
  `PK` magic number, renderer hatasının sessizce yutulmayıp
  propagate edilmesi (sahte başarı yok), güvenli dosya adı, fallback
  buffer'da secret/token/bağlantı dizesi yokluğu.
- `reporting.service.spec.ts` → yeni "dev fixture export label row" bloğu:
  etiket satırının fallback PDF/XLSX'te görünür olması, gerçek olmayan
  artifact'a veya devre dışı bayrakla sızmaması, Jasper path'ine de
  gönderilmesi.
- `reporting.jasper-integration.spec.ts` → yeni "dev fixture export label row
  — real Jasper output" bloğu: **gerçek, zaten çalışan dev Jasper
  container'ına karşı**, gerçek `DevFixtureDatasetProvider` ile, decompress
  edilmiş PDF içerik akışında etiketin göründüğünü doğrudan doğrular; DB'ye
  hiç dokunulmadığını da ayrıca doğrular.
- `report-render.service.spec.ts` (dokunulmadı, önceden mevcut): timeout/abort,
  4xx/5xx→502, payload limitleri, content-type fallback — bu task'ın
  kapsamındaki gereksinimlerin çoğu zaten buradan miras.
- `endpoint-authorization-inventory.spec.ts`: değişmedi (97 endpoint) — yeni
  endpoint eklenmedi, snapshot doğrulandı.

**Frontend (yeni: 32 test, hepsi bu task için net yeni):**
- `report-analysis-client.spec.tsx` → yeni "PDF/XLSX export" bloğu: disabled/
  enabled durumu, filtrelerin query param'a doğru aktarılması, dosya adının
  backend'den (Content-Disposition) geldiği, loading metni/disabled, 401/403/
  404/502/500 için güvenli mesajlar (ham hata sızmıyor), çift tıklamanın tek
  indirme ürettiği (PDF ve XLSX ayrı ayrı), PDF ve XLSX'in birbirini
  bloklamadığı, dev fixture rozetinin göründüğü, tenant değişiminde export
  state'inin temizlendiği.

### Mutasyon kontrolleri (gerçekten çalıştırıldı — kod geçici bozulup testler kırmızıya döndü, sonra geri alındı)

- **`supportedOutputFormats` kontrolü** (`reporting.service.ts`) kaldırıldı →
  ilgili test kırıldı (400 yerine gerçek bir TypeError sızdı). ✅ Geri alındı.
- **Dev fixture etiket satırı gate'i** (`isDevFixtureEnabled() && code ===
  DEV_FIXTURE_ARTIFACT_CODE`) her zaman `true`'ya sabitlendi → 2 test kırıldı
  (gerçek artifact'a etiket sızıyordu). ✅ Geri alındı.
- **Tenant scope kontrolü** (`exportReport`'taki `tenantId` provider'a
  hardcoded bir değerle değiştirildi) → 3 test kırıldı. ✅ Geri alındı.
- **Çift export single-flight guard** (frontend): guard wrapper'ı
  `handleExportFile`'dan kaldırılıp yalnızca testler çalıştırıldığında testler
  **kırılmadı** — araştırma sonucu (TASK-027.55 R1'deki aynı bulgu) asıl
  korumanın native `disabled` attribute'u olduğu ortaya çıktı (RTL disabled
  element'e click dispatch etmiyor). Bunu doğru şekilde izole etmek için
  **guard'ı bırakıp `disabled` attribute'unu kaldırarak** yeniden test edildi
  — bu sefer testler guard'ın **tek başına** yeterli olduğunu doğruladı (aynı
  yöntem TASK-027.55 R1'de CSV/PNG için de kullanılmıştı). Her iki mutasyon da
  geri alındı; kalıcı kod değişmedi.
- Diğer kalemler (renderer/fallback ayrımı, PDF/XLSX magic number, timeout/
  abort, dosya adı sanitization, secret redaction, production'da fixture
  engeli) yukarıdaki yeni testlerin doğrudan konusu; `report-render.service.spec.ts`'in
  timeout/abort/magic-number-benzeri (content-type/dosya adı) testleri bu
  task'ta değiştirilmeyen, önceki task'lardan miras kod üzerinde zaten
  mevcut — yeniden mutasyon test edilmedi (kapsamım dışı: dokunmadığım kod).

### Doğrulama

- `pnpm --filter api exec tsc --noEmit`: temiz.
- `pnpm --filter web exec tsc --noEmit`: temiz.
- `pnpm --filter api exec jest reporting --runInBand`: **8 suite / 100 test PASS**.
- `pnpm --filter api exec jest --runInBand` (tam suite): **60 suite / 1630 test PASS**.
- `pnpm --filter web exec vitest run`: **18 suite / 230 test PASS**.
- `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose
  ./scripts/check.sh --skip-docker` (Q-ENV01 workaround'u gerekti): tam PASS —
  `next build` `/app/reports/[id]/analysis` route'unu (111 kB, değişmedi —
  yeni bağımlılık yok) başarıyla derledi.
- **Gerçek Jasper container testi**: yukarıda açıklandığı gibi, bu repo'nun
  zaten çalışan dev ortamındaki `metnex-jasper-renderer-dev` container'ına
  karşı yapıldı (hem manuel curl ile ön-doğrulama, hem kalıcı bir jest testi
  olarak `reporting.jasper-integration.spec.ts`'e eklendi). **Hiçbir yeni
  Docker build/run yapılmadı** — yalnızca mevcut, sağlıklı container'a HTTP
  isteği gönderildi.
- Gerçek DB/production verisi kullanılmadı.
- Tarayıcı/E2E doğrulaması yapılmadı — bu oturum headless; PDF/XLSX
  butonlarının gerçek bir tarayıcıda tıklanıp dosyanın indiğinin görsel
  doğrulaması insan (AI1) tarafından yapılmalıdır.

### AI1 Onayı (2026-09-23)

AI1, teslimi inceledi ve `done` durumuna onayladı. Onaylanan noktalar: mevcut
export endpoint ve permission sözleşmesinin korunmuş olması; PDF/XLSX
butonlarının analiz ekranına eklenmiş olması; aktif filtrelerin export'a
aktarılması; Jasper ve fallback yollarının korunmuş olması; development
fixture etiketinin yalnızca development koşulunda eklenmesi; tenant scope ve
`supportedOutputFormats` kontrollerinin testli olması; single-flight export
guard'ının `disabled` olmadan da çalıştığının doğrulanmış olması; API 60
suite/1630 test, web 18 suite/230 test başarılı olması; tam
`check.sh --skip-docker`'ın başarılı olması.

### Kapsam dışı (bu task'ta yapılmadı)

Yeni Jasper renderer image/Dockerfile, Jasper Java kodu değişikliği, yeni
JRXML template, SCADA/SQL Server adapter, yeni tenant/schema/migration, yeni
permission/rol, Wave 2/3, CSV/PNG export davranış değişikliği (dokunulmadı,
tüm CSV/PNG testleri hâlâ geçiyor), gerçek production verisi, Docker
build/run, git commit/push.

### Değiştirilen/eklenen dosyalar

- `apps/api/src/reporting/dataset/dev-fixture-dataset.provider.ts` (değişti —
  `supportedOutputFormats` güncellendi, `buildDevFixtureExportLabelRow` eklendi)
- `apps/api/src/reporting/reporting.service.ts` (değişti — `exportReport`
  etiket satırı enjeksiyonu, fallback PDF satır formatı düzeltmesi)
- `apps/api/src/reporting/reporting.service.spec.ts` (değişti — yeni
  `exportReport` ve "dev fixture export label row" blokları)
- `apps/api/src/reporting/reporting.jasper-integration.spec.ts` (değişti —
  yeni gerçek-Jasper dev-fixture testi)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.tsx`
  (değişti — PDF/XLSX butonları, `handleExportFile`, yeni guard/state'ler)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.spec.tsx`
  (değişti — yeni "PDF/XLSX export" bloğu, 32 test)

`ReportingController`, `ReportRenderService`, `report-output.util.ts`,
`template-registry.ts` bu task'ta **değiştirilmedi** (mevcut sözleşme
korundu).
