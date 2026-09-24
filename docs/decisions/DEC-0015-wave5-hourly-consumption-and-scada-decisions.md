# DEC-0015 — Wave 5 Hourly Consumption ve SCADA Karar Kapanışları

**Date:** 2026-09-23
**Status:** Accepted — AI1/Product Owner kararlarıyla (bağlayıcı; öneri değildir)
**Deciders:** Product Owner, AI1 (Product Governance Agent)
**Kapsam:** Q-W501–Q-W515, Q-SC01–Q-SC03, Q-SP02, Q-SP04, Q-SP04b, Q-SA01–Q-SA07 (Q-AD01 dahil), Q-SR01, Q-M05, Q-E04
**İlgili:** DEC-0009, DEC-0010, DEC-0011, DEC-0012, DEC-0014, TASK-027.58/58-R1/62, `docs/migration/METNEX_SCADA_AUDIT_CONTRACT_DECISION_PACKAGE.md`

## Context

TASK-027.58-R1 sonrasında Wave 5 (Hourly Consumption / SCADA analiz) planı 13 task’a bölündü (TASK-027.62) ve 15 açık soru (Q-W501–W515) ile mevcut SCADA/audit/kimlik soruları karar kapısı olarak bırakıldı. BOTC `HourlyConsumptionWindow` davranışı ile SRS arasında gerçek çelişkiler (saatlik delta, sayaç devri, sanal kolon) bulunmuştu. Bu karar kaydı o kapıları kapatır. Bu dosya **karar kaydıdır**: production kodu, migration, SQL Server/PostgreSQL bağlantısı veya Docker içermez.

## Decisions

### Hesaplama ve veri kalitesi

| Soru | Karar | Özü |
|---|---|---|
| **Q-W501** | **A** | Endeks saatlik değeri `LEAD(sonraki okuma) − mevcut okuma`. Her okuma, kendisinden sonraki zaman aralığının başlangıcıdır. SRS FR-025 bu davranışla uyumlu hale getirilecektir. Son okumada sonraki veri yoksa **sentetik delta üretilmez**. Negatif fark ve devir Q-W502’dedir. |
| **Q-W502** | **B** | Sayaç devri **kaynak/kolon katalog yapılandırmasıyla** yönetilir. Kolon adına göre otomatik karar yok; sabit `+100000` taşınmaz; tanımlı devri olmayan negatif fark **sessizce 0 yapılmaz**, veri kalite uyarısıyla işaretlenir; devir değeri kaynak/kolon bazında tanımlanabilir. |
| **Q-W503** | **C** | Gerçek Değer davranışı katalog ve analiz parametreleriyle tanımlanır. Tablo adına göre varsayım yok; saatlik/günlük işlem tipi katalogda; toplam/ortalama/min/max/zaman kaydırması parametrelenebilir; yeni parametreler sonraki katalog versiyonlarıyla eklenir. |
| **Q-W509** | **C** | İstatistikler metrik ve kaynak katalog tanımına göre hesaplanır; min/max/toplam/ortalama kuralları ayrı; sıfırın anlamı kaynak/kolon politikasına göre; null/boş seri/eksik veri sessizce 0 yapılmaz; veri yoksa sonuç null/kalite durumu. |
| **Q-W510** | **C** | Otomatik ölçek varsayılan; kullanıcı ölçeği yalnızca izinli sınırlar içinde (özel min/max); geçersiz/aşırı değer reddedilir; otomatiğe dönüş açık işlem; ölçek veriyi değiştirmez (yalnızca görsel); preset’te saklanabilir. |
| **Q-W512** | **C** | Kaynak saat dilimi katalogda tanımlı; veri **UTC’ye normalize**; ekranda **tenant saat diliminde** gösterilir. Naive datetime belirsizliği taşınmaz; saat dilimi bilinmeyen kaynak **fail-closed**; DST geçişleri açıkça ele alınır; başlangıç/bitiş sınırları ve sorgu tamponu sözleşmede tanımlanır. |

### Sanal kolon, preset ve saklama

| Soru | Karar | Özü |
|---|---|---|
| **Q-W504** | **C** | Sanal kolonlar kontrollü, allowlist tabanlı, **versiyonlu formül diliyle** çalışır. Serbest JavaScript/SQL/`DataTable.Compute` yok; yalnızca izinli operatör, fonksiyon ve katalog kolonları; kayıt öncesi sözdizimi doğrulama; sıfıra bölme/null/NaN/∞/taşma/derinlik limitleri; hatalı sonuç sessizce 0 yapılmaz; formüller versiyonlanır ve audit edilir. |
| **Q-W505** | **B** | Sanal kolon ve preset metadata’sı **control-plane**’de; `tenantId` + `ownerUserId` kapsamlı; versiyonlama/audit/rollback mümkün; **data-plane’e yeni payload tablosu eklenmez**. |
| **Q-W506** | **C** | `PRIVATE` (yalnızca oluşturan) ve `TENANT_SHARED` (tenant kapsamındaki yetkili kullanıcılar) preset’ler; paylaşım ayrıca yetki kontrolünden geçer; aynı isimli preset sessizce üzerine yazılmaz; preset’ler versiyonlanır; karşılaştırma, ölçek, filtre ve sanal kolon referansları saklanır. |
| **Q-W515** | **B** | SCADA kaynak/tablo/kolon allowlist’i **control-plane veritabanında versiyonlu ve audit’li**; kaynak, tablo, kolon, zaman, ölçüm ve analiz parametreleri merkezi katalogda; **kaynak↔tenant eşlemesi katalog sözleşmesinin parçası**; yalnızca yetkili platform operasyonları değiştirir; config ve DB arasında iki doğruluk kaynağı oluşmaz. |

### Karşılaştırma

| Soru | Karar | Özü |
|---|---|---|
| **Q-W507** | **B** | Dönem karşılaştırması **normalize edilmiş zaman kovaları**yla; satır pozisyonuyla eşleme yok; eksik kova sessizce 0 yapılmaz; eşleşmeyen kayıtlar veri kalite durumu olarak gösterilir. |
| **Q-W508** | **B** | Farklı kaynaklar normalize edilmiş zaman kovalarıyla eşlenir; satır sırası esas değil; **gizli/otomatik tolerans yok**, gerekiyorsa kaynak kataloğunda açıkça; eşleşmeyen kovalar kalite durumuyla gösterilir. |

### Yetki, erişim, sözleşme, ortam

| Soru | Karar | Özü |
|---|---|---|
| **Q-W511** | **C** | Katmanlı yetki: genel analiz görüntüleme/export için mevcut `REPORT:ARTIFACT:VIEW` ve `REPORT:ARTIFACT:EXPORT`; SCADA kaynak/katalog/allowlist yönetimi analiz kullanıcılarına verilmez; **yeni permission kodu uydurulmaz**; kaynak yönetimi ayrı ve daha yüksek yetkili platform operasyon kapsamıdır. |
| **Q-W513** | **C** | Versiyonlu **normalize analiz sonucu sözleşmesi**: zaman kovası, seri, ham değer, analiz değeri, karşılaştırma değeri, kalite durumu tipli alanlar; grafik, tablo, CSV, PNG, PDF, XLSX aynı sonucu tüketir; formatlar kendi sunum düzenine sahip olabilir, hesap sonucu tek sözleşmeden. |
| **Q-W514** | **B** | Wave 5 kabulü **kontrollü, izole, sentetik verili test ortamında**: test SQL Server/eşdeğeri, PostgreSQL, Jasper ve browser akışı birlikte; production verisi/secret yok; Docker veya gerçek servis çalıştırma **ayrıca açık kullanıcı onayına** bağlı; production kabulü kapsam dışı. |
| **Q-SC01** | **C** | **MOSEDAS tenant değildir.** Fiziksel DB adı tenant otoritesi değil; varlık sahipliği Metnex operasyon tenant’ını belirlemez; SCADA kaynağı yalnızca onaylı operasyon mapping’iyle tenant kapsamına alınır; mapping yoksa `UNRESOLVED/BLOCKED`; MOSEDAS kaynak adı olarak kalabilir, tenant olarak oluşturulamaz. |
| **Q-SC02** | **C** | Metnex’te **yeni allowlist tabanlı SCADA adapter**. `DynamicDataSources` ve hardcoded `FromSqlRaw` doğrudan taşınmaz (yalnızca kaynak/davranış referansı); database/schema/table/column profilleri control-plane katalogdan; browser’dan raw SQL/identifier alınmaz; `INFORMATION_SCHEMA` canlı keşfi yok. |
| **Q-SC03** | **B** | SCADA için **ayrı analiz veri sözleşmesi**. Mevcut `ReportDatasetProvider` finansal/genel raporlar için korunur; SCADA geniş zaman serisi, çoklu seri, delta ve kalite durumlarını ayrı sözleşmeyle taşır; ortak tenant, audit, export ve reporting altyapısı yeniden kullanılabilir. |
| **Q-SP02** | **B** | Performans eşikleri **kod içine sabitlenmez**; ortam/kaynak profiline göre yapılandırılır (timeout, satır/kolon/payload, tarih aralığı, pool, eşzamanlılık); **eksik/geçersiz limit → sorgu fail-closed reddedilir**; production ve test farklı değer kullanabilir; limit değişiklikleri versiyon + audit ile izlenir. |
| **Q-M05** | **C** | İlk Wave 5 sürümünde **canlı read-only SQL Server sorgusu**; SCADA verisi PostgreSQL’e kopyalanmaz; sıkı timeout/satır/payload/eşzamanlılık limitleri; gerçek performans ölçümleri toplanır; cache/read-model ihtiyacı doğarsa ayrı karar ve task; ilk sürümde cache/fan-out altyapısı yok. |
| **Q-E04** | — | SCADA, **reporting altında ayrı bounded module**: `apps/api/src/reporting/{dataset/ (mevcut genel/finansal), scada/ (SCADA katalog, adapter, analiz sözleşmeleri)}`. Ayrı veri sözleşmesi ve adapter portu; ortak tenant, audit, export, reporting altyapısından yararlanır. |

### Kimlik / tenant hizası

| Soru | Karar | Özü |
|---|---|---|
| **Q-SP04** | **B** | MOSEDAS aktif Metnex tenant hedeflerinden **çıkarılır**. Fiziksel DB/tarihsel referans olarak belgelerde kalabilir; **otomatik MOSB eşlemesi yapılmaz**; mapping yoksa `UNRESOLVED/PENDING_MAPPING`; `DISCOVERY.md` iç çelişkisi ayrı doküman düzeltmesiyle giderilir. |
| **Q-SP04b** | **C** | MOSEDAS ilişkili kullanıcılar **otomatik tenant’a atanmaz**; gerekirse identity-only staging; membership `UNRESOLVED/PENDING_MAPPING`; parola `RESET_REQUIRED`; onaylı mapping olmadan login/runtime erişimi yok; BEAM/ERP bilgisi Metnex tenant yetkisi yerine kullanılamaz. |

### SCADA audit sözleşmesi ve redaction

| Soru | Karar | Özü |
|---|---|---|
| **Q-SA01 / D1** | **A** | Üç audit action: `SCADA_QUERY_SUCCEEDED`, `SCADA_QUERY_DENIED`, `SCADA_QUERY_FAILED`. Bunlar **permission kodu değildir**, yalnızca audit action kodlarıdır. |
| **Q-SA02 / D2** | — | `entityType = ScadaAnalysisQuery`; `entityId = katalog kaydı UUID’si`. Fiziksel database/schema/table/column adı audit’e girmez; source key kullanıcı girdisi olarak entity ID olamaz. |
| **Q-SA03 / D3** | — | Kapsam = `tenantId` + gerektiğinde `customerRootTenantId`; satır birimi = **kaynak başına bir audit satırı**; görünürlük = mevcut sistem yöneticisi audit görünürlüğü; fiziksel kaynak sahibi tenant audit kapsamını belirlemez. |
| **Q-SA04 / D4** | — | Yalnızca güvenli katalog referansı; bilinen kaynak için katalog UUID’si; kapsam dışı/bilinmeyen kaynak için source key **null**; sınırlı metadata: `rowCount`, `columnCount`, `durationMs`, `limitReason`; tarih aralığı, kolon/tablo adı, ham filtre, SQL, kaynak credential tutulmaz; audit nesnesi **allowlist ile** oluşturulur (yalnızca `scrubSecrets`’a güvenilmez). |
| **Q-SA05 / Q-AD01** | **A** | İlk aşamada mevcut **`platform_audit_logs`**; yeni SCADA audit tablosu/migration yok; başarı/ret/hata aynı sözleşmeyle; hacim artarsa partition/retention ayrı karar. |
| **Q-SA06 / D6** | — | **D6.1** limit aşımı (satır, payload, eşzamanlılık, politika) = `DENIED`. **D6.2** her başarılı sorgu audit edilir (örnekleme yok). **D6.3** audit yazımı başarısızsa işlem **fail-closed** sonlanır; sonuç kullanıcıya dönülmez. **D6.4** eşzamanlılık reddi audit edilir. **D6.5** iptal edilen sorgular audit edilir, sonuç durumu `CANCELLED`; audit SQL/satır/credential/ham kaynak bilgisi içermez. |
| **Q-SA07 / D7** | **A** | Correlation/event ID **sunucuda ortak mekanizmayla** üretilir; istemci header’ı güvenilir event ID değildir; aynı ID servis, audit ve uygulama log zincirinde kullanılır. |
| **Q-SR01** | **B** | **Katmanlı redaction**: önce allowlist ile nesne kurma; hassas anahtar maskeleme; değer içine gömülü bilinen connection string / Bearer token / credential desenlerinin maskelenmesi; `rawSql`, `schemaName`, `server`, `datasource`, `uid` redakte; `userId`, `targetUserId`, `tenantId` gibi meşru kimlikler yanlış pozitif olarak maskelenmez. |

## Consequences

- **TASK-027.63 (katalog) uygulanabilir hale gelir** (`ready`): mekanizma kararları verildi; kaynak↔tenant **verisi** (hangi kaynak hangi operasyon tenant’ına) onaylı mapping olmadan doldurulmaz (`UNRESOLVED/BLOCKED`).
- **TASK-027.58 sözleşme testlerinin varsayımları değişir:** test-only referans model şu varsayımları taşıyordu ve karar bunları **tersine çevirir/genişletir**: (a) limit aşımı `FAILED` → artık `DENIED` (D6.1); (b) audit yazım hatası sonucu değiştirmez (fail-open) → artık **fail-closed** (D6.3); (c) audit alanları yalnızca actorId/tenantId/sourceKey/result/reasonCode/correlationId → `rowCount`, `columnCount`, `durationMs`, `limitReason` ve katalog UUID’si eklenir; (d) `sourceKey` string’i → katalog UUID’si; (e) istemci correlation id kabulü → **sunucu üretimi**; (f) tek `SCADA_READ_CONTRACT_TEST` etiketi → `SCADA_QUERY_*` üç action. Sözleşme suite ve matris **TASK-027.64 kapsamında** bu kararlara göre güncellenir; bu kayıt testleri değiştirmez.
- **Q-W501 ve SRS:** SRS FR-025/026 metni bu karara göre **ayrı bir SRS düzeltmesiyle** hizalanacaktır (bu kayıt SRS’i değiştirmez). TASK-027.65/.66’nın Q-W501 karar kapısı kapandı (zincir sırası bağımlılığı sürer); son okuma için sentetik delta yoktur.
- **Q-SR01:** paylaşılan `scrubSecrets` (audit) değer-desenli redaction ve ek anahtarlar için **genişletilecektir** — bu ek iş henüz bir task’a bağlanmamıştır (bkz. “Ek işler”).
- **Q-SP04/Q-SP04b:** identity migration kodu (`ApprovedTenantSlug`, kapsam/mapping, fixture/spec’ler) ve `dec-0014-slug-consistency.spec.ts` kayıt listesi **ayrı bir kimlik task’ında** hizalanacaktır; MOSEDAS tenant olarak oluşturulmaz, MOSB’ye otomatik eşlenmez.
- **Q-M05:** PostgreSQL read-model/cache/fan-out ilk sürümde yok; performans ölçümü toplanır ve ayrı karara girdi olur.
- **Q-W505/Q-W515:** kalıcı veri control-plane’de (Drizzle migration, DEC-0009 tenant/kompozit FK standardı, DEC-0011); data-plane’e SCADA/preset payload tablosu eklenmez.

## Ek işler (henüz task’a bağlanmadı — AI1 atar)

1. `scrubSecrets` katmanlı redaction genişletmesi (Q-SR01 B) — paylaşılan audit davranışı, ayrı task.
2. Identity migration MOSEDAS hizası (Q-SP04/04b) — kod, test, fixture, `dec-0014` kayıt listesi.
3. `DISCOVERY.md` iç çelişki düzeltmesi ve SRS FR-025/026 hizası (Q-W501) — doküman düzeltme task’ı.
4. TASK-027.58 sözleşme/matris güncellemesi — TASK-027.64 içinde.

## Explicit non-decisions (bu kararlarla **kapanmayan** noktalar — yeni açık sorular)

- **Q-W516** Katalog/allowlist **yönetim** yetkisi: “daha yüksek yetkili platform operasyon kapsamı” **mevcut hangi izin/rolle** ifade edilecek (yeni kod uydurulmaz).
- **Q-W517** `TENANT_SHARED` preset’i **paylaşma/yönetme** yetkisi hangi mevcut izinle sınırlanacak.
- **Q-W518** **Tenant saat dilimi** kaynağı: `tenants` tablosunda saat dilimi alanı yok; nereden gelecek (yeni alan/migration bir task ister).
- **Q-W519** Katalog, sanal kolon ve preset **değişiklik** audit’i için action/entity adları (`SCADA_QUERY_*` yalnızca sorgular içindir); formül **metninin** audit’e yazılıp yazılmayacağı.
- **Q-W520** `CANCELLED` sonucunun hangi action koduyla (üç action tanımlı) ve hangi `reasonCode` sözlüğüyle audit edileceği (limit aşımı artık `DENIED`).
- **Q-W521** Sorgu tamponu ve sınır kuralları için **sayısal/kural değerleri** (BOTC referansı: +2 saat tampon, +30 dk, 59. dakika +1 dk) — sözleşmede tanımlanacak, değer onayı gerekir.
- **Q-W522** Tanımlı devri olmayan **negatif farkın çıktıdaki değeri** (ham negatif korunur mu, null mu) ve tüketicilerin (istatistik, grafik) davranışı.
- Q-S03 (fiziksel kaynak ↔ operasyon tenant mapping **verisi**) açık kalır; mapping onayı gelmeden kaynak girdisi `UNRESOLVED/BLOCKED`.
- BR-006 (PDF/XLSX’in ilgili rapor için ayrıca onayı) ve Jasper şablon/renderer Java değişikliği onayı değişmedi.
