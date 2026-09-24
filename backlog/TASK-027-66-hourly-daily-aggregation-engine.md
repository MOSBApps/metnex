---
id: TASK-027.66
title: Saatlik / Günlük Aggregation Engine
status: done
srs_refs: [FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, BR-004, AC-008, AC-009]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.66: Saatlik / Günlük Aggregation Engine

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `done`: TASK-027.66 başarıyla tamamlanmıştır. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.66

## Başlık

Saatlik / Günlük Aggregation Engine

## Durum

done

## Amaç

Ham zaman serisinden **Endeks** ve **Gerçek Değer** için saatlik/günlük analiz değerlerini üreten saf, deterministik hesap katmanını yazmak. Kesin hesap kuralları PO onayı olmadan yazılmaz (BR-004).

## Ön koşullar

- TASK-027.65 `done`.
- **Kapanan karar kapıları:** Q-W501, Q-W503, Q-W512, Q-W502 (devir kuralı katalogdan gelir).
- **Kalan (ready olmadan önce):** Q-W521 (tampon/sınır değerleri), Q-W522 (tanımlı devri olmayan negatif farkın çıktıdaki değeri: ham negatif korunur mu, null mu).

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W501 A:** Endeks saatlik = `LEAD(sonraki okuma) − mevcut okuma`; her okuma sonraki aralığın başlangıcı; son okumada sonraki veri yoksa **sentetik delta üretilmez**; SRS FR-025 bu davranışa hizalanacaktır (ayrı doküman düzeltmesi).
- **Q-W503 C:** Gerçek Değer davranışı katalog + analiz parametreleriyle; tablo adı varsayımı yok; saatlik/günlük işlem tipi katalogda; toplam/ortalama/min/max/zaman kaydırma parametrik.
- **Q-W512 C:** UTC normalize zaman kovaları; DST açık. **Q-W502 B:** negatif fark/devir kalite katmanında (027.67).

## Kapsam

- **Endeks (Q-W501 A):** her okuma için `delta = next.raw − current.raw` (sonraki okuma zaman sırasına göre); son okumada sonraki veri yoksa **delta üretilmez** (değer yok + kalite durumu; sentetik 0 yok). Önceki BOTC davranışındaki “son satır 0” **taşınmaz**.
- **Gerçek Değer (Q-W503 C):** işlem tipi (saatlik/günlük), toplam/ortalama/min/max ve zaman kaydırması **katalog analiz parametrelerinden** gelir; tablo adına bağlı varsayılan ve “herhangi bir kolon Gerçek Değer ise tüm sorgu kayar” mantığı **yoktur**; parametre tanımsızsa hesap yapılmaz (fail-closed).
- **Günlük çözünürlük:** günlük değer, katalogda tanımlı işlemle (ör. saatlik deltaların toplamı/ortalaması) ve **kaynak saat diliminde tanımlı gün sınırlarıyla** üretilir; gün = UTC-normalize kovaların kaynak saat dilimine göre gruplanması (DST günleri açık). Varsayılan işlem yoktur.
- Çıktı (versiyonlu normalize analiz sonucu sözleşmesinin hesap alanları, Q-W513 C): `bucket(UTC)`, `raw`, `analysisValue`, `quality[]`; sütun-adı öneki (`Fark_`, `Ham_`) sözleşmesi **taşınmaz**.
- Boş/eksik nokta: **sessizce 0 yapılmaz**; değer yok + kalite durumu.
- Aralık-dışı kayıtların sonuçtan çıkarılması (FR-029).

## Kapsam dışı

- Sayaç devri ve veri kalite kuralları (TASK-027.67), istatistik/ölçek (027.68), karşılaştırma (027.69), sanal kolon (027.70).
- SQL tarafında pencere fonksiyonuyla hesap: hesap uygulama katmanında, saf fonksiyonlardadır.

## Bağımlılıklar

TASK-027.65. Sonraki: TASK-027.67.

Zincir: `TASK-027.65` → **TASK-027.66** → `TASK-027.67`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/aggregation/* (yeni; saf fonksiyonlar + testler)
- docs/domain/DOMAIN_MODEL.md (hesap kuralı özeti)

## API/UI/veri sözleşmesi

- **Veri (öneri):** `aggregate(rawSeries, {resolution, valueType}) → AnalysisSeries { points[{ts, raw, delta}] }`. Saf fonksiyon: I/O, saat, rastgelelik yok.
- **API/UI:** yok.

## Tenant ve permission kuralları

- Hesap katmanı tenant/scope bilmez; yalnızca zaten yetkilendirilmiş ham seri alır. Tenant bilgisi bu katmana **girmemelidir** (sızıntı testi).
- Yeni permission yok.

## Audit ve güvenlik kuralları

- Saf hesap; audit yazmaz. Hesap sonucu satırları loglanmaz.
- Hata durumunda satır verisi mesaja girmez.

## Test senaryoları

1. AC-008/009: doğrulanmış örnek endeks serisinde saatlik sonuç `LEAD(sonraki) − mevcut` ile eşleşir; günlük sonuç katalogdaki işlem tanımıyla saatlik sonuçlarla tutarlıdır; **son okumada delta yoktur**.
2. Sınırlar: tek nokta, boş seri, son okuma, gün sınırı (kaynak saat dilimi), DST ileri/geri geçiş günü, null değerler, eşit değerler; negatif farkın işlenmesi 027.67 ile birlikte (Q-W522).
3. Gerçek Değer/günlük işlem: katalog parametresi yoksa **hesaplanmaz** (fail-closed); toplam/ortalama/min/max/kaydırma parametreleri ayrı ayrı; tablo adının hiçbir etkisi yok (statik+davranış).
4. Determinizm ve idempotency: aynı girdi → aynı çıktı; girdi mutasyona uğramaz.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. `LEAD` yönü (mevcut−sonraki) tersine çevrilirse ya da son okumaya sentetik delta eklenirse testler kırılır.
2. Gün gruplaması kaynak saat dilimi yerine UTC’ye çevrilirse veya DST işlemi kaldırılırsa günlük test kırılır.
3. Aralık-dışı kırpma kaldırılınca FR-029 testi kırılır.
4. Katalog parametresi yokken hesap yapılması (fail-closed kaldırılınca) veya tablo adına bağlı varsayılan eklenmesi testi kırar.

## Kabul kriterleri

- Endeks Q-W501 A’ya, Gerçek Değer Q-W503 C’ye birebir uyar; kural kaynağı DEC-0015’e referanslıdır; SRS FR-025/026 düzeltmesi ayrı doküman işi olarak takip edilir.
- BOTC sonuçlarıyla **sentetik** karşılaştırma fixture’ı (gerçek SCADA verisi değil) tutarlılığı gösterir.
- Saf fonksiyonlar; gerçek DB/SQL Server yok; `check.sh --skip-docker` geçer.

## Rollback yaklaşımı

Saf, çağıranı olmayan modül; kaldırmak yeterli. Migration yok.

## Sonraki task

TASK-027.67

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Hayır. Sentetik fixture ve saf testler.

## AI1/PO kararı gerektiren açık sorular

- **Q-W521** — Sorgu tamponu ve sınır kuralı değerleri (BOTC referansı: +2 saat, +30 dk, 59. dk +1 dk)
- **Q-W522** — Tanımlı devri olmayan negatif farkın çıktıdaki değeri (ham negatif mi null mu)

## BOTC referansı

- **Referans davranış:** `ReportService.GetHourlyConsumptionAsync` (LEAD, `CASE WHEN … < 0 THEN 0`, günlük `SUM(Fark_)`/`MIN(Ham_)`, `DATEADD(minute,-30, …)`), `GetDefaultValueTypeForTable`.
- **Taşıma sınırı:** Taşınmaz: SQL string üretimi, `Ham_`/`Fark_` sütun öneki, “herhangi bir kolon Gerçek Değer ise tüm sorgu kayar” mantığı (doğrulanmadan), `DataTable`.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Tüketici referansı (TASK-027.67)
`apps/api/src/reporting/scada/quality/` (TASK-027.67) bu engine'in negatif-fark kararlarını açık policy'ye bağlayan `toAggregationRolloverPort` adaptörünü sağlar; engine kodu değişmedi. Engine'in `RolloverPolicyPort` çağrısında zaman olmadığından policy sabit bir `asOfUtc`'de değerlendirilir; etkinlik penceresini satır bazında uygulayan tam akış `ScadaDataQualityService`'tedir.
