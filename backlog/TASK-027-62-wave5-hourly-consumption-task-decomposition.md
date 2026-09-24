---
id: TASK-027.62
title: Wave 5 Hourly Consumption Task Decomposition
status: done
srs_refs: [FEAT-008, FEAT-009, FEAT-010, FEAT-011, FEAT-012, FEAT-013, FEAT-014, FEAT-015, FEAT-016, FEAT-017]
parent_epic: EPIC-004
related: [TASK-027.58, TASK-027.58-R1, TASK-027.59, DEC-0014]
updated_at: 2026-09-23
---

# TASK-027.62: Wave 5 Hourly Consumption Task Decomposition

## Durum

done (AI1 onayı 2026-09-23) — **planlama görevi; production kodu, migration, test kodu yazılmadı.** Ürettiği 13 alt task dosyasının tamamı `planned`tır; **hiçbiri `ready` değildir** (adapter implementasyonu dahil; TASK-027.58-R1 blocker’ları çözülmeden `ready` yapılmaz).

## Amaç

TASK-027.58-R1 sonrasında uygulanacak Wave 5 analiz işlerini, bağımlılıkları ve kabul kriterleriyle ayrı backlog task dosyalarına bölmek. AI1 bu dosyaları sırayla review edip implementation görevlerini tek tek `ready` yapacaktır.

## Sonuç: 13 task dosyası ve zorunlu zincir

```text
SCADA Kaynak / Tablo / Kolon Kataloğu
 → SQL Server Read-only Adapter
 → Analysis Query Service
 → Saatlik / Günlük Aggregation Engine
 → Sayaç Devri ve Veri Kalite Servisi
 → Çoklu Seri ve İstatistikler
 → Dönem ve Veri Kaynağı Karşılaştırması
 → Governed Virtual Columns
 → Kayıtlı Analiz Preset’leri
 → Hourly Consumption API Entegrasyonu
 → Gerçek Hourly Consumption Analiz Ekranı
 → Export ve Jasper Entegrasyonu
 → E2E Kabul
```

| # | Task | Başlık | Dosya | Karar kapıları (özet) |
|---|---|---|---|---|
| 1 | TASK-027.63 | SCADA Kaynak / Tablo / Kolon Kataloğu | `backlog/TASK-027-63-scada-source-catalog.md` | Q-SP01, Q-W515, Q-SC01, Q-S03, Q-SP04/Q-SP04b, Q-E04, Q-M03/Q-W511, Q-W503, Q-SA01–07 |
| 2 | TASK-027.64 | SQL Server Read-only Adapter | `backlog/TASK-027-64-sqlserver-readonly-adapter.md` | Q-SP01, Q-SP02, Q-SA01–07, Q-M05, Q-SC02, Q-E04, Q-W512, Q-AD01 |
| 3 | TASK-027.65 | Analysis Query Service | `backlog/TASK-027-65-analysis-query-service.md` | Q-SC03, Q-W501, Q-W512, Q-SP02, Q-M05, Q-W511 |
| 4 | TASK-027.66 | Saatlik / Günlük Aggregation Engine | `backlog/TASK-027-66-hourly-daily-aggregation-engine.md` | Q-W501, Q-W503, Q-W502, Q-W512 |
| 5 | TASK-027.67 | Sayaç Devri ve Veri Kalite Servisi | `backlog/TASK-027-67-counter-rollover-data-quality.md` | Q-W502, Q-W503, Q-SA01–07 |
| 6 | TASK-027.68 | Çoklu Seri ve İstatistikler | `backlog/TASK-027-68-multi-series-statistics.md` | Q-W509, Q-W510 |
| 7 | TASK-027.69 | Dönem ve Veri Kaynağı Karşılaştırması | `backlog/TASK-027-69-period-and-source-comparison.md` | Q-W507, Q-W508, Q-W512, Q-W511 |
| 8 | TASK-027.70 | Governed Virtual Columns | `backlog/TASK-027-70-governed-virtual-columns.md` | Q-W504, Q-W505, Q-W506, Q-M03/Q-W511, Q-SA01–07, Q-DP* |
| 9 | TASK-027.71 | Kayıtlı Analiz Preset’leri | `backlog/TASK-027-71-saved-analysis-presets.md` | Q-W505, Q-W506, Q-DP*, Q-M03/Q-W511, Q-SA01–07 |
| 10 | TASK-027.72 | Hourly Consumption API Entegrasyonu | `backlog/TASK-027-72-hourly-consumption-api-integration.md` | Q-W511, Q-SC03, Q-SA01–07, Q-SP02 |
| 11 | TASK-027.73 | Gerçek Hourly Consumption Analiz Ekranı | `backlog/TASK-027-73-hourly-consumption-analysis-screen.md` | Q-W509, Q-W510, Q-W506 |
| 12 | TASK-027.74 | Export ve Jasper Entegrasyonu | `backlog/TASK-027-74-analysis-export-jasper-integration.md` | Q-W513, Q-W511, Q-SC03, Q-SA01–07 |
| 13 | TASK-027.59 | Wave 5 Uçtan Uca Kabul (E2E / Security / Performance) | `backlog/TASK-027-59-wave5-end-to-end-acceptance.md` | Q-W514, Q-SP02, Q-SP01, Q-SA01–07, Q-SP04/Q-SP04b |

Her dosya zorunlu 19 alanı (Task ID, başlık, durum, amaç, ön koşullar, kapsam, kapsam dışı, bağımlılıklar, olası dosyalar, API/UI/veri sözleşmesi, tenant/permission, audit/güvenlik, test senaryoları, mutasyon testleri, kabul kriterleri, rollback, sonraki task, gerçek ortam gereksinimi, açık sorular) ve “BOTC referansı / ortak sınırlar” bölümlerini taşır (otomatik doğrulandı).

## ID çakışma kontrolü ve eşleme tablosu

**Bulgu:** Orijinal Wave 5 yer tutucuları TASK-027.31–027.47 ID’lerinde, AI1 talimatlarıyla **başka işlere yeniden tanımlanmıştır** (ör. 027.31 “SCADA/DMS source catalog” → registry state safety). Dosya adları eski yer tutucu adlarını taşır ama içerik/ID başka işe aittir (orijinal yer tutucu metinleri o dosyaların altında tarihi kayıt olarak durur). Bu nedenle Wave 5 işleri **yeni numaralarla** açıldı; eski dosyalara **dokunulmadı**. TASK-027.62–027.79 aralığı boştu (grep ile doğrulandı). Tek istisna: **TASK-027.59** hâlâ orijinal E2E yer tutucusu (`planned`) olduğundan, aynı ID/kapsamla şablona göre **yerinde genişletildi** (ikinci dosya açılmadı).

| Orijinal Wave 5 yer tutucusu (kapsam) | Bugün bu ID’yi tutan iş | Yeni Wave 5 task’ı |
|---|---|---|
| 027.31 SCADA DMS source catalog | Customer schema registry state safety (done) | **027.63** |
| 027.32 SQL Server readonly connection provider | Data-plane foundation / pgSchema (done) | **027.64** |
| 027.33 Source table column allowlist | Data-plane port/ledger karar paketi (done) | **027.63** (allowlist) |
| 027.34 Dynamic query contract | Data-plane hedef ortam readiness (done) | **027.65** |
| 027.35 Tenant scope adapter integration | ROOT provisioning tutarlılığı (done) | **027.64 / 027.65** |
| 027.36 Query timeout / row / export limits | Platform tenant UI ROOT sınırı (done) | **027.64** (timeout/limit), **027.74** (export limit) |
| 027.37 Hourly analysis engine | Customer ROOT provisioning UI (done) | **027.66** |
| 027.38 Daily analysis engine | Parola policy hardening (done) | **027.66** |
| 027.39 Index real value calculations | Platform DTO validation (done) | **027.66** |
| 027.40 Analysis statistics | MFA/Settings/Perf validation (done) | **027.68** |
| 027.41 Virtual column domain model | Endpoint authorization audit (done) | **027.70** |
| 027.42 Virtual column formula validator | Platform user-admin privilege (done) | **027.70** |
| 027.43 Virtual column dependency resolution | Q-DP24 karar paketi (done) | **027.70** |
| 027.44 Central report preset model | Q-DP24 kapanış formu (review) | **027.71** |
| 027.45 Multi-series chart scale | Privilege canonical source (done) | **027.68** |
| 027.46 Period comparison | Role assignment privilege ceiling (done) | **027.69** |
| 027.47 Second source comparison | Eş sistem yöneticisi/break-glass (done) | **027.69** |
| (048→054) Reporting web analysis screen | 027.54 (done, **generic** tutar zaman serisi) | **027.73** (gerçek Hourly Consumption ekranı) |
| (049→055/056) CSV·PNG / PDF·XLSX export | 027.55, 027.56 (done, generic) | **027.74** (analiz sonucuna bağlama) |
| (051→057) Export permission audit | 027.57 (done) | **027.74** (kontratı kullanır) |
| (052→058) SCADA security/performance tests | 027.58 + R1 (done) | 027.64 ve 027.59 (sözleşmeyi gerçek adapter’a karşı koşturur) |
| (053→059) Wave 5 E2E acceptance | 027.59 (planned) | **027.59** (aynı ID, genişletildi) |

> **Not:** `EPIC-004` “Task ID normalizasyonu” notundaki numaralar ile dosya sistemindeki gerçek kimlikler birebir örtüşmüyor (örn. EPIC “tenant-role delegation artık 027.54” derken dosyada 027.49 done, 027.54 analiz ekranı). Bu belge **dosya sistemindeki gerçek kimlikleri** esas aldı; EPIC metni değiştirilmedi (AI1 kararı).

## Mevcut teslimlerle ilişki (yeniden yazılmaz)

- **027.54–027.57 (done):** generic `ReportDatasetRow` (tutar zaman serisi) üzerinde analiz ekranı, `GET /reports/:code/data`, CSV/PNG (istemci), PDF/XLSX (Jasper), export izni + audit. Hiçbir SCADA verisi/analiz mantığı yok (DEC-0012: provider kayıtlı değil). Yeni task’lar bunların **üstüne** kurulur; generic ekran/export silinmez.
- **027.58 + R1 (done):** SCADA read-only güvenlik/performans **sözleşmesi** (105 test + audit matrisi) ve test-only referans model. **Gerçek adapter yok** → sözleşme 027.64’te gerçek adapter’a karşı koşturulur.

## BOTC `HourlyConsumptionWindow` davranışı ↔ SRS ↔ Metnex karşılaştırması

| Davranış | BOTC (kaynak koddan okundu) | SRS | Metnex planı |
|---|---|---|---|
| Saatlik Endeks farkı | SQL `LEAD(kolon,1,kolon) OVER (ORDER BY zaman) − kolon`; satır t = **sonraki okumaya kadar** tüketim; son satır 0; negatif → 0 | FR-025: saatin **son endeksi − ilk endeksi** | **ÇELİŞKİ → Q-W501** (027.66 bloklu) |
| Günlük Endeks | saatlik farkların `SUM`’ı; gün = `CAST(zaman AS DATE)` | FR-026: günün son − ilk endeksi | Q-W501 |
| Gerçek Değer | “Fark” = ham değer; günlük `SUM`; **herhangi bir** kolon Gerçek Değer ise gün anahtarı `−30 dk`; varsayılan tip 3 tablo adına sabit | FR-030 + **BR-004** (PO doğrulaması olmadan genişletilmez) | Q-W503 |
| Sorgu penceresi | bitiş dk=59 ise +1 dk; sorguya **+2 saat tampon**; sonuçta tam başlangıç gününden önce/bitişten sonra satırlar atılır | FR-029 | Q-W512 / 027.65 |
| Sayaç devri | SQL negatif→0 **ve** istemci `FixCounterRollover` (`<−50 → +100000`, yalnızca adı `Turbin`/`Fark`/`(S)` olan kolonlar) | yok | Q-W502 (027.67) |
| Sanal kolon | A,B,C… değişken; `DataTable.Compute` ifade dili; kayıtta `IIF(x<0,0,x)` sarmalı; sonuç NaN/∞/negatif/`>50000` → 0; 10 turluk bağımlılık döngüsü; sahip=`Environment.UserName`; yerel JSON | FR-031…038, **TBD-W5-001…004** | Q-W504, Q-W505 (027.70) |
| Preset | yerel `HourlyPresets.json`; kaynak/tablo/aralık(yok)/kolon+değer tipi+özel maks; ikinci kaynak/dönem **kaydedilmez** | FR-057…061 (merkezi, kişisel), **TBD-W5-006** | Q-W505, Q-W506 (027.71) |
| Dönem karşılaştırma | **pozisyonel** satır eşleme (`i`. satır ↔ `i`. satır), `(Kıyas)` sütunları | FR-047…050 | Q-W507 (027.69) |
| İkinci kaynak | pozisyonel eşleme, `(Ek)` sütunları; tarih kolonunu ana kaynaktan ödünç alır | FR-051…053, **BR-005 TBD** | Q-W508 (027.69) |
| İstatistik | toplam/max/min; **min yalnızca >0 değerlerden**, yoksa 0; null atlanır | FR-054…056, **TBD-W5-005** | Q-W509 (027.68) |
| Ölçek | seri başına Y-ekseni; üst sınır `max×(1.5+i×0.5)`, alt `−%5`, adım 1/10/100/limit÷5; özel max `max>özel` veya `max<özel/15` ise **otomatik sıfırlanır** | FR-041…043 | Q-W510 (027.68) |
| Yetki | UI `Can*` izinleri; servis/SQL katmanında yetki yok | SEC-DATA-001/002, AC-004 | backend allowlist + scope + guard (027.63/.64/.72) |
| Erişim | UI’dan gelen connection string, string-birleştirmeli SQL, çalışma zamanı `INFORMATION_SCHEMA` | FR-015, SEC-DATA-001/002 | **taşınmaz**; katalog + parametreli adapter |
| Export | `;` ayraçlı CSV (`F2`), `RenderTargetBitmap` PNG | FR-062/063, BR-006 | 027.74 (Q-W513) |

**Doğrudan taşınmayanlar:** WPF code-behind ve pencere yönetimi, `%APPDATA%` yerel JSON (preset/sanal kolon), ham SQL string üretimi, tarayıcıdan/UI’dan şema keşfi, `DataTable.Compute`, sabit sayılı sezgiler (`−50`, `100000`, `50000`), isim tabanlı kurallar, pozisyonel eşleme, `Environment.UserName` sahipliği, UI’da hesap.

## Yeni açık sorular (BOTC_MIGRATION_OPEN_QUESTIONS.md’ye append edildi)

| Soru | Konu | Etkilenen task’lar |
|---|---|---|
| **Q-W501** | Endeks saatlik delta semantiği: BOTC `LEAD(sonraki) − mevcut` ↔ SRS FR-025 “saatin son − ilk endeksi” | 027.65, 027.66 |
| **Q-W502** | Sayaç devri/reset kuralı ve veri kalite bayrakları (BOTC: SQL negatif→0 + istemci `<−50 → +100000`, ad tabanlı) | 027.66, 027.67 |
| **Q-W503** | Gerçek Değer davranışı (BR-004): günlük −30 dk kayması, SUM vs ortalama, tablo-adı tabanlı varsayılan | 027.63, 027.66, 027.67 |
| **Q-W504** | Sanal kolon kuralları: operatör/fonksiyon, sıfıra bölme/null/negatif/NaN/∞, sonuç sınırı, derinlik (TBD-W5-001..004) | 027.70 |
| **Q-W505** | Sanal kolon ve preset saklama yeri (control-plane mı data-plane mi), sahiplik, paylaşım, kullanıcı silinince | 027.70, 027.71 |
| **Q-W506** | Preset kapsamı: karşılaştırma ve ölçek ayarı kaydı; aynı ad üzerine yazma; göreceli aralık | 027.70, 027.71, 027.73 |
| **Q-W507** | Dönem karşılaştırması eşleme kuralı (BOTC pozisyonel satır eşleme), farklı uzunluk | 027.69 |
| **Q-W508** | İkinci kaynak zaman eşleme (BR-005 TBD) | 027.69 |
| **Q-W509** | İstatistik kuralı: minimum yalnız >0 mı (TBD-W5-005), null/boş davranışı | 027.68, 027.73 |
| **Q-W510** | Ölçek kuralları: BOTC otomatik limit formülü ve özel maksimum sıfırlama birebir mi (FR-043) | 027.68, 027.73 |
| **Q-W511** | Analiz yetkisi: mevcut `REPORT:ARTIFACT:VIEW/EXPORT` yeterli mi, SCADA’ya özel izin mi (yeni izin uydurulmaz) | 027.65, 027.69, 027.72, 027.74 |
| **Q-W512** | Zaman modeli: saat dilimsiz `datetime`, tarih+saat birleştirme, DST, sınır ve tampon kuralları | 027.64, 027.65, 027.66, 027.69 |
| **Q-W513** | Export için çok-seri veri şeması (`ReportDatasetRow` finans-şekilli), PDF’te grafik, XLSX düzeni | 027.74 |
| **Q-W514** | E2E kabulün gerçek (test) SQL Server/PostgreSQL/Jasper/tarayıcı ortamı gerektirmesi ve onayı | 027.59 |
| **Q-W515** | Katalog/allowlist veri modeli ve yönetimi (config mi DB mi, kim değiştirir, kaynak↔tenant eşleme kaynağı) | 027.63 |

Mevcut açık sorular tekrar açılmadı, atıf yapıldı: Q-SP01, Q-SP02, Q-SP04/04b, Q-SA01–07, Q-SR01, Q-SC01–03, Q-S03, Q-M03, Q-M05, Q-E04, Q-AD01.

## Gerçek DB / SQL Server / Docker gereksinimi (özet)

| Task | Gereksinim |
|---|---|
| TASK-027.63 | Hayır. |
| TASK-027.64 | Kod ve testler için hayır (mock sürücü). |
| TASK-027.65 | Hayır (mock adapter). |
| TASK-027.66 | Hayır. |
| TASK-027.67 | Hayır. |
| TASK-027.68 | Hayır. |
| TASK-027.69 | Hayır (mock adapter/saf hesap). |
| TASK-027.70 | Kod/test için hayır (mock DB). |
| TASK-027.71 | Kod/test için hayır (mock DB). |
| TASK-027.72 | Hayır (mock adapter/DB). |
| TASK-027.73 | Hayır (API mock’lanır). |
| TASK-027.74 | Kod/test için hayır. |
| TASK-027.59 | Seviye A (sınır-mock’lu): hayır. Seviye B (test SQL Server, PostgreSQL, Jasper, tarayıcı): evet — yalnızca açık kullanıcı onayıyla (Q-W514). |

Hiçbir task için **bu planlama görevinde** gerçek bağlantı, Docker veya secret kullanılmadı.

## Hazırlık durumu ve blocker’lar

- **Hepsi `planned`.** Adapter (TASK-027.64) ve ondan sonrası, TASK-027.58-R1 blocker’ları (**Q-SP01**, **Q-SA01–07**) ve ilgili karar kapıları çözülmeden `ready` yapılmaz.
- **İlk aday:** TASK-027.63 (katalog) — yalnızca Q-SP01, Q-W515, Q-SC01/Q-S03, Q-SP04 kararları verildiğinde `ready` olabilir.
- **Erken karar isteyen konular:** Q-W501 (saatlik delta tanımı; aggregation ve sorgu penceresini belirler), Q-W503/BR-004, Q-W505 (saklama yeri; iki task’ı etkiler), Q-W511 (yetki modeli; API/UI/export’u etkiler).

## Değişen / oluşturulan dosyalar

- Yeni (13): 12 alt task (`backlog/TASK-027-63-…` … `backlog/TASK-027-74-…`, yukarıdaki tablo) + `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md` (bu dosya).
- Yerinde genişletildi (1): `backlog/TASK-027-59-wave5-end-to-end-acceptance.md` (aynı ID/kapsam, `planned`).
- Append: `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` (Q-W501–Q-W515), `docs/opendevcon/METNEX_STATE.md`, `docs/opendevcon/PROGRESS_LOG.md`.
- Değişmeyen: eski Wave 5 yer tutucu dosyaları (027.31–027.47), EPIC-004, tüm production/test kodu.

## Doğrulama

Yalnızca doküman değişti. Otomatik kontrol: 13 dosyanın hepsinde 19 zorunlu bölüm var ve `status: planned`. `./scripts/check.sh --skip-docker` sonucu teslim raporunda.

## Karar kapanışları sonrası durum (2026-09-23, AI1/PO — append)

Bu dosyanın yukarıdaki “Hazırlık durumu” bölümü karar kapanışlarından **önceki** durumu anlatır. AI1/PO karar kapanışları `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md` ve `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` içine işlendi; task dosyaları buna göre güncellendi (ID/zincir/sıra değişmedi).

| Task | Durum | Kalan noktalar (ready öncesi / task içi) |
|---|---|---|
| TASK-027.63 SCADA Catalog | **ready** | Q-W516 (yazma yüzeyi açılmaz), Q-W519 (audit adları), Q-S03 (mapping verisi) — engel değil |
| TASK-027.64 Read-only Adapter | planned | 027.63 done; Q-W520; sürücü onayı |
| TASK-027.65 Query Service | planned | 027.64 done; Q-W521 |
| TASK-027.66 Aggregation | planned | 027.65 done; Q-W521, Q-W522 |
| TASK-027.67 Sayaç Devri/Veri Kalite | planned | 027.66 done; Q-W522; kalite sözlüğü |
| TASK-027.68 Multi-Series/İstatistik | planned | 027.67 done; Q-W522; özel ölçek sınırları kaynağı |
| TASK-027.69 Karşılaştırma | planned | 027.68 done |
| TASK-027.70 Virtual Columns | planned | 027.69 done; Q-W519; izinli operatör/limit listesi |
| TASK-027.71 Presets | planned | 027.70 done; Q-W517, Q-W519 |
| TASK-027.72 API | planned | 027.71 done; Q-W516/W517/W520; PackageFeature; yollar/DTO |
| TASK-027.73 Analiz Ekranı | planned | 027.72 done; **Q-W518** (tenant saat dilimi kaynağı); Q-W517; route/yoğunluk |
| TASK-027.74 Export/Jasper | planned | 027.73 done; BR-006; Jasper şablon onayı |
| TASK-027.59 E2E Kabul | planned | 027.74 done; sentetik veri seti; servis/Docker onayı |

**Yeni açık sorular:** Q-W516–Q-W522. **Karardan doğan ek işler (task’a bağlanmadı):** `scrubSecrets` katmanlı redaction (Q-SR01 B), identity migration MOSEDAS hizası (Q-SP04/04b), `DISCOVERY.md` ve SRS FR-025/026 doküman düzeltmeleri, TASK-027.58 sözleşme/matris güncellemesi (TASK-027.64 içinde).

> **Güncelleme (2026-09-23, appsettings envanteri):** TASK-027.63 dosyası BOTC `appsettings.json` başlangıç envanteriyle (8 kaynak, 7 tarih/saat eşlemesi, Debug/Release farkı, credential non-transfer, MOSEDAS tenant dışı kuralı) genişletildi ve `ready` → **`review`** yapıldı; envanter/sözleşme turu tamamlandı, katalog implementation’ı AI1 onayıyla sonraki turdur. Yeni açık sorular: Q-W523–Q-W525. TASK-027.64+ `planned`.
