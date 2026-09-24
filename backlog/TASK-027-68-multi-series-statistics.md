---
id: TASK-027.68
title: Çoklu Seri ve İstatistikler
status: done
srs_refs: [FR-024, FR-039, FR-040, FR-041, FR-042, FR-043, FR-044, FR-045, FR-054, FR-055, FR-056, AC-007, AC-013, AC-014, AC-015]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.68: Çoklu Seri ve İstatistikler

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.68

## Başlık

Çoklu Seri ve İstatistikler

## Durum

planned

## Amaç

Birden çok analiz serisini tek modelde toplamak; seri başına toplam/maksimum/minimum istatistiklerini ve **seri bazlı ölçek (Y-scale) önerisini** sunucu tarafında hesaplamak.

## Ön koşullar

- TASK-027.67 `done`.
- **Kapanan karar kapıları:** Q-W509, Q-W510.
- **Kalan (ready olmadan önce):** Q-W522 (negatif farkın istatistiklere etkisi); özel ölçek için **izinli sınırların kaynağı** (katalog alanı önerisi; task başında AI1 onayı).

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W509 C:** istatistikler metrik ve kaynak katalog tanımına göre; min/max/toplam/ortalama ayrı kurallar; sıfırın anlamı kaynak/kolon politikasına göre; null/boş/eksik sessizce 0 yapılmaz; veri yoksa null/kalite durumu.
- **Q-W510 C:** otomatik ölçek varsayılan; kullanıcı özel min/max’ı yalnızca izinli sınırlarda; geçersiz/aşırı değer reddedilir; otomatiğe dönüş açık işlem; ölçek yalnızca görsel; preset’te saklanabilir.

## Kapsam

- Çoklu seri modeli: her seri kaynak+kolon+değer tipi+görünen ad; seri kimliği/renk ataması **kararlı** (kolon adına bağlı, sıraya değil).
- İstatistikler (Q-W509 C): toplam, maksimum, minimum, ortalama **ayrı kurallarla**, kaynak/kolon katalog politikasına göre; **sıfırın anlamı** (dahil/hariç) politikadan; null/boş seri/eksik veri **sessizce 0 yapılmaz** — veri yoksa sonuç null + kalite durumu. BOTC’nin “min yalnızca >0” davranışı **varsayılan değildir**, yalnızca politika olarak ifade edilebilir.
- Ölçek (Q-W510 C): sunucu **otomatik ölçek önerisi** üretir (varsayılan); kullanıcı özel min/max verirse izinli sınırlar içinde doğrulanır, geçersiz/aşırı değer reddedilir; otomatiğe dönüş açık işlemdir; ölçek ayarı **veriyi değiştirmez**, yalnızca sunum içindir; preset’te saklanabilir. BOTC formülü (`max×(1.5+i×0.5)`) ve “özel maksimum otomatik sıfırlama” **taşınmaz**; otomatik ölçek algoritması task içinde tanımlanıp AI1’e onaylatılır.
- Etiket göster/gizle ve tooltip biçimi UI ayrıntısıdır (TASK-027.73); bu task yalnızca veri sözleşmesini sağlar.

## Kapsam dışı

- Grafik çizimi (Recharts) ve UI (TASK-027.73); karşılaştırma serileri (027.69); sanal kolon (027.70).
- Sunum/tam ekran modu.

## Bağımlılıklar

TASK-027.67. Sonraki: TASK-027.69.

Zincir: `TASK-027.67` → **TASK-027.68** → `TASK-027.69`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/series/* (yeni, **olası**; saf fonksiyonlar)
- apps/web/src/app/(app)/app/reports/[id]/analysis/chart-data.ts (mevcut generic yardımcı; **yalnızca tüketici sözleşmesi** TASK-027.73’te güncellenir)

## API/UI/veri sözleşmesi

- **Veri (öneri):** `SeriesSet { series[{id, sourceKey, column, valueType, label, points[]}], stats[{seriesId, total, max, min}], scaleHints[{seriesId, min, max, step}] }`. Sayılar biçimlendirilmez (biçim UI’da, `tr-TR`).
- **API/UI:** yok (TASK-027.72/.73).

## Tenant ve permission kuralları

- Saf hesap; seri kümesi yalnızca çağıranın yetkili olduğu kaynaklardan oluşur (çağıran katman sorumlu, test edilir).
- Yeni permission yok.

## Audit ve güvenlik kuralları

- Saf hesap; audit yazmaz.

## Test senaryoları

1. İstatistik: boş seri, tek nokta, hepsi 0, negatif, null’lar, eksik veri (**sonuç null + kalite**, sessiz 0 yok), çok büyük değer; sıfır politikası (dahil/hariç) ayrı ayrı; ortalama/min/max/toplam kuralları katalog politikasına göre.
2. Ölçek: farklı büyüklükte iki seri bağımsız ölçek alır (AC-013); geçerli özel min/max uygulanır (AC-014); geçersiz/aşırı özel değer reddedilir; otomatiğe dönüş açık işlemdir; ölçek ayarı hesap sonucunu **değiştirmez** (veri aynı).
3. Seri kimliği/renk kararlılığı: kolon ekleme/çıkarma diğer serilerin kimliğini/rengini değiştirmez.
4. Deterministik, girdi mutasyonu yok.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Sıfır politikası yok sayılırsa (hep dahil/hariç) veya eksik veri 0 sayılırsa test kırılır.
2. Seri-başı ölçek yerine ortak ölçek kullanılınca AC-013 testi kırılır.
3. Özel ölçek doğrulaması (izinli sınır) kaldırılırsa reddedilme testi kırılır; ölçeğin veriyi değiştirmesi testi kırar.
4. Kimlik atamasının sıraya bağlanması testi kırar.

## Kabul kriterleri

- İstatistik ve ölçek kuralları Q-W509 C ve Q-W510 C’ye birebir uyar; sessiz 0 yoktur; BOTC formülleri kopyalanmamıştır.
- En az iki farklı büyüklükte seri için bağımsız ölçek verisi üretilir.
- Gerçek DB/SQL Server yok; `check.sh --skip-docker` geçer.

## Rollback yaklaşımı

Saf modül; kaldırmak yeterli.

## Sonraki task

TASK-027.69

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Hayır.

## AI1/PO kararı gerektiren açık sorular

- **Q-W522** — Tanımlı devri olmayan negatif farkın çıktıdaki değeri (ham negatif mi null mu)
- İzinli özel ölçek sınırlarının kaynağı (task başında AI1 onayı)

## BOTC referansı

- **Referans davranış:** `CalculateStats`/`AddStatItem`, `GenerateAndBindCharts` (`autoLimit`, `CustomMaxLimit`, `CalculateStep`, renk paleti indeksi).
- **Taşıma sınırı:** Taşınmaz: LiveCharts nesneleri, renk paletinin sıraya bağlı olması, WPF `SeriesStat` string biçimlendirmesi (`N2`), UI’da hesap.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Not
AI1, `ready` spesifikasyonunu (çoklu seri istatistik sözleşmesi) verdi; teslim kaydı `backlog/TASK-027-68-scada-multi-series-statistics.md`'dedir. Bu planlama dosyasının ölçek (Q-W510) / sıfır politikası (Q-W509) / renk kapsamı o spesifikasyonda yer almadığı için **uygulanmadı** (bkz. teslim dosyasının "Açık noktalar"ı). Durum `review`.
