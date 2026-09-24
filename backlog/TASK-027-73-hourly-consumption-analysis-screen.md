---
id: TASK-027.73
title: Gerçek Hourly Consumption Analiz Ekranı
status: planned
srs_refs: [FR-018, FR-019, FR-020, FR-021, FR-022, FR-023, FR-024, FR-039, FR-040, FR-041, FR-042, FR-043, FR-044, FR-045, FR-046, FR-047, FR-048, FR-049, FR-050, FR-051, FR-052, FR-053, FR-054, FR-055, FR-056, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.73: Gerçek Hourly Consumption Analiz Ekranı

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.73

## Başlık

Gerçek Hourly Consumption Analiz Ekranı

## Durum

planned

## Amaç

BOTC `HourlyConsumptionWindow` davranışını Metnex web arayüzünde, mevcut UI sözleşmesi ve TASK-027.54 analiz ekranı üzerine kurarak sunmak: kaynak/tablo/kolon seçimi, çözünürlük/aralık, çoklu seri ve bağımsız ölçek, dönem/kaynak karşılaştırma, istatistik kartları, sanal kolon ve preset yönetimi.

## Ön koşullar

- TASK-027.72 `done`. Mevcut generic ekran (TASK-027.54–.57) **korunur**; bu task yeni ekranı/route’u ekler.
- **UI Contract okuması zorunlu**; semantic token’lar, Türkçe locale, loading/error/empty; yeni sapma üretilmez (TASK-027.61’deki `bg-[#f8fafc]`/`dark:` sapması bilinen bulgudur).
- **Kapanan karar kapıları:** Q-W510, Q-W512, Q-W506, Q-W513, Q-W509.
- **Kalan (ready olmadan önce):** Q-W518 (**tenant saat dilimi kaynağı** — `tenants` şemasında alan yok), Q-W517 (paylaşım UI’ı yetkisi), route/menü adı ve yoğunluk kararı (AI1).

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W510 C:** otomatik ölçek varsayılan; kullanıcı ölçeği izinli sınırlarda; geçersiz değer reddedilir; “otomatiğe dön” açık işlem; ölçek yalnızca görsel; preset’te saklanır.
- **Q-W512 C:** ekranda **tenant saat diliminde** gösterim (veri UTC). **Q-W506 C:** PRIVATE/TENANT_SHARED preset arayüzü.
- **Q-W513 C:** grafik ve tablo aynı normalize sonucu tüketir; kalite durumları görünür.

## Kapsam

- Ekran yapısı (CRUD/dashboard standardına uygun; yoğunluk kararı teslimde açık): filtre paneli (kaynak, tablo, tarih/saat kolonları katalogdan, çözünürlük, aralık), kolon satırları (değer tipi, özel maksimum), sanal kolon ve preset yönetimi, sonuç tablosu, istatistik kartları, grafik.
- Grafik: seri başına bağımsız Y-scale (sunucu ölçek önerisiyle); kullanıcı özel min/max’ı yalnızca izinli sınırlarda, geçersiz değer reddedilir ve gösterilir; “otomatiğe dön” **açık düğme**; veri etiketi aç/kapa, tooltip; overlay ve ayrı-grafik dönem karşılaştırması, ikinci kaynak serileri (kesikli/işaretli — renk tek başına anlam taşımaz); **eşleşmeyen kovalar ve eksik veri açıkça gösterilir (0 çizilmez)**.
- Sunum (tam ekran) görünümü — FR-046; ekran içi, yeni pencere/modal içinde modal yok.
- Kalite durumları (devir düzeltildi, tanımsız negatif, eksik, eşleşmeyen kova, sonraki okuma yok) görünür; sessiz düzeltme UI’da da gizlenmez. Zaman etiketleri **tenant saat diliminde** biçimlenir (`tr-TR`).
- Tüm veri erişimi TASK-027.72 API’si üzerinden; **tarayıcı asla şema/tablo keşfi yapmaz, SQL/connection string görmez**.
- Menü/route görünürlüğü ile API yetkisi ayrı (`nav-config`, permission tabanlı; JWT rol kısayolu yok).
- Preset yönetimi: `PRIVATE`/`TENANT_SHARED` ayrımı, sürüm/çakışma bildirimi (sessiz üzerine yazma yok), paylaşım eylemi yetkiye göre görünür.

## Kapsam dışı

- Export/Jasper (TASK-027.74), E2E kabul (027.59).
- WPF davranışlarının birebir kopyası (pencere yönetimi, `MessageBox`, el yazısı zaman metni).
- Ekip/tenant ortak preset arayüzü (TBD-W5-006).
- Yeni UI framework/tema sistemi.

## Bağımlılıklar

TASK-027.72. Sonraki: TASK-027.74.

Zincir: `TASK-027.72` → **TASK-027.73** → `TASK-027.74`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/web/src/app/(app)/app/reports/... veya yeni route (**olası**; route adı AI1 kararı) + bileşenler
- apps/web/src/lib/nav-config.ts (+ nav-config.spec.ts)
- apps/web/src/lib/api.ts tüketicileri (yeni API istemcisi fonksiyonları)
- docs/ui-contract/* (yeni kalıp gerekirse) ve deviation-log (yalnızca sapma olursa)

## API/UI/veri sözleşmesi

- **UI:** yukarıdaki bileşenler; sayılar `tr-TR`, `tabular-nums`; dinamik seçimler dropdown politikasına uyar (`q`/sayfalama, debounce, race koruması) — kaynak/kolon listeleri küçük ve katalogdan geldiği için politika istisnası gerekirse `// DROPDOWN-POLICY-EXCEPTION:` gerekçesiyle.
- **API:** TASK-027.72; UI yeni endpoint uydurmaz.

## Tenant ve permission kuralları

- Tenant değişiminde tüm ekran durumu (seçimler, sonuçlar, presetler) sıfırlanır/yeniden yüklenir; eski tenant verisi görünmez.
- Butonlar/menüler izin görünürlüğü sözleşmesine uyar; **UI güvenlik sınırı değildir**, 403/404 güvenle gösterilir.

## Audit ve güvenlik kuralları

- UI doğrudan audit yazmaz; tarayıcıya audit/secret/credential gönderilmez. Kaynak/kolon adları URL/console/analytics’e yazılmaz.

## Test senaryoları

1. Vitest: kaynak→kolon zinciri, en az iki kolon (AC-007), çözünürlük/aralık doğrulaması, boş/hata/yükleniyor durumları, tenant değişiminde sıfırlama.
2. Çoklu seri: bağımsız ölçek verisi grafiğe yansır (AC-013), özel maksimum (AC-014), etiket aç/kapa (AC-015), overlay vs ayrı (AC-016/017), ikinci kaynak (AC-018).
3. Sanal kolon ve preset akışları (kaydet/yükle/sil), yetkisiz kaynak → güvenli mesaj.
4. Erişilebilirlik: etiketli alanlar, renk dışı ayrım, klavye; `prefers-reduced-motion`.
5. Statik: web’de SQL/connection string/schema keşfi/`localStorage` ile iş verisi yok; ham hata mesajı gösterilmez.
6. Tarayıcı/E2E doğrulaması yapılamadıysa açıkça raporlanır.
7. Özel ölçek: geçersiz/aşırı değer reddi ve mesajı; otomatiğe dönüş; ölçek değişimi veriyi değiştirmez.
8. Zaman gösterimi: UTC veri tenant saat diliminde (DST günü dahil); eşleşmeyen kova/eksik veri 0 olarak çizilmez.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Tenant değişiminde sıfırlama kaldırılınca ilgili test kırılır.
2. Seri-başı ölçek kullanımı ortak ölçeğe çevrilince AC-013 testi kırılır.
3. Hata mesajı maskeleme kaldırılınca sızıntı testi kırılır.
4. İzin görünürlüğü kaldırılınca menü testi kırılır.
5. Eksik veri 0 çizilirse ilgili test kırılır; ölçek doğrulaması kaldırılırsa reddedilme testi kırılır.

## Kabul kriterleri

- BOTC ekranındaki tüm işlevsel yetenekler (SRS FEAT-009…015) web’de karşılanmıştır; taşınmayanlar gerekçelidir.
- UI Contract’a uyum (yoğunluk, token, locale, durumlar); yeni sapma yok veya kayıtlı.
- Web vitest ve `tsc` geçer; `check.sh --skip-docker` geçer; tarayıcı doğrulaması durumu açıkça raporlanır.

## Rollback yaklaşımı

Yeni route/menü girişi kaldırılarak ekran kapatılır; generic reporting ekranı ve API bozulmaz. Backend/migration değişikliği bu task’ta yok.

## Sonraki task

TASK-027.74

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Hayır (API mock’lanır). Tarayıcı doğrulaması kullanıcının kendi ortamında; Docker/SQL Server yok. Kullanıcının dev sunucusu yönetilmez.

## AI1/PO kararı gerektiren açık sorular

- **Q-W518** — Tenant saat dilimi kaynağı (`tenants` şemasında alan yok)
- **Q-W517** — `TENANT_SHARED` preset paylaşma/yönetme yetkisi hangi mevcut izinle sınırlanacak
- Route/menü adı ve konumu (AI1)
- Yoğunluk kararı (CRUD/dashboard)
- Generic ekranın akıbeti

## BOTC referansı

- **Referans davranış:** `HourlyConsumptionWindow.xaml` + `.xaml.cs` (DynamicColumns, CompareDynamicColumns, SeriesStats, overlay/ayrı grafik, tam ekran, etiket düğmesi).
- **Taşıma sınırı:** Taşınmaz: WPF/LiveCharts, `MessageBox` akışı, elle zaman metni (`txtStartTime`), 100 ms bekleme döngüleri, UI’da hesap (rollover/sanal kolon/stat), yerel dosya (preset/sanal kolon).

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Veri kaynağı notu (TASK-027.68)
Grafik ekranı çoklu-seri verisini `toChartConsumption()` çıktısından (`ScadaChartConsumption`) tüketir: genel `status/code` bandı, seri başına `title/unit/points[{t,value,quality,missing,suspect}]/statistics/qualitySummary/analysisAllowed/codes`, `range` filtre bilgisi, `excluded[]` (kısmi sonuç). `missing` boşluk olarak çizilir (0 değil), `suspect` işaretlenir, `t=null` okumalar eksende yer almaz. Biçimlendirme (`tr-TR`, saat dilimi), ölçek, renk ve etiket görünürlüğü UI'ındır. Ayrıntı: `backlog/TASK-027-68-scada-multi-series-statistics.md`.

## 2026-09-24 — Devredilen kapsam (TASK-027.68 onayı, Q-W530)
AI1 kararı: **ölçekleme** (Q-W510) ve **renk ataması** bu task'ta ele alınır; **özel ölçek sınırlarının kaynağı** 027.73 başlamadan önce UI sözleşmesinde netleştirilir. İstatistik tarafında sıfır politikası 027.68'de uygulandı (gerçek 0 her istatistiğe dahil).

## 2026-09-24 — Karşılaştırma verisi (TASK-027.69)
Karşılaştırma görünümü `toComparisonChart()` çıktısını (`ComparisonChartData`) tüketir: `status/code` blokajı, satır bazlı `baseline/comparison/absoluteDelta/percentageDelta/quality/status/reasonCode`, `unmatchedSeries`, `comparability`, `summary`. `null` = boşluk (0 değil); `status !== COMPARABLE` satırda fark gösterilmez, statik `reasonCode` rozeti gösterilir. Biçimlendirme/ölçek/renk UI'ındır. Ayrıntı: `backlog/TASK-027-69-scada-period-source-comparison.md`.

## 2026-09-24 — Sanal seriler (TASK-027.70)
Sanal seriler gerçek serilerle aynı grafik sözleşmesini kullanır (`ScadaSeriesOutput` → `toChartConsumption`); ekran `virtual.sourceSeriesKeys` ile türetilmiş olduğunu belirtebilir. `failures[].code` statik kodlarını güvenli metinle gösterir; ifade metni hiçbir çıktıda yoktur. `analysisAllowed=false` bucket/seri değer/istatistik göstermez, `null` boşluktur (0 değil). Ayrıntı: `backlog/TASK-027-70-scada-virtual-columns.md`.


## 2026-09-24 — Preset tüketimi (TASK-027.71)
Ekran serbest bileşen/HTML/CSS/JS almaz: `display.chartType` yalnızca `LINE|BAR|AREA|TABLE`, tablo için `tableOptions` (sıralama/sayfalama). Görünürlük: PRIVATE yalnız sahip, TENANT_SHARED aynı kök; ekran başka kök preset'ini/ayrıntısını hiç görmez. `PRESET_*` hata kodları statik metne eşlenir; sanal kolon sürüm belirsizliği kullanıcıya sürüm sabitleme olarak sunulabilir.

## 2026-09-24 — Endpoint ve response sözleşmesi (TASK-027.72)
Ekran yalnızca şu uçları tüketir (hepsi `REPORT:ARTIFACT:VIEW`, `X-Tenant-Id` başlığı zorunlu): `POST /reports/:code/analysis/query`, `POST /reports/:code/analysis/compare`, `GET /reports/:code/analysis/presets`, `GET /reports/:code/analysis/presets/:presetId`.
- **Hata gövdesi** `{statusCode, code, message}` (`message = code`): 503 `SCADA_SOURCE_NOT_CONFIGURED` ⇒ "kaynak yapılandırılmadı" durumu (grafik/tablo yok, sentetik veri yok); 503 `SCADA_LIMITS_NOT_CONFIGURED`; 404 `SCADA_NOT_FOUND` bilinmeyen/erişilemeyen; 409 alan reddi kodları ve 400 doğrulama kodları statik metne eşlenir.
- **Analiz isteği:** `{sourceCatalogIds[], seriesKeys[], startAt, endAt (mutlak ISO, Z/offset zorunlu), bucketInterval HOURLY|DAILY, timezone (IANA), virtualColumnIds?[], statistics?[], mode? EXPLICIT|ROOT_AGGREGATION}` **veya** `{presetId, presetVersion?}` (preset ile birlikte başka alan gönderilemez). Serbest alan yoktur.
- **Analiz yanıtı:** `{artifactCode, status OK|PARTIAL|BLOCKED, code, interval, timezone, range, preset|null, series[], excluded[], sources[], virtualColumnFailures[], pointFilter}`; `series[]`: `seriesKey, sourceCatalogId, label, unit, valueType, analysisAllowed, status, codes[], points[{t|null, localWallTime, value|null, quality, qualityFlags[], isComplete, classification}], statistics{status + seçili alanlar}, qualitySummary, virtual{virtualColumnId, versions, sourceSeriesKeys}|null`. `value:null` boşluktur (0 değildir); `t:null` çözümsüz DST okumasıdır.
- **Karşılaştırma isteği:** PERIOD `{mode, sourceCatalogIds[], seriesKeys[], baseline{startAt,endAt}, comparison{startAt,endAt}, seriesMapping?[], bucketInterval, timezone, statistics?, decimals?}`; SOURCE `{mode, leftSourceCatalogId, rightSourceCatalogId, seriesKeys[], period{startAt,endAt}, seriesMapping[] (zorunlu), bucketInterval, timezone, …}`; ya da `{presetId}`. **Yanıt:** 027.69 `ComparisonChartData` + `artifactCode, timezone, preset, sources`; karşılaştırılamayan satırlar `status`/`reasonCode` ile listelenir, gizlenmez.
- **Preset:** liste `{presets[]}` (`isOwner`, ifade yok), tekil `{preset, versions[], resolution: RESOLVED{plan}|NOT_RESOLVED{code}}`.

## 2026-09-24 — Gerçek API veri akışı (TASK-027.72-R1)
Ekranın gördüğü veri şu zincirin ürünüdür: **027.65 sorgu → 027.67 kalite/roll-over → 027.66 saatlik/günlük aggregation → 027.68 multi-series/istatistik → (027.70 sanal kolon, 027.69 karşılaştırma) → whitelist projeksiyon**.
- **Üretimde** gerçek provider kayıtlı olmadığı sürece uçlar `503 SCADA_SOURCE_NOT_CONFIGURED` döner ⇒ ekran "kaynak yapılandırılmadı" durumunu göstermeli (grafik/tablo yok).
- **Geliştirmede** `NODE_ENV=development`, `REPORTING_DEV_FIXTURES=true` ve `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=<IANA>` (ör. Europe/Istanbul) ile `veriler/raw/` snapshot'ı görünür; dilim değişkeni yoksa `409 SCADA_TIMEZONE_MISMATCH`. Fixture artifact kodu: `DEV_REPORTING_FIXTURE`. Fixture kaynak kimlikleri `GET …/analysis/presets` ile değil, sunucunun opak katalog UUID'leriyle bilinir (ekran için kaynak listesi ucu henüz yok — açık nokta).
- **Yanıt durumları:** `status: OK | PARTIAL | BLOCKED`. Hiçbir seri `OK` değilse (boş kaynak, hepsi bloklu) `BLOCKED` + `code: NO_VALID_DATA`; ekran bunu başarı gibi çizmemeli. `points[].t === null` çözümsüz DST/GAP okumasıdır (listelenir, çizilmez/istatistiğe girmez); `value: null` boşluktur; günlük toplamda eksik/bloklu üye varsa gün değeri `null`'dır (kısmi toplam gösterilmez). DAILY için INDEX = SUM; REAL_VALUE için katalog politikası yoksa istek 409 `SCADA_AGGREGATION_POLICY_REQUIRED` ile reddedilir.

## R1 referansı (2026-09-24)
Discovery uç noktası ve seçim akışı `TASK-027.73-R1` ile teslim edildi (`review`).
