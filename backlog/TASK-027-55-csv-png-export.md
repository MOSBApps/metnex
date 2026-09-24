---
id: TASK-027.55
title: Development Reporting Fixtures ve CSV/PNG Export
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
related: [TASK-027.54, TASK-027.54-R2]
updated_at: 2026-09-23
---

# TASK-027.55: Development Reporting Fixtures ve CSV/PNG Export

> **TASK-027.56 notu (2026-09-23):** Bu ekrana PDF/XLSX export (mevcut Jasper
> renderer sözleşmesi üzerinden) `TASK-027.56` ile eklendi — bkz.
> `backlog/TASK-027-56-pdf-xlsx-jasper-export.md`. Bu dosyanın `done` durumu ve
> içeriği TASK-027.56 tarafından değiştirilmedi; TASK-027.56 de additive bir
> üst katman (aynı `export-guard.ts` yeniden kullanıldı, CSV/PNG davranışı
> değişmedi). TASK-027.56 ayrıca `DEV_FIXTURE_ARTIFACT.supportedOutputFormats`'ı
> `[]`'den `['PDF', 'XLSX']`'e güncelledi (bellek-içi metadata, DB yazımı yok).

## Amaç

Reporting analiz ekranını geliştirme ortamında kontrollü simülasyon verisiyle
çalıştırmak (Bölüm A) ve aynı ekrandaki tablo/grafik verilerini CSV ve PNG
olarak dışa aktarmak (Bölüm B/C).

> Not: bu dosyanın önceki taslağı (`status: planned`, "Export işlemi audit ve
> ayrı permission ile kontrol edilir") ayrı bir eski placeholder'dı. Bu task'ın
> gerçek talimatı bunun tersini açıkça söylüyor: **yeni permission kodu
> uydurma**, mevcut `REPORT:ARTIFACT:VIEW` zincirini koru. Aşağıdaki teslim
> notu, gerçek talimata göre yapılan işi belgeler.

## Teslim notu (2026-09-23, AI2)

### Keşif

`ReportingController`'daki `GET /reports/:code/data` (TASK-027.54) zaten
filtrelenmiş satırları JSON olarak döndürüyordu; CSV/PNG export'un ihtiyaç
duyduğu her şey (satırlar, `totalAmount`, aktif filtreler) frontend'de zaten
state'te mevcuttu. **Backend'e export için hiçbir yeni endpoint eklenmedi** —
her ikisi de tamamen frontend'de, ekranda zaten yüklü olan veriden üretiliyor.

### Bölüm A — Development-only simülasyon verisi

**Tasarım kararı:** DEC-0012 ve TASK-027.54 R1'in kök nedenini tekrarlamamak
için, hem simülasyon *verisi* hem de onu barındıran artifact *kataloğu*
tamamen bellek-içi tutuldu — **hiçbir DB satırı, hiçbir migration, hiçbir
`onModuleInit`/startup seed yok**.

- `apps/api/src/reporting/dataset/dev-fixture-dataset.provider.ts` (yeni):
  - `isDevFixtureEnabled(env)` — yalnızca `NODE_ENV=development` **VE**
    `REPORTING_DEV_FIXTURES=true` olduğunda `true`; her çağrıda yeniden
    değerlendirilir (boot'ta cache'lenmez).
  - `DevFixtureDatasetProvider` — gerçek `ReportDatasetProvider` sözleşmesini
    implement eder; tenant başına mulberry32 PRNG ile deterministik 60 satır
    (tarih/saat, durum, miktar, birim fiyat, toplam tutar); `q`/`status`
    filtreleri mevcut `/data` sözleşmesiyle birebir uyumlu.
  - `DEV_FIXTURE_ARTIFACT` — **DB'ye hiç yazılmayan**, bellek-içi bir artifact
    kaydı (`code: DEV_REPORTING_FIXTURE`, `title: "Geliştirme Simülasyon
    Verisi"`).
- `ReportingService.getArtifact`/`listArtifacts` — `isDevFixtureEnabled()` ve
  kod eşleşmesi doğrulandığında `DEV_FIXTURE_ARTIFACT`'ı DB sorgusu **hiç
  yapmadan** döndürür/listeye ekler; her iki metod da devre dışıyken veya
  başka bir kod için her zaman gerçek DB sorgusuna düşer.
- `ReportingModule` — `DevFixtureDatasetProvider`, yalnızca modül yüklenirken
  (`main.ts`'in `dotenv.config()`'undan hemen sonra) `isDevFixtureEnabled()`
  `true` ise `providers` dizisine eklenir; aksi halde bu sınıf Nest DI
  container'ına **hiç girmez** (sadece "kullanılmaz" değil — gerçekten
  register edilmez). `REPORT_DATASET_PROVIDERS` token'ı devre dışıyken hâlâ
  DEC-0012'nin literal boş dizisini (`useValue: []`) kullanır.

**Etkinleştirme (dokümante edildi, `apps/api/.env.example`'a eklendi, yorum
satırı olarak — varsayılan olarak kapalı):**
```env
NODE_ENV=development
REPORTING_DEV_FIXTURES=true
```
Geliştirici bunu kendi `apps/api/.env`'ine ekleyip API'yi yeniden başlattığında
`/app/reports` listesinde "Geliştirme Simülasyon Verisi" artifact'ı görünür ve
analiz ekranında **"Geliştirme simülasyon verisi"** rozeti gösterilir. Bu
oturumda `apps/api/.env` **değiştirilmedi** — flag varsayılan olarak kapalı
kaldı, yalnızca `.env.example`'da belgelendi.

**Production'da devre dışı olduğunun kanıtı:** `reporting.module.spec.ts`
(davranışsal, `jest.resetModules()` + gerçek `Reflect.getMetadata` okuma ile —
DI container hiç instantiate edilmeden) dört senaryoyu ayrı ayrı doğruluyor:
`NODE_ENV=production` + flag=true, flag eksik, flag="false" — hiçbirinde
`DevFixtureDatasetProvider` `providers` dizisinde yok; yalnızca
`NODE_ENV=development` + flag=true'da var. `reporting.service.spec.ts` aynı
dört senaryoyu `getArtifact`/`listArtifacts` seviyesinde ayrıca doğruluyor ve
hiçbir senaryoda `db.insert`'in çağrılmadığını kanıtlıyor.

### Bölüm B — CSV export

- `apps/web/.../reports/[id]/analysis/csv-export.ts` (yeni, pure): `escapeCsvCell`
  (CSV injection: `=+-@` ile başlayan hücreler `'` ile escape edilir, RFC 4180
  quoting), `buildCsv` (ekrandaki aynı filtrelenmiş+sıralanmış satırlar,
  başlık satırı dahil, Türkçe karakterler UTF-16 string olarak korunur),
  `sanitizeFileNameSegment`/`buildCsvFileName` (path traversal, kontrol
  karakteri, CR/LF header-injection riski temizlenir).
- İndirme: `Blob(['﻿' + csv], {type:'text/csv;charset=utf-8'})` — BOM,
  Excel'de Türkçe karakterlerin doğru görünmesi için.
- Veri yoksa CSV butonu hiç render edilmiyor (boş-durum tüm içerik alanının
  yerini alıyor) — "buton disabled olabilir" seçeneği bu şekilde karşılanıyor.
- Çift tıklama koruması: senkron üretim olduğu için yalnızca bir ref yetmiyor
  (senkron handler `finally` içinde ref'i hemen sıfırlarsa ikinci tıklama da
  geçer) — 400ms'lik bir soğuma penceresi eklendi; ek olarak buton
  `disabled={exportingCsv || ...}` olduğu için (React state senkron flush
  olduğundan) ikinci tıklama zaten native `disabled` tarafından da
  engelleniyor. İkisi birlikte "çift tıklama → tek export" garantisi veriyor.

### Bölüm C — PNG export

- **Yeni bağımlılık eklenmedi.** Gerekçe: Recharts zaten kendi `<svg>`'ini
  DOM'a render ediyor; bu tek, statik bir grafik anlık görüntüsü — tam DOM
  screenshot'ı (html2canvas/dom-to-image'in çözdüğü problem) gerekmiyor.
  `XMLSerializer` (SVG → string) + `Image` (string → bitmap) + `Canvas`
  (bitmap + başlık metni → PNG) — üçü de native tarayıcı API'si — yeterli.
- `apps/web/.../reports/[id]/analysis/png-export.ts` (yeni): `renderSvgToPngBlob`
  (SVG'yi serialize edip canvas'a çizer, üstüne başlık/filtre/simülasyon
  etiketi metnini yazar, PNG Blob döner; hata durumunda her zaman düz, güvenli
  bir `Error` fırlatır — ham canvas/browser hatası asla dışarı sızmaz) ve
  `buildPngCaptionLines` (pure: başlık, aktif `q`/`status` özeti, oluşturma
  zamanı, ve **yalnızca dev fixture aktifse** "Geliştirme simülasyon verisi"
  satırı — bu, PNG'nin kendisine gömülür).
- Grafik verisi yoksa (boş `dailyTotals`) PNG butonu da hiç render edilmiyor —
  CSV ile aynı desen.
- Çift tıklama koruması: PNG async olduğu için ref, ilk `await`'ten önce
  senkron olarak `true`'ya çekiliyor — ikinci tıklama ilk `await`'e ulaşmadan
  reddediliyor; ek olarak buton da `disabled={exportingPng || ...}`.
- Dosya adı `sanitizeFileNameSegment`/`buildPngFileName` ile aynı güvenli
  şemayı paylaşıyor (`csv-export.ts`'den import edilir).

### Tenant ve authorization güvenliği

- Hem CSV hem PNG export, ekranda **zaten yüklü olan** `data`/`rows`/`dailyTotals`
  state'inden üretiliyor — ayrı bir API çağrısı yapmıyor, dolayısıyla mevcut
  `REPORT:ARTIFACT:VIEW` guard zincirinin (`JwtAuthGuard`/`PermissionGuard`/
  `MfaEnforcementGuard`) ötesine hiçbir şekilde geçmiyor. **Yeni permission
  kodu eklenmedi.**
- Tenant değişiminde (`TENANT_CHANGE_EVENT`): mevcut `load()` fonksiyonu
  `setData(null)` ile state'i temizleyip yeniden yüklüyor (TASK-027.54'ten
  miras) — CSV/PNG butonları bu sırada `!data` nedeniyle kaybolduğu için eski
  tenant'ın verisiyle export **mümkün değil**; ek olarak `exportError` de
  `load()` başında temizleniyor.
- API hataları (401/403/5xx) TASK-027.54'ün kurduğu güvenli/statik mesaj
  desenini aynen kullanıyor — bu task hiçbir yeni backend hata yüzeyi
  eklemedi.

### Testler

**Backend (yeni: 15 + 10 + 16 mevcut dosyaya eklenen = toplam güncellenen/yeni
dosyalarda 41 backend testi):**
- `dev-fixture-dataset.provider.spec.ts` (yeni, 15 test): env-gate matrisi,
  deterministiklik, çapraz-tenant izolasyonu, satır şekli, filtreler, secret
  sızıntısı yok.
- `reporting.module.spec.ts` (genişletildi, +5 davranışsal test): gerçek
  `Reflect.getMetadata` okuma ile 4 env senaryosunda provider'ın DI'a
  girip/girmediği.
- `reporting.service.spec.ts` (genişletildi, +7 test): `getArtifact`/
  `listArtifacts`'ın fixture ikamesi, DB'ye hiç yazmadığı, yanlış env'de
  devre dışı kaldığı.

**Frontend (yeni: 22 + 9 + 18 (net +8, mevcut dosyaya eklenen) = 39 yeni test):**
- `csv-export.spec.ts` (yeni, 22 test): escape, quoting, Türkçe karakter,
  dosya adı güvenliği, boş veri.
- `png-export.spec.ts` (yeni, 9 test): caption satırları (pure), canvas/Image
  mock'lu orkestrasyon (sıra: arkaplan → başlık → grafik; hata güvenliği;
  object URL temizliği).
- `report-analysis-client.spec.tsx` (genişletildi, +9 test): rozet
  görünürlüğü, CSV/PNG buton disabled/enabled durumları, indirme akışı, çift
  tıklama koruması (her ikisi), PNG hata mesajı güvenliği, tenant-switch'te
  export state temizliği, veri yokken PNG'nin hiç render edilmemesi.
- `vitest.setup.ts` güncellendi: sabit boyutlu bir `ResizeObserver` polyfill'i
  eklendi — jsdom'da Recharts'ın `<svg>`'i hiç render etmemesi sorununu çözer
  (PNG export testlerinin gerçek bir `<svg>` DOM node'u bulabilmesi için
  gerekliydi); başka hiçbir test paketini etkilemedi (tam suite hâlâ yeşil).

**Mutasyon kontrolleri (gerçekten çalıştırıldı — kod geçici olarak bozulup
testler kırmızıya döndü, sonra geri alınıp yeşile döndüğü doğrulandı):**
- Production'da fixture provider kaydını engelleyen kontrol
  (`isDevFixtureEnabled()` gate'i `reporting.module.ts`'ten kaldırıldı) →
  `reporting.module.spec.ts`'te 3/10 test kırıldı. ✅
- Tenant izolasyonu (`hashSeed(tenantId)` sabit bir string'e sabitlendi) →
  `dev-fixture-dataset.provider.spec.ts`'te 1/15 test kırıldı (çapraz-tenant
  testi). ✅
- CSV injection escape (`CSV_INJECTION_PREFIX` kontrolü kaldırıldı) →
  `csv-export.spec.ts`'te 5/22 test kırıldı. ✅
- Simülasyon etiketi (rozet koşulu kaldırıldı) →
  `report-analysis-client.spec.tsx`'te ilgili test kırıldı. ✅
- Çift export engeli: CSV'nin ref-guard'ı kaldırıldığında test YİNE geçti —
  araştırma sonucu gerçek koruyucunun `disabled` attribute'u olduğu ortaya
  çıktı (RTL, native `disabled` element'e `click` dispatch etmiyor; React'ın
  senkron state flush'ı ile bu, test ortamında da gerçek tarayıcıdaki gibi
  çalışıyor). Bu **gizlenmedi** — ref+cooldown mekanizması ek savunma
  katmanı, asıl garanti `disabled` attribute'undan geliyor; bu bulgu burada
  şeffafça raporlanıyor.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit`: temiz.
- `pnpm --filter web exec tsc --noEmit`: temiz.
- `pnpm --filter web exec vitest run`: **17 suite / 204 test PASS**.
- `pnpm --filter api exec jest --runInBand`: **60 suite / 1610 test PASS**.
- `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose
  ./scripts/check.sh --skip-docker` (Q-ENV01 workaround'u gerekti): tam PASS —
  `next build` yeni route boyutlarını (`/app/reports/[id]/analysis` 111 kB,
  +1 kB — csv/png export modülleri dahil) başarıyla derledi.
- Gerçek DB/production verisi kullanılmadı — tüm testler mock DB / mock
  browser API'leri üzerinden çalıştı.
- Tarayıcı/E2E doğrulaması yapılmadı — bu oturum headless; CSV/PNG'nin gerçek
  bir tarayıcıda indirilip açıldığının görsel doğrulaması insan (AI1)
  tarafından yapılmalıdır. (Bu maddenin PNG "gerçek piksel çıktısı" kısmı R1
  düzeltme turunda güçlendirildi — bkz. altta.)

## R1 düzeltme turu (2026-09-23, AI2 — AI1 review sonrası)

İlk teslimde AI1 iki eksik belirledi: (1) PNG'nin gerçek çıktı olarak
doğrulanmamış olması (yalnızca mock'lanmış orkestrasyon), (2) çift-export
mutasyon kontrolünün başarısız olması (koruma yalnızca UI `disabled`
attribute'una dayanıyordu, export fonksiyonunun kendi seviyesinde değildi).
İkisi de bu turda çözüldü.

### 1) PNG gerçek çıktı doğrulaması

`apps/web`'e **`canvas` (node-canvas) devDependency** olarak eklendi
(`^3.2.3`, yalnızca test ortamı için — production bundle'a girmez, prebuilt
native binary bu ortamda başarıyla indirildi/derlendi). jsdom, `canvas` paketi
node_modules'te bulunduğunda `HTMLCanvasElement`/`CanvasRenderingContext2D`'yi
otomatik olarak bu gerçek implementasyonla destekliyor — artık `fillRect`,
`fillText`, `drawImage`, `toBlob`, `toDataURL` **gerçekten rasterize ediyor**,
mock değil.

`png-export.spec.ts`'e yeni bir "REAL rasterization (canvas devDependency, no
context mocking)" bloğu eklendi (3 test) — canvas/context'in **hiçbiri**
mock'lanmıyor:
- Gerçek PNG dosyası üretildiğini doğrudan doğrular: magic number
  (`89 50 4E 47 0D 0A 1A 0A`), gerçek IHDR chunk'ından okunan genişlik/
  yükseklik (istenen boyut + caption offset formülüyle birebir eşleşiyor),
  ve 200 baytın üzerinde gerçek (boş/bozuk bir PNG'nin çok altında kalacağı)
  bir dosya boyutu.
- IHDR yüksekliğinin caption satır sayısıyla gerçekten büyüdüğünü (sabit bir
  değer değil, gerçek matematik) doğrular.
- Caption metninin (örn. bir secret-şekilli değer) ham baytlarda düz metin
  olarak bulunmadığını doğrular — gerçek bir sıkıştırılmış PNG olduğunun
  kanıtı, düz metin dosyası değil.

**Tek kalan, açıkça belgelenmiş sınır:** `Image` (SVG string → decode edilmiş
bitmap) adımı bu sandbox'ta hâlâ gerçek değil — doğrudan deneyle doğrulandı:
hem `blob:` hem `data:` SVG kaynağı bu ortamda node-canvas'ın `Image`
sınıfında `onload`/`onerror` hiç tetiklemiyor (muhtemelen prebuilt binary'de
librsvg desteği yok). Bu adım, gerçek bir `<canvas>` elemanının (gerçek bir
`HTMLCanvasElement` — düz bir mock nesne değil, bu yüzden jsdom'un kendi
`drawImage` tip doğrulamasını geçiyor) "decode edilmiş görüntü" yerine
geçmesiyle atlatıldı; canvas boyutlandırma, caption çizimi ve PNG encoding
zincirinin tamamı gerçek. Bu, gerçek tarayıcılarda çalışan ama bu Node
sandbox'ında rasterize edilemeyen tek adımın şeffaf bir açıklamasıdır — gizli
bir kısayol değildir.

**Mutasyon testiyle kanıtlandı:** `png-export.ts`'teki caption-height
formülü (`captionLines.length * 18 + 16`) geçici olarak `0`'a sabitlenip yeni
gerçek-rasterizasyon testleri çalıştırıldı — 3 test kırıldı (IHDR yüksekliği
artık beklenenle uyuşmuyordu), sonra geri alınıp tekrar yeşile döndüğü
doğrulandı.

### 2) Çift-export koruması artık export fonksiyonunun kendi seviyesinde

`apps/web/.../analysis/export-guard.ts` (yeni): `createExportGuard(cooldownMs)`
— React'tan, DOM'dan, `disabled` attribute'undan tamamen bağımsız, saf bir
single-flight kilit. `tryRun` (senkron iş, opsiyonel soğuma penceresiyle —
CSV'nin senkron üretimi için 400ms) ve `tryRunAsync` (asenkron iş, kilit ilk
`await`'ten önce senkron olarak alınıyor — PNG için).
`report-analysis-client.tsx`'teki eski ref+setTimeout ad-hoc mantığı bu ortak,
bağımsız test edilebilir modülle değiştirildi.

`export-guard.spec.ts` (yeni, 9 test): **sıfır DOM/React** — guard'ı düz bir
fonksiyon olarak çağırıp doğrudan test ediyor: art arda senkron çağrı
soğuma penceresinde reddediliyor, soğuma bitince tekrar izin veriliyor,
asenkron çağrı ilk promise çözülmeden önce reddediliyor, hata durumunda kilit
yine de serbest kalıyor.

**Mutasyon testiyle kanıtlandı:** `tryRunAsync`'teki kilit kontrolü/set'i
tamamen kaldırıldı → "ikinci çağrı ilk çözülmeden önce reddediliyor" testi
kırıldı, geri alınıp tekrar yeşile döndüğü doğrulandı.

**Ayrıca doğrudan kanıtlandı — guard'ın UI'dan bağımsız yeterliliği:**
`report-analysis-client.tsx`'teki CSV/PNG butonlarının `disabled={...}`
attribute'u geçici olarak `disabled={false}`'a sabitlenip (UI koruması tamamen
kaldırılıp) çift-tıklama testleri tekrar çalıştırıldı — **ikisi de hâlâ geçti**
(tek export). Bu, korumanın artık gerçekten export fonksiyonunun kendi
çağrı yolunda yaşadığının, yalnızca UI attribute'una dayanmadığının doğrudan
kanıtıdır. Değişiklik sonra geri alındı.

### Doğrulama (bu düzeltme turu sonrası)

- `pnpm --filter web exec tsc --noEmit`: temiz.
- `pnpm --filter web exec vitest run`: **18 suite / 216 test PASS** (12 yeni:
  export-guard 9 + png-export gerçek-rasterizasyon 3).
- `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose
  ./scripts/check.sh --skip-docker` (Q-ENV01 workaround'u gerekti): tam PASS,
  sıfır lint uyarısı.
- Gerçek DB/production verisi kullanılmadı. Tarayıcı/E2E doğrulaması hâlâ
  yapılmadı (headless oturum) — ama artık PNG *dosya üretimi* gerçek
  rasterizasyonla kanıtlandı; yalnızca "kullanıcı gerçek tarayıcıda indirip
  açtığında görsel olarak doğru mu" sorusu insan doğrulaması gerektiriyor.

### Değiştirilen/eklenen dosyalar (bu düzeltme turu, yukarıdaki listeye ek)

- `apps/web/package.json` (değişti — `canvas` devDependency eklendi)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/export-guard.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/export-guard.spec.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/png-export.spec.ts` (değişti — gerçek rasterizasyon bloğu eklendi)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.tsx` (değişti — export-guard'a geçiş)

### AI1 Onayı (2026-09-23)

AI1, R1 düzeltme turunu inceledi ve `done` durumuna onayladı. Kapatılan
eksikler: gerçek PNG rasterizasyonunun magic number ve IHDR boyutlarıyla
doğrulanması; caption yükseklik hesabının mutasyon testiyle güvence altına
alınması; çift export korumasının artık DOM/React `disabled` durumundan
bağımsız saf single-flight guard ile sağlanması; guard'ın doğrudan test
edilmiş olması ve UI `disabled` kaldırıldığında da çalıştığının kanıtlanmış
olması; web testlerinin 18 suite/216 test olarak geçmesi; tam `check.sh`'ın
başarılı olması. node-canvas'ın SVG decode sınırı belgelenmiş durumda kabul
edildi — bu sınırın task'ın doğrulanmış canvas/PNG zincirini engellemediği
teyit edildi.

### Kapsam dışı (bu task'ta yapılmadı)

Gerçek SCADA/SQL Server adapter, Jasper renderer değişikliği, PDF export,
XLSX export, yeni tenant/schema/migration, Demo Operations modülünün geri
getirilmesi, production fixture verisi, yeni permission/rol, Wave 2/3, Docker
build/run, git commit/push.

### Değiştirilen/eklenen dosyalar

- `apps/api/src/reporting/dataset/dev-fixture-dataset.provider.ts` (yeni)
- `apps/api/src/reporting/dataset/dev-fixture-dataset.provider.spec.ts` (yeni)
- `apps/api/src/reporting/reporting.service.ts` (değişti — fixture ikamesi)
- `apps/api/src/reporting/reporting.service.spec.ts` (değişti — +7 test)
- `apps/api/src/reporting/reporting.module.ts` (değişti — koşullu DI kaydı)
- `apps/api/src/reporting/reporting.module.spec.ts` (değişti — +5 davranışsal test)
- `apps/api/.env.example` (değişti — `REPORTING_DEV_FIXTURES` dokümante edildi, kapalı/yorum satırı)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/csv-export.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/csv-export.spec.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/png-export.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/png-export.spec.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.tsx` (değişti — rozet, CSV/PNG butonları)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.spec.tsx` (değişti — +9 test)
- `apps/web/vitest.setup.ts` (değişti — ResizeObserver polyfill)
