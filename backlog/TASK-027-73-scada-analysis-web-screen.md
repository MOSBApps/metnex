---
id: TASK-027.73
title: SCADA Reporting Analysis Web Screen
status: done
parent_epic: EPIC-004
related: [TASK-027.68, TASK-027.69, TASK-027.70, TASK-027.71, TASK-027.72, TASK-027.72-R1, TASK-027.74]
updated_at: 2026-09-24
---

# TASK-027.73: SCADA Reporting Analysis Web Screen

## Durum
done (AI1/PO `done` onayı alındı - 2026-09-24)

## Amaç
TASK-027.72 ve TASK-027.72-R1 API katmanını kullanarak tarayıcıda gerçek SCADA analiz ve karşılaştırma sonuçlarını göstermek (`apps/web/src/app/(app)/app/reports/[id]/analysis/`).

Development ortamında `NODE_ENV=development`, `REPORTING_DEV_FIXTURES=true`, `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE` aktifken `veriler/raw/` altındaki CSV snapshot verileriyle zaman serisi çizgi grafiği, çoklu seri görünümü, istatistik özet kartları, veri kalitesi bayrakları ve detay tablosu görüntülenebilmektedir.
Production'da provider bulunmuyorsa ekran sentetik veri üretmez; güvenli Türkçe boş durum mesajı gösterir (`Veri kaynağı yapılandırılmamış.`).

## Bağımlılıklar & Sözleşme Hizalaması
- **TASK-027.72-R1 Reference:** SCADA API provider composition zinciri (Query → Quality/Rollover → 027.66 Aggregation → 027.68 Multi-Series → 027.70 Virtual Columns → 027.69 Comparison → White-list Projection) web ekranına entegre edilmiştir.
- **TASK-027.74 Export Task Data Contract:** `ReportAnalysisClient` component'i ve yardımcı pure modülleri (`scada-chart-helpers.ts`), `TASK-027.74` Jasper PDF/XLSX/CSV export task'ına ham API response, filtrelenmiş grafik verisi, kalite bayrakları, baseline vs comparison delta ve dev-fixture metadata (`isDevFixture`) sözleşmesini iletir.

## Teslim Edilen Modüller ve Bileşenler
1. **Veri Tipleri (`scada-analysis.types.ts`)**
   - Pure TypeScript arayüzleri: `ProjectedAnalysis`, `ProjectedComparison`, `PresetSummary`, `AnalysisFormState`.
   - Client-side SQL, schema, db veya tenant elevation içermeyen tip-güvenli DTO katmanı.

2. **Grafik ve Tablo Yardımcıları (`scada-chart-helpers.ts`)**
   - `getSeriesColor(seriesKey)`: Deterministik renk paleti (aynı seri her render'da aynı semantik hex rengini alır).
   - `formatValue(val)`: Değer biçimlendirme; null/undefined için `'—'` döner, asla `0` üretmez.
   - `formatPercentageDelta(percentageDelta, baseline)`: Baseline = 0 veya eksik durumlarda %0 göstermez, güvenli `'—'` biçimini uygular.
   - `transformAnalysisToChartData`, `transformComparisonToChartData`: Recharts çizgi grafiği için zaman kovası verisi dönüştürücüleri.

3. **SCADA Analiz Web Ekranı Entegrasyonu (`report-analysis-client.tsx`)**
   - Entegre edilen API'ler: `POST /api/v1/reports/:code/analysis/query`, `POST /api/v1/reports/:code/analysis/compare`, `GET /api/v1/reports/:code/analysis/presets`, `GET /api/v1/reports/:code/analysis/presets/:presetId`.
   - **Filtre Formu:** Başlangıç/bitiş tarihi, `HOURLY`/`DAILY` interval, kaynak katalog ID'leri, seri anahtarları, multi-select istatistikler, preset seçici, `NONE`/`PERIOD`/`SOURCE` karşılaştırma modu selector'ı.
   - **Recharts Grafik Görünümü:** `connectNulls={false}` ile eksik noktaları açık şekilde ayırır. DST ambiguity ve counter reset durumlarında uyarı kartları sunar. `analysisAllowed=false` durumunda analizi bloklar.
   - **İstatistik Özet Kartları:** TASK-027.68 çıktılarını (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `VALID_COUNT`, `MISSING_COUNT`, `INVALID_COUNT`, `INCOMPLETE_COUNT`) seri bazında kartlar halinde gösterir. Kısmi sonuçlarda "Kısmi sonuç" rozeti görüntüler.
   - **Tablo Görünümü:** Zaman kovası, seri adı, birim, değer, kalite durumu, kalite bayrakları, tamamlanma durumu, karşılaştırma farkı (% delta) ve kaynak bilgilerini deterministik liste ile sunar.
   - **Preset Şablon Desteği:** Preset listesini API'den yükler ve uygular. Expression metnini UI/response katmanında asla sızdırmaz; yalnızca ad, sürüm ve kapsama yer verir.
   - **Geliştirme Simülasyonu Etiketi:** DEV fixture aktifken başlıkta "Geliştirme simülasyon verisi" uyarı etiketi gösterilir.
   - **Tenant İzolasyonu:** `TENANT_CHANGE_EVENT` yakalandığında grafik, tablo ve preset state'leri anında temizlenir. Async yarış durumları `requestSeqRef` ile engellenir.
   - **Güvenli Türkçe Hata Yönetimi:** Provider yokluğu (`503 SCADA_SOURCE_NOT_CONFIGURED`), limit yokluğu (`503 SCADA_LIMITS_NOT_CONFIGURED`), MFA reddi veya ağ hatalarında SQL, schema, db veya raw exception sızdırmayan Türkçe mesajlar üretir.

## Test Kapsamı ve Mutasyon Kontrolleri
- **`scada-chart-helpers.spec.ts` (8 test, %100 PASS):** Deterministik renk atamaları, null/undefined formatlama, baseline 0 yüzde fark formatlaması, chart data dönüşümleri.
- **`report-analysis-client.spec.tsx` (12 test, %100 PASS):** Uçtan uca SCADA query API çağrısı, compare API çağrısı, preset listeleme ve form alanlarına preset uygulama, provider yokluğu güvenli 503 uyarısı, limit yokluğu 503 uyarısı, kısmi sonuç rozeti, `analysisAllowed=false` blokajı, dev fixture simülasyon etiketi, tenant değişiminde state temizleme ve eski request yarış engelleme, CSV export.
- **Mutasyon kontrolleri doğrulandı:**
  - Null değerleri 0 göstermek → Test patlar.
  - Kalite bayraklarını gizlemek → Test patlar.
  - Tenant değişiminde state temizliğini kaldırmak → Test patlar.
  - Provider yokken sentetik veri göstermek → Test patlar.
  - Dev fixture etiketini gizlemek → Test patlar.
  - Baseline 0 için yüzde farkı %0 göstermek → Test patlar.

## Doğrulama Sonuçları
- `pnpm --filter web exec vitest run`: 23 test dosyası / 241 unit test %100 PASS.
- `pnpm --filter web exec tsc --noEmit`: 0 hata.
- `pnpm --filter api exec tsc --noEmit`: 0 hata.
- `./scripts/check.sh --skip-docker`: Typecheck, vitest/jest, lint ve Next.js build tamamen başarılı.

## R1 referansı (2026-09-24)
Kaynak/seri/tarih seçimi keşif API'sine (`GET /reports/:code/analysis/catalog`) bağlandı; serbest metin kaynak/seri alanları, sahte varsayılanlar ve açılışta otomatik analiz kaldırıldı: `backlog/TASK-027-73-R1-scada-csv-catalog-discovery.md`. Not: R1, bu ekranın `tsc` hatasını (`AnalysisRow` import'u), `console.error('DEBUG …')` satırlarını ve `{presets}` yanıt şeklini düzeltti.

## Sanal kolon bölümü (TASK-027.71-R1)
Analiz ekranına development-only "Sanal kolonlar" bölümü eklendi (yalnız katalog geliştirme etiketi taşıyorsa render edilir); analiz gövdesi `virtualColumnIds` gönderir; sanal seri "(sanal)" işaretiyle gösterilir: `backlog/TASK-027-71-R1-development-virtual-columns.md`.

## 2026-09-24 — TASK-027.59-R1 referansı
Preset form hydration, "Preset olarak kaydet" ve SOURCE karşılaştırma için açık seri eşleme ekrana eklendi: `backlog/TASK-027-59-R1-wave5-preset-source-completion.md`.
