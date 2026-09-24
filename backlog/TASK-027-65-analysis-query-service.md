---
id: TASK-027.65
title: Analysis Query Service
status: done
srs_refs: [FR-018, FR-019, FR-020, FR-021, FR-022, FR-023, FR-024, FR-028, FR-029, SEC-DATA-001, AC-006, AC-007]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.65: Analysis Query Service

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.65

## Başlık

Analysis Query Service

## Durum

planned

## Amaç

Analiz isteğini (kaynak, kolon listesi, tarih/saat aralığı, çözünürlük, değer tipi) doğrulayıp **katalog + scope** ile birleştiren ve adapter’a aktaran, ham satırları normalize eden servis katmanını yazmak. BOTC `HourlyConsumptionWindow` içindeki sorgu hazırlığını (sınır tamponu, kırpma) sunucu tarafına taşır.

## Ön koşullar

- TASK-027.64 `done`.
- **Kapanan karar kapıları:** Q-SC03, Q-W501, Q-W512, Q-M05, Q-SP02, Q-E04.
- **Kalan (ready olmadan önce):** Q-W521 (sorgu tamponu ve sınır kuralı **değerleri** — BOTC referansı: +2 saat tampon, +30 dk, 59. dakika +1 dk; sözleşmede tanımlanacak, değer AI1 onayıyla).

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-SC03 B:** SCADA için **ayrı analiz veri sözleşmesi**; `ReportDatasetProvider` uyarlayıcısı **yapılmaz**.
- **Q-W501 A:** saatlik Endeks = `LEAD(sonraki) − mevcut`; son okumada sonraki veri yoksa **sentetik delta yok** → sorgu, aralık sonu için gereken “sonraki okuma”yı kapsayacak sınırla çalışır.
- **Q-W512 C:** kaynak saat dilimi katalogda; UTC normalizasyon; tenant saat diliminde gösterim; başlangıç/bitiş sınırları ve sorgu tamponu **sözleşmede tanımlı**; bilinmeyen saat dilimi fail-closed.
- **Q-M05 C:** canlı sorgu; cache yok. **Q-E04:** `apps/api/src/reporting/scada/analysis/`.

## Kapsam

- İstek doğrulama: kaynak katalogda ve scope’ta mı; kolonlar izinli mi; en az bir sayısal kolon (AC-007: birden çok); tarih/saat kolonu katalogdan; aralık limiti; `Saatlik`/`Günlük` dışı çözünürlük reddi.
- Zaman normalizasyonu: kullanıcı aralığı (tenant saat diliminde) → UTC → sorgu penceresi; **sonraki-okuma tamponu** (Q-W501 A: aralık sonunun delta’sı için), başlangıç/bitiş sınır kuralları ve kırpma **sözleşmede yazılı**; değerler Q-W521 onayıyla.
- Adapter çıktısını alan-bağımsız, tipli “ham zaman serisi” modeline çevirme (UTC, seri, ham değer, kalite durumu için yer; henüz aggregation yok). Bu model TASK-027.66–.74’ün paylaştığı **versiyonlu normalize analiz sonucu sözleşmesinin (Q-W513 C) girdi katmanıdır**.
- Her istekte scope çözümleme; kaynak başına okuma (root aggregation için kaynak döngüsü); sonuç birleştirme.
- **Ayrı SCADA analiz sözleşmesi (Q-SC03 B, `apps/api/src/reporting/scada/`):** `ReportDatasetProvider` uyarlayıcısı yok; ortak tenant/audit/export/reporting altyapısı yeniden kullanılır.

## Kapsam dışı

- Endeks farkı/günlük gruplama (TASK-027.66), sayaç devri (027.67), sanal kolon, karşılaştırma, preset, HTTP endpoint, UI, export.
- Serbest SQL, kullanıcı kontrollü identifier, `INFORMATION_SCHEMA` keşfi.

## Bağımlılıklar

TASK-027.64. Sonraki: TASK-027.66.

Zincir: `TASK-027.64` → **TASK-027.65** → `TASK-027.66`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/analysis/* (yeni, **olası**)
- apps/api/src/reporting/dataset/* **değişmez** (Q-SC03 B); ortak tenant/audit/export altyapısı tüketici olarak kullanılır
- apps/api/src/tenant-scope/* (yalnızca tüketici; değişiklik beklenmez)

## API/UI/veri sözleşmesi

- **Veri (öneri):** `AnalysisRequest { sourceKey, columns[{name, valueType}], resolution: HOURLY|DAILY, range{from,to}, filters? }` → `RawTimeSeries { points[{ts, values{col: number|null}}], sourceKey }`.
- **API/UI:** yok (iç servis); HTTP TASK-027.72’de.

## Tenant ve permission kuralları

- Scope her istekte `TenantScopeService`’ten; istek gövdesindeki tenant/`Sirket` alanları yok sayılmaz, **reddedilir**.
- Root aggregation davranışı mevcut kurallardan geniş olamaz (kapsam dışı sahip kaynak reddi).
- Yeni permission yok; çağıran katman mevcut guard’ları uygular (Q-W511).

## Audit ve güvenlik kuralları

- Her analiz isteği için TASK-027.64’ün audit sözleşmesi uygulanır; servis ek alan eklemez.
- İstek/yanıt loglarında satır verisi, SQL, host, schema adı yok.

## Test senaryoları

1. Doğrulama: katalog dışı kaynak/kolon/filtre, çözümsüz sahip, ağaç dışı kaynak, yetersiz kolon sayısı, geçersiz aralık, aşırı aralık → sürücüye gitmeden ret.
2. Zaman penceresi: sınır (59. dakika), sonraki-okuma tamponu, başlangıçtan önceki/bitişten sonraki satırların atılması, tenant→UTC dönüşümü, DST günü, bilinmeyen saat dilimi (fail-closed) — Q-W521 değerleriyle.
3. Tenant A/B izolasyonu, root aggregation, eşzamanlı çağrılarda state sızıntısı yok.
4. Adapter mock’u ile uçtan uca servis akışı; hata sonrası bozulma yok.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Katalog doğrulaması kaldırılınca allowlist testleri kırılır.
2. Scope kontrolü kaldırılınca izolasyon testi kırılır.
3. Zaman penceresi kırpması kaldırılınca aralık-dışı satır testi kırılır.
4. Kolon-sayısı/aralık limiti kaldırılınca ret testleri kırılır.

## Kabul kriterleri

- Geçerli istek katalog+scope’la çözülüp adapter’a ulaşır; geçersiz/yetkisiz istek adapter’a ulaşmaz.
- Zaman penceresi, tampon ve kırpma kuralları sözleşmede yazılı ve testlidir (değerler Q-W521 ile onaylı); saat dilimi/UTC davranışı açıktır.
- Ayrı SCADA analiz sözleşmesi uygulanmıştır; `ReportDatasetProvider` genişletilmemiştir.
- Gerçek DB/SQL Server yok; `check.sh --skip-docker` geçer.

## Rollback yaklaşımı

Ek servis; kaydı kaldırılınca çağıran yok. Migration yok.

## Sonraki task

TASK-027.66

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Hayır (mock adapter).

## AI1/PO kararı gerektiren açık sorular

- **Q-W521** — Sorgu tamponu ve sınır kuralı değerleri (BOTC referansı: +2 saat, +30 dk, 59. dk +1 dk)

## BOTC referansı

- **Referans davranış:** `HourlyConsumptionWindow.btnCalculate_Click` (displayEnd/queryEnd +2h, `Minute==59`), `TrimExtraRows`, “hassas başlangıç filtresi”.
- **Taşıma sınırı:** Taşınmaz: WPF code-behind, UI thread’de `DataTable` işleme, `File.ReadAllText` ile yerel JSON okuma, sunucuya güvenmeyen istemci tarafı kırpma.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-23 — AI1: `ready` + spesifikasyon; teslim (`review`)

AI1 TASK-027.65'i `ready` yaptı (TASK-027.63, 027.63-R1 CSV snapshot provider, 027.64 ve **R1/R2** `done`). Girdi/çıktı sözleşmesi, doğrulama sırası, hata kodları, testler ve mutasyon listesi AI1 spesifikasyonundaki gibidir; **Q-W521 ve Q-W522 uygulama kararı gibi kapatılmadı**.

### Teslim edilen (`apps/api/src/reporting/scada/query/`, hiçbir Nest modülüne kayıtlı değil)
- `scada-analysis-query.contract.ts` — `ScadaAnalysisQuery` (yalnızca `catalogId, table, columns, valueType, dateColumn, timeColumn, startAt, endAt, interval, tenantScope, signal`; başka her alan reddedilir), `ScadaRawRecord` (`occurredAtUtc, recordId, seriesKey, rawValue, valueType, sourceCatalogId, dataQuality, isBufferRow`), `ScadaRawTimeSeriesResult`, `ScadaMultiSourceResult`, `ScadaQueryWindowConfig`, interval↔value type uyumluluk tablosu.
- `scada-query.errors.ts` — 16 statik hata kodu (`message === code`).
- `scada-time-window.service.ts` — kaynak saat dilimi → UTC (Intl tabanlı, deterministik), DST çözümü, kaynak değeri ayrıştırma, pencere/tampon yardımcıları.
- `scada-analysis-query.service.ts` — `run` (tek kaynak) ve `runMany` (root/çok kaynak).
- **Katalog eki (yalnız ekleme):** `CatalogService.evaluateQueryAccess` (tüm katalog reddi nedenleri + okuma-anı tenant yeniden doğrulaması, fiziksel ad/schema **dönmez**, `QueryProfile`). Çekirdek geçişler değişmedi.

### Doğrulama sırası (adapter'dan önce; hiçbir ret driver/adapter çağırmaz)
Şekil → catalog UUID → katalog (`SOURCE_NOT_FOUND` / `SOURCE_BLOCKED` / `SOURCE_NOT_VERIFIED` / `SOURCE_MAPPING_UNRESOLVED` / `TENANT_SCOPE_DENIED` (pasif tenant, MOSEDAŞ) / `SOURCE_TIMEZONE_REQUIRED` / `SOURCE_LIMIT_PROFILE_REQUIRED` / `TABLE_NOT_ALLOWED` / `COLUMN_NOT_ALLOWED`) → tarih/saat kolonu katalogla eşleşme → ≥1 sayısal ölçüm kolonu → `startAt < endAt` → **Q-W521 tampon konfigürasyonu** (`QUERY_WINDOW_CONFIGURATION_REQUIRED`) → pencere (kullanıcı aralığı **+ tampon**) `maxRangeMs` (`TIME_RANGE_LIMIT_EXCEEDED`) → interval/value type → kapsam bütünlüğü (`TENANT_SCOPE_DENIED`) → adapter. Katalog nedenleri kesin öncelik tablosuyla eşlenir; kimliksiz/başka-tenant kaynak `SOURCE_NOT_FOUND` (varlık sızmaz).

### Zaman modeli (Q-W512 C) ve Q-W501
- Kaynak **naif** tarih/saat, katalogdaki IANA saat dilimindedir → UTC'ye çevrilir; naif değer sessizce UTC sayılmaz (zone son ekli string reddedilir; `startAt/endAt` yalnızca `Date`). Bozuk kaynak zaman damgası → `SCADA_ADAPTER_FAILED` (tahmin yok).
- **DST (belgelenmiş, deterministik, geçici işaretler):** iki kez yaşanan saat → **ilk oluşum** + `UNVERIFIED`; var olmayan saat → sıçrama öncesi offset ile kaydırılır + `INVALID`. Nihai veri-kalite politikası TASK-027.67'nindir.
- **Tampon:** `windowConfig().forwardBufferMs` (ms) **zorunlu konfigürasyon**; kodda sabit/varsayılan **yok** (statik testle sabit). Pencere yarı-açık: `[startAt, endAt)` kullanıcı aralığı, `[endAt, endAt+tampon)` tampon satırları (`isBufferRow=true`; aggregation/UI'a doğrudan dahil edilmez). Testlerdeki `TEST_BUFFER_MS` yalnızca test parametresidir. Delta/aggregation/sayaç devri/negatif kırpma **yok**; ham negatif olduğu gibi kalır (Q-W522 açık).
- `runMany`: her kaynak ayrı adapter çağrısı; kapsamın okuyamadığı kaynaklar okunmadan `excluded` (`SOURCE_NOT_FOUND`) olur; dahil edilen bir kaynağın hatası tüm çağrıyı düşürür (sessiz kısmi veri yok); sonuçlar `(occurredAtUtc, sourceCatalogId, seriesKey, recordId)` ile deterministik birleşir. Not: bu "hariç tut mu, reddet mi" semantiği spesifikasyonda açık değildi — aşağıya bkz.

### Testler ve mutasyon
- `scada-analysis-query.service.spec.ts` (aynı sözleşme **gerçek `SqlServerReadonlyAdapter`+mock driver** ve **mock adapter portu** üzerinde; 34 maddenin hepsi), `scada-time-window.service.spec.ts` (DST: Berlin/New York boşluk-çakışma), `scada-analysis-query.csv-fixture.spec.ts` (test 33: **gerçek CSV snapshot** — development provider, salt-okuma; `veriler/raw/` git-ignore olduğundan dosya yoksa atlanır), `scada-query-static.spec.ts`. `reporting` altında **595 test yeşil**. Mevcut `dec-0014` allow-list/R1 envanteri yeni negatif spec dosyaları için güncellendi.
- **Mutasyonlar (uygulanıp yakalandı, geri alındı):** katalog durum kapısı, BLOCKED eşlemesi, mapping kapısı (iki katman), okuma-anı tenant kapısı, saat dilimi zorunluluğu (iki katman), limit profili, kolon allowlist, tarih/saat kolonu eşleşmesi, `start<end`, maksimum aralık, Q-W521 tampon zorunluluğu, uydurma varsayılan tampon, UTC normalizasyonu (naif=UTC), DST işaretleri, kapsam bütünlüğü, root kaynak filtresi, girdi şekli/ham SQL/fazladan alan, deterministik sıralama, pencere kırpma, tampon bayrağı, UUID kontrolü, girdi mutasyonu. Not: mapping ve saat dilimi kapıları **iki katmanlı** (katalog + servis) olduğundan tek katman kaldırıldığında denk mutant oluşur; iki katman birlikte kaldırıldığında yakalanır.

### Açık noktalar / karar gereken (uydurulmadı)
1. **Servis-seviyesi retlerin audit'i:** spesifikasyon audit'i adapter'a bıraktı; adapter'a hiç gitmeyen retler (geçersiz istek, katalog kapıları, aralık, tampon) **audit'lenmiyor**. DEC-0015 "her ret audit" ile arasında boşluk olabilir → ortak `ScadaQueryAuditPort`'un serviste kullanılıp kullanılmayacağı AI1 kararı.
2. **Adapter tarih koşulu ↔ DATE/TIME ayrı kolonlar:** adapter `[tarih] >= @rangeFrom AND [tarih] < @rangeTo` bağlar ve UTC anlık `Date` geçirir; kaynak-yerel naif DATE kolonuna karşı gün hizalama/saat dilimi çevirisi gerçek sürücü turunda (ör. TASK-027.64 takibi) çözülmelidir. Servis kesin UTC kırpmayı sonradan yapar (fazla satırı atar), ama dar koşul nedeniyle **eksik satır** oluşabilir — gerçek preflight/sürücü onayıyla doğrulanmalı.
3. **`runMany` kaynak dışlama semantiği** (hariç tut + raporla vs. tümünü reddet) ve **yarı-açık pencere** sınır kuralı AI1 onayına açık; BOTC "59. dakika +1 dk" sınırı Q-W521 kapsamındadır ve uygulanmadı.
4. Tampon her iki değer tipi (INDEX/REAL_VALUE) için zorunlu tutuldu (Q-W501 yalnızca Endeks deltasını tanımlar); REAL_VALUE için gerekmiyorsa AI1 daraltabilir.
5. Interval↔value type: karar hiçbir çifti yasaklamıyor → tüm çiftler serbest (`SCADA_INTERVAL_VALUE_TYPE_COMPATIBILITY` tek yerde).

**Yapılmayanlar:** gerçek SQL Server/PostgreSQL bağlantısı, gerçek preflight, migration apply, Docker, smoke test, gerçek CSV değişikliği; delta/aggregation/rollover/karşılaştırma/sanal kolon/preset/HTTP/UI/export; yeni action/permission/tenant; Q-W516/Q-W519/Q-W521/Q-W522. Git commit/push yok. Referanslar: TASK-027.63-R1 (`backlog/TASK-027-63-R1-scada-csv-snapshot-provider.md`), TASK-027.64 + R1/R2 (`backlog/TASK-027-64-sqlserver-readonly-adapter.md`, `backlog/TASK-027-64-R2-scada-audit-entityid-nullable.md`).

## 2026-09-23 — AI1 Değerlendirmesi ve R1 (append-only): `review` kaldı

AI1: teslim güçlü; `done` verilmedi. Nedenler: (1) adapter'a gitmeden reddedilen sorgular audit edilmiyordu (DEC-0015 "her ret audit" ile çelişki), (2) UTC `Date` parametresi gerçek SQL Server'da gün sınırı kayıtlarını eksik getirebilir, (3) `runMany` red davranışı belirsiz, (4) ileri tamponun REAL_VALUE için gerekliliği belirsiz. **AI1 karar önerileri (uygulandı ve kayda geçti):**
- **Q-W526:** Query Service dahil **tüm retler audit edilir**; audit **tek bir üst orkestrasyon sınırında** üretilir, adapter ile çift kayıt yok; audit yazılamazsa fail-closed.
- **Q-W527:** adapter'a kaynak saat dilimi ve güvenli sorgu penceresi birlikte aktarılır; UTC dönüşümü yüzünden başlangıç/bitiş günü kaydı kaybolmaz; gerçek sürücüye özel varsayım yok.
- **Q-W528:** kullanıcı açıkça birden çok kaynak seçtiyse tek kaynak reddi **tüm isteği BLOCKED** yapar; root aggregation'da **her kaynak ayrı durumla raporlanır**, unresolved kaynak veri üretmez.
- **Q-W529:** ileri tampon **yalnızca INDEX** için zorunlu; REAL_VALUE için pencereye eklenmez.
- Ek: Q-W521 yarı-açık aralık ve "59. dakika" kuralı, Q-W522 negatif fark çıktısı (027.66/027.67 ile tutarlı korunacak), gerçek SQL Server/preflight kapsam dışı.

### R1 teslimi
1. **Q-W526 — tek audit sınırı = `ScadaAnalysisQueryService`.** Servis artık paylaşılan `ScadaQueryAuditPort`'u (mevcut `SCADA_QUERY_SUCCEEDED/DENIED/FAILED`, `ScadaAnalysisQuery`, yeni action yok) alır ve adapter'ı yeni **`readUnaudited`** ile çağırır (`ScadaOrchestratedReadPort`); adapter kendi `read`'inde eskisi gibi audit eder (doğrudan kullanım için) ama servis üzerinden asla — testle sabit: adapter tarafı audit sayacı hep 0. **Adapter'a gitmeyen her ret** (şekil, UUID, katalog kapıları, aralık, tampon konfigürasyonu, kapsam) tam bir `SCADA_QUERY_DENIED` üretir; adapter limit reddi `DENIED` + adapter nedeni + `limitReason`; sürücü hatası `FAILED`; iptal `FAILED`+`CANCELLED` (Q-W520). Geçersiz/okunamayan girdi: `entityId=null`, okunamayan kapsam: `tenantId/customerRootTenantId=null` (yer tutucu yok). Başarı, kaydı **kalıcı yazıldıktan sonra** döner; yazılamazsa **`SCADA_AUDIT_FAILED`** (AI1 hata listesine bilinçli ek — fail-closed sınırının kendi statik kodu), ret ise kendi hatasını korur. Correlation id **çağrı başına sunucu üretimli**; istemci alanı reddedilir. `ScadaQueryAuditEntry.tenantId/customerRootTenantId` `string | null` oldu.
2. **Q-W527 — kayıpsız kaynak-yerel pencere.** (Bu parça aynı gün paralel çalışan oturumla birlikte tamamlandı ve testlerle doğrulandı.) Yeni `scada/time/scada-source-time.ts`: adapter, **katalogdaki saat dilimiyle** UTC pencereyi kaynak-yerel pencereye çevirir — DATE kolonu için tam yerel günler (`from` günü .. `to` gününden bir sonraki gün, üst sınır hariç; fazlalık serviste UTC'ye göre tam kırpılır), DATETIME için tam naif yerel sınırlar. Parametreler **naif string** (`YYYY-MM-DD` / `YYYY-MM-DDTHH:mm:ss.fff`, zone soneki yok) ve `paramTypes` (`DATE|DATETIME2|INT`) ile açık tiplenir; sürücü wrapper'ı bunları dönüşümsüz bağlar → gerçek sürücüye özel varsayım yok. `ExecutionProfile.dateColumnKind` eklendi; DATE/DATETIME dışı tarih kolonu reddedilir. Test: SQL predicate'ini taklit eden sürücüyle yerel-gün ≠ UTC-gün sınırında kayıt kaybı yok (naif UTC-tarih koşulu hiç satır getirmezdi), Berlin DST günü, DATETIME2 sınırları, 6 saat dilimi × 5 gün taraması.
3. **Q-W528 — `runMany(actor, scope, queries, { mode, signal })`:** `EXPLICIT` → önce **tüm** kaynaklar hazırlanır (hiçbiri okunmadan); biri reddedilirse **hiç veri okunmaz/dönmez**, reddedilen kaynak kendi kodu, diğerleri `MULTI_SOURCE_REQUEST_BLOCKED` nedeniyle audit'lenir; okuma aşamasında hata da tümünü bloklar. `ROOT_AGGREGATION` → her kaynak **kendi durumuyla** raporlanır (`READ` / `EXCLUDED` (kapı reddi, ör. `SOURCE_NOT_FOUND`/`SOURCE_MAPPING_UNRESOLVED`) / `FAILED` (adapter/audit hatası)); reddedilen kaynak veri üretmez; `complete` yalnızca hepsi `READ` ise `true`; kaynak başına bir audit kaydı; iptal tüm çağrıyı keser. Mod zorunlu (yoksa `INVALID_REQUEST`). Eski `excluded` alanı kalktı; yerine kaynak başına `sources[]` durumu geldi.
4. **Q-W529 — tampon yalnızca INDEX:** `windowConfig().forwardBufferMs` yalnızca `INDEX` için okunur/zorunludur (`QUERY_WINDOW_CONFIGURATION_REQUIRED`); `REAL_VALUE` için konfigürasyon aranmaz, pencereye tampon eklenmez, en büyük aralık kontrolüne katılmaz, tampon satırı üretmez.
5. **Q-W521 / Q-W522:** yarı-açık pencere `[startAt, endAt)` (+ INDEX için `[endAt, endAt+tampon)` tampon satırları) **uygulanan kural** olarak testlerle sabitlendi. **"59. dakika +1 dk" kuralı uygulanmadı:** AI1 metni kuralın **içeriğini/değerini** vermedi (yalnızca "karara bağlanmalı"); BOTC davranışından tahminle uydurulmadı → **Q-W521 hâlâ açık: kuralın tam tanımı ve değerleri AI1'den gerekli**. Q-W522: ham negatif değer olduğu gibi korunur (kırpma/delta yok, testle sabit); nihai çıktı davranışı 027.66/027.67 ile tutarlı kalacak şekilde **açık**.

### Testler / mutasyon
- `reporting` altında **hepsi yeşil** (bu turda +`scada-source-time.spec.ts`, servis specine audit/mod/tampon/pencere blokları; aynı sözleşme gerçek adapter+mock driver ve mock port üzerinde). Mevcut adapter/query spec'leri yeni parametre biçimine (naif string + `paramTypes`) güncellendi.
- **Gerçek mutasyonlar (uygulanıp yakalandı, geri alındı):** ret audit'inin kaldırılması, başarı audit'inin fail-open'a çevrilmesi, adapter'ın çift audit yazması, ham catalog id'nin audit'e girmesi, nil UUID yer tutucusu, tamponun REAL_VALUE'ya uygulanması, REAL_VALUE için uydurma tampon, UTC günüyle pencere, DATE üst sınırının genişletilmemesi, EXPLICIT'in bloklamaması, ROOT'ta reddedilen kaynağın yanlış durumu, diğer kaynakların `BLOCKED` işaretlenmemesi, ROOT'ta audit hatasında verinin korunması, istemci correlation id'sine güven.
- **Koordinasyon notu:** bu R1 sırasında başka bir oturum aynı ağaçta TASK-027.66'yı (`scada/aggregation/`) yazdı ve adapter/builder/spec dosyalarını benim sürücü/pencere değişikliğime uyarladı; kullanıcı kararıyla o oturum bitene kadar bekledim, sonra tüm dosyaları yeniden okuyup devam ettim (çakışma/üzerine yazma olmadı).

### Yapılmayanlar
Gerçek SQL Server/PostgreSQL/preflight/Docker/smoke; delta/aggregation/rollover; HTTP/UI/export; yeni action/permission; Q-W516/Q-W519. Git commit/push yok. Durum: **`review`** (AI1 `done` onayı bekleniyor).

## 2026-09-23 — AI1 kararları ve R2 (append-only): küçük düzeltmeler — `review`

AI1: R1 büyük ölçüde tamam; `done` için üç nokta netleştirilip küçük düzeltme istendi. **Kararlar:**
- **Q-W521 (kapandı):** iç analiz aralığı daima **`[startAt, endAt)`**. Arayüz bitiş dakikasını kapsayıcı kabul ediyorsa (ör. 12:59 seçimi → 13:00 **exclusive** bitiş) dönüşüm **UI/query sınırında açıkça** yapılır; **serviste gizli veya koşulsuz +1 dakika uygulanmaz** ("59. dakika +1 dk" kuralı servis içi kural değildir). `forwardBufferMs` yalnızca INDEX için zorunlu, REAL_VALUE için tampon eklenmez, değer kodda sabitlenmez, eksik tampon konfigürasyon hatasıdır (`QUERY_WINDOW_CONFIGURATION_REQUIRED`) — R1'deki uygulama bunu zaten karşılıyor.
- **`SCADA_AUDIT_FAILED` onaylanmadı:** yeni action uydurulmaz; üç action korunur. Audit hatası = `actionCode = SCADA_QUERY_FAILED`, `reasonCode = AUDIT_FAILED`.
- **`MULTI_SOURCE_REQUEST_BLOCKED` = reason code:** `actionCode = SCADA_QUERY_DENIED`, `reasonCode = MULTI_SOURCE_REQUEST_BLOCKED`.
- **Q-W522 (önceki karar korunur):** tanımlı sayaç devri yoksa `rawValue` korunur, `deltaValue = null`, `dataQuality = COUNTER_RESET_UNRESOLVED`, `isComplete = false` (027.66/027.67 kapsamı; bu task'ta delta yok, ham negatif değer olduğu gibi kalır).
- **DST:** geçici işaretleme bu task için kabul: tekrar eden saat `UNVERIFIED`, olmayan saat `INVALID`; nihai politika TASK-027.67.

### R2 teslimi
1. **`SCADA_AUDIT_FAILED` kaldırıldı** → servis hata kodu ve ROOT durum kodu `AUDIT_FAILED` (yeni action yok). Audit hatasında (başarı kaydı yazılamadığında) sonuç yine **dönmez**; ayrıca hatanın kendisi **best-effort** olarak `SCADA_QUERY_FAILED` + `reasonCode=AUDIT_FAILED` kaydıyla audit'lenir (yalnızca başarı kaydı geçici başarısız olduysa yazılabilir; audit tamamen kapalıysa yazılamaz ve ret/hata yine döner). Test eklendi.
2. **`MULTI_SOURCE_REQUEST_BLOCKED` reason code olarak belgelendi** (`scada-query.errors.ts` açıklaması + bu kayıt) ve testle sabitlendi: engellenen çok-kaynaklı isteğin tüm audit kayıtları yalnızca `SCADA_QUERY_DENIED` action'ıdır.
3. **Q-W521 kapanışı** append-only kaydedildi (`BOTC_MIGRATION_OPEN_QUESTIONS.md` + bu dosya). Servis yarı-açık aralığı olduğu gibi kullanır; kapsayıcı-bitiş dönüşümü çağıran katmanın (027.72 API/027.73 UI) sorumluluğudur.
4. Testler yeniden çalıştırıldı: `reporting` + `audit` **765 test yeşil**; `AUDIT_FAILED` sınıflandırma mutasyonu (FAILED yerine DENIED) yakalandı. `check.sh --skip-docker` sonucu teslim raporunda.
Gerçek SQL Server/PostgreSQL/preflight/Docker/smoke yok; git commit/push yok. Durum: `review`.

## 2026-09-24 — AI1 Onayı: `done`
AI1, R1 ve R2 ile birlikte TASK-027.65'i onayladı (`review` → `done`). Açık kalanlar başka task'lara devredildi: kapsayıcı bitiş dakikası dönüşümü (027.72 API / 027.73 UI), Q-W522 (027.66/027.67), nihai DST politikası (027.67, Q-W529b). Git commit/push yapılmadı.
