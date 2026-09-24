---
id: TASK-027.74
title: Export ve Jasper Entegrasyonu
status: planned
srs_refs: [FR-062, FR-063, FR-012, FR-013, BR-006, SEC-EXPORT-001, AC-022, AC-023, AC-024]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.74: Export ve Jasper Entegrasyonu

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.74

## Başlık

Export ve Jasper Entegrasyonu

## Durum

planned

## Amaç

Gerçek analiz sonucunu CSV/PNG (istemci) ve PDF/XLSX (Jasper renderer, TASK-027.56 sözleşmesi) olarak dışa aktarmak; export yetkisini görüntüleme yetkisinden bağımsız uygulamak ve TASK-027.57 audit sözleşmesine bağlamak.

## Ön koşullar

- TASK-027.73 `done`. Mevcut generic export (027.55–.57) korunur, yeniden yazılmaz.
- **Kapanan karar kapıları:** Q-W513, Q-W511, Q-SC03, Q-SA01–07.
- **Kalan (ready olmadan önce):** BR-006 (PDF/XLSX’in ilgili rapor için ayrıca onayı), Jasper şablonu/renderer Java değişikliği onayı, CSV ayraç/biçim kararı.

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W513 C:** grafik, tablo, CSV, PNG, PDF, XLSX **aynı versiyonlu normalize analiz sonucunu** tüketir (zaman kovası, seri, ham, analiz, karşılaştırma, kalite durumu tipli alanlar); formatlar kendi sunum düzenine sahip olabilir, hesap tek sözleşmeden.
- **Q-W511 C:** export mevcut `REPORT:ARTIFACT:EXPORT` ile; yeni permission yok. **Q-SC03 B:** `ReportDatasetRow` ile sınırlı kalınmaz.

## Kapsam

- Export girdisi **versiyonlu normalize analiz sonucu sözleşmesidir** (Q-W513 C); satır dönüşümü renderer sözleşmesine (`templateId` allowlist, `rows` limitleri) uyarlanır ve `ReportDatasetRow` finans şekliyle **sınırlı kalınmaz**; formatlar yalnızca sunum düzeninde farklıdır, hesap yeniden yapılmaz.
- Yeni Jasper şablonu **gerekiyorsa** allowlist (API + renderer) ve JRXML sandbox kurallarına uygun; **şablon ve renderer Java kodu değişikliği ayrı onay** ister (bu task’ın kapsamı dışında tutulur, gerekirse ayrı task).
- CSV: BOTC biçimi (`;` ayraç, `dd.MM.yyyy HH:mm`, `F2`) **karar konusudur** (locale ve ayraç); mevcut `csv-export.ts` sözleşmesi korunur/uyarlanır.
- PNG: mevcut `png-export.ts`; çok-seri/çok-eksenli grafiğin rasterize doğrulaması.
- İzin: export, VIEW’den bağımsız (SEC-EXPORT-001, AC-024); denial ve success/failure audit’i TASK-027.57 kalıbıyla (`REPORT_EXPORT_*`), SCADA’ya özel audit eklemesi Q-SA kararına bağlı.
- Geliştirme simülasyon verisi (varsa) production audit’ine girmez; fixture sağlayıcısı production’da kayıtlı değildir (DEC-0012).

## Kapsam dışı

- Yeni permission kodu (mevcut `REPORT:ARTIFACT:EXPORT`), yeni audit tablosu, Jasper Java kodu değişikliği (ayrı onay).
- Zamanlanmış/e-postalı export, toplu export.
- Kaynak SQL Server’a export/yazma.

## Bağımlılıklar

TASK-027.73. Sonraki: TASK-027.59 (E2E kabul).

Zincir: `TASK-027.73` → **TASK-027.74** → `TASK-027.59`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/reporting.service.ts + template kayıtları (yalnızca gerekirse)
- apps/api/src/reporting/templates/* ve services/jasper-renderer/src/main/resources/templates/* (**yalnızca ayrı onayla**)
- apps/web/src/app/(app)/app/reports/... export bileşenleri, csv-export.ts, png-export.ts
- docs/runbooks/reporting-foundation.md

## API/UI/veri sözleşmesi

- **API:** mevcut `GET /reports/:code/export/:format` sözleşmesi; analiz sonucu için giriş yolu (yeni endpoint yalnızca AI1 onayıyla).
- **Veri:** analiz sonucu sözleşmesi → CSV/PNG/PDF/XLSX eşlemesi; renderer satır/gövde limitleri mevcut sabitlerle (5000 satır / 10 MB; yeni sayı uydurulmaz). Sonuç sözleşmesinin sürümü export çıktısında izlenebilir.
- **UI:** export düğmeleri izin görünürlüğü sözleşmesine uyar; UI güvenlik sınırı değildir.

## Tenant ve permission kuralları

- Export, yalnızca çağıranın zaten yetkili olduğu ve scope içindeki sonucu içerir; başka tenant satırı asla dosyaya girmez (test).
- Kaynak sahipliği/yetkisi export anında yeniden doğrulanır.

## Audit ve güvenlik kuralları

- TASK-027.57 kontratı: izin reddi provider/render öncesi audit’lenir; başarı yalnızca dosya üretildikten sonra; hata `REPORT_EXPORT_FAILED` statik reason code’la; audit yazım hatası sonucu çevirmez.
- Metadata izinli alanlarla; satır içeriği, SQL, renderer token’ı, ham hata metni yok. CSV/PNG istemci-üretimli olduğundan “tıklandı” olayı audit’lenmez (TASK-027.57 belgeli sınırı) — değişecekse ayrı karar/endpoint onayı.

## Test senaryoları

1. Yetki: export izni olmayan ama VIEW izinli kullanıcı export edemez (AC-024); izin reddi render/provider öncesi.
2. Jasper/fallback yolları: her ikisi audit’lenir; renderer hataları güvenli reason code; timeout/4xx/5xx ayrımı.
3. İçerik: PDF/XLSX gerçek bayt doğrulaması (`%PDF-`, `PK`), CSV biçimi, PNG gerçek raster; çok-seri düzeni.
4. Tenant izolasyonu (Tenant A export’unda Tenant B verisi yok), impersonation kuralları, satır/gövde limit reddi.
5. Gerçek Jasper konteynerine karşı test **yalnızca kullanıcının zaten çalışan dev renderer’ına** (Docker build/run yok) ve açık onayla.
6. Tutarlılık: aynı sonuçtan üretilen grafik/tablo/CSV/PDF/XLSX sayısal olarak aynıdır (hesap sonucu tek sözleşmeden); kalite durumları formatlarda kaybolmaz.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Export izin kontrolü kaldırılınca AC-024 testi kırılır.
2. Tenant scope kaldırılınca izolasyon testi kırılır.
3. Başarı audit’inin dosya üretiminden önceye alınması testi kırar.
4. Audit hatasının sonucu çevirmesi testi kırar; credential redaction kaldırılınca sızıntı testi kırar.

## Kabul kriterleri

- CSV/PNG/PDF/XLSX analiz sonucundan üretilir; export yetkisi VIEW’den bağımsızdır; audit kontratı korunur.
- Jasper şablon/renderer değişikliği gerekiyorsa ayrı onaylı task olarak ayrılmıştır (bu task’ta yapılmamıştır).
- Hiçbir dosyada secret/SQL/başka tenant verisi yoktur; `check.sh --skip-docker` geçer; Jasper/E2E doğrulaması kapsamı açıkça raporlanır.

## Rollback yaklaşımı

Analiz→export bağlantısı kaldırılır; generic export (027.55–.57) etkilenmez. Şablon eklenmişse allowlist girdisi çıkarılır. Migration yok.

## Sonraki task

TASK-027.59

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Kod/test için **hayır**. Gerçek renderer doğrulaması yalnızca çalışan dev Jasper’a ve açık onayla; Docker build/run yok; SQL Server yok.

## AI1/PO kararı gerektiren açık sorular

- BR-006 (PDF/XLSX ayrıca onay)
- CSV ayraç/biçim kararı
- Jasper şablonu/Java değişikliği onayı

## BOTC referansı

- **Referans davranış:** `btnExportCSV_Click` (`;`, `F2`), `btnExportChart_Click` (PNG), `Reports` (yazdırma).
- **Taşıma sınırı:** Taşınmaz: `SaveFileDialog`, WPF `RenderTargetBitmap`, istemcide dosya yazımı ile yetki kontrolü, kullanıcı makinesinde dosya yolu.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Export sınırı notu (TASK-027.72)
027.72 export uçlarına dokunmadı: `REPORT:ARTIFACT:EXPORT` ve mevcut `GET /reports/:code/export/:format` olduğu gibi kalır. Analiz/karşılaştırma yanıtları (whitelist projeksiyon) export girdisi için tek izinli kaynaktır: export iç domain nesnesi veya ham kaynak satırı değil bu projeksiyonu kullanmalı; ifade, fiziksel ad ve credential export'ta da bulunmaz. Export ayrı izin (EXPORT), mevcut `REPORT_EXPORT_*` audit'i ve aynı MFA/tenant zincirinden geçer.

## 2026-09-24 — Teslim notu
Bu planlama taslağı, `ready` spec'e göre `backlog/TASK-027-74-scada-analysis-export.md` ile teslim edilmiştir (`review`). Bu dosyanın `planned` durumu ve içeriği değiştirilmedi; "Jasper şablonu/Java değişikliği ayrı onay" maddesi için Q-W542 açıktır.
