---
id: TASK-027.68
title: SCADA Multi-Series ve İstatistik Engine
status: done
srs_refs: [FR-024, FR-039, FR-040, FR-041, FR-042, FR-043, FR-044, FR-045, AC-007, AC-013]
parent_epic: EPIC-004
related: [TASK-027.65, TASK-027.66, TASK-027.67]
updated_at: 2026-09-24
---

# TASK-027.68: SCADA Multi-Series ve İstatistik Engine

> Planlama dosyası: `backlog/TASK-027-68-multi-series-statistics.md` (TASK-027.62 çıktısı). Bu dosya AI1'in `ready` spesifikasyonuna göre **teslim kaydıdır**; ID aynıdır.

## Durum
review

## Amaç
TASK-027.65 (sorgu), 027.66 (aggregation) ve 027.67 (kalite/sayaç devri) çıktılarından deterministik, tenant-izole ve grafik ekranının (TASK-027.73) doğrudan tüketebileceği çoklu seri istatistik sonuçları üretmek. **Saf modül** (`apps/api/src/reporting/scada/series/`): I/O, audit, log, DB, Docker yok; hiçbir Nest modülüne kayıtlı değil.

## Teslim edilen
- **Sözleşmeler** (`scada-series.contract.ts`): `ScadaSeriesInput` (seriesKey, label, unit, valueType, buckets, analysisAllowed, sourceCatalogId, **customerRootTenantId zorunlu**, eşlenen `tenant` + `mappingResolved`), `ScadaSeriesOutput`, `ScadaMultiSeriesResult`, `ScadaStatisticResult`, `ScadaQualitySummary`, grafik tüketim tipleri. Çıktıda SQL, tablo/schema/fiziksel DB adı, bağlantı/sürücü bilgisi, credential ve sınırsız kullanıcı metni **yok** (label ≤128, unit ≤32, yazdırılabilir; aksi seri `INVALID_STATISTICS_INPUT`).
- **Servis** (`scada-multi-series.service.ts`): `ScadaMultiSeriesService.build({ scope, range, interval, series })` ve `toChartConsumption(result)`.
- **İstatistikler** (`series-statistics.ts`): `SUM / AVERAGE / MIN / MAX / COUNT / VALID_COUNT / MISSING_COUNT / INVALID_COUNT / INCOMPLETE_COUNT`. Yalnızca **VALID** kovalar toplanır; gerçek 0 değerdir, `null` 0 değildir; geçersiz/çözümsüz/eksik/eksik-tamamlanmamış kovalar dahil edilmez ama sayılır; geçerli veri yoksa tüm değerler `null` + `NO_VALID_DATA` (asla `SUM: 0`); taşma → `null` + `INVALID_STATISTICS_INPUT`. Kova sınıfı **dışlayıcıdır** (VALID+MISSING+INVALID+INCOMPLETE = COUNT): `INVALID` (geçersiz sayı) → `INCOMPLETE` (çözümsüz sayaç devri, DST, duplicate, sonraki okuma yok, INCOMPLETE_BUCKET, TIMEZONE_UNVERIFIED veya `isComplete=false`; değer varsa bile kullanılmaz) → `MISSING` → `VALID`. Çözülmüş devir (`COUNTER_RESET_RESOLVED`) normal geçerli değerdir (027.67 merkezi güvenli küme).
- **Kalite özeti** (`series-quality.ts`): toplam/geçerli/eksik/geçersiz kova, çözümsüz sayaç devri, `DST_AMBIGUOUS`, `DST_NONEXISTENT`, `INCOMPLETE_BUCKET` sayıları (bayrak başına; bir kova birden çok bayrak taşıyabilir), `analysisAllowed`, **en yüksek önem** — sıralama **027.67'nin merkezi `mostCritical/QUALITY_SEVERITY`** sabitinden (yeni sıra icat edilmedi; statik testle sabit).
- **Sıralama:** seriler `seriesKey` (sonra `sourceCatalogId`), kovalar `bucketStartUtc` kronolojik, eşitlikte `recordId`; anı olmayan (çözümsüz DST) okumalar sona. Girdi sırasından bağımsız, aynı girdide bayt-eşdeğer çıktı.
- **Tenant/kaynak güvenliği:** başka `customerRootTenantId`'li veya çözümlenmiş `dataScopeTenantIds` dışındaki tenant'ın serisi **hiçbir çıktıya girmez** (ad dahil); yalnızca kendi kapsamındaki ama eşlemesi `UNRESOLVED`/pasif tenant/`PLATFORM_ROOT`/MOSEDAŞ (ortak `assertMappableTenant` korumasıyla) olan seri `TENANT_SCOPE_BLOCKED` ile **veri içermeden** bloklanır; kapsamda hiç seri kalmazsa sonuç `TENANT_SCOPE_BLOCKED`. Kimlik = (kaynak, seriKey): aynı `seriesKey`'li iki kaynak karışmaz. Tenant bilgisi girdiden genişletilmez; kapsam `TenantScopeService.resolve()` çıktısıdır.
- **Blokaj/hata modeli (statik kodlar):** `NO_VALID_DATA`, `SERIES_ANALYSIS_BLOCKED`, `TENANT_SCOPE_BLOCKED`, `DST_UNRESOLVED`, `COUNTER_RESET_UNRESOLVED`, `INVALID_STATISTICS_INPUT`, `INCOMPLETE_BUCKET`, `MULTI_SERIES_PARTIAL_RESULT`. `analysisAllowed=false` (ya da kovalarda `TIMEZONE_UNVERIFIED`) seriyi **açıkça BLOCKED** işaretler: istatistik değerleri `null`, sayımlar kalır, veri görünür. Bir seri bloklu ⇒ sonuç `PARTIAL` + `MULTI_SERIES_PARTIAL_RESULT` ve dışlananlar `excluded[]`'te; **tüm seriler bloklu ⇒ `BLOCKED` + `SERIES_ANALYSIS_BLOCKED`**; bozuk bir seri yalnızca kendisini dışlar (izolasyon).
- **Kova hizalama** (`series-rollup.ts`): `rollUpToDaily(hourly, zone, operation, seriesKey)` — saatlik kovaları kaynak saat diliminin **yerel gününe** göre gruplar (DST günü 23/25 saat, yerel gün korunur), günlük `bucketStartUtc` saatlik ile aynı sözleşme (yerel gün başının UTC anı); işlem (`SUM/AVERAGE/MIN/MAX`) açık parametredir (katalog politikası); değer yalnızca geçerli saatlerden, eksik/çözümsüz saat günü `INCOMPLETE_BUCKET` yapar (bayraklar yukarı taşınır); **eksik saat 0 ile doldurulmaz**; tampon satırları üyeliğe girmez; gece yarısı kendisi belirsiz/var olmayan ise günün anı `null` + DST bayrağı. Aralık **`[startAt, endAt)`** (başlangıç dahil, bitiş hariç); aralık dışı kovalar dışarıda tutulur ve `outOfRangeBuckets`'ta sayılır; **tampon satırları çıktıya, sayımlara ve istatistiklere girmez**.
- **Adaptörler** (`series-adapters.ts`): `bucketsFromQualityRows` (027.67 çıktısı), `bucketsFromAggregation` (027.66; `OK`→`VALID`), `analysisAllowedForSeries` — **seri bazlı** izin: saat dilimi doğrulanmış **ve** serinin kendisinde çözümsüz DST yok; aynı kaynaktaki başka serinin DST sorunu bu seriyi bloklamaz (027.67'nin kaynak düzeyi bayrağının seri düzeyi inceltmesi).

## Grafik tüketim sözleşmesi — TASK-027.73 bunu nasıl tüketir (kısa)
`toChartConsumption(result)` çıktısı ekranın **tek girdisidir**: `{ status, code, interval, range, series[], excluded[] }`. Her `series`: `title` + `unit`, `points[{ t, value, quality, missing, suspect }]`, `statistics`, `qualitySummary`, `analysisAllowed`, `status`, `codes`. Ekran (1) `status/code`'a göre genel durum bandını gösterir (`PARTIAL` → `excluded` listesindeki serileri güvenli kodla belirtir; `BLOCKED` → grafik yerine blokaj kodu), (2) `missing=true` noktaları **boşluk** olarak çizer (0 değil, enterpolasyon yok), (3) `suspect=true` noktaları işaretler (değer var ama istatistik dışı), `t=null` noktalar zaman ekseninde yer almaz ve ayrı bir "zamanı belirsiz okuma" bildirimi olarak gösterilir, (4) `analysisAllowed=false` seride değer/istatistik göstermez (blokaj kodu), (5) sayı/tarih **biçimlendirmesini** (`tr-TR`, saat dilimi) kendisi yapar, (6) `range`'i filtre bilgisi olarak gösterir. Ölçek/renk/etiket görünürlüğü UI'ındır; bu çıktı hiçbir hesap için UI'a güvenmez.

## Testler / mutasyon
- `series/__tests__/scada-multi-series.spec.ts` (+ statik spec): istenen tüm senaryolar (deterministik birleşme, seri/kova sıralaması, tenant ve kaynak izolasyonu, seri hatası izolasyonu, gerçek 0 vs null, eksik≠0, tamamı geçersiz seri, SUM/AVG/MIN/MAX, sayımlar, DST ve sayaç devri etkisi, eksik kova 0'lanmaz, tampon dışlama, `analysisAllowed=false`, kısmi/tüm-bloklu sonuç, girdi mutasyonu yok, sızıntı yok, grafik sözleşmesi kararlılığı, birebir aynı çıktı) + 027.67 kalite servisiyle zincir. `reporting` altında **822 test yeşil**.
- **Gerçek mutasyonlar (uygulanıp yakalandı, geri alındı):** null→0, geçersiz değerin istatistiğe katılması, `analysisAllowed` kontrolünün kaldırılması, kök-tenant / veri-kapsamı / eşleme-tenant filtrelerinin kaldırılması, seri ve kova sıralamasının bozulması, tampon satırlarının dahil edilmesi, `DST_NONEXISTENT` ve `COUNTER_RESET_UNRESOLVED` değerlerinin geçerli sayılması, tüm seriler bloklu iken başarı, girdi dizisinin değiştirilmesi, aralık bitişinin dahil edilmesi, UTC gününe göre günlük gruplama, kendi önem sırası.

## Kapsam dışı / yapılmayanlar
HTTP endpoint, controller/Nest kaydı, PostgreSQL, gerçek SQL Server/preflight, migration/seed, web ekranı, export, yeni permission/tenant/mapping, preset/sanal kolon, karşılaştırma, Docker/smoke. `veriler/raw/` dokunulmadı. Git commit/push yok.

## Açık noktalar (uydurulmadı)
1. **Bu spesifikasyonda olmayanlar bu turda yapılmadı:** planlama dosyasındaki **seri bazlı ölçek önerisi (Q-W510)**, **istatistik başına sıfır politikası (Q-W509 "min yalnızca >0" gibi)** ve **renk ataması** yeni `ready` spesifikasyonunda yer almadığından uygulanmadı (gerçek 0 her istatistiğe dahildir). Ölçek/renk UI'a (027.73) ya da ayrı bir 027.68 ek işine bırakıldı; izinli özel ölçek sınırlarının kaynağı hâlâ karar bekliyor (Q-W530).
2. Etiket/birim sınırları (128/32) çıktı güvenliği için statik değerlerdir (performans eşiği değil); AI1 farklı isterse tek yerde değişir.
3. Sayısal toplama Neumaier-telafili deterministik toplamdır; 027.66'nın 4 hane yuvarlamasını **uygulamaz** (yuvarlama sunumdadır).

## 2026-09-24 — AI1 Onayı: `done`
AI1, TASK-027.68'i onayladı (`review` → `done`). Q-W530 kapsamı 027.68'i bloke etmez: istatistik sıfır politikası (gerçek 0 dahil) doğru uygulanmış; **ölçekleme** ve **renk ataması** TASK-027.73 grafik ekranında; **özel ölçek sınırları** 027.73 öncesi UI sözleşmesinde netleştirilecek. Git commit/push yapılmadı.

## 2026-09-24 — Tüketici referansı (TASK-027.69)
`apps/api/src/reporting/scada/comparison/` (TASK-027.69, `backlog/TASK-027-69-scada-period-source-comparison.md`) bu modülün `ScadaSeriesOutput` çıktısını (kova sınıflaması dahil) dönem ve kaynak karşılaştırması için tüketir; 027.68 kodu değişmedi.
