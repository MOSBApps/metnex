---
id: TASK-027.69
title: SCADA Dönem ve Kaynak Karşılaştırma Engine
status: done
srs_refs: [FR-039, FR-040, FR-041, FR-042, FR-043, FR-044, FR-045, AC-007]
parent_epic: EPIC-004
related: [TASK-027.65, TASK-027.66, TASK-027.67, TASK-027.68]
updated_at: 2026-09-24
---

# TASK-027.69: SCADA Dönem ve Kaynak Karşılaştırma Engine

> Planlama dosyası: `backlog/TASK-027-69-period-and-source-comparison.md` (TASK-027.62 çıktısı). Bu dosya AI1'in `ready` spesifikasyonuna göre **teslim kaydıdır**; ID aynıdır.

## Durum
review

## Amaç
TASK-027.68'in çoklu seri çıktısıyla iki farklı **dönemi** veya iki farklı **kaynağı** normalize edilmiş zaman kovaları üzerinden karşılaştırmak. **Saf modül** (`apps/api/src/reporting/scada/comparison/`): I/O, audit, log, DB, Docker yok; hiçbir Nest modülüne kayıtlı değil; yeni permission/endpoint/UI/veri kaynağı yok.

## Teslim edilen
- **Sözleşme** (`scada-comparison.contract.ts`): `PeriodComparisonRequest` (baseline/comparison dönemi: `startAt, endAt, bucketInterval, timezone, customerRootTenantId, series`), `SourceComparisonRequest` (`leftSource`, `rightSource`, ortak `period`, açık `sourceMapping`, `seriesMapping`), `ComparisonRow`, `ScadaComparisonResult`, özet, grafik sözleşmesi. Çıktıda SQL, schema/fiziksel DB adı, bağlantı bilgisi, token/parola/hash, ham driver hatası ve sınırsız kullanıcı metni **yok** (etiketler ≤128, yazdırılabilir).
- **Servis** (`scada-comparison.service.ts`): `ScadaComparisonService.comparePeriods` / `compareSources`, `toComparisonChart`. Yardımcılar: `comparison-core.ts` (eşleştirme), `comparison-gates.ts` (kapılar), `comparison-quality.ts` (kenar/satır durumu), `comparison-math.ts` (matematik + tek yuvarlama noktası); `period-comparison.ts` / `source-comparison.ts` ince giriş noktaları.
- **Kova eşleştirme (yalnızca açık anahtarla):**
  - *Kaynak modu:* `sourceKey + seriesKey + bucketStartUtc(UTC anı) + bucketInterval`.
  - *Dönem modu:* iki dönemin kovaları aynı UTC anına sahip olamayacağından anahtar, kovanın **kendi dönem başlangıcına göre yerel duvar saati (source zone) farkıdır** (`relativeOffsetMs`) — zamana dayalı, dizi indeksi/kayıt sırası **değil**; DST değişiminde yerel saatler hizalı kalır (25 saatlik günde 06:00 yerel ↔ normal günde 06:00 yerel), sessiz kayma yok. Anı olmayan (çözümsüz DST) okuma yalnızca kendi yerel saatiyle eşleşir. Bir yanda aynı anahtara düşen iki kova **DUPLICATE** olarak görünür kalır (birleştirilmez/toplanmaz).
  - Yasak yöntemlerin hiçbiri yok: indeks/sıra/"ilk-ikinci satır", sessiz zaman kaydırma, örtük tolerans, eksik kovayı 0'lama (statik testle de sabit).
- **Seri eşleştirme:** aynı `seriesKey` (dönem modunda aynı kaynak) **veya** çağrıdaki açık `seriesMapping`; sıra/ad benzerliği (`Turbin1`↔`Turbin_1`, `Kolon1`↔`kolon1`) **eşleştirmez**. Hiç eşleşme yoksa veya mapping bozuksa (bilinmeyen seri, bir serinin iki kez eşlenmesi) `SERIES_MAPPING_REQUIRED`. Eşleşmeyen seriler **sessizce yok sayılmaz**: `unmatchedSeries[]` + kovaları `SERIES_UNMAPPED` satırı olarak görünür (değerleri karşılaştırılmaz).
- **Matematik:** `absoluteDelta = comparison − baseline`; `percentageDelta = (comparison − baseline) / |baseline| × 100`, **baseline 0 ise `null`** (gerçek 0 geçerli değerdir); tolerans/yakınlık eşiği yok (1e-7 fark fark olarak kalır). NaN/∞/taşma **fail-closed**: satır `COMPARISON_INVALID` + `reason=NUMERIC_OVERFLOW`, sayı yok. **Tek yuvarlama noktası:** `options.decimals` (0–12, yarıdan uzağa; yoksa yuvarlama yok — yuvarlama sunumdur), tüm seri/kaynaklara aynı.
- **Satır durumları:** `COMPARABLE, BASELINE_MISSING, COMPARISON_MISSING, BOTH_MISSING, BASELINE_INVALID, COMPARISON_INVALID, DST_UNRESOLVED, COUNTER_RESET_UNRESOLVED, SERIES_UNMAPPED, BUCKET_UNMATCHED, PERIOD_INCOMPATIBLE`. Sabit öncelik: `DST_UNRESOLVED → COUNTER_RESET_UNRESOLVED → BASELINE_INVALID → COMPARISON_INVALID → BOTH_MISSING → BASELINE_MISSING → COMPARISON_MISSING → COMPARABLE`. **Eksik değer** (kova var, değer yok) ile **kova yok** (`BUCKET_UNMATCHED`) ayrıdır; ikisi de fark üretmez ve 0 sayılmaz. `analysisAllowed=false`/bloklu seri → satır karşılaştırılabilir değil (`*_INVALID`, `reason=SERIES_ANALYSIS_BLOCKED`). Her satırda **iki taraf ayrı** görünür (`baselineSide` / `comparisonSide`: `state`, `flags`, `reason`) — hangi tarafın neden geçersiz olduğu okunur; iki tarafın kalite bayrakları korunur, başlık durum 027.67'nin **merkezi** `mostCritical` sabitinden.
- **Kapılar (statik hata kodları, sessiz dönüşüm yok):** `TENANT_SCOPE_BLOCKED` (istek/dönem/seri kök tenant'ı uyuşmaz **veya** seri `TENANT_SCOPE_BLOCKED` taşır → her şey bloklanır, satır/etiket/kaynak adı hiçbir çıktıya sızmaz; **ilk** denetlenir), `PERIOD_RANGE_INVALID`, `BUCKET_INTERVAL_MISMATCH`, `TIMEZONE_MISMATCH` (farklı/geçersiz IANA/offset), `SERIES_MAPPING_REQUIRED`, `SOURCE_MAPPING_REQUIRED` (açık `sourceMapping` yok/uyuşmuyor, iki taraf aynı kaynak, bir seri beyan edilmeyen kaynaktan), `PERIOD_INCOMPATIBLE` (bozuk yapı/etiket/`decimals`). PLATFORM_ROOT/unresolved/pasif/MOSEDAŞ eşlemeli seriler 027.68'de zaten `TENANT_SCOPE_BLOCKED` taşır; burada aynı kod tüm karşılaştırmayı bloklar.
- **Özet:** toplam/karşılaştırılabilir satır, baseline eksik, comparison eksik, invalid, **unresolved** (DST+sayaç devri), eşleşmeyen kova, eşleşmeyen seri, `totalAbsoluteDelta`, `averageAbsoluteDelta`, `maxSignedDelta`, `largestMagnitudeDelta`, `maxPercentageDelta`, sonuç kalite durumu, `comparability` (`COMPARABLE | PARTIALLY_COMPARABLE | NO_COMPARABLE_DATA`). Karşılaştırılabilir satır yoksa **tüm sayısal özetler `null`** (asla 0) ve `NO_COMPARABLE_DATA`. Sayısal özetler yalnızca `COMPARABLE` satırlar üzerindendir.
- **Sıralama:** satırlar seri (anahtar, kaynak), karşı seri, sonra kova anahtarı (offset/UTC) ile deterministik; girdi kayıt/seri sırasından bağımsız, aynı girdide bayt-eşdeğer çıktı.

## Grafik tüketim sözleşmesi — TASK-027.73 bunu nasıl tüketir
`toComparisonChart(result)` `ComparisonChartData` üretir: `{ status, code, mode, bucketInterval, comparability, rows[], unmatchedSeries[], summary }`; her satır: `t` (baseline kova zamanı) + `comparisonT`, `seriesLabel`/`comparisonSeriesLabel`, `sourceLabel`/`comparisonSourceLabel`, `baseline`/`comparison`, `absoluteDelta`, `percentageDelta`, `quality`, `status`, `reasonCode` + taraf bazlı `baselineReason`/`comparisonReason` (statik). Ekran: (1) `status/code` `BLOCKED` ise grafik yerine yalnızca blokaj kodunu gösterir; (2) iki değeri yan yana/çakışık çizer, `null` değerler **boşluk**tur (0 değil); (3) `status !== COMPARABLE` satırlarda fark göstermez, `reasonCode`'a göre "eksik / geçersiz / DST çözümsüz / sayaç devri çözümsüz / eşleşmeyen" rozeti koyar; (4) `unmatchedSeries[]` ve `comparability` ile "kısmi karşılaştırma" uyarısı verir; (5) sayı/yüzde/tarih **biçimlendirmesini** (`tr-TR`, saat dilimi) ve ölçek/renk/etiket görünürlüğünü kendisi yapar (027.68'den devredilen ölçek + renk 027.73'te). Kaynak etiketi kaynak modunda `leftSource/rightSource.label`, dönem modunda isteğe bağlı `sourceLabels` (yoksa boş) kaynaklıdır.

## TASK-027.70 (sanal kolonlar) için bağımlılık notu
Sanal kolon çıktısı **aynı `ScadaSeriesOutput`** (027.68) biçiminde üretilirse bu motor onu **hiçbir değişiklik olmadan** karşılaştırır: seri kimliği `(sourceCatalogId, seriesKey)`; sanal bir seri için açık bir `seriesKey` ve `sourceCatalogId` (ya da açıkça beyan edilmiş sanal kaynak kimliği) gerekir, aksi halde eşleştirilemez (`SERIES_MAPPING_REQUIRED`). Sanal seri değerleri de 027.68 kova sınıflamasına (VALID/MISSING/INVALID/INCOMPLETE) uymalıdır; formülle üretilmiş **eksik/çözümsüz** girdi sonuçta 0'a dönüşmemeli (aksi halde karşılaştırma yanlış `COMPARABLE` üretir). Sanal kolon tanımı/formül yönetimi bu task'ta yoktur.

## Testler / mutasyon
- `comparison/__tests__/scada-comparison.spec.ts` (+ statik spec): istenen tüm senaryolar — aynı dönemde/dönemler arası kova eşleşmesi, kayıt ve seri sırasından bağımsızlık, açık seri mapping / mapping yok ⇒ blokaj, satır sırasına göre eşleşmemesi, eksik kovalar (baseline/comparison/both/absent), gerçek 0, baseline 0 ⇒ yüzde `null`, negatifler, NaN/taşma reddi, DST ve sayaç devri çözümsüz, tenant ve kaynak izolasyonu, interval/timezone/aralık uyumsuzluğu, hepsi geçersizken `NO_COMPARABLE_DATA`, girdi mutasyonu yok, determinizm, sızıntı yok, grafik sözleşmesi; ayrıca yerel-saat hizası (Berlin), DUPLICATE, yuvarlama tek noktası ve 027.68 servisiyle zincir. `reporting` altında **862 test yeşil**.
- **Gerçek mutasyonlar (uygulanıp yakalandı, geri alındı):** dizi indeksiyle eşleştirme, eksik kovayı 0 kabul, baseline 0 için yüzde, gizli tolerans, tenant kapısı (dönem ve kaynak), seri mapping kontrolü, DST çözümsüz ve sayaç devri çözümsüz satırı karşılaştırılabilir sayma, null'ı geçerli sayı sayma, interval, timezone ve kaynak mapping kontrolleri, satır/kova sıralaması (iki katman birlikte), çıktıya SQL/driver bilgisi koyma, yerel-saat hizasının UTC offsete çevrilmesi. Not: kova/satır sıralaması **iki katmanlı** (kova anahtarı sıralaması + son satır sıralaması); tek katman kaldırılınca denk mutant, ikisi birlikte kaldırılınca yakalandı.

## Kapsam dışı / yapılmayanlar
HTTP endpoint, controller/Nest kaydı, PostgreSQL, gerçek SQL Server/preflight, migration/seed, web ekranı, ölçek/renk, export, sanal kolon, preset yönetimi, Docker/smoke, yeni permission/tenant. `veriler/raw/` dokunulmadı. Git commit/push yok.

## Açık noktalar (uydurulmadı)
1. **Dönem modu anahtarı:** spesifikasyondaki `seriesKey + bucketStartUtc + bucketInterval` anahtarı iki **farklı** dönem için literal uygulanamaz (UTC anları farklı); dönem başına **yerel duvar-saati offset**i (yukarıda) normalizasyon olarak tanımlandı — AI1 onayına açık (Q-W531).
2. **"Mutlak fark" adlandırması:** `absoluteDelta` işaretlidir (comparison − baseline). Özet alanları buna göre: `totalAbsoluteDelta` = işaretli net toplam, `averageAbsoluteDelta` = işaretli ortalama, `maxSignedDelta` = en büyük (en pozitif) fark; **büyüklüğe göre** en yüksek fark ayrı `largestMagnitudeDelta` (işareti korur). "En yüksek mutlak fark" büyüklük anlamındaysa AI1 belirler (Q-W531).
3. **Bloklu/eşleşmeyen seri satırları:** `analysisAllowed=false` taraf `*_INVALID` (+`reason`) olarak; `SERIES_UNMAPPED` satırlarında değer gösterilmez. Blokaj sonucunda özet kalite durumu `MISSING_VALUE` (veri yok) olarak raporlanır.
4. Dönem uzunlukları farklıysa (31 gün ↔ 28 gün) fazla kovalar `BUCKET_UNMATCHED` görünür; sessiz kırpma/uzatma yoktur.

## 2026-09-24 — AI1 Kararları (Q-W531) ve küçük düzeltme (append-only)
1. **Dönem hizalama — onaylandı:** `seriesKey` + dönem başlangıcına göre **yerel duvar saati farkı** + `bucketInterval`; dizi indeksine dönüş yapılmayacak.
2. **Mutlak fark:** `absoluteDelta` satır bazında **işaretli** fark (`comparison − baseline`) kalır. Özetlerde "en yüksek mutlak fark" **büyüklüğe göre** hesaplanır; **`largestMagnitudeDelta` kanonik alandır**. `maxAbsoluteDelta` adı yanıltıcı olduğundan **`maxSignedDelta` olarak yeniden adlandırılır** (veya kaldırılır).
- **Yapılan düzeltme:** `ScadaComparisonSummary.maxAbsoluteDelta` → **`maxSignedDelta`** (en büyük işaretli fark; büyüklük değildir); `largestMagnitudeDelta` kanonik "en yüksek mutlak fark" olarak belgelendi (sözleşme yorumları + bu dosya). Değer hesapları değişmedi; testler yeni adla güncellendi (`maxSignedDelta = 5`, `largestMagnitudeDelta = −10` aynı özette ayırt edilir). `totalAbsoluteDelta`/`averageAbsoluteDelta` adları bu kararın kapsamında değildir (işaretli net toplam/ortalama; adlandırmaları AI1 isterse ayrıca değişir). Q-W531 (a)(b) **kapandı**. Durum: `review` (AI1 `done` onayı bekleniyor). Git commit/push yapılmadı.

## 2026-09-24 — AI1 Onayı: `done`
AI1, Q-W531 kararları uygulandıktan sonra TASK-027.69'u onayladı (`review` → `done`). Git commit/push yapılmadı.

## 2026-09-24 — Tüketici referansı (TASK-027.70)
`apps/api/src/reporting/scada/virtual-columns/` (TASK-027.70, `backlog/TASK-027-70-scada-virtual-columns.md`) sanal seriyi `ScadaSeriesOutput` biçiminde üretir; bu karşılaştırma motoru onu değişiklik olmadan tüketir (test: eksik/çözümsüz türetilmiş kova 0 karşılaştırması üretmez). 027.69 kodu değişmedi.
