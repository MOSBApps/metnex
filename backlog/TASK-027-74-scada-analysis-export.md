---
id: TASK-027.74
title: SCADA Analysis Export ve Jasper/PDF/XLSX Entegrasyonu
status: done
parent_epic: EPIC-004
related: [TASK-027.55, TASK-027.56, TASK-027.57, TASK-027.71-R1, TASK-027.72-R1, TASK-027.73, TASK-027.73-R4]
updated_at: 2026-09-24
---

# TASK-027.74: SCADA Analysis Export ve Jasper/PDF/XLSX Entegrasyonu

## Durum
done (AI1 onayı, 2026-09-24)

> `backlog/TASK-027-74-analysis-export-jasper-integration.md` (`planned`) bu görevin eski planlama taslağıdır; bu dosya ready spec'e göre yapılan teslimdir. Eski dosyadaki "Jasper şablonu/Java değişikliği ayrı onay" maddesi için bkz. **Q-W542**.

## Amaç
SCADA analiz ekranındaki gerçek CSV sonucunu (ve development sanal kolonlarını) CSV / PNG / PDF / XLSX olarak dışa aktarmak; mevcut export altyapısı (export-guard, Jasper renderer, `REPORT_EXPORT_*` audit, `REPORT:ARTIFACT:EXPORT`) korunur, yeni permission / audit action / renderer yok.

## Teslim edilen

### Endpoint ve zincir
`POST /reports/:code/analysis/export/:format` (`CSV|XLSX|PDF|PNG`, büyük harf; başkası `SCADA_EXPORT_FORMAT_INVALID`). Aynı guard zinciri **JWT → MFA → tenant header → membership → PermissionGuard**, ancak **mevcut `REPORT:ARTIFACT:EXPORT`** (VIEW yetmez; ret `PermissionGuard` tarafından provider'a ulaşmadan `REPORT_EXPORT_DENIED` olarak audit'lenir).
Gövde: `{ analysis: <query gövdesi> }` **veya** `{ comparison: <compare gövdesi> }` — ekranın son başarılı çağrısının aynısı. Sunucu isteği **yeniden doğrular ve yeniden çalıştırır** (scope, kaynak kapıları, sorgu-servisi audit'i, sanal kolon değerlendirmesi); istemciden satır/tenant/actor kabul edilmez (başka alan ⇒ `SCADA_REQUEST_UNKNOWN_FIELD`).

### Export modeli (`scada/export/`)
Tek kaynak: 027.72 whitelist projeksiyonu → `ScadaExportModel` (`scada-export.model.ts`). Alanlar: zaman kovası (UTC + yerel; DST/GAP'te `null`, sahte UTC yok), seri etiketi, kaynak (görünen ad; opak catalogId değil), değer (`null` ≠ 0), birim (boşsa **"Birim belirtilmemiş"**), value type, kalite, quality flags (ayrı alan), isComplete, analysisAllowed, istatistikler, kalite özeti, karşılaştırma farkları, sanal kolon ID/sürüm(ler), aktif filtreler (aralık, kovalama, zaman dilimi, kalite filtresi, yalnız-analiz-izinli, istatistikler, kaynaklar, preset), development CSV etiketi (yalnız katalog `developmentOnly` diyorsa), sonuç durumu ve statik uyarılar (kısmi sonuç, dışlanan seri, hesaplanamayan sanal kolon, kalite uyarısı). **Expression, SQL, schema/tablo/kolon adı, connection, credential, ham provider hatası modelde yoktur** (statik tarama + test).
- **Boş sonuç** (satır yok / `BLOCKED`): `SCADA_EXPORT_EMPTY` (409), dosya yok, `REPORT_EXPORT_FAILED` audit'i.
- **CSV:** UTF-8 + BOM, CRLF, RFC 4180 tırnaklama; metin hücrede `= + - @ TAB CR` başında `'` (formül koruması), **sayı sayı olarak** yazılır (negatif fark metne dönmez); null/NaN/∞ boş hücre (0 değil); her satır kendini tanımlar (aralık, kovalama, dilim, kalite filtresi, sonuç durumu, veri etiketi sütunları); güvenli dosya adı `scada_<kod>_<tarih>.csv`.
- **XLSX** (`buildWorkbookXlsx`, mevcut `xlsx-writer.ts`'e additive çok-sayfalı yazıcı; eski `buildSimpleXlsx` davranışı aynı): sayfalar **Analysis · Statistics · Quality** (analiz) / **Comparison** (karşılaştırma); her sayfa aynı etiket/filtre bloğuyla başlar; metin formül-korumalı, sayı sayısal hücre, null **"—"**; XML-yasak kontrol karakterleri atılır; sayfa adı doğrulanır.
- **PDF:** **mevcut `ReportRenderService` (Jasper HTTP) seam'i**; yapılandırılmamışsa mevcut yerleşik fallback PDF (`buildSimplePdf`, `pdf-fallback.ts`'e taşındı, davranış aynı). Satırlar: başlık · etiket/durum/uyarılar/aktif filtreler · özet (istatistik) · kalite · veri tablosu (sanal seri `[sanal vc-1 v3]`). Renderer hatası **statik** koda iner (`SCADA_EXPORT_RENDER_FAILED` 502 / `SCADA_LIMIT_EXCEEDED`); renderer metni yanıta/audit'e girmez.
- **PNG (iki adım, AI1 düzeltmesi 2026-09-24 — seçenek 1):** (1) `POST …/export/PNG`: sunucu yetkiyi doğrular ve **başlık/filtre/kalite uyarısı/karşılaştırma/sanal seri/development etiketi** caption'ını + **tek kullanımlık `exportId`** döner; **başarı audit'i YAZILMAZ** (bayt yok). Tarayıcı `renderSvgToPngBlob` ile PNG'yi çizer. (2) `POST …/export/PNG/complete` `{exportId, outcome: SUCCEEDED|FAILED}`: aynı guard zinciri + `REPORT:ARTIFACT:EXPORT`; bildirim sunucuda kayıtlı bekleyen export'a karşı **yeniden doğrulanır** (aynı actor, tenant, artifact ve **şimdi yeniden çözülen customer root**; tek kullanımlık — reddedilen deneme de kaydı tüketir; 5 dk TTL; süreç belleği, en çok 500 kayıt). Uyuşmazlık/bilinmeyen/tekrar/süresi dolmuş ⇒ `SCADA_EXPORT_CONTEXT_INVALID` (409), audit yok. Eşleşirse `REPORT_EXPORT_SUCCEEDED` (`delivery: CLIENT_RENDERED`) yazılır; **yazılamazsa `SCADA_AUDIT_FAILED` ve tarayıcı dosyayı TESLİM ETMEZ**. Çizim hatası `FAILED` (`reasonCode: CLIENT_RENDER_FAILED`) olarak bildirilir, asla başarı değil. İstemci sırası: caption → PNG üret → completion → indir. Çizilmiş grafik yoksa istek gönderilmez ("Dışa aktarılacak grafik yok."). Sınır: bekleyen kayıtlar tek süreç belleğindedir (yeniden başlatma/çok-instance'ta completion `CONTEXT_INVALID` olur, kullanıcı yeniden dener).

### Audit (mevcut sözleşme, yeni action yok)
`REPORT_EXPORT_SUCCEEDED` / `REPORT_EXPORT_FAILED` (`entityType ReportArtifact`, `entityId` = artifact kodu), metadata: `tenantId, artifactCode, format, result, reasonCode (statik), rendererMode (JASPER|FALLBACK|NONE), source:'SCADA', kind, delivery (SERVER_FILE|CLIENT_RENDERED), rowCount, correlationId`, development'ta `simulation:true`. Filtre değeri, etiket, ad, SQL, satır, dosya yok. **Başarı yalnız dosya üretildikten sonra yazılır ve yazılamazsa `SCADA_AUDIT_FAILED` — bayt dönmez (fail-closed)**; export-audit portu yoksa her export 503. Sorgu okuması ayrıca mevcut `SCADA_QUERY_*` boundary'sinden audit'lenir (değişmedi).

### Jasper
Yeni **allowlist şablonu** `scada-analysis-report` (8 metin sütunlu, bean-fed, SQL yok; API `template-registry.ts` + `services/jasper-renderer/.../templates/` kopyaları birebir aynı, testle) ve renderer `RenderRow` DTO'suna **additive opsiyonel** `kind,c1..c8` alanları (mevcut şablonlar etkilenmez). Yeni renderer/servis yok. Bkz. **Q-W542**.

### Web
`scada-export-client.ts` + `report-analysis-client.tsx`: SCADA sonucunda **dört düğme de** `REPORT:ARTIFACT:EXPORT` yoksa render edilmez (UI güvenlik sınırı değildir); son başarılı sorgunun gövdesi tutulur, tenant değişiminde temizlenir; boş/BLOCKED sonuçta istek gönderilmez; hatalar statik Türkçe mesaj (sunucu metni gösterilmez); **çift export** `export-guard.ts` (`tryRunAsync`) ile export yolunun içinde engellenir. Eski dataset (legacy) ekranı CSV/PNG/PDF/XLSX davranışı değişmedi. `lib/api.ts`'e additive `tenantApiDownloadPost`.

## Testler
- API: `scada/export/__tests__/scada-export-builders.spec.ts` (23), `api/__tests__/scada-export-api.spec.ts` (53; gerçek CSV fixture üzerinde CSV/XLSX/PDF/PNG, sanal kolon, kalite bayrağı, null≠0, karşılaştırma, development etiketi, boş sonuç, audit fail-closed, format/gövde reddi, scope reddi, redaksiyon), `scada-export.controller.spec.ts` (6; guard zinciri, **gerçek PermissionGuard**: yalnız-VIEW kullanıcısı reddedilir + `REPORT_EXPORT_DENIED`), `adapter/platform-scada-export-audit.spec.ts` (4), `template-registry.spec.ts` (+1). Güncellenen: wiring (izin/sıralama/`call.body` sayacı), endpoint inventory (+1 satır).
- Web: `report-analysis-client.spec.tsx` (+12 yeni, 2 güncellendi; PNG sırası/completion hatası/çizim hatası dahil), `scada-export-client.spec.ts` (4).
- Sonuçlar: api `reporting` 1683/1683, api tümü 3289/3289 (112 suite), web 330/330 (27 dosya), `tsc` (api, web) temiz, `./scripts/check.sh --skip-docker` yeşil (Q-ENV01 workaround'u ile).
- **Java tarafı:** `TemplateRegistryTest`'e şablon testi eklendi; ancak `mvn -o` surefire eklentisi çevrimdışı yok — bu test **Maven ile koşulamadı**. Bunun yerine yerel `~/.m2` jar'larıyla tek seferlik bir JVM harness'ında (ağ/Docker yok) şablon **derlendi ve `RenderRow` ile doldurulup PDF'e dışa aktarıldı** (1 sayfa, hata yok). Gerçek Jasper servisi/fontlar (Alpine JRE) ve Türkçe glif çıktısı doğrulanmadı.

## Mutasyon kontrolleri (uygulanıp geri alındı; hepsi yeşil tabanda)
19 mutant, hepsi yakalandı: export izni VIEW'e düşürüldü; membership guard'ı kaldırıldı; export yolunda scope çözümü atlandı (tenant izolasyonu); null→0 (CSV ve XLSX); injection escape kaldırıldı; kalite bayrağı sütunu boşaltıldı; kalite özeti modelden atıldı; expression export'a eklendi; web export guard'ı kaldırıldı; audit hatası başarı döndürdü; boş sonuç export edildi; ham renderer hatası sızdı; development etiketi düşürüldü; birim yedeği kaldırıldı; audit portu yokken export serbest bırakıldı; boş veri istemciden istendi; web düğmeleri izne bağlı değil; istemci gövdeye `rows` ekledi. (İlk turda 5b/13 sırasıyla zayıf kanıt / derleme hatası verdi: test güçlendirildi, mutant type-safe yeniden yapıldı; ardından tüm set yeşil tabanda tekrar koşuldu.)

### PNG audit düzeltmesi — ek mutantlar (10, hepsi yakalandı)
Step 1'in tekrar başarı yazması; completion'da actor / tenant / artifact / yeniden çözülen root kontrolünün kaldırılması (root mutantı ilk turda kaçtı → aynı actor+tenant'ın farklı root altında reddedilmesi testi eklendi, yeniden yakalandı); tekrar (replay) izni; süre dolumunun yok sayılması; completion audit hatasının yutulması; web'in completion'dan önce indirmesi; web'in çizim hatasında SUCCEEDED bildirmesi.

## Kapsam dışı / yapılmadı
Gerçek production DB, SQL Server, Docker, migration, production Jasper smoke test yok. Git commit/push yok. Yeni permission, yeni audit action, yeni renderer yok.

## AI1/PO kararı gerektiren açık nokta
**Q-W542 kapandı** (AI1, 2026-09-24): `scada-analysis-report` şablonu + `RenderRow` genişletmesi kabul; `sample-report` korunur; finansal şekle sıkıştırma yok; Türkçe font doğrulaması ayrı dev-renderer smoke testi. PNG audit'i AI1 düzeltmesiyle iki adımlı completion'a alındı (yukarıda). Bkz. `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`.

## AI1 Onayı (2026-09-24)
`done`. Q-W542 kapandı; PNG akışı doğru sırada (yetki → caption → PNG baytı → completion doğrulaması → başarı audit'i → indirme). **Açık operasyonel not (production hardening, ayrı iş):** PNG completion context'i bellek içindedir; API restart'ında veya çoklu instance'ta kullanıcı yeniden dener; production export için Redis/kalıcı kısa ömürlü store kararı ileride gerekebilir. Türkçe font doğrulaması ayrı dev-renderer smoke testi olarak kalır.
