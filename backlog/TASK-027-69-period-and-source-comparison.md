---
id: TASK-027.69
title: Dönem ve Veri Kaynağı Karşılaştırması
status: done
srs_refs: [FR-047, FR-048, FR-049, FR-050, FR-051, FR-052, FR-053, BR-005, AC-016, AC-017, AC-018, AC-019]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.69: Dönem ve Veri Kaynağı Karşılaştırması

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.69

## Başlık

Dönem ve Veri Kaynağı Karşılaştırması

## Durum

planned

## Amaç

Ana dönem ile ikinci bir dönemi ve/veya **yetkili** ikinci bir veri kaynağını, açık ve testli bir zaman-eşleme kuralıyla karşılaştırma serileri olarak üretmek.

## Ön koşullar

- TASK-027.68 `done`.
- **Kapanan karar kapıları:** Q-W507, Q-W508, Q-W512, Q-W513 (bkz. “Bağlayıcı karar kapanışları”).
- **Kalan:** yok (kalite durum sözlüğü TASK-027.67’den gelir).

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W507 B:** dönem karşılaştırması **normalize zaman kovalarıyla**; satır pozisyonu eşlemesi yok; eksik kova sessizce 0 yapılmaz; eşleşmeyenler veri kalite durumu.
- **Q-W508 B:** farklı kaynaklar normalize zaman kovalarıyla eşlenir; satır sırası esas değil; **gizli/otomatik tolerans yok** (gerekiyorsa kaynak kataloğunda açık); eşleşmeyen kovalar kalite durumuyla.
- **Q-W512 C:** UTC kovalar; DST açık. **Q-W513 C:** karşılaştırma değeri versiyonlu sonuç sözleşmesinin alanıdır.

## Kapsam

- Dönem karşılaştırması: aynı kolon seçimi iki tarih aralığıyla; sonuç “kıyas” serisi olarak (adlandırma/işaret sözleşmesi UI için ayırt edilebilir: FR-050).
- İkinci kaynak: ayrı tablo/kolon seçimi; **kaynak yetkisi ayrıca doğrulanır** (AC-019); ana kaynakla aynı çözünürlük ve aralık.
- Farklı uzunluk, boşluklu dönem ve DST günü davranışı sözleşmede yazılıdır (kova haritalama kuralı task içinde tanımlanıp AI1’e onaylatılır).
- Farklı uzunlukta/boşluklu dönemlerde davranış (null vs kısaltma) ve DST etkisi.

## Kapsam dışı

- Grafik çizimi/overlay UI (TASK-027.73).
- İkiden fazla kaynak, kaynaklar arası birleşik SQL (`JOIN`) — yasak.
- Kaynaklar arası birim/ölçek dönüşümü (ayrı karar).

## Bağımlılıklar

TASK-027.68. Sonraki: TASK-027.70.

Zincir: `TASK-027.68` → **TASK-027.69** → `TASK-027.70`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/comparison/* (yeni, **olası**)
- apps/api/src/reporting/scada/analysis/* (ikinci istek yolu; ikinci kaynak için ayrı scope/katalog kontrolü)

## API/UI/veri sözleşmesi

- **Veri:** versiyonlu normalize analiz sonucunun karşılaştırma alanları: `bucket`, `baseValue`, `compareValue`, `quality[]` (`eşleşmeyen kova` dahil); eşleşmeyenler açıkça listelenir (sessiz atma/0 yok).
- **API/UI:** yok (TASK-027.72/.73).

## Tenant ve permission kuralları

- İkinci kaynak da katalog + scope kontrolünden geçer; ana kaynağa verilen yetki ikinciye **geçmez**.
- Kaynaklar farklı tenant’a aitse her biri kendi scope’unda değerlendirilir; root aggregation dışına çıkılamaz.
- Yeni permission yok (Q-W511).

## Audit ve güvenlik kuralları

- Her kaynak okuması kendi audit girdisini üretir (kaynak başına satır kararı Q-SA03). İkinci kaynak reddi audit’lenir.

## Test senaryoları

1. Aynı kolon iki dönemde (AC-016); eşit/farklı uzunluk; kısmi örtüşme; DST günü; **satır sırası değişse sonuç değişmez**.
2. İkinci kaynak yetkisiz → ret ve audit (AC-019); yetkili → seri (AC-018).
3. Eşleşmeyen nokta listesi doğru; hiçbir nokta sessizce atılmaz.
4. Tenant izolasyonu ve state sızıntısı yok.
5. Kaynak toleransı: katalogda tanımlı değilse tolerans uygulanmaz (yakın zamanlı kova eşleşmez); tanımlıysa yalnızca tanımlı aralıkta eşleşir.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. İkinci kaynak scope kontrolü kaldırılınca AC-019 testi kırılır.
2. Eşleme kuralı değiştirilince hizalama testi kırılır.
3. Eşleşmeyen noktaların atılması (listeleme kaldırılınca) test kırılır.
4. Kova yerine satır pozisyonuyla eşleme eklenirse test kırılır; eksik kovanın 0’a çevrilmesi testi kırar; örtük tolerans eklenirse tolerans testi kırılır.

## Kabul kriterleri

- Eşleme kuralı PO/AI1 kararıyla belgelenmiş; pozisyonel davranış varsayılan olarak kopyalanmamıştır.
- Yetkisiz ikinci kaynak API düzeyinde reddedilir.
- Gerçek DB/SQL Server yok; `check.sh --skip-docker` geçer.

## Rollback yaklaşımı

Ek modül; kaldırılınca yalnızca tek-kaynak/tek-dönem analiz çalışır. Migration yok.

## Sonraki task

TASK-027.70

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Hayır (mock adapter/saf hesap).

## AI1/PO kararı gerektiren açık sorular

- (yok — kararlar kapandı)

## BOTC referansı

- **Referans davranış:** `btnCalculate_Click` (dönem: `(Kıyas)`, kaynak: `(Ek)` sütunları, indeks-pozisyon kopyalama), `chkComparePeriod`/`chkCompareSource`.
- **Taşıma sınırı:** Taşınmaz: satır-indeksi eşleme, sütun-adı soneki (`(Kıyas)`, `(Ek)`) sözleşmesi, ikinci kaynak için “ana kaynağın tarih kolonunu ödünç alma”.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Not
AI1, `ready` spesifikasyonunu verdi; teslim kaydı `backlog/TASK-027-69-scada-period-source-comparison.md`'dedir. Durum `review`.
